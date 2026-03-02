/**
 * services/nutrition.service.ts
 *
 * WHAT THIS FILE DOES:
 * All the "brain" logic for the nutrition feature lives here.
 * The controller calls these methods — this file talks to the database.
 *
 * Responsibilities:
 *  1. logMeal()           → save a meal + auto-calculate macros from food DB
 *  2. getDailySummary()   → fetch everything a user ate today + RDI progress
 *  3. getNutritionTrends()→ week/month history for charts
 *  4. generateMealPlan()  → rule-based personalised plan (ML hook ready)
 *  5. getRecommendations()→ smart tips based on recent eating patterns
 */

import pool from '../configs/db';

// ─────────────────────────────────────────────────────────────────────────────
// FOOD DATABASE
// Campus-specific nutrition data per common serving.
// "quantity: 1" in a log request = 1 unit of the "per" column below.
// e.g. rice quantity:2 → 2 × 100g = 260 kcal
// ─────────────────────────────────────────────────────────────────────────────
const FOOD_DB: Record<string, {
  calories: number; protein: number; carbs: number;
  fats: number; fiber: number; per: string;
}> = {
  // ── Mess staples ───────────────────────────────────────────────────────────
  rice:           { calories: 130, protein: 2.7, carbs: 28.0, fats: 0.3, fiber: 0.4, per: '100g' },
  roti:           { calories: 297, protein: 9.0, carbs: 56.0, fats: 3.7, fiber: 2.1, per: '1 piece (~80g)' },
  dal:            { calories: 116, protein: 9.0, carbs: 20.0, fats: 0.4, fiber: 8.0, per: '100g' },
  rajma:          { calories: 127, protein: 8.7, carbs: 22.8, fats: 0.5, fiber: 6.4, per: '100g' },
  chole:          { calories: 164, protein: 8.9, carbs: 27.4, fats: 2.6, fiber: 7.6, per: '100g' },
  paneer:         { calories: 265, protein: 18.0, carbs: 1.2, fats: 20.0, fiber: 0.0, per: '100g' },
  chicken_curry:  { calories: 150, protein: 20.0, carbs: 5.0, fats: 6.0, fiber: 1.0, per: '100g' },
  sabzi:          { calories:  60, protein: 2.0,  carbs: 10.0, fats: 2.0, fiber: 3.0, per: '100g' },
  curd:           { calories:  98, protein: 11.0, carbs: 3.4, fats: 4.3, fiber: 0.0, per: '100g' },
  khichdi:        { calories: 124, protein: 4.5,  carbs: 23.0, fats: 2.0, fiber: 2.5, per: '100g' },
  poha:           { calories: 130, protein: 2.5,  carbs: 28.0, fats: 0.5, fiber: 1.2, per: '100g' },
  idli:           { calories:  39, protein: 2.0,  carbs: 8.0,  fats: 0.2, fiber: 0.5, per: '1 piece' },
  dosa:           { calories: 133, protein: 3.5,  carbs: 22.0, fats: 3.7, fiber: 1.0, per: '1 medium' },
  sambar:         { calories:  55, protein: 3.0,  carbs: 9.0,  fats: 1.0, fiber: 3.0, per: '100ml' },
  // ── Snacks ─────────────────────────────────────────────────────────────────
  samosa:         { calories: 252, protein: 5.0,  carbs: 28.0, fats: 13.0, fiber: 2.0, per: '1 piece (~80g)' },
  maggi:          { calories: 380, protein: 8.0,  carbs: 52.0, fats: 15.0, fiber: 2.0, per: '1 packet' },
  banana:         { calories:  89, protein: 1.1,  carbs: 23.0, fats: 0.3,  fiber: 2.6, per: '1 medium' },
  apple:          { calories:  95, protein: 0.5,  carbs: 25.0, fats: 0.3,  fiber: 4.4, per: '1 medium' },
  egg:            { calories:  78, protein: 6.0,  carbs: 0.6,  fats: 5.0,  fiber: 0.0, per: '1 large' },
  bread:          { calories:  79, protein: 2.7,  carbs: 15.0, fats: 1.0,  fiber: 0.6, per: '1 slice' },
  peanuts:        { calories: 166, protein: 7.5,  carbs: 4.5,  fats: 14.5, fiber: 2.4, per: '30g handful' },
  biscuits:       { calories:  43, protein: 0.6,  carbs: 6.5,  fats: 1.7,  fiber: 0.2, per: '1 piece' },
  // ── Protein sources ────────────────────────────────────────────────────────
  milk:           { calories:  42, protein: 3.4,  carbs: 5.0,  fats: 1.0,  fiber: 0.0, per: '100ml' },
  paneer_bhurji:  { calories: 220, protein: 14.0, carbs: 4.0,  fats: 16.0, fiber: 0.5, per: '100g' },
  sprouts:        { calories:  30, protein: 2.6,  carbs: 5.7,  fats: 0.2,  fiber: 1.8, per: '100g' },
  // ── Beverages ──────────────────────────────────────────────────────────────
  chai:           { calories:  60, protein: 1.0,  carbs: 10.0, fats: 1.5,  fiber: 0.0, per: '1 cup (200ml)' },
  coffee:         { calories:  15, protein: 0.3,  carbs: 3.0,  fats: 0.2,  fiber: 0.0, per: '1 cup black' },
  juice:          { calories: 110, protein: 0.5,  carbs: 26.0, fats: 0.0,  fiber: 0.5, per: '1 glass (200ml)' },
  lassi:          { calories: 107, protein: 3.5,  carbs: 18.0, fats: 2.0,  fiber: 0.0, per: '1 glass (200ml)' },
  water:          { calories:   0, protein: 0.0,  carbs: 0.0,  fats: 0.0,  fiber: 0.0, per: '1 glass' },
};

