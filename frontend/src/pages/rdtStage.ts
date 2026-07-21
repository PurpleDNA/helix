// The Instrument's live stage: reconstructs animatable "flights" from the
// engine's raw event stream, then plays them back against the DOM.
//
// The engine reports intent (PACKET_SENT, PACKET_DROPPED, DELIVERED_TO_APP…);
// the stage needs geometry (which chip is where, when does it die). Two rules
// bridge the gap:
//   * channels are FIFO, so the k-th surviving send is the k-th arrival —
//     receiver events consume flights from a queue in order;
//   * same-tick bursts are fanned with a small serialization stagger (EPS)
//     so pipelined sends read as a train instead of one overlapping chip.

export type ProtocolId = 'stop_and_wait' | 'gbn' | 'selective_repeat'

export interface RawEvent {
  t: number
  type: string
  actor: 'sender' | 'receiver' | 'channel'
  data: Record<string, any>
}

export interface RunParams {
  protocol: ProtocolId
  nMessages: number
  loss: number // 0..1
  corrupt: number // 0..1
  window: number
  rto: number
}

type Fate = 'ok' | 'dropped' | 'corrupt'
interface Flight {
  kind: 'data' | 'ack'
  seq: number
  /** what the packet header shows: seq, except stop-and-wait's alternating bit */
  label: number
  t0: number
  fate: Fate
}

type Show =
  | { t: number; kind: 'log'; cls: string; who: string; msg: string }
  | { t: number; kind: 'deliver'; seq: number }
  | { t: number; kind: 'buffer'; seq: number }
  | { t: number; kind: 'rflash'; seq: number; bad: boolean }
  | { t: number; kind: 'sflash'; seq: number }
  | { t: number; kind: 'ackmark'; seq: number }
  | { t: number; kind: 'win'; base: number; next: number }
  | { t: number; kind: 'rwin'; base: number }
  | { t: number; kind: 'timer'; seq: number; t1: number; fired: boolean }

export interface Run {
  params: RunParams
  flights: Flight[]
  shows: Show[]
  tEnd: number
}

const EPS = 0.16 // serialization stagger within a same-tick burst, in ticks

// Where along the channel a lost chip dies: deterministic, spread over the
// middle so simultaneous losses don't stack their ✕ marks.
const deathFrac = (seq: number, t0: number) =>
  0.35 + (((seq * 37 + Math.round(t0 * 8)) % 23) / 23) * 0.3

