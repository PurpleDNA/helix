import { useEffect, useRef, useState } from 'react'
import {
  buildRun,
  StagePlayer,
  type ProtocolId,
  type RawEvent,
  type RunParams,
  type StageDom,
} from './rdtStage'
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

export default function RdtProtocols() {
  const [form, setForm] = useState<RunParams>(DEFAULTS)
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

  const set = <K extends keyof RunParams>(key: K, value: RunParams[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const maxWindow = form.protocol === 'selective_repeat' ? Math.max(1, Math.floor(form.nMessages / 2)) : 15
  const windowClamped = Math.min(form.window, maxWindow)

  const launch = () => {
    // Stop-and-wait is window=1 by definition; keep params honest so the
    // stage band and register agree with the protocol.
    setSubmitted({ ...form, window: form.protocol === 'stop_and_wait' ? 1 : windowClamped })
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

  // Readouts/legend describe the running sim, or the form while idle.
  const active = runId === 0 ? { ...form, window: windowClamped } : submitted
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
              aria-checked={form.protocol === p.id}
              className={form.protocol === p.id ? 'on' : ''}
              onClick={() => set('protocol', p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="fields">
          <label>
            <span>messages</span>
            <input
              type="number"
              min={5}
              max={50}
              value={form.nMessages}
              onChange={(e) => set('nMessages', Number(e.target.value))}
            />
          </label>
          <label>
            <span>loss %</span>
            <input
              type="number"
              min={0}
              max={70}
              value={Math.round(form.loss * 100)}
              onChange={(e) => set('loss', Number(e.target.value) / 100)}
            />
          </label>
          <label>
            <span>corrupt %</span>
            <input
              type="number"
              min={0}
              max={70}
              value={Math.round(form.corrupt * 100)}
              onChange={(e) => set('corrupt', Number(e.target.value) / 100)}
            />
          </label>
          <label>
            <span>window</span>
            <input
              type="number"
              min={1}
              max={maxWindow}
              value={form.protocol === 'stop_and_wait' ? 1 : windowClamped}
              disabled={form.protocol === 'stop_and_wait'}
              onChange={(e) => set('window', Number(e.target.value))}
            />
          </label>
          <label>
            <span>rto</span>
            <input
              type="number"
              min={4}
              max={40}
              step={0.5}
              value={form.rto}
              onChange={(e) => set('rto', Number(e.target.value))}
            />
          </label>
          <button type="submit" className="btn primary">
            Run
          </button>
        </div>
        {form.protocol === 'selective_repeat' && (
          <p className="form-hint">
            selective repeat needs window ≤ half the sequence space (≤ {maxWindow} here)
          </p>
        )}
      </form>

      <div className="rdt-panel">
        <div className="readouts">
          <span className="readout">
            <span className="k">protocol</span>
            <span className="v">{PROTOCOLS.find((p) => p.id === active.protocol)?.label}</span>
          </span>
          <span className="readout">
            <span className="k">win</span>
            <span className="v">{active.protocol === 'stop_and_wait' ? 1 : active.window}</span>
          </span>
          <span className="readout">
            <span className="k">rto</span>
            <span className="v">{active.rto}</span>
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
                  <b>data packet</b> carrying its seq, falling
                </span>
              </div>
              <div className="legend-row">
                <span className="glyph">
                  <span className="chip ackc">7</span>
                </span>
                <span className="t">
                  <b>ack</b> rising home in its column
                </span>
              </div>
              <div className="legend-row">
                <span className="glyph">
                  <span className="chip dead">✕</span>
                </span>
                <span className="t">
                  <b>lost</b> — dies mid-channel, fades
                </span>
              </div>
              <div className="legend-row">
                <span className="glyph">
                  <span className="chip hurt">7</span>
                </span>
                <span className="t">
                  <b>corrupted</b> — arrives damaged, gets discarded
                </span>
              </div>
              <div className="legend-row">
                <span className="glyph">
                  <span className="cell acked">3</span>
                  <span className="cell out">7</span>
                </span>
                <span className="t">
                  sender: <b>acked</b> / <b>outstanding</b> in window
                </span>
              </div>
              <div className="legend-row">
                <span className="glyph">
                  <span className="cell got">3</span>
                  <span className="cell expect">4</span>
                </span>
                <span className="t">
                  receiver: <b>delivered</b> / <b>expected next</b>
                </span>
              </div>
              {active.protocol === 'stop_and_wait' && (
                <div className="legend-row">
                  <span className="glyph">
                    <span className="chip data">0</span>
                    <span className="chip data">1</span>
                  </span>
                  <span className="t">
                    <b>alternating bit</b> — the header carries seq mod 2; the column shows which
                    message
                  </span>
                </div>
              )}
              {isSR && (
                <div className="legend-row">
                  <span className="glyph">
                    <span className="cell buf">6</span>
                  </span>
                  <span className="t">
                    receiver: <b>buffered</b> — held until the gap fills
                  </span>
                </div>
              )}
              <div className="legend-row">
                <span className="glyph">
                  <span className="rto-glyph" />
                </span>
                <span className="t">
                  <b>rto draining</b> {isSR ? 'inside each outstanding cell' : 'under the window'} —
                  empty = timeout
                </span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
