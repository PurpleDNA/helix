// Geometry for the globe: the ocean sphere it is built on, and the scatter of
// land dots that draws the continents on top of it.
//
// The dots are placed by Fibonacci spiral rather than on a lat/lng grid. A grid
// bunches up badly toward the poles — Greenland would be a solid smear while
// the tropics went sparse — whereas the spiral spaces points near-evenly over
// the whole sphere, so one dot size reads correctly everywhere.

import { BufferAttribute, Color, IcosahedronGeometry, Vector3 } from 'three'
import type { BufferGeometry } from 'three'
import { isLand } from './landMask'

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const RAD = 180 / Math.PI

/** Deterministic hash -> [0,1), for jitter that survives a reload. */
function hash(i: number): number {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/**
 * Even spacing between neighbouring points of a Fibonacci sphere of `samples`
 * points, in radians. Dot size is derived from this so density and size stay
 * in step — raise the count and the dots shrink to match.
 */
export function dotSpacing(samples: number): number {
  return Math.sqrt((4 * Math.PI) / samples)
}

/**
 * Sample the sphere and keep the points that land on a continent.
 *
 * Returns unit direction vectors; the caller scales them to the radius it
 * wants. Roughly 29% of `samples` survive, since that is how much of Earth is
 * land.
 */
export function landDots(samples: number): Vector3[] {
  const dots: Vector3[] = []

  for (let i = 0; i < samples; i++) {
    // y walks the poles evenly; each step turns by the golden angle, which is
    // what keeps successive points from ever lining up into visible spirals.
    const y = 1 - (i / (samples - 1)) * 2
    const ring = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = GOLDEN_ANGLE * i
    const x = Math.cos(theta) * ring
    const z = Math.sin(theta) * ring

    // Matches latLngToVector3's convention: +Z is (0,0), east is +X.
    const lat = Math.asin(y) * RAD
    const lng = Math.atan2(x, z) * RAD

    if (isLand(lat, lng)) dots.push(new Vector3(x, y, z))
  }

  return dots
}

/** Per-dot brightness jitter, so the continents have some grain up close. */
export function dotShade(index: number, base: Color, target: Color): Color {
  return target.copy(base).multiplyScalar(0.82 + hash(index) * 0.28)
}

/**
 * The ocean: a faceted sphere with a little tone variation face to face.
 *
 * An icosphere is non-indexed, so each face owns its vertices and can be
 * shaded on its own — that is what keeps the facets readable instead of
 * blurring into a smooth ball. The variation is kept subtle deliberately: it
 * should give the water some life without competing with the dots on top.
 *
 * Note three.js counts `detail` as edge subdivisions, so a sphere has
 * 20 × (detail + 1)² faces — detail 6 is 980, not the 20 × 4^detail you might
 * expect.
 */
export function createOceanGeometry(
  radius: number,
  detail: number,
  deep: Color,
  shallow: Color,
): BufferGeometry {
  const geometry = new IcosahedronGeometry(radius, detail)
  const position = geometry.attributes.position as BufferAttribute
  const colors = new Float32Array(position.count * 3)

  const a = new Vector3()
  const b = new Vector3()
  const c = new Vector3()
  const centroid = new Vector3()
  const faceColor = new Color()

  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i)
    b.fromBufferAttribute(position, i + 1)
    c.fromBufferAttribute(position, i + 2)
    centroid.copy(a).add(b).add(c).divideScalar(3).normalize()

    // Deeper toward the middle of an ocean basin is not something a sphere
    // knows, so stand in for it with latitude: poles read shallow and icy,
    // the tropics read deep.
    const polar = Math.abs(centroid.y)
    faceColor.copy(deep).lerp(shallow, polar * polar * 0.85)
    faceColor.multiplyScalar(0.94 + hash(i) * 0.12)

    for (let v = 0; v < 3; v++) {
      const o = (i + v) * 3
      colors[o] = faceColor.r
      colors[o + 1] = faceColor.g
      colors[o + 2] = faceColor.b
    }
  }

  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  geometry.computeVertexNormals()

  return geometry
}
