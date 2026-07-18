import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import IntroTerminal from './IntroTerminal'
import HeroHands from './HeroHands'
import './home.css'

const REPO_URL = 'https://github.com/PurpleDNA/helix'

const reducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function Home() {
  const [introMounted, setIntroMounted] = useState(() => !reducedMotion())
  // flips as the terminal starts fading: cue for the hands' pixel dissolve
  const [revealed, setRevealed] = useState(() => reducedMotion())

  const handleLeaving = useCallback(() => setRevealed(true), [])
  const handleDone = useCallback(() => setIntroMounted(false), [])

  return (
    <div className="landing">
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
            className="repo-link"
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Helix on GitHub"
          >
            <svg aria-hidden="true">
              <use href="/icons.svg#github-icon" />
            </svg>
          </a>
        </div>
      </header>

      <section className="hero-stage">
        <HeroHands play={revealed} />
        <div className="hero-copy">
          <h1>NETWORK PROTOCOL SIMULATOR</h1>
          <p className="hero-sub">Watch network protocols in action</p>
          <p className="hero-quote">
            &ldquo;Tell me and I forget. Show me and I remember. Involve me and
            I understand.&rdquo;
          </p>
        </div>
      </section>
    </div>
  )
}
