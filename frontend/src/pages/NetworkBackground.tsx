import { useEffect, useRef } from 'react'

// Plexus network behind the hero: slow-drifting nodes, hairline links,
// and occasional packet pulses traveling along the links. The whole field
// eases away from the cursor, opposite its direction.

const LINK_DIST = 150
const NODE_ALPHA = 0.55
const PARALLAX = 26 // max px the field shifts away from the cursor
const PULSE_MS = 650
const PULSE_EVERY_MS = 1100

type Node = { x: number; y: number; vx: number; vy: number; r: number }
type Pulse = { a: Node; b: Node; start: number }

export default function NetworkBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let w = 0
    let h = 0
    let dpr = 1
    let nodes: Node[] = []
    let pulses: Pulse[] = []
    let raf = 0
    let pulseTimer = 0
    let running = true
    // parallax offset, eased toward its target
    let ox = 0
    let oy = 0
    let tx = 0
    let ty = 0

    const build = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.min(90, Math.round((w * h) / 22000))
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: 1.2 + Math.random() * 1.6,
      }))
      pulses = []
    }

    const draw = (now: number) => {
      ctx.clearRect(0, 0, w, h)
      ctx.save()
      ctx.translate(ox, oy)

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i]
          const b = nodes[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const d = Math.hypot(dx, dy)
          if (d < LINK_DIST) {
            ctx.strokeStyle = `rgba(157, 191, 120, ${0.16 * (1 - d / LINK_DIST)})`
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
          }
        }
      }

      ctx.fillStyle = `rgba(157, 191, 120, ${NODE_ALPHA})`
      for (const n of nodes) {
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        ctx.fill()
      }

      pulses = pulses.filter((p) => now - p.start < PULSE_MS)
      for (const p of pulses) {
        const t = (now - p.start) / PULSE_MS
        const x = p.a.x + (p.b.x - p.a.x) * t
        const y = p.a.y + (p.b.y - p.a.y) * t
        const fade = Math.sin(Math.PI * t) // in and out
        ctx.fillStyle = `rgba(197, 234, 217, ${0.9 * fade})`
        ctx.beginPath()
        ctx.arc(x, y, 2.2, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = `rgba(197, 234, 217, ${0.2 * fade})`
        ctx.beginPath()
        ctx.arc(x, y, 5, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.restore()
    }

    const tick = (now: number) => {
      if (!running) return
      for (const n of nodes) {
        n.x += n.vx
        n.y += n.vy
        if (n.x < -10) n.x = w + 10
        if (n.x > w + 10) n.x = -10
        if (n.y < -10) n.y = h + 10
        if (n.y > h + 10) n.y = -10
      }
      ox += (tx - ox) * 0.04
      oy += (ty - oy) * 0.04
      draw(now)
      raf = requestAnimationFrame(tick)
    }

    const spawnPulse = () => {
      if (pulses.length < 4) {
        // pick a pair that is actually linked right now
        for (let tries = 0; tries < 20; tries++) {
          const a = nodes[Math.floor(Math.random() * nodes.length)]
          const b = nodes[Math.floor(Math.random() * nodes.length)]
          if (a !== b && Math.hypot(a.x - b.x, a.y - b.y) < LINK_DIST) {
            pulses.push({ a, b, start: performance.now() })
            break
          }
        }
      }
      pulseTimer = window.setTimeout(
        spawnPulse,
        PULSE_EVERY_MS + Math.random() * 800,
      )
    }

    const onPointerMove = (e: PointerEvent) => {
      // field shifts away from the cursor, opposite its direction
      tx = -((e.clientX / w) * 2 - 1) * PARALLAX
      ty = -((e.clientY / h) * 2 - 1) * PARALLAX
    }

    const onResize = () => {
      build()
      if (reduce) draw(0)
    }

    // only animate while the hero is on screen
    const io = new IntersectionObserver(([entry]) => {
      if (reduce) return
      if (entry.isIntersecting && !running) {
        running = true
        raf = requestAnimationFrame(tick)
      } else if (!entry.isIntersecting) {
        running = false
        cancelAnimationFrame(raf)
      }
    })

    build()
    window.addEventListener('resize', onResize)
    if (reduce) {
      draw(0)
    } else {
      io.observe(canvas)
      window.addEventListener('pointermove', onPointerMove)
      raf = requestAnimationFrame(tick)
      pulseTimer = window.setTimeout(spawnPulse, PULSE_EVERY_MS)
    }

    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.clearTimeout(pulseTimer)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', onPointerMove)
      io.disconnect()
    }
  }, [])

  return <canvas ref={canvasRef} className="hero-net" aria-hidden="true" />
}
