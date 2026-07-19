import { useEffect, useRef, useState } from 'react'

// "NETWORK PROTOCOLS" is the constant; the words around it rotate.
const PHRASES = [
  { before: 'WATCH', after: 'IN ACTION' },
  { before: 'EXPLORE', after: 'PACKET BY PACKET' },
  { before: 'SEE', after: 'COME ALIVE' },
  { before: 'FINALLY UNDERSTAND', after: '' },
]

const GLYPHS = '#<>/\\|=+*%$@01'
const ROTATE_MS = 3600
const SCRAMBLE_FRAMES = 12
const FRAME_MS = 50

const reducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Terminal-style decode: when `target` changes, churn random glyphs that
 *  resolve left-to-right into the new text. */
function useScramble(target: string) {
  const [display, setDisplay] = useState(target)
  const mounted = useRef(false)

  useEffect(() => {
    if (!mounted.current) {
      // no scramble on first render: the tagline fades in already settled
      mounted.current = true
      return
    }
    if (reducedMotion()) {
      setDisplay(target)
      return
    }
    let frame = 0
    const id = window.setInterval(() => {
      frame++
      if (frame >= SCRAMBLE_FRAMES) {
        setDisplay(target)
        window.clearInterval(id)
        return
      }
      const progress = frame / SCRAMBLE_FRAMES
      setDisplay(
        target
          .split('')
          .map((ch, i) =>
            ch === ' ' || i / target.length < progress
              ? ch
              : GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
          )
          .join(''),
      )
    }, FRAME_MS)
    return () => window.clearInterval(id)
  }, [target])

  return display
}

export default function RotatingTagline({ active }: { active: boolean }) {
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (!active || reducedMotion()) return
    const id = window.setInterval(
      () => setIdx((i) => (i + 1) % PHRASES.length),
      ROTATE_MS,
    )
    return () => window.clearInterval(id)
  }, [active])

  const before = useScramble(PHRASES[idx].before)
  const after = useScramble(PHRASES[idx].after)

  return (
    <p className="hero-sub">
      <span className="sub-var">{before}</span>{' '}
      <span className="sub-const">NETWORK PROTOCOLS</span>
      {after && (
        <>
          {' '}
          <span className="sub-var">{after}</span>
        </>
      )}
    </p>
  )
}
