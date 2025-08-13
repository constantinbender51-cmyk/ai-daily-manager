import express from 'express';
// Change the import to the new package name
import { GoogleGenerativeAI } from '@google/generative-ai';

// 1. Initialize Express and GoogleGenerativeAI
const app = express();
const port = process.env.PORT || 3000;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY); // API key from Railway secrets

// 2. Middleware to parse JSON requests
app.use(express.json());

// 3. Define the API endpoint for prompts
app.post('/prompt', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Get the generative model
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Generate content
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Send the AI's response back
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
