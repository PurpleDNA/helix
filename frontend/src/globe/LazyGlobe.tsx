// Client-only WebGL behind a code split: three.js and the globe scene leave the
// main bundle entirely and only load once something actually renders a globe.
// Pages should import this, not ./Globe.

import { Suspense, lazy } from 'react'
import type { GlobeProps } from './Globe'
import './globe.css'

const Globe = lazy(() => import('./Globe'))

export default function LazyGlobe(props: GlobeProps) {
  return (
    <Suspense
      fallback={
        <div
          className={props.className ? `globe ${props.className}` : 'globe'}
          aria-hidden="true"
        />
      }
    >
      <Globe {...props} />
    </Suspense>
  )
}
