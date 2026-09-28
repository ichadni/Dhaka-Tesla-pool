const fs = require('fs');
const mysql = require('mysql2/promise');

// A single shared connection pool. mysql2's pool gives us real MySQL
// row-level locking (SELECT ... FOR UPDATE) inside transactions, which is
// how we solve the seat-capacity race condition — see services/poolService.js.
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'dhaka_tesla_pool',

  ssl: {
  ca: fs.readFileSync('/app/certs/ca.pem'),
  rejectUnauthorized: true
},

  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
});

async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, withTransaction };
