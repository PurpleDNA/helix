import { useEffect, useRef, useState } from 'react'
import './intro.css'

type ScriptLine = {
  text: string
  /** ms to wait before this line appears */
  delay: number
  /** typed char-by-char instead of printed at once */
  typed?: boolean
  cls?: 'cmd' | 'bright'
}

function timestamp() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const SCRIPT: ScriptLine[] = [
  { text: '# helix --scan protocols', delay: 250, typed: true, cls: 'cmd' },
  { text: '', delay: 170 },
  {
    text: `Starting helix ( github.com/PurpleDNA/helix ) at ${timestamp()}`,
    delay: 100,
  },
  { text: 'resolving helix.local ............. 127.0.0.1', delay: 280 },
  { text: 'reply from 127.0.0.1: time=0.031 ms', delay: 200 },
  { text: '', delay: 140 },
  { text: 'Interesting protocols on helix.local (127.0.0.1):', delay: 220 },
  {
    text: '(The 65535 ports scanned but not shown below are in state: boring)',
    delay: 100,
  },
  { text: 'PROTOCOL          STATE  SERVICE', delay: 200, cls: 'bright' },
  { text: 'stop-and-wait     up     reliable data transfer', delay: 60 },
  { text: 'go-back-n         up     reliable data transfer', delay: 55 },
  { text: 'selective-repeat  up     reliable data transfer', delay: 55 },
  { text: 'traceroute        soon   path discovery', delay: 55 },
  { text: 'dns               soon   name resolution', delay: 55 },
  { text: '', delay: 150 },
  { text: 'Device type: web browser', delay: 180 },
  { text: 'Running: JavaScript (single-threaded, as always)', delay: 90 },
  { text: 'Uptime: 0.000 days (you just got here)', delay: 90 },
  { text: '', delay: 150 },
  { text: 'calibrating packet timers .......... ok', delay: 230 },
  { text: 'seeding artificial packet loss ..... ok', delay: 200 },
  { text: 'warming up pixel hands (est. 1997) . ok', delay: 200 },
  { text: '', delay: 120 },
  {
    text: 'handshake: SYN > SYN/ACK < ACK        established',
    delay: 260,
  },
  { text: '', delay: 100 },
  {
    text: 'helix finished: 5 protocols scanned (3 up) in 0.042 seconds',
    delay: 220,
    cls: 'bright',
  },
]

const TYPE_SPEED = 18
const HOLD_AFTER = 550
const FADE_MS = 550

export default function IntroTerminal({
  onLeaving,
  onDone,
}: {
  /** fired when the fade-out starts: the hero is becoming visible */
  onLeaving: () => void
  /** fired when the fade-out ends and the overlay can unmount */
  onDone: () => void
}) {
  const [lineCount, setLineCount] = useState(0)
  const [partial, setPartial] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const finished = useRef(false)

  useEffect(() => {
    let line = 0

    const finish = () => {
      if (finished.current) return
      finished.current = true
      setLeaving(true)
      onLeaving()
      timer.current = window.setTimeout(onDone, FADE_MS)
    }

    const step = () => {
      if (line >= SCRIPT.length) {
        timer.current = window.setTimeout(finish, HOLD_AFTER)
        return
      }
      const s = SCRIPT[line]
      timer.current = window.setTimeout(() => {
        if (s.typed) {
          let c = 0
          const typeChar = () => {
            c++
            setPartial(s.text.slice(0, c))
            if (c < s.text.length) {
              timer.current = window.setTimeout(typeChar, TYPE_SPEED)
            } else {
              setPartial(null)
              line++
              setLineCount(line)
              step()
            }
          }
          typeChar()
        } else {
          line++
          setLineCount(line)
          step()
        }
      }, s.delay)
    }

    const skip = () => {
      window.clearTimeout(timer.current)
      setPartial(null)
      setLineCount(SCRIPT.length)
      finish()
    }

    window.addEventListener('keydown', skip)
    window.addEventListener('pointerdown', skip)
    step()

    return () => {
      window.clearTimeout(timer.current)
      window.removeEventListener('keydown', skip)
      window.removeEventListener('pointerdown', skip)
    }
  }, [onLeaving, onDone])

  return (
    <div className={leaving ? 'intro-terminal leaving' : 'intro-terminal'}>
      <div className="intro-screen">
        {SCRIPT.slice(0, lineCount).map((s, i) => (
          <div key={i} className={s.cls}>
            {s.text || ' '}
          </div>
        ))}
        {partial !== null && <div className="cmd">{partial}</div>}
        <span className="intro-cursor" aria-hidden="true" />
      </div>
      <p className="intro-skip">press any key to skip</p>
    </div>
  )
}
