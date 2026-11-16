import {
  BalanceAuditItem,
  BalanceConstraints,
  CareerDesignNotes,
  CareerMod,
  CareerTier,
  TierEconomyMetrics,
  Weekday,
} from '../types/career.ts';

export const DEFAULT_CONSTRAINTS: BalanceConstraints = {
  tierCount: 10,
  archetype: 'balanced',
  minWeeklyPayFloor: 200,
  maxWeeklyPayCap: 25000,
  maxWeeklyHours: 70,
  maxDaysPerWeek: 7,
  maxMotiveMultiplier: 2.0,
  enforceMonotonicIncome: true,
  enforceMonotonicSkill: true,
  customRules: '',
};

export const WEEKDAY_ORDER: Weekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export function computeShiftHours(startHour: number, endHour: number): number {
  const start = ((startHour % 24) + 24) % 24;
  const end = ((endHour % 24) + 24) % 24;
  if (end === start) return 24;
  return end > start ? end - start : 24 - start + end;
}

export function formatHourRange(startHour: number, endHour: number): string {
  const pad = (h: number) => `${String(((h % 24) + 24) % 24).padStart(2, '0')}:00`;
  const overnight = endHour <= startHour;
  return `${pad(startHour)}–${pad(endHour)}${overnight ? ' (+1d)' : ''}`;
}

export function computeTierMetrics(tier: CareerTier): TierEconomyMetrics {
  const shiftHours = computeShiftHours(tier.schedule.start_hour, tier.schedule.end_hour);
  const workDaysPerWeek = tier.schedule.days.length;
  const weeklyHours = shiftHours * workDaysPerWeek;
  const shiftBasePay = Math.round(shiftHours * tier.hourly_wage);
  const weeklyBasePay = Math.round(weeklyHours * tier.hourly_wage);

  const [bMin, bMax] = tier.bonus_system.bonus_range;
  const bonusAvg = Math.round((bMin + bMax) / 2);
  const expectedBonusPerShift = Math.round(bonusAvg * tier.bonus_system.base_probability);
  const weeklyExpectedTotal = Math.round(
    weeklyBasePay + expectedBonusPerShift * workDaysPerWeek
  );
  const bonusToBaseRatio =
    shiftBasePay > 0 ? Number((expectedBonusPerShift / shiftBasePay).toFixed(2)) : 0;

  const motiveValues = Object.values(tier.motive_drain_multipliers || {});
  const maxMotiveMultiplier =
    motiveValues.length > 0 ? Math.max(...motiveValues) : 1.0;

  const skillTotal = Object.values(tier.skill_requirement || {}).reduce(
    (acc, val) => acc + Number(val || 0),
    0
  );

  return {
    tier: tier.tier,
    shiftHours,
    workDaysPerWeek,
    weeklyHours,
    shiftBasePay,
    weeklyBasePay,
    bonusAvg,
    expectedBonusPerShift,
    weeklyExpectedTotal,
    bonusToBaseRatio,
    maxMotiveMultiplier,
    skillTotal,
  };
}

