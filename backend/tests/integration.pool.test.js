/**
 * Integration tests against a real MySQL instance.
 *
 * Run with: docker compose up -d mysql   (or a local MySQL/MariaDB)
 *           then: DB_NAME=dhaka_tesla_pool_test npm test -- integration
 *
 * These hit the real poolService + rideRepo + a real InnoDB transaction,
 * so they are the ones that actually prove the seat-capacity race and the
 * ownership/cancellation rules hold — the unit tests only prove the pure
 * functions (fare, corridor matching, transition table) are correct.
 */
const { pool } = require('../src/config/db');
const poolService = require('../src/services/poolService');
const teslaRepo = require('../src/repos/teslaRepo');

let jashimId, nusratId, rafiqId, shirinId, teslaId;
let banani, mohakhali, gulshan1, dhanmondi;

beforeAll(async () => {
  const [[jashim]] = await pool.query("SELECT id FROM users WHERE phone = '01710000001'");
  const [[nusrat]] = await pool.query("SELECT id FROM users WHERE phone = '01710000002'");
  const [[rafiq]] = await pool.query("SELECT id FROM users WHERE phone = '01710000003'");
  const [[shirin]] = await pool.query("SELECT id FROM users WHERE phone = '01710000004'");
  jashimId = jashim.id;
  nusratId = nusrat.id;
  rafiqId = rafiq.id;
  shirinId = shirin.id;

  const tesla = await teslaRepo.findByDriverId(jashimId);
  teslaId = tesla.id;
  await teslaRepo.setStatus(teslaId, 'ONLINE');

  const zones = {};
  const [rows] = await pool.query('SELECT id, name FROM zones');
  rows.forEach((z) => (zones[z.name] = z.id));
  banani = zones['Banani'];
  mohakhali = zones['Mohakhali'];
  gulshan1 = zones['Gulshan 1'];
  dhanmondi = zones['Dhanmondi'];
});

afterEach(async () => {
  // Clean slate between tests: cancel/clear anything left mid-flight so
  // each test starts with an empty, OFFLINE-free Tesla.
  await pool.query("DELETE FROM ride_status_history");
  await pool.query("DELETE FROM payments");
  await pool.query("DELETE FROM ride_requests");
  await pool.query("DELETE FROM rides");
  await teslaRepo.setStatus(teslaId, 'ONLINE');
});

afterAll(async () => {
  await pool.end();
});

describe('Nusrat + Rafiq pool correctly (Section 4/5 worked example)', () => {
  test('both requests join the same pool and both fares include the pool discount', async () => {
    const nusratReq = await poolService.requestRide({
      passengerId: nusratId,
      pickupZoneId: banani,
      destinationZoneId: mohakhali,
      seatsRequested: 1,
    });
    const rafiqReq = await poolService.requestRide({
      passengerId: rafiqId,
      pickupZoneId: banani,
      destinationZoneId: gulshan1,
      seatsRequested: 1,
    });

    const matchedNusrat = await poolService.driverAcceptRequest({ driverId: jashimId, requestId: nusratReq.id });
    const matchedRafiq = await poolService.driverAcceptRequest({ driverId: jashimId, requestId: rafiqReq.id });

    expect(matchedNusrat.ride_id).toBe(matchedRafiq.ride_id); // same pool

    const [[refreshedNusrat]] = await pool.query('SELECT * FROM ride_requests WHERE id = ?', [nusratReq.id]);
    const [[refreshedRafiq]] = await pool.query('SELECT * FROM ride_requests WHERE id = ?', [rafiqReq.id]);
    expect(refreshedNusrat.pool_discount_paisa).toBe(1266);
    expect(refreshedNusrat.total_fare_paisa).toBe(5064);
    expect(refreshedRafiq.pool_discount_paisa).toBe(1236);
    expect(refreshedRafiq.total_fare_paisa).toBe(4944);

    const [[ride]] = await pool.query('SELECT * FROM rides WHERE id = ?', [matchedNusrat.ride_id]);
    expect(ride.seats_occupied).toBe(2);
  });

  test('a Dhanmondi-bound request does NOT join the NE-corridor pool', async () => {
    const nusratReq = await poolService.requestRide({
      passengerId: nusratId,
      pickupZoneId: banani,
      destinationZoneId: mohakhali,
      seatsRequested: 1,
    });
    const crossTownReq = await poolService.requestRide({
      passengerId: rafiqId,
      pickupZoneId: banani,
      destinationZoneId: dhanmondi,
      seatsRequested: 1,
    });

    const a = await poolService.driverAcceptRequest({ driverId: jashimId, requestId: nusratReq.id });
    const b = await poolService.driverAcceptRequest({ driverId: jashimId, requestId: crossTownReq.id });

    expect(a.ride_id).not.toBe(b.ride_id); // separate pools
  });
});

