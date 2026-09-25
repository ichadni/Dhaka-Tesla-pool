import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import AuthPage from './pages/AuthPage';
import PassengerDashboard from './pages/PassengerDashboard';
import DriverDashboard from './pages/DriverDashboard';

function Protected({ role, children }) {
  const { auth } = useAuth();
  if (!auth) return <Navigate to="/" replace />;
  if (role && auth.user.role !== role) {
    return <Navigate to={auth.user.role === 'driver' ? '/driver' : '/passenger'} replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AuthPage />} />
      <Route
        path="/passenger"
        element={
          <Protected role="passenger">
            <PassengerDashboard />
          </Protected>
        }
      />
      <Route
        path="/driver"
        element={
          <Protected role="driver">
            <DriverDashboard />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