export function buildRun(events: RawEvent[], params: RunParams): Run {
  // Selective Repeat breaks every assumption the shared reconstruction makes
  // (acks emitted before deliveries, retransmitted seqs, buffer-then-drain,
  // below-base re-ACKs), so it gets its own causal, per-seq pass.
  if (params.protocol === 'selective_repeat') return buildRunSR(events, params)

  const { protocol } = params
  // Selective Repeat (the only per-seq-timer protocol) returned above, so the
  // shared path is single-timer: GBN and stop-and-wait.
  const perSeqTimers = false
  // Stop-and-wait is the alternating-bit protocol: the header carries one bit.
  const bit = (s: number) => (protocol === 'stop_and_wait' ? s % 2 : s)

  const flights: Flight[] = []
  const shows: Show[] = []
  const dataQ: Flight[] = []
  const ackQ: Flight[] = []
  let burstKey = ''
  let burstIdx = 0
  let lastArrivalTr = 0
  // Timer bookkeeping: GBN and S&W keep one logical timer (a new start
  // replaces the open one); SR runs one per outstanding seq.
  let openSingle: { t0: number; seq: number } | null = null
  const openPerSeq = new Map<number, number>()
  let sawWindowUpdates = false
  // The engine collapses each ACK→slide→resend cascade onto one timestamp, but
  // the stage re-spreads chips over their reconstructed arrival times. A
  // WINDOW_UPDATE always trails its cause (the ACK that advanced base, or the
  // send that bumped next), so anchor it to that cause's reconstructed time
  // instead of the raw engine tick — otherwise the band teleports to its end
  // state while the acks that justify it are still visibly in flight.
  let lastCauseTr = 0

  const staggered = (t: number) => {
    const key = 's@' + t
    if (key !== burstKey) {
      burstKey = key
      burstIdx = 0
    }
    return t + burstIdx++ * EPS
  }

  const closeTimer = (seq: number, t1: number, fired: boolean) => {
    if (perSeqTimers) {
      const t0 = openPerSeq.get(seq)
      if (t0 !== undefined) {
        openPerSeq.delete(seq)
        shows.push({ t: t0, kind: 'timer', seq, t1, fired })
      }
    } else if (openSingle) {
      shows.push({ t: openSingle.t0, kind: 'timer', seq: openSingle.seq, t1, fired })
      openSingle = null
    }
  }

  for (let i = 0; i < events.length; i++) {
    const e = events[i]
    const d = e.data
    const next = events[i + 1]
    const chNext = next && next.actor === 'channel' ? next.data : null

    if (e.type === 'PACKET_SENT') {
      const t0 = staggered(e.t)
      lastCauseTr = t0
      const fate: Fate =
        chNext && chNext.kind === 'data' && chNext.seq === d.seq
          ? chNext.reason === 'loss'
            ? 'dropped'
            : 'corrupt'
          : 'ok'
      const f: Flight = { kind: 'data', seq: d.seq, label: bit(d.seq), t0, fate }
      flights.push(f)
      if (fate !== 'dropped') dataQ.push(f)
      shows.push({ t: t0, kind: 'log', cls: 'snd', who: 'SND', msg: `DATA ▾ seq=${bit(d.seq)}` })
      if (fate === 'dropped')
        shows.push({
          t: t0 + deathFrac(d.seq, t0),
          kind: 'log',
          cls: 'bad',
          who: 'CHN',
          msg: `LOST data seq=${bit(d.seq)}`,
        })
      if (fate === 'corrupt')
        shows.push({ t: t0 + 0.45, kind: 'log', cls: 'bad', who: 'CHN', msg: `CORRUPT data seq=${bit(d.seq)}` })
      // Stop-and-wait emits no WINDOW_UPDATE; synthesize a one-cell window.
      if (protocol === 'stop_and_wait')
        shows.push({ t: t0, kind: 'win', base: d.seq, next: d.seq + 1 })
    } else if (e.type === 'ACK_SENT') {
      const t0 = lastArrivalTr || e.t
      const fate: Fate =
        chNext && chNext.kind === 'ack' && chNext.seq === d.seq
          ? chNext.reason === 'loss'
            ? 'dropped'
            : 'corrupt'
          : 'ok'
      const f: Flight = { kind: 'ack', seq: d.seq, label: bit(d.seq), t0, fate }
      flights.push(f)
      if (fate !== 'dropped') ackQ.push(f)
      shows.push({ t: t0, kind: 'log', cls: 'ack', who: 'RCV', msg: `ACK ▴ seq=${bit(d.seq)}` })
      if (fate === 'dropped')
        shows.push({
          t: t0 + deathFrac(d.seq, t0),
          kind: 'log',
          cls: 'bad',
          who: 'CHN',
          msg: `LOST ack seq=${bit(d.seq)}`,
        })
    } else if (
      e.actor === 'receiver' &&
      (e.type === 'DELIVERED_TO_APP' || e.type === 'PACKET_DISCARDED' || e.type === 'PACKET_BUFFERING')
    ) {
      const f = dataQ.shift()
      const tr = f ? f.t0 + 1 : e.t
      lastArrivalTr = tr
      if (e.type === 'DELIVERED_TO_APP') {
        shows.push({ t: tr, kind: 'deliver', seq: d.seq })
        shows.push({ t: tr, kind: 'log', cls: 'good', who: 'RCV', msg: `DELIVER ▸ app seq=${d.seq}` })
      } else if (e.type === 'PACKET_BUFFERING') {
        shows.push({ t: tr, kind: 'buffer', seq: d.seq })
        shows.push({ t: tr, kind: 'log', cls: 'info', who: 'RCV', msg: `buffer seq=${d.seq} (gap ahead)` })
      } else {
        const bad = d.reason === 'CORRUPTED PACKET'
        shows.push({ t: tr, kind: 'rflash', seq: d.seq, bad })
        shows.push({
          t: tr,
          kind: 'log',
          cls: bad ? 'bad' : 'info',
          who: 'RCV',
          msg: `discard seq=${bit(d.seq)} (${bad ? 'checksum' : d.reason.toLowerCase()})`,
        })
      }
    } else if (e.actor === 'sender' && (e.type === 'ACK_RECEIVED' || e.type === 'PACKET_DISCARDED')) {
      const f = ackQ.shift()
      const tr = f ? f.t0 + 1 : e.t
      lastCauseTr = tr
      if (e.type === 'ACK_RECEIVED') {
        shows.push({ t: tr, kind: 'ackmark', seq: d.seq })
        shows.push({ t: tr, kind: 'log', cls: 'ack', who: 'SND', msg: `ack in seq=${bit(d.seq)}` })
      } else {
        shows.push({ t: tr, kind: 'sflash', seq: d.seq })
        shows.push({ t: tr, kind: 'log', cls: 'info', who: 'SND', msg: `ignore ack seq=${bit(d.seq)}` })
      }
    } else if (e.type === 'TIMER_START') {
      if (perSeqTimers) {
        if (openPerSeq.has(seqOf(d))) closeTimer(seqOf(d), e.t, false)
        openPerSeq.set(seqOf(d), e.t)
      } else {
        if (openSingle) closeTimer(openSingle.seq, e.t, false)
        openSingle = { t0: e.t, seq: seqOf(d) }
      }
    } else if (e.type === 'TIMER_TIMEOUT') {
      closeTimer(seqOf(d), e.t, true)
      shows.push({
        t: e.t,
        kind: 'log',
        cls: 'warn',
        who: 'SND',
        msg: perSeqTimers
          ? `TIMEOUT — resend seq=${d.seq}`
          : protocol === 'gbn'
            ? 'TIMEOUT — resend window'
            : `TIMEOUT — resend seq=${bit(d.seq)}`,
      })
    } else if (e.type === 'TIMER_STOP') {
      closeTimer(seqOf(d), e.t, false)
    } else if (e.type === 'WINDOW_UPDATE' && e.actor === 'sender') {
      sawWindowUpdates = true
      shows.push({ t: lastCauseTr, kind: 'win', base: d.base, next: d.nextseqnum })
    }
  }

  const tEnd = flights.length ? Math.max(...flights.map((f) => f.t0)) + 3 : 3
  if (perSeqTimers) for (const [seq, t0] of openPerSeq) shows.push({ t: t0, kind: 'timer', seq, t1: tEnd, fired: false })
  else if (openSingle) shows.push({ t: openSingle.t0, kind: 'timer', seq: openSingle.seq, t1: tEnd, fired: false })
  if (!sawWindowUpdates && protocol !== 'stop_and_wait')
    shows.push({ t: 0, kind: 'win', base: 0, next: 0 })

  shows.sort((a, b) => a.t - b.t)
  return { params, flights, shows, tEnd }

  function seqOf(d: Record<string, any>): number {
    return typeof d.seq === 'number' ? d.seq : -1
  }
}

