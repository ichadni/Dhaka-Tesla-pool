const { pool } = require('../config/db');

async function all() {
  const [rows] = await pool.query('SELECT * FROM zones ORDER BY name');
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM zones WHERE id = ?', [id]);
  return rows[0] || null;
}

module.exports = { all, findById };