describe("Bullet's capacity can never be exceeded", () => {
  test('a 4th seat is rejected once 3 seats are occupied', async () => {
    const seed = async (passengerId) =>
      poolService.requestRide({ passengerId, pickupZoneId: banani, destinationZoneId: mohakhali, seatsRequested: 1 });

    const r1 = await seed(nusratId);
    const r2 = await seed(rafiqId);
    const r3 = await seed(shirinId);
    // reuse Nusrat as a 4th distinct requester by cancel+recreate isn't needed —
    // create a throwaway 4th passenger inline for this one test
    const [[extra]] = await pool.query(
      "INSERT INTO users (name, phone, password_hash, role) VALUES ('Extra Rider','01799999999','x','passenger')"
    ).then(async ([res]) => pool.query('SELECT id FROM users WHERE id = ?', [res.insertId]));
    const r4 = await seed(extra.id);

    await poolService.driverAcceptRequest({ driverId: jashimId, requestId: r1.id });
    await poolService.driverAcceptRequest({ driverId: jashimId, requestId: r2.id });
    await poolService.driverAcceptRequest({ driverId: jashimId, requestId: r3.id }); // fills capacity 3

    await expect(poolService.driverAcceptRequest({ driverId: jashimId, requestId: r4.id })).rejects.toMatchObject({
      code: 'SEAT_UNAVAILABLE',
    });

    const [[ride]] = await pool.query('SELECT * FROM rides WHERE tesla_id = ? ORDER BY id DESC LIMIT 1', [teslaId]);
    expect(ride.seats_occupied).toBe(3); // never exceeded
  });
});

