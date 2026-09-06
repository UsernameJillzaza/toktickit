import { Routes, Route, Link } from 'react-router-dom'
import { RequesterProvider, useRequester } from './requester/RequesterContext'
import RequesterSelect from './requester/RequesterSelect'
import RequireRequester from './requester/RequireRequester'
import HomePage from './HomePage'
import CreateTicket from './tickets/CreateTicket'

// Lab 2 §8: application shell — shows the current Requester and a Change
// Requester action once one is selected (FR-02).
function AppShell() {
  const { requester, changeRequester } = useRequester()

  return (
    <>
      <nav className="navbar navbar-expand bg-white border-bottom px-3">
        <span className="navbar-brand fw-bold text-success mb-0">TokTickIT</span>
        {requester && (
          <>
            <Link to="/create-ticket" className="ms-3 text-decoration-none">
              Create Ticket
            </Link>
            <div className="ms-auto d-flex align-items-center gap-2">
              <span className="text-secondary">{requester.name}</span>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={changeRequester}
              >
                Change Requester
              </button>
            </div>
          </>
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
