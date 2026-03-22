/**
 * dashboard/server.js
 * Express REST dashboard that exposes:
 *   GET /transfers       – last N transfers from SQLite
 *   GET /gas-stats       – gas comparison stats
 *   GET /health          – liveness check
 */
require("dotenv").config();
const express = require("express");
const path    = require("path");
const fs      = require("fs");
const Database = require("better-sqlite3");

const PORT   = process.env.DASHBOARD_PORT || 3000;
const DB_FILE = path.join(__dirname, "..", "events.db");

const app = express();
app.use(express.json());

function getDB() {
  return new Database(DB_FILE, { readonly: true });
}

// ── Health check ───────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// ── Last N transfers ───────────────────────────────────────────────────────
app.get("/transfers", (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const db = getDB();
  const rows = db
    .prepare("SELECT * FROM transfers ORDER BY id DESC LIMIT ?")
    .all(limit);
  db.close();
  res.json({ count: rows.length, rows });
});

// ── Gas stats ──────────────────────────────────────────────────────────────
app.get("/gas-stats", (req, res) => {
  const db = getDB();
  const rows = db
    .prepare(`
      SELECT label,
             COUNT(*)         AS runs,
             AVG(gas_used)    AS avg_gas,
             MIN(gas_used)    AS min_gas,
             MAX(gas_used)    AS max_gas
      FROM   gas_stats
      GROUP  BY label
      ORDER  BY label
    `)
    .all();
  db.close();
  res.json({ rows });
});

// ── Simple HTML overview ───────────────────────────────────────────────────
app.get("/", (_req, res) => {
  const addrFile = path.join(__dirname, "..", "deployed_addresses.json");
  const addrs = fs.existsSync(addrFile)
    ? JSON.parse(fs.readFileSync(addrFile, "utf8"))
    : {};

  const db = getDB();
  const txCount   = db.prepare("SELECT COUNT(*) AS n FROM transfers").get().n;
  const gasRows   = db.prepare("SELECT label, ROUND(AVG(gas_used),0) AS avg FROM gas_stats GROUP BY label").all();
  db.close();

  const gasHtml = gasRows.length
    ? gasRows.map(r => `<tr><td>${r.label}</td><td>${r.avg}</td></tr>`).join("")
    : "<tr><td colspan=2>No gas data yet</td></tr>";

  res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Countable Coin Dashboard</title>
<style>body{font-family:monospace;max-width:800px;margin:2rem auto;padding:0 1rem}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:.4rem .8rem}
th{background:#f0f0f0}</style>
</head><body>
<h1>Countable Coin – Local Demo Dashboard</h1>
<h2>Deployed Contracts</h2>
<table>
  <tr><th>Contract</th><th>Address</th></tr>
  <tr><td>CountableCoin</td><td>${addrs.CountableCoin || "–"}</td></tr>
  <tr><td>StandardToken</td><td>${addrs.StandardToken || "–"}</td></tr>
</table>
<h2>Event Log (${txCount} events)</h2>
<p><a href="/transfers">GET /transfers</a> | <a href="/gas-stats">GET /gas-stats</a></p>
<h2>Gas Comparison (10-run averages)</h2>
<table>
  <tr><th>Method</th><th>Avg Gas</th></tr>
  ${gasHtml}
</table>
</body></html>`);
});

app.listen(PORT, () => {
  console.log(`Dashboard running → http://localhost:${PORT}`);
});