describe('The concurrency problem (Section 12): last seat, two simultaneous claims', () => {
  test('exactly one of two simultaneous accepts wins the last seat; the other gets a clean error', async () => {
    const seed = async (passengerId, destZoneId) =>
      poolService.requestRide({ passengerId, pickupZoneId: banani, destinationZoneId: destZoneId, seatsRequested: 1 });

    const r1 = await seed(nusratId, mohakhali);
    const r2 = await seed(rafiqId, gulshan1);
    await poolService.driverAcceptRequest({ driverId: jashimId, requestId: r1.id });
    await poolService.driverAcceptRequest({ driverId: jashimId, requestId: r2.id }); // 2/3 seats now occupied

    const shirinReq = await seed(shirinId, mohakhali);
    const [[extra]] = await pool.query(
      "INSERT INTO users (name, phone, password_hash, role) VALUES ('Extra Rider 2','01799999998','x','passenger')"
    ).then(async ([res]) => pool.query('SELECT id FROM users WHERE id = ?', [res.insertId]));
    const raceReq = await seed(extra.id, mohakhali); // a second passenger racing for the same last seat

    // Fire both "accept" calls at nearly the same instant.
    const results = await Promise.allSettled([
      poolService.driverAcceptRequest({ driverId: jashimId, requestId: shirinReq.id }),
      poolService.driverAcceptRequest({ driverId: jashimId, requestId: raceReq.id }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason.code).toBe('SEAT_UNAVAILABLE');

    const [[ride]] = await pool.query('SELECT * FROM rides WHERE tesla_id = ? ORDER BY id DESC LIMIT 1', [teslaId]);
    expect(ride.seats_occupied).toBe(3); // capacity respected, not overbooked to 4
  });
});

describe('invalid state transitions are rejected', () => {
  test('driver cannot start a ride before marking arrival', async () => {
    const req = await poolService.requestRide({
      passengerId: nusratId,
      pickupZoneId: banani,
      destinationZoneId: mohakhali,
      seatsRequested: 1,
    });
    const matched = await poolService.driverAcceptRequest({ driverId: jashimId, requestId: req.id });

    await expect(
      poolService.advanceRide({ driverId: jashimId, rideId: matched.ride_id, toStatus: 'STARTED' })
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });
});

describe("users can't modify another user's ride", () => {
  test('Rafiq cannot cancel Nusrat\'s ride request', async () => {
    const nusratReq = await poolService.requestRide({
      passengerId: nusratId,
      pickupZoneId: banani,
      destinationZoneId: mohakhali,
      seatsRequested: 1,
    });

    await expect(
      poolService.cancelRequest({ userId: rafiqId, role: 'passenger', requestId: nusratReq.id })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  test('a driver cannot advance a ride that is not theirs', async () => {
    // Second driver + Tesla
    const [res] = await pool.query(
      "INSERT INTO users (name, phone, password_hash, role) VALUES ('Other Driver','01788888888','x','driver')"
    );
    const otherDriverId = res.insertId;
    await pool.query("INSERT INTO teslas (driver_id, name, capacity, status) VALUES (?, 'Ghost', 3, 'ONLINE')", [
      otherDriverId,
    ]);

    const nusratReq = await poolService.requestRide({
      passengerId: nusratId,
      pickupZoneId: banani,
      destinationZoneId: mohakhali,
      seatsRequested: 1,
    });
    const matched = await poolService.driverAcceptRequest({ driverId: jashimId, requestId: nusratReq.id });

    await expect(
      poolService.advanceRide({ driverId: otherDriverId, rideId: matched.ride_id, toStatus: 'DRIVER_ARRIVED' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('cancellation rules', () => {
  test('a passenger can cancel while REQUESTED', async () => {
    const req = await poolService.requestRide({
      passengerId: nusratId,
      pickupZoneId: banani,
      destinationZoneId: mohakhali,
      seatsRequested: 1,
    });
    const cancelled = await poolService.cancelRequest({ userId: nusratId, role: 'passenger', requestId: req.id });
    expect(cancelled.status).toBe('CANCELLED');
  });

  test('a passenger cannot cancel after the driver has arrived', async () => {
    const req = await poolService.requestRide({
      passengerId: nusratId,
      pickupZoneId: banani,
      destinationZoneId: mohakhali,
      seatsRequested: 1,
    });
    const matched = await poolService.driverAcceptRequest({ driverId: jashimId, requestId: req.id });
    await poolService.advanceRide({ driverId: jashimId, rideId: matched.ride_id, toStatus: 'DRIVER_ARRIVED' });

    await expect(
      poolService.cancelRequest({ userId: nusratId, role: 'passenger', requestId: req.id })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  test('cancelling one pooled passenger frees the seat and recalculates the remaining fare (loses pool discount)', async () => {
    const nusratReq = await poolService.requestRide({
      passengerId: nusratId,
      pickupZoneId: banani,
      destinationZoneId: mohakhali,
      seatsRequested: 1,
    });
    const rafiqReq = await poolService.requestRide({
      passengerId: rafiqId,
      pickupZoneId: banani,
      destinationZoneId: gulshan1,
      seatsRequested: 1,
    });
    const matchedNusrat = await poolService.driverAcceptRequest({ driverId: jashimId, requestId: nusratReq.id });
    await poolService.driverAcceptRequest({ driverId: jashimId, requestId: rafiqReq.id });

    await poolService.cancelRequest({ userId: nusratId, role: 'passenger', requestId: nusratReq.id });

    const [[ride]] = await pool.query('SELECT * FROM rides WHERE id = ?', [matchedNusrat.ride_id]);
    expect(ride.seats_occupied).toBe(1); // Nusrat's seat freed

    const [[rafiqRefreshed]] = await pool.query('SELECT * FROM ride_requests WHERE id = ?', [rafiqReq.id]);
    expect(rafiqRefreshed.pool_discount_paisa).toBe(0); // solo now, no more discount
    expect(rafiqRefreshed.total_fare_paisa).toBe(6180);
  });
});
