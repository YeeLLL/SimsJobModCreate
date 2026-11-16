export type AgentArchetype = 'CASUAL' | 'EFFICIENCY' | 'SLACKER' | 'VOLATILE';

export type AgentStatus = 'ACTIVE' | 'BURNOUT';

export interface SixMotives {
  energy: number;
  fun: number;
  social: number;
  hygiene: number;
  hunger: number;
  bladder: number;
}

export interface DailyTrajectoryPoint {
  day: number;
  p10: number;
  median: number;
  p90: number;
  mean: number;
  activeCount: number;
  burnoutCount: number;
}

export interface SimulatedAgentSummary {
  id: number;
  name: string;
  archetype: AgentArchetype;
  status: AgentStatus;
  burnoutDay: number | null;
  burnoutReason: string | null;
  finalTier: number;
  endgameRaises: number;
  finalNetWorth: number;
  totalWageEarned: number;
  totalBonusEarned: number;
  bonusesWon: number;
  shiftsCompleted: number;
  shiftsMissed: number;
  lastDailyExpense: number;
  avgDailyExpense: number;
  avgTimeDeficitHours: number;
  finalMotives: SixMotives;
}

export interface CohortSummary {
  archetype: AgentArchetype;
  label: string;
  count: number;
  burnoutCount: number;
  avgFinalTier: number;
  medianNetWorth: number;
  avgBonusEarned: number;
  avgEnergy: number;
}

export type SimulationVerdict = 'GREENLIGHT' | 'FAILED (Balance Issue)';

export interface CareerSimulationResult {
  careerName: string;
  daysSimulated: number;
  agentCount: number;
  seed: number;
  dailyTrajectory: DailyTrajectoryPoint[];
  finalMedianNetWorth: number;
  finalP10NetWorth: number;
  finalP90NetWorth: number;
  burnoutCount: number;
  verdict: SimulationVerdict;
  verdictReasons: string[];
  cohorts: CohortSummary[];
  agents: SimulatedAgentSummary[];
}
