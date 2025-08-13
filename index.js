import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path'; // Import the 'path' module
import { fileURLToPath } from 'url'; // Import the 'url' module

// Recreate __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Initialize Express and GoogleGenerativeAI
const app = express();
const port = process.env.PORT || 3000;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 2. Middleware
app.use(express.json()); // For parsing JSON
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files (we'll use this later)

// 3. API endpoint for prompts (no changes here)
app.post('/prompt', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    res.json({ response: text });
  } catch (error) {
    console.error('Error processing prompt:', error);
    res.status(500).json({ error: 'Failed to generate content from AI' });
  }
});

// 4. Serve the index.html file for the root URL
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 5. Start the server
app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
