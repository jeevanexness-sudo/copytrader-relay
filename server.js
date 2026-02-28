// ============================================================
//  CopyTrader Relay Server  v2.0
//  Client API Keys with Names
//  Deploy: Railway.app (FREE)
//
//  New client add cheyyadaniki:
//  CLIENTS lo oka line add cheyyi → GitHub push → Done!
//  Format: "APIKEY": "ClientName"
// ============================================================

const express = require('express');
const app     = express();
app.use(express.json());

// ============================================================
//  👇 CLIENTS — Add / Remove clients here!
// ============================================================
const CLIENTS = {
  "JEEVAN123":  "Jeevan",
  "RAVI123":    "Ravi",
  "SURESH123":  "Suresh",
  "PRIYA123":   "Priya",
  // New client add cheyyadaniki:
  // "CLIENTNAME123": "ClientName",
};
// ============================================================

// In-memory store
const store = {};

// ── Auth middleware ──────────────────────────────────────────
function getClient(key) {
  return CLIENTS[key] || null;
}

function checkKey(req, res, next) {
  const key    = req.query.key;
  const client = getClient(key);
  if (!client) {
    console.log(`❌ Invalid key: ${key}`);
    return res.status(401).json({ error: "Invalid API key" });
  }
  req.clientName = client;
  req.clientKey  = key;
  next();
}

// ── MASTER → POST /push ──────────────────────────────────────
app.post('/push', checkKey, (req, res) => {
  const id     = req.query.id;
  const client = req.clientName;
  if (!id) return res.status(400).json({ error: "Missing id" });

  const data = req.body;
  if (!data) return res.status(400).json({ error: "Invalid body" });

  store[id] = {
    equity:     data.equity  || 0,
    balance:    data.balance || 0,
    time:       data.time    || Math.floor(Date.now()/1000),
    trades:     data.trades  || [],
    clientName: client,
    clientKey:  req.clientKey
  };

  const count = store[id].trades.length;
  console.log(`[PUSH] Client=${client} | ID=${id} | Trades=${count} | Equity=${data.equity}`);
  res.json({ ok: true, client: client, received: count });
});

// ── SLAVE → GET /pull ────────────────────────────────────────
app.get('/pull', checkKey, (req, res) => {
  const id     = req.query.id;
  const client = req.clientName;
  if (!id) return res.status(400).json({ error: "Missing id" });

  const data = store[id];

  // Security: slave key must match master key
  if (data && data.clientKey !== req.clientKey) {
    console.log(`❌ Key mismatch! Client=${client} tried ID=${id}`);
    return res.status(403).json({ error: "Key mismatch for this Master ID" });
  }

  if (!data) {
    return res.json({ equity: 0, balance: 0, time: 0, trades: [] });
  }

  console.log(`[PULL] Client=${client} | ID=${id} | Trades=${data.trades.length}`);
  res.json(data);
});

// ── Status Dashboard ─────────────────────────────────────────
app.get('/', (req, res) => {
  const masters = {};
  const now     = Math.floor(Date.now()/1000);

  for (const [id, data] of Object.entries(store)) {
    const age = now - data.time;
    masters[id] = {
      client:      data.clientName,
      trades:      data.trades.length,
      equity:      data.equity,
      balance:     data.balance,
      last_update: `${age}s ago`,
      status:      age < 30 ? "🟢 ONLINE" : "🔴 OFFLINE"
    };
  }

  res.json({
    server:        "CopyTrader Relay v2.0",
    total_masters: Object.keys(masters).length,
    total_clients: Object.keys(CLIENTS).length,
    masters:       masters,
    uptime:        `${Math.floor(process.uptime())}s`
  });
});

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ CopyTrader Server v2.0 on port ${PORT}`);
  console.log(`👥 Registered clients: ${Object.keys(CLIENTS).length}`);
  Object.entries(CLIENTS).forEach(([key, name]) => {
    console.log(`   → ${name} | Key: ${key}`);
  });
});
