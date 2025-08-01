const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const shortid = require("shortid");
const moment = require("moment");
const geoip = require("geoip-lite");
const app = express();
const port = 8000;

// In-memory storage
const db = new Map();
const clicks = new Map();

// Middleware
const logger = require("./logger");
app.use(logger);
app.use(cors());
app.use(bodyParser.json());

// POST /shorturls
app.post("/shorturls", (req, res) => {
  const { url, validity, shortcode } = req.body;
  if (!url || !url.match(/^https?:\/\//)) {
    return res.status(400).json({ error: "Invalid URL format." });
  }

  let code = shortcode || shortid.generate();
  if (db.has(code)) {
    return res.status(400).json({ error: "Shortcode already in use." });
  }

  const now = moment.utc();
  const expiry = now.clone().add(validity || 30, "minutes").toISOString();

  db.set(code, { url, createdAt: now.toISOString(), expiry });
  clicks.set(code, []);

  res.status(201).json({
    shortLink: `http://localhost:${port}/${code}`,
    expiry
  });
});

// GET /:shortcode
app.get("/:shortcode", (req, res) => {
  const { shortcode } = req.params;
  const record = db.get(shortcode);
  if (!record) return res.status(404).json({ error: "Shortcode not found." });

  const now = moment.utc();
  if (now.isAfter(moment.utc(record.expiry))) {
    return res.status(410).json({ error: "Shortlink has expired." });
  }

  const referer = req.get("Referer") || null;
  const ip = req.ip;
  const geo = geoip.lookup(ip);

  clicks.get(shortcode).push({
    timestamp: now.toISOString(),
    referrer: referer,
    location: geo ? `${geo.city || ""}, ${geo.country || ""}` : "Unknown"
  });

  res.redirect(record.url);
});

// GET /shorturls/:shortcode/stats
app.get("/shorturls/:shortcode/stats", (req, res) => {
  const { shortcode } = req.params;
  const record = db.get(shortcode);
  if (!record) return res.status(404).json({ error: "Shortcode not found." });

  res.json({
    shortLink: `http://localhost:${port}/${shortcode}`,
    originalURL: record.url,
    createdAt: record.createdAt,
    expiry: record.expiry,
    clicks: clicks.get(shortcode).length,
    clickData: clicks.get(shortcode)
  });
});

// GET /shorturls/allstats
app.get("/shorturls/allstats", (req, res) => {
  const all = [];
  for (const [code, record] of db.entries()) {
    all.push({
      shortLink: `http://localhost:${port}/${code}`,
      originalURL: record.url,
      createdAt: record.createdAt,
      expiry: record.expiry,
      clicks: clicks.get(code).length,
      clickData: clicks.get(code)
    });
  }
  res.json(all);
});

app.listen(port, () => {
  console.log(`URL Shortener running at http://localhost:${port}`);
});
