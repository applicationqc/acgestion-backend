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
    } catch (err) {
      isMockMode = true;
    }
  };
  await initDb();
  // --- API Routes ---
  // (Clients, Invoices, Media, Auth Google, etc. à copier du code original)

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Le serveur AC GESTION tourne sur le port ${PORT}`);
  });
}

startServer();