// Selective Repeat reconstruction. The engine runs all protocol logic at zero
// cost, so an ack, its window slide, and the resend it triggers all share one
// tick; only the channel adds the 1-tick hop. We rebuild real animation times
// by threading each effect back to the packet that caused it, per seq:
//   * a data chip launches at its (staggered) send time and lands 1 tick later;
//   * the ACK it triggers launches at that landing and lands 1 tick after that;
//   * the sender's reaction (ackmark, window slide, next send) rides that ack's
//     landing. FIFO-per-seq queues carry those landing times forward, so a
//     retransmitted seq, a buffered-then-drained packet, or a lost ack never
//     smears onto an unrelated flight the way the global heuristics did.
function buildRunSR(events: RawEvent[], params: RunParams): Run {
  const flights: Flight[] = []
  const shows: Show[] = []
  // FIFO landing times per seq: when the k-th surviving flight of a seq lands.
  const dataLand = new Map<number, number[]>()
  const ackLand = new Map<number, number[]>()
  const push = (m: Map<number, number[]>, seq: number, t: number) => {
    const q = m.get(seq)
    if (q) q.push(t)
    else m.set(seq, [t])
  }
  const pop = (m: Map<number, number[]>, seq: number): number | undefined => m.get(seq)?.shift()

  let burstKey = ''
  let burstIdx = 0
  const staggered = (t: number) => {
    const key = 's@' + t
    if (key !== burstKey) {
      burstKey = key
      burstIdx = 0
    }
    return t + burstIdx++ * EPS
  }

  const openPerSeq = new Map<number, number>()
  const closeTimer = (seq: number, t1: number, fired: boolean) => {
    const t0 = openPerSeq.get(seq)
    if (t0 !== undefined) {
      openPerSeq.delete(seq)
      shows.push({ t: t0, kind: 'timer', seq, t1, fired })
    }
  }

  let lastCauseTr = 0 // reconstructed time of the last sender-side cause
  // Ack-landing times and send-stagger times are two sub-tick clocks that both
  // map onto one engine tick; interleaved, they can fall out of engine order
  // and make the window base appear to slide backward. A monotonic cursor keeps
  // every sender-side reconstructed time non-decreasing in engine order.
  let senderCursor = 0
  let lastRecvTr = 0 // reconstructed time of the last receiver-side arrival
  let curArrT = 0 // arrival time of the packet the current recv_data is handling
  let curArrSeq = -1
  let pendBufSeq = -1 // a BUFFERING whose paired ACK_SENT hasn't been seen yet
  let pendBufT = 0

  const fateOf = (kind: 'data' | 'ack', seq: number, chNext: Record<string, any> | null): Fate =>
    chNext && chNext.kind === kind && chNext.seq === seq
      ? chNext.reason === 'loss'
        ? 'dropped'
        : 'corrupt'
      : 'ok'

  // Receiver window opens at [0, window) before any delivery lands.
  shows.push({ t: 0, kind: 'rwin', base: 0 })

  for (let i = 0; i < events.length; i++) {
    const e = events[i]
    const d = e.data
    const next = events[i + 1]
    const chNext = next && next.actor === 'channel' ? next.data : null
    const seq: number = typeof d.seq === 'number' ? d.seq : -1

    if (e.type === 'PACKET_SENT') {
      const t0 = Math.max(staggered(e.t), senderCursor)
      senderCursor = t0
      lastCauseTr = t0
      const fate = fateOf('data', seq, chNext)
      const f: Flight = { kind: 'data', seq, label: seq, t0, fate }
      flights.push(f)
      if (fate !== 'dropped') push(dataLand, seq, t0 + 1)
      shows.push({ t: t0, kind: 'log', cls: 'snd', who: 'SND', msg: `DATA ▾ seq=${seq}` })
      if (fate === 'dropped')
        shows.push({ t: t0 + deathFrac(seq, t0), kind: 'log', cls: 'bad', who: 'CHN', msg: `LOST data seq=${seq}` })
      if (fate === 'corrupt')
        shows.push({ t: t0 + 0.45, kind: 'log', cls: 'bad', who: 'CHN', msg: `CORRUPT data seq=${seq}` })
    } else if (e.type === 'PACKET_BUFFERING') {
      const t = pop(dataLand, seq) ?? e.t
      lastRecvTr = t
      pendBufSeq = seq
      pendBufT = t
      shows.push({ t, kind: 'buffer', seq })
      shows.push({ t, kind: 'log', cls: 'info', who: 'RCV', msg: `buffer seq=${seq} (gap ahead)` })
    } else if (e.type === 'ACK_SENT') {
      // The ack rides the data packet that just landed. A BUFFERING for this
      // seq immediately prior already popped that landing — reuse it.
      const t = pendBufSeq === seq ? pendBufT : (pop(dataLand, seq) ?? e.t)
      pendBufSeq = -1
      curArrT = t
      curArrSeq = seq
      lastRecvTr = t
      const fate = fateOf('ack', seq, chNext)
      const f: Flight = { kind: 'ack', seq, label: seq, t0: t, fate }
      flights.push(f)
      if (fate !== 'dropped') push(ackLand, seq, t + 1)
      shows.push({ t, kind: 'log', cls: 'ack', who: 'RCV', msg: `ACK ▴ seq=${seq}` })
      if (fate === 'dropped')
        shows.push({ t: t + deathFrac(seq, t), kind: 'log', cls: 'bad', who: 'CHN', msg: `LOST ack seq=${seq}` })
    } else if (e.type === 'DELIVERED_TO_APP') {
      // Base delivery and any buffered packets it drains all pop at the moment
      // the base packet arrived.
      const t = curArrSeq >= 0 ? curArrT : e.t
      shows.push({ t, kind: 'deliver', seq })
      shows.push({ t, kind: 'log', cls: 'good', who: 'RCV', msg: `DELIVER ▸ app seq=${seq}` })
    } else if (e.type === 'PACKET_DISCARDED' && e.actor === 'receiver') {
      const t = pop(dataLand, seq) ?? e.t
      lastRecvTr = t
      const bad = d.reason === 'CORRUPTED PACKET'
      shows.push({ t, kind: 'rflash', seq, bad })
      shows.push({
        t,
        kind: 'log',
        cls: bad ? 'bad' : 'info',
        who: 'RCV',
        msg: `discard seq=${seq} (${bad ? 'checksum' : String(d.reason).toLowerCase()})`,
      })
    } else if (e.type === 'ACK_RECEIVED' && e.actor === 'sender') {
      const t = Math.max(pop(ackLand, seq) ?? e.t, senderCursor)
      senderCursor = t
      lastCauseTr = t
      shows.push({ t, kind: 'ackmark', seq })
      shows.push({ t, kind: 'log', cls: 'ack', who: 'SND', msg: `ack in seq=${seq}` })
    } else if (e.type === 'PACKET_DISCARDED' && e.actor === 'sender') {
      const t = Math.max(pop(ackLand, seq) ?? e.t, senderCursor)
      senderCursor = t
      lastCauseTr = t
      shows.push({ t, kind: 'sflash', seq })
      shows.push({ t, kind: 'log', cls: 'info', who: 'SND', msg: `ignore ack seq=${seq}` })
    } else if (e.type === 'TIMER_START') {
      if (openPerSeq.has(seq)) closeTimer(seq, lastCauseTr, false)
      openPerSeq.set(seq, lastCauseTr)
    } else if (e.type === 'TIMER_TIMEOUT') {
      closeTimer(seq, e.t, true)
      shows.push({ t: e.t, kind: 'log', cls: 'warn', who: 'SND', msg: `TIMEOUT — resend seq=${seq}` })
    } else if (e.type === 'TIMER_STOP') {
      closeTimer(seq, lastCauseTr, false)
    } else if (e.type === 'WINDOW_UPDATE' && e.actor === 'sender') {
      shows.push({ t: lastCauseTr, kind: 'win', base: d.base, next: d.nextseqnum })
    } else if (e.type === 'WINDOW_UPDATE' && e.actor === 'receiver') {
      shows.push({ t: lastRecvTr, kind: 'rwin', base: d.base })
    }
  }

  const tEnd = flights.length ? Math.max(...flights.map((f) => f.t0)) + 3 : 3
  for (const [seq, t0] of openPerSeq) shows.push({ t: t0, kind: 'timer', seq, t1: tEnd, fired: false })

  shows.sort((a, b) => a.t - b.t)
  return { params, flights, shows, tEnd }
}

