import express from "express";
import session from "express-session";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("jarvis.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT UNIQUE NOT NULL,
    facebook_token TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(session({
    secret: process.env.SESSION_SECRET || "jarvis-secret-123",
    resave: false,
    saveUninitialized: true,
    cookie: { 
      secure: true, 
      sameSite: 'none',
      httpOnly: true 
    }
  }));

  // API Routes
  app.get("/api/messages", (req, res) => {
    const sessionId = req.sessionID;
    try {
      const rows = db.prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC").all(sessionId);
      res.json(rows.map(row => ({
        ...row,
        metadata: row.metadata ? JSON.parse(row.metadata) : null
      })));
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.post("/api/messages", (req, res) => {
    const sessionId = req.sessionID;
    const { role, content, metadata } = req.body;
    try {
      const stmt = db.prepare("INSERT INTO messages (session_id, role, content, metadata) VALUES (?, ?, ?, ?)");
      stmt.run(sessionId, role, content, metadata ? JSON.stringify(metadata) : null);
      res.status(201).json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to save message" });
    }
  });

  app.delete("/api/history", (req, res) => {
    const sessionId = req.sessionID;
    try {
      db.prepare("DELETE FROM messages WHERE session_id = ?").run(sessionId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to clear history" });
    }
  });

  // Facebook OAuth
  app.get("/api/auth/facebook/url", (req, res) => {
    const appId = process.env.FACEBOOK_APP_ID;
    const redirectUri = process.env.FACEBOOK_REDIRECT_URI || `${process.env.APP_URL}/auth/facebook/callback`;
    
    if (!appId) {
      return res.status(500).json({ error: "Facebook App ID not configured" });
    }

    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      scope: "email,public_profile,pages_manage_posts,pages_read_engagement", // Adjust scopes as needed
      response_type: "code",
      state: req.sessionID
    });

    const url = `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`;
    res.json({ url });
  });

  app.get("/auth/facebook/callback", async (req, res) => {
    const { code, state } = req.query;
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    const redirectUri = process.env.FACEBOOK_REDIRECT_URI || `${process.env.APP_URL}/auth/facebook/callback`;

    if (!code) {
      return res.status(400).send("No code provided");
    }

    try {
      const tokenRes = await axios.get("https://graph.facebook.com/v18.0/oauth/access_token", {
        params: {
          client_id: appId,
          client_secret: appSecret,
          redirect_uri: redirectUri,
          code
        }
      });

      const { access_token } = tokenRes.data;
      const sessionId = state as string || req.sessionID;

      db.prepare(`
        INSERT INTO user_tokens (session_id, facebook_token) 
        VALUES (?, ?) 
        ON CONFLICT(session_id) DO UPDATE SET facebook_token = excluded.facebook_token
      `).run(sessionId, access_token);

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (err: any) {
      console.error("Facebook OAuth Error:", err.response?.data || err.message);
      res.status(500).send("Facebook authentication failed");
    }
  });

  app.post("/api/facebook/action", async (req, res) => {
    const sessionId = req.sessionID;
    const { type, message } = req.body;

    const row = db.prepare("SELECT facebook_token FROM user_tokens WHERE session_id = ?").get(sessionId) as any;
    if (!row || !row.facebook_token) {
      return res.status(401).json({ error: "Facebook not connected" });
    }

    const token = row.facebook_token;

    try {
      if (type === "facebook_post") {
        // Note: Posting to user timeline directly is restricted. 
        // Usually requires Page Token or specific permissions.
        // For this demo, we'll try the /me/feed endpoint.
        const postRes = await axios.post(`https://graph.facebook.com/v18.0/me/feed`, {
          message,
          access_token: token
        });
        res.json({ success: true, id: postRes.data.id });
      } else if (type === "facebook_notifications") {
        // Notifications API is deprecated for many apps, but we'll try to fetch basic info
        const profileRes = await axios.get(`https://graph.facebook.com/v18.0/me?fields=id,name`, {
          params: { access_token: token }
        });
        res.json({ success: true, data: `Connected as ${profileRes.data.name}. (Notification API access limited)` });
      } else {
        res.status(400).json({ error: "Invalid action type" });
      }
    } catch (err: any) {
      console.error("Facebook API Error:", err.response?.data || err.message);
      res.status(500).json({ error: "Facebook action failed", details: err.response?.data });
    }
  });

  app.get("/api/facebook/status", (req, res) => {
    const sessionId = req.sessionID;
    const row = db.prepare("SELECT facebook_token FROM user_tokens WHERE session_id = ?").get(sessionId) as any;
    res.json({ connected: !!(row && row.facebook_token) });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`JARVIS Server running on http://localhost:${PORT}`);
  });
}

startServer();
