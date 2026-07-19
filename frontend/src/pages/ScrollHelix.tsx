import { useEffect, useRef } from 'react'
import * as THREE from 'three'

// Scroll-driven 3D transition between the hero and the protocols section:
// a double helix of nodes and rungs (the logo motif as a network structure).
// A sticky full-viewport canvas lives inside a tall section; scroll progress
// through that section drives the helix's rotation and travel, easing in at
// the top and out at the bottom. No scroll listeners: progress is read from
// getBoundingClientRect inside the render loop.

const NODES = 160
const SPACING = 0.42
const RADIUS = 2.4
const TWIST = 0.35 // radians between consecutive nodes
const TURNS = 3 // extra full rotations across the scroll
const RUNG_EVERY = 4

export default function ScrollHelix() {
  const wrapRef = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const wrap = wrapRef.current!
    const canvas = canvasRef.current!
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100)
    camera.position.set(0, 0, 8)

    const length = NODES * SPACING
    const group = new THREE.Group()
    group.rotation.z = 0.18 // slight tilt so the strand crosses the frame
    scene.add(group)

    const sphere = new THREE.SphereGeometry(0.09, 10, 10)
    const strandA = new THREE.InstancedMesh(
      sphere,
      new THREE.MeshBasicMaterial({ color: 0xc5ead9 }),
      NODES,
    )
    const strandB = new THREE.InstancedMesh(
      sphere,
      new THREE.MeshBasicMaterial({ color: 0x9dbf78 }),
      NODES,
    )
    const posA: THREE.Vector3[] = []
    const posB: THREE.Vector3[] = []
    const m = new THREE.Matrix4()
    for (let i = 0; i < NODES; i++) {
      const ang = i * TWIST
      const y = i * SPACING - length / 2
      const a = new THREE.Vector3(
        Math.cos(ang) * RADIUS,
        y,
        Math.sin(ang) * RADIUS,
      )
      const b = new THREE.Vector3(
        Math.cos(ang + Math.PI) * RADIUS,
        y,
        Math.sin(ang + Math.PI) * RADIUS,
      )
      strandA.setMatrixAt(i, m.makeTranslation(a.x, a.y, a.z))
      strandB.setMatrixAt(i, m.makeTranslation(b.x, b.y, b.z))
      posA.push(a)
      posB.push(b)
    }
    group.add(strandA, strandB)

    const rungPositions: number[] = []
    for (let i = 0; i < NODES; i += RUNG_EVERY) {
      rungPositions.push(...posA[i].toArray(), ...posB[i].toArray())
    }
    const rungGeo = new THREE.BufferGeometry()
    rungGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(rungPositions, 3),
    )
    const rungs = new THREE.LineSegments(
      rungGeo,
      new THREE.LineBasicMaterial({
        color: 0x9dbf78,
        transparent: true,
        opacity: 0.35,
      }),
    )
    group.add(rungs)

    const resize = () => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    window.addEventListener('resize', resize)

    const progress = () => {
      const rect = wrap.getBoundingClientRect()
      const total = rect.height - window.innerHeight
      return total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0
    }

    const apply = (p: number, t: number) => {
      group.rotation.y = p * Math.PI * TURNS + t * 0.08
      group.position.y = (p - 0.5) * length * 0.55
      // ease in over the first 12% of the zone, out over the last 12%
      const fade = Math.min(p / 0.12, (1 - p) / 0.12, 1)
      canvas.style.opacity = String(Math.max(0, Math.min(1, fade)))
      renderer.render(scene, camera)
    }

    let raf = 0
    let running = false
    const clock = new THREE.Clock()
    const loop = () => {
      apply(progress(), clock.getElapsedTime())
      raf = requestAnimationFrame(loop)
    }

    const io = new IntersectionObserver(([entry]) => {
      if (reduce) {
        // static frame mid-rotation; sticky scroll still carries it through
        apply(0.5, 0)
        return
      }
      if (entry.isIntersecting && !running) {
        running = true
        raf = requestAnimationFrame(loop)
      } else if (!entry.isIntersecting && running) {
        running = false
        cancelAnimationFrame(raf)
      }
    })
    io.observe(wrap)

    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      window.removeEventListener('resize', resize)
      sphere.dispose()
      rungGeo.dispose()
      ;(strandA.material as THREE.Material).dispose()
      ;(strandB.material as THREE.Material).dispose()
      ;(rungs.material as THREE.Material).dispose()
      renderer.dispose()
    }
  }, [])

  return (
    <section ref={wrapRef} className="helix-transition" aria-hidden="true">
      <div className="helix-sticky">
        <canvas ref={canvasRef} />
      </div>
    </section>
  )
}