export function auditCareerBalance(
  mod: CareerMod,
  constraints: BalanceConstraints
): BalanceAuditItem[] {
  const items: BalanceAuditItem[] = [];
  const tiers = mod.tier_progression;
  const metrics = tiers.map(computeTierMetrics);

  // 1. Tier count match
  const tierCountOk = mod.tier_count === tiers.length && tiers.length >= 1 && tiers.length <= 20;
  items.push({
    id: 'tier_count',
    ruleName: 'Tier Sequence Integrity',
    severity: tierCountOk ? 'pass' : 'error',
    summary: tierCountOk
      ? `${tiers.length} tiers verified and aligned with tier_count`
      : `tier_count (${mod.tier_count}) does not match progression length (${tiers.length})`,
    affectedTiers: [],
  });

  // 2. Combined expected income (base pay + bonus EV) range & monotonicity
  const outOfRangeIncome = metrics
    .filter(
      (m) =>
        m.weeklyExpectedTotal < constraints.minWeeklyPayFloor ||
        m.weeklyExpectedTotal > constraints.maxWeeklyPayCap
    )
    .map((m) => m.tier);

  const nonMonotonicIncome: number[] = [];
  if (constraints.enforceMonotonicIncome) {
    for (let i = 1; i < metrics.length; i++) {
      if (metrics[i].weeklyExpectedTotal < metrics[i - 1].weeklyExpectedTotal) {
        nonMonotonicIncome.push(metrics[i].tier);
      }
    }
  }

  const incomeIssues = Array.from(new Set([...outOfRangeIncome, ...nonMonotonicIncome]));
  items.push({
    id: 'combined_income',
    ruleName: 'Expected Income Curve & Range',
    severity:
      incomeIssues.length === 0 ? 'pass' : nonMonotonicIncome.length > 0 ? 'error' : 'warning',
    summary:
      incomeIssues.length === 0
        ? `Combined weekly expected pay (base + bonus EV) stays within ${constraints.minWeeklyPayFloor.toLocaleString()}–${constraints.maxWeeklyPayCap.toLocaleString()} without regressing`
        : `Combined weekly expected pay regresses or exits ${constraints.minWeeklyPayFloor.toLocaleString()}–${constraints.maxWeeklyPayCap.toLocaleString()}`,
    affectedTiers: incomeIssues,
  });

  // 3. Weekly work hours (<= 70h) & attendance days (<= 7d)
  const badSchedule = metrics
    .filter(
      (m) =>
        m.shiftHours <= 0 ||
        m.weeklyHours > constraints.maxWeeklyHours ||
        m.workDaysPerWeek > constraints.maxDaysPerWeek ||
        m.workDaysPerWeek === 0
    )
    .map((m) => m.tier);

  items.push({
    id: 'schedule_load',
    ruleName: 'Weekly Work Hours & Attendance',
    severity: badSchedule.length === 0 ? 'pass' : 'warning',
    summary:
      badSchedule.length === 0
        ? `Total weekly hours <= ${constraints.maxWeeklyHours}h across <= ${constraints.maxDaysPerWeek} days/week`
        : `Total weekly hours exceed ${constraints.maxWeeklyHours}h or attendance exceeds ${constraints.maxDaysPerWeek} days/week`,
    affectedTiers: badSchedule,
  });

  // 4. Bonus system sanity
  const badBonus = tiers
    .filter((t) => {
      const [minB, maxB] = t.bonus_system.bonus_range;
      return (
        t.bonus_system.base_probability < 0 ||
        t.bonus_system.base_probability > 1 ||
        minB > maxB ||
        t.bonus_system.performance_threshold >= t.performance_required
      );
    })
    .map((t) => t.tier);

  items.push({
    id: 'bonus_sanity',
    ruleName: 'Bonus Threshold & Probability',
    severity: badBonus.length === 0 ? 'pass' : 'warning',
    summary:
      badBonus.length === 0
        ? 'Bonus thresholds are below promotion requirements with valid probability ranges'
        : 'Invalid bonus probability, inverted range, or threshold >= performance_required',
    affectedTiers: badBonus,
  });

  // 5. Motive drain cap
  const badMotive = metrics
    .filter((m) => m.maxMotiveMultiplier > constraints.maxMotiveMultiplier)
    .map((m) => m.tier);

  items.push({
    id: 'motive_drain',
    ruleName: 'Motive Drain Safety Cap',
    severity: badMotive.length === 0 ? 'pass' : 'warning',
    summary:
      badMotive.length === 0
        ? `All motive drain multipliers stay within ${constraints.maxMotiveMultiplier}x`
        : `Some tiers exceed the ${constraints.maxMotiveMultiplier}x motive drain limit and risk rapid burnout`,
    affectedTiers: badMotive,
  });

  // 6. Skill requirement progression & max level 10 cap
  const overSkillCap = tiers
    .filter((t) =>
      Object.values(t.skill_requirement || {}).some((lvl) => lvl < 1 || lvl > 10)
    )
    .map((t) => t.tier);

  const nonMonotonicSkill: number[] = [];
  if (constraints.enforceMonotonicSkill) {
    for (let i = 1; i < metrics.length; i++) {
      if (metrics[i].skillTotal < metrics[i - 1].skillTotal) {
        nonMonotonicSkill.push(metrics[i].tier);
      }
    }
  }

  const skillIssues = Array.from(new Set([...overSkillCap, ...nonMonotonicSkill]));
  items.push({
    id: 'skill_curve',
    ruleName: 'Skill Gate Curve & Lv.10 Cap',
    severity: skillIssues.length === 0 ? 'pass' : overSkillCap.length > 0 ? 'error' : 'warning',
    summary:
      skillIssues.length === 0
        ? 'All skill gates stay within Lv.1–10 and scale smoothly across tiers'
        : 'Skill requirement exceeds max level 10 (or < 1) or regresses compared to the previous tier',
    affectedTiers: skillIssues,
  });

  return items;
}

