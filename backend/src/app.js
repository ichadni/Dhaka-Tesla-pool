const express = require('express');
const cors = require('cors');
const errorHandler = require('./middleware/errorHandler');
const authRoutes = require('./routes/authRoutes');
const zoneRoutes = require('./routes/zoneRoutes');
const rideRoutes = require('./routes/rideRoutes');
const driverRoutes = require('./routes/driverRoutes');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'dhaka-tesla-pool-api' }));

app.use('/api/auth', authRoutes);
app.use('/api/zones', zoneRoutes);
app.use('/api/rides', rideRoutes); // passenger-facing
app.use('/api/driver', driverRoutes); // driver-facing

app.use((req, res) => res.status(404).json({ error: 'NOT_FOUND', message: 'No such route' }));

// zod validation errors -> 400 instead of falling through to 500
app.use((err, req, res, next) => {
  if (err && err.name === 'ZodError') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: err.errors.map((e) => e.message).join('; ') });
  }
  next(err);
});
app.use(errorHandler);

module.exports = app;
