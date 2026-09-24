const express = require('express');
const { z } = require('zod');
const { requireAuth, requireRole } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const poolService = require('../services/poolService');
const rideRepo = require('../repos/rideRepo');

const router = express.Router();
router.use(requireAuth, requireRole('passenger'));

const requestSchema = z.object({
  pickupZoneId: z.number().int(),
  destinationZoneId: z.number().int(),
  seatsRequested: z.number().int().min(1).max(3).optional(),
  paymentMethod: z.enum(['CASH', 'TESLAPAY']).optional(),
});

// Request a ride: pickup, destination, seats -> see estimated fare
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = requestSchema.parse(req.body);
    const request = await poolService.requestRide({ passengerId: req.user.id, ...data });
    res.status(201).json(request);
  })
);

// View own history (all statuses)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await poolService.getPassengerHistory(req.user.id));
  })
);

// Track a single request's status/fare — ownership enforced
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const request = await rideRepo.findRequestById(req.params.id);
    if (!request || request.passenger_id !== req.user.id) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Ride request not found' });
    }
    res.json(request);
  })
);

// Cancel while valid (REQUESTED or MATCHED only)
router.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const updated = await poolService.cancelRequest({ userId: req.user.id, role: 'passenger', requestId: req.params.id });
    res.json(updated);
  })
);

module.exports = router;
