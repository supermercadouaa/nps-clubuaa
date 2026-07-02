import { createPool } from 'mysql2/promise';

const pool = createPool({
  host: process.env.MYSQL_HOST,
  port: parseInt(process.env.MYSQL_PORT ?? '3306'),
  database: process.env.MYSQL_DB,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  connectionLimit: 5,
  waitForConnections: true,
  connectTimeout: 20000,
});

export default pool;
