import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Basic Setup ONLY ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;

console.log("Script started. Setting up routes...");

// --- A simple root route ---
app.get('/', (req, res) => {
  // For now, just send a simple message to prove the server is running.
  res.send('Server is in Safe Mode. The core Express app is working.');
});

// --- Start Server ---
app.listen(port, () => {
  // This message will only appear if the server starts successfully.
  console.log(`Server is listening on port ${port}. Safe Mode is active.`);
});

console.log("Script end. Waiting for server to listen.");