/* ------------------------------------------------------------------ */

export interface StageDom {
  scroller: HTMLElement
  stage: HTMLElement
  sendCells: HTMLElement
  recvCells: HTMLElement
  lanes: HTMLElement
  winband: HTMLElement
  wintag: HTMLElement
  rtoBar: HTMLElement
  clock: HTMLElement
  prog: HTMLElement
  log: HTMLElement
  note: HTMLElement
}

const CELL = 27 // cell pitch: 24px cell + 3px gap
const PAD = 8 // stage side padding
const CH_H = 320
const CHIP_H = 18
export const TICK_MS = 3600 // one sim tick at 1× speed
const WAIT_CAP_MS = 5000 // longest wall-clock dead air (empty channel) before fast-forward

const colX = (s: number) => PAD + s * CELL
const NOTE_DEFAULT = 'run loops at the end'
const NOTE_WAITING = 'quiet channel — waiting on timeout, fast-forwarding…'

interface LiveChip {
  el: HTMLElement
  f: Flight
  dead?: boolean
  hurt?: boolean
}

export class StagePlayer {
  private dom: StageDom
  private run: Run
  private n: number
  private cols: number
  private twoCol: boolean
  private cumulative: boolean
  private perSeqTimers: boolean
  private boostTarget: number | null = null
  private boostFactor = 1

