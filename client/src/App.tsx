import { useState } from 'react'
import { Routes, Route, Link, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { homePathFor } from './auth/homePath'
import type { Role } from './auth/AuthContext'
import RequireAuth from './auth/RequireAuth'
import Login from './auth/Login'
import ChangePassword from './auth/ChangePassword'
import { RoleBadge } from './components/Badges'
import { NotFound } from './components/StatusPages'
import HomePage from './HomePage'
import CreateTicket from './tickets/CreateTicket'
import MyTickets from './tickets/MyTickets'
import RequesterTicketDetail from './tickets/RequesterTicketDetail'

type NavItem = { to: string; label: string }

// FR-06 / ui-spec.md §3: a destination the role can't use is not in the
// menu at all. Staff and Admin destinations (Ticket Queue, User
// Management) are added by the PRs that build those screens.
function navItemsFor(role: Role): NavItem[] {
  switch (role) {
    case 'REQUESTER':
      return [
        { to: '/my-tickets', label: 'My Tickets' },
        { to: '/create-ticket', label: 'Create Ticket' },
      ]
    case 'IT_STAFF':
    case 'ADMIN':
      return []
  }
}

function navClass({ isActive }: { isActive: boolean }) {
  return `nav-link ms-md-3${isActive ? ' tt-nav-active' : ''}`
}

function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // Zen Green §6: below 768px the menu collapses behind a hamburger. CSS
  // breakpoint utilities drive it, so no Bootstrap JS bundle is needed.
  const [navOpen, setNavOpen] = useState(false)
  const pending = Boolean(user?.mustChangePassword)
  const flash = (location.state as { flash?: string } | null)?.flash

  async function handleLogout() {
    setNavOpen(false)
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <>
      <nav className="navbar navbar-expand-md bg-white border-bottom px-3">
        <span className="navbar-brand fw-bold text-success mb-0">TokTickIT</span>

        {/* Pending password change (BR-02): only the app name and Log out. */}
        {user && pending && (
          <button type="button" className="btn btn-sm btn-outline-secondary ms-auto" onClick={handleLogout}>
            Log out
          </button>
        )}

        {user && !pending && (
          <>
            <button
              type="button"
              className="navbar-toggler d-md-none"
              aria-label="Toggle navigation"
              aria-expanded={navOpen}
              onClick={() => setNavOpen((v) => !v)}
            >
              <span className="navbar-toggler-icon" />
            </button>
            <div
              className={`w-100 flex-column flex-md-row align-items-md-center ${navOpen ? 'd-flex' : 'd-none d-md-flex'}`}
            >
              {navItemsFor(user.role).map((item) => (
                <NavLink key={item.to} to={item.to} className={navClass} onClick={() => setNavOpen(false)}>
                  {item.label}
                </NavLink>
              ))}
              <div className="ms-md-auto d-flex flex-wrap align-items-center gap-2 mt-2 mt-md-0">
                <span className="text-secondary">{user.name}</span>
                <RoleBadge role={user.role} />
                <Link to="/change-password" className="nav-link px-2" onClick={() => setNavOpen(false)}>
                  Change Password
                </Link>
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={handleLogout}>
                  Log out
                </button>
              </div>
            </div>
          </>
        )}
      </nav>

      {flash && (
        <div className="container pt-3">
          <div className="alert alert-success mb-0" role="status">
            {flash}
          </div>
        </div>
      )}

      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/change-password"
          element={
            <RequireAuth allowPasswordChange>
              <ChangePassword />
            </RequireAuth>
          }
        />
        <Route path="/" element={<RequireAuth><HomeRedirect /></RequireAuth>} />
        <Route
          path="/system-status"
          element={
            <RequireAuth>
              <HomePage />
            </RequireAuth>
          }
        />
        <Route
          path="/create-ticket"
          element={
            <RequireAuth roles={['REQUESTER']}>
              <CreateTicket />
            </RequireAuth>
          }
        />
        <Route
          path="/my-tickets"
          element={
            <RequireAuth roles={['REQUESTER']}>
              <MyTickets />
            </RequireAuth>
          }
        />
        <Route
          path="/tickets/:id"
          element={
            <RequireAuth roles={['REQUESTER']}>
              <RequesterTicketDetail />
            </RequireAuth>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  )
}

/** `/` sends each role to its own home page (FR-06). */
function HomeRedirect() {
  const { user } = useAuth()
  const location = useLocation()
  if (!user) return null
  return <Navigate to={homePathFor(user.role)} replace state={location.state} />
}

function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}

export default App
