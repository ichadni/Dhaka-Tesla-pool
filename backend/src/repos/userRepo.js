const { pool } = require('../config/db');

async function findByPhone(phone) {
  const [rows] = await pool.query('SELECT * FROM users WHERE phone = ?', [phone]);
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
  return rows[0] || null;
}

async function create({ name, phone, email, passwordHash, role }) {
  const [result] = await pool.query(
    'INSERT INTO users (name, phone, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
    [name, phone, email || null, passwordHash, role]
  );
  return findById(result.insertId);
}

module.exports = { findByPhone, findById, create };
