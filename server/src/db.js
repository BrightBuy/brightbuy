import mysql from 'mysql2/promise';
// Reuse one pool per process. Routes receive this pool from createApp().
export const db = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.MYSQL_DATABASE,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
  timezone: 'Z',
  // Keep DECIMAL money values as strings to avoid floating-point rounding.
  decimalNumbers: false,
});
