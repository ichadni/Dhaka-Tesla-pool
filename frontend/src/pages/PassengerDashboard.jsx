import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import StatusBadge from '../components/StatusBadge';
import { formatPaisa } from '../utils/money';

const CANCELLABLE = ['REQUESTED', 'MATCHED'];

export default function PassengerDashboard() {
  const { auth, logout } = useAuth();
  const token = auth?.token;

  const [zones, setZones] = useState([]);
  const [pickupZoneId, setPickupZoneId] = useState('');
  const [destinationZoneId, setDestinationZoneId] = useState('');
  const [seats, setSeats] = useState(1);
  const [rides, setRides] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [z, r] = await Promise.all([api.zones(token), api.myRides(token)]);
      setZones(z);
      setRides(r);
      if (!pickupZoneId && z.length) setPickupZoneId(z[0].id);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000); // simple polling for live status updates
    return () => clearInterval(interval);
  }, [load]);

  async function submitRequest(e) {
    e.preventDefault();
    setError(null);
    if (!destinationZoneId) {
      setError('Choose a destination');
      return;
    }
    setSubmitting(true);
    try {
      await api.requestRide(token, {
        pickupZoneId: Number(pickupZoneId),
        destinationZoneId: Number(destinationZoneId),
        seatsRequested: Number(seats),
      });
      setDestinationZoneId('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel(id) {
    setError(null);
    try {
      await api.cancelRide(token, id);
      await load();
    } catch (err) {
      setError(err.message);
    }
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
        <h2>Request a ride</h2>
        <form onSubmit={submitRequest}>
          <div className="row">
            <div>
              <label>Pickup</label>
              <select value={pickupZoneId} onChange={(e) => setPickupZoneId(e.target.value)}>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>{z.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Destination</label>
              <select value={destinationZoneId} onChange={(e) => setDestinationZoneId(e.target.value)}>
                <option value="">Choose…</option>
                {zones.filter((z) => String(z.id) !== String(pickupZoneId)).map((z) => (
                  <option key={z.id} value={z.id}>{z.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Seats</label>
              <select value={seats} onChange={(e) => setSeats(e.target.value)}>
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </div>
          </div>
          <button type="submit" style={{ marginTop: 16 }} disabled={submitting}>
            {submitting ? 'Requesting…' : 'Request ride'}
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Your rides</h2>
        {loading && rides.length === 0 && <p className="muted">Loading…</p>}
        {!loading && rides.length === 0 && <div className="empty-state">No rides yet — request one above.</div>}
        {rides.map((r) => (
          <div className="list-item" key={r.id}>
            <div>
              <div>
                <strong>{r.pickup_zone_name}</strong> → <strong>{r.destination_zone_name}</strong>
              </div>
              <div className="muted">
                {r.seats_requested} seat{r.seats_requested > 1 ? 's' : ''} · {r.distance_km} km ·{' '}
                {new Date(r.created_at).toLocaleString()}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="fare">{formatPaisa(r.total_fare_paisa)}</div>
              {r.pool_discount_paisa > 0 && (
                <div className="muted">pooled · -{formatPaisa(r.pool_discount_paisa)}</div>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <StatusBadge status={r.status} />
              {CANCELLABLE.includes(r.status) && (
                <div style={{ marginTop: 6 }}>
                  <button className="secondary" onClick={() => cancel(r.id)}>Cancel</button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
