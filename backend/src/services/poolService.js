const { withTransaction, pool } = require('../config/db');
const rideRepo = require('../repos/rideRepo');
const teslaRepo = require('../repos/teslaRepo');
const zoneRepo = require('../repos/zoneRepo');
const { computeFare } = require('./fareService');
const { distanceKm, isPoolable } = require('./geoService');
const { assertRequestTransition, assertRideTransition, CANCELLABLE_REQUEST_STATUSES } = require('./stateMachine');

function forbidden(message) {
  const err = new Error(message);
  err.status = 403;
  err.code = 'FORBIDDEN';
  return err;
}
function notFound(message) {
  const err = new Error(message);
  err.status = 404;
  err.code = 'NOT_FOUND';
  return err;
}
function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.code = 'BAD_REQUEST';
  return err;
}

async function requestRide({ passengerId, pickupZoneId, destinationZoneId, seatsRequested, paymentMethod }) {
  const pickup = await zoneRepo.findById(pickupZoneId);
  const destination = await zoneRepo.findById(destinationZoneId);
  if (!pickup || !destination) throw badRequest('Unknown pickup or destination zone');
  if (pickup.id === destination.id) throw badRequest('Pickup and destination must differ');
  const seats = Number(seatsRequested) || 1;
  if (seats < 1 || seats > 3) throw badRequest('seatsRequested must be between 1 and 3');

  const km = distanceKm(pickup, destination);
  const fare = computeFare(km, false); // estimate shown before any pooling is known

  return withTransaction((conn) =>
    rideRepo.createRequest(conn, {
      passengerId,
      pickupZoneId,
      destinationZoneId,
      seatsRequested: seats,
      paymentMethod: paymentMethod || 'CASH',
      distanceKm: km,
      fare,
    })
  );
}

async function listOpenRequestsForDriver() {
  return rideRepo.listOpenRequests();
}

/**
 * Driver accepts a REQUESTED ride_request. If the driver's Tesla already
 * has an active, still-boarding (MATCHED) pool that this request is
 * poolable with and that has a free seat, the request joins that pool;
 * otherwise a brand-new pool is created. Capacity is enforced inside a
 * single DB transaction with a row lock (see rideRepo.attachRequestToRide).
 */
async function driverAcceptRequest({ driverId, requestId }) {
  const tesla = await teslaRepo.findByDriverId(driverId);
  if (!tesla) throw notFound('You do not have a registered Tesla');
  if (tesla.status !== 'ONLINE') throw badRequest('Go online before accepting requests');

  const request = await rideRepo.findRequestById(requestId);
  if (!request) throw notFound('Ride request not found');
  if (request.status !== 'REQUESTED') throw badRequest(`Request is already ${request.status}`);

  const activeRide = await rideRepo.findActiveRideForTesla(tesla.id);

  await withTransaction(async (conn) => {
    let rideId;
    if (activeRide && activeRide.status === 'MATCHED') {
      const existingMembers = await rideRepo.getRideMembers(activeRide.id);
      const compatible = existingMembers.every((m) =>
        isPoolable(
          { pickup_zone_id: m.pickup_zone_id, destination_corridor_group: m.destination_corridor_group },
          { pickup_zone_id: request.pickup_zone_id, destination_corridor_group: request.destination_corridor_group }
        )
      );
      if (compatible) {
        await rideRepo.attachRequestToRide(conn, activeRide.id, request.id, request.seats_requested, tesla.capacity, driverId);
        rideId = activeRide.id;
      }
    }
    if (!rideId) {
      rideId = await rideRepo.createRideAndAttach(conn, tesla.id, request.id, request.seats_requested, driverId);
    }
    await rideRepo.recomputeFaresForRide(conn, rideId, computeFare);
  });

  return rideRepo.findRequestById(requestId);
}

async function assertDriverOwnsRide(driverId, rideId) {
  const tesla = await teslaRepo.findByDriverId(driverId);
  const ride = await rideRepo.findRideById(rideId);
  if (!tesla || !ride || ride.tesla_id !== tesla.id) throw forbidden('Not your ride');
  return { tesla, ride };
}

