const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const userRepo = require('../repos/userRepo');
const teslaRepo = require('../repos/teslaRepo');
const { pool } = require('../config/db');
const { signToken } = require('../utils/jwt');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

const signupSchema = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().min(6).max(20),
  email: z.string().email().optional().nullable(),
  password: z.string().min(6).max(100),
  role: z.enum(['passenger', 'driver']),
  teslaName: z.string().min(1).max(50).optional(), // required if role === driver
  teslaCapacity: z.number().int().min(1).max(6).optional(),
});

router.post(
  '/signup',
  asyncHandler(async (req, res) => {
    const data = signupSchema.parse(req.body);
    if (data.role === 'driver' && !data.teslaName) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'teslaName is required for driver signup' });
    }
    const existing = await userRepo.findByPhone(data.phone);
    if (existing) return res.status(409).json({ error: 'PHONE_TAKEN', message: 'Phone already registered' });

    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await userRepo.create({
      name: data.name,
      phone: data.phone,
      email: data.email,
      passwordHash,
      role: data.role,
    });

    if (data.role === 'driver') {
      await pool.query('INSERT INTO teslas (driver_id, name, capacity, status) VALUES (?, ?, ?, ?)', [
        user.id,
        data.teslaName,
        data.teslaCapacity || 3,
        'OFFLINE',
      ]);
    }

    const token = signToken(user);
    res.status(201).json({ token, user: sanitize(user) });
  })
);

const signinSchema = z.object({
  phone: z.string().min(6),
  password: z.string().min(1),
});

router.post(
  '/signin',
  asyncHandler(async (req, res) => {
    const data = signinSchema.parse(req.body);
    const user = await userRepo.findByPhone(data.phone);
    if (!user) return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Wrong phone or password' });
    const ok = await bcrypt.compare(data.password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Wrong phone or password' });

    const token = signToken(user);
    let tesla = null;
    if (user.role === 'driver') tesla = await teslaRepo.findByDriverId(user.id);
    res.json({ token, user: sanitize(user), tesla });
  })
);

function sanitize(user) {
  const { password_hash, ...rest } = user;
  return rest;
}

module.exports = router;
