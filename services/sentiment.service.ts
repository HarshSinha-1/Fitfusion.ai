/**
 * services/sentiment.service.ts
 *
 * Sentiment Analysis Engine for FitFusion.
 * Uses the AFINN-165 lexicon (via `sentiment` npm package) for base sentiment,
 * plus a custom emotion-keyword detector for campus fitness/wellness context.
 *
 * WHY THIS APPROACH:
 *  - Runs 100% in Node.js — no Python, no external API, no keys
 *  - ~0.1ms per analysis (vs ~500ms for HuggingFace API)
 *  - Custom lexicon makes it campus-fitness-aware
 *  - Deterministic, testable, explainable
 */

import Sentiment from 'sentiment';

const analyzer = new Sentiment();

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOM EMOTION LEXICON — campus + fitness context
// Maps keywords found in journal text to specific emotion categories.
// ─────────────────────────────────────────────────────────────────────────────
const EMOTION_KEYWORDS: Record<string, string[]> = {
  anxiety:  [
    'anxious', 'worried', 'nervous', 'panic', 'overwhelmed',
    'exam', 'deadline', 'assignment', 'viva', 'presentation',
    'fear', 'dread', 'uneasy', 'restless',
  ],
  stress:   [
    'stressed', 'pressure', 'tension', 'burnout', 'overworked',
    'exhausted', 'hectic', 'rushed', 'too much', 'can\'t cope',
  ],
  fatigue:  [
    'tired', 'fatigued', 'sleepy', 'drained', 'lethargic',
    'no energy', 'low energy', 'groggy', 'insomnia', 'didn\'t sleep',
    'sleep deprived', 'drowsy', 'worn out',
  ],
  sadness:  [
    'sad', 'depressed', 'lonely', 'homesick', 'down', 'upset',
    'crying', 'hopeless', 'unmotivated', 'empty', 'numb',
    'miss home', 'miss family',
  ],
  anger:    [
    'angry', 'frustrated', 'irritated', 'annoyed', 'furious',
    'hostile', 'rage', 'pissed', 'mad',
  ],
  joy:      [
    'happy', 'excited', 'great', 'amazing', 'wonderful',
    'motivated', 'energetic', 'proud', 'accomplished', 'pumped',
    'fantastic', 'awesome', 'confident', 'thrilled', 'grateful',
  ],
  calm:     [
    'calm', 'relaxed', 'peaceful', 'content', 'serene',
    'meditated', 'mindful', 'balanced', 'at ease',
  ],
  social:   [
    'friends', 'hangout', 'party', 'fun', 'laughed',
    'together', 'group', 'bonding', 'team',
  ],
  pain:     [
    'pain', 'sore', 'injury', 'hurt', 'cramp', 'ache',
    'sprain', 'pulled muscle', 'stiff', 'swollen',
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
export interface SentimentResult {
  /** Normalized score from -1.0 (very negative) to +1.0 (very positive) */
  score: number;
  /** Human-readable label */
  label: 'positive' | 'negative' | 'neutral';
  /** Raw AFINN comparative score (for debugging) */
  raw_comparative: number;
  /** Detected emotion categories with intensity (0-1) */
  emotions: { emotion: string; intensity: number }[];
  /** Single most dominant emotion */
  primary_emotion: string;
  /** How confident the model is in its result (0-1) */
  confidence: number;
  /** Words that contributed positively */
  positive_words: string[];
  /** Words that contributed negatively */
  negative_words: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE ANALYSIS FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analyze free-text journal entry and return sentiment + emotions.
 *
 * How it works:
 * 1. AFINN-165 lexicon scores every word on a -5 to +5 scale
 * 2. We normalize the comparative score to [-1, +1]
 * 3. We scan for emotion keywords from our custom campus lexicon
 * 4. We determine the primary emotion and confidence
 */
export function analyzeSentiment(text: string): SentimentResult {
  if (!text || text.trim().length === 0) {
    return {
      score: 0,
      label: 'neutral',
      raw_comparative: 0,
      emotions: [],
      primary_emotion: 'neutral',
      confidence: 0,
      positive_words: [],
      negative_words: [],
    };
  }

  // 1. Run AFINN-165 sentiment analysis
  const result = analyzer.analyze(text);

  // 2. Normalize comparative score to [-1, 1]
  //    AFINN comparative is typically in [-5, 5] range for short texts
  const normalized = Math.max(-1, Math.min(1, result.comparative * 0.2));

  // 3. Determine label using small deadband around zero
  const label: SentimentResult['label'] =
    normalized > 0.05  ? 'positive' :
    normalized < -0.05 ? 'negative' :
    'neutral';

  // 4. Detect emotions from custom lexicon
  const lowerText = text.toLowerCase();
  const emotions: { emotion: string; intensity: number }[] = [];

  for (const [emotion, keywords] of Object.entries(EMOTION_KEYWORDS)) {
    const matches = keywords.filter((kw) => lowerText.includes(kw));
    if (matches.length > 0) {
      emotions.push({
        emotion,
        intensity: Math.min(1, matches.length * 0.3), // cap at 1.0
      });
    }
  }

  // Sort by intensity descending
  emotions.sort((a, b) => b.intensity - a.intensity);

  // 5. Determine primary emotion
  const primary_emotion = emotions.length > 0
    ? emotions[0].emotion
    : (label === 'positive' ? 'joy' : label === 'negative' ? 'stress' : 'neutral');

  // 6. Calculate confidence
  //    Based on: how many sentiment-bearing words vs total tokens
  //    + bonus for emotion keyword matches
  const totalTokens     = result.tokens.length || 1;
  const sentimentTokens = (result.positive?.length || 0) + (result.negative?.length || 0);
  const confidence      = Math.min(1, (sentimentTokens / totalTokens) + (emotions.length * 0.1));

  return {
    score:            Math.round(normalized * 100) / 100,
    label,
    raw_comparative:  result.comparative,
    emotions,
    primary_emotion,
    confidence:       Math.round(confidence * 100) / 100,
    positive_words:   result.positive || [],
    negative_words:   result.negative || [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MOOD STATE CLASSIFICATION
// Combines sentiment analysis + numeric mood_score + mood_tags into a single
// actionable state used by meal/workout recommenders.
// ─────────────────────────────────────────────────────────────────────────────
export type MoodState =
  | 'stressed_anxious'
  | 'fatigued_low'
  | 'sad_demotivated'
  | 'positive_motivated'
  | 'neutral'
  | 'pain_recovery';

/**
 * Classify the user's current mood into one of 6 states.
 *
 * Priority order:
 *   pain → fatigue → stress/anxiety → sadness → positive → neutral
 *
 * This ordering ensures safety-first: injuries and exhaustion override
 * everything else, because recommending intense workouts when injured
 * could cause harm.
 */
export function classifyMoodState(
  sentiment: SentimentResult,
  moodScore: number,    // 1-10 from the mood_logs slider
  moodTags:  string[]   // from the mood_logs tag picker
): MoodState {
  const emotionSet = new Set(sentiment.emotions.map((e) => e.emotion));
  const tagSet     = new Set(moodTags.map((t) => t.toLowerCase()));

  // ── 1. Pain/injury — highest priority (safety) ──────────────────────────
  if (emotionSet.has('pain') || tagSet.has('injured') || tagSet.has('sore') || tagSet.has('pain')) {
    return 'pain_recovery';
  }

  // ── 2. Fatigue — rest is essential ──────────────────────────────────────
  if (
    emotionSet.has('fatigue') ||
    tagSet.has('tired') || tagSet.has('exhausted') || tagSet.has('sleepy') ||
    moodScore <= 3
  ) {
    return 'fatigued_low';
  }

  // ── 3. Stress / Anxiety ─────────────────────────────────────────────────
  if (
    emotionSet.has('anxiety') || emotionSet.has('stress') ||
    tagSet.has('stressed') || tagSet.has('anxious')
  ) {
    return 'stressed_anxious';
  }

  // ── 4. Sadness / Demotivation ───────────────────────────────────────────
  if (
    emotionSet.has('sadness') ||
    tagSet.has('sad') || tagSet.has('demotivated') || tagSet.has('lonely') ||
    (moodScore <= 4 && sentiment.score < -0.2)
  ) {
    return 'sad_demotivated';
  }

  // ── 5. Positive / Motivated ─────────────────────────────────────────────
  if (
    sentiment.score > 0.1 ||
    moodScore >= 7 ||
    emotionSet.has('joy') || emotionSet.has('calm') ||
    tagSet.has('motivated') || tagSet.has('happy') || tagSet.has('energetic')
  ) {
    return 'positive_motivated';
  }

  // ── 6. Default ──────────────────────────────────────────────────────────
  return 'neutral';
}