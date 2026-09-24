/**
 * Ride request lifecycle (Section 3 suggested lifecycle, adopted as-is):
 *
 *   REQUESTED -> MATCHED -> DRIVER_ARRIVED -> STARTED -> COMPLETED
 *   REQUESTED -> CANCELLED
 *   MATCHED   -> CANCELLED
 *
 * Assumption (Section 17): cancellation is only allowed up through MATCHED.
 * Once the driver has physically arrived (DRIVER_ARRIVED) the Tesla has
 * already made the trip to the pickup zone, so we treat that as the
 * point of no return for a passenger-initiated cancel — mirrors how most
 * real ride-hailing apps start charging a cancellation fee/block cancels
 * around driver arrival. A driver *can* still cancel a no-show at
 * DRIVER_ARRIVED (documented as a driver-only transition).
 */
const REQUEST_TRANSITIONS = {
  REQUESTED: ['MATCHED', 'CANCELLED'],
  MATCHED: ['DRIVER_ARRIVED', 'CANCELLED'],
  DRIVER_ARRIVED: ['STARTED', 'CANCELLED'], // CANCELLED here = driver-only (no-show)
  STARTED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

// Pool-level status mirrors the request lifecycle from MATCHED onward,
// since MATCHED is the moment a request is attached to a ride/pool.
const RIDE_TRANSITIONS = {
  MATCHED: ['DRIVER_ARRIVED', 'CANCELLED'],
  DRIVER_ARRIVED: ['STARTED', 'CANCELLED'],
  STARTED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

function assertRequestTransition(from, to) {
  const allowed = REQUEST_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    const err = new Error(`Invalid ride_request transition: ${from} -> ${to}`);
    err.status = 409;
    err.code = 'INVALID_TRANSITION';
    throw err;
  }
}

function assertRideTransition(from, to) {
  const allowed = RIDE_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    const err = new Error(`Invalid ride transition: ${from} -> ${to}`);
    err.status = 409;
    err.code = 'INVALID_TRANSITION';
    throw err;
  }
}

const CANCELLABLE_REQUEST_STATUSES = ['REQUESTED', 'MATCHED'];

module.exports = {
  REQUEST_TRANSITIONS,
  RIDE_TRANSITIONS,
  assertRequestTransition,
  assertRideTransition,
  CANCELLABLE_REQUEST_STATUSES,
};