  private T = 0
  playing: boolean
  speed = 1
  private raf = 0
  private last = 0

  private showPtr = 0
  private spawnPtr = 0
  private win = { base: 0, next: 0 }
  private acked = new Set<number>()
  private delivered = new Set<number>()
  private buffered = new Set<number>()
  private activeTimers: { seq: number; t0: number; t1: number; fired: boolean }[] = []
  private live = new Map<number, LiveChip>()
  private logRows: string[] = []
  private cellFlash: { until: number; cell: HTMLElement; cls: string }[] = []
  private sendCellEls: HTMLElement[] = []
  private recvCellEls: HTMLElement[] = []
  private cellBars: HTMLElement[] = []
  private userPanUntil = 0
  private onUserPan = () => {
    this.userPanUntil = performance.now() + 4000
  }
  onStateChange?: (playing: boolean) => void

  constructor(dom: StageDom, run: Run, startPaused: boolean) {
    this.dom = dom
    this.run = run
    this.n = run.params.nMessages
    // Stop-and-wait is the alternating-bit protocol: the whole stage is two
    // columns, one per bit — messages march through them in turn.
    this.twoCol = run.params.protocol === 'stop_and_wait'
    this.cols = this.twoCol ? 2 : this.n
    this.cumulative = run.params.protocol !== 'selective_repeat'
    this.perSeqTimers = run.params.protocol === 'selective_repeat'
    this.playing = !startPaused

    dom.stage.style.width = `${this.cols * CELL - 3 + PAD * 2}px`
    dom.winband.classList.toggle('mono', this.twoCol)
    dom.sendCells.innerHTML = ''
    dom.recvCells.innerHTML = ''
    dom.lanes.innerHTML = ''
    for (let s = 0; s < this.cols; s++) {
      const a = document.createElement('span')
      a.className = 'cell'
      a.textContent = String(s)
      if (this.perSeqTimers) {
        const bar = document.createElement('i')
        bar.className = 'cell-rto'
        a.appendChild(bar)
        this.cellBars.push(bar)
      }
      const b = document.createElement('span')
      b.className = 'cell'
      b.textContent = String(s)
      dom.sendCells.appendChild(a)
      dom.recvCells.appendChild(b)
      this.sendCellEls.push(a)
      this.recvCellEls.push(b)
    }
    for (const ev of ['pointerdown', 'wheel', 'touchstart'] as const)
      dom.scroller.addEventListener(ev, this.onUserPan, { passive: true })

    this.last = performance.now()
    this.raf = requestAnimationFrame(this.loop)
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    for (const ev of ['pointerdown', 'wheel', 'touchstart'] as const)
      this.dom.scroller.removeEventListener(ev, this.onUserPan)
  }

