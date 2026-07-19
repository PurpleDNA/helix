import { useCallback, useEffect, useState } from 'react'
import IntroTerminal from './IntroTerminal'
import HeroHands from './HeroHands'
import RotatingTagline from './RotatingTagline'
import NetworkBackground from './NetworkBackground'
import ProtocolsSection from './ProtocolsSection'
import { SiteHeader, SiteFooter } from './SiteChrome'
import './home.css'

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
      <SiteHeader />

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

      <SiteFooter />
    </div>
  )
}
