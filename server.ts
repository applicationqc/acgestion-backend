import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import cors from 'cors';
import dotenv from 'dotenv';
import { google } from 'googleapis';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function startServer() {
  const app = express();

  app.use(cors({
    origin: ['https://applicationqc.github.io', 'http://localhost:5173'],
    credentials: true
  }));
  app.use(express.json());

  // --- DB INIT ---
  try {
    const client = await pool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS clients (id SERIAL PRIMARY KEY, nom TEXT, telephone TEXT, adresse TEXT, email TEXT, notes TEXT);
      CREATE TABLE IF NOT EXISTS invoices (id SERIAL PRIMARY KEY, vendor TEXT, date DATE, total NUMERIC, uid TEXT);
      CREATE TABLE IF NOT EXISTS user_tokens (uid TEXT PRIMARY KEY, access_token TEXT, refresh_token TEXT);
    `);
    client.release();
    console.log("✅ Postgres connectée !");
  } catch (err) {
    console.log("⚠️ Mode Mock activé (Pas de DB)");
  }

  // --- AUTH GOOGLE ---
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    "https://acgestion-backend.onrender.com/api/auth/google/callback"
  );

  app.get('/api/auth/google', (req, res) => {
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email']
    });
    res.json({ url });
  });

  app.get('/api/auth/google/callback', async (req, res) => {
    const { code } = req.query;
    try {
      const { tokens } = await oauth2Client.getToken(code as string);
      // Redirection vers ton frontend avec le token
      res.redirect(`https://applicationqc.github.io/acgestion?token=${tokens.access_token}`);
    } catch (error) {
      res.redirect(`https://applicationqc.github.io/acgestion?error=auth_failed`);
    }
  });

  // --- ROUTES DATA ---
  app.get('/api/invoices', async (req, res) => {
    const { uid } = req.query;
    try {
      const result = await pool.query('SELECT * FROM invoices WHERE uid = $1', [uid]);
      res.json(result.rows);
    } catch (err) { res.json([]); }
  });

  const PORT = process.env.PORT || 10000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Serveur prêt sur le port ${PORT}`);
  });
}

startServer();