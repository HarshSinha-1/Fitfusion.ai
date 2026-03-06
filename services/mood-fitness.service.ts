/**
 * services/mood-fitness.service.ts
 *
 * Generates mood-aware workout recommendations.
 *
 * NOW CONSIDERS PREVIOUS DAY'S ACTIVITY:
 *   - If yesterday was high intensity → scale down today
 *   - If yesterday was rest → user is fresh, can push harder
 *   - If yesterday was long (>60 min) → suggest shorter session
 *
 * SCIENCE-BACKED EXERCISE-MOOD CONNECTIONS:
 *   Moderate cardio → anxiolytic effect (reduces anxiety)
 *   Yoga/stretching → cortisol reduction
 *   High-intensity  → endorphin release (runner's high)
 *   Social sports    → oxytocin + mood boost
 *   Rest             → essential for physical + mental recovery
 */

import { MoodState } from './sentiment.service';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
interface WorkoutRecommendation {
  activity_type:    string;
  duration_minutes: number;
  intensity:        'low' | 'moderate' | 'high';
  description:      string;
  sets?:            number;
  reps?:            number;
}

interface MoodWorkoutProfile {
  recommended_activities: WorkoutRecommendation[];
  avoid:                  string[];
  max_intensity:          'low' | 'moderate' | 'high';
  reasoning:              string;
  rest_day_suggested:     boolean;
}

