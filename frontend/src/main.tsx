import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  createBrowserRouter,
  Outlet,
  RouterProvider,
  ScrollRestoration,
} from 'react-router-dom'
import App from './App'
import Home from './pages/Home'
import RdtProtocols from './pages/RdtProtocols'
import './index.css'

// Pathless root: scroll to top on navigation (and restore on back/forward).
function Root() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  )
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      // The landing page owns its full viewport (own header, hero); the App
      // layout with the shared chrome still wraps the tool pages.
      { path: '/', element: <Home /> },
      {
        path: '/',
        element: <App />,
        children: [{ path: 'rdt', element: <RdtProtocols /> }],
      },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
