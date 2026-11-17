import type { IncomingMessage, ServerResponse } from 'node:http';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  BalanceConstraints,
  BalanceRiskSeverity,
  CareerDesignNotes,
  CareerMod,
  CareerTier,
  Weekday,
} from '../src/types/career.ts';

export type ApiRequest = IncomingMessage & {
  body?: unknown;
  method?: string;
  headers: Record<string, string | string[] | undefined>;
};

export type ApiResponse = ServerResponse & {
  flushHeaders?: () => void;
};

const VALID_DAYS: Weekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export const careerResponseSchema = {
  type: Type.OBJECT,
  properties: {
    career_name: {
      type: Type.STRING,
      description: 'Career display title in English, e.g. "Underground Cyber Hacker".',
    },
    tier_count: {
      type: Type.INTEGER,
      description: 'Total number of tiers, between 1 and 20.',
    },
    endgame_config: {
      type: Type.OBJECT,
      properties: {
        max_tier_raise_pct: {
          type: Type.NUMBER,
          description: 'Permanent raise percentage per max-tier bar completion, e.g. 0.10 for 10%.',
        },
        max_tier_raise_perf_req: {
          type: Type.INTEGER,
          description: 'Performance points required at max tier to trigger a raise, e.g. 300.',
        },
      },
      required: ['max_tier_raise_pct', 'max_tier_raise_perf_req'],
    },
    tiers: {
      type: Type.ARRAY,
      description: 'Ordered progression tiers from tier 1 up to tier_count.',
      items: {
        type: Type.OBJECT,
        properties: {
          tier: { type: Type.INTEGER },
          title: {
            type: Type.STRING,
            description: 'Role title in English for this tier, e.g. "Script Kiddie".',
          },
          schedule: {
            type: Type.OBJECT,
            properties: {
              days: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Subset of ["MON","TUE","WED","THU","FRI","SAT","SUN"].',
              },
              start_hour: {
                type: Type.INTEGER,
                description: 'Start hour 0-23.',
              },
              end_hour: {
                type: Type.INTEGER,
                description: 'End hour 0-23. Can wrap past midnight, e.g. 22 to 2.',
              },
            },
            required: ['days', 'start_hour', 'end_hour'],
          },
          hourly_wage: {
            type: Type.NUMBER,
            description: 'Base hourly wage as positive number.',
          },
          bonus_system: {
            type: Type.OBJECT,
            properties: {
              performance_threshold: { type: Type.NUMBER },
              base_probability: {
                type: Type.NUMBER,
                description: 'Base bonus trigger probability between 0.0 and 1.0.',
              },
              prob_growth_coefficient: {
                type: Type.NUMBER,
                description: 'Extra probability per performance point above threshold, e.g. 0.02.',
              },
              bonus_min: { type: Type.NUMBER },
              bonus_max: { type: Type.NUMBER },
            },
            required: [
              'performance_threshold',
              'base_probability',
              'prob_growth_coefficient',
              'bonus_min',
              'bonus_max',
            ],
          },
          performance_required: {
            type: Type.INTEGER,
            description: 'Performance required to promote to next tier.',
          },
          ideal_mood: {
            type: Type.STRING,
            description: 'One of FOCUSED, CONFIDENT, INSPIRED, ENERGIZED, PLAYFUL, HAPPY, FLIRTY.',
          },
          motive_drains: {
            type: Type.ARRAY,
            description: 'Non-1.0 motive drain multipliers such as energy, fun, social, hygiene, hunger.',
            items: {
              type: Type.OBJECT,
              properties: {
                motive: {
                  type: Type.STRING,
                  description: 'Motive key in lowercase: energy, fun, social, hygiene, hunger, bladder.',
                },
                multiplier: {
                  type: Type.NUMBER,
                  description: 'Multiplier e.g. 1.2 or 1.5.',
                },
              },
              required: ['motive', 'multiplier'],
            },
          },
          daily_task: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              category: {
                type: Type.STRING,
                description:
                  'One of PRACTICE_SKILL, RESEARCH, SOCIALIZE, CRAFT_ITEM, PERFORM, FITNESS, ADMIN_WORK.',
              },
              hours_required: { type: Type.NUMBER },
            },
            required: ['name', 'category', 'hours_required'],
          },
          skill_requirements: {
            type: Type.ARRAY,
            description: 'Skills required for this tier, e.g. Programming: 1.',
            items: {
              type: Type.OBJECT,
              properties: {
                skill_name: { type: Type.STRING },
                level: { type: Type.INTEGER },
              },
              required: ['skill_name', 'level'],
            },
          },
        },
        required: [
          'tier',
          'title',
          'schedule',
          'hourly_wage',
          'bonus_system',
          'performance_required',
          'ideal_mood',
          'motive_drains',
          'daily_task',
          'skill_requirements',
        ],
      },
    },
    design_notes: {
      type: Type.OBJECT,
      description:
        'Author-facing gameplay overview and honest balance risk alerts analyzing the generated tiers, written in English.',
      properties: {
        playstyle_overview: {
          type: Type.STRING,
          description:
            '2-3 sentences in English describing the overall gameplay fantasy, shift cadence, and progression feel.',
        },
        early_game_feel: {
          type: Type.STRING,
          description: '1-2 sentences in English on early-tier gameplay feel (Lv.1-3).',
        },
        mid_game_feel: {
          type: Type.STRING,
          description: '1-2 sentences in English on mid-tier transition and skill/bonus spike.',
        },
        late_game_feel: {
          type: Type.STRING,
          description: '1-2 sentences in English on late-tier and endgame raise feel.',
        },
        balance_risks: {
          type: Type.ARRAY,
          description:
            '2 to 4 concrete balance risk alerts in English about potential economy, burnout, schedule, or skill bottlenecks.',
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: 'Concise English risk headline.' },
              severity: {
                type: Type.STRING,
                description: 'One of high, medium, low.',
              },
              detail: {
                type: Type.STRING,
                description: 'Specific English explanation referencing actual tier numbers or mechanics.',
              },
              suggested_tweak: {
                type: Type.STRING,
                description:
                  'Actionable English refinement prompt that the author can apply directly.',
              },
            },
            required: ['title', 'severity', 'detail', 'suggested_tweak'],
          },
        },
      },
      required: [
        'playstyle_overview',
        'early_game_feel',
        'mid_game_feel',
        'late_game_feel',
        'balance_risks',
      ],
    },
  },
  required: ['career_name', 'tier_count', 'endgame_config', 'tiers', 'design_notes'],
};

