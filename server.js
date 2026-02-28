// ============================================================
//  CopyTrader Relay Server  v5.1
//  Tamper-Proof Signed Key System
//  Supports: Days / Months / Custom Date expiry
//
//  Key Generator:
//  By Days:  /genkey?admin=JEEVAN&name=USHA&days=10
//  By Months:/genkey?admin=JEEVAN&name=USHA&months=1
//  By Date:  /genkey?admin=JEEVAN&name=USHA&expiry=20260331
// ============================================================

const express = require('express');
const crypto  = require('crypto');
const app     = express();
app.use(express.json());

// ============================================================
//  🔑 SECRET — Never share this!
// ============================================================
const SECRET     = "JEEVAN_SUPER_SECRET_2026_XYZ";
const ADMIN_PASS = "JEEVAN"; // /genkey?admin=JEEVAN
// ============================================================

const BLOCKED_KEYS = [];
const store        = {};

// ── Signature generate ───────────────────────────────────────
function generateSignature(name, dateStr) {
  const raw  = `${name}_${dateStr}_${SECRET}`;
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return hash.substring(0, 4).toUpperCase();
}

// ── Date helpers ─────────────────────────────────────────────
function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + parseInt(days));
  return d.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD
}

function addMonths(months) {
  const d = new Date();
  d.setMonth(d.getMonth() + parseInt(months));
  return d.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD
}

function formatDate(dateStr) {
  // YYYYMMDD → YYYY-MM-DD
  return `${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}`;
}

function daysLeft(expiryFormatted) {
  return Math.ceil((new Date(expiryFormatted) - new Date()) / (1000*60*60*24));
}

// ── Parse + Verify Key ───────────────────────────────────────
function parseKey(key) {
  const parts = key.split('_');
  if (parts.length < 3) return { error: "Invalid format. Use: NAME_YYYYMMDD_SIGN" };

  const signature = parts[parts.length - 1];
  const dateStr   = parts[parts.length - 2];
  const name      = parts.slice(0, parts.length - 2).join('_');

  if (!/^\d{8}$/.test(dateStr))
    return { error: "Invalid date in key" };

  // Tamper check
  const expectedSig = generateSignature(name, dateStr);
  if (signature.toUpperCase() !== expectedSig) {
    console.log(`🚨 TAMPERED! Key=${key} Expected=${expectedSig}`);
    return { error: "Tampered key detected! Contact admin." };
  }

  const expiry   = formatDate(dateStr);
  const today    = new Date().toISOString().split('T')[0];
  const left     = daysLeft(expiry);
  const valid    = today <= expiry;

  return { name, expiry, daysLeft: left, valid };
}

// ── Auth Middleware ──────────────────────────────────────────
function checkKey(req, res, next) {
  const key = req.query.key;
  if (!key) return res.status(401).json({ error: "API key required" });

  if (BLOCKED_KEYS.includes(key))
    return res.status(403).json({ error: "Key blocked. Contact admin." });

  const client = parseKey(key);
  if (client.error) return res.status(401).json({ error: client.error });

  if (!client.valid) {
    console.log(`⏰ Expired: ${client.name} | ${client.expiry}`);
    return res.status(403).json({
      error:   "License expired!",
      client:  client.name,
      expiry:  client.expiry,
      message: "Contact admin to renew"
    });
  }

  if (client.daysLeft <= 3)
    console.log(`⚠️ Expiring in ${client.daysLeft} day(s): ${client.name}`);

  req.client    = client;
  req.clientKey = key;
  next();
}

// ── MASTER → POST /push ──────────────────────────────────────
app.post('/push', checkKey, (req, res) => {
  const id   = req.query.id;
  const data = req.body;
  if (!id)   return res.status(400).json({ error: "Missing id" });
  if (!data) return res.status(400).json({ error: "Invalid body" });

  store[id] = {
    equity:     data.equity  || 0,
    balance:    data.balance || 0,
    time:       data.time    || Math.floor(Date.now()/1000),
    trades:     data.trades  || [],
    clientName: req.client.name,
    clientKey:  req.clientKey,
    expiry:     req.client.expiry,
    daysLeft:   req.client.daysLeft
  };

  console.log(`[PUSH] ${req.client.name} | ID=${id} | Trades=${store[id].trades.length} | ${req.client.daysLeft}d left`);
  res.json({ ok: true, client: req.client.name, received: store[id].trades.length, days_left: req.client.daysLeft });
});

