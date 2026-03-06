/**
 * services/mood-nutrition.service.ts
 *
 * Generates mood-aware meal recommendations.
 * Uses science-backed food-mood connections:
 *
 *   Tryptophan  → Serotonin (mood stabilizer):     banana, milk, oats, curd
 *   Magnesium   → Relaxation / anti-anxiety:        banana, dark chocolate, spinach
 *   Complex carbs → Steady blood sugar:             oats, whole grains, khichdi
 *   Iron        → Combats fatigue:                  eggs, sprouts, dal, spinach
 *   B Vitamins  → Energy production:                eggs, dal, sprouts
 *   Protein     → Muscle repair + alertness:        paneer, egg, chicken, dal
 *   Omega-3     → Anti-inflammatory (anti-depression): fish, walnuts
 *
 * All recommended foods map directly to items in FOOD_DB from
 * services/nutrition.service.ts, so calorie calculations still work.
 */

import { MoodState } from './sentiment.service';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────���───────────
interface MoodNutritionProfile {
  boost_nutrients:   string[];
  limit:             string[];
  recommended_foods: string[];
  meal_adjustments: {
    breakfast: string[];
    lunch:     string[];
    snacks:    string[];
    dinner:    string[];
  };
  /** Calorie multiplier (1.0 = no change) */
  calorie_factor: number;
  /** Science-backed reasoning shown to the user */
  reasoning: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// MOOD → NUTRITION MAPPING
// ─────────────────────────────────────────────────────────────────────────────
const MOOD_NUTRITION_MAP: Record<MoodState, MoodNutritionProfile> = {

  // ── STRESSED / ANXIOUS ──────────────────────────────────────────────────
  stressed_anxious: {
    boost_nutrients: ['magnesium', 'tryptophan', 'complex_carbs', 'B_vitamins'],
    limit:           ['caffeine', 'sugar', 'fried_food'],
    recommended_foods: ['banana', 'milk', 'oats', 'curd', 'dal', 'khichdi'],
    meal_adjustments: {
      breakfast: [
        'Oats + banana + warm milk',
        'Poha + curd + banana',
        'Upma + chai (decaf)',
      ],
      lunch: [
        'Khichdi + curd + sabzi',
        'Dal + roti + banana',
        'Rice + dal + raita',
      ],
      snacks: [
        'Banana + warm milk',
        'Curd + fruit bowl',
        'Peanuts + banana',
      ],
      dinner: [
        'Khichdi + sabzi',
        'Roti + dal + curd',
        'Rice + dal + light sabzi',
      ],
    },
    calorie_factor: 1.0,
    reasoning:
      'Your journal suggests elevated stress. We\'ve included tryptophan-rich foods ' +
      '(banana, milk, curd) and magnesium sources to support serotonin production ' +
      'and calm your nervous system. Avoiding excess caffeine and fried snacks will ' +
      'help reduce jitteriness.',
  },

  // ── FATIGUED / LOW ENERGY ───────────────────────────────────────────────
  fatigued_low: {
    boost_nutrients: ['iron', 'B_vitamins', 'complex_carbs', 'protein'],
    limit:           ['heavy_meals', 'excess_sugar'],
    recommended_foods: ['egg', 'sprouts', 'dal', 'banana', 'oats', 'poha', 'paneer'],
    meal_adjustments: {
      breakfast: [
        'Eggs (2 boiled) + roti + juice',
        'Oats + banana + milk',
        'Sprouts + toast + chai',
      ],
      lunch: [
        'Rice + dal + egg curry + salad',
        'Roti + paneer + spinach sabzi',
        'Rajma chawal + raita',
      ],
      snacks: [
        'Banana + peanuts',
        'Sprouts chaat',
        'Egg boiled + chai',
      ],
      dinner: [
        'Roti + dal + sabzi',
        'Khichdi + egg + curd',
        'Rice + dal + paneer',
      ],
    },
    calorie_factor: 1.05, // slight increase — body needs fuel
    reasoning:
      'Your mood log indicates fatigue. We\'ve boosted iron-rich foods (eggs, sprouts, dal) ' +
      'and B-vitamin sources for energy production. Complex carbs provide sustained energy ' +
      'without crashes.',
  },

  // ── SAD / DEMOTIVATED ───────────────────────────────────────────────────
  sad_demotivated: {
    boost_nutrients: ['tryptophan', 'omega_3', 'vitamin_D', 'comfort_foods'],
    limit:           ['alcohol', 'excess_caffeine'],
    recommended_foods: ['milk', 'banana', 'curd', 'paneer', 'oats', 'khichdi'],
    meal_adjustments: {
      breakfast: [
        'Oats + banana + warm milk',
        'Poha + chai + banana',
        'Idli + sambar + curd',
      ],
      lunch: [
        'Comfort khichdi + curd + papad',
        'Rajma chawal + raita',
        'Dal tadka + roti + salad',
      ],
      snacks: [
        'Warm milk + biscuits',
        'Banana + curd',
        'Fruit bowl + peanuts',
      ],
      dinner: [
        'Khichdi + sabzi + curd',
        'Roti + paneer + dal',
        'Rice + dal + comfort sabzi',
      ],
    },
    calorie_factor: 1.0,
    reasoning:
      'We noticed you\'re feeling low. We\'ve included comfort foods that also boost ' +
      'serotonin — warm khichdi, banana, milk, and curd are scientifically linked to ' +
      'improved mood. Don\'t skip meals — consistent nutrition helps stabilize mood.',
  },

  // ── POSITIVE / MOTIVATED ───────────────────────────────────────────────
  positive_motivated: {
    boost_nutrients: ['protein', 'complex_carbs', 'fiber'],
    limit:           [],
    recommended_foods: ['egg', 'paneer', 'chicken_curry', 'sprouts', 'dal', 'roti'],
    meal_adjustments: {
      breakfast: [
        'Eggs (3) + roti + juice',
        'Oats + protein (milk/egg) + banana',
        'Sprouts + toast + chai',
      ],
      lunch: [
        'Rice + chicken curry + salad',
        'Roti (2) + paneer + dal',
        'Rajma chawal + curd + salad',
      ],
      snacks: [
        'Protein shake (milk + banana + peanuts)',
        'Sprouts + egg boiled',
        'Peanuts + fruit',
      ],
      dinner: [
        'Roti + chicken + salad',
        'Rice + dal + paneer',
        'Roti (2) + sabzi + curd + egg',
      ],
    },
    calorie_factor: 1.1, // fuel the motivation!
    reasoning:
      'You\'re in a great headspace! We\'ve optimized for performance with higher protein ' +
      'and complex carbs. This is a good day to push harder with nutrition to match your energy.',
  },

  // ── NEUTRAL ─────────────────────────────────────────────────────────────
  neutral: {
    boost_nutrients: ['balanced'],
    limit:           [],
    recommended_foods: ['rice', 'roti', 'dal', 'sabzi', 'curd'],
    meal_adjustments: {
      breakfast: [
        'Poha + chai',
        'Oats + banana + milk',
        'Idli (2) + sambar',
      ],
      lunch: [
        'Rice + dal + sabzi + curd',
        'Roti (2) + paneer curry + salad',
        'Rajma chawal + raita',
      ],
      snacks: [
        'Banana + milk',
        'Peanuts handful',
        'Biscuits + chai',
      ],
      dinner: [
        'Roti + dal + sabzi',
        'Rice + rajma + salad',
        'Khichdi + curd',
      ],
    },
    calorie_factor: 1.0,
    reasoning:
      'Your mood is balanced today. We\'re recommending a standard nutritious plan. Keep it up!',
  },

  // ── PAIN / RECOVERY ─────────────────────────────────────────────────────
  pain_recovery: {
    boost_nutrients: ['protein', 'anti_inflammatory', 'vitamin_C', 'calcium'],
    limit:           ['heavy_exercise_foods', 'excess_sugar'],
    recommended_foods: ['milk', 'curd', 'egg', 'paneer', 'banana', 'dal'],
    meal_adjustments: {
      breakfast: [
        'Milk + oats + banana',
        'Eggs (2 boiled) + toast + juice',
        'Curd + fruit bowl',
      ],
      lunch: [
        'Dal + roti + paneer + curd',
        'Rice + egg curry + salad',
        'Khichdi + curd + papad',
      ],
      snacks: [
        'Milk + banana',
        'Curd + sprouts',
        'Fruit bowl',
      ],
      dinner: [
        'Roti + dal + curd + light sabzi',
        'Khichdi + egg + curd',
        'Rice + dal + paneer',
      ],
    },
    calorie_factor: 0.95, // slightly reduced — less activity
    reasoning:
      'Since you mentioned pain or injury, we\'ve focused on recovery nutrition — ' +
      'extra protein for tissue repair, calcium for bones, and anti-inflammatory foods. ' +
      'Take it easy today.',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a mood-aware meal plan for the given mood state.
 *
 * @param moodState - classified mood from sentiment analysis
 * @param days      - number of days to plan (default 1)
 * @param isVeg     - whether user is vegetarian/vegan
 */
export function getMoodAwareMealPlan(
  moodState: MoodState,
  days: number  = 1,
  isVeg: boolean = false,
) {
  const profile = MOOD_NUTRITION_MAP[moodState];

  const plan = Array.from({ length: days }, (_, i) => ({
    day:               i + 1,
    breakfast:         profile.meal_adjustments.breakfast[i % profile.meal_adjustments.breakfast.length],
    lunch:             profile.meal_adjustments.lunch[i % profile.meal_adjustments.lunch.length],
    snacks:            profile.meal_adjustments.snacks[i % profile.meal_adjustments.snacks.length],
    dinner:            profile.meal_adjustments.dinner[i % profile.meal_adjustments.dinner.length],
    calorie_adjustment: `${Math.round(profile.calorie_factor * 100)}% of normal`,
    mood_state:        moodState,
  }));

  return {
    source:           'mood_aware' as const,
    mood_state:       moodState,
    plan,
    reasoning:        profile.reasoning,
    boost_nutrients:  profile.boost_nutrients,
    limit:            profile.limit,
    recommended_foods: profile.recommended_foods,
  };
}