interface RawLlmTier {
  tier?: number;
  title?: string;
  schedule?: {
    days?: string[];
    start_hour?: number;
    end_hour?: number;
  };
  hourly_wage?: number;
  bonus_system?: {
    performance_threshold?: number;
    base_probability?: number;
    prob_growth_coefficient?: number;
    bonus_min?: number;
    bonus_max?: number;
  };
  performance_required?: number;
  ideal_mood?: string;
  motive_drains?: Array<{ motive?: string; multiplier?: number }>;
  daily_task?: {
    name?: string;
    category?: string;
    hours_required?: number;
  };
  skill_requirements?: Array<{ skill_name?: string; level?: number }>;
}

interface RawLlmResponse {
  career_name?: string;
  tier_count?: number;
  endgame_config?: {
    max_tier_raise_pct?: number;
    max_tier_raise_perf_req?: number;
  };
  tiers?: RawLlmTier[];
  design_notes?: {
    playstyle_overview?: string;
    early_game_feel?: string;
    mid_game_feel?: string;
    late_game_feel?: string;
    balance_risks?: Array<{
      title?: string;
      severity?: string;
      detail?: string;
      suggested_tweak?: string;
    }>;
  };
}

function roundNum(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeCareerMod(
  raw: RawLlmResponse,
  requestedTierCount: number
): CareerMod {
  const targetCount = clamp(Math.round(requestedTierCount || raw.tier_count || 10), 1, 20);
  const rawTiers = Array.isArray(raw.tiers) ? raw.tiers : [];
  const sliced = rawTiers.slice(0, targetCount);

  const normalizedTiers: CareerTier[] = sliced.map((item, idx) => {
    const rawDays = Array.isArray(item.schedule?.days) ? item.schedule.days : ['MON', 'WED', 'FRI'];
    const cleanDays = VALID_DAYS.filter((d) =>
      rawDays.map((x) => String(x).toUpperCase().trim()).includes(d)
    );
    const days: Weekday[] = cleanDays.length > 0 ? cleanDays : ['MON', 'WED', 'FRI'];

    const startHour = clamp(Math.round(Number(item.schedule?.start_hour ?? 9)), 0, 23);
    let endHour = clamp(Math.round(Number(item.schedule?.end_hour ?? 17)), 0, 23);
    if (endHour === startHour) {
      endHour = (startHour + 6) % 24;
    }

    const bonusMin = Math.max(0, Math.round(Number(item.bonus_system?.bonus_min ?? 50)));
    const bonusMax = Math.max(bonusMin, Math.round(Number(item.bonus_system?.bonus_max ?? bonusMin + 100)));

    const motiveMap: Record<string, number> = {};
    if (Array.isArray(item.motive_drains)) {
      for (const m of item.motive_drains) {
        if (m.motive && typeof m.multiplier === 'number' && !Number.isNaN(m.multiplier)) {
          motiveMap[m.motive.toLowerCase().trim()] = roundNum(clamp(m.multiplier, 0.2, 4.0), 2);
        }
      }
    }
    if (Object.keys(motiveMap).length === 0) {
      motiveMap.energy = 1.1;
      motiveMap.fun = 1.1;
    }

    const skillMap: Record<string, number> = {};
    if (Array.isArray(item.skill_requirements)) {
      for (const s of item.skill_requirements) {
        if (s.skill_name && typeof s.level === 'number' && !Number.isNaN(s.level)) {
          skillMap[s.skill_name.trim()] = clamp(Math.round(s.level), 1, 10);
        }
      }
    }
    if (Object.keys(skillMap).length === 0) {
      skillMap.Logic = clamp(idx + 1, 1, 10);
    }

    const perfReq = Math.max(20, Math.round(Number(item.performance_required ?? 100 + idx * 20)));
    const perfThreshold = clamp(
      Math.round(Number(item.bonus_system?.performance_threshold ?? Math.round(perfReq * 0.2))),
      5,
      Math.max(10, perfReq - 5)
    );

    return {
      tier: idx + 1,
      title: String(item.title || `Tier ${idx + 1}`).trim(),
      schedule: {
        days,
        start_hour: startHour,
        end_hour: endHour,
      },
      hourly_wage: Math.max(5, Math.round(Number(item.hourly_wage ?? 30 + idx * 25))),
      bonus_system: {
        performance_threshold: perfThreshold,
        base_probability: roundNum(clamp(Number(item.bonus_system?.base_probability ?? 0.25), 0, 0.95), 3),
        prob_growth_coefficient: roundNum(
          clamp(Number(item.bonus_system?.prob_growth_coefficient ?? 0.02), 0, 0.15),
          4
        ),
        bonus_range: [bonusMin, bonusMax],
      },
      performance_required: perfReq,
      ideal_mood: String(item.ideal_mood || 'FOCUSED').toUpperCase().trim(),
      motive_drain_multipliers: motiveMap,
      daily_task: {
        name: String(item.daily_task?.name || 'Complete Daily Career Prep').trim(),
        category: String(item.daily_task?.category || 'PRACTICE_SKILL').toUpperCase().trim(),
        hours_required: roundNum(clamp(Number(item.daily_task?.hours_required ?? 1.5), 0.5, 6.0), 1),
      },
      skill_requirement: skillMap,
    };
  });

  return {
    career_name: String(raw.career_name || 'Custom Career').trim(),
    tier_count: normalizedTiers.length,
    endgame_config: {
      max_tier_raise_pct: roundNum(
        clamp(Number(raw.endgame_config?.max_tier_raise_pct ?? 0.1), 0.02, 0.5),
        3
      ),
      max_tier_raise_perf_req: Math.max(
        100,
        Math.round(Number(raw.endgame_config?.max_tier_raise_perf_req ?? 300))
      ),
    },
    tier_progression: normalizedTiers,
  };
}

export function normalizeDesignNotes(
  raw: RawLlmResponse,
  mod: CareerMod
): CareerDesignNotes {
  const notes = raw.design_notes;
  const rawRisks = Array.isArray(notes?.balance_risks) ? notes.balance_risks : [];

  const balance_risks = rawRisks
    .filter((r) => r && (r.title || r.detail))
    .slice(0, 5)
    .map((r) => {
      const sevRaw = String(r.severity || 'medium').toLowerCase().trim();
      const severity: BalanceRiskSeverity =
        sevRaw === 'high' || sevRaw === 'medium' || sevRaw === 'low' ? sevRaw : 'medium';
      return {
        title: String(r.title || 'Pacing & Balance Note').trim(),
        severity,
        detail: String(r.detail || '').trim(),
        suggested_tweak: String(
          r.suggested_tweak || 'Adjust hourly wages, bonus probabilities, or motive drain multipliers for smoother progression.'
        ).trim(),
      };
    });

  return {
    playstyle_overview: String(
      notes?.playstyle_overview ||
        `${mod.career_name} spans ${mod.tier_count} tiers built around thematic skill progression and custom shift schedules.`
    ).trim(),
    early_game_feel: String(
      notes?.early_game_feel || 'Early tiers focus on accessible skill thresholds and steady base shift income to establish momentum.'
    ).trim(),
    mid_game_feel: String(
      notes?.mid_game_feel || 'Mid tiers expand bonus payouts and multi-skill requirements, rewarding high-performance shifts.'
    ).trim(),
    late_game_feel: String(
      notes?.late_game_feel ||
        `Late tiers trim weekly shifts while offering +${Math.round(mod.endgame_config.max_tier_raise_pct * 100)}% permanent raises every ${mod.endgame_config.max_tier_raise_perf_req} endgame performance points.`
    ).trim(),
    balance_risks,
  };
}

export function buildConstraintPrompt(constraints: BalanceConstraints): string {
  const archetypeDesc =
    constraints.archetype === 'high_risk_bonus'
      ? 'High-Risk Bonus Focus: keep base hourly_wage modest in lower/mid tiers, but grant wide bonus_range spreads and meaningful base_probability/prob_growth_coefficient.'
      : constraints.archetype === 'steady_salary'
        ? 'Steady Salary Focus: emphasize reliable hourly_wage progression and narrower, predictable bonus_range spreads.'
        : 'Balanced Progression: smooth exponential/stepped hourly_wage curve paired with thematic bonus_range scaling.';

  return `
Balance & Game Design Constraints (MUST OBEY STRICTLY):
- Language: Write ALL text fields (career_name, tier title, daily_task.name, design_notes, balance_risks) strictly in natural, idiomatic English (no non-English text).
- Exact tier_count: ${constraints.tierCount} (tiers numbered 1 through ${constraints.tierCount}).
- Economy Archetype: ${archetypeDesc}
- Combined Weekly Expected Income Range & Curve: Calculate weekly_expected_total = (hourly_wage * shift_hours * days_count) + ((bonus_min + bonus_max) / 2 * base_probability * days_count). Every tier MUST stay within [${constraints.minWeeklyPayFloor}, ${constraints.maxWeeklyPayCap}]. ${constraints.enforceMonotonicIncome ? 'Combined weekly_expected_total MUST NOT regress (drop below the previous tier), even if base hourly_wage dips on a high-randomness bonus tier.' : 'Combined expected income can vary across tiers.'}
- Weekly Work Hours & Attendance: Schedules can freely mix short frequent shifts (up to ${constraints.maxDaysPerWeek} days/week) or long sparse shifts, as long as total weekly work hours (shift_hours * days_count, accounting for overnight wrap like 22->2 = 4h) is <= ${constraints.maxWeeklyHours} hours/week and days_count is between 1 and ${constraints.maxDaysPerWeek}.
- Motive Drain Safety: Every multiplier in motive_drains MUST be <= ${constraints.maxMotiveMultiplier} and >= 0.6.
- Bonus Threshold Rule: bonus_system.performance_threshold MUST be strictly less than performance_required.
- Skill Progression & Lv.10 Cap: Every individual skill level MUST be between 1 and 10 (never exceed 10). ${constraints.enforceMonotonicSkill ? 'Total required skill levels must scale smoothly without regressing across tiers.' : 'Keep skill requirements thematic (1-10 per skill).'}
- Titles & Daily Tasks: Write evocative English role titles and concrete English daily_task names matching the career theme.
${constraints.customRules.trim() ? `- User Extra Balance Rules: ${constraints.customRules.trim()}` : ''}
`.trim();
}

export const SYSTEM_INSTRUCTION = `You are a senior simulation game economy & systems designer (specializing in life-sim career mods).
Your job is to convert a player's career concept into a balanced, playable, complete progression JSON structure, AND write concise author-facing design_notes (playstyle overview, 3-stage pacing feel, and honest balance risk alerts with actionable suggested_tweak instructions).
Write every text value strictly in English.
Always produce ALL requested tiers from 1 to tier_count without skipping or truncating.
Never invent penalties or negative wages. Every numeric field must respect the provided economy guardrails.`;

export function sendJson(res: ApiResponse, statusCode: number, data: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

export async function readJsonBody<T = Record<string, unknown>>(req: ApiRequest): Promise<T> {
  if (req.body && typeof req.body === 'object') {
    return req.body as T;
  }
  if (typeof req.body === 'string') {
    return JSON.parse(req.body || '{}') as T;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return (raw ? JSON.parse(raw) : {}) as T;
}

export function normalizeSafeConstraints(
  constraints: Partial<BalanceConstraints> | undefined,
  fallbackTierCount = 10
): BalanceConstraints {
  return {
    tierCount: clamp(Number(constraints?.tierCount ?? fallbackTierCount), 1, 20),
    archetype: constraints?.archetype ?? 'balanced',
    minWeeklyPayFloor: Number(constraints?.minWeeklyPayFloor ?? 200),
    maxWeeklyPayCap: Number(constraints?.maxWeeklyPayCap ?? 25000),
    maxWeeklyHours: Number(constraints?.maxWeeklyHours ?? 70),
    maxDaysPerWeek: Number(constraints?.maxDaysPerWeek ?? 7),
    maxMotiveMultiplier: Number(constraints?.maxMotiveMultiplier ?? 2.0),
    enforceMonotonicIncome: constraints?.enforceMonotonicIncome ?? true,
    enforceMonotonicSkill: constraints?.enforceMonotonicSkill ?? true,
    customRules: String(constraints?.customRules ?? ''),
  };
}

const PRIMARY_MODEL = 'gemini-4-hydrogen';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';
const BACKOFF_BASE_MS = 2000;
const ATTEMPT_TIMEOUT_MS = 35000;
const MAX_WALL_BUDGET_MS = 46000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const anyErr = err as { status?: number; code?: number };
  return typeof anyErr.status === 'number'
    ? anyErr.status
    : typeof anyErr.code === 'number'
      ? anyErr.code
      : undefined;
}

function is429Error(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  if (getErrorStatus(err) === 429) return true;
  const msg = String((err as { message?: string }).message ?? '');
  return /\b429\b|RESOURCE_EXHAUSTED|Too Many Requests|Quota exceeded/i.test(msg);
}

function is503Error(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const anyErr = err as { name?: string; message?: string };
  if (getErrorStatus(err) === 503) return true;
  if (anyErr.name === 'AbortError' || anyErr.name === 'TimeoutError') return true;
  const msg = String(anyErr.message ?? '');
  return /\b503\b|UNAVAILABLE|overloaded|high demand|Service Unavailable|aborted|timed out/i.test(msg);
}

function isTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const anyErr = err as { name?: string; message?: string };
  if (anyErr.name === 'AbortError' || anyErr.name === 'TimeoutError') return true;
  return /aborted|timed out|timeout/i.test(String(anyErr.message ?? ''));
}

function formatFriendlyError(err: unknown): { status: number; message: string } {
  if (is429Error(err)) {
    const rawMsg = err instanceof Error ? err.message : String(err ?? '');
    const retryMatch = rawMsg.match(/Please retry in ([^\s."\\]+)/i);
    const limitMatch = rawMsg.match(/limit:\s*(\d+)/i);
    const retryHint = retryMatch ? ` Retry window: ${retryMatch[1]}.` : '';
    const limitHint = limitMatch ? ` (${limitMatch[1]} req/day Free Tier limit)` : '';
    return {
      status: 429,
      message: `Gemini Free Tier quota exceeded${limitHint}.${retryHint} Attach a billing-enabled API key in Settings > Secrets (or Vercel Environment Variables) to unlock higher daily limits.`,
    };
  }
  if (isTimeoutError(err)) {
    return {
      status: 504,
      message: 'AI generation timed out waiting for the model response. Please try again.',
    };
  }
  if (is503Error(err)) {
    return {
      status: 503,
      message: 'Gemini is temporarily overloaded (503). Please try again in a moment.',
    };
  }
  return {
    status: getErrorStatus(err) ?? 500,
    message: err instanceof Error ? err.message : 'Unknown error generating career mod.',
  };
}

function buildModelConfig(model: string, abortSignal: AbortSignal) {
  return {
    systemInstruction: SYSTEM_INSTRUCTION,
    responseMimeType: 'application/json',
    responseSchema: careerResponseSchema,
    thinkingConfig: {
      thinkingLevel: model === FALLBACK_MODEL ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW,
    },
    abortSignal,
  };
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function runGeminiCareerTask(
  req: ApiRequest,
  res: ApiResponse,
  prompt: string,
  tierCount: number
) {
  const ai = getAiClient();
  const acceptHeader = Array.isArray(req.headers.accept)
    ? req.headers.accept.join(',')
    : req.headers.accept || '';
  const wantsStream = acceptHeader.includes('text/event-stream');
  const startedAt = Date.now();

  let clientClosed = false;
  let activeController: AbortController | null = null;
  res.on('close', () => {
    if (!res.writableEnded) {
      clientClosed = true;
      activeController?.abort();
    }
  });

  // At most 1 retry on PRIMARY_MODEL for 503, then 1 fallback attempt on FALLBACK_MODEL on 429/503.
  const attemptPlan: Array<{ model: string; backoffBeforeMs: number }> = [
    { model: PRIMARY_MODEL, backoffBeforeMs: 0 },
    { model: PRIMARY_MODEL, backoffBeforeMs: BACKOFF_BASE_MS },
    { model: FALLBACK_MODEL, backoffBeforeMs: 0 },
  ];

  if (!wantsStream) {
    let lastError: unknown;
    for (let i = 0; i < attemptPlan.length; i++) {
      if (clientClosed) return;
      const step = attemptPlan[i];
      if (i > 0) {
        const prevIs429 = is429Error(lastError);
        const prevIs503 = is503Error(lastError);
        if (!prevIs429 && !prevIs503) break;
        // Skip second PRIMARY_MODEL attempt immediately when 429 quota is exhausted
        if (prevIs429 && step.model === PRIMARY_MODEL) continue;
        const elapsed = Date.now() - startedAt;
        if (elapsed + step.backoffBeforeMs >= MAX_WALL_BUDGET_MS) break;
        if (step.backoffBeforeMs > 0) {
          await delay(step.backoffBeforeMs);
        }
      }

      const controller = new AbortController();
      activeController = controller;
      const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);

      try {
        const response = await ai.models.generateContent({
          model: step.model,
          contents: prompt,
          config: buildModelConfig(step.model, controller.signal),
        });
        clearTimeout(timer);

        const rawText = (response.text ?? '{}').trim();
        const parsed = JSON.parse(rawText) as RawLlmResponse;
        const mod = normalizeCareerMod(parsed, tierCount);
        const designNotes = normalizeDesignNotes(parsed, mod);
        sendJson(res, 200, { mod, designNotes });
        return;
      } catch (err) {
        clearTimeout(timer);
        lastError = err;
        console.warn(
          `[careerAi] Non-stream attempt (${step.model}) failed:`,
          getErrorStatus(err) ?? '',
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    const formatted = formatFriendlyError(lastError);
    console.error('[careerAi] Non-stream request failed:', formatted.status, formatted.message);
    if (!clientClosed && !res.headersSent) {
      sendJson(res, formatted.status, { error: formatted.message, status: formatted.status });
    }
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const sendEvent = (event: string, payload: unknown) => {
    if (!clientClosed && !res.writableEnded) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    }
  };

  sendEvent('progress', { chars: 0 });
  const heartbeat = setInterval(() => {
    if (!clientClosed && !res.writableEnded) {
      res.write(': keep-alive\n\n');
    }
  }, 3000);

  try {
    let lastError: unknown;
    for (let i = 0; i < attemptPlan.length; i++) {
      if (clientClosed) return;
      const step = attemptPlan[i];
      if (i > 0) {
        const prevIs429 = is429Error(lastError);
        const prevIs503 = is503Error(lastError);
        if (!prevIs429 && !prevIs503) break;
        if (prevIs429 && step.model === PRIMARY_MODEL) continue;
        const elapsed = Date.now() - startedAt;
        if (elapsed + step.backoffBeforeMs >= MAX_WALL_BUDGET_MS) break;
        sendEvent('progress', { chars: 0 });
        if (step.backoffBeforeMs > 0) {
          await delay(step.backoffBeforeMs);
        }
      }

      const controller = new AbortController();
      activeController = controller;
      const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);

      try {
        const stream = await ai.models.generateContentStream({
          model: step.model,
          contents: prompt,
          config: buildModelConfig(step.model, controller.signal),
        });

        let fullText = '';
        for await (const chunk of stream) {
          if (clientClosed) break;
          if (chunk.text) {
            fullText += chunk.text;
            sendEvent('progress', { chars: fullText.length });
          }
        }
        clearTimeout(timer);
        if (clientClosed) return;

        const parsed = JSON.parse((fullText || '{}').trim()) as RawLlmResponse;
        const mod = normalizeCareerMod(parsed, tierCount);
        const designNotes = normalizeDesignNotes(parsed, mod);
        sendEvent('result', { mod, designNotes });
        return;
      } catch (err) {
        clearTimeout(timer);
        lastError = err;
        console.warn(
          `[careerAi] SSE attempt (${step.model}) failed:`,
          getErrorStatus(err) ?? '',
          err instanceof Error ? err.message : String(err)
        );
      }
    }
    throw lastError;
  } catch (err) {
    const formatted = formatFriendlyError(err);
    console.error('[careerAi] SSE request failed:', formatted.status, formatted.message);
    sendEvent('error', { error: formatted.message, status: formatted.status });
  } finally {
    clearInterval(heartbeat);
    if (!res.writableEnded) {
      res.end();
    }
  }
}

export async function handleGenerateCareer(req: ApiRequest, res: ApiResponse) {
  if (req.method && req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed. Use POST.' });
    return;
  }

  try {
    const body = await readJsonBody<{
      concept?: string;
      constraints?: BalanceConstraints;
    }>(req);

    if (!body.concept || !body.concept.trim()) {
      sendJson(res, 400, { error: 'Please enter a career concept description.' });
      return;
    }

    if (!process.env.GEMINI_API_KEY) {
      sendJson(res, 500, {
        error:
          'GEMINI_API_KEY is not configured on the server. Add GEMINI_API_KEY to your server / Vercel Environment Variables and redeploy.',
      });
      return;
    }

    const safeConstraints = normalizeSafeConstraints(body.constraints, 10);
    const prompt = `Design a complete ${safeConstraints.tierCount}-tier game career mod in English for the following player concept:
"${body.concept.trim()}"

${buildConstraintPrompt(safeConstraints)}`;

    await runGeminiCareerTask(req, res, prompt, safeConstraints.tierCount);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error generating career mod.';
    console.error('Error generating career mod:', error);
    if (!res.headersSent) {
      sendJson(res, 500, { error: message });
    }
  }
}

export async function handleRefineCareer(req: ApiRequest, res: ApiResponse) {
  if (req.method && req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed. Use POST.' });
    return;
  }

  try {
    const body = await readJsonBody<{
      currentMod?: CareerMod;
      instruction?: string;
      constraints?: BalanceConstraints;
    }>(req);

    if (!body.currentMod || !body.instruction?.trim()) {
      sendJson(res, 400, {
        error: 'Current career mod data and refinement instruction are required.',
      });
      return;
    }

    if (!process.env.GEMINI_API_KEY) {
      sendJson(res, 500, {
        error:
          'GEMINI_API_KEY is not configured on the server. Add GEMINI_API_KEY to your server / Vercel Environment Variables and redeploy.',
      });
      return;
    }

    const safeConstraints = normalizeSafeConstraints(
      body.constraints,
      body.currentMod.tier_count ?? 10
    );
    const prompt = `Here is the existing career mod JSON:
${JSON.stringify(body.currentMod, null, 2)}

Apply the following player modification / rebalancing instruction in English while preserving the exact tier count (${safeConstraints.tierCount}) and keeping unaffected details coherent:
"${body.instruction.trim()}"

${buildConstraintPrompt(safeConstraints)}`;

    await runGeminiCareerTask(req, res, prompt, safeConstraints.tierCount);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error refining career mod.';
    console.error('Error refining career mod:', error);
    if (!res.headersSent) {
      sendJson(res, 500, { error: message });
    }
  }
}