  setPlaying(p: boolean) {
    this.playing = p
    this.onStateChange?.(p)
  }
  setSpeed(x: number) {
    this.speed = x
  }
  restart() {
    this.reset()
  }

  /** Wipe the stage back to a blank instrument (used by Stop). */
  clear() {
    this.reset()
    this.dom.sendCells.innerHTML = ''
    this.dom.recvCells.innerHTML = ''
    this.dom.clock.textContent = '0.0'
    this.dom.prog.textContent = '—'
    this.dom.wintag.textContent = 'window'
    this.dom.rtoBar.style.width = '0'
    this.dom.note.textContent = NOTE_DEFAULT
  }

  private reset() {
    this.T = 0
    this.showPtr = 0
    this.spawnPtr = 0
    this.boostTarget = null
    this.win = { base: 0, next: 0 }
    this.acked.clear()
    this.delivered.clear()
    this.buffered.clear()
    this.activeTimers = []
    for (const [, r] of this.live) r.el.remove()
    this.live.clear()
    this.logRows = []
    this.dom.log.innerHTML = ''
    for (const fl of this.cellFlash) {
      delete fl.cell.dataset.hold
      fl.cell.classList.remove(fl.cls)
    }
    this.cellFlash = []
  }

  private pushLog(html: string) {
    this.logRows.push(html)
    if (this.logRows.length > 9) this.logRows.shift()
    this.dom.log.innerHTML = this.logRows.join('')
  }

  private flash(cell: HTMLElement, cls: string, ms: number) {
    cell.dataset.hold = '1'
    cell.classList.add(cls)
    this.cellFlash.push({ until: performance.now() + ms, cell, cls })
  }

  private loop = (now: number) => {
    this.frame(Math.min(now - this.last, 100))
    this.last = now
    this.raf = requestAnimationFrame(this.loop)
  }

