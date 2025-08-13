import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg'; // Import the pg library

// --- Basic Setup ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// --- Database Setup ---
// Railway provides the DATABASE_URL automatically
const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Required for Railway connections
    }
});

// Function to create the database table if it doesn't exist
async function setupDatabase() {
    const client = await pool.connect();
    try {
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
    } finally {
        client.release();
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

    const client = await pool.connect();
    try {
        // 1. Load recent conversation history from DB
        const historyResult = await client.query(
            'SELECT role, content FROM conversations ORDER BY created_at DESC LIMIT 20'
        );
        const history = historyResult.rows.reverse().map(row => ({
            role: row.role,
            parts: [{ text: row.content }]
        }));

        // 2. Save the new user prompt to the DB
        await client.query('INSERT INTO conversations (role, content) VALUES ($1, $2)', ['user', prompt]);

        // 3. Interact with Gemini, providing the history
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const chat = model.startChat({ history: history });
        const result = await chat.sendMessage(prompt);
        const response = await result.response;
        const aiText = response.text();

        // 4. Save the AI's response to the DB
        await client.query('INSERT INTO conversations (role, content) VALUES ($1, $2)', ['model', aiText]);

        res.json({ response: aiText });

    } catch (error) {
        console.error('Error processing prompt with memory:', error);
        res.status(500).json({ error: 'Failed to process request' });
    } finally {
        client.release();
    }
});

// --- Frontend Routes ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- Start Server ---
app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
    // Set up the database table when the server starts
    setupDatabase();
});
