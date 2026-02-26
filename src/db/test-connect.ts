import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not found in environment');
}

const sql = neon(process.env.DATABASE_URL);

async function testConnection() {
  try {
    console.log('正在嘗試連接到 Neon...');
    const result = await sql`SELECT 1 as test`;
    console.log('連線測試成功！', result[0].test);
  } catch (error) {
    console.error('連線測試失敗：', error);
  }
}

testConnection();
