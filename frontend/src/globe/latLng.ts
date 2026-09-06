// Geographic coordinates -> points on the globe.
//
// Convention: (0, 0) sits on +Z, so it faces the default camera; east (+lng)
// runs toward +X and north (+lat) toward +Y. Every consumer of the globe —
// traceroute hop markers, arcs between them — should project through here
// rather than re-deriving the mapping, so they all agree on which way is east.

import { Vector3 } from 'three'

const DEG = Math.PI / 180

/**
 * Project a lat/lng pair onto a sphere of the given radius.
 *
 * Pass `target` to write into an existing vector instead of allocating; the
 * per-frame paths (arc sampling, marker layout) rely on that to stay garbage-free.
 */
export function latLngToVector3(
  lat: number,
  lng: number,
  radius = 1,
  target = new Vector3(),
): Vector3 {
  const phi = lat * DEG
  const theta = lng * DEG
  const ring = Math.cos(phi) * radius

  return target.set(ring * Math.sin(theta), Math.sin(phi) * radius, ring * Math.cos(theta))
}

/** Inverse of {@link latLngToVector3}; degrees out, direction-only (radius ignored). */
export function vector3ToLatLng(v: Vector3): { lat: number; lng: number } {
  const r = v.length()
  if (r === 0) return { lat: 0, lng: 0 }

  return {
    lat: Math.asin(v.y / r) / DEG,
    lng: Math.atan2(v.x, v.z) / DEG,
  }
}
