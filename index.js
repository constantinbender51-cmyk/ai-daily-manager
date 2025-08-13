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

// --- AI Persona Definition ---
const systemPrompt = `
    You are a highly efficient personal assistant. Your primary goal is to help me manage my daily activities.
    Key responsibilities:
    1.  Create, display, and adjust my daily schedule based on my requests.
    2.  When I ask for my schedule, present it in a clear, easy-to-read format (like a list).
    3.  Remember all our previous conversations to maintain context about my tasks and appointments.
    4.  If I ask you to add something to the schedule, confirm that you have added it.
    5.  Be proactive. For example, if I add a meeting, you can ask if I need a reminder.
    Your tone should be professional, concise, and helpful.
`;

// --- Database Setup ---
if (!process.env.DATABASE_URL) {
    console.error("FATAL: DATABASE_URL environment variable is not set.");
    process.exit(1);
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function setupDatabase() {
    // ... (database setup code is unchanged)
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

// --- AI and Express Middleware ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
app.use(express.json());

// --- API Endpoints ---

// **NEW ENDPOINT TO GET CHAT HISTORY**
app.get('/history', async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const result = await client.query('SELECT role, content FROM conversations ORDER BY created_at ASC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ error: 'Failed to fetch history' });
    } finally {
        if (client) client.release();
    }
});

app.post('/prompt', async (req, res) => {
    // ... (prompt endpoint code is unchanged)
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    let client;
    try {
        client = await pool.connect();
        const historyResult = await client.query(
            'SELECT role, content as text FROM conversations ORDER BY created_at DESC LIMIT 20'
        );
        const history = historyResult.rows.reverse().map(row => ({
            role: row.role,
            parts: [{ text: row.text }]
        }));

        await client.query('INSERT INTO conversations (role, content) VALUES ($1, $2)', ['user', prompt]);

        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            systemInstruction: systemPrompt,
        });

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
        if (client) client.release();
    }
});

// --- Frontend Routes ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- Start Server ---
app.listen(port, async () => {
    console.log(`Server is listening on port ${port}`);
    await setupDatabase();
});
