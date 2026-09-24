const express = require('express');
const { z } = require('zod');
const { requireAuth, requireRole } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const teslaRepo = require('../repos/teslaRepo');
const poolService = require('../services/poolService');
const rideRepo = require('../repos/rideRepo');

const router = express.Router();
router.use(requireAuth, requireRole('driver'));

async function myTesla(req) {
  const tesla = await teslaRepo.findByDriverId(req.user.id);
  if (!tesla) {
    const err = new Error('No Tesla registered to this driver');
    err.status = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }
  return tesla;
}

// Go online/offline
router.post(
  '/status',
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: z.enum(['ONLINE', 'OFFLINE']) }).parse(req.body);
    const tesla = await myTesla(req);
    const updated = await teslaRepo.setStatus(tesla.id, status);
    res.json(updated);
  })
);

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    res.json(await myTesla(req));
  })
);

// See relevant (unmatched) requests to accept into a ride/pool
router.get(
  '/requests',
  asyncHandler(async (req, res) => {
    res.json(await poolService.listOpenRequestsForDriver());
  })
);

// Accept a request: creates a new pool or joins the driver's current one
router.post(
  '/requests/:id/accept',
  asyncHandler(async (req, res) => {
    const request = await poolService.driverAcceptRequest({ driverId: req.user.id, requestId: req.params.id });
    res.json(request);
  })
);

// Mark arrival / start / complete the whole pool
router.post(
  '/rides/:id/arrive',
  asyncHandler(async (req, res) => {
    res.json(await poolService.advanceRide({ driverId: req.user.id, rideId: req.params.id, toStatus: 'DRIVER_ARRIVED' }));
  })
);
router.post(
  '/rides/:id/start',
  asyncHandler(async (req, res) => {
    res.json(await poolService.advanceRide({ driverId: req.user.id, rideId: req.params.id, toStatus: 'STARTED' }));
  })
);
router.post(
  '/rides/:id/complete',
  asyncHandler(async (req, res) => {
    res.json(await poolService.advanceRide({ driverId: req.user.id, rideId: req.params.id, toStatus: 'COMPLETED' }));
  })
);

// See passengers/seats for a given pool
router.get(
  '/rides/:id',
  asyncHandler(async (req, res) => {
    res.json(await poolService.getRideDetailForDriver(req.user.id, req.params.id));
  })
);

// Driver's ride history (all pools ever run on their Tesla)
router.get(
  '/rides',
  asyncHandler(async (req, res) => {
    const tesla = await myTesla(req);
    const { pool } = require('../config/db');
    const [rides] = await pool.query('SELECT * FROM rides WHERE tesla_id = ? ORDER BY created_at DESC', [tesla.id]);
    res.json(rides);
  })
);

module.exports = router;