  private frame(dtMs: number) {
    const { run, dom } = this
    if (this.playing) {
      // Dead air (empty channel, next event far away) is protocol-honest but
      // dull: cap any wait at WAIT_CAP_MS of wall time and say what's happening.
      let boost = 1
      if (this.live.size === 0 && this.spawnPtr < run.flights.length) {
        const tNext = Math.min(
          run.flights[this.spawnPtr].t0,
          this.showPtr < run.shows.length ? run.shows[this.showPtr].t : Infinity,
        )
        if (this.boostTarget !== null && this.T < this.boostTarget) {
          boost = this.boostFactor
        } else {
          const gapWallMs = ((tNext - this.T) * TICK_MS) / this.speed
          if (gapWallMs > WAIT_CAP_MS) {
            this.boostTarget = tNext
            this.boostFactor = gapWallMs / WAIT_CAP_MS
            boost = this.boostFactor
          } else this.boostTarget = null
        }
      } else this.boostTarget = null
      dom.note.textContent = boost > 1 ? NOTE_WAITING : NOTE_DEFAULT
      this.T += (dtMs / TICK_MS) * this.speed * boost
    }
    if (this.T > run.tEnd) {
      this.reset()
      return
    }
    const T = this.T

    /* consume display events */
    const shows = run.shows
    while (this.showPtr < shows.length && shows[this.showPtr].t <= T) {
      const s = shows[this.showPtr++]
      if (s.kind === 'log')
        this.pushLog(
          `<div class="log-row ${s.cls}"><span class="lt">${s.t.toFixed(1)}</span><span class="who">${s.who}</span><span class="msg">${s.msg}</span></div>`,
        )
      else if (s.kind === 'deliver') {
        this.delivered.add(s.seq)
        this.buffered.delete(s.seq)
      } else if (s.kind === 'buffer') this.buffered.add(s.seq)
      else if (s.kind === 'rflash')
        this.flash(this.recvCellEls[s.seq % this.cols], s.bad ? 'flash-bad' : 'flash-dup', 600)
      else if (s.kind === 'sflash') this.flash(this.sendCellEls[s.seq % this.cols], 'flash-dup', 600)
      else if (s.kind === 'ackmark') {
        if (this.cumulative) for (let q = 0; q <= s.seq; q++) this.acked.add(q)
        else this.acked.add(s.seq)
      } else if (s.kind === 'win') this.win = { base: s.base, next: s.next }
      else if (s.kind === 'timer') this.activeTimers.push({ seq: s.seq, t0: s.t, t1: s.t1, fired: s.fired })
    }
    this.activeTimers = this.activeTimers.filter((tm) => T <= tm.t1 + 0.6)

    /* spawn chips */
    const flights = run.flights
    while (this.spawnPtr < flights.length && flights[this.spawnPtr].t0 <= T) {
      const f = flights[this.spawnPtr]
      const el = document.createElement('div')
      el.className = f.kind === 'data' ? 'chip data' : 'chip ackc'
      el.textContent = String(f.label)
      el.style.left = colX(f.label) + 'px'
      dom.lanes.appendChild(el)
      this.live.set(this.spawnPtr, { el, f })
      this.spawnPtr++
    }

    /* move / retire chips */
    const travel = CH_H - CHIP_H
    for (const [idx, r] of this.live) {
      const { el, f } = r
      const p = T - f.t0
      const y = f.kind === 'data' ? p * travel : (1 - p) * travel
      if (f.fate === 'dropped') {
        const df = deathFrac(f.seq, f.t0)
        if (p >= df + 0.35) {
          el.remove()
          this.live.delete(idx)
          continue
        }
        if (p >= df) {
          if (!r.dead) {
            r.dead = true
            el.className = 'chip dead'
            el.textContent = '✕'
          }
          el.style.opacity = String(Math.max(0, 1 - (p - df) / 0.35))
          continue
        }
        el.style.transform = `translateY(${y}px)`
      } else {
        if (p >= 1) {
          el.remove()
          this.live.delete(idx)
          continue
        }
        if (f.fate === 'corrupt' && p > 0.45 && !r.hurt) {
          r.hurt = true
          el.className = f.kind === 'data' ? 'chip hurt' : 'chip ackc hurt-ack'
        }
        el.style.transform = r.hurt
          ? `translateY(${y}px) translateX(${(Math.random() * 2.4 - 1.2).toFixed(1)}px)`
          : `translateY(${y}px)`
      }
    }

    /* strips */
    const { base } = this.win
    const winSize = this.run.params.window
    let expect = 0
    while (this.delivered.has(expect)) expect++
    if (this.twoCol) {
      // Alternating bit: one cell per bit. The outstanding message's bit is
      // hot; the other cell remembers the last completed bit.
      const bitOut = base % 2
      const started = this.win.next > 0
      const senderDone = this.acked.has(base)
      for (let s = 0; s < 2; s++) {
        const sc = this.sendCellEls[s]
        if (!sc.dataset.hold)
          sc.className =
            'cell ' +
            (started && s === bitOut ? (senderDone ? 'acked' : 'out') : started && base > 0 ? 'acked' : '')
        const rc = this.recvCellEls[s]
        if (!rc.dataset.hold)
          rc.className =
            'cell ' + (s === expect % 2 && expect < this.n ? 'expect' : this.delivered.size > 0 ? 'got' : '')
      }
    } else {
      for (let s = 0; s < this.n; s++) {
        const c = this.sendCellEls[s]
        if (c.dataset.hold) continue
        c.className =
          'cell ' +
          (s < base || this.acked.has(s)
            ? 'acked'
            : s < this.win.next
              ? 'out'
              : s < base + winSize
                ? 'avail'
                : '')
      }
      for (let s = 0; s < this.n; s++) {
        const c = this.recvCellEls[s]
        if (c.dataset.hold) continue
        c.className =
          'cell ' + (this.delivered.has(s) ? 'got' : this.buffered.has(s) ? 'buf' : s === expect ? 'expect' : '')
      }
    }
    const now = performance.now()
    for (let i = this.cellFlash.length - 1; i >= 0; i--) {
      const fl = this.cellFlash[i]
      if (now > fl.until) {
        delete fl.cell.dataset.hold
        fl.cell.classList.remove(fl.cls)
        this.cellFlash.splice(i, 1)
      }
    }

    /* window band + timers */
    const rto = this.run.params.rto
    const wLeft = colX(this.twoCol ? base % 2 : base) - 3
    const wWidth = (this.twoCol ? 1 : Math.min(winSize, this.n - base)) * CELL + 3
    dom.winband.style.left = wLeft + 'px'
    dom.winband.style.width = wWidth + 'px'
    let firing = false
    if (this.perSeqTimers) {
      for (const bar of this.cellBars) bar.style.width = '0'
      for (const tm of this.activeTimers) {
        if (T < tm.t0 || tm.seq < 0 || tm.seq >= this.n) continue
        if (T <= tm.t1) this.cellBars[tm.seq].style.width = `${Math.max(0, 1 - (T - tm.t0) / rto) * 100}%`
        if (tm.fired && T > tm.t1 - 0.15) firing = true
      }
      dom.rtoBar.style.width = '0'
    } else {
      const tm = this.activeTimers[this.activeTimers.length - 1]
      if (tm && T >= tm.t0 && T <= tm.t1 + 0.6) {
        dom.rtoBar.style.width = `${Math.max(0, 1 - (T - tm.t0) / rto) * wWidth}px`
        firing = tm.fired && T > tm.t1 - 0.15
      } else dom.rtoBar.style.width = '0'
    }
    dom.winband.classList.toggle('timeout', firing)
    dom.wintag.textContent = firing
      ? 'timeout!'
      : this.twoCol
        ? `msg ${Math.min(base, this.n - 1)} · bit ${base % 2}`
        : `window ${base}–${Math.min(base + winSize, this.n) - 1}`

    /* auto-pan unless the user recently took over */
    if (now > this.userPanUntil) {
      const sc = dom.scroller
      const target = wLeft + wWidth / 2 - sc.clientWidth / 2
      const want = Math.max(0, Math.min(target, sc.scrollWidth - sc.clientWidth))
      if (Math.abs(want - sc.scrollLeft) > 2) sc.scrollLeft += (want - sc.scrollLeft) * 0.06
    }

    /* readouts */
    dom.clock.textContent = T.toFixed(1)
    dom.prog.textContent = String(this.delivered.size).padStart(2, '0') + '/' + this.n
  }
}
