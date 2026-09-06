// Traceroute page, step one: the globe on its stage. Hop markers and the
// animated arcs between them land here in the next pass — the globe already
// takes a `markers` prop, so plotting them is data, not new scene code.

import LazyGlobe from '../globe/LazyGlobe'
import './traceroute.css'

export default function Traceroute() {
  return (
    <section className="trace">
      <header className="trace-head">
        <h1>TRACEROUTE</h1>
        <p>Every hop between here and there, on the sphere it actually crosses.</p>
      </header>

      <div className="trace-stage">
        <LazyGlobe />
      </div>

      <p className="soon">Hop arcs and live request animation are still coming.</p>
    </section>
  )
}