export const SAMPLE_HACKER_MOD: CareerMod = {
  career_name: 'Underground Cyber Hacker',
  tier_count: 10,
  endgame_config: {
    max_tier_raise_pct: 0.1,
    max_tier_raise_perf_req: 300,
  },
  tier_progression: [
    {
      tier: 1,
      title: 'Script Kiddie',
      schedule: { days: ['MON', 'WED', 'FRI'], start_hour: 22, end_hour: 2 },
      hourly_wage: 45,
      bonus_system: {
        performance_threshold: 20,
        base_probability: 0.35,
        prob_growth_coefficient: 0.02,
        bonus_range: [80, 220],
      },
      performance_required: 100,
      ideal_mood: 'FOCUSED',
      motive_drain_multipliers: { energy: 1.2, fun: 1.5 },
      daily_task: {
        name: 'Browse Darknet Tech Forums',
        category: 'PRACTICE_SKILL',
        hours_required: 1.0,
      },
      skill_requirement: { Programming: 1 },
    },
    {
      tier: 2,
      title: 'Packet Sniffer',
      schedule: { days: ['MON', 'TUE', 'THU', 'FRI'], start_hour: 22, end_hour: 3 },
      hourly_wage: 62,
      bonus_system: {
        performance_threshold: 22,
        base_probability: 0.36,
        prob_growth_coefficient: 0.02,
        bonus_range: [120, 320],
      },
      performance_required: 120,
      ideal_mood: 'FOCUSED',
      motive_drain_multipliers: { energy: 1.25, fun: 1.45 },
      daily_task: {
        name: 'Capture Public Wi-Fi Traffic',
        category: 'PRACTICE_SKILL',
        hours_required: 1.5,
      },
      skill_requirement: { Programming: 2 },
    },
    {
      tier: 3,
      title: 'Perimeter Breacher',
      schedule: { days: ['TUE', 'WED', 'FRI', 'SAT'], start_hour: 21, end_hour: 3 },
      hourly_wage: 85,
      bonus_system: {
        performance_threshold: 25,
        base_probability: 0.38,
        prob_growth_coefficient: 0.022,
        bonus_range: [180, 480],
      },
      performance_required: 140,
      ideal_mood: 'FOCUSED',
      motive_drain_multipliers: { energy: 1.3, fun: 1.4 },
      daily_task: {
        name: 'Write Automated Vulnerability Scanners',
        category: 'PRACTICE_SKILL',
        hours_required: 1.5,
      },
      skill_requirement: { Programming: 3, Logic: 1 },
    },
    {
      tier: 4,
      title: 'Social Engineer',
      schedule: { days: ['MON', 'WED', 'THU', 'SAT'], start_hour: 20, end_hour: 2 },
      hourly_wage: 112,
      bonus_system: {
        performance_threshold: 28,
        base_probability: 0.4,
        prob_growth_coefficient: 0.024,
        bonus_range: [260, 650],
      },
      performance_required: 160,
      ideal_mood: 'CONFIDENT',
      motive_drain_multipliers: { energy: 1.35, fun: 1.3, social: 1.25 },
      daily_task: {
        name: 'Forge Corporate Phishing Personas',
        category: 'SOCIALIZE',
        hours_required: 2.0,
      },
      skill_requirement: { Programming: 4, Charisma: 2 },
    },
    {
      tier: 5,
      title: 'Greyhat Broker',
      schedule: { days: ['MON', 'TUE', 'THU', 'FRI'], start_hour: 22, end_hour: 4 },
      hourly_wage: 145,
      bonus_system: {
        performance_threshold: 30,
        base_probability: 0.42,
        prob_growth_coefficient: 0.025,
        bonus_range: [350, 950],
      },
      performance_required: 185,
      ideal_mood: 'CONFIDENT',
      motive_drain_multipliers: { energy: 1.4, fun: 1.35 },
      daily_task: {
        name: 'Trade Zero-Day Intel on Black Markets',
        category: 'RESEARCH',
        hours_required: 2.0,
      },
      skill_requirement: { Programming: 5, Logic: 3 },
    },
    {
      tier: 6,
      title: 'Zero-Day Architect',
      schedule: { days: ['TUE', 'WED', 'FRI', 'SUN'], start_hour: 23, end_hour: 5 },
      hourly_wage: 190,
      bonus_system: {
        performance_threshold: 32,
        base_probability: 0.44,
        prob_growth_coefficient: 0.025,
        bonus_range: [500, 1400],
      },
      performance_required: 210,
      ideal_mood: 'FOCUSED',
      motive_drain_multipliers: { energy: 1.5, fun: 1.4 },
      daily_task: {
        name: 'Reverse-Engineer Core OS Kernels',
        category: 'PRACTICE_SKILL',
        hours_required: 2.5,
      },
      skill_requirement: { Programming: 7, Logic: 4 },
    },
    {
      tier: 7,
      title: 'Crypto Vault Cracker',
      schedule: { days: ['MON', 'WED', 'FRI', 'SAT'], start_hour: 0, end_hour: 6 },
      hourly_wage: 245,
      bonus_system: {
        performance_threshold: 35,
        base_probability: 0.45,
        prob_growth_coefficient: 0.028,
        bonus_range: [750, 2100],
      },
      performance_required: 240,
      ideal_mood: 'FOCUSED',
      motive_drain_multipliers: { energy: 1.55, fun: 1.5 },
      daily_task: {
        name: 'Deploy Distributed Key-Cracking Rigs',
        category: 'RESEARCH',
        hours_required: 2.5,
      },
      skill_requirement: { Programming: 8, Logic: 6 },
    },
    {
      tier: 8,
      title: 'Darknet Dispatcher',
      schedule: { days: ['TUE', 'THU', 'SAT'], start_hour: 22, end_hour: 5 },
      hourly_wage: 310,
      bonus_system: {
        performance_threshold: 38,
        base_probability: 0.48,
        prob_growth_coefficient: 0.03,
        bonus_range: [1100, 3200],
      },
      performance_required: 265,
      ideal_mood: 'CONFIDENT',
      motive_drain_multipliers: { energy: 1.65, fun: 1.45 },
      daily_task: {
        name: 'Scrub Multi-Hop Proxy Trace Logs',
        category: 'ADMIN_WORK',
        hours_required: 2.0,
      },
      skill_requirement: { Programming: 9, Logic: 7, Charisma: 4 },
    },
    {
      tier: 9,
      title: 'Megacorp Ghost',
      schedule: { days: ['MON', 'THU', 'SAT'], start_hour: 23, end_hour: 6 },
      hourly_wage: 395,
      bonus_system: {
        performance_threshold: 42,
        base_probability: 0.5,
        prob_growth_coefficient: 0.03,
        bonus_range: [1600, 4800],
      },
      performance_required: 290,
      ideal_mood: 'INSPIRED',
      motive_drain_multipliers: { energy: 1.75, fun: 1.55 },
      daily_task: {
        name: 'Infiltrate Corporate Core AI Firewalls',
        category: 'PRACTICE_SKILL',
        hours_required: 3.0,
      },
      skill_requirement: { Programming: 10, Logic: 8, Charisma: 5 },
    },
    {
      tier: 10,
      title: 'Digital Mythos',
      schedule: { days: ['WED', 'SAT'], start_hour: 0, end_hour: 6 },
      hourly_wage: 580,
      bonus_system: {
        performance_threshold: 45,
        base_probability: 0.52,
        prob_growth_coefficient: 0.035,
        bonus_range: [3200, 9600],
      },
      performance_required: 300,
      ideal_mood: 'FOCUSED',
      motive_drain_multipliers: { energy: 1.85, fun: 1.6 },
      daily_task: {
        name: 'Rewrite Global Encrypted Routing Protocols',
        category: 'RESEARCH',
        hours_required: 3.0,
      },
      skill_requirement: { Programming: 10, Logic: 10, Charisma: 6 },
    },
  ],
};