// ─────────────────────────────────────────────────────────────────────────────
// RECOMMENDED DAILY INTAKE  (personalised per user profile)
// Base values — scaled by weight, fitness level, and goal
// ─────────────────────────────────────────────────────────────────────────────
function getRDI(profile: {
  weight_kg?: number;
  fitness_level?: number;
  goal?: string;
}) {
  const weight      = profile.weight_kg    || 65;
  const fitnessLvl  = profile.fitness_level || 4;
  const goal        = profile.goal          || 'balanced';

  // Base metabolic rate approximation (Mifflin-St Jeor simplified)
  let baseCalories = weight * 24;

  // Activity multiplier from fitness level
  const activityMult = fitnessLvl <= 3 ? 1.3 : fitnessLvl <= 6 ? 1.5 : 1.7;
  let tdee = Math.round(baseCalories * activityMult);

  // Adjust for goal
  if (goal === 'weight_loss')  tdee -= 300;
  if (goal === 'muscle_gain')  tdee += 300;

  return {
    calories: tdee,
    protein:  Math.round(weight * 1.6),        // 1.6g per kg body weight
    carbs:    Math.round((tdee * 0.50) / 4),   // 50% of calories from carbs
    fats:     Math.round((tdee * 0.25) / 9),   // 25% of calories from fats
    fiber:    28,
    water_ml: 35 * weight,                      // 35ml per kg
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function lookupNutrition(name: string, quantity: number) {
  const key  = name.toLowerCase().trim().replace(/\s+/g, '_');
  const base = FOOD_DB[key];
  if (!base) {
    return { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, found: false };
  }
  return {
    calories: +(base.calories * quantity).toFixed(1),
    protein:  +(base.protein  * quantity).toFixed(1),
    carbs:    +(base.carbs    * quantity).toFixed(1),
    fats:     +(base.fats     * quantity).toFixed(1),
    fiber:    +(base.fiber    * quantity).toFixed(1),
    found:    true,
  };
}

function sumNutrition(items: any[]) {
  return items.reduce(
    (acc, item) => {
      acc.calories += Number(item.calories) || 0;
      acc.protein  += Number(item.protein)  || 0;
      acc.carbs    += Number(item.carbs)    || 0;
      acc.fats     += Number(item.fats)     || 0;
      acc.fiber    += Number(item.fiber)    || 0;
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 }
  );
}

function round1(n: number) { return +n.toFixed(1); }

/** Fill missing dates in trend data so chart lines are continuous */
function fillDateGaps(rows: any[], days: number) {
  const map = new Map<string, any>();
  rows.forEach((r) => {
    const key = r.date instanceof Date
      ? r.date.toISOString().split('T')[0]
      : String(r.date).split('T')[0];
    map.set(key, r);
  });

  const result = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().split('T')[0];
    result.push(
      map.get(key) || {
        date: key, calories: 0, protein: 0,
        carbs: 0, fats: 0, fiber: 0, meal_count: 0,
      }
    );
  }
  return result;
}

function avgOf(arr: any[], key: string) {
  if (!arr.length) return 0;
  return round1(arr.reduce((s, r) => s + parseFloat(r[key] || 0), 0) / arr.length);
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────────────────
export const nutritionService = {

  // ── 1. LOG MEAL ─────────────────────────────────────────────────────────────
  /**
   * Save a meal to food_logs.
   * Automatically calculates calories/macros for each item from FOOD_DB.
   * If an item isn't found in FOOD_DB it still saves with 0 values
   * (student can override manually — UI concern).
   */
  async logMeal(userId: string, body: {
    meal_type: string;
    items:     { name: string; quantity: number; unit?: string; source?: string }[];
    location?: string;
    notes?:    string;
  }) {
    const { meal_type, items, location, notes } = body;

    // Enrich every item with auto-calculated nutrition
    const enrichedItems = items.map((item) => {
      const nutrition = lookupNutrition(item.name, item.quantity ?? 1);
      return {
        name:     item.name,
        quantity: item.quantity ?? 1,
        unit:     item.unit   || 'serving',
        source:   item.source || 'mess',      // mess | canteen | room | other
        ...nutrition,
      };
    });

    const totals = sumNutrition(enrichedItems);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `INSERT INTO food_logs
           (user_id, meal_type, items, location, notes,
            total_calories, total_protein, total_carbs, total_fats, total_fiber,
            logged_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, NOW())
         RETURNING *`,
        [
          userId, meal_type,
          JSON.stringify(enrichedItems),
          location || null, notes || null,
          round1(totals.calories), round1(totals.protein),
          round1(totals.carbs),    round1(totals.fats),
          round1(totals.fiber),
        ]
      );

      await client.query('COMMIT');

      return {
        ...rows[0],
        items:  enrichedItems,
        totals: {
          calories: round1(totals.calories),
          protein:  round1(totals.protein),
          carbs:    round1(totals.carbs),
          fats:     round1(totals.fats),
          fiber:    round1(totals.fiber),
        },
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  // ── 2. DAILY SUMMARY ────────────────────────────────────────────────────────
  /**
   * Returns everything a user ate on a given date (defaults to today).
   * Also includes:
   *   - RDI progress bars (consumed vs recommended)
   *   - Which meals (breakfast/lunch/snacks/dinner) are logged vs missing
   *   - Smart tip based on the day's intake
   */
  async getDailySummary(userId: string, date?: string) {
    const targetDate = date || new Date().toISOString().split('T')[0];

    // Fetch all meal logs for the day
    const { rows: meals } = await pool.query(
      `SELECT id, meal_type, items, location, notes,
              total_calories, total_protein, total_carbs, total_fats, total_fiber,
              logged_at
       FROM food_logs
       WHERE user_id = $1 AND DATE(logged_at AT TIME ZONE 'UTC') = $2
       ORDER BY logged_at ASC`,
      [userId, targetDate]
    );

    // Fetch user profile for personalised RDI
    const { rows: userRows } = await pool.query(
      'SELECT weight_kg, fitness_level FROM users WHERE id = $1',
      [userId]
    );
    const rdi = getRDI(userRows[0] || {});

    // Aggregate day totals
    const totals = {
      calories: round1(meals.reduce((s, r) => s + parseFloat(r.total_calories || 0), 0)),
      protein:  round1(meals.reduce((s, r) => s + parseFloat(r.total_protein  || 0), 0)),
      carbs:    round1(meals.reduce((s, r) => s + parseFloat(r.total_carbs    || 0), 0)),
      fats:     round1(meals.reduce((s, r) => s + parseFloat(r.total_fats     || 0), 0)),
      fiber:    round1(meals.reduce((s, r) => s + parseFloat(r.total_fiber    || 0), 0)),
    };

    // RDI progress (how much of the daily target has been hit)
    const rdi_progress = {
      calories: { consumed: totals.calories, recommended: rdi.calories, pct: round1((totals.calories / rdi.calories) * 100) },
      protein:  { consumed: totals.protein,  recommended: rdi.protein,  pct: round1((totals.protein  / rdi.protein)  * 100) },
      carbs:    { consumed: totals.carbs,    recommended: rdi.carbs,    pct: round1((totals.carbs    / rdi.carbs)    * 100) },
      fats:     { consumed: totals.fats,     recommended: rdi.fats,     pct: round1((totals.fats     / rdi.fats)     * 100) },
      fiber:    { consumed: totals.fiber,    recommended: rdi.fiber,    pct: round1((totals.fiber    / rdi.fiber)    * 100) },
    };

    // Which standard meals have been logged today
    const loggedTypes = new Set(meals.map((m) => m.meal_type));
    const meal_status = ['breakfast', 'lunch', 'snacks', 'dinner'].map((type) => ({
      type,
      logged: loggedTypes.has(type),
    }));

    // Smart tip — single most impactful recommendation for the day
    const tip = generateDailyTip(totals, rdi);

    return {
      date:         targetDate,
      meals,
      totals,
      rdi,
      rdi_progress,
      meal_status,
      meal_count:   meals.length,
      tip,
    };
  },

  // ── 3. NUTRITION TRENDS ─────────────────────────────────────────────────────
  /**
   * Returns daily nutrition aggregates for the past N days (default 30, max 90).
   * Gaps (days with no logs) are filled with zeros so charts render correctly.
   * Also returns period averages and a weekly breakdown.
   */
  async getNutritionTrends(userId: string, days: number = 30) {
    days = Math.min(days, 90);

    const { rows } = await pool.query(
      `SELECT
         DATE(logged_at AT TIME ZONE 'UTC')  AS date,
         SUM(total_calories)::numeric(10,1)  AS calories,
         SUM(total_protein)::numeric(10,1)   AS protein,
         SUM(total_carbs)::numeric(10,1)     AS carbs,
         SUM(total_fats)::numeric(10,1)      AS fats,
         SUM(total_fiber)::numeric(10,1)     AS fiber,
         COUNT(*)::integer                   AS meal_count
       FROM food_logs
       WHERE user_id = $1
         AND logged_at >= NOW() - ($2 || ' days')::interval
       GROUP BY DATE(logged_at AT TIME ZONE 'UTC')
       ORDER BY date ASC`,
      [userId, days]
    );

    const data       = fillDateGaps(rows, days);
    const activeDays = data.filter((d) => Number(d.calories) > 0);

    const averages = activeDays.length
      ? {
          calories:   avgOf(activeDays, 'calories'),
          protein:    avgOf(activeDays, 'protein'),
          carbs:      avgOf(activeDays, 'carbs'),
          fats:       avgOf(activeDays, 'fats'),
          fiber:      avgOf(activeDays, 'fiber'),
          meal_count: avgOf(activeDays, 'meal_count'),
        }
      : null;

    // Weekly buckets (last 4 weeks) — useful for the frontend bar chart
    const weekly = buildWeeklyBuckets(data);

    return {
      period_days: days,
      days_logged: activeDays.length,
      data,
      averages,
      weekly,
    };
  },

  // ── 4. GENERATE MEAL PLAN ───────────────────────────────────────────────────
  /**
   * Generates a personalised N-day meal plan.
   * Uses the user's dietary preferences + fitness goal.
   * Designed to be swapped for a real ML call when the Python service is ready.
   */
  async generateMealPlan(userId: string, body: {
    goal:                 string;   // 'balanced' | 'weight_loss' | 'muscle_gain'
    dietary_restrictions: string[];
    days:                 number;
  }) {
    const { goal, dietary_restrictions, days } = body;

    // Fetch user profile for personalisation
    const { rows: userRows } = await pool.query(
      `SELECT weight_kg, height_cm, age, fitness_level, dietary_preferences
       FROM users WHERE id = $1`,
      [userId]
    );
    const profile = userRows[0] || {};

    // Merge stored dietary prefs + request-time restrictions
    const storedPrefs: string[] = Array.isArray(profile.dietary_preferences)
      ? profile.dietary_preferences
      : JSON.parse(profile.dietary_preferences || '[]');
    const allRestrictions = [...new Set([...storedPrefs, ...dietary_restrictions])];

    const rdi  = getRDI({ ...profile, goal });
    const plan = buildMealPlan({ goal, restrictions: allRestrictions, days, rdi });

    return {
      source:   'rule_based',   // swap to 'ml' when Python service is live
      goal,
      rdi,
      plan,
      note: 'Meal plan generated based on your profile and dietary preferences.',
    };
  },

  // ── 5. SMART RECOMMENDATIONS ────────────────────────────────────────────────
  /**
   * Analyses the last 7 days of nutrition and returns 2-4 actionable tips.
   * Called by the dashboard to show the "Personalized Insights" card.
   */
  async getRecommendations(userId: string) {
    const { rows } = await pool.query(
      `SELECT
         SUM(total_calories) / NULLIF(COUNT(DISTINCT DATE(logged_at)),0) AS avg_calories,
         SUM(total_protein)  / NULLIF(COUNT(DISTINCT DATE(logged_at)),0) AS avg_protein,
         SUM(total_fiber)    / NULLIF(COUNT(DISTINCT DATE(logged_at)),0) AS avg_fiber,
         COUNT(DISTINCT DATE(logged_at))                                  AS days_logged
       FROM food_logs
       WHERE user_id = $1 AND logged_at >= NOW() - INTERVAL '7 days'`,
      [userId]
    );

    const { rows: userRows } = await pool.query(
      'SELECT weight_kg, fitness_level FROM users WHERE id = $1',
      [userId]
    );

    const stats   = rows[0] || {};
    const rdi     = getRDI(userRows[0] || {});
    const tips    = buildRecommendations(stats, rdi);

    return { period: '7 days', tips };
  },

  // ── 6. FOOD SEARCH ──────────────────────────────────────────────────────────
  /**
   * Returns matching food items from FOOD_DB.
   * Used by the frontend autocomplete when logging a meal.
   */
  searchFoods(query: string) {
    const q = query.toLowerCase().trim();
    const results = Object.entries(FOOD_DB)
      .filter(([key]) => key.includes(q.replace(/\s+/g, '_')))
      .map(([key, val]) => ({
        name:     key.replace(/_/g, ' '),
        per:      val.per,
        calories: val.calories,
        protein:  val.protein,
        carbs:    val.carbs,
        fats:     val.fats,
        fiber:    val.fiber,
      }));
    return results;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Single most impactful daily tip based on today's intake vs RDI */
function generateDailyTip(
  totals: { calories: number; protein: number; fiber: number; fats: number },
  rdi:    { calories: number; protein: number; fiber: number; fats: number }
): string {
  if (totals.calories === 0) return "You haven't logged any meals today. Start by logging your breakfast!";
  if (totals.protein < rdi.protein * 0.6)  return `Your protein is low (${totals.protein}g / ${rdi.protein}g). Add dal, paneer, eggs, or sprouts to your next meal.`;
  if (totals.fiber   < rdi.fiber   * 0.5)  return `Boost your fiber intake (${totals.fiber}g / ${rdi.fiber}g). Include more sabzi, fruits, and whole grains.`;
  if (totals.fats    > rdi.fats    * 1.3)  return `Your fat intake is high today (${totals.fats}g). Go easy on fried snacks and opt for grilled options.`;
  if (totals.calories > rdi.calories * 0.9) return "Great job hitting your calorie target today! Stay hydrated.";
  return `You still have ${Math.round(rdi.calories - totals.calories)} kcal remaining. Consider a balanced dinner.`;
}

/** Aggregates daily data into 4 weekly buckets */
function buildWeeklyBuckets(data: any[]) {
  const weeks: any[] = [[], [], [], []];
  data.forEach((d, i) => {
    const weekIdx = Math.floor(i / 7);
    if (weekIdx < 4) weeks[weekIdx].push(d);
  });

  return weeks.map((week, i) => ({
    week:    i + 1,
    label:   `Week ${i + 1}`,
    avg_calories: avgOf(week.filter((d: any) => Number(d.calories) > 0), 'calories'),
    avg_protein:  avgOf(week.filter((d: any) => Number(d.calories) > 0), 'protein'),
    days_logged:  week.filter((d: any) => Number(d.calories) > 0).length,
  }));
}

/** Rule-based meal plan builder */
function buildMealPlan(opts: {
  goal:         string;
  restrictions: string[];
  days:         number;
  rdi:          any;
}) {
  const { goal, restrictions, days, rdi } = opts;
  const isVeg    = restrictions.some((r) => ['vegetarian', 'vegan', 'jain'].includes(r));
  const isVegan  = restrictions.includes('vegan');

  const breakfast = isVeg
    ? ['Poha + chai', 'Oats + banana + milk', 'Idli (2) + sambar', '2 Roti + sabzi + curd', 'Upma + juice']
    : ['Eggs (2 boiled) + roti + chai', 'Oats + milk + banana', 'Bread + egg bhurji + juice', 'Poha + chai', 'Idli + sambar'];

  const lunch = isVeg
    ? ['Rice + dal + sabzi + curd', 'Roti (2) + paneer curry + salad', 'Rajma chawal + raita', 'Chole + roti + curd', 'Khichdi + sabzi']
    : ['Rice + chicken curry + salad', 'Roti + dal + egg curry', 'Rajma chawal + curd', 'Rice + sabzi + curd', 'Pulao + raita'];

  const snacks = isVegan
    ? ['Banana', 'Sprouts chaat', 'Peanuts handful', 'Apple', 'Fruit bowl']
    : ['Banana + milk', 'Peanuts handful', 'Sprouts chaat + lassi', 'Biscuits + chai', 'Egg boiled'];

  const dinner = isVeg
    ? ['2 Roti + dal + sabzi', 'Rice + rajma + salad', 'Khichdi + curd', 'Roti + paneer + salad', 'Dal + roti + sabzi']
    : ['Roti + chicken + salad', '2 Roti + dal + sabzi', 'Rice + dal + egg', 'Roti + sabzi + curd', 'Khichdi + egg'];

  return Array.from({ length: days }, (_, i) => ({
    day:             i + 1,
    breakfast:       breakfast[i % breakfast.length],
    lunch:           lunch[i    % lunch.length],
    snacks:          snacks[i   % snacks.length],
    dinner:          dinner[i   % dinner.length],
    target_calories: rdi.calories,
    target_protein:  rdi.protein,
    goal,
  }));
}

/** Actionable recommendation tips based on 7-day averages */
function buildRecommendations(
  stats: { avg_calories?: number; avg_protein?: number; avg_fiber?: number; days_logged?: number },
  rdi:   { calories: number; protein: number; fiber: number }
) {
  const tips: { type: string; priority: string; message: string }[] = [];

  const avgCal  = Number(stats.avg_calories || 0);
  const avgProt = Number(stats.avg_protein  || 0);
  const avgFiber= Number(stats.avg_fiber    || 0);
  const logged  = Number(stats.days_logged  || 0);

  if (logged < 5) {
    tips.push({ type: 'habit', priority: 'high', message: `You've only logged meals on ${logged}/7 days. Consistent logging helps you see real patterns.` });
  }
  if (avgCal < rdi.calories * 0.80) {
    tips.push({ type: 'calories', priority: 'high', message: `Your average intake (${Math.round(avgCal)} kcal) is well below your target (${rdi.calories} kcal). You may be under-fuelling your day.` });
  }
  if (avgProt < rdi.protein * 0.75) {
    tips.push({ type: 'protein', priority: 'high', message: `Protein average is low (${Math.round(avgProt)}g vs ${rdi.protein}g target). Add dal, paneer, or eggs to every meal.` });
  }
  if (avgFiber < rdi.fiber * 0.60) {
    tips.push({ type: 'fiber', priority: 'medium', message: `Increase fiber (${Math.round(avgFiber)}g vs ${rdi.fiber}g). Eat more fruits, sabzi, and whole grains.` });
  }
  if (tips.length === 0) {
    tips.push({ type: 'general', priority: 'low', message: 'Great eating habits this week! Keep it up and stay hydrated.' });
  }
  return tips;
}

export default nutritionService;