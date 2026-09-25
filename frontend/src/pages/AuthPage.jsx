import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

const DEMO_ACCOUNTS = [
  { label: 'Nusrat (passenger)', phone: '01710000002' },
  { label: 'Rafiq (passenger)', phone: '01710000003' },
  { label: 'Shirin (passenger)', phone: '01710000004' },
  { label: 'Jashim (driver)', phone: '01710000001' },
];

export default function AuthPage() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [role, setRole] = useState('passenger');
  const [form, setForm] = useState({ name: '', phone: '', password: '', teslaName: '', teslaCapacity: 3 });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      let data;
      if (mode === 'signup') {
        data = await api.signup({
          name: form.name,
          phone: form.phone,
          password: form.password,
          role,
          teslaName: role === 'driver' ? form.teslaName : undefined,
          teslaCapacity: role === 'driver' ? Number(form.teslaCapacity) : undefined,
        });
      } else {
        data = await api.signin({ phone: form.phone, password: form.password });
      }
      login(data);
      navigate(data.user.role === 'driver' ? '/driver' : '/passenger');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function fillDemo(phone) {
    setMode('signin');
    setForm((f) => ({ ...f, phone, password: 'password123' }));
  }

  return (
    <div className="center-screen">
      <div className="card auth-card">
        <div className="brand" style={{ marginBottom: 8 }}>
          Dhaka <span>Tesla</span> Pool
        </div>
        <p className="muted" style={{ marginTop: 0 }}>Share a seat. Split the fare. Survive Dhaka traffic.</p>

        <div className="tabs">
          <button type="button" className={mode === 'signin' ? 'active' : ''} onClick={() => setMode('signin')}>
            Sign in
          </button>
          <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>
            Sign up
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={submit}>
          {mode === 'signup' && (
            <>
              <label>Name</label>
              <input value={form.name} onChange={(e) => update('name', e.target.value)} required />

              <label>I am a...</label>
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="passenger">Passenger</option>
                <option value="driver">Driver</option>
              </select>

              {role === 'driver' && (
                <div className="row">
                  <div>
                    <label>Tesla name</label>
                    <input value={form.teslaName} onChange={(e) => update('teslaName', e.target.value)} placeholder="e.g. Bullet" required />
                  </div>
                  <div>
                    <label>Seats</label>
                    <input
                      type="number"
                      min={1}
                      max={6}
                      value={form.teslaCapacity}
                      onChange={(e) => update('teslaCapacity', e.target.value)}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          <label>Phone</label>
          <input value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="017XXXXXXXX" required />

          <label>Password</label>
          <input type="password" value={form.password} onChange={(e) => update('password', e.target.value)} required minLength={6} />

          <button type="submit" style={{ marginTop: 16, width: '100%' }} disabled={loading}>
            {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div style={{ marginTop: 20 }}>
          <p className="muted" style={{ marginBottom: 6 }}>Demo accounts (password: password123):</p>
          <div className="actions">
            {DEMO_ACCOUNTS.map((d) => (
              <button key={d.phone} type="button" className="ghost" onClick={() => fillDemo(d.phone)}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