export const SAMPLE_DESIGN_NOTES: CareerDesignNotes = {
  playstyle_overview:
    'A nocturnal, high-volatility bounty career built around short overnight shifts and lucrative exploit payouts. Early tiers scrape by on modest hourly wages, while late-game tiers free up daytime hours for side crafting, skill grinding, or social infiltration.',
  early_game_feel:
    'Tiers 1–3 deliver a scrappy overnight hustle: 4–6 hour shifts at 45–85/hr feel tight on base pay, but low performance thresholds (20–25) make 35%+ bonus triggers feel rewarding.',
  mid_game_feel:
    'Tiers 4–7 introduce Logic and Charisma gates alongside surging bonus caps (650–2,100), shifting the loop from steady hourly pay toward chasing high-performance bounty spikes.',
  late_game_feel:
    'Tiers 8–10 drop to just 2–3 late-night shifts per week with jackpot bonuses up to 7,500, pairing cleanly with permanent +10% raises every 300 endgame performance points.',
  balance_risks: [
    {
      title: 'Lv.9–10 Bonus EV Dwarfs Base Hourly Pay',
      severity: 'medium',
      detail:
        'At max tier, a 5,000 midpoint bonus at 52% base probability yields ~5,200/week in expected bonuses alone, overshadowing base hourly wages and endgame raise progression.',
      suggested_tweak:
        'Lower base_probability in tiers 8–10 to 0.35–0.40 and raise performance_threshold slightly so top bonuses reward peak shift performance.',
    },
    {
      title: 'Overnight Shifts + Heavy Energy Drain Risk Burnout',
      severity: 'high',
      detail:
        'Tiers 6–10 run 22:00–06:00 shifts with 1.50x–1.85x energy drain plus 2.5–3.0h daily tasks, which can trap characters in an endless sleep-recovery loop.',
      suggested_tweak:
        'Cap energy drain multipliers in tiers 6–10 at 1.35x–1.55x or reduce daily_task.hours_required to 1.5–2.0 hours.',
    },
    {
      title: 'Abrupt Charisma Gate at Tier 4',
      severity: 'low',
      detail:
        'Tiers 1–3 only require Programming and Logic, then Tier 4 suddenly requires Charisma 2 (scaling to 6 by Tier 10), potentially stalling pure-tech builds.',
      suggested_tweak:
        'Introduce Charisma 1 at Tier 3 as an early ramp or soften Tier 8–10 Charisma requirements to 3–4.',
    },
  ],
};
