import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import './chrome.css'

const REPO_URL = 'https://github.com/PurpleDNA/helix'

function Brand() {
  return (
    <Link to="/" className="landing-brand">
      <img src="/assets/helixx_logo.png" alt="" />
      <span>helix</span>
    </Link>
  )
}

export function SiteHeader() {
  const [stars, setStars] = useState<number | null>(null)
  useEffect(() => {
    fetch('https://api.github.com/repos/PurpleDNA/helix')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (typeof d?.stargazers_count === 'number') setStars(d.stargazers_count)
      })
      .catch(() => {}) // no count shown; the pill still links out
  }, [])

  return (
    <header className="landing-header">
      <div className="landing-header-left">
        <Brand />
        <nav className="site-nav">
          <NavLink to="/rdt">RDT</NavLink>
        </nav>
      </div>
      <div className="landing-header-right">
        <a
          className="built-by"
          href="https://github.com/PurpleDNA"
          target="_blank"
          rel="noreferrer"
        >
          <img src="/assets/ugly_dude.jpg" alt="PurpleDNA" />
          <span>built by PurpleDNA</span>
        </a>
        <a
          className="star-pill"
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="Star helix on GitHub"
        >
          <svg aria-hidden="true">
            <use href="/icons.svg#github-icon" />
          </svg>
          <span>Star</span>
          {stars !== null && (
            <span className="star-count">
              {new Intl.NumberFormat('en', { notation: 'compact' }).format(stars)}
            </span>
          )}
        </a>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="landing-footer">
      <div className="landing-brand">
        <img src="/assets/helixx_logo.png" alt="" />
        <span>helix</span>
      </div>
      <p>&copy; {new Date().getFullYear()} PurpleDNA</p>
    </footer>
  )
}
