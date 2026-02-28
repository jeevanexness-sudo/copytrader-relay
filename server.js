// ============================================================
//  CopyTrader Relay Server  — Node.js + Express
//  Free hosting: Railway.app / Render.com / Fly.io
//  
//  Install: npm install express
//  Run:     node server.js
//  Deploy:  Push to Railway/Render — FREE!
// ============================================================

const express = require('express');
const app     = express();

app.use(express.json());

// In-memory store (per MasterID)
// { "MASTER_01": { equity, balance, time, trades: [...] } }
const store = {};

// ── Security middleware ──────────────────────────────────────
const VALID_KEYS = ["secret123"]; // EA lo ApiKey tho same!
                                   // Multiple slaves aithe same key share cheyachu

function checkKey(req, res, next) {
  const key = req.query.key;
  if (!key || !VALID_KEYS.includes(key)) {
    return res.status(401).json({ error: "Invalid API key" });
  }
  next();
}

// ── MASTER → POST /push ──────────────────────────────────────
// Master trades ikkadi POST chestadu
app.post('/push', checkKey, (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: "Missing id" });

  const data = req.body;
  if (!data || typeof data !== 'object') 
    return res.status(400).json({ error: "Invalid JSON body" });

  store[id] = {
    equity:  data.equity  || 0,
    balance: data.balance || 0,
    time:    data.time    || Math.floor(Date.now()/1000),
    trades:  data.trades  || []
  };

  const tradeCount = store[id].trades.length;
  console.log(`[PUSH] ID=${id} | Trades=${tradeCount} | Equity=${data.equity}`);
  res.json({ ok: true, received: tradeCount });
});

// ── SLAVE → GET /pull ────────────────────────────────────────
// Slave ikkad GET chesukuntadu
app.get('/pull', checkKey, (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: "Missing id" });

  const data = store[id];
  if (!data) {
    // Master inka push cheyyadhu — empty return
    return res.json({ equity: 0, balance: 0, time: 0, trades: [] });
  }

  console.log(`[PULL] ID=${id} | Trades=${data.trades.length}`);
  res.json(data);
});

// ── Status page ──────────────────────────────────────────────
app.get('/', (req, res) => {
  const status = {};
  for (const [id, data] of Object.entries(store)) {
    const age = Math.floor(Date.now()/1000) - data.time;
    status[id] = {
      trades:      data.trades.length,
      equity:      data.equity,
      last_update: `${age}s ago`,
      online:      age < 30
    };
  }
  res.json({
    server:  "CopyTrader Relay v1.0",
    masters: status,
    uptime:  `${Math.floor(process.uptime())}s`
  });
});

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ CopyTrader Server running on port ${PORT}`);
  console.log(`   Push: POST /push?id=MASTER_01&key=secret123`);
  console.log(`   Pull: GET  /pull?id=MASTER_01&key=secret123`);
});
