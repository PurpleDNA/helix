import { Outlet } from 'react-router-dom'
import { SiteHeader, SiteFooter } from './pages/SiteChrome'

export default function App() {
  return (
    <div className="app">
      <SiteHeader />
      <main className="app-main">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  )
}
