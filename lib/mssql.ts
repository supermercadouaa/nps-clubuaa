// eslint-disable-next-line @typescript-eslint/no-require-imports
const mssql = require('mssql');

const config = {
  server: process.env.MSSQL_SERVER!,
  database: process.env.MSSQL_DATABASE!,
  user: process.env.MSSQL_USER!,
  password: process.env.MSSQL_PASSWORD!,
  port: parseInt(process.env.MSSQL_PORT ?? '1433'),
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  connectionTimeout: 30000,
  requestTimeout: 30000,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pool: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getPool(): Promise<any> {
  if (!pool || !pool.connected) {
    pool = await mssql.connect(config);
  }
  return pool;
}
