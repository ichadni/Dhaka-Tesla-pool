const { pool } = require('../config/db');

async function insertHistory(conn, rideRequestId, fromStatus, toStatus, changedByUserId, note) {
  await conn.query(
    `INSERT INTO ride_status_history (ride_request_id, from_status, to_status, changed_by_user_id, note)
     VALUES (?, ?, ?, ?, ?)`,
    [rideRequestId, fromStatus, toStatus, changedByUserId || null, note || null]
  );
}

async function createRequest(conn, { passengerId, pickupZoneId, destinationZoneId, seatsRequested, paymentMethod, distanceKm, fare }) {
  const [result] = await conn.query(
    `INSERT INTO ride_requests
       (passenger_id, pickup_zone_id, destination_zone_id, seats_requested, payment_method,
        distance_km, base_fare_paisa, distance_charge_paisa, pool_discount_paisa, total_fare_paisa, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'REQUESTED')`,
    [
      passengerId,
      pickupZoneId,
      destinationZoneId,
      seatsRequested,
      paymentMethod,
      distanceKm,
      fare.baseFarePaisa,
      fare.distanceChargePaisa,
      fare.poolDiscountPaisa,
      fare.totalFarePaisa,
    ]
  );
  const id = result.insertId;
  await insertHistory(conn, id, null, 'REQUESTED', passengerId, 'Passenger requested ride');
  return findRequestById(id);
}

