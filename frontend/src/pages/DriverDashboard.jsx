import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import StatusBadge from '../components/StatusBadge';
import { formatPaisa } from '../utils/money';

const NEXT_ACTION = {
  MATCHED: { label: 'Mark driver arrived', to: 'arrive' },
  DRIVER_ARRIVED: { label: 'Start trip', to: 'start' },
  STARTED: { label: 'Complete trip', to: 'complete' },
};

export default function DriverDashboard() {
  const { auth, logout } = useAuth();
  const token = auth?.token;

  const [tesla, setTesla] = useState(null);
  const [openRequests, setOpenRequests] = useState([]);
  const [activeRides, setActiveRides] = useState([]); // [{ride, members}]
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const [t, requests, rideHistory] = await Promise.all([
        api.myTesla(token),
        api.openRequests(token),
        api.driverRides(token),
      ]);
      setTesla(t);
      setOpenRequests(requests);

      const active = rideHistory.filter((r) => ['MATCHED', 'DRIVER_ARRIVED', 'STARTED'].includes(r.status));
      const details = await Promise.all(active.map((r) => api.rideDetail(token, r.id)));
      setActiveRides(details);
    } catch (err) {
      setError(err.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  async function toggleOnline() {
    setError(null);
    try {
      const next = tesla.status === 'ONLINE' ? 'OFFLINE' : 'ONLINE';
      const updated = await api.setDriverStatus(token, next);
      setTesla(updated);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function accept(requestId) {
    setError(null);
    setBusy(requestId);
    try {
      await api.acceptRequest(token, requestId);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function advance(rideId, action) {
    setError(null);
    setBusy(rideId);
    try {
      if (action === 'arrive') await api.arrive(token, rideId);
      if (action === 'start') await api.start(token, rideId);
      if (action === 'complete') await api.complete(token, rideId);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  if (!tesla) {
    return (
      <div className="app-shell">
        {error && <div className="error-banner">{error}</div>}
        <p className="muted">Loading your Tesla…</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="brand">
          Dhaka <span>Tesla</span> Pool
        </div>
        <div className="actions">
          <span className="muted">Hi, {auth.user.name}</span>
          <button className="ghost" onClick={logout}>Sign out</button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <div className="list-item" style={{ borderBottom: 'none', padding: 0 }}>
          <div>
            <h2 style={{ margin: 0 }}>{tesla.name}</h2>
            <div className="muted">{tesla.capacity} seats · Driver: {auth.user.name}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <StatusBadge status={tesla.status} />
            <div style={{ marginTop: 8 }}>
              <button className={tesla.status === 'ONLINE' ? 'secondary' : ''} onClick={toggleOnline}>
                {tesla.status === 'ONLINE' ? 'Go offline' : 'Go online'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {activeRides.map(({ ride, members }) => {
        const occupied = members.reduce((sum, m) => sum + m.seats_requested, 0);
        const action = NEXT_ACTION[ride.status];
        return (
          <div className="card" key={ride.id}>
            <div className="list-item" style={{ borderBottom: 'none', padding: 0, marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>
                Pool #{ride.id} <StatusBadge status={ride.status} />
              </h3>
              <span className="muted">{occupied}/{tesla.capacity} seats occupied</span>
            </div>
            {members.map((m) => (
              <div className="list-item" key={m.id}>
                <div>
                  <strong>{m.passenger_name}</strong>
                  <div className="muted">{m.pickup_zone_name} → {m.destination_zone_name} · {m.seats_requested} seat(s)</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="fare">{formatPaisa(m.total_fare_paisa)}</div>
                  <StatusBadge status={m.status} />
                </div>
              </div>
            ))}
            {action && (
              <button style={{ marginTop: 12 }} disabled={busy === ride.id} onClick={() => advance(ride.id, action.to)}>
                {busy === ride.id ? 'Working…' : action.label}
              </button>
            )}
          </div>
        );
      })}

      <div className="card">
        <h2>Open requests</h2>
        {tesla.status !== 'ONLINE' && <p className="muted">Go online to see and accept requests.</p>}
        {tesla.status === 'ONLINE' && openRequests.length === 0 && (
          <div className="empty-state">No waiting passengers right now.</div>
        )}
        {tesla.status === 'ONLINE' &&
          openRequests.map((r) => (
            <div className="list-item" key={r.id}>
              <div>
                <strong>{r.passenger_id ? `Request #${r.id}` : r.id}</strong>
                <div className="muted">{r.pickup_zone_name} → {r.destination_zone_name} · {r.seats_requested} seat(s) · {r.distance_km} km</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="fare">{formatPaisa(r.total_fare_paisa)}</div>
              </div>
              <button disabled={busy === r.id} onClick={() => accept(r.id)}>
                {busy === r.id ? 'Accepting…' : 'Accept'}
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}