async function advanceRide({ driverId, rideId, toStatus }) {
  const { ride } = await assertDriverOwnsRide(driverId, rideId);
  assertRideTransition(ride.status, toStatus);

  await withTransaction(async (conn) => {
    const extra = toStatus === 'STARTED' ? ', started_at = NOW()' : toStatus === 'COMPLETED' ? ', completed_at = NOW()' : '';
    await rideRepo.updateRideStatus(conn, rideId, toStatus, extra);
    await rideRepo.cascadeRequestsToStatus(conn, rideId, toStatus, driverId);
    if (toStatus === 'COMPLETED') {
      const [members] = await conn.query(
        `SELECT id, total_fare_paisa, payment_method FROM ride_requests WHERE ride_id = ? AND status = 'COMPLETED'`,
        [rideId]
      );
      for (const m of members) {
        await conn.query(
          `INSERT INTO payments (ride_request_id, method, amount_paisa, status, paid_at)
           VALUES (?, ?, ?, 'PAID', NOW())
           ON DUPLICATE KEY UPDATE amount_paisa = VALUES(amount_paisa)`,
          [m.id, m.payment_method, m.total_fare_paisa]
        );
      }
    }
  });

  return rideRepo.findRideById(rideId);
}

async function cancelRequest({ userId, role, requestId }) {
  const request = await rideRepo.findRequestById(requestId);
  if (!request) throw notFound('Ride request not found');
  if (role === 'passenger' && request.passenger_id !== userId) {
    throw forbidden('You can only cancel your own ride request');
  }
  if (!CANCELLABLE_REQUEST_STATUSES.includes(request.status)) {
    throw badRequest(`Cannot cancel a request that is already ${request.status}`);
  }
  assertRequestTransition(request.status, 'CANCELLED');

  await withTransaction(async (conn) => {
    const locked = await rideRepo.findRequestByIdForUpdate(conn, requestId);
    if (!CANCELLABLE_REQUEST_STATUSES.includes(locked.status)) {
      throw badRequest(`Cannot cancel a request that is already ${locked.status}`);
    }
    const [result] = await conn.query(
      `UPDATE ride_requests SET status = 'CANCELLED', cancelled_at = NOW(), version = version + 1
       WHERE id = ? AND status = ?`,
      [requestId, locked.status]
    );
    if (result.affectedRows === 0) {
      throw badRequest('Request status changed concurrently, please retry');
    }
    await rideRepo.insertHistory(conn, requestId, locked.status, 'CANCELLED', userId, 'Cancelled');

    if (locked.ride_id) {
      await conn.query('UPDATE rides SET seats_occupied = seats_occupied - ? WHERE id = ?', [
        locked.seats_requested,
        locked.ride_id,
      ]);
      const [[ride]] = await conn.query('SELECT * FROM rides WHERE id = ? FOR UPDATE', [locked.ride_id]);
      const [[{ cnt }]] = await conn.query(
        `SELECT COUNT(*) AS cnt FROM ride_requests WHERE ride_id = ? AND status NOT IN ('CANCELLED')`,
        [locked.ride_id]
      );
      if (cnt === 0 && ride.status === 'MATCHED') {
        await rideRepo.updateRideStatus(conn, locked.ride_id, 'CANCELLED');
      } else {
        await rideRepo.recomputeFaresForRide(conn, locked.ride_id, computeFare);
      }
    }
  });

  return rideRepo.findRequestById(requestId);
}

async function getPassengerHistory(passengerId) {
  return rideRepo.listRequestsForPassenger(passengerId);
}

async function getRideDetailForDriver(driverId, rideId) {
  const { ride } = await assertDriverOwnsRide(driverId, rideId);
  const members = await rideRepo.getRideMembers(rideId);
  return { ride, members };
}

module.exports = {
  requestRide,
  listOpenRequestsForDriver,
  driverAcceptRequest,
  advanceRide,
  cancelRequest,
  getPassengerHistory,
  getRideDetailForDriver,
};
