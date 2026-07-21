import { useEffect, useRef, useState } from 'react'
import {
  buildRun,
  StagePlayer,
  type ProtocolId,
  type RawEvent,
  type RunParams,
  type StageDom,
} from './rdtStage'
import RdtCourse from './RdtCourse'
import './rdt.css'

const PROTOCOLS: { id: ProtocolId; label: string }[] = [
  { id: 'stop_and_wait', label: 'Stop-and-Wait' },
  { id: 'gbn', label: 'Go-Back-N' },
  { id: 'selective_repeat', label: 'Selective Repeat' },
]

const SPEEDS = [1, 2, 4, 0.5]
const speedLabel = (x: number) => (x === 0.5 ? '½×' : `${x}×`)

const DEFAULTS: RunParams = {
  protocol: 'gbn',
  nMessages: 20,
  loss: 0.2,
  corrupt: 0.1,
  window: 5,
  rto: 12,
}

function fetchTimeline(params: RunParams, signal: { ws?: WebSocket }) {
  return new Promise<RawEvent[]>((resolve, reject) => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const qs = new URLSearchParams({
      protocol: params.protocol,
      n_messages: String(params.nMessages),
      loss: String(params.loss),
      corrupt: String(params.corrupt),
      window: String(params.protocol === 'stop_and_wait' ? 1 : params.window),
      rto: String(params.rto),
      // Not user-facing: a fresh seed per run so re-running the same setup
      // still shows a different unlucky channel.
      seed: String(Math.floor(Math.random() * 100000)),
    })
    const ws = new WebSocket(`${proto}://${location.host}/ws/rdt-protocols/?${qs}`)
    signal.ws = ws
    const events: RawEvent[] = []
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data)
      if (msg.type === 'event') events.push(msg.event)
      else if (msg.type === 'timeline_end') {
        ws.close()
        resolve(events)
      } else if (msg.type === 'error') {
        ws.close()
        reject(new Error(msg.message))
      }
    }
    ws.onerror = () => reject(new Error('could not reach the simulator — is the backend running?'))
  })
}

type FieldKey = 'nMessages' | 'loss' | 'corrupt' | 'window' | 'rto'

const clamp = (n: number, lo: number, hi: number, fallback: number) =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback

