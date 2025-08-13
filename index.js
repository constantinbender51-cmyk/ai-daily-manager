import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg'; // Add pg back

// --- Basic Setup ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;

console.log("Script started. Setting up database connection...");

// --- Database Setup ---
if (!process.env.DATABASE_URL) {
    console.error("FATAL: DATABASE_URL environment variable is not set.");
    process.exit(1);
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function setupDatabase() {
    let client;
    try {
        client = await pool.connect();
        await client.query(`
            CREATE TABLE IF NOT EXISTS conversations (
                id SERIAL PRIMARY KEY,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Database table "conversations" is ready.');
    } catch (err) {
        console.error('Error setting up database table:', err);
        process.exit(1);
    } finally {
        if (client) client.release();
    }
}

// --- A simple root route ---
app.get('/', (req, res) => {
  res.send('Server is running. Database connection has been established.');
});

// --- Start Server ---
app.listen(port, async () => {
  console.log(`Server is listening on port ${port}.`);
  // Set up the database after the server starts listening
  await setupDatabase();
});

console.log("Script end. Waiting for server to listen.");
