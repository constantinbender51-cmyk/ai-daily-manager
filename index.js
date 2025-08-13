import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import fs from 'fs/promises'; // **STEP 1: IMPORT THE FILE SYSTEM MODULE**

// --- Basic Setup ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;
const scheduleFilePath = path.join(__dirname, 'schedule.json'); // Path to our new file

// --- AI Persona Definition ---
const systemPrompt = `You are a highly efficient personal assistant...`; // Unchanged for now

// --- Database Setup ---
if (!process.env.DATABASE_URL) { /* ... */ }
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
async function setupDatabase() { /* ... */ }

// **STEP 2: ADD HELPER FUNCTIONS FOR READING/WRITING THE SCHEDULE**

/**
 * Reads and parses the schedule.json file.
 * @returns {Promise<Array>} A promise that resolves to the array of tasks.
 */
async function readSchedule() {
    try {
        const data = await fs.readFile(scheduleFilePath, 'utf8');
        return JSON.parse(data); // Convert the file content from text to a JSON object
    } catch (error) {
        // If the file doesn't exist or is empty, it's not an error, just return an empty schedule.
        if (error.code === 'ENOENT') {
            return [];
        }
        // For other errors, log them.
        console.error("Error reading schedule file:", error);
        return []; // Return empty array on error
    }
}

/**
 * Writes an array of tasks to the schedule.json file.
 * @param {Array} data The array of tasks to write.
 * @returns {Promise<void>}
 */
async function writeSchedule(data) {
    try {
        // Convert the JSON object to a nicely formatted string with 2-space indentation
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
// (All endpoints like /history and /prompt remain unchanged for now)
app.get('/history', async (req, res) => { /* ... */ });
app.post('/prompt', async (req, res) => { /* ... */ });


// --- Frontend Routes ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- Start Server ---
app.listen(port, async () => {
    console.log(`Server is listening on port ${port}`);
    await setupDatabase();
});
