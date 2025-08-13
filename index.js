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

// --- AI Persona Definition ---
const systemPrompt = `You are a hyper-efficient scheduling assistant. Your entire world is a single JSON file that represents the user's schedule. Your primary function is to manage this schedule file. RULES: 1. Analyze User Intent: When the user sends a prompt, determine if they want to READ the schedule, ADD a task, UPDATE a task, or REMOVE a task. 2. READ Operations: If the user asks what's on their schedule, summarize the contents of the JSON schedule provided to you. Do NOT add, update, or remove anything. 3. WRITE Operations (ADD/UPDATE/REMOVE): If the user wants to change the schedule, your ONLY output should be the complete, updated JSON array of schedule items. Do not include any other text, explanations, or markdown. Just the raw JSON. A new task must have an 'id' (a unique number), 'task' (description), 'startTime' (in ISO 8601 format, e.g., 2025-08-13T14:00:00Z), and a 'status' of 'pending'. 4. Conversation: If the user is just chatting (e.g., "hello"), respond conversationally without modifying the schedule.`;

// --- Database & File System Functions (Unchanged) ---
if (!process.env.DATABASE_URL) { /* ... */ }
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
async function setupDatabase() { /* ... */ }
async function readSchedule() { /* ... */ }
async function writeSchedule(data) { /* ... */ }

// --- AI and Express Middleware ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
app.use(express.json());

// --- API Endpoints ---
app.get('/history', async (req, res) => { /* ... (Unchanged) ... */ });

// **THE FINAL, CORRECTED /prompt ENDPOINT**
app.post('/prompt', async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    let client;
    try {
        client = await pool.connect();
        await client.query('INSERT INTO conversations (role, content) VALUES ($1, $2)', ['user', prompt]);

        const currentSchedule = await readSchedule();
        const scheduleAsText = JSON.stringify(currentSchedule, null, 2);
        const contextMessage = `This is the current schedule: ${scheduleAsText}. Now, process the following user request: "${prompt}"`;

        const historyResult = await client.query(
            'SELECT role, content as text FROM conversations ORDER BY created_at DESC LIMIT 10'
        );
        let history = historyResult.rows.reverse().map(row => ({
            role: row.role,
            parts: [{ text: row.text }]
        }));

        // =================================================================
        // **THE FIX: Ensure the history starts with a 'user' role.**
        // Find the index of the first 'user' message.
        const firstUserIndex = history.findIndex(msg => msg.role === 'user');

        // If a 'user' message is found, slice the array from that point.
        // Otherwise, start with an empty history to avoid the error.
        if (firstUserIndex > -1) {
            history = history.slice(firstUserIndex);
        } else {
            history = [];
        }
        // =================================================================

        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            systemInstruction: { parts: [{ text: systemPrompt }] },
        });

        const chat = model.startChat({ history: history });
        const result = await chat.sendMessage(contextMessage);
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

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });
app.listen(port, async () => {
    console.log(`Server is listening on port ${port}.`);
    await setupDatabase();
});
