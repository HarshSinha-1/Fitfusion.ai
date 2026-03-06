/**
 * validators/leaderboard.validator.ts
 *
 * Zod schemas for the leaderboard feature.
 */

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// 1. ADMIN COMPUTE (trigger recomputation)
//    POST /api/v1/leaderboard/admin/compute
// ─────────────────────────────────────────────────────────────────────────────
export const computeLeaderboardSchema = z.object({
  period: z.enum(['weekly', 'monthly'], {
    message: 'period must be either "weekly" or "monthly".',
  }).default('weekly'),
});

export type ComputeLeaderboardInput = z.infer<typeof computeLeaderboardSchema>;