export default function RdtProtocols() {
  const [protocol, setProtocol] = useState<ProtocolId>(DEFAULTS.protocol)
  // Inputs are free-typed text (digits only) so clearing a field never
  // snaps to 0; values are parsed and clamped once, at Run.
  const [fields, setFields] = useState<Record<FieldKey, string>>({
    nMessages: '20',
    loss: '20',
    corrupt: '10',
    window: '5',
    rto: '12',
  })
  const [submitted, setSubmitted] = useState<RunParams>(DEFAULTS)
  const [runId, setRunId] = useState(0)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState('')
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)

  const domRef = useRef<Partial<StageDom>>({})
  const playerRef = useRef<StagePlayer | null>(null)
  const speedRef = useRef(speed)
  speedRef.current = speed

  const grab = (key: keyof StageDom) => (el: HTMLElement | null) => {
    if (el) domRef.current[key] = el
  }

  useEffect(() => {
    // The learner drives: nothing runs until they press Run (runId 0 = idle).
    if (runId === 0) {
      setStatus('idle')
      return
    }
    const signal: { ws?: WebSocket } = {}
    let cancelled = false
    setStatus('loading')
    fetchTimeline(submitted, signal)
      .then((events) => {
        if (cancelled) return
        const run = buildRun(events, submitted)
        playerRef.current?.destroy()
        const startPaused = matchMedia('(prefers-reduced-motion: reduce)').matches
        const player = new StagePlayer(domRef.current as StageDom, run, startPaused)
        player.setSpeed(speedRef.current)
        player.onStateChange = setPlaying
        playerRef.current = player
        setPlaying(!startPaused)
        setStatus('ready')
      })
      .catch((err: Error) => {
        if (cancelled) return
        setError(err.message)
        setStatus('error')
      })
    return () => {
      cancelled = true
      signal.ws?.close()
      playerRef.current?.destroy()
      playerRef.current = null
    }
  }, [submitted, runId])

  const setField = (key: FieldKey, raw: string) =>
    setFields((f) => ({ ...f, [key]: raw.replace(key === 'rto' ? /[^\d.]/g : /[^\d]/g, '') }))

  const nMessages = clamp(parseInt(fields.nMessages, 10), 5, 50, DEFAULTS.nMessages)
  const maxWindow = protocol === 'selective_repeat' ? Math.max(1, Math.floor(nMessages / 2)) : 15
  const parsed: RunParams = {
    protocol,
    nMessages,
    loss: clamp(parseInt(fields.loss, 10), 0, 70, DEFAULTS.loss * 100) / 100,
    corrupt: clamp(parseInt(fields.corrupt, 10), 0, 70, DEFAULTS.corrupt * 100) / 100,
    // Stop-and-wait is window=1 by definition.
    window:
      protocol === 'stop_and_wait' ? 1 : clamp(parseInt(fields.window, 10), 1, maxWindow, DEFAULTS.window),
    rto: clamp(parseFloat(fields.rto), 4, 40, DEFAULTS.rto),
  }

  const launch = () => {
    // Reflect what actually runs back into the inputs (clamps, blanks).
    setFields((f) => ({
      nMessages: String(parsed.nMessages),
      loss: String(Math.round(parsed.loss * 100)),
      corrupt: String(Math.round(parsed.corrupt * 100)),
      window: protocol === 'stop_and_wait' ? f.window : String(parsed.window),
      rto: String(parsed.rto),
    }))
    setSubmitted(parsed)
    setRunId((i) => i + 1)
  }

  const togglePlay = () => {
    const p = playerRef.current
    if (!p) return
    p.setPlaying(!p.playing)
  }
  const cycleSpeed = () => {
    const nextSpeed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]
    setSpeed(nextSpeed)
    playerRef.current?.setSpeed(nextSpeed)
  }

  const stop = () => {
    playerRef.current?.clear()
    setRunId(0)
  }

  // Course sections hand over a ready-made run: reflect it into the form,
  // launch it, and bring the instrument back into view.
  const runScenario = (params: RunParams) => {
    setProtocol(params.protocol)
    setFields((f) => ({
      nMessages: String(params.nMessages),
      loss: String(Math.round(params.loss * 100)),
      corrupt: String(Math.round(params.corrupt * 100)),
      window: params.protocol === 'stop_and_wait' ? f.window : String(params.window),
      rto: String(params.rto),
    }))
    setSubmitted(params)
    setRunId((i) => i + 1)
    document.getElementById('instrument')?.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    })
  }

  const pickProtocol = (id: ProtocolId) => {
    if (id === protocol) return
    setProtocol(id)
    // A run in flight belongs to the old protocol; switching type abandons it
    // (same as Stop) so a stale loop can't keep playing under the new pick.
    stop()
  }

  // Readouts/legend describe the running sim, or the form while idle.
  const active = runId === 0 ? parsed : submitted
  const isSR = active.protocol === 'selective_repeat'

  return (
    <div className="rdt">
      <header className="rdt-head">
        <h1>Reliable Data Transfer</h1>
        <p>
          Pick a protocol, break the channel, and watch the sender earn every delivery. Packets fall
          from the sender&rsquo;s window into the receiver&rsquo;s cells; ACKs climb home in their
          own column.
        </p>
      </header>

      <form
        className="rdt-form"
        onSubmit={(e) => {
          e.preventDefault()
          launch()
        }}
      >
        <div className="proto-picker" role="radiogroup" aria-label="Protocol">
          {PROTOCOLS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={protocol === p.id}
              className={protocol === p.id ? 'on' : ''}
              onClick={() => pickProtocol(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="fields">
          <label>
            <span>messages</span>
            <input
              inputMode="numeric"
              value={fields.nMessages}
              onChange={(e) => setField('nMessages', e.target.value)}
            />
          </label>
          <label>
            <span>loss %</span>
            <input
              inputMode="numeric"
              value={fields.loss}
              onChange={(e) => setField('loss', e.target.value)}
            />
          </label>
          <label>
            <span>corrupt %</span>
            <input
              inputMode="numeric"
              value={fields.corrupt}
              onChange={(e) => setField('corrupt', e.target.value)}
            />
          </label>
          <label>
            <span>window</span>
            <input
              inputMode="numeric"
              value={protocol === 'stop_and_wait' ? '1' : fields.window}
              disabled={protocol === 'stop_and_wait'}
              onChange={(e) => setField('window', e.target.value)}
            />
          </label>
          <label title="how long the sender waits before resending (the retransmission timeout), in simulated seconds">
            <span>timeout (s)</span>
            <input
              inputMode="decimal"
              value={fields.rto}
              onChange={(e) => setField('rto', e.target.value)}
            />
          </label>
          <button type="submit" className="btn primary">
            Run
          </button>
        </div>
        {protocol === 'selective_repeat' && (
          <p className="form-hint">
            selective repeat needs window ≤ half the sequence space (≤ {maxWindow} here)
          </p>
        )}
      </form>

      <div className="rdt-panel" id="instrument">
        <div className="readouts">
          <span className="readout">
            <span className="k">protocol</span>
            <span className="v">{PROTOCOLS.find((p) => p.id === active.protocol)?.label}</span>
          </span>
          <span className="readout">
            <span className="k">win</span>
            <span className="v">{active.protocol === 'stop_and_wait' ? 1 : active.window}</span>
          </span>
          <span className="readout" title="retransmission timeout, in simulated seconds">
            <span className="k">timeout</span>
            <span className="v">{active.rto}s</span>
          </span>
          <span className="readout">
            <span className="k">loss</span>
            <span className="v">{Math.round(active.loss * 100)}%</span>
          </span>
          <span className="readout">
            <span className="k">corrupt</span>
            <span className="v">{Math.round(active.corrupt * 100)}%</span>
          </span>
          <span className="spacer" />
          <span className="readout clock">
            <span className="k">t</span>
            <span className="v" ref={grab('clock')}>
              0.0
            </span>
          </span>
          <span className="readout prog">
            <span className="k">delivered</span>
            <span className="v" ref={grab('prog')}>
              {status === 'idle' ? '—' : `00/${submitted.nMessages}`}
            </span>
          </span>
          <button type="button" className="btn primary" onClick={togglePlay} disabled={status !== 'ready'}>
            {status === 'ready' && playing ? 'Pause' : 'Play'}
          </button>
          <button type="button" className="btn" onClick={cycleSpeed} disabled={status !== 'ready'}>
            {speedLabel(speed)}
          </button>
          <button
            type="button"
            className="btn"
            onClick={stop}
            disabled={status === 'idle' || status === 'error'}
          >
            Stop
          </button>
        </div>

        {status === 'error' ? (
          <div className="stage-msg">{error}</div>
        ) : status === 'idle' ? (
          <div className="stage-msg quiet">
            instrument idle — set the channel conditions above, then press run
            <a className="idle-course-link" href="#course">
              new to all this? read the crash course below
            </a>
          </div>
        ) : (
          <div className="stage-frame" data-loading={status === 'loading' || undefined}>
            <div className="stage-scroll" ref={grab('scroller')}>
              <div className="stage" ref={grab('stage')}>
                <div className="strip">
                  <span className="who">Sender</span>
                  <div className="winband" ref={grab('winband')}>
                    <span className="tag" ref={grab('wintag')}>
                      window
                    </span>
                    <span className="rto-bar" ref={grab('rtoBar')} />
                  </div>
                  <div className="cells" ref={grab('sendCells')} />
                </div>
                <div className="channel">
                  <div className="lanes" ref={grab('lanes')} />
                </div>
                <div className="strip">
                  <span className="who">Receiver</span>
                  <div className="winband recv" ref={grab('rwinband')}>
                    <span className="tag" ref={grab('rwintag')}>
                      accept
                    </span>
                  </div>
                  <div className="cells" ref={grab('recvCells')} />
                </div>
              </div>
            </div>
            <div className="footcap">
              <span>packets fall · acks rise · window slides on ack</span>
              <span ref={grab('note')}>
                {status === 'loading' ? 'contacting simulator…' : 'run loops at the end'}
              </span>
            </div>
          </div>
        )}

        <div className="below">
          <section className="card">
            <h2>Event log — live tail</h2>
            <div className="log" ref={grab('log')} />
          </section>
          <aside className="card">
            <h2>Mark vocabulary</h2>
            <div className="legend">
              <div className="legend-row">
                <span className="glyph">
                  <span className="chip data">7</span>
                </span>
                <span className="t">
                  <b>data packet</b>
                </span>
              </div>
              <div className="legend-row">
                <span className="glyph">
                  <span className="chip ackc">7</span>
                </span>
                <span className="t">
                  <b>ack</b>
                </span>
              </div>
              <div className="legend-row">
                <span className="glyph">
                  <span className="chip dead">✕</span>
                </span>
                <span className="t">
                  <b>lost</b>
                </span>
              </div>
              <div className="legend-row">
                <span className="glyph">
                  <span className="chip hurt">7</span>
                </span>
                <span className="t">
                  <b>corrupted</b>
                </span>
              </div>
              <div className="legend-row">
                <span className="glyph">
                  <span className="cell acked">3</span>
                  <span className="cell out">7</span>
                </span>
                <span className="t">
                  sender: <b>acked</b> / <b>outstanding</b>
                </span>
              </div>
              <div className="legend-row">
                <span className="glyph">
                  <span className="cell got">3</span>
                  <span className="cell expect">4</span>
                </span>
                <span className="t">
                  receiver: <b>delivered</b> / <b>expected</b>
                </span>
              </div>
              {active.protocol === 'stop_and_wait' && (
                <div className="legend-row">
                  <span className="glyph">
                    <span className="chip data">0</span>
                    <span className="chip data">1</span>
                  </span>
                  <span className="t">
                    <b>alternating bit</b>
                  </span>
                </div>
              )}
              {isSR && (
                <div className="legend-row">
                  <span className="glyph">
                    <span className="cell buf">6</span>
                  </span>
                  <span className="t">
                    receiver: <b>buffered</b>
                  </span>
                </div>
              )}
              <div className="legend-row">
                <span className="glyph">
                  <span className="rto-glyph" />
                </span>
                <span className="t">
                  <b>resend timer</b> — resends when empty
                </span>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <RdtCourse onScenario={runScenario} />
    </div>
  )
}
