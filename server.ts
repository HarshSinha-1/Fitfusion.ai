/**
 * server.ts
 * FitFusion API — entry point.
 */

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors   from 'cors';
import helmet from 'helmet';
import { connectDB, disconnectDB } from './configs/db';

// ── Route imports ─────────────────────────────────────────────────────────────
import authRoutes      from './routes/auth';
import nutritionRoutes from './routes/nutrition';      // ← Phase 1 added
// import activityRoutes    from './routes/activity';  // Phase 2
// import wellnessRoutes    from './routes/wellness';  // Phase 3

const app  = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// ── Global middleware ─────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'FitFusion API', time: new Date().toISOString() });
});

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/v1/auth',      authRoutes);
app.use('/api/v1/nutrition', nutritionRoutes);   // ← Phase 1

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, message: 'Route not found.' });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('❌ Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error.' });
});

// ── Startup ───────────────────────────────────────────────────────────────────
async function start(): Promise<void> {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`🚀 FitFusion API        → http://localhost:${PORT}`);
    console.log(`📋 Health               → http://localhost:${PORT}/health`);
    console.log(`🔑 Auth                 → http://localhost:${PORT}/api/v1/auth`);
    console.log(`🥗 Nutrition (Phase 1)  → http://localhost:${PORT}/api/v1/nutrition`);
  });
}

async function shutdown(): Promise<void> {
  console.log('\n🛑 Shutting down...');
  await disconnectDB();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);

start().catch((err) => {
  console.error('💥 Failed to start:', err.message);
  process.exit(1);
});

export default app;