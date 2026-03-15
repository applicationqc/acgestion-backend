import express from 'express';
import type { Request } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import cors from 'cors';
import dotenv from 'dotenv';
import { google } from 'googleapis';
import fs from 'fs';
import multer from 'multer';
import type { File as MulterFile } from 'multer';

// Pour que req.file soit reconnu par TypeScript
interface MulterRequest extends Request {
  file: MulterFile;
}

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for local storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function startServer() {
  const app = express();

  app.use(cors({
    origin: [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://applicationqc.github.io'
    ],
    credentials: true
  }));
  app.use(express.json());
  app.use('/uploads', express.static(uploadsDir));

  // --- Database Initialization & Mock Fallback ---
  let isMockMode = false;
  const mockDb = {
    clients: [] as any[],
    invoices: [] as any[],
    media: [] as any[],
    user_tokens: {} as Record<string, any>
  };

  const initDb = async () => {
    try {
      const client = await pool.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS clients (
          id SERIAL PRIMARY KEY,
          nom TEXT NOT NULL,
          telephone TEXT,
          adresse TEXT,
          email TEXT,
          notes TEXT
        );
        CREATE TABLE IF NOT EXISTS invoices (
          id SERIAL PRIMARY KEY,
          vendor TEXT NOT NULL,
          date DATE,
          subtotal NUMERIC,
          tps NUMERIC,
          tvq NUMERIC,
          total NUMERIC,
          category TEXT,
          tps_number TEXT,
          tvq_number TEXT,
          uid TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS media (
          id SERIAL PRIMARY KEY,
          uid TEXT NOT NULL,
          title TEXT,
          description TEXT,
          embedding JSONB,
          url TEXT,
          type TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS user_tokens (
          uid TEXT PRIMARY KEY,
          access_token TEXT,
          refresh_token TEXT,
          expiry_date BIGINT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      client.release();
      console.log("✅ Base de données Postgres connectée !");
    } catch (err) {
      console.log("⚠️ Base de données non connectée. Mode temporaire (Mock) activé.");
      isMockMode = true;
    }
  };

  // 1. On lance l'initialisation de la base de données en arrière-plan (SANS bloquer le démarrage)
  initDb();

  // =====================================================================
  // --- TES ROUTES API RECODÉES ---
  // =====================================================================

  // Authentification Google
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || "https://acgestion-backend.onrender.com/api/auth/google/callback"
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
      oauth2Client.setCredentials(tokens);
      res.redirect(`https://applicationqc.github.io?token=${tokens.access_token}`);
    } catch (error) {
      console.error("Erreur Google:", error);
      res.redirect(`https://applicationqc.github.io?error=auth_failed`);
    }
  });

  // Gestion des Clients
  app.get('/api/clients', async (req, res) => {
    if (isMockMode) return res.json(mockDb.clients);
    try {
      const result = await pool.query('SELECT * FROM clients ORDER BY id DESC');
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: "Erreur serveur BD" });
    }
  });

  app.post('/api/clients', async (req, res) => {
    const { nom, telephone, adresse, email, notes } = req.body;
    if (isMockMode) {
      const newClient = { id: Date.now(), nom, telephone, adresse, email, notes };
      mockDb.clients.push(newClient);
      return res.json(newClient);
    }
    try {
      const result = await pool.query(
        'INSERT INTO clients (nom, telephone, adresse, email, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [nom, telephone, adresse, email, notes]
      );
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: "Erreur serveur BD" });
    }
  });

  // Gestion des Factures
  app.get('/api/invoices', async (req, res) => {
    if (isMockMode) return res.json(mockDb.invoices);
    try {
      const result = await pool.query('SELECT * FROM invoices ORDER BY date DESC');
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: "Erreur serveur BD" });
    }
  });

  // =====================================================================
  
  // 2. On configure le PORT officiel de Render
  const PORT = process.env.PORT || 3000;

  // 3. On ouvre les portes sur 0.0.0.0 IMMÉDIATEMENT
  app.listen(PORT as number, "0.0.0.0", () => {
    console.log(`✅ SUCCÈS : Le serveur AC GESTION tourne sur le port ${PORT}`);
  });
}

startServer();
startServer();
