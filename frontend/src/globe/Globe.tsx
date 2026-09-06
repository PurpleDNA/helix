// The Helix globe: a slowly turning planet whose continents are drawn as a
// scatter of dots, tinted with the site palette. Step one of the traceroute
// visualisation — it owns the scene (geometry, materials, lighting, controls)
// and nothing above it needs to know three.js exists.
//
// Continents come from Natural Earth (public domain) baked into a 16KB bitmask
// at build time by scripts/gen-landmask.py, so the coastlines are real without
// a texture fetch, a licence, or an async load.
//
// Two rules keep it cheap enough to carry animated hop-arcs later:
//   * React never drives a frame. The rAF loop mutates the scene graph
//     directly; props are mirrored into refs so changing one does not rebuild
//     the renderer.
//   * Anything there will be many of is instanced. The ~4,000 land dots are a
//     single InstancedMesh and a single draw call; so are markers; so will
//     arcs be.

import { useEffect, useRef } from 'react'
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BackSide,
  CircleGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { createOceanGeometry, dotShade, dotSpacing, landDots } from './globeGeometry'
import { latLngToVector3 } from './latLng'
import './globe.css'

/** A point on the surface. Traceroute hops become these. */
export interface GlobeMarker {
  lat: number
  lng: number
  /** CSS colour; defaults to the palette's frost. */
  color?: string
  /** Radius as a fraction of the globe's radius. */
  size?: number
  /** How far off the surface to float it, as a fraction of radius. */
  altitude?: number
}

export interface GlobeProps {
  className?: string
  /** Surface points to plot. Instanced — one draw call regardless of count. */
  markers?: GlobeMarker[]
  /**
   * How many points to sample over the sphere. About 29% land on continents,
   * so the default ~14,000 draws roughly 4,000 dots.
   */
  dotDensity?: number
  /** Facets on the ocean sphere: 20 × (detail + 1)² faces. */
  oceanDetail?: number
  /** Idle spin, in radians per second. */
  rotationSpeed?: number
  autoRotate?: boolean
  /** Drag to orbit. Zoom is clamped and pan is always off. */
  interactive?: boolean
  /** Fresnel rim glow around the limb. */
  atmosphere?: boolean
}

const RADIUS = 1
const EMPTY: GlobeMarker[] = []

/* ---------- palette ---------- */

// Fallbacks match the tokens in index.css; the live values win so the globe
// tracks the theme instead of duplicating it.
const FALLBACK = {
  night: '#272e42',
  forest: '#264935',
  moss: '#9dbf78',
  mint: '#c5ead9',
  frost: '#d6eae9',
}

function readTokens(): typeof FALLBACK {
  const style = getComputedStyle(document.documentElement)
  const pick = (name: string, fallback: string) =>
    style.getPropertyValue(name).trim() || fallback

  return {
    night: pick('--helix-night', FALLBACK.night),
    forest: pick('--helix-forest', FALLBACK.forest),
    moss: pick('--helix-moss', FALLBACK.moss),
    mint: pick('--helix-mint', FALLBACK.mint),
    frost: pick('--helix-frost', FALLBACK.frost),
  }
}

/* ---------- atmosphere ---------- */

// Rim glow: brightest where the surface turns away from the eye. Rendered on
// the inside of a slightly larger sphere and added to what is behind it, so it
// bleeds outward past the silhouette instead of sitting on the planet.
const ATMOSPHERE_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vEye;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vEye = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`

const ATMOSPHERE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec3 vNormal;
  varying vec3 vEye;

  void main() {
    float rim = 1.0 - abs(dot(normalize(vNormal), normalize(vEye)));
    gl_FragColor = vec4(uColor, pow(rim, 3.0) * uIntensity);
  }
`

/* ---------- instanced layers ---------- */

const UP = new Vector3(0, 0, 1)

