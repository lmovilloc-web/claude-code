import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Today from './pages/Today'
import CheckIn from './pages/CheckIn'
import CheckOut from './pages/CheckOut'
import CargoReception from './pages/CargoReception'
import Admin from './pages/Admin'

const PANEL_ROLES = ['super_admin', 'admin', 'supervisor']

function Guard({ children, roles }: { children: JSX.Element; roles?: string[] }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to={PANEL_ROLES.includes(user.role) ? '/admin' : '/hoy'} replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/hoy" element={<Guard roles={['driver', 'helper']}><Today /></Guard>} />
          <Route path="/checkin" element={<Guard roles={['driver', 'helper']}><CheckIn /></Guard>} />
          <Route path="/checkout" element={<Guard roles={['driver']}><CheckOut /></Guard>} />
          <Route path="/recepcion" element={<Guard roles={['driver', 'helper']}><CargoReception /></Guard>} />
          <Route path="/admin" element={<Guard roles={PANEL_ROLES}><Admin /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}
