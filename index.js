import express from 'express';
import { GoogleGenAI } from '@google/generative-ai';

// 1. Initialize Express and GoogleGenAI
const app = express();
// Railway provides the PORT env var
const port = process.env.PORT || 3000;
// Railway will provide the GEMINI_API_KEY
const ai = new GoogleGenAI(process.env.GEMINI_API_KEY);

// 2. Middleware to parse JSON requests
app.use(express.json());

// 3. Define the API endpoint for prompts
app.post('/prompt', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    res.json({ response: text });

  } catch (error) {
    console.error('Error processing prompt:', error);
    res.status(500).json({ error: 'Failed to generate content from AI' });
  }
});

// 4. A simple "Hello World" route for the main page
app.get('/', (req, res) => {
  res.send('AI Server is running on Railway!');
});

// 5. Start the server
app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
