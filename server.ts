import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors   from 'cors';
import helmet from 'helmet';
import { connectDB, disconnectDB } from './configs/db';

import authRoutes        from './routes/auth';
import nutritionRoutes   from './routes/nutrition';
import moodRoutes        from './routes/mood';
import activityRoutes    from './routes/activity';
import environmentRoutes from './routes/environment';
import leaderboardRoutes  from './routes/leaderboard';      // ← NEW

const app  = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.use('/api/v1/auth',        authRoutes);
app.use('/api/v1/nutrition',   nutritionRoutes);
app.use('/api/v1/mood',        moodRoutes);
app.use('/api/v1/activity',    activityRoutes);
app.use('/api/v1/environment', environmentRoutes);
app.use('/api/v1/leaderboard',   leaderboardRoutes);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, message: 'Route not found.' });
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ success: false, message: 'Internal server error.' });
});

async function start() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`\n🚀 FitFusion API        → http://localhost:${PORT}`);
    console.log(`🔑 Auth                 → /api/v1/auth`);
    console.log(`🥗 Nutrition            → /api/v1/nutrition`);
    console.log(`🧠 Mood & Wellness      → /api/v1/mood`);
    console.log(`🏋️  Fitness Activity     → /api/v1/activity`);
    console.log(`🌍 Environment          → /api/v1/environment`);
    console.log(`🏆 Leaderboard          → /api/v1/leaderboard\n`);
  });
}

process.on('SIGINT',  async () => { await disconnectDB(); process.exit(0); });
process.on('SIGTERM', async () => { await disconnectDB(); process.exit(0); });

start().catch(err => { console.error('💥', err.message); process.exit(1); });

export default app;