import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import fs from 'fs/promises';

// --- Basic Setup ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;
const scheduleFilePath = path.join(__dirname, 'schedule.json');

// --- AI Persona Definition (SIMPLIFIED VERSION) ---
// Defined as a single string literal to avoid multi-line issues
const systemPrompt = `You are a hyper-efficient scheduling assistant. Your entire world is a single JSON file that represents the user's schedule. Your primary function is to manage this schedule file. RULES: 1. Analyze User Intent: When the user sends a prompt, determine if they want to READ the schedule, ADD a task, UPDATE a task, or REMOVE a task. 2. READ Operations: If the user asks what's on their schedule, summarize the contents of the JSON schedule provided to you. Do NOT add, update, or remove anything. 3. WRITE Operations (ADD/UPDATE/REMOVE): If the user wants to change the schedule, your ONLY output should be the complete, updated JSON array of schedule items. Do not include any other text, explanations, or markdown. Just the raw JSON. - For ADD operations, add a new object to the array. A new task must have an 'id' (a unique number), 'task' (description), 'startTime' (in ISO 8601 format, e.g., 2025-08-13T14:00:00Z), and a 'status' of 'pending'. - For UPDATE operations, modify the existing item in the array. - For REMOVE operations, delete the item from the array. 4. Conversation: If the user is just chatting (e.g., "hello"), respond conversationally without modifying the schedule.`;

// --- Database & File System Functions (Unchanged) ---
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

app.post('/prompt', async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    let client;
    try {
        client = await pool.connect();
        await client.query('INSERT INTO conversations (role, content) VALUES ($1, $2)', ['user', prompt]);

        const currentSchedule = await readSchedule();
        const scheduleAsText = JSON.stringify(currentSchedule, null, 2);

        const promptForAI = `
            This is the current schedule:
            ${scheduleAsText}

            User's request: "${prompt}"

            Now, follow your rules precisely.
        `;

        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            systemInstruction: { parts: [{ text: systemPrompt }] }, // Pass as parts array
        });
        const result = await model.generateContent(promptForAI);
        const response = await result.response;
        let aiText = response.text();

        try {
            const cleanedText = aiText.trim();
            if (cleanedText.startsWith('[') && cleanedText.endsWith(']')) {
                const newSchedule = JSON.parse(cleanedText);
                await writeSchedule(newSchedule);
                console.log("AI provided a new schedule. File updated.");
                aiText = "I have updated the schedule as requested.";
            }
        } catch (e) {
            console.log("AI response was not a schedule update. Treating as a chat message.");
        }

        await client.query('INSERT INTO conversations (role, content) VALUES ($1, $2)', ['model', aiText]);

        res.json({ response: aiText });

    } catch (error) {
        console.error('Error processing prompt:', error);
        res.status(500).json({ error: 'Failed to process request' });
    } finally {
        if (client) client.release();
    }
});

// --- Frontend Routes & Server Start (Unchanged) ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, async () => {
    console.log(`Server is listening on port ${port}`);
    await setupDatabase();
});