// ── SLAVE → GET /pull ────────────────────────────────────────
app.get('/pull', checkKey, (req, res) => {
  const id   = req.query.id;
  if (!id) return res.status(400).json({ error: "Missing id" });

  const data = store[id];
  if (data && data.clientKey !== req.clientKey)
    return res.status(403).json({ error: "Key mismatch for this Master ID" });

  if (!data) return res.json({ equity:0, balance:0, time:0, trades:[] });

  console.log(`[PULL] ${req.client.name} | ID=${id} | Trades=${data.trades.length} | ${req.client.daysLeft}d left`);
  res.json(data);
});

// ── 🔑 Key Generator ─────────────────────────────────────────
// /genkey?admin=JEEVAN&name=USHA&days=10
// /genkey?admin=JEEVAN&name=USHA&months=1
// /genkey?admin=JEEVAN&name=USHA&expiry=20260331
app.get('/genkey', (req, res) => {
  const { admin, name, days, months, expiry } = req.query;

  if (admin !== ADMIN_PASS)
    return res.status(401).json({ error: "Admin access only" });

  if (!name)
    return res.status(400).json({ error: "name required" });

  // Calculate expiry date
  let dateStr = '';
  let mode    = '';

  if (days) {
    dateStr = addDays(days);
    mode    = `${days} days`;
  } else if (months) {
    dateStr = addMonths(months);
    mode    = `${months} month(s)`;
  } else if (expiry) {
    if (!/^\d{8}$/.test(expiry))
      return res.status(400).json({ error: "expiry must be YYYYMMDD" });
    dateStr = expiry;
    mode    = `custom date`;
  } else {
    return res.status(400).json({ error: "Provide days, months, or expiry" });
  }

  const clientName  = name.toUpperCase();
  const sig         = generateSignature(clientName, dateStr);
  const key         = `${clientName}_${dateStr}_${sig}`;
  const expiryFmt   = formatDate(dateStr);
  const left        = daysLeft(expiryFmt);

  console.log(`[GENKEY] ${clientName} | Key=${key} | Expires=${expiryFmt} (${left}d) | Mode=${mode}`);

  res.json({
    key:        key,
    client:     clientName,
    expiry:     expiryFmt,
    days_left:  left,
    mode:       mode,
    give_to_client: {
      ServerURL: "https://copytrader-relay-production.up.railway.app",
      MasterID:  clientName,
      ApiKey:    key
    }
  });
});

// ── Status Dashboard ─────────────────────────────────────────
app.get('/', (req, res) => {
  const now = Math.floor(Date.now()/1000);
  const masters = {};
  for (const [id, d] of Object.entries(store)) {
    const age = now - d.time;
    masters[id] = {
      client:    d.clientName,
      trades:    d.trades.length,
      equity:    d.equity,
      status:    age < 30 ? "🟢 ONLINE" : "🔴 OFFLINE",
      expiry:    d.expiry,
      days_left: d.daysLeft
    };
  }
  res.json({ server:"CopyTrader v5.1", masters, uptime:`${Math.floor(process.uptime())}s` });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ CopyTrader Server v5.1 | Port ${PORT}`);
  console.log(`🔑 Generate keys:`);
  console.log(`   Days:   /genkey?admin=${ADMIN_PASS}&name=USHA&days=10`);
  console.log(`   Months: /genkey?admin=${ADMIN_PASS}&name=USHA&months=1`);
  console.log(`   Date:   /genkey?admin=${ADMIN_PASS}&name=USHA&expiry=20260331`);
});
