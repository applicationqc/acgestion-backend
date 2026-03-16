import express from 'express';
import pg from 'pg';
import cors from 'cors';
import dotenv from 'dotenv';
import { google } from 'googleapis';

dotenv.config();

const { Pool } = pg;

// Configuration de la base de données avec SSL forcé pour Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Obligatoire pour les bases de données Cloud comme Render ou Neon
  }
});

const app = express();

// 1. Configuration CORS pour ton application GitHub Pages
app.use(cors({
  origin: ['https://applicationqc.github.io', 'http://localhost:5173'],
  credentials: true
}));
app.use(express.json());

// 2. Configuration Google OAuth
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "https://acgestion-backend.onrender.com/api/auth/google/callback"
);

// Route pour générer l'URL de connexion Google
app.get('/api/auth/google', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email'
    ]
  });
  res.json({ url });
});

// Route de retour après la connexion Google (Callback)
app.get('/api/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    // Redirection vers ton lien officiel avec le jeton de connexion
    res.redirect(`https://applicationqc.github.io/acgestion/?token=${tokens.access_token}`);
  } catch (error) {
    console.error("Erreur OAuth:", error);
    res.redirect(`https://applicationqc.github.io/acgestion/?error=auth_failed`);
  }
});

// Route pour récupérer les factures (exemple de requête DB)
app.get('/api/invoices', async (req, res) => {
  const { uid } = req.query;
  try {
    const result = await pool.query('SELECT * FROM invoices WHERE uid = $1', [uid]);
    res.json(result.rows);
  } catch (err) {
    res.json([]);
  }
});

// 3. Initialisation de la Base de Données (PostgreSQL)
// On utilise une fonction asynchrone pour ne pas bloquer le démarrage du serveur
const initDB = async () => {
  try {
    console.log("🔄 Tentative de connexion à PostgreSQL...");
    const client = await pool.connect();
    
    // Création des tables si elles n'existent pas
    await client.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY, 
        nom TEXT, 
        telephone TEXT, 
        adresse TEXT, 
        email TEXT, 
        notes TEXT
      );
      CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY, 
        vendor TEXT, 
        date DATE, 
        total NUMERIC, 
        uid TEXT
      );
      CREATE TABLE IF NOT EXISTS user_tokens (
        uid TEXT PRIMARY KEY, 
        access_token TEXT, 
        refresh_token TEXT
      );
    `);
    
    client.release();
    console.log("✅ Postgres connectée et tables vérifiées !");
  } catch (err: any) {
    // Si ça échoue, on affiche les détails précis dans les logs de Render
    console.error("❌ ERREUR CRITIQUE DB :");
    console.error("Message :", err.message);
    console.error("Code :", err.code);
    console.log("⚠️ Le serveur continue de rouler sans DB pour le moment.");
  }
};

// Lancement de l'initialisation
initDB();

// 4. Démarrage du serveur sur le port fourni par Render
const PORT = process.env.PORT || 10000;
app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`🚀 SERVEUR AC GESTION ACTIF SUR PORT ${PORT}`);
});