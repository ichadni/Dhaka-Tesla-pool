const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // no JSON body (e.g. 204)
  }

  if (!res.ok) {
    const err = new Error((data && data.message) || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data && data.error;
    throw err;
  }
  return data;
}

export const api = {
  signup: (payload) => request('/auth/signup', { method: 'POST', body: payload }),
  signin: (payload) => request('/auth/signin', { method: 'POST', body: payload }),
  zones: (token) => request('/zones', { token }),

  // passenger
  requestRide: (token, payload) => request('/rides', { method: 'POST', body: payload, token }),
  myRides: (token) => request('/rides', { token }),
  cancelRide: (token, id) => request(`/rides/${id}/cancel`, { method: 'POST', token }),

  // driver
  myTesla: (token) => request('/driver/me', { token }),
  setDriverStatus: (token, status) => request('/driver/status', { method: 'POST', body: { status }, token }),
  openRequests: (token) => request('/driver/requests', { token }),
  acceptRequest: (token, id) => request(`/driver/requests/${id}/accept`, { method: 'POST', token }),
  rideDetail: (token, id) => request(`/driver/rides/${id}`, { token }),
  driverRides: (token) => request('/driver/rides', { token }),
  arrive: (token, id) => request(`/driver/rides/${id}/arrive`, { method: 'POST', token }),
  start: (token, id) => request(`/driver/rides/${id}/start`, { method: 'POST', token }),
  complete: (token, id) => request(`/driver/rides/${id}/complete`, { method: 'POST', token }),
};
