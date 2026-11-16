export type Weekday = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

export type IdealMood =
  | 'FOCUSED'
  | 'CONFIDENT'
  | 'INSPIRED'
  | 'ENERGIZED'
  | 'PLAYFUL'
  | 'HAPPY'
  | 'FLIRTY';

export type DailyTaskCategory =
  | 'PRACTICE_SKILL'
  | 'RESEARCH'
  | 'SOCIALIZE'
  | 'CRAFT_ITEM'
  | 'PERFORM'
  | 'FITNESS'
  | 'ADMIN_WORK';

export interface TierSchedule {
  days: Weekday[];
  start_hour: number;
  end_hour: number;
}

export interface BonusSystem {
  performance_threshold: number;
  base_probability: number;
  prob_growth_coefficient: number;
  bonus_range: [number, number];
}

export interface DailyTask {
  name: string;
  category: DailyTaskCategory | string;
  hours_required: number;
}

export interface CareerTier {
  tier: number;
  title: string;
  schedule: TierSchedule;
  hourly_wage: number;
  bonus_system: BonusSystem;
  performance_required: number;
  ideal_mood: IdealMood | string;
  motive_drain_multipliers: Record<string, number>;
  daily_task: DailyTask;
  skill_requirement: Record<string, number>;
}

export interface EndgameConfig {
  max_tier_raise_pct: number;
  max_tier_raise_perf_req: number;
}

export interface CareerMod {
  career_name: string;
  tier_count: number;
  endgame_config: EndgameConfig;
  tier_progression: CareerTier[];
}

export type EconomyArchetype = 'balanced' | 'high_risk_bonus' | 'steady_salary';

export interface BalanceConstraints {
  tierCount: number;
  archetype: EconomyArchetype;
  minWeeklyPayFloor: number;
  maxWeeklyPayCap: number;
  maxWeeklyHours: number;
  maxDaysPerWeek: number;
  maxMotiveMultiplier: number;
  enforceMonotonicIncome: boolean;
  enforceMonotonicSkill: boolean;
  customRules: string;
}

export interface TierEconomyMetrics {
  tier: number;
  shiftHours: number;
  workDaysPerWeek: number;
  weeklyHours: number;
  shiftBasePay: number;
  weeklyBasePay: number;
  bonusAvg: number;
  expectedBonusPerShift: number;
  weeklyExpectedTotal: number;
  bonusToBaseRatio: number;
  maxMotiveMultiplier: number;
  skillTotal: number;
}

export type AuditSeverity = 'pass' | 'warning' | 'error';

export interface BalanceAuditItem {
  id: string;
  ruleName: string;
  severity: AuditSeverity;
  summary: string;
  affectedTiers: number[];
}

export type BalanceRiskSeverity = 'high' | 'medium' | 'low';

export interface CareerBalanceRisk {
  title: string;
  severity: BalanceRiskSeverity;
  detail: string;
  suggested_tweak: string;
}

export interface CareerDesignNotes {
  playstyle_overview: string;
  early_game_feel: string;
  mid_game_feel: string;
  late_game_feel: string;
  balance_risks: CareerBalanceRisk[];
}

