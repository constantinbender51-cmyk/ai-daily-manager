import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

// --- Basic Setup ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// --- Database Setup ---
// **FIX 1: Add a check for the DATABASE_URL**
if (!process.env.DATABASE_URL) {
    console.error("FATAL: DATABASE_URL environment variable is not set.");
    process.exit(1); // Exit the application if the database URL is not found
}

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    // **FIX 2: Railway's PostgreSQL does not require SSL for internal connections**
    // We can remove the SSL config block as Railway handles it.
    // If you were connecting from an external machine, you would need it.
});

async function setupDatabase() {
    let client; // Define client outside the try block
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
        // If setup fails, we should probably exit to avoid running in a broken state.
        process.exit(1);
    } finally {
        if (client) {
            client.release(); // Ensure client is released only if it was connected
        }
    }
}

// --- AI and Express Middleware ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
app.use(express.json());

// --- API Endpoint (with Memory) ---
app.post('/prompt', async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
    }

    let client;
    try {
        client = await pool.connect();
        const historyResult = await client.query(
            'SELECT role, content as text FROM conversations ORDER BY created_at DESC LIMIT 20'
        );
            
        // The Gemini API expects roles as 'user' and 'model'. Let's format the history.
        const history = historyResult.rows.reverse().map(row => ({
            role: row.role,
            parts: [{ text: row.text }]
        }));

        await client.query('INSERT INTO conversations (role, content) VALUES ($1, $2)', ['user', prompt]);

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const chat = model.startChat({ history: history });
        const result = await chat.sendMessage(prompt);
        const response = await result.response;
        const aiText = response.text();

        await client.query('INSERT INTO conversations (role, content) VALUES ($1, $2)', ['model', aiText]);

        res.json({ response: aiText });

    } catch (error) {
        console.error('Error processing prompt with memory:', error);
        res.status(500).json({ error: 'Failed to process request' });
    } finally {
        if (client) {
            client.release();
        }
    }
});

// --- Frontend Routes ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- Start Server ---
// **FIX 3: Move the database setup to be called AFTER the server starts listening.**
// This gives Railway time to inject the environment variables properly.
app.listen(port, async () => {
    console.log(`Server is listening on port ${port}`);
    // Now that the server is running, set up the database.
    await setupDatabase();
});
