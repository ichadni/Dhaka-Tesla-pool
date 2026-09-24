const { pool } = require('../config/db');

async function findByDriverId(driverId) {
  const [rows] = await pool.query('SELECT * FROM teslas WHERE driver_id = ?', [driverId]);
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM teslas WHERE id = ?', [id]);
  return rows[0] || null;
}

async function setStatus(id, status) {
  await pool.query('UPDATE teslas SET status = ? WHERE id = ?', [status, id]);
  return findById(id);
}

module.exports = { findByDriverId, findById, setStatus };