async function findRequestById(id) {
  const [rows] = await pool.query(
    `SELECT rr.*, zp.name AS pickup_zone_name, zd.name AS destination_zone_name,
            zd.corridor_group AS destination_corridor_group
     FROM ride_requests rr
     JOIN zones zp ON zp.id = rr.pickup_zone_id
     JOIN zones zd ON zd.id = rr.destination_zone_id
     WHERE rr.id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function findRequestByIdForUpdate(conn, id) {
  const [rows] = await conn.query('SELECT * FROM ride_requests WHERE id = ? FOR UPDATE', [id]);
  return rows[0] || null;
}

async function listRequestsForPassenger(passengerId) {
  const [rows] = await pool.query(
    `SELECT rr.*, zp.name AS pickup_zone_name, zd.name AS destination_zone_name
     FROM ride_requests rr
     JOIN zones zp ON zp.id = rr.pickup_zone_id
     JOIN zones zd ON zd.id = rr.destination_zone_id
     WHERE rr.passenger_id = ?
     ORDER BY rr.created_at DESC`,
    [passengerId]
  );
  return rows;
}

// Requests a driver could act on: unmatched requests (open pool candidates),
// plus requests already sitting in one of the driver's own active rides.
async function listOpenRequests() {
  const [rows] = await pool.query(
    `SELECT rr.*, zp.name AS pickup_zone_name, zd.name AS destination_zone_name,
            zd.corridor_group AS destination_corridor_group
     FROM ride_requests rr
     JOIN zones zp ON zp.id = rr.pickup_zone_id
     JOIN zones zd ON zd.id = rr.destination_zone_id
     WHERE rr.status = 'REQUESTED'
     ORDER BY rr.created_at ASC`
  );
  return rows;
}

async function findRideById(id) {
  const [rows] = await pool.query('SELECT * FROM rides WHERE id = ?', [id]);
  return rows[0] || null;
}

async function findRideByIdForUpdate(conn, id) {
  const [rows] = await conn.query('SELECT * FROM rides WHERE id = ? FOR UPDATE', [id]);
  return rows[0] || null;
}

async function findActiveRideForTesla(teslaId) {
  const [rows] = await pool.query(
    `SELECT * FROM rides WHERE tesla_id = ? AND status IN ('MATCHED','DRIVER_ARRIVED','STARTED')
     ORDER BY created_at DESC LIMIT 1`,
    [teslaId]
  );
  return rows[0] || null;
}

async function getRideMembers(rideId) {
  const [rows] = await pool.query(
    `SELECT rr.*, zp.name AS pickup_zone_name, zd.name AS destination_zone_name, u.name AS passenger_name
     FROM ride_requests rr
     JOIN zones zp ON zp.id = rr.pickup_zone_id
     JOIN zones zd ON zd.id = rr.destination_zone_id
     JOIN users u ON u.id = rr.passenger_id
     WHERE rr.ride_id = ? AND rr.status NOT IN ('CANCELLED')
     ORDER BY rr.created_at ASC`,
    [rideId]
  );
  return rows;
}

/**
 * Create a brand-new pool (ride) on a Tesla and attach the first request.
 * Guarded by an atomic compare-and-swap on the request's status so two
 * drivers double-clicking "accept" can't both win.
 */
async function createRideAndAttach(conn, teslaId, requestId, seatsRequested, acceptedByUserId) {
  const [rideResult] = await conn.query(
    `INSERT INTO rides (tesla_id, status, seats_occupied) VALUES (?, 'MATCHED', ?)`,
    [teslaId, seatsRequested]
  );
  const rideId = rideResult.insertId;

  const [updateResult] = await conn.query(
    `UPDATE ride_requests SET ride_id = ?, status = 'MATCHED', matched_at = NOW(), version = version + 1
     WHERE id = ? AND status = 'REQUESTED'`,
    [rideId, requestId]
  );
  if (updateResult.affectedRows === 0) {
    const err = new Error('Request was already matched or cancelled by someone else');
    err.status = 409;
    err.code = 'REQUEST_UNAVAILABLE';
    throw err;
  }
  await insertHistory(conn, requestId, 'REQUESTED', 'MATCHED', acceptedByUserId, `New pool created on Tesla #${teslaId}`);
  return rideId;
}

/**
 * Join an EXISTING pool. This is the concurrency-critical path (Section 12):
 * `SELECT ... FOR UPDATE` takes a row lock on the ride, so if two requests
 * race for the last seat, the second transaction blocks until the first
 * commits, re-reads the now-updated seats_occupied, and fails the capacity
 * check cleanly instead of overbooking Bullet.
 */
async function attachRequestToRide(conn, rideId, requestId, seatsRequested, capacity, acceptedByUserId) {
  const ride = await findRideByIdForUpdate(conn, rideId); // row lock acquired here
  if (!ride || ride.status !== 'MATCHED') {
    const err = new Error('Pool is no longer accepting passengers');
    err.status = 409;
    err.code = 'POOL_CLOSED';
    throw err;
  }
  if (ride.seats_occupied + seatsRequested > capacity) {
    const err = new Error('Not enough seats left on this Tesla');
    err.status = 409;
    err.code = 'SEAT_UNAVAILABLE';
    throw err;
  }

  await conn.query('UPDATE rides SET seats_occupied = seats_occupied + ? WHERE id = ?', [seatsRequested, rideId]);

  const [updateResult] = await conn.query(
    `UPDATE ride_requests SET ride_id = ?, status = 'MATCHED', matched_at = NOW(), version = version + 1
     WHERE id = ? AND status = 'REQUESTED'`,
    [rideId, requestId]
  );
  if (updateResult.affectedRows === 0) {
    const err = new Error('Request was already matched or cancelled by someone else');
    err.status = 409;
    err.code = 'REQUEST_UNAVAILABLE';
    throw err;
  }
  await insertHistory(conn, requestId, 'REQUESTED', 'MATCHED', acceptedByUserId, `Pooled into existing ride #${rideId}`);
}

/** Recompute each active member's fare after the pool's membership changes. */
async function recomputeFaresForRide(conn, rideId, computeFare) {
  const [members] = await conn.query(
    `SELECT id, distance_km FROM ride_requests WHERE ride_id = ? AND status NOT IN ('CANCELLED')`,
    [rideId]
  );
  const isPooled = members.length > 1;
  for (const m of members) {
    const fare = computeFare(Number(m.distance_km), isPooled);
    await conn.query(
      `UPDATE ride_requests
       SET base_fare_paisa = ?, distance_charge_paisa = ?, pool_discount_paisa = ?, total_fare_paisa = ?
       WHERE id = ?`,
      [fare.baseFarePaisa, fare.distanceChargePaisa, fare.poolDiscountPaisa, fare.totalFarePaisa, m.id]
    );
  }
}

async function updateRideStatus(conn, rideId, toStatus, extraSql = '') {
  await conn.query(`UPDATE rides SET status = ? ${extraSql} WHERE id = ?`, [toStatus, rideId]);
}

async function cascadeRequestsToStatus(conn, rideId, toStatus, changedByUserId, extraSql = '') {
  const [members] = await conn.query(
    `SELECT id, status FROM ride_requests WHERE ride_id = ? AND status NOT IN ('CANCELLED','COMPLETED')`,
    [rideId]
  );
  for (const m of members) {
    await conn.query(`UPDATE ride_requests SET status = ?, version = version + 1 ${extraSql} WHERE id = ?`, [toStatus, m.id]);
    await insertHistory(conn, m.id, m.status, toStatus, changedByUserId, 'Driver advanced the pool');
  }
}

module.exports = {
  insertHistory,
  createRequest,
  findRequestById,
  findRequestByIdForUpdate,
  listRequestsForPassenger,
  listOpenRequests,
  findRideById,
  findRideByIdForUpdate,
  findActiveRideForTesla,
  getRideMembers,
  createRideAndAttach,
  attachRequestToRide,
  recomputeFaresForRide,
  updateRideStatus,
  cascadeRequestsToStatus,
};
