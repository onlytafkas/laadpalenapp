import 'dotenv/config';
import { Pool } from 'pg';

let connectionString = process.env.DATABASE_URL!;
if (!connectionString.includes('sslmode=')) {
  connectionString += connectionString.includes('?') ? '&sslmode=verify-full' : '?sslmode=verify-full';
}

const pool = new Pool({ connectionString });

async function verifyActiveField() {
  const client = await pool.connect();
  try {
    console.log('Checking usersinfo table structure...\n');
    
    // Check column information
    const columnsResult = await client.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'usersinfo'
      ORDER BY ordinal_position;
    `);
    
    console.log('Columns in usersinfo table:');
    console.table(columnsResult.rows);
    
    // Check if there are any users
    const usersResult = await client.query('SELECT * FROM usersinfo LIMIT 5;');
    console.log(`\nFound ${usersResult.rows.length} users in the database`);
    if (usersResult.rows.length > 0) {
      console.table(usersResult.rows);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

verifyActiveField();
