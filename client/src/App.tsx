import { useState } from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import { RequesterProvider, useRequester } from './requester/RequesterContext'
import RequesterSelect from './requester/RequesterSelect'
import RequireRequester from './requester/RequireRequester'
import HomePage from './HomePage'
import CreateTicket from './tickets/CreateTicket'
import MyTickets from './tickets/MyTickets'
import RequesterTicketDetail from './tickets/RequesterTicketDetail'

// Lab 2 §8: application shell — shows the current Requester and a Change
// Requester action once one is selected (FR-02).
function AppShell() {
  const { requester, changeRequester } = useRequester()
  // Zen Green §6: mobile collapses to a hamburger menu below 768px. Plain
  // CSS breakpoint utility classes (d-none/d-md-flex etc.) drive the
  // collapse — no Bootstrap JS bundle needed for this.
  const [navOpen, setNavOpen] = useState(false)

  return (
    <>
      <nav className="navbar navbar-expand-md bg-white border-bottom px-3">
        <span className="navbar-brand fw-bold text-success mb-0">TokTickIT</span>

        {requester && (
          <button
            type="button"
            className="navbar-toggler d-md-none"
            aria-label="Toggle navigation"
            aria-expanded={navOpen}
            onClick={() => setNavOpen((v) => !v)}
          >
            <span className="navbar-toggler-icon" />
          </button>
        )}

        {requester && (
          <div
            className={`w-100 flex-column flex-md-row align-items-md-center ${navOpen ? 'd-flex' : 'd-none d-md-flex'}`}
          >
            <Link
              to="/my-tickets"
              className="nav-link ms-md-3"
              onClick={() => setNavOpen(false)}
            >
              My Tickets
            </Link>
            <Link
              to="/create-ticket"
              className="nav-link ms-md-3"
              onClick={() => setNavOpen(false)}
            >
              Create Ticket
            </Link>
            <div className="ms-md-auto d-flex align-items-center gap-2 mt-2 mt-md-0">
              <span className="text-secondary">{requester.name}</span>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={changeRequester}
              >
                Change Requester
              </button>
            </div>
          </div>
        )}
      </nav>

      <Routes>
        <Route path="/select-requester" element={<RequesterSelect />} />
        <Route
          path="/"
          element={
            <RequireRequester>
              <HomePage />
            </RequireRequester>
          }
        />
        <Route
          path="/create-ticket"
          element={
            <RequireRequester>
              <CreateTicket />
            </RequireRequester>
          }
        />
        <Route
          path="/my-tickets"
          element={
            <RequireRequester>
              <MyTickets />
            </RequireRequester>
          }
        />
        <Route
          path="/tickets/:id"
          element={
            <RequireRequester>
              <RequesterTicketDetail />
            </RequireRequester>
          }
        />
      </Routes>
    </>
  )
}

function App() {
  return (
    <RequesterProvider>
      <AppShell />
    </RequesterProvider>
  )
}

export default App