/** The continents: one flat disc per land sample, laid against the surface. */
function buildLandDots(density: number, color: string): InstancedMesh {
  const dots = landDots(density)
  const size = dotSpacing(density) * 0.42 * RADIUS

  // Six segments, not sixty: at this size a dot is a handful of pixels, and the
  // coarse edge suits the pixel-font voice the rest of the site speaks in.
  const geometry = new CircleGeometry(size, 6)
  const material = new MeshBasicMaterial({ toneMapped: false })
  const mesh = new InstancedMesh(geometry, material, dots.length)

  const matrix = new Matrix4()
  const quaternion = new Quaternion()
  const scale = new Vector3(1, 1, 1)
  const position = new Vector3()
  const base = new Color(color)
  const shade = new Color()

  for (let i = 0; i < dots.length; i++) {
    const direction = dots[i]
    // Lift clear of the sphere so the discs never z-fight with the facets.
    position.copy(direction).multiplyScalar(RADIUS * 1.004)
    quaternion.setFromUnitVectors(UP, direction)
    mesh.setMatrixAt(i, matrix.compose(position, quaternion, scale))
    mesh.setColorAt(i, dotShade(i, base, shade))
  }

  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.frustumCulled = false

  return mesh
}

/** Hop markers: same instancing story, but spheres so they read as pins. */
function buildMarkers(markers: GlobeMarker[], defaultColor: string): InstancedMesh | null {
  if (markers.length === 0) return null

  const geometry = new IcosahedronGeometry(1, 1)
  const material = new MeshBasicMaterial({ toneMapped: false })
  const mesh = new InstancedMesh(geometry, material, markers.length)

  const matrix = new Matrix4()
  const position = new Vector3()
  const color = new Color()

  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i]
    const lift = 1 + (marker.altitude ?? 0.012)
    const size = (marker.size ?? 0.018) * RADIUS

    latLngToVector3(marker.lat, marker.lng, RADIUS * lift, position)
    mesh.setMatrixAt(i, matrix.makeScale(size, size, size).setPosition(position))
    mesh.setColorAt(i, color.set(marker.color ?? defaultColor))
  }

  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.frustumCulled = false

  return mesh
}

function disposeInstanced(mesh: InstancedMesh) {
  mesh.geometry.dispose()
  ;(mesh.material as MeshBasicMaterial).dispose()
  mesh.dispose()
}

/* ---------- component ---------- */

