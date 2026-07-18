import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import App from './App'
import Home from './pages/Home'
import RdtProtocols from './pages/RdtProtocols'
import './index.css'

const router = createBrowserRouter([
  // The landing page owns its full viewport (own header, hero); the App
  // layout with the plain header still wraps the tool pages.
  { path: '/', element: <Home /> },
  {
    path: '/',
    element: <App />,
    children: [{ path: 'rdt', element: <RdtProtocols /> }],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
