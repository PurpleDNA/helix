import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import IntroTerminal from './IntroTerminal'
import HeroHands from './HeroHands'
import RotatingTagline from './RotatingTagline'
import NetworkBackground from './NetworkBackground'
import ProtocolsSection from './ProtocolsSection'
import './home.css'

const REPO_URL = 'https://github.com/PurpleDNA/helix'

const reducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

// module scope: survives client-side route changes but resets on a full
// page load, so the intro terminal only plays on fresh visits
let introPlayed = false

export default function Home() {
  const [introMounted, setIntroMounted] = useState(
    () => !reducedMotion() && !introPlayed,
  )
  // flips as the terminal starts fading: cue for the hands' pixel dissolve
  const [revealed, setRevealed] = useState(() => !introMounted)

  useEffect(() => {
    introPlayed = true
  }, [])

  const handleLeaving = useCallback(() => setRevealed(true), [])
  const handleDone = useCallback(() => setIntroMounted(false), [])

  const [stars, setStars] = useState<number | null>(null)
  useEffect(() => {
    fetch('https://api.github.com/repos/PurpleDNA/helix')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (typeof d?.stargazers_count === 'number') setStars(d.stargazers_count)
      })
      .catch(() => {}) // no count shown; the pill still links out
  }, [])

  const scrollToNext = () => {
    document.getElementById('protocols')?.scrollIntoView({
      behavior: reducedMotion() ? 'auto' : 'smooth',
    })
  }

  return (
    <div className={revealed ? 'landing revealed' : 'landing'}>
      {introMounted && (
        <IntroTerminal onLeaving={handleLeaving} onDone={handleDone} />
      )}
      <header className="landing-header">
        <Link to="/" className="landing-brand">
          <img src="/assets/helixx_logo.png" alt="" />
          <span>helix</span>
        </Link>
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
                {new Intl.NumberFormat('en', { notation: 'compact' }).format(
                  stars,
                )}
              </span>
            )}
          </a>
        </div>
      </header>

      <section className="hero-stage">
        <NetworkBackground />
        <HeroHands play={revealed} />
        <div className="hero-copy">
          <h1>NETWORK PROTOCOL SIMULATOR</h1>
          <RotatingTagline active={revealed} />
          <p className="hero-quote">
            &ldquo;Tell me and I forget. Show me and I remember. Involve me and
            I understand.&rdquo;
          </p>
          <button className="hero-cta" onClick={scrollToNext}>
            GET STARTED
          </button>
        </div>
      </section>

      <ProtocolsSection />

      <footer className="landing-footer">
        <div className="landing-brand">
          <img src="/assets/helixx_logo.png" alt="" />
          <span>helix</span>
        </div>
        <p>&copy; {new Date().getFullYear()} PurpleDNA</p>
      </footer>
    </div>
  )
}
