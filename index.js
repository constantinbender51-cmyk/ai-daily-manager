import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai'; // Add AI SDK back
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import fs from 'fs/promises'; // Add File System back

// --- Basic Setup ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;
const scheduleFilePath = path.join(__dirname, 'schedule.json');

// --- Database Setup ---
if (!process.env.DATABASE_URL) {
    console.error("FATAL: DATABASE_URL environment variable is not set.");
    process.exit(1);
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function setupDatabase() { /* ... (This function is unchanged) ... */ }

// --- File System Functions ---
async function readSchedule() {
    try {
        const data = await fs.readFile(scheduleFilePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') return [];
        console.error("Error reading schedule file:", error);
        return [];
    }
}
async function writeSchedule(data) {
    try {
        const jsonString = JSON.stringify(data, null, 2);
        await fs.writeFile(scheduleFilePath, jsonString, 'utf8');
    } catch (error) {
        console.error("Error writing to schedule file:", error);
    }
}

// --- AI and Express Middleware ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
app.use(express.json());

// --- API Endpoints ---
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

// A **SIMPLE** /prompt endpoint for testing
app.post('/prompt', async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    try {
        // Just a basic AI conversation for now, no file system logic
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(`User prompt: "${prompt}". Respond conversationally.`);
        const response = await result.response;
        const aiText = response.text();
        res.json({ response: aiText });
    } catch (error) {
        console.error("Error communicating with AI:", error);
        res.status(500).json({ error: 'Failed to get response from AI' });
    }
});

// --- Frontend Route ---
app.get('/', (req, res) => {
    // Serve the full HTML file again
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- Start Server ---
app.listen(port, async () => {
    console.log(`Server is listening on port ${port}.`);
    await setupDatabase();
});
           
