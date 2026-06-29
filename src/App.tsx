import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import AppShell from './components/AppShell'
import { useStore } from './store/useStore'
import Login from './screens/Login'
import Dashboard from './screens/Dashboard'
import NewQuote from './screens/NewQuote'
import ApprenticeChat from './screens/ApprenticeChat'
import JobDetails from './screens/JobDetails'
import HiddenCosts from './screens/HiddenCosts'
import QuotePreview from './screens/QuotePreview'
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
      <Route path="/quote/:id/chat" element={<RequireAuth><ApprenticeChat /></RequireAuth>} />
      <Route path="/quote/:id/details" element={<RequireAuth><JobDetails /></RequireAuth>} />
      <Route path="/quote/:id/hidden-costs" element={<RequireAuth><HiddenCosts /></RequireAuth>} />
      <Route path="/quote/:id/preview" element={<RequireAuth><QuotePreview /></RequireAuth>} />
      <Route path="/pricing" element={<RequireAuth><PricingDatabase /></RequireAuth>} />
      <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
