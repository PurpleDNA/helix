import { Link } from 'react-router-dom'

const visualizations = [
  {
    title: 'Reliable Data Transfer',
    description:
      'Stop-and-Wait, Go-Back-N, and Selective Repeat — watch packets, ACKs, timers, and windows in motion.',
    to: '/rdt',
    ready: true,
  },
  {
    title: 'Traceroute',
    description: 'Hop-by-hop paths across the planet, rendered on a globe.',
    to: null,
    ready: false,
  },
  {
    title: 'DNS',
    description: 'A name becomes an address: recursion, referral, and caching.',
    to: null,
    ready: false,
  },
]

export default function Home() {
  return (
    <>
      <section className="hero">
        <h1>Helix</h1>
        <p>Network protocols, visualized.</p>
      </section>
      <section className="viz-grid">
        {visualizations.map((viz) => (
          <article key={viz.title} className="viz-card">
            <h2>{viz.title}</h2>
            <p>{viz.description}</p>
            {viz.ready && viz.to ? (
              <Link to={viz.to}>Open</Link>
            ) : (
              <span className="soon">Coming soon</span>
            )}
          </article>
        ))}
      </section>
    </>
  )
}
