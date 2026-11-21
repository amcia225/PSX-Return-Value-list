import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import Database from 'better-sqlite3';

const PORT = 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'psx_values.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS huges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    image_url TEXT NOT NULL DEFAULT '',
    normal_value REAL NOT NULL CHECK (normal_value > 0),
    golden_multiplier REAL NOT NULL CHECK (golden_multiplier > 0),
    rainbow_multiplier REAL NOT NULL CHECK (rainbow_multiplier > 0),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS admin_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Session signing key (never persisted or exposed to client)
const SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16
    ? process.env.SESSION_SECRET.trim()
    : crypto.randomBytes(32).toString('hex');

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const revokedTokens = new Map<string, number>();

// Simple in-memory rate limiting for PIN attempts
const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_PIN_ATTEMPTS = 8;
const pinAttemptLog = new Map<string, { count: number; resetAt: number }>();

interface HugeRow {
  id: number;
  name: string;
  image_url: string;
  normal_value: number;
  golden_multiplier: number;
  rainbow_multiplier: number;
  created_at: string;
  updated_at: string;
}

interface TokenPayload {
  jti: string;
  role: 'admin';
  exp: number;
}

function mapHugeRow(row: HugeRow) {
  return {
    id: row.id,
    name: row.name,
    imageUrl: row.image_url,
    normalValue: row.normal_value,
    goldenMultiplier: row.golden_multiplier,
    rainbowMultiplier: row.rainbow_multiplier,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getEnvPin(): string {
  return (process.env.ADMIN_PIN || '').trim();
}

function getStoredPinHash(): string | null {
  const stmt = db.prepare('SELECT value FROM admin_config WHERE key = ?');
  const row = stmt.get('pin_hash') as { value: string } | undefined;
  return row ? row.value : null;
}

function hashPinWithScrypt(pin: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(pin, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyScryptPin(pin: string, storedValue: string): boolean {
  const parts = storedValue.split(':');
  if (parts.length !== 2) {
    return false;
  }
  const [salt, storedHex] = parts;
  if (!salt || !storedHex) {
    return false;
  }
  const derived = crypto.scryptSync(pin, salt, 64);
  const storedBuf = Buffer.from(storedHex, 'hex');
  if (derived.length !== storedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(derived, storedBuf);
}

function verifyEnvPin(inputPin: string, envPin: string): boolean {
  const inputDigest = crypto.createHash('sha256').update(inputPin).digest();
  const envDigest = crypto.createHash('sha256').update(envPin).digest();
  return crypto.timingSafeEqual(inputDigest, envDigest);
}

function signAdminToken(): string {
  const payload: TokenPayload = {
    jti: crypto.randomUUID(),
    role: 'admin',
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
}

function verifyAdminToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }
  const [encodedPayload, providedSig] = parts;
  if (!encodedPayload || !providedSig) {
    return null;
  }

  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encodedPayload)
    .digest('base64url');

  const providedBuf = Buffer.from(providedSig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (providedBuf.length !== expectedBuf.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as TokenPayload;

    if (payload.role !== 'admin' || typeof payload.exp !== 'number' || !payload.jti) {
      return null;
    }
    if (Date.now() > payload.exp) {
      return null;
    }
    const revokedExp = revokedTokens.get(payload.jti);
    if (revokedExp !== undefined) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  return token || null;
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Brak autoryzacji administratora. Zaloguj się PIN-em.' });
    return;
  }
  const payload = verifyAdminToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Sesja administratora wygasła lub jest nieprawidłowa.' });
    return;
  }
  res.locals.adminTokenPayload = payload;
  next();
}

function getClientKey(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || 'unknown';
}

function checkRateLimit(clientKey: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const entry = pinAttemptLog.get(clientKey);
  if (!entry || now > entry.resetAt) {
    return { allowed: true, retryAfterSec: 0 };
  }
  if (entry.count >= MAX_PIN_ATTEMPTS) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, retryAfterSec: 0 };
}

function recordFailedPinAttempt(clientKey: string): void {
  const now = Date.now();
  const entry = pinAttemptLog.get(clientKey);
  if (!entry || now > entry.resetAt) {
    pinAttemptLog.set(clientKey, { count: 1, resetAt: now + RATE_WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

function clearPinAttempts(clientKey: string): void {
  pinAttemptLog.delete(clientKey);
}

function isValidImageUrl(rawUrl: string): boolean {
  if (!rawUrl) {
    return true;
  }
  if (rawUrl.length > 2048) {
    return false;
  }
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

interface ValidatedHugeInput {
  name: string;
  imageUrl: string;
  normalValue: number;
  goldenMultiplier: number;
  rainbowMultiplier: number;
}

function validateHugePayload(
  body: unknown
): { ok: true; data: ValidatedHugeInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Nieprawidłowe dane formularza.' };
  }
  const raw = body as Record<string, unknown>;

  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) {
    return { ok: false, error: 'Nazwa Huge (HUGE NAME) jest wymagana.' };
  }
  if (name.length > 120) {
    return { ok: false, error: 'Nazwa Huge może mieć maksymalnie 120 znaków.' };
  }

  const imageUrl = typeof raw.imageUrl === 'string' ? raw.imageUrl.trim() : '';
  if (!isValidImageUrl(imageUrl)) {
    return {
      ok: false,
      error: 'Link do zdjęcia (HUGE IMAGE URL) musi zaczynać się od http:// lub https://.',
    };
  }

  const normalValue = Number(raw.normalValue);
  if (!Number.isFinite(normalValue) || normalValue <= 0 || normalValue > 1e24) {
    return {
      ok: false,
      error: 'NORMAL VALUE musi być liczbą dodatnią większą od zera.',
    };
  }

  const goldenMultiplier = Number(raw.goldenMultiplier);
  if (!Number.isFinite(goldenMultiplier) || goldenMultiplier <= 0 || goldenMultiplier > 10000) {
    return {
      ok: false,
      error: 'GOLDEN MULTIPLIER musi być liczbą dodatnią większą od zera (maks. 10000).',
    };
  }

  const rainbowMultiplier = Number(raw.rainbowMultiplier);
  if (!Number.isFinite(rainbowMultiplier) || rainbowMultiplier <= 0 || rainbowMultiplier > 10000) {
    return {
      ok: false,
      error: 'RAINBOW MULTIPLIER musi być liczbą dodatnią większą od zera (maks. 10000).',
    };
  }

  return {
    ok: true,
    data: {
      name,
      imageUrl,
      normalValue,
      goldenMultiplier,
      rainbowMultiplier,
    },
  };
}

async function createApp() {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '64kb' }));

  // Health & Database status endpoint (Public)
  app.get('/api/health', (_req: Request, res: Response) => {
    try {
      const row = db.prepare('SELECT COUNT(*) as total FROM huges').get() as { total: number };
      res.json({
        status: 'ONLINE',
        count: row.total,
      });
    } catch {
      res.status(503).json({
        status: 'OFFLINE',
        count: 0,
      });
    }
  });

  // Public list of all Huge pets
  app.get('/api/huges', (_req: Request, res: Response) => {
    try {
      const rows = db
        .prepare(
          `SELECT id, name, image_url, normal_value, golden_multiplier, rainbow_multiplier, created_at, updated_at
           FROM huges
           ORDER BY normal_value DESC, id DESC`
        )
        .all() as HugeRow[];
      res.json({
        huges: rows.map(mapHugeRow),
        total: rows.length,
      });
    } catch {
      res.status(500).json({ error: 'Nie udało się odczytać listy Huge z bazy danych.' });
    }
  });

  // Check admin configuration & current Bearer token validity
  app.get('/api/admin/status', (req: Request, res: Response) => {
    const envPinConfigured = getEnvPin().length > 0;
    const storedHash = getStoredPinHash();
    const needsSetup = !envPinConfigured && !storedHash;
    const token = extractBearerToken(req);
    const authenticated = token ? verifyAdminToken(token) !== null : false;

    res.json({
      envPinConfigured,
      needsSetup,
      authenticated,
    });
  });

  // One-time first-run PIN setup when ADMIN_PIN secret is not configured
  app.post('/api/admin/setup', (req: Request, res: Response) => {
    const envPin = getEnvPin();
    if (envPin.length > 0) {
      res.status(409).json({
        error: 'PIN administratora jest już skonfigurowany w zmiennych środowiskowych.',
      });
      return;
    }

    const existingHash = getStoredPinHash();
    if (existingHash) {
      res.status(409).json({
        error: 'PIN administratora został już utworzony. Użyj logowania PIN-em.',
      });
      return;
    }

    const pin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';
    if (pin.length < 4 || pin.length > 64) {
      res.status(400).json({
        error: 'PIN musi mieć od 4 do 64 znaków.',
      });
      return;
    }

    const hash = hashPinWithScrypt(pin);
    const insertResult = db
      .prepare(
        `INSERT INTO admin_config (key, value)
         VALUES ('pin_hash', ?)
         ON CONFLICT(key) DO NOTHING`
      )
      .run(hash);

    if (insertResult.changes !== 1) {
      res.status(409).json({
        error: 'PIN administratora został już skonfigurowany.',
      });
      return;
    }

    const token = signAdminToken();
    res.status(201).json({ token });
  });

  // Admin PIN login
  app.post('/api/admin/login', (req: Request, res: Response) => {
    const clientKey = getClientKey(req);
    const rate = checkRateLimit(clientKey);
    if (!rate.allowed) {
      res.status(429).json({
        error: `Zbyt wiele nieudanych prób logowania. Spróbuj ponownie za ${rate.retryAfterSec} s.`,
      });
      return;
    }

    const pin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';
    if (!pin) {
      res.status(400).json({ error: 'Wpisz kod PIN administratora.' });
      return;
    }

    const envPin = getEnvPin();
    let isValid = false;

    if (envPin.length > 0) {
      isValid = verifyEnvPin(pin, envPin);
    } else {
      const storedHash = getStoredPinHash();
      if (!storedHash) {
        res.status(400).json({
          error: 'PIN nie został jeszcze skonfigurowany. Ustaw początkowy PIN.',
        });
        return;
      }
      isValid = verifyScryptPin(pin, storedHash);
    }

    if (!isValid) {
      recordFailedPinAttempt(clientKey);
      res.status(401).json({ error: 'Nieprawidłowy PIN administratora.' });
      return;
    }

    clearPinAttempts(clientKey);
    const token = signAdminToken();
    res.json({ token });
  });

  // Admin logout (revokes current token on server)
  app.post('/api/admin/logout', requireAdmin, (_req: Request, res: Response) => {
    const payload = res.locals.adminTokenPayload as TokenPayload;
    revokedTokens.set(payload.jti, payload.exp);
    const now = Date.now();
    for (const [jti, exp] of revokedTokens.entries()) {
      if (now > exp) {
        revokedTokens.delete(jti);
      }
    }
    res.json({ ok: true });
  });

  // Create Huge (Admin only)
  app.post('/api/huges', requireAdmin, (req: Request, res: Response) => {
    const validated = validateHugePayload(req.body);
    if (!validated.ok) {
      res.status(400).json({ error: validated.error });
      return;
    }

    const { name, imageUrl, normalValue, goldenMultiplier, rainbowMultiplier } = validated.data;
    try {
      const insert = db.prepare(
        `INSERT INTO huges (name, image_url, normal_value, golden_multiplier, rainbow_multiplier)
         VALUES (?, ?, ?, ?, ?)`
      );
      const result = insert.run(name, imageUrl, normalValue, goldenMultiplier, rainbowMultiplier);
      const created = db
        .prepare(
          `SELECT id, name, image_url, normal_value, golden_multiplier, rainbow_multiplier, created_at, updated_at
           FROM huges WHERE id = ?`
        )
        .get(result.lastInsertRowid) as HugeRow;

      res.status(201).json({ huge: mapHugeRow(created) });
    } catch {
      res.status(500).json({ error: 'Błąd bazy danych podczas zapisywania nowego Huge.' });
    }
  });

  // Update Huge (Admin only)
  app.put('/api/huges/:id', requireAdmin, (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Nieprawidłowe ID Huge.' });
      return;
    }

    const validated = validateHugePayload(req.body);
    if (!validated.ok) {
      res.status(400).json({ error: validated.error });
      return;
    }

    const { name, imageUrl, normalValue, goldenMultiplier, rainbowMultiplier } = validated.data;
    try {
      const update = db.prepare(
        `UPDATE huges
         SET name = ?, image_url = ?, normal_value = ?, golden_multiplier = ?, rainbow_multiplier = ?, updated_at = datetime('now')
         WHERE id = ?`
      );
      const result = update.run(name, imageUrl, normalValue, goldenMultiplier, rainbowMultiplier, id);
      if (result.changes === 0) {
        res.status(404).json({ error: 'Nie znaleziono wybranego Huge w bazie danych.' });
        return;
      }

      const updated = db
        .prepare(
          `SELECT id, name, image_url, normal_value, golden_multiplier, rainbow_multiplier, created_at, updated_at
           FROM huges WHERE id = ?`
        )
        .get(id) as HugeRow;

      res.json({ huge: mapHugeRow(updated) });
    } catch {
      res.status(500).json({ error: 'Błąd bazy danych podczas aktualizacji Huge.' });
    }
  });

  // Delete Huge (Admin only)
  app.delete('/api/huges/:id', requireAdmin, (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Nieprawidłowe ID Huge.' });
      return;
    }

    try {
      const result = db.prepare('DELETE FROM huges WHERE id = ?').run(id);
      if (result.changes === 0) {
        res.status(404).json({ error: 'Nie znaleziono wybranego Huge w bazie danych.' });
        return;
      }
      res.json({ ok: true, id });
    } catch {
      res.status(500).json({ error: 'Błąd bazy danych podczas usuwania Huge.' });
    }
  });

  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PSX RETURN VALUES server listening on http://0.0.0.0:${PORT}`);
  });
}

createApp().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
