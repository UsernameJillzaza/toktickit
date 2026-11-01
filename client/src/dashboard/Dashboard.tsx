import { useAuth } from '../auth/AuthContext'
import RequesterDashboard from './RequesterDashboard'
import StaffDashboard from './StaffDashboard'

// One route (/dashboard) for every role (D-13): the content follows the role,
// and the API independently refuses the wrong one.
export default function Dashboard() {
  const { user } = useAuth()
  if (!user) return null
  return user.role === 'REQUESTER' ? <RequesterDashboard /> : <StaffDashboard />
}
