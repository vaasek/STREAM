import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { Boot } from './ui.jsx';
import CallDock from './components/CallDock.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Room from './pages/Room.jsx';
import AdminLayout from './admin/Layout.jsx';
import Dashboard from './admin/Dashboard.jsx';
import Users from './admin/Users.jsx';
import Rooms from './admin/Rooms.jsx';
import Settings from './admin/Settings.jsx';
import Audit from './admin/Audit.jsx';

function RequireUser({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <Boot />;
  if (!user) return <Navigate to="/" replace />;
  if (user.guest) return <Navigate to={`/r/${user.roomCode}`} replace />;
  return children;
}

function RequireAdmin({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <Boot />;
  if (!user) return <Navigate to="/" replace />;
  if (user.role !== 'admin') return <Navigate to="/app" replace />;
  return children;
}

export default function App() {
  return (
    <>
      <CallDock />
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/app" element={<RequireUser><Home /></RequireUser>} />
        <Route path="/r/:code" element={<Room />} />
        <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
          <Route index element={<Dashboard />} />
          <Route path="users" element={<Users />} />
          <Route path="rooms" element={<Rooms />} />
          <Route path="streams" element={<Rooms fixedType="stream" />} />
          <Route path="settings" element={<Settings />} />
          <Route path="audit" element={<Audit />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
