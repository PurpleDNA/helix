import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import './protocols.css'

const HEADING = 'PROTOCOLS'

// hop coordinates shared by the route polyline, the hop dots and the
// SMIL packet that rides the path on hover
const ROUTE = 'M14,96 L58,44 L104,74 L152,26 L206,58'
const HOPS = [
  [14, 96],
  [58, 44],
  [104, 74],
  [152, 26],
  [206, 58],
] as const

export default function ProtocolsSection() {
  const ref = useRef<HTMLElement>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          io.disconnect()
        }
      },
      { threshold: 0.2 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <section
      id="protocols"
      ref={ref}
      className={inView ? 'protocols in' : 'protocols'}
    >
      <div className="protocols-head">
        <h2 aria-label="Protocols">
          {HEADING.split('').map((ch, i) => (
            <span
              key={i}
              aria-hidden="true"
              style={{ '--i': i } as CSSProperties}
            >
              {ch}
            </span>
          ))}
        </h2>
        <p className="protocols-sub">
          The machinery behind every request. Run it, break it, watch it
          recover.
        </p>
      </div>

      <div className="pgrid">
        {/* ---- RDT: live ---- */}
        <Link to="/rdt" className="pcard is-live">
          <span className="pcard-packet" aria-hidden="true" />
          <div className="pcard-visual rdt-visual">
            <svg className="rdt-anim" viewBox="0 0 220 132" aria-hidden="true">
              <line className="node-line" x1="36" y1="18" x2="36" y2="124" />
              <line className="node-line" x1="184" y1="18" x2="184" y2="124" />
              <text className="node-label" x="36" y="11">
                SND
              </text>
              <text className="node-label" x="184" y="11">
                RCV
              </text>
              <rect className="pkt pkt-a" x="32.5" y="24" width="7" height="7" />
              <rect
                className="ack ack-a"
                x="180.5"
                y="46"
                width="7"
                height="7"
              />
              <rect
                className="pkt pkt-lost"
                x="32.5"
                y="56"
                width="7"
                height="7"
              />
              <g className="loss-x">
                <line x1="100" y1="59" x2="110" y2="69" />
                <line x1="110" y1="59" x2="100" y2="69" />
              </g>
              <rect className="pkt pkt-b" x="32.5" y="84" width="7" height="7" />
              <rect
                className="ack ack-b"
                x="180.5"
                y="106"
                width="7"
                height="7"
              />
            </svg>
          </div>
          <div className="pcard-body">
            <h3>RELIABLE DATA TRANSFER</h3>
            <p>
              Packets on a lossy wire: ACKs, timeouts and retransmissions,
              animated as they happen.
            </p>
          </div>
          <div className="pcard-status">
            <span className="status live">
              <i aria-hidden="true" />
              LIVE
            </span>
            <span className="pcard-go">
              RUN SIMULATION <b aria-hidden="true">&rsaquo;</b>
            </span>
          </div>
        </Link>

        {/* ---- Traceroute: in development ---- */}
        <article className="pcard is-dev">
          <span className="pcard-packet" aria-hidden="true" />
          <div className="pcard-visual route-visual">
            <img src="/assets/bg_connection_3.png" alt="" loading="lazy" />
            <svg
              className="route-anim"
              viewBox="0 0 220 132"
              aria-hidden="true"
            >
              <path className="route-path" d={ROUTE} pathLength={1} />
              {HOPS.map(([x, y], i) => (
                <circle
                  key={i}
                  className="hop"
                  cx={x}
                  cy={y}
                  r="3"
                  style={{ '--h': i } as CSSProperties}
                />
              ))}
              <rect className="route-packet" x="-3" y="-3" width="6" height="6">
                <animateMotion
                  dur="2.2s"
                  repeatCount="indefinite"
                  path={ROUTE}
                />
              </rect>
            </svg>
          </div>
          <div className="pcard-body">
            <h3>TRACEROUTE</h3>
            <p>
              Follow a packet hop by hop across the real internet, drawn on a
              globe.
            </p>
          </div>
          <div className="pcard-status">
            <span className="status">IN DEVELOPMENT</span>
          </div>
        </article>

        {/* ---- DNS: coming soon ---- */}
        <article className="pcard is-soon">
          <span className="pcard-packet" aria-hidden="true" />
          <div className="pcard-visual dns-visual">
            <p className="dns-line">
              <span className="dns-prompt">$</span> dig helix.dev
              <span className="dns-cursor" aria-hidden="true" />
            </p>
            <p className="dns-reply">;; status: NXDOMAIN (coming soon)</p>
          </div>
          <div className="pcard-body">
            <h3>DNS</h3>
            <p>
              How a name becomes an address: the lookup that starts every
              connection.
            </p>
          </div>
          <div className="pcard-status">
            <span className="status">COMING SOON</span>
          </div>
        </article>
      </div>
    </section>
  )
}