export default function Globe({
  className,
  markers = EMPTY,
  dotDensity = 14000,
  oceanDetail = 6,
  rotationSpeed = 0.06,
  autoRotate = true,
  interactive = true,
  atmosphere = true,
}: GlobeProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  // The loop reads these every frame, so they must not be closed over by value.
  const spinRef = useRef(autoRotate)
  const speedRef = useRef(rotationSpeed)
  const layersRef = useRef<Group | null>(null)
  const markerColorRef = useRef(FALLBACK.frost)

  useEffect(() => {
    spinRef.current = autoRotate
    speedRef.current = rotationSpeed
  }, [autoRotate, rotationSpeed])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const tokens = readTokens()
    markerColorRef.current = tokens.frost
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      })
    } catch {
      return // no WebGL; the container just stays empty
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    renderer.toneMapping = ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.setSize(host.clientWidth, host.clientHeight, false)
    host.appendChild(renderer.domElement)

    const scene = new Scene()
    const camera = new PerspectiveCamera(38, 1, 0.1, 100)
    camera.position.set(0, 0.85, 3.5)

    /* lighting — dark stage, so the key stays cool. The hemisphere does the
       ambient job with a gradient instead of a flat wash: frost from above,
       night from below, so the unlit limb stays blue. The dots are unlit by
       design, which is what keeps them exactly on-palette. */
    scene.add(
      new HemisphereLight(new Color(tokens.frost), new Color(tokens.night), 0.75),
    )

    const key = new DirectionalLight(new Color(tokens.frost), 1.5)
    key.position.set(4, 2.5, 4)
    scene.add(key)

    const fill = new DirectionalLight(new Color(tokens.mint), 0.3)
    fill.position.set(-4, -1.5, -2.5)
    scene.add(fill)

    /* the planet, and everything pinned to its surface, spin together */
    const globe = new Group()
    scene.add(globe)
    layersRef.current = globe

    const oceanGeometry = createOceanGeometry(
      RADIUS,
      oceanDetail,
      new Color(tokens.night),
      new Color(tokens.night).lerp(new Color(tokens.mint), 0.2),
    )
    const oceanMaterial = new MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      // Matte on purpose. Glossy water blows a specular hotspot across a third
      // of the disc and the dots under it stop being readable, which costs far
      // more than the sheen is worth.
      roughness: 0.85,
      metalness: 0,
    })
    globe.add(new Mesh(oceanGeometry, oceanMaterial))

    const land = buildLandDots(dotDensity, tokens.moss)
    globe.add(land)

    let atmosphereGeometry: SphereGeometry | null = null
    let atmosphereMaterial: ShaderMaterial | null = null
    if (atmosphere) {
      atmosphereGeometry = new SphereGeometry(RADIUS * 1.045, 40, 28)
      atmosphereMaterial = new ShaderMaterial({
        uniforms: {
          uColor: { value: new Color(tokens.mint) },
          uIntensity: { value: 0.5 },
        },
        vertexShader: ATMOSPHERE_VERT,
        fragmentShader: ATMOSPHERE_FRAG,
        side: BackSide,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
      })
      // Outside the spinning group: the glow is the same from every angle.
      scene.add(new Mesh(atmosphereGeometry, atmosphereMaterial))
    }

    /* controls — a hero object you can turn, not a camera to fly */
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enablePan = false
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.rotateSpeed = 0.45
    controls.zoomSpeed = 0.5
    controls.minDistance = 2.6
    controls.maxDistance = 5.5
    // Stop short of the poles so the globe never flips through its own axis.
    controls.minPolarAngle = 0.35
    controls.maxPolarAngle = Math.PI - 0.35
    controls.enabled = interactive
    controls.enableZoom = interactive

    /* idle spin, paused while the user is looking at or holding the globe */
    let hovering = false
    let dragging = false
    const canvas = renderer.domElement

    const onEnter = () => {
      hovering = true
    }
    const onLeave = () => {
      hovering = false
    }
    const onDragStart = () => {
      dragging = true
    }
    const onDragEnd = () => {
      dragging = false
    }

    canvas.addEventListener('pointerenter', onEnter)
    canvas.addEventListener('pointerleave', onLeave)
    controls.addEventListener('start', onDragStart)
    controls.addEventListener('end', onDragEnd)

    /* render loop */
    let raf = 0
    let running = false
    let last = performance.now()

    const frame = () => {
      raf = requestAnimationFrame(frame)
      const now = performance.now()
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now

      if (spinRef.current && !reduceMotion && !hovering && !dragging) {
        globe.rotation.y += speedRef.current * dt
      }

      controls.update()
      renderer.render(scene, camera)
    }

    const start = () => {
      if (running) return
      running = true
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }

    const stop = () => {
      if (!running) return
      running = false
      cancelAnimationFrame(raf)
    }

    /* sizing */
    const resize = () => {
      const w = host.clientWidth
      const h = host.clientHeight
      if (w === 0 || h === 0) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h, false)
      if (!running) renderer.render(scene, camera)
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host)
    resize()

    // Only burn frames while the globe is actually on screen and the tab is
    // in front — the rest of the page keeps its budget.
    const visibility = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !document.hidden) start()
      else stop()
    })
    visibility.observe(host)

    const onVisibilityChange = () => {
      if (document.hidden) stop()
      else if (host.getBoundingClientRect().bottom > 0) start()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      stop()
      visibility.disconnect()
      resizeObserver.disconnect()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      canvas.removeEventListener('pointerenter', onEnter)
      canvas.removeEventListener('pointerleave', onLeave)
      controls.removeEventListener('start', onDragStart)
      controls.removeEventListener('end', onDragEnd)
      controls.dispose()
      // Markers are owned by the effect below, which tears down alongside this one.
      layersRef.current = null

      globe.remove(land)
      disposeInstanced(land)
      oceanGeometry.dispose()
      oceanMaterial.dispose()
      atmosphereGeometry?.dispose()
      atmosphereMaterial?.dispose()

      renderer.dispose()
      canvas.remove()
    }
  }, [dotDensity, oceanDetail, interactive, atmosphere])

  // Markers live on their own effect so hop data can change without the scene
  // being torn down. Arcs will plug in here the same way.
  //
  // It repeats the scene effect's deps deliberately: effects in one component
  // run in declaration order, so when the scene above rebuilds its group this
  // re-runs afterward and re-attaches to the new one.
  useEffect(() => {
    const layers = layersRef.current
    if (!layers) return

    const mesh = buildMarkers(markers, markerColorRef.current)
    if (!mesh) return
    layers.add(mesh)

    return () => {
      layers.remove(mesh)
      disposeInstanced(mesh)
    }
  }, [markers, dotDensity, oceanDetail, interactive, atmosphere])

  return <div ref={hostRef} className={className ? `globe ${className}` : 'globe'} />
}
