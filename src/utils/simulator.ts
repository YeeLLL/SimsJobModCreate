import { CareerMod, Weekday } from '../types/career.ts';
import {
  AgentArchetype,
  CareerSimulationResult,
  CohortSummary,
  DailyTrajectoryPoint,
  SimulatedAgentSummary,
  SimulationVerdict,
  SixMotives,
} from '../types/simulation.ts';
import { computeShiftHours, WEEKDAY_ORDER } from './balance.ts';

const MOTIVE_MIN = -100;
const MOTIVE_MAX = 100;

// Exact baseline hourly decay rates (Rules 2-7)
const HOURLY_DECAY = {
  energy: 200 / 24, // 8.3333 / hr (200 per 24h)
  fun: 200 / 24, // 8.3333 / hr (200 per 24h)
  social: 200 / 24, // 8.3333 / hr alone (200 per 24h)
  hygiene: 200 / 24, // 8.3333 / hr (200 per 24h)
  hunger: 200 / 12, // 16.6667 / hr (200 per 12h)
  bladder: 100 / 4, // 25.0 / hr (100 per 4h)
};

// Exact recovery rates & action durations (Rules 2-7)
const SLEEP_RECOVERY_PER_HR = 200 / 8; // 25 / hr (200 in 8h)
const FUN_RECOVERY_PER_HR = 200 / 2; // 100 / hr (200 in 2h)
const SOCIAL_RECOVERY_PER_HR = 200 / 4; // 50 / hr around others (200 in 4h)
const BLADDER_RESTORE_HOURS = 5 / 60; // 5 minutes -> full 100
const HYGIENE_RESTORE_HOURS = 0.5; // 30 minutes -> full 100 (NOT at work)
const HUNGER_RESTORE_HOURS = 0.5; // 30 minutes -> full 100 (allowed at work)

const STARTING_FUNDS = 1000;

interface LifestyleOption {
  cost: number;
  label: string;
  recoveryMult: number;
  skillMult: number;
}

const LIFESTYLE_OPTIONS: readonly LifestyleOption[] = [
  { cost: 50, label: 'Frugal (50/d)', recoveryMult: 0.9, skillMult: 1.0 },
  { cost: 100, label: 'Modest (100/d)', recoveryMult: 1.0, skillMult: 1.0 },
  { cost: 200, label: 'Standard (200/d)', recoveryMult: 1.05, skillMult: 1.0 },
  { cost: 400, label: 'Upscale (400/d)', recoveryMult: 1.05, skillMult: 1.05 },
  { cost: 1000, label: 'Luxury (1000/d)', recoveryMult: 1.1, skillMult: 1.1 },
];

function selectLifestyleOption(
  agent: InternalAgentState,
  tier: CareerMod['tier_progression'][number],
  nextTier: CareerMod['tier_progression'][number] | undefined,
  rng: () => number
): LifestyleOption {
  const shiftHrs = computeShiftHours(tier.schedule.start_hour, tier.schedule.end_hour);
  const daysPerWk = tier.schedule.days.length;
  const avgBonus =
    (tier.bonus_system.bonus_range[0] + tier.bonus_system.bonus_range[1]) / 2;
  const estDailyIncome =
    (daysPerWk * shiftHrs * tier.hourly_wage +
      daysPerWk * avgBonus * tier.bonus_system.base_probability) /
    7;
  const needsSkills = Boolean(nextTier);

  if (agent.archetype === 'EFFICIENCY') {
    if (agent.netWorth < 550 || estDailyIncome < 140) return LIFESTYLE_OPTIONS[0]; // 50
    if (estDailyIncome >= 1500 && agent.netWorth >= 10000 && (needsSkills || shiftHrs >= 7)) {
      return LIFESTYLE_OPTIONS[4]; // 1000
    }
    if (estDailyIncome >= 650 && agent.netWorth >= 3500 && needsSkills) {
      return LIFESTYLE_OPTIONS[3]; // 400
    }
    if (estDailyIncome >= 260 && agent.netWorth >= 1100) {
      return LIFESTYLE_OPTIONS[2]; // 200
    }
    return LIFESTYLE_OPTIONS[1]; // 100
  }

  if (agent.archetype === 'CASUAL') {
    if (agent.netWorth < 150) return LIFESTYLE_OPTIONS[0]; // 50
    if (agent.netWorth < 900 && estDailyIncome < 185) return LIFESTYLE_OPTIONS[1]; // 100
    if (estDailyIncome >= 1600 && agent.netWorth >= 15000) return LIFESTYLE_OPTIONS[4]; // 1000
    if (estDailyIncome >= 680 && agent.netWorth >= 5000) return LIFESTYLE_OPTIONS[3]; // 400
    return LIFESTYLE_OPTIONS[2]; // 200
  }

  if (agent.archetype === 'SLACKER') {
    if (agent.netWorth < -450 && rng() < 0.72) return LIFESTYLE_OPTIONS[0]; // 50
    if (agent.netWorth < 250 && rng() < 0.45) return LIFESTYLE_OPTIONS[1]; // 100
    if (agent.netWorth > 2500 && rng() < 0.25) return LIFESTYLE_OPTIONS[3]; // 400
    return rng() < 0.5 ? LIFESTYLE_OPTIONS[1] : LIFESTYLE_OPTIONS[2]; // 100 or 200
  }

  // VOLATILE
  if (agent.netWorth < 250) return LIFESTYLE_OPTIONS[0]; // 50
  if (agent.netWorth > 8000 && estDailyIncome >= 1000 && rng() < 0.5) {
    return LIFESTYLE_OPTIONS[4]; // 1000
  }
  if (agent.netWorth > 3000 && rng() < 0.45) return LIFESTYLE_OPTIONS[3]; // 400
  if (agent.netWorth < 1100 && rng() < 0.55) return LIFESTYLE_OPTIONS[1]; // 100
  return LIFESTYLE_OPTIONS[2]; // 200
}

function createRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return Math.round(sorted[lo]);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo));
}

function clampMotive(v: number): number {
  return Math.min(MOTIVE_MAX, Math.max(MOTIVE_MIN, v));
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

interface ArchetypeProfile {
  label: string;
  count: number;
  dailyTaskProb: number;
  moodPrepProb: number;
  skillStudyProb: number;
  maxStudyHoursPerDay: number;
  perfBaseMultiplier: number;
  lateBaseProb: number;
  careThreshold: number;
}

const ARCHETYPE_PROFILES: Record<AgentArchetype, ArchetypeProfile> = {
  CASUAL: {
    label: 'Casual (×8)',
    count: 8,
    dailyTaskProb: 0.8,
    moodPrepProb: 0.72,
    skillStudyProb: 0.85,
    maxStudyHoursPerDay: 2.5,
    perfBaseMultiplier: 1.0,
    lateBaseProb: 0.04,
    careThreshold: 15,
  },
  EFFICIENCY: {
    label: 'Min-Max (×4)',
    count: 4,
    dailyTaskProb: 0.96,
    moodPrepProb: 0.95,
    skillStudyProb: 0.98,
    maxStudyHoursPerDay: 4.5,
    perfBaseMultiplier: 1.24,
    lateBaseProb: 0.01,
    careThreshold: 22,
  },
  SLACKER: {
    label: 'Slacker (×4)',
    count: 4,
    dailyTaskProb: 0.28,
    moodPrepProb: 0.18,
    skillStudyProb: 0.42,
    maxStudyHoursPerDay: 1.0,
    perfBaseMultiplier: 0.72,
    lateBaseProb: 0.22,
    careThreshold: -15,
  },
  VOLATILE: {
    label: 'Volatile (×4)',
    count: 4,
    dailyTaskProb: 0.6,
    moodPrepProb: 0.55,
    skillStudyProb: 0.7,
    maxStudyHoursPerDay: 3.0,
    perfBaseMultiplier: 1.0,
    lateBaseProb: 0.1,
    careThreshold: 5,
  },
};

const AGENT_ROSTER_PLAN: Array<{ archetype: AgentArchetype; name: string }> = [
  { archetype: 'CASUAL', name: 'Alex Mercer' },
  { archetype: 'CASUAL', name: 'Maya Lin' },
  { archetype: 'CASUAL', name: 'Jordan Brooks' },
  { archetype: 'CASUAL', name: 'Elena Rostova' },
  { archetype: 'CASUAL', name: 'Noah Vance' },
  { archetype: 'CASUAL', name: 'Chloe Park' },
  { archetype: 'CASUAL', name: 'Liam OConnor' },
  { archetype: 'CASUAL', name: 'Nora Patel' },
  { archetype: 'EFFICIENCY', name: 'Kai Takahashi' },
  { archetype: 'EFFICIENCY', name: 'Claire Sterling' },
  { archetype: 'EFFICIENCY', name: 'Soren Lindqvist' },
  { archetype: 'EFFICIENCY', name: 'Zara Al-Mansoor' },
  { archetype: 'SLACKER', name: 'Milo Jenkins' },
  { archetype: 'SLACKER', name: 'Toby Hayes' },
  { archetype: 'SLACKER', name: 'Rory Delgado' },
  { archetype: 'SLACKER', name: 'Sammy Cho' },
  { archetype: 'VOLATILE', name: 'Vex Moreno' },
  { archetype: 'VOLATILE', name: 'Juno Reyes' },
  { archetype: 'VOLATILE', name: 'Dante Thorne' },
  { archetype: 'VOLATILE', name: 'Iris Novak' },
];

interface InternalAgentState {
  id: number;
  name: string;
  archetype: AgentArchetype;
  status: 'ACTIVE' | 'BURNOUT';
  burnoutDay: number | null;
  burnoutReason: string | null;
  tierIndex: number;
  endgameRaises: number;
  tierPerformance: number;
  netWorth: number;
  totalWageEarned: number;
  totalBonusEarned: number;
  bonusesWon: number;
  shiftsCompleted: number;
  shiftsMissed: number;
  lastDailyExpense: number;
  totalExpensesPaid: number;
  totalTimeDeficitHours: number;
  skills: Record<string, number>;
  skillHoursBuffer: Record<string, number>;
  motives: SixMotives;
  criticalCollapseStreak: number;
  consecutiveMissedShifts: number;
}

function decayAllMotives(
  motives: SixMotives,
  hours: number,
  options?: {
    skipEnergy?: boolean;
    skipFun?: boolean;
    skipSocial?: boolean;
    skipHygiene?: boolean;
    skipHunger?: boolean;
    skipBladder?: boolean;
    multipliers?: Partial<Record<keyof SixMotives, number>>;
  }
) {
  if (hours <= 0) return;
  const m = options?.multipliers ?? {};
  if (!options?.skipEnergy) {
    motives.energy = clampMotive(
      motives.energy - hours * HOURLY_DECAY.energy * (m.energy ?? 1)
    );
  }
  if (!options?.skipFun) {
    motives.fun = clampMotive(
      motives.fun - hours * HOURLY_DECAY.fun * (m.fun ?? 1)
    );
  }
  if (!options?.skipSocial) {
    motives.social = clampMotive(
      motives.social - hours * HOURLY_DECAY.social * (m.social ?? 1)
    );
  }
  if (!options?.skipHygiene) {
    motives.hygiene = clampMotive(
      motives.hygiene - hours * HOURLY_DECAY.hygiene * (m.hygiene ?? 1)
    );
  }
  if (!options?.skipHunger) {
    motives.hunger = clampMotive(
      motives.hunger - hours * HOURLY_DECAY.hunger * (m.hunger ?? 1)
    );
  }
  if (!options?.skipBladder) {
    motives.bladder = clampMotive(
      motives.bladder - hours * HOURLY_DECAY.bladder * (m.bladder ?? 1)
    );
  }
}

function addSkillHours(
  agent: InternalAgentState,
  skillName: string,
  hoursToAdd: number,
  maxTarget = 10
) {
  if (hoursToAdd <= 0) return;
  let curLvl = agent.skills[skillName] ?? 0;
  if (curLvl >= maxTarget || curLvl >= 10) return;

  let rem = hoursToAdd;
  while (rem > 1e-6 && curLvl < maxTarget && curLvl < 10) {
    const reqForNext = curLvl + 1; // 0->1: 1h, 1->2: 2h, ..., 9->10: 10h
    const buffered = agent.skillHoursBuffer[skillName] ?? 0;
    const needed = Math.max(0, reqForNext - buffered);
    if (rem >= needed) {
      rem -= needed;
      agent.skillHoursBuffer[skillName] = 0;
      curLvl += 1;
      agent.skills[skillName] = curLvl;
    } else {
      agent.skillHoursBuffer[skillName] = buffered + rem;
      rem = 0;
    }
  }
}

export function runCareerSimulation(
  mod: CareerMod,
  seed = 20261116,
  daysToSimulate = 60
): CareerSimulationResult {
  const rng = createRng(seed);
  const tiers = mod.tier_progression;
  const maxTierIdx = Math.max(0, tiers.length - 1);

  // Rule 8: All motives start full (100), starting funds = 1000
  const agents: InternalAgentState[] = AGENT_ROSTER_PLAN.map((spec, idx) => ({
    id: idx + 1,
    name: spec.name,
    archetype: spec.archetype,
    status: 'ACTIVE',
    burnoutDay: null,
    burnoutReason: null,
    tierIndex: 0,
    endgameRaises: 0,
    tierPerformance: 0,
    netWorth: STARTING_FUNDS,
    totalWageEarned: 0,
    totalBonusEarned: 0,
    bonusesWon: 0,
    shiftsCompleted: 0,
    shiftsMissed: 0,
    lastDailyExpense: 200,
    totalExpensesPaid: 0,
    totalTimeDeficitHours: 0,
    skills: {},
    skillHoursBuffer: {},
    motives: {
      energy: 100,
      fun: 100,
      social: 100,
      hygiene: 100,
      hunger: 100,
      bladder: 100,
    },
    criticalCollapseStreak: 0,
    consecutiveMissedShifts: 0,
  }));

  const dailyTrajectory: DailyTrajectoryPoint[] = [];

  for (let day = 1; day <= daysToSimulate; day++) {
    const weekday: Weekday = WEEKDAY_ORDER[(day - 1) % 7];

    for (const agent of agents) {
      const tier = tiers[agent.tierIndex];
      if (!tier) continue;

      if (agent.status === 'BURNOUT') {
        // Burned-out agent switches to minimal 50/day frugal survival upkeep
        agent.lastDailyExpense = 50;
        agent.totalExpensesPaid += 50;
        agent.netWorth = Math.round(agent.netWorth - 50);
        continue;
      }

      const nextTier = tiers[agent.tierIndex + 1];
      const lifestyle = selectLifestyleOption(agent, tier, nextTier, rng);
      const recoveryMult = lifestyle.recoveryMult;
      const skillMult = lifestyle.skillMult;
      agent.lastDailyExpense = lifestyle.cost;

      const sleepRate = SLEEP_RECOVERY_PER_HR * recoveryMult;
      const funRate = FUN_RECOVERY_PER_HR * recoveryMult;
      const socialRate = SOCIAL_RECOVERY_PER_HR * recoveryMult;
      const bladderDuration = BLADDER_RESTORE_HOURS / recoveryMult;
      const hygieneDuration = HYGIENE_RESTORE_HOURS / recoveryMult;
      const hungerDuration = HUNGER_RESTORE_HOURS / recoveryMult;

      const profile = ARCHETYPE_PROFILES[agent.archetype];
      const isWorkday = tier.schedule.days.includes(weekday);
      const scheduledShiftHours = isWorkday
        ? computeShiftHours(tier.schedule.start_hour, tier.schedule.end_hour)
        : 0;

      const volatileSwing =
        agent.archetype === 'VOLATILE'
          ? rng() < 0.45
            ? 0.6 + rng() * 0.22
            : 1.15 + rng() * 0.28
          : 0.94 + rng() * 0.12;

      let remainingDayHours = 24.0;
      let passedOutAtWork = false;
      let hasIdealMood = false;
      let negativeMotivePenalty = 0;

      // ------------------------------------------------------------------
      // PHASE 1: Pre-Shift Care & Rule 10 Mood Prep (Workdays)
      // ------------------------------------------------------------------
      let skippedShift = false;
      if (isWorkday) {
        const severeRedCount = [
          agent.motives.energy,
          agent.motives.fun,
          agent.motives.social,
          agent.motives.hygiene,
        ].filter((v) => v < -40).length;

        const skipProb = clamp(
          profile.lateBaseProb +
            severeRedCount * 0.16 +
            (agent.motives.energy < -65 ? 0.3 : 0),
          0,
          0.75
        );
        skippedShift = rng() < skipProb;

        if (!skippedShift) {
          // Pre-work bladder, hygiene (CANNOT do at work!), hunger
          if (agent.motives.bladder < 65 && remainingDayHours >= bladderDuration) {
            agent.motives.bladder = 100;
            remainingDayHours -= bladderDuration;
          }
          if (agent.motives.hygiene < 70 && remainingDayHours >= hygieneDuration) {
            decayAllMotives(agent.motives, hygieneDuration, { skipHygiene: true });
            agent.motives.hygiene = 100;
            remainingDayHours -= hygieneDuration;
          }
          if (agent.motives.hunger < 60 && remainingDayHours >= hungerDuration) {
            decayAllMotives(agent.motives, hungerDuration, { skipHunger: true });
            agent.motives.hunger = 100;
            remainingDayHours -= hungerDuration;
          }

          // Rule 10: Ideal Mood Prep requires random 0.5 - 1.0 hours extra
          const wantsMoodPrep = rng() < profile.moodPrepProb;
          const enoughTimeForMood =
            remainingDayHours - scheduledShiftHours >= 6.0 && agent.motives.energy > -10;
          if (wantsMoodPrep && enoughTimeForMood) {
            const moodPrepHours = 0.5 + rng() * 0.5;
            decayAllMotives(agent.motives, moodPrepHours);
            remainingDayHours -= moodPrepHours;
            hasIdealMood = true;
          }
        }
      }

      // ------------------------------------------------------------------
      // PHASE 2: Work Shift (simulated in 0.5h increments)
      // ------------------------------------------------------------------
      if (isWorkday) {
        if (skippedShift) {
          agent.shiftsMissed += 1;
          agent.consecutiveMissedShifts += 1;
          agent.tierPerformance = Math.max(0, agent.tierPerformance - 8);
        } else {
          agent.shiftsCompleted += 1;
          agent.consecutiveMissedShifts = 0;

          const mult = tier.motive_drain_multipliers || {};
          const stepSize = 0.5;
          const steps = Math.max(1, Math.round(scheduledShiftHours / stepSize));
          let actualShiftHours = 0;

          for (let s = 0; s < steps; s++) {
            const dt = Math.min(stepSize, scheduledShiftHours - actualShiftHours);
            if (dt <= 0) break;

            // Rule 3: Bladder can be replenished freely at work in 5 mins from any value
            if (agent.motives.bladder < profile.careThreshold) {
              agent.motives.bladder = 100;
            }

            // Rule 7: Hunger can be replenished at work in 30 mins
            if (agent.motives.hunger < profile.careThreshold) {
              agent.motives.hunger = 100;
            }

            // Rule 5: Social jobs (PERFORM/SOCIALIZE or low social drain <= 0.6) keep coworkers around
            const isSocialJob =
              tier.daily_task.category === 'SOCIALIZE' ||
              tier.daily_task.category === 'PERFORM' ||
              (mult.social !== undefined && mult.social <= 0.6);

            decayAllMotives(agent.motives, dt, {
              skipSocial: isSocialJob,
              multipliers: mult,
            });
            if (isSocialJob) {
              agent.motives.social = clampMotive(
                agent.motives.social + dt * socialRate * 0.5
              );
            }

            actualShiftHours += dt;

            // Rule 1: Any motive < 0 while at work deducts performance points
            const motiveVals = [
              agent.motives.energy,
              agent.motives.fun,
              agent.motives.social,
              agent.motives.hygiene,
              agent.motives.hunger,
              agent.motives.bladder,
            ];
            for (const val of motiveVals) {
              if (val < 0) {
                const severity = val < -50 ? 1.8 : 1.0;
                negativeMotivePenalty += 1.6 * dt * severity;
              }
            }

            if (agent.motives.energy <= -98) {
              passedOutAtWork = true;
              break;
            }
          }

          remainingDayHours = Math.max(0, remainingDayHours - actualShiftHours);

          const baseShiftPerf =
            22 +
            (hasIdealMood ? 8 : 0) +
            (agent.archetype === 'EFFICIENCY' ? 6 : 0);

          const rawPerf =
            baseShiftPerf * profile.perfBaseMultiplier * volatileSwing -
            negativeMotivePenalty;

          const dailyPerf = Math.max(-10, Math.round(rawPerf));
          agent.tierPerformance = Math.max(0, agent.tierPerformance + dailyPerf);

          const raiseMult =
            agent.endgameRaises > 0
              ? Math.pow(1 + mod.endgame_config.max_tier_raise_pct, agent.endgameRaises)
              : 1;
          const completionRatio = passedOutAtWork
            ? actualShiftHours / Math.max(1, scheduledShiftHours)
            : 1.0;
          const wageEarned = Math.round(
            scheduledShiftHours * tier.hourly_wage * raiseMult * completionRatio
          );
          agent.netWorth += wageEarned;
          agent.totalWageEarned += wageEarned;

          if (!passedOutAtWork && dailyPerf > tier.bonus_system.performance_threshold) {
            const excess = dailyPerf - tier.bonus_system.performance_threshold;
            const bonusProb = clamp(
              tier.bonus_system.base_probability +
                excess * tier.bonus_system.prob_growth_coefficient,
              0,
              0.96
            );
            if (rng() < bonusProb) {
              const [bMin, bMax] = tier.bonus_system.bonus_range;
              const bonusAward = Math.round(bMin + rng() * Math.max(0, bMax - bMin));
              agent.netWorth += bonusAward;
              agent.totalBonusEarned += bonusAward;
              agent.bonusesWon += 1;
            }
          }
        }
      }

      // ------------------------------------------------------------------
      // PHASE 3: Off-Work 0.5h Discrete Time-Budget Scheduler
      // ------------------------------------------------------------------
      const taskReqHours = tier.daily_task.hours_required;
      const wantsTask =
        rng() <
        (agent.archetype === 'VOLATILE'
          ? volatileSwing > 1
            ? 0.82
            : 0.35
          : profile.dailyTaskProb);
      const wantsStudy = rng() < profile.skillStudyProb;

      let taskHoursRemaining = wantsTask ? taskReqHours : 0;
      let studyHoursToday = 0;
      let isSleeping = false;
      let isHavingFun = false;
      let isSocializing = false;

      let t = 0;
      let guard = 0;
      while (t < remainingDayHours - 0.01 && guard < 120) {
        guard += 1;
        const left = remainingDayHours - t;

        // 1. Bladder
        if (agent.motives.bladder < profile.careThreshold && left >= bladderDuration) {
          agent.motives.bladder = 100;
          t += bladderDuration;
          continue;
        }

        // 2. Sleep (Rule 2: 25/hr * recoveryMult, wakes up early when full 100)
        if (
          (isSleeping && agent.motives.energy < 100) ||
          agent.motives.energy < 20
        ) {
          isSleeping = true;
          const needed = (100 - agent.motives.energy) / sleepRate;
          const dt = Math.min(0.5, left, needed);
          if (dt > 0.001) {
            decayAllMotives(agent.motives, dt, { skipEnergy: true });
            agent.motives.energy = clampMotive(
              agent.motives.energy + dt * sleepRate
            );
            t += dt;
            if (agent.motives.energy >= 99.9) {
              agent.motives.energy = 100;
              isSleeping = false;
            }
            continue;
          }
          isSleeping = false;
        }

        // 3. Hunger (Rule 7: 30 min / recoveryMult -> full 100)
        if (agent.motives.hunger < profile.careThreshold + 10 && left >= 0.25) {
          const dt = Math.min(hungerDuration, left);
          decayAllMotives(agent.motives, dt, { skipHunger: true });
          agent.motives.hunger = 100;
          t += dt;
          continue;
        }

        // 4. Hygiene (Rule 6: 30 min / recoveryMult -> full 100)
        if (agent.motives.hygiene < profile.careThreshold + 10 && left >= 0.25) {
          const dt = Math.min(hygieneDuration, left);
          decayAllMotives(agent.motives, dt, { skipHygiene: true });
          agent.motives.hygiene = 100;
          t += dt;
          continue;
        }

        // 5. Fun (Rule 4: 100/hr * recoveryMult, stops at 100; overlaps with social if social < 75)
        if ((isHavingFun && agent.motives.fun < 100) || agent.motives.fun < 40) {
          isHavingFun = true;
          const needed = (100 - agent.motives.fun) / funRate;
          const dt = Math.min(0.5, left, needed);
          if (dt > 0.001) {
            const withOthers = agent.motives.social < 75;
            decayAllMotives(agent.motives, dt, {
              skipFun: true,
              skipSocial: withOthers,
            });
            agent.motives.fun = clampMotive(agent.motives.fun + dt * funRate);
            if (withOthers) {
              agent.motives.social = clampMotive(
                agent.motives.social + dt * socialRate
              );
            }
            t += dt;
            if (agent.motives.fun >= 99.9) {
              agent.motives.fun = 100;
              isHavingFun = false;
            }
            continue;
          }
          isHavingFun = false;
        }

        // 6. Social (Rule 5: 50/hr * recoveryMult around others, stops at 100)
        if ((isSocializing && agent.motives.social < 100) || agent.motives.social < 40) {
          isSocializing = true;
          const needed = (100 - agent.motives.social) / socialRate;
          const dt = Math.min(0.5, left, needed);
          if (dt > 0.001) {
            decayAllMotives(agent.motives, dt, { skipSocial: true });
            agent.motives.social = clampMotive(
              agent.motives.social + dt * socialRate
            );
            t += dt;
            if (agent.motives.social >= 99.9) {
              agent.motives.social = 100;
              isSocializing = false;
            }
            continue;
          }
          isSocializing = false;
        }

        // 7. Daily Task
        if (taskHoursRemaining > 0.01 && agent.motives.energy > -15) {
          const dt = Math.min(0.5, left, taskHoursRemaining);
          const isSocialTask =
            tier.daily_task.category === 'SOCIALIZE' ||
            tier.daily_task.category === 'PERFORM';
          decayAllMotives(agent.motives, dt, { skipSocial: isSocialTask });
          if (isSocialTask) {
            agent.motives.social = clampMotive(
              agent.motives.social + dt * socialRate
            );
          }
          taskHoursRemaining -= dt;
          t += dt;

          if (taskHoursRemaining <= 0.01) {
            agent.tierPerformance += 8;
            if (tier.daily_task.category === 'PRACTICE_SKILL') {
              const reqEntries = Object.entries((nextTier ?? tier).skill_requirement || {});
              if (reqEntries.length > 0) {
                addSkillHours(agent, reqEntries[0][0], taskReqHours * 0.5 * skillMult, 10);
              }
            }
          }
          continue;
        }

        // 8. Skill Training (Rule 9: 0->1: 1h, 1->2: 2h, ..., 9->10: 10h, scaled by skillMult)
        if (
          nextTier &&
          wantsStudy &&
          studyHoursToday < profile.maxStudyHoursPerDay &&
          agent.motives.energy > -10
        ) {
          const pending = Object.entries(nextTier.skill_requirement || {}).filter(
            ([skillName, target]) => (agent.skills[skillName] ?? 0) < target
          );
          if (pending.length > 0) {
            const [targetSkill, targetLvl] = pending[0];
            const dt = Math.min(0.5, left, profile.maxStudyHoursPerDay - studyHoursToday);
            addSkillHours(agent, targetSkill, dt * skillMult, targetLvl);
            decayAllMotives(agent.motives, dt);
            studyHoursToday += dt;
            t += dt;
            continue;
          }
        }

        // 9. Preventative Care / Top-up Rest for spare hours
        if (agent.motives.hygiene < 80 && left >= 0.25) {
          const dt = Math.min(hygieneDuration, left);
          decayAllMotives(agent.motives, dt, { skipHygiene: true });
          agent.motives.hygiene = 100;
          t += dt;
        } else if (agent.motives.hunger < 75 && left >= 0.25) {
          const dt = Math.min(hungerDuration, left);
          decayAllMotives(agent.motives, dt, { skipHunger: true });
          agent.motives.hunger = 100;
          t += dt;
        } else if (agent.motives.energy < 85) {
          const dt = Math.min(0.5, left, (100 - agent.motives.energy) / sleepRate);
          decayAllMotives(agent.motives, dt, { skipEnergy: true });
          agent.motives.energy = clampMotive(
            agent.motives.energy + dt * sleepRate
          );
          t += dt;
        } else if (agent.motives.fun < 90) {
          const dt = Math.min(0.5, left, (100 - agent.motives.fun) / funRate);
          decayAllMotives(agent.motives, dt, { skipFun: true });
          agent.motives.fun = clampMotive(agent.motives.fun + dt * funRate);
          t += dt;
        } else if (agent.motives.social < 90) {
          const dt = Math.min(0.5, left, (100 - agent.motives.social) / socialRate);
          decayAllMotives(agent.motives, dt, { skipSocial: true });
          agent.motives.social = clampMotive(
            agent.motives.social + dt * socialRate
          );
          t += dt;
        } else {
          // Relaxing / resting gently sustains fun & social without zero-care starvation
          const dt = Math.min(0.5, left);
          decayAllMotives(agent.motives, dt, { skipFun: true, skipSocial: true });
          agent.motives.fun = clampMotive(agent.motives.fun + dt * 20 * recoveryMult);
          agent.motives.social = clampMotive(agent.motives.social + dt * 10 * recoveryMult);
          t += dt;
        }
      }

      // Track daily time scarcity: any motives still < 0 at day end?
      const redMotivesEnd = [
        agent.motives.energy,
        agent.motives.fun,
        agent.motives.social,
        agent.motives.hygiene,
        agent.motives.hunger,
        agent.motives.bladder,
      ].filter((v) => v < 0);

      if (redMotivesEnd.length > 0) {
        const deficitEst =
          Math.max(0, -agent.motives.energy) / sleepRate +
          Math.max(0, -agent.motives.fun) / funRate +
          Math.max(0, -agent.motives.social) / socialRate;
        agent.totalTimeDeficitHours += Math.max(0.5, deficitEst);
      }

      // ------------------------------------------------------------------
      // PHASE 4: Promotion / Endgame Raise Check
      // ------------------------------------------------------------------
      if (agent.tierIndex < maxTierIdx) {
        const nextReq = nextTier?.skill_requirement || {};
        const skillsMet = Object.entries(nextReq).every(
          ([skillName, lvl]) => (agent.skills[skillName] ?? 0) >= lvl
        );
        if (agent.tierPerformance >= tier.performance_required && skillsMet) {
          agent.tierIndex += 1;
          agent.tierPerformance = 0;
        }
      } else {
        const raiseReq = Math.max(50, mod.endgame_config.max_tier_raise_perf_req);
        while (agent.tierPerformance >= raiseReq) {
          agent.tierPerformance -= raiseReq;
          agent.endgameRaises += 1;
        }
      }

      // ------------------------------------------------------------------
      // PHASE 5: Adaptive Daily Living Cost (50 / 100 / 200 / 400 / 1000)
      // ------------------------------------------------------------------
      agent.totalExpensesPaid += lifestyle.cost;
      agent.netWorth = Math.round(agent.netWorth - lifestyle.cost);

      // ------------------------------------------------------------------
      // PHASE 6: Burnout / Deadlock Evaluation
      // ------------------------------------------------------------------
      const severeNegativeCount = [
        agent.motives.energy,
        agent.motives.fun,
        agent.motives.social,
        agent.motives.hygiene,
        agent.motives.hunger,
      ].filter((v) => v < -40).length;

      const hitFloor =
        agent.motives.energy <= -95 ||
        agent.motives.hunger <= -95 ||
        (agent.motives.fun <= -95 && agent.motives.social <= -95);

      if (
        passedOutAtWork ||
        hitFloor ||
        severeNegativeCount >= 2 ||
        redMotivesEnd.length >= 3
      ) {
        agent.criticalCollapseStreak += hitFloor || passedOutAtWork ? 2 : 1;
      } else if (redMotivesEnd.length === 0 && agent.motives.energy > 15) {
        agent.criticalCollapseStreak = Math.max(0, agent.criticalCollapseStreak - 1);
      }

      if (agent.netWorth < -1000) {
        agent.status = 'BURNOUT';
        agent.burnoutDay = day;
        agent.burnoutReason = 'Bankruptcy: net worth fell below -1,000';
      } else if (agent.criticalCollapseStreak >= 5) {
        agent.status = 'BURNOUT';
        agent.burnoutDay = day;
        agent.burnoutReason =
          'Motive collapse below zero from chronic 24h recovery deficit';
      } else if (agent.consecutiveMissedShifts >= 4) {
        agent.status = 'BURNOUT';
        agent.burnoutDay = day;
        agent.burnoutReason = 'Terminated after 4 consecutive missed shifts';
      }
    }

    // Snapshot Day percentiles
    const netWorths = agents.map((a) => a.netWorth).sort((a, b) => a - b);
    const sumWorth = netWorths.reduce((acc, v) => acc + v, 0);
    const burnoutCount = agents.filter((a) => a.status === 'BURNOUT').length;

    dailyTrajectory.push({
      day,
      p10: percentile(netWorths, 0.1),
      median: percentile(netWorths, 0.5),
      p90: percentile(netWorths, 0.9),
      mean: Math.round(sumWorth / agents.length),
      activeCount: agents.length - burnoutCount,
      burnoutCount,
    });
  }

  const lastDay = dailyTrajectory[dailyTrajectory.length - 1] ?? {
    p10: 0,
    median: 0,
    p90: 0,
    burnoutCount: 0,
  };

  const agentSummaries: SimulatedAgentSummary[] = agents.map((a) => ({
    id: a.id,
    name: a.name,
    archetype: a.archetype,
    status: a.status,
    burnoutDay: a.burnoutDay,
    burnoutReason: a.burnoutReason,
    finalTier: a.tierIndex + 1,
    endgameRaises: a.endgameRaises,
    finalNetWorth: a.netWorth,
    totalWageEarned: a.totalWageEarned,
    totalBonusEarned: a.totalBonusEarned,
    bonusesWon: a.bonusesWon,
    shiftsCompleted: a.shiftsCompleted,
    shiftsMissed: a.shiftsMissed,
    lastDailyExpense: a.lastDailyExpense,
    avgDailyExpense: Math.round(a.totalExpensesPaid / daysToSimulate),
    avgTimeDeficitHours: Number((a.totalTimeDeficitHours / daysToSimulate).toFixed(2)),
    finalMotives: {
      energy: Math.round(a.motives.energy),
      fun: Math.round(a.motives.fun),
      social: Math.round(a.motives.social),
      hygiene: Math.round(a.motives.hygiene),
      hunger: Math.round(a.motives.hunger),
      bladder: Math.round(a.motives.bladder),
    },
  }));

  const archetypes: AgentArchetype[] = ['CASUAL', 'EFFICIENCY', 'SLACKER', 'VOLATILE'];
  const cohorts: CohortSummary[] = archetypes.map((arch) => {
    const group = agentSummaries.filter((a) => a.archetype === arch);
    const sortedWorth = group.map((g) => g.finalNetWorth).sort((a, b) => a - b);
    return {
      archetype: arch,
      label: ARCHETYPE_PROFILES[arch].label,
      count: group.length,
      burnoutCount: group.filter((g) => g.status === 'BURNOUT').length,
      avgFinalTier: Number(
        (group.reduce((s, g) => s + g.finalTier, 0) / Math.max(1, group.length)).toFixed(1)
      ),
      medianNetWorth: percentile(sortedWorth, 0.5),
      avgBonusEarned: Math.round(
        group.reduce((s, g) => s + g.totalBonusEarned, 0) / Math.max(1, group.length)
      ),
      avgEnergy: Math.round(
        group.reduce((s, g) => s + g.finalMotives.energy, 0) / Math.max(1, group.length)
      ),
    };
  });

  // Final Verdict Evaluation
  const verdictReasons: string[] = [];
  const casualCohort = cohorts.find((c) => c.archetype === 'CASUAL');
  const burnoutRate = lastDay.burnoutCount / agents.length;

  if (lastDay.burnoutCount >= 4) {
    verdictReasons.push(
      `${lastDay.burnoutCount}/20 agents (${Math.round(burnoutRate * 100)}%) collapsed into burnout/deadlock due to negative motive spiral, absenteeism, or bankruptcy (< -1,000).`
    );
  }
  if (lastDay.median < 0) {
    verdictReasons.push(
      `Median 60-day net worth is negative (${lastDay.median.toLocaleString()}), indicating wages fail to cover basic daily living costs.`
    );
  }
  if (casualCohort && mod.tier_count >= 4 && casualCohort.avgFinalTier < 2.5) {
    verdictReasons.push(
      `Casual agents averaged only Tier ${casualCohort.avgFinalTier} after 60 days, signaling excessive promotion or skill-hour bottlenecks.`
    );
  }
  if (lastDay.p90 > 250000) {
    verdictReasons.push(
      `P90 net worth reached ${lastDay.p90.toLocaleString()} in 60 days, risking runaway late-game inflation.`
    );
  }

  const verdict: SimulationVerdict =
    verdictReasons.length === 0 ? 'GREENLIGHT' : 'FAILED (Balance Issue)';

  if (verdict === 'GREENLIGHT') {
    verdictReasons.push(
      `Healthy 60-day economy: median net worth reached ${lastDay.median.toLocaleString()} (adaptive 50–1,000/day lifestyle) with ${lastDay.burnoutCount}/20 burnout cases.`
    );
  }

  return {
    careerName: mod.career_name,
    daysSimulated: daysToSimulate,
    agentCount: agents.length,
    seed,
    dailyTrajectory,
    finalMedianNetWorth: lastDay.median,
    finalP10NetWorth: lastDay.p10,
    finalP90NetWorth: lastDay.p90,
    burnoutCount: lastDay.burnoutCount,
    verdict,
    verdictReasons,
    cohorts,
    agents: agentSummaries,
  };
}