/** Shape returned by activityService.getYesterdayActivity() */
export interface YesterdayActivity {
  date:                  string;
  total_minutes:         number;
  total_calories_burned: number;
  activity_count:        number;
  activity_types:        string[];
  max_intensity:         string;
  was_intense:           boolean;
  was_long:              boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// MOOD → WORKOUT MAPPING (base plans, before yesterday adjustment)
// ─────────────────────────────────────────────────────────────────────────────
const MOOD_WORKOUT_MAP: Record<MoodState, MoodWorkoutProfile> = {

  stressed_anxious: {
    recommended_activities: [
      { activity_type: 'yoga',       duration_minutes: 30, intensity: 'low',      description: 'Gentle yoga with deep breathing — proven to lower cortisol levels.' },
      { activity_type: 'walking',    duration_minutes: 20, intensity: 'low',      description: 'A calm walk around campus. Fresh air + gentle movement = natural anxiety relief.' },
      { activity_type: 'running',    duration_minutes: 25, intensity: 'moderate', description: 'Moderate jog — aerobic exercise is a proven anxiolytic. Keep pace conversational.' },
      { activity_type: 'meditation', duration_minutes: 15, intensity: 'low',      description: 'Guided breathing or meditation session. Even 10 minutes reduces stress hormones.' },
    ],
    avoid: ['heavy deadlifts', 'competitive sports', 'max-effort sprints'],
    max_intensity: 'moderate',
    reasoning: 'When stressed, your cortisol is already elevated. Intense exercise adds more cortisol. Moderate cardio and yoga are scientifically proven to reduce anxiety without overtaxing your system.',
    rest_day_suggested: false,
  },

  fatigued_low: {
    recommended_activities: [
      { activity_type: 'rest',       duration_minutes: 0,  intensity: 'low', description: 'Your body is telling you to rest. Recovery IS part of fitness. Take today off.' },
      { activity_type: 'stretching', duration_minutes: 15, intensity: 'low', description: 'Gentle full-body stretch. Improves circulation without taxing energy reserves.' },
      { activity_type: 'walking',    duration_minutes: 15, intensity: 'low', description: 'A short walk — just enough to get blood flowing. Don\'t push beyond comfort.' },
    ],
    avoid: ['gym workout', 'running', 'HIIT', 'sports', 'any high-intensity activity'],
    max_intensity: 'low',
    reasoning: 'Fatigue signals your body needs recovery. Training while exhausted increases injury risk and worsens fatigue. Light movement or complete rest is the optimal choice today.',
    rest_day_suggested: true,
  },

  sad_demotivated: {
    recommended_activities: [
      { activity_type: 'walking',  duration_minutes: 20, intensity: 'low',      description: 'A gentle walk — even a short walk outdoors boosts mood through sunlight and light movement.' },
      { activity_type: 'yoga',     duration_minutes: 20, intensity: 'low',      description: 'Restorative yoga — slow, mindful movement helps reconnect body and mind.' },
      { activity_type: 'sports',   duration_minutes: 30, intensity: 'moderate', description: 'Join a casual game (badminton, cricket). Social exercise releases oxytocin and lifts mood.' },
      { activity_type: 'dancing',  duration_minutes: 15, intensity: 'moderate', description: 'Put on music and move! Dance triggers dopamine release.' },
    ],
    avoid: ['isolated heavy gym sessions', 'extreme endurance'],
    max_intensity: 'moderate',
    reasoning: 'When feeling low, the hardest part is starting. We recommend social or enjoyable activities that don\'t feel like "working out." Even 15 minutes of movement releases endorphins.',
    rest_day_suggested: false,
  },

  positive_motivated: {
    recommended_activities: [
      { activity_type: 'gym',     duration_minutes: 60, intensity: 'high',     description: 'Full strength session — capitalize on your energy! Push for progressive overload.', sets: 4, reps: 10 },
      { activity_type: 'running', duration_minutes: 40, intensity: 'high',     description: 'Tempo run or interval training. Your mood supports pushing limits today.' },
      { activity_type: 'sports',  duration_minutes: 60, intensity: 'high',     description: 'Competitive match — basketball, football, badminton. Channel that energy!' },
      { activity_type: 'HIIT',    duration_minutes: 30, intensity: 'high',     description: 'High-intensity intervals — 30s work / 30s rest. Maximum endorphin release.' },
      { activity_type: 'cycling', duration_minutes: 45, intensity: 'moderate', description: 'Long-distance cycling session. Endurance + scenery = peak wellness.' },
    ],
    avoid: [],
    max_intensity: 'high',
    reasoning: 'You\'re feeling great — this is the time to challenge yourself! Positive mood correlates with better workout performance, faster recovery, and higher motivation. Go all out!',
    rest_day_suggested: false,
  },

  neutral: {
    recommended_activities: [
      { activity_type: 'gym',     duration_minutes: 45, intensity: 'moderate', description: 'Standard gym session — maintain your routine.', sets: 3, reps: 12 },
      { activity_type: 'running', duration_minutes: 30, intensity: 'moderate', description: 'Easy 30-minute jog at comfortable pace.' },
      { activity_type: 'yoga',    duration_minutes: 30, intensity: 'moderate', description: 'Vinyasa flow — balanced effort and mindfulness.' },
    ],
    avoid: [],
    max_intensity: 'moderate',
    reasoning: 'Your mood is balanced — a standard workout maintains your fitness trajectory. Consistency on neutral days is what builds long-term results.',
    rest_day_suggested: false,
  },

  pain_recovery: {
    recommended_activities: [
      { activity_type: 'rest',       duration_minutes: 0,  intensity: 'low', description: 'Complete rest. Let your body heal. Consider seeing a doctor if pain persists.' },
      { activity_type: 'stretching', duration_minutes: 10, intensity: 'low', description: 'Only stretch UNAFFECTED areas. Avoid any movement that causes pain.' },
    ],
    avoid: ['ALL gym exercises', 'running', 'sports', 'any activity involving the injured area'],
    max_intensity: 'low',
    reasoning: 'You mentioned pain or injury. Training through pain risks making it worse. Rest is the most important exercise today. Please visit the campus health center if symptoms persist.',
    rest_day_suggested: true,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// INTENSITY DOWNGRADE MAP
// ─────────────────────────────────────────────────────────────────────────────
const INTENSITY_DOWNGRADE: Record<string, 'low' | 'moderate' | 'high'> = {
  high:     'moderate',
  moderate: 'low',
  low:      'low',
};

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate mood-aware workout recommendations.
 *
 * NOW takes yesterdayActivity as input so the mood.service orchestrator
 * can pass it in after fetching from activity_logs.
 *
 * Adaptation logic:
 *   yesterday HIGH intensity + today positive  → moderate (recovery)
 *   yesterday HIGH intensity + today fatigued  → FORCE rest (overtraining)
 *   yesterday HIGH + long    + any mood        → reduce duration 40%
 *   yesterday rest (null)    + today positive  → go hard (fresh)
 */
export function getMoodAwareWorkout(
  moodState:         MoodState,
  fitnessLevel:      number = 4,
  yesterdayActivity?: YesterdayActivity | null,
) {
  const profile = MOOD_WORKOUT_MAP[moodState];

  // ── Fitness level scaling ───────────────────────────────────────────────
  const durationScale =
    fitnessLevel <= 3 ? 0.7 :
    fitnessLevel <= 6 ? 1.0 :
    1.2;

  // ── Yesterday-aware adjustments ─────────────────────────────────────────
  let adjustmentNote   = '';
  let forceRest        = false;
  let downgradeIntensity = false;
  let durationReduction  = 1.0; // multiplier (1.0 = no reduction)

  if (yesterdayActivity) {
    // Case 1: Yesterday was HIGH intensity + today user is fatigued → FORCE REST
    if (yesterdayActivity.was_intense && moodState === 'fatigued_low') {
      forceRest = true;
      adjustmentNote =
        `You did a high-intensity ${yesterdayActivity.activity_types.join(', ')} session yesterday ` +
        `(${yesterdayActivity.total_minutes} min) and you're feeling fatigued today. ` +
        `Taking a rest day to prevent overtraining.`;
    }
    // Case 2: Yesterday was HIGH intensity + today mood is positive → downgrade to moderate
    else if (yesterdayActivity.was_intense && moodState === 'positive_motivated') {
      downgradeIntensity = true;
      durationReduction  = 0.8;
      adjustmentNote =
        `Great mood today! But yesterday was intense (${yesterdayActivity.activity_types.join(', ')}, ` +
        `${yesterdayActivity.total_minutes} min). We've scaled today to moderate intensity ` +
        `to allow recovery while keeping you active.`;
    }
    // Case 3: Yesterday was long (>60 min) regardless of intensity → reduce today's duration
    else if (yesterdayActivity.was_long) {
      durationReduction = 0.7;
      adjustmentNote =
        `Yesterday was a long session (${yesterdayActivity.total_minutes} min). ` +
        `We've shortened today's recommendations to avoid accumulated fatigue.`;
    }
    // Case 4: Yesterday was HIGH but mood is neutral/stressed → downgrade
    else if (yesterdayActivity.was_intense) {
      downgradeIntensity = true;
      adjustmentNote =
        `Yesterday was high intensity. We've adjusted today's plan to moderate ` +
        `to balance recovery with consistency.`;
    }
  } else {
    // No activity yesterday — user is fresh
    if (moodState === 'positive_motivated') {
      adjustmentNote = 'You rested yesterday — your body is fresh. Great day to push!';
    }
  }

  // ── Apply adjustments ───────────────────────────────────────────────────
  if (forceRest) {
    // Override everything with rest
    return {
      source:         'mood_aware' as const,
      mood_state:     moodState,
      recommendations: [
        {
          activity_type:    'rest',
          duration_minutes: 0,
          intensity:        'low' as const,
          description:      'Complete rest day. Your body needs recovery after yesterday\'s intense session combined with today\'s fatigue.',
        },
        {
          activity_type:    'stretching',
          duration_minutes: 10,
          intensity:        'low' as const,
          description:      'Gentle stretching only if it feels comfortable.',
        },
      ],
      avoid:          ['ALL exercise', 'gym', 'running', 'sports'],
      max_intensity:  'low' as const,
      reasoning:      profile.reasoning + ' ' + adjustmentNote,
      rest_day:       true,
      yesterday_considered: yesterdayActivity,
      adjustment_note:      adjustmentNote,
    };
  }

  const recommendations = profile.recommended_activities.map((act) => {
    let intensity = act.intensity;
    let duration  = act.duration_minutes;

    // Downgrade intensity if needed
    if (downgradeIntensity && intensity === 'high') {
      intensity = INTENSITY_DOWNGRADE[intensity];
    }

    // Apply fitness level scaling + yesterday duration reduction
    duration = Math.round(duration * durationScale * durationReduction);

    return { ...act, intensity, duration_minutes: duration };
  });

  return {
    source:          'mood_aware' as const,
    mood_state:      moodState,
    recommendations,
    avoid:           profile.avoid,
    max_intensity:   downgradeIntensity
      ? INTENSITY_DOWNGRADE[profile.max_intensity] || profile.max_intensity
      : profile.max_intensity,
    reasoning:       profile.reasoning,
    rest_day:        profile.rest_day_suggested,
    yesterday_considered: yesterdayActivity || null,
    adjustment_note:      adjustmentNote || 'No previous-day adjustments applied.',
  };
}