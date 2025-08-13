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

// --- AI Persona Definition (NEW VERSION) ---
const systemPrompt = `
    You are a hyper-efficient scheduling assistant. Your entire world is a single JSON file that represents the user's schedule.
    Your primary function is to manage this schedule file.

    **RULES:**
    1.  **Analyze User Intent:** When the user sends a prompt, determine if they want to READ the schedule, ADD a task, UPDATE a task, or REMOVE a task.
    2.  **READ Operations:** If the user asks what's on their schedule, summarize the contents of the JSON schedule provided to you. Do NOT add, update, or remove anything.
    3.  **WRITE Operations (ADD/UPDATE/REMOVE):** If the user wants to change the schedule, your ONLY output should be the **complete, updated JSON array** of schedule items. Do not include any other text, explanations, or markdown. Just the raw JSON.
        - For ADD operations, add a new object to the array. A new task must have an 'id' (a unique number), 'task' (description), 'startTime' (in ISO 8601 format, e.g., 2025-08-13T14:00:00Z), and a 'status' of 'pending'.
        - For UPDATE operations, modify the existing item in the array.
        - For REMOVE operations, delete the item from the array.
    4.  **Conversation:** If the user is just chatting (e.g., "hello"), respond conversationally without modifying the schedule.
`;

// --- Database & File System Functions (Unchanged) ---
if (!process.env.DATABASE_URL) { /* ... */ }
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
async function setupDatabase() { /* ... */ }
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
app.get('/history', async (req, res) => { /* ... (unchanged) */ });

// **MODIFIED /prompt ENDPOINT**
app.post('/prompt', async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    let client;
    try {
        client = await pool.connect();
        // 1. Save user prompt to conversation history (for context)
        await client.query('INSERT INTO conversations (role, content) VALUES ($1, $2)', ['user', prompt]);

        // 2. Read the current schedule from the file
        const currentSchedule = await readSchedule();
        const scheduleAsText = JSON.stringify(currentSchedule, null, 2);

        // 3. Construct the prompt for the AI, including the current schedule
        const promptForAI = `
            This is the current schedule:
            ${scheduleAsText}

            User's request: "${prompt}"

            Now, follow your rules precisely.
        `;

        // 4. Interact with Gemini
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            systemInstruction: systemPrompt,
        });
        const result = await model.generateContent(promptForAI);
        const response = await result.response;
        let aiText = response.text();

        // 5. Check if the AI's response is a new schedule
        try {
            // A simple check: if the response starts with '[' and ends with ']', it's likely a JSON array.
            const cleanedText = aiText.trim();
            if (cleanedText.startsWith('[') && cleanedText.endsWith(']')) {
                const newSchedule = JSON.parse(cleanedText);
                await writeSchedule(newSchedule); // Write the new schedule to the file
                console.log("AI provided a new schedule. File updated.");
                // Provide a user-friendly confirmation message instead of showing the raw JSON.
                aiText = "I have updated the schedule as requested.";
            }
        } catch (e) {
            // The AI's response was not valid JSON, so we treat it as a regular chat message.
            console.log("AI response was not a schedule update. Treating as a chat message.");
        }

        // 6. Save the final AI response to conversation history
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
app.get('/', (req, res) => { /* ... */ });
app.listen(port, async () => { /* ... */ });
