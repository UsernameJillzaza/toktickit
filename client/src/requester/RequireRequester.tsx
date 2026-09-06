import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useRequester } from './RequesterContext'

// FR-01: the Requester Selection screen must be shown before any other
// screen. Any route that needs a selected Requester wraps its element in
// this guard instead of duplicating the check.
export default function RequireRequester({ children }: { children: ReactNode }) {
  const { requester } = useRequester()
  if (!requester) return <Navigate to="/select-requester" replace />
  return children
}
