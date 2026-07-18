import { useEffect, useRef } from 'react'

const CELL = 14 // css px, close to the artwork's own pixel grain
const DURATION = 1400

/** The nokia hands, revealed as a pixel dissolve: random cells of a canvas
 *  are filled in until the full image is there. `play` starts the reveal. */
export default function HeroHands({ play }: { play: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const played = useRef(false)

  useEffect(() => {
    if (!play || played.current) return
    played.current = true

    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const img = new Image()
    let raf = 0

    // Draw the image cover-fitted (anchored center-top, like the old
    // object-fit) into an offscreen canvas we can copy cells from.
    const renderFull = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = canvas.clientWidth * dpr
      canvas.height = canvas.clientHeight * dpr
      const off = document.createElement('canvas')
      off.width = canvas.width
      off.height = canvas.height
      const scale = Math.max(
        canvas.width / img.width,
        canvas.height / img.height,
      )
      const dw = img.width * scale
      const dh = img.height * scale
      off.getContext('2d')!.drawImage(img, (canvas.width - dw) / 2, 0, dw, dh)
      return off
    }

    const onResize = () => {
      // one-shot effect: after (or during) the reveal, a resize just redraws
      ctx.drawImage(renderFull(), 0, 0)
    }

    img.onload = () => {
      const off = renderFull()
      if (reduce) {
        ctx.drawImage(off, 0, 0)
        return
      }

      const dpr = canvas.width / canvas.clientWidth
      const cell = Math.round(CELL * dpr)
      const cols = Math.ceil(canvas.width / cell)
      const rows = Math.ceil(canvas.height / cell)
      const order = Array.from({ length: cols * rows }, (_, i) => i)
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[order[i], order[j]] = [order[j], order[i]]
      }

      let drawn = 0
      const t0 = performance.now()
      const tick = (now: number) => {
        const t = Math.min((now - t0) / DURATION, 1)
        const eased = t * t * (3 - 2 * t)
        const target = Math.floor(eased * order.length)
        for (; drawn < target; drawn++) {
          const x = (order[drawn] % cols) * cell
          const y = Math.floor(order[drawn] / cols) * cell
          ctx.drawImage(off, x, y, cell, cell, x, y, cell, cell)
        }
        if (t < 1) {
          raf = requestAnimationFrame(tick)
        } else {
          ctx.drawImage(off, 0, 0)
          window.addEventListener('resize', onResize)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    img.src = '/assets/nokia_transparent.png'

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [play])

  return <canvas ref={canvasRef} className="hero-hands" aria-hidden="true" />
}
