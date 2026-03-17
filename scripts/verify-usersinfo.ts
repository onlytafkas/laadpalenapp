import 'dotenv/config';
import { Pool } from 'pg';

let connectionString = process.env.DATABASE_URL!;
if (!connectionString.includes('sslmode=')) {
  connectionString += connectionString.includes('?') ? '&sslmode=verify-full' : '?sslmode=verify-full';
}

const pool = new Pool({ connectionString });

async function verifyTable() {
  const client = await pool.connect();
  try {
    console.log('Verifying usersinfo table creation...\n');
    
    // Check if table exists
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'usersinfo'
      );
    `);
    
    if (!tableExists.rows[0].exists) {
      console.error('❌ usersinfo table does not exist');
      process.exit(1);
    }
    
    console.log('✓ usersinfo table exists');
    
    // Get table structure
    const columns = await client.query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable, 
        column_default
      FROM information_schema.columns 
      WHERE table_name = 'usersinfo'
      ORDER BY ordinal_position;
    `);
    
    console.log('\nTable structure:');
    console.table(columns.rows);
    
    // Check constraints
    const constraints = await client.query(`
      SELECT 
        constraint_name,
        constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'usersinfo';
    `);
    
    console.log('\nConstraints:');
    console.table(constraints.rows);
    
    // Check relations with sessions table
    const sessionUserIdColumn = await client.query(`
      SELECT 
        column_name,
        data_type
      FROM information_schema.columns
      WHERE table_name = 'sessions' AND column_name = 'user_id';
    `);
    
    console.log('\nSessions table user_id column:');
    console.table(sessionUserIdColumn.rows);
    
    console.log('\n✅ Verification complete!');
    console.log('\nNote: Foreign key constraint from sessions to usersinfo is NOT active.');
    console.log('This allows sessions to exist without corresponding usersinfo records.');
    console.log('To add the constraint later, run:');
    console.log('ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_usersinfo_user_id_fk"');
    console.log('  FOREIGN KEY ("user_id") REFERENCES "public"."usersinfo"("user_id")');
    console.log('  ON DELETE no action ON UPDATE no action;');
    
  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

verifyTable();
