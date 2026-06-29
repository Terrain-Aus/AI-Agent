import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import AppShell from './components/AppShell'
import { useStore } from './store/useStore'
import Login from './screens/Login'
import Dashboard from './screens/Dashboard'
import NewQuote from './screens/NewQuote'
import QuoteWorkspace from './screens/QuoteWorkspace'
import PricingDatabase from './screens/PricingDatabase'
import Settings from './screens/Settings'
import Quotes from './screens/Quotes'

function RequireAuth({ children }: { children: ReactNode }) {
  const user = useStore((s) => s.user)
  const location = useLocation()
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  return <AppShell>{children}</AppShell>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/quotes" element={<RequireAuth><Quotes /></RequireAuth>} />
      <Route path="/new" element={<RequireAuth><NewQuote /></RequireAuth>} />

      {/* Unified quote workspace — old per-screen routes map to a tab/drawer */}
      <Route path="/quote/:id" element={<RequireAuth><QuoteWorkspace /></RequireAuth>} />
      <Route path="/quote/:id/chat" element={<RequireAuth><QuoteWorkspace openChat /></RequireAuth>} />
      <Route path="/quote/:id/preview" element={<RequireAuth><QuoteWorkspace initialTab="summary" /></RequireAuth>} />
      <Route path="/quote/:id/breakdown" element={<RequireAuth><QuoteWorkspace initialTab="breakdown" /></RequireAuth>} />
      <Route path="/quote/:id/hidden-costs" element={<RequireAuth><QuoteWorkspace initialTab="risks" /></RequireAuth>} />
      <Route path="/quote/:id/details" element={<RequireAuth><QuoteWorkspace initialTab="details" /></RequireAuth>} />

      <Route path="/pricing" element={<RequireAuth><PricingDatabase /></RequireAuth>} />
      <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
