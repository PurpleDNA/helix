import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { RunParams } from './rdtStage'
import './course.css'

/* One source of truth for definitions: the inline term popovers and the
   glossary section both read from here. */
const GLOSSARY: { k: string; term: string; def: string }[] = [
  {
    k: 'packet',
    term: 'packet',
    def: 'A chunk of data plus a header (sequence number, checksum) sent as one unit.',
  },
  {
    k: 'ack',
    term: 'ACK',
    def: 'Acknowledgment — a message from the receiver confirming a packet arrived correctly.',
  },
  {
    k: 'nak',
    term: 'NAK',
    def: 'Negative acknowledgment — signals a packet arrived corrupted. (Many real protocols skip this and rely on timeouts instead.)',
  },
  {
    k: 'checksum',
    term: 'checksum',
    def: 'A small value computed from packet contents, used by the receiver to detect corruption.',
  },
  {
    k: 'seqnum',
    term: 'sequence number',
    def: "A label identifying a packet's position in the stream, used to catch duplicates and gaps.",
  },
  {
    k: 'timeout',
    term: 'timeout',
    def: 'A deadline the sender sets after sending; if no ACK arrives in time, it assumes loss and retransmits.',
  },
  {
    k: 'window',
    term: 'sliding window',
    def: 'The set of packets a sender is allowed to have outstanding (sent, unacknowledged) at once.',
  },
  {
    k: 'pipelining',
    term: 'pipelining',
    def: 'Sending multiple packets before earlier ones are acknowledged, instead of one-at-a-time.',
  },
  {
    k: 'cumack',
    term: 'cumulative ACK',
    def: 'An ACK for sequence number n meaning "everything up to and including n is confirmed."',
  },
  {
    k: 'fsm',
    term: 'FSM (finite state machine)',
    def: 'A model where behavior depends on both the current state and the incoming event — the language this whole course is described in.',
  },
]

/* A term with a tap-to-reveal definition, usable mid-sentence. The popover
   is nudged back inside the viewport after opening. */
