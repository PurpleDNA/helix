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

/** 8-bit terminal noises, synthesized so no audio assets are needed.
 *  Browsers keep the context suspended until the user interacts with the
 *  page, so on a cold load these are silently skipped. */
function createAudio() {
  let ctx: AudioContext | null = null

  const ensure = () => {
    if (!ctx) {
      try {
        ctx = new AudioContext()
      } catch {
        return
      }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  }

  const blip = (freq: number, dur: number, gain: number, at = 0) => {
    if (!ctx || ctx.state !== 'running') return
    const t = ctx.currentTime + at
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = freq
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(g).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + dur)
  }

  return {
    ensure,
    /** keystroke while the command types */
    tick: () => blip(1500 + Math.random() * 600, 0.018, 0.012),
    /** a line hitting the screen */
    line: () => blip(510, 0.025, 0.018),
    bright: () => blip(690, 0.03, 0.022),
    /** scan finished: little rising chirp */
    done: () => {
      blip(660, 0.07, 0.028)
      blip(880, 0.07, 0.028, 0.09)
      blip(1174, 0.1, 0.028, 0.18)
    },
    close: () => ctx?.close().catch(() => {}),
  }
}

function timestamp() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const SCRIPT: ScriptLine[] = [
  { text: '# helix --scan protocols', delay: 120, typed: true, cls: 'cmd' },
  { text: '', delay: 135 },
  {
    text: `Starting helix ( github.com/PurpleDNA/helix ) at ${timestamp()}`,
    delay: 80,
  },
  { text: 'resolving helix.local ............. 127.0.0.1', delay: 175 },
  { text: 'reply from 127.0.0.1: time=0.031 ms', delay: 130 },
  { text: '', delay: 110 },
  { text: 'Interesting protocols on helix.local (127.0.0.1):', delay: 140 },
  {
    text: '(The 65535 ports scanned but not shown below are in state: boring)',
    delay: 80,
  },
  { text: 'PROTOCOL          STATE  SERVICE', delay: 130, cls: 'bright' },
  { text: 'stop-and-wait     up     reliable data transfer', delay: 50 },
  { text: 'go-back-n         up     reliable data transfer', delay: 45 },
  { text: 'selective-repeat  up     reliable data transfer', delay: 45 },
  { text: 'traceroute        soon   path discovery', delay: 45 },
  { text: 'dns               soon   name resolution', delay: 45 },
  { text: '', delay: 120 },
  { text: 'Device type: web browser', delay: 145 },
  { text: 'Running: JavaScript (single-threaded, as always)', delay: 70 },
  { text: 'Uptime: 0.000 days (you just got here)', delay: 70 },
  { text: '', delay: 120 },
  { text: 'calibrating packet timers .......... ok', delay: 150 },
  { text: 'seeding artificial packet loss ..... ok', delay: 130 },
  { text: 'warming up pixel hands (est. 1997) . ok', delay: 130 },
  { text: '', delay: 95 },
  {
    text: 'handshake: SYN > SYN/ACK < ACK        established',
    delay: 170,
  },
  { text: '', delay: 80 },
  {
    text: 'helix finished: 5 protocols scanned (3 up) in 0.042 seconds',
    delay: 175,
    cls: 'bright',
  },
]

const TYPE_SPEED = 11
const HOLD_AFTER = 450
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
    const audio = createAudio()
    audio.ensure()

    const finish = () => {
      if (finished.current) return
      finished.current = true
      audio.done()
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
            audio.tick()
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
          if (s.text) {
            if (s.cls === 'bright') audio.bright()
            else audio.line()
          }
          line++
          setLineCount(line)
          step()
        }
      }, s.delay)
    }

    const skip = () => {
      window.clearTimeout(timer.current)
      // the skip gesture is also what unlocks audio on a cold load,
      // so at least the finish chirp gets heard
      audio.ensure()
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
      audio.close()
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