function Term({ k, children }: { k: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const popRef = useRef<HTMLSpanElement>(null)
  const def = GLOSSARY.find((g) => g.k === k)?.def

  useLayoutEffect(() => {
    const pop = popRef.current
    if (!open || !pop) return
    const r = pop.getBoundingClientRect()
    const pad = 12
    let dx = 0
    if (r.left < pad) dx = pad - r.left
    else if (r.right > window.innerWidth - pad) dx = window.innerWidth - pad - r.right
    if (dx) pop.style.marginLeft = `${dx}px`
  }, [open])

  if (!def) return <>{children}</>
  return (
    <span className="term-wrap">
      <button
        type="button"
        className="term"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      >
        {children}
      </button>
      {open && (
        <span className="term-pop" role="note" ref={popRef}>
          {def}
        </span>
      )}
    </span>
  )
}

const SECTIONS = [
  { id: 'c-problem', n: '01', label: 'The problem' },
  { id: 'c-tcp', n: '02', label: "TCP's answer" },
  { id: 'c-state', n: '03', label: 'State' },
  { id: 'c-saw', n: '04', label: 'Stop-and-Wait' },
  { id: 'c-gbn', n: '05', label: 'Go-Back-N' },
  { id: 'c-sr', n: '06', label: 'Selective Repeat' },
  { id: 'c-compare', n: '07', label: 'Head-to-head' },
  { id: 'c-tcp-real', n: '08', label: 'Real TCP' },
  { id: 'c-glossary', n: '09', label: 'Glossary' },
]

/* Presets chosen so the phenomenon each section describes is near-certain
   to appear in a single run. */
const SCENARIOS: Record<'saw' | 'gbn' | 'sr', RunParams> = {
  saw: { protocol: 'stop_and_wait', nMessages: 6, loss: 0.3, corrupt: 0.1, window: 1, rto: 10 },
  gbn: { protocol: 'gbn', nMessages: 20, loss: 0.25, corrupt: 0, window: 6, rto: 12 },
  sr: { protocol: 'selective_repeat', nMessages: 20, loss: 0.25, corrupt: 0, window: 5, rto: 12 },
}

function Scenario({
  preset,
  note,
  onScenario,
}: {
  preset: RunParams
  note: string
  onScenario: (p: RunParams) => void
}) {
  return (
    <div className="scenario">
      <button type="button" className="btn" onClick={() => onScenario(preset)}>
        Run this in the instrument
      </button>
      <span className="scenario-note">{note}</span>
    </div>
  )
}

/* ---- frozen stage frames ---------------------------------------------
   Columns are 24px wide with a 3px gap (pitch 27), matching the stage.
   Window bands are absolutely positioned over a column range. */
const band = (a: number, b: number) => ({ left: 4 + a * 27 - 4, width: (b - a + 1) * 27 + 5 })

function FrameSaw() {
  return (
    <figure className="cf">
      <div className="cf-who">sender</div>
      <div className="cf-stage">
        <div className="cf-col">
          <span className="cell acked">0</span>
          <div className="cf-chan">
            <span className="cf-dir">↑</span>
            <span className="chip ackc">0</span>
          </div>
          <span className="cell got">0</span>
        </div>
        <div className="cf-col">
          <span className="cell out">
            1<span className="cell-rto" style={{ width: '55%' }} />
          </span>
          <div className="cf-chan hi">
            <span className="chip dead">✕</span>
          </div>
          <span className="cell expect">1</span>
        </div>
      </div>
      <div className="cf-who">receiver</div>
      <figcaption className="cf-cap">
        frozen mid-run: message 0 was delivered and its ack is climbing home up column 0. message 1
        (bit 1) died in the channel — the coral ✕. nothing else may move: the sender waits while the
        amber timer under bit 1 drains, and when it empties, message 1 flies again.
      </figcaption>
    </figure>
  )
}

function FrameGbn() {
  return (
    <figure className="cf">
      <div className="cf-who">sender</div>
      <div className="cf-stage">
        <span className="cf-band" style={{ top: 8, ...band(2, 5) }}>
          <span className="tag">window n=4</span>
          <span className="rto-bar" style={{ width: '40%' }} />
        </span>
        <div className="cf-col">
          <span className="cell acked">0</span>
          <div className="cf-chan" />
          <span className="cell got">0</span>
        </div>
        <div className="cf-col">
          <span className="cell acked">1</span>
          <div className="cf-chan" />
          <span className="cell got">1</span>
        </div>
        <div className="cf-col">
          <span className="cell out">2</span>
          <div className="cf-chan">
            <span className="cf-dir">↑</span>
            <span className="chip ackc">2</span>
          </div>
          <span className="cell got">2</span>
        </div>
        <div className="cf-col">
          <span className="cell out">3</span>
          <div className="cf-chan">
            <span className="chip dead">✕</span>
          </div>
          <span className="cell expect">3</span>
        </div>
        <div className="cf-col">
          <span className="cell out">4</span>
          <div className="cf-chan lo">
            <span className="chip data">4</span>
            <span className="cf-dir">↓</span>
          </div>
          <span className="cell" />
        </div>
        <div className="cf-col">
          <span className="cell out">5</span>
          <div className="cf-chan hi">
            <span className="chip data">5</span>
            <span className="cf-dir">↓</span>
          </div>
          <span className="cell" />
        </div>
        <div className="cf-col">
          <span className="cell">6</span>
          <div className="cf-chan" />
          <span className="cell" />
        </div>
        <div className="cf-col">
          <span className="cell">7</span>
          <div className="cf-chan" />
          <span className="cell" />
        </div>
      </div>
      <div className="cf-who">receiver</div>
      <figcaption className="cf-cap">
        packet 3 died in the channel; 4 and 5 are still falling. the receiver wants 3 and nothing
        else — when 4 and 5 land it will discard them, undamaged, and re-ack 2. when the sender's
        timer empties, it resends 3, 4 AND 5: the whole window.
      </figcaption>
    </figure>
  )
}

function FrameSr() {
  return (
    <figure className="cf">
      <div className="cf-who">sender</div>
      <div className="cf-stage">
        <span className="cf-band" style={{ top: 8, ...band(2, 6) }}>
          <span className="tag">window</span>
        </span>
        <span className="cf-band recv" style={{ bottom: 8, ...band(2, 6) }}>
          <span className="tag">accept</span>
        </span>
        <div className="cf-col">
          <span className="cell acked">0</span>
          <div className="cf-chan" />
          <span className="cell got">0</span>
        </div>
        <div className="cf-col">
          <span className="cell acked">1</span>
          <div className="cf-chan" />
          <span className="cell got">1</span>
        </div>
        <div className="cf-col">
          <span className="cell out">
            2<span className="cell-rto" style={{ width: '60%' }} />
          </span>
          <div className="cf-chan">
            <span className="chip dead">✕</span>
          </div>
          <span className="cell expect">2</span>
        </div>
        <div className="cf-col">
          <span className="cell acked">3</span>
          <div className="cf-chan" />
          <span className="cell buf">3</span>
        </div>
        <div className="cf-col">
          <span className="cell acked">4</span>
          <div className="cf-chan" />
          <span className="cell buf">4</span>
        </div>
        <div className="cf-col">
          <span className="cell out">5</span>
          <div className="cf-chan">
            <span className="chip data">5</span>
            <span className="cf-dir">↓</span>
          </div>
          <span className="cell" />
        </div>
        <div className="cf-col">
          <span className="cell avail">6</span>
          <div className="cf-chan" />
          <span className="cell" />
        </div>
      </div>
      <div className="cf-who">receiver</div>
      <figcaption className="cf-cap">
        packet 2 died, but 3 and 4 made it and were each acked individually — the receiver holds
        them as dashed buffered cells instead of discarding them. only packet 2 will be resent, on
        its own timer (the amber drain inside its cell). the moment 2 lands, 2, 3 and 4 flush to
        the app together.
      </figcaption>
    </figure>
  )
}

export default function RdtCourse({ onScenario }: { onScenario: (p: RunParams) => void }) {
  const [active, setActive] = useState(SECTIONS[0].id)

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id)
      },
      { rootMargin: '-15% 0px -75% 0px' },
    )
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id)
      if (el) obs.observe(el)
    }
    return () => obs.disconnect()
  }, [])

  return (
    <div className="course" id="course">
      <nav className="course-rail" aria-label="Crash course sections">
        <div className="rail-title">Crash course</div>
        <ol>
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className={active === s.id ? 'on' : ''}>
                <span className="n">{s.n}</span>
                {s.label}
              </a>
            </li>
          ))}
        </ol>
        <a className="rail-up" href="#instrument">
          ↑ the instrument
        </a>
      </nav>

      <div className="course-body">
        <header className="course-head">
          <h2>Crash Course</h2>
          <p className="lede">
            The instrument above shows packets, ACKs, timers, and the occasional dropped or
            corrupted packet moving between a sender and a receiver. This is the missing narration:
            read it once, and every chip, colour, and retransmission up there reads as a sentence
            instead of a mystery. Dotted-underlined words open their definition in place.
          </p>
        </header>

        {/* 01 — the problem */}
        <section id="c-problem">
          <h3>
            <span className="n">01</span> Why reliable data transfer is a problem at all
          </h3>
          <p className="lede">
            The internet was never built to guarantee delivery. Reliability is something the
            endpoints have to construct on top of a network that makes no promises.
          </p>
          <p>
            Every byte you send across the internet rides on top of <strong>IP</strong>, the
            Internet Protocol. IP's job is deliberately narrow: get a{' '}
            <Term k="packet">packet</Term> from a source host to a destination host, on a{' '}
            <em>best-effort</em> basis. Best-effort means IP will try, but it makes zero
            guarantees. A packet can be:
          </p>
          <div className="duo">
            <div className="role">
              <h4>What can go wrong in the channel</h4>
              <ul>
                <li>
                  <strong>Lost</strong> — a router along the path is congested, its buffer fills
                  up, and the packet is silently dropped.
                </li>
                <li>
                  <strong>Corrupted</strong> — bit flips happen in transit (electrical noise,
                  faulty hardware, wireless interference).
                </li>
                <li>
                  <strong>Reordered</strong> — packets can take different paths and arrive out of
                  the order they were sent.
                </li>
                <li>
                  <strong>Duplicated</strong> — retransmissions or routing quirks can cause the
                  same packet to arrive twice.
                </li>
              </ul>
            </div>
            <div className="role">
              <h4>Why this matters in practice</h4>
              <ul>
                <li>A web page with missing bytes doesn't render — it corrupts.</li>
                <li>A downloaded file with a flipped bit can be silently wrong.</li>
                <li>An API payload delivered out of order can be misinterpreted entirely.</li>
                <li>
                  None of this is rare at internet scale — it happens constantly, just usually
                  invisibly.
                </li>
              </ul>
            </div>
          </div>
          <p>
            This is a deliberate design choice, not an oversight — it's the internet's{' '}
            <strong>end-to-end principle</strong>: keep the network core simple and dumb (just move
            packets), and push intelligence — reliability, ordering, flow control — to the
            endpoints that actually care about it. IP stays fast and general-purpose; the endpoints
            solve reliability for the applications that need it.
          </p>
          <details className="nugget">
            <summary>Why not just make IP reliable?</summary>
            <div className="body">
              Not every application wants reliability at this cost. Live video and voice calls
              would rather drop a late packet than wait for its retransmission — by the time it
              arrives, the moment has passed. If reliability were baked into the network layer,
              every application would pay for it whether it wanted it or not. Instead, the internet
              gives you unreliable IP plus a choice at the transport layer: UDP (no reliability,
              minimal overhead) or TCP (full reliability, at some cost). RDT is the machinery that
              makes the reliable choice possible.
            </div>
          </details>
        </section>

        {/* 02 — TCP's answer */}
        <section id="c-tcp">
          <h3>
            <span className="n">02</span> TCP's answer: reliability with no help from IP
          </h3>
          <p className="lede">
            TCP treats the network underneath it as a black box that can lose, corrupt, or reorder
            anything. All the guarantees TCP offers are manufactured entirely by the two end
            systems.
          </p>
          <p>
            TCP promises an application two things IP never promised:{' '}
            <strong>every byte sent will eventually be delivered</strong>, and{' '}
            <strong>bytes will arrive at the application in the exact order they were sent</strong>
            . It delivers on both without any cooperation from routers in between — IP doesn't know
            or care that TCP exists. Everything TCP does happens purely at the sender and receiver:
          </p>
          <div className="duo">
            <div className="role sender">
              <h4>Building blocks the sender uses</h4>
              <ul>
                <li>
                  <Term k="seqnum">
                    <strong>Sequence numbers</strong>
                  </Term>{' '}
                  — every byte gets a number, so the receiver can detect gaps, duplicates, and
                  reordering.
                </li>
                <li>
                  <Term k="checksum">
                    <strong>Checksums</strong>
                  </Term>{' '}
                  — detect corruption introduced in transit.
                </li>
                <li>
                  <strong>Timers</strong> — detect loss indirectly: no ACK within a deadline means
                  "assume it's gone."
                </li>
                <li>
                  <strong>Retransmission</strong> — resend anything not confirmed as received.
                </li>
              </ul>
            </div>
            <div className="role recv">
              <h4>Building blocks the receiver uses</h4>
              <ul>
                <li>
                  <Term k="ack">
                    <strong>Acknowledgments (ACKs)</strong>
                  </Term>{' '}
                  — tell the sender exactly what's been received correctly.
                </li>
                <li>
                  <strong>Reordering buffer</strong> — hold onto packets that arrived early, until
                  the gaps before them are filled.
                </li>
                <li>
                  <strong>In-order delivery gate</strong> — only hand bytes to the application once
                  every earlier byte has arrived.
                </li>
                <li>
                  <strong>Duplicate detection</strong> — sequence numbers let it discard anything
                  it's already delivered.
                </li>
              </ul>
            </div>
          </div>
          <p>
            The rest of this crash course builds these ideas up from scratch using the same
            simplified model Kurose &amp; Ross call <strong>RDT (Reliable Data Transfer)</strong> —
            a series of protocols, each one fixing a flaw in the last, ending in something
            recognizably close to TCP's real logic.
          </p>
        </section>

        {/* 03 — state */}
        <section id="c-state">
          <h3>
            <span className="n">03</span> Why the end systems need "state"
          </h3>
          <p className="lede">
            A sender or receiver that reacts to events without remembering anything can't tell a
            fresh packet from a retransmitted one, or a late ACK from a current one. State is the
            memory that makes correct decisions possible.
          </p>
          <p>
            Every RDT protocol in this course is described as a{' '}
            <Term k="fsm">
              <strong>finite state machine (FSM)</strong>
            </Term>
            : at any moment, the sender and receiver are each sitting in a specific state, waiting
            for a specific event (a call from the application, a packet arriving, a timer firing).
            What they do next depends on <em>both</em> the event <em>and</em> the state they're
            currently in — not just the event alone.
          </p>
          <div className="callout">
            <div className="label">A concrete example of why this is necessary</div>
            Suppose the receiver's ACK for packet 0 gets lost. The sender's timer expires and it
            resends packet 0. The receiver, without any state, would treat this as a brand-new
            packet and hand a duplicate to the application. With state — remembering "I already
            delivered packet 0" — the receiver instead recognizes the duplicate, discards it, and
            just re-sends the ACK. Same input (a packet labeled 0), different correct response,
            because the state differs.
          </div>
          <p>
            You can watch this state directly in the instrument: the cells change colour as a run
            plays. On the sender strip, an outlined cell is a packet in flight and a solid moss
            cell is one that's been acked; on the receiver strip, the glowing outline marks the
            packet expected next and solid mint means delivered. Every colour change is the FSM
            changing state in response to a send, a receive, or a <Term k="timeout">timeout</Term>.
          </p>
        </section>

        {/* 04 — stop and wait */}
        <section id="c-saw">
          <h3>
            <span className="n">04</span> Stop-and-Wait (the Alternating Bit Protocol)
          </h3>
          <p className="lede">
            The simplest correct protocol: send one packet, then do nothing else until that exact
            packet is confirmed.
          </p>
          <p>
            The sender transmits a single packet and then stalls — no new data leaves until the
            receiver's acknowledgment for that specific packet comes back. Because only one packet
            is ever unacknowledged at a time, the sender only needs to distinguish "this packet"
            from "the previous packet." That's a single bit of information, which is exactly where
            the protocol's other name — the <strong>alternating bit protocol</strong> — comes
            from: sequence numbers just flip between 0 and 1. This is why the instrument shows only
            two columns for Stop-and-Wait: every message rides either bit 0 or bit 1, and the
            window band's tag tells you which real message is currently riding the bit.
          </p>
          <FrameSaw />
          <div className="duo">
            <div className="role sender">
              <h4>Sender behavior</h4>
              <ul>
                <li>Send the packet, start a timer, then wait — no new data accepted from the app.</li>
                <li>Timer expires with no ACK → assume loss, retransmit the same packet.</li>
                <li>
                  ACK arrives with the wrong sequence number, or corrupted → ignore it, keep
                  waiting (the timer will eventually fire).
                </li>
                <li>
                  Correct ACK for the current packet arrives → cancel timer, flip the sequence bit,
                  allow the app to send the next packet.
                </li>
              </ul>
            </div>
            <div className="role recv">
              <h4>Receiver behavior</h4>
              <ul>
                <li>
                  Packet arrives uncorrupted and has the <em>expected</em> sequence number →
                  deliver to the app, send ACK for that number, flip expected bit.
                </li>
                <li>
                  Packet arrives uncorrupted but has the <em>previous</em> sequence number → it's a
                  duplicate (the last ACK was probably lost). Don't re-deliver — just resend the
                  ACK for that duplicate.
                </li>
                <li>
                  Packet arrives corrupted → send a <Term k="nak">NAK</Term> (or, in the simplified
                  version, just re-ACK the last correctly received packet, so the sender's timeout
                  logic handles it).
                </li>
              </ul>
            </div>
          </div>
          <div className="callout">
            <div className="label">Limitation</div>
            Utilization is terrible. The sender is idle for almost an entire round-trip time after
            every single packet. If the link has bandwidth <em>R</em> and round-trip time{' '}
            <em>RTT</em>, throughput is roughly{' '}
            <span className="mono">packet-size / (RTT + transmission-time)</span> — completely
            independent of how fast the link actually is. Send a 1KB packet over a fast fiber link
            with a 30ms RTT, and you use a tiny fraction of the available bandwidth, because you
            spend almost all your time waiting rather than sending.
          </div>
          <details className="nugget">
            <summary>Why 1 bit of sequence number is provably enough here</summary>
            <div className="body">
              Because only one packet is ever "in flight" unacknowledged at a time, the receiver
              only ever needs to tell "the packet I'm currently expecting" apart from "the one I
              just got before it." Two possible values — 0 and 1 — fully cover that. The moment you
              allow more than one unacknowledged packet at a time (which is exactly what Go-Back-N
              and Selective Repeat do next), one bit stops being enough.
            </div>
          </details>
          <Scenario
            preset={SCENARIOS.saw}
            note="6 messages, 30% loss, 10% corruption — watch the timer drain and the same bit fly twice"
            onScenario={onScenario}
          />
        </section>

        {/* 05 — go-back-n */}
        <section id="c-gbn">
          <h3>
            <span className="n">05</span> Go-Back-N
          </h3>
          <p className="lede">
            Fix Stop-and-Wait's idle time by pipelining: let the sender have several packets in
            flight at once, bounded by a sliding window.
          </p>
          <p>
            Instead of waiting for each ACK before sending the next packet, the sender is allowed
            up to <strong>N</strong> unacknowledged packets in flight simultaneously — <em>N</em>{' '}
            is the <Term k="window">window</Term> size. As ACKs come back, the window slides
            forward, freeing up room to send new packets. This{' '}
            <Term k="pipelining">pipelining</Term> keeps the pipe full instead of idle.
          </p>
          <FrameGbn />
          <div className="duo">
            <div className="role sender">
              <h4>Sender behavior</h4>
              <ul>
                <li>
                  Tracks <span className="mono">base</span> (oldest unacked) and{' '}
                  <span className="mono">nextseqnum</span> (next to send). Can send freely while{' '}
                  <span className="mono">nextseqnum &lt; base + N</span>.
                </li>
                <li>
                  Uses{' '}
                  <Term k="cumack">
                    <strong>cumulative ACKs</strong>
                  </Term>
                  : an ACK for <em>n</em> means "everything up to and including <em>n</em> arrived
                  fine." A single ACK can advance the base past several packets at once.
                </li>
                <li>
                  Runs <strong>one timer</strong>, for the oldest unacked packet (
                  <span className="mono">base</span>) — the amber bar draining under the window
                  band.
                </li>
                <li>
                  On timeout: resend <em>every</em> packet currently in the window, from{' '}
                  <span className="mono">base</span> up to{' '}
                  <span className="mono">nextseqnum-1</span> — not just the one that was lost.
                </li>
              </ul>
            </div>
            <div className="role recv">
              <h4>Receiver behavior</h4>
              <ul>
                <li>
                  Deliberately dumb and stateless about buffering: keeps only the sequence number
                  it's currently expecting.
                </li>
                <li>
                  Packet arrives correctly <em>and</em> in order → deliver it, send a cumulative
                  ACK for it.
                </li>
                <li>
                  Packet arrives correctly but <em>out of order</em> (a later packet than expected)
                  → <strong>discard it</strong>, even though it's undamaged, and re-ACK the last
                  in-order packet it has.
                </li>
                <li>No reordering buffer needed at all — this is what keeps the receiver simple.</li>
              </ul>
            </div>
          </div>
          <div className="callout">
            <div className="label">Limitation</div>
            A single lost or corrupted packet can force retransmission of a large number of packets
            that the receiver actually received just fine — they get discarded anyway because they
            arrived out of order. On a link with any meaningful loss rate and a large window, this
            wastes a lot of bandwidth. The receiver's simplicity is bought at the sender/network's
            expense.
          </div>
          <Scenario
            preset={SCENARIOS.gbn}
            note="window 6, 25% loss, 20 messages — a whole-window resend is almost guaranteed"
            onScenario={onScenario}
          />
        </section>

        {/* 06 — selective repeat */}
        <section id="c-sr">
          <h3>
            <span className="n">06</span> Selective Repeat
          </h3>
          <p className="lede">
            Fix Go-Back-N's waste: only retransmit the packet that actually got lost, and let the
            receiver keep what arrived correctly even if it's out of order.
          </p>
          <p>
            Selective Repeat keeps the same idea of a sliding window of in-flight packets, but
            changes what happens around a loss. The receiver now <strong>buffers</strong>{' '}
            correctly-received out-of-order packets instead of throwing them away, and{' '}
            <strong>individually acknowledges</strong> every packet it receives correctly — not
            just the in-order ones. The receiver gets its own window too: the mint "accept" band on
            the instrument's lower strip.
          </p>
          <FrameSr />
          <div className="duo">
            <div className="role sender">
              <h4>Sender behavior</h4>
              <ul>
                <li>
                  Same sliding window concept, but now runs a{' '}
                  <strong>separate timer per packet</strong>, not one for the whole window — the
                  amber drain lives inside each outstanding cell.
                </li>
                <li>
                  On a timeout, resends <em>only that one packet</em> — not the whole window.
                </li>
                <li>
                  Window base only advances when the specific packet at the base is individually
                  ACKed — it can't just be inferred cumulatively.
                </li>
              </ul>
            </div>
            <div className="role recv">
              <h4>Receiver behavior</h4>
              <ul>
                <li>
                  ACKs every correctly received packet individually, whether or not it's the one
                  expected next.
                </li>
                <li>
                  Buffers out-of-order-but-correct packets instead of discarding them — the dashed
                  cells on the receiver strip.
                </li>
                <li>
                  Once the missing packet finally arrives, delivers the newly-contiguous run of
                  buffered packets to the application all at once.
                </li>
              </ul>
            </div>
          </div>
          <div className="callout">
            <div className="label">Limitation</div>
            All that bandwidth savings comes at the cost of real complexity: the receiver needs
            buffer management for out-of-order data, and the sender needs to track ACK/timeout
            state <em>per packet</em> rather than as one block. It's a genuine engineering
            trade-off, not a strict upgrade.
          </div>
          <details className="nugget">
            <summary>The window-size gotcha curious learners should know</summary>
            <div className="body">
              With <em>k</em>-bit sequence numbers, Go-Back-N can safely use a window up to{' '}
              <span className="mono">2^k − 1</span>. Selective Repeat cannot — its window must be
              at most <span className="mono">2^(k-1)</span>, exactly half. Why: because the
              receiver buffers packets and ACKs individually, if the window were too large, a
              resent old packet and a brand-new packet reusing the same wrapped-around sequence
              number could become indistinguishable to the receiver. Halving the window keeps the
              "old" and "new" ranges from ever overlapping. It's a small detail, but it's the kind
              of thing that separates "I watched the animation" from "I understand why the
              animation is correct." (It's also why the instrument caps the Selective Repeat
              window at half the sequence space.)
            </div>
          </details>
          <Scenario
            preset={SCENARIOS.sr}
            note="window 5, 25% loss, 20 messages — watch dashed cells buffer while one packet is re-flown"
            onScenario={onScenario}
          />
        </section>

        {/* 07 — comparison */}
        <section id="c-compare">
          <h3>
            <span className="n">07</span> Head-to-head
          </h3>
          <p className="lede">
            Same problem, three different trade-off points between simplicity and efficiency.
          </p>
          <div className="cmp-wrap">
            <table className="cmp">
              <thead>
                <tr>
                  <th>Protocol</th>
                  <th>Packets in flight</th>
                  <th>ACK style</th>
                  <th>On loss / timeout</th>
                  <th>Receiver buffering</th>
                  <th>Main weakness</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="hl">Stop-and-Wait</td>
                  <td>1</td>
                  <td>Per-packet</td>
                  <td>Resend that one packet</td>
                  <td>None needed</td>
                  <td>Terrible link utilization</td>
                </tr>
                <tr>
                  <td className="hl">Go-Back-N</td>
                  <td>Up to N</td>
                  <td>Cumulative</td>
                  <td>
                    Resend the <em>entire window</em>
                  </td>
                  <td>None — discards out-of-order</td>
                  <td>Wastes bandwidth on correctly-received packets</td>
                </tr>
                <tr>
                  <td className="hl">Selective Repeat</td>
                  <td>Up to N</td>
                  <td>Individual, per packet</td>
                  <td>
                    Resend <em>only</em> the lost packet
                  </td>
                  <td>Yes — holds out-of-order packets</td>
                  <td>Highest state/complexity cost</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            The progression is a straight line: Stop-and-Wait is correct but wastes time; Go-Back-N
            reclaims time by pipelining but wastes bandwidth on loss; Selective Repeat reclaims
            that bandwidth by paying for it with buffering and per-packet bookkeeping. There's no
            free lunch — each step trades one resource for another.
          </p>
        </section>

        {/* 08 — real tcp */}
        <section id="c-tcp-real">
          <h3>
            <span className="n">08</span> Where this lands: what TCP actually does
          </h3>
          <p className="lede">
            Real TCP isn't a pure implementation of any single protocol above — it's a deliberate
            hybrid.
          </p>
          <p>
            Without the <strong>SACK</strong> (Selective Acknowledgment) option, plain TCP behaves
            like a hybrid: it uses cumulative ACKs and a Go-Back-N-style <em>trigger</em> for
            retransmission (a timeout on the oldest unacked byte), but on that timeout it typically
            retransmits only from the send base forward — not blindly the entire outstanding window
            the way textbook GBN does. With <strong>SACK</strong> enabled, the receiver can
            explicitly tell the sender exactly which non-contiguous blocks of data it already has,
            and TCP becomes genuinely selective — retransmitting only the specific missing
            segments, much closer to true Selective Repeat.
          </p>
          <div className="callout info">
            <div className="label">Why this matters</div>
            TCP's actual retransmission behavior sits on a spectrum between GBN and SR depending on
            whether SACK is negotiated for the connection. The RDT protocols in this course aren't
            a museum exhibit — they're the vocabulary you need to read TCP's real behavior (and
            RFCs) accurately instead of vaguely.
          </div>
        </section>

        {/* 09 — glossary */}
        <section id="c-glossary">
          <h3>
            <span className="n">09</span> Glossary
          </h3>
          <p className="lede">Every term on this page, in one place, for whoever lands here cold.</p>
          <dl className="glossary">
            {GLOSSARY.map((g) => (
              <div className="gterm" key={g.k}>
                <dt>{g.term}</dt>
                <dd>{g.def}</dd>
              </div>
            ))}
          </dl>
        </section>

        <footer className="course-foot">
          Companion reading for the instrument above — based on the RDT 1.0–3.0, Go-Back-N, and
          Selective Repeat model (Kurose &amp; Ross, <em>Computer Networking: A Top-Down
          Approach</em>).
        </footer>
      </div>
    </div>
  )
}
