import React from 'react';
import { X } from 'lucide-react';
import { CareerTier, Weekday } from '../types/career.ts';
import { computeShiftHours, WEEKDAY_ORDER } from '../utils/balance.ts';

interface TierEditorPanelProps {
  tier: CareerTier;
  onChange: (updated: CareerTier) => void;
  onClose: () => void;
}

const MOODS = ['FOCUSED', 'CONFIDENT', 'INSPIRED', 'ENERGIZED', 'PLAYFUL', 'HAPPY', 'FLIRTY'];
const TASK_CATEGORIES = [
  'PRACTICE_SKILL',
  'RESEARCH',
  'SOCIALIZE',
  'CRAFT_ITEM',
  'PERFORM',
  'FITNESS',
  'ADMIN_WORK',
];

export const TierEditorPanel: React.FC<TierEditorPanelProps> = ({
  tier,
  onChange,
  onClose,
}) => {
  const toggleDay = (day: Weekday) => {
    const exists = tier.schedule.days.includes(day);
    const nextDays = exists
      ? tier.schedule.days.filter((d) => d !== day)
      : WEEKDAY_ORDER.filter((d) => [...tier.schedule.days, day].includes(d));
    if (nextDays.length === 0) return;
    onChange({
      ...tier,
      schedule: { ...tier.schedule, days: nextDays },
    });
  };

  const shiftHours = computeShiftHours(tier.schedule.start_hour, tier.schedule.end_hour);

  const skillEntries = Object.entries(tier.skill_requirement);
  const motiveEntries = Object.entries(tier.motive_drain_multipliers);

  const updateSkill = (oldKey: string, newKey: string, level: number) => {
    const next: Record<string, number> = {};
    for (const [k, v] of skillEntries) {
      if (k === oldKey) {
        if (newKey.trim()) next[newKey.trim()] = Math.max(1, Math.min(10, level));
      } else {
        next[k] = v;
      }
    }
    onChange({ ...tier, skill_requirement: next });
  };

  const addSkill = () => {
    const baseName = 'Logic';
    const key = tier.skill_requirement[baseName] ? `Skill_${skillEntries.length + 1}` : baseName;
    onChange({
      ...tier,
      skill_requirement: { ...tier.skill_requirement, [key]: 1 },
    });
  };

  const removeSkill = (key: string) => {
    const next = { ...tier.skill_requirement };
    delete next[key];
    onChange({ ...tier, skill_requirement: next });
  };

  const updateMotive = (key: string, value: number) => {
    onChange({
      ...tier,
      motive_drain_multipliers: {
        ...tier.motive_drain_multipliers,
        [key]: Number(Math.max(0.2, Math.min(4, value)).toFixed(2)),
      },
    });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 mt-4">
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <div className="text-xs font-medium text-slate-500">
            Tier Inspector · Lv.{tier.tier}
          </div>
          <h3 className="text-base font-semibold text-slate-900 mt-0.5">{tier.title}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          aria-label="Close tier editor"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pt-5">
        {/* Basic & Schedule */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Role Title
            </label>
            <input
              type="text"
              value={tier.title}
              onChange={(e) => onChange({ ...tier, title: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-600">Work Schedule</label>
              <span className="text-xs text-slate-500 tabular-nums font-mono">
                {shiftHours}h/shift · {tier.schedule.days.length}d/wk
              </span>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAY_ORDER.map((day) => {
                const active = tier.schedule.days.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`py-1.5 text-xs font-mono rounded-md border transition-colors ${
                      active
                        ? 'bg-indigo-700 text-white border-indigo-700'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Start Hour (0–23)
              </label>
              <input
                type="number"
                min={0}
                max={23}
                value={tier.schedule.start_hour}
                onChange={(e) =>
                  onChange({
                    ...tier,
                    schedule: {
                      ...tier.schedule,
                      start_hour: Math.max(0, Math.min(23, Number(e.target.value) || 0)),
                    },
                  })
                }
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                End Hour (0–23)
              </label>
              <input
                type="number"
                min={0}
                max={23}
                value={tier.schedule.end_hour}
                onChange={(e) =>
                  onChange({
                    ...tier,
                    schedule: {
                      ...tier.schedule,
                      end_hour: Math.max(0, Math.min(23, Number(e.target.value) || 0)),
                    },
                  })
                }
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600"
              />
            </div>
          </div>
        </div>

        {/* Wage & Bonus */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Hourly Wage
              </label>
              <input
                type="number"
                min={1}
                value={tier.hourly_wage}
                onChange={(e) =>
                  onChange({ ...tier, hourly_wage: Math.max(1, Number(e.target.value) || 1) })
                }
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Perf Required
              </label>
              <input
                type="number"
                min={10}
                value={tier.performance_required}
                onChange={(e) =>
                  onChange({
                    ...tier,
                    performance_required: Math.max(10, Number(e.target.value) || 10),
                  })
                }
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Bonus Threshold
              </label>
              <input
                type="number"
                min={0}
                value={tier.bonus_system.performance_threshold}
                onChange={(e) =>
                  onChange({
                    ...tier,
                    bonus_system: {
                      ...tier.bonus_system,
                      performance_threshold: Math.max(0, Number(e.target.value) || 0),
                    },
                  })
                }
                className="w-full px-2.5 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Base Prob
              </label>
              <input
                type="number"
                step={0.05}
                min={0}
                max={1}
                value={tier.bonus_system.base_probability}
                onChange={(e) =>
                  onChange({
                    ...tier,
                    bonus_system: {
                      ...tier.bonus_system,
                      base_probability: Math.max(0, Math.min(1, Number(e.target.value) || 0)),
                    },
                  })
                }
                className="w-full px-2.5 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Prob Growth
              </label>
              <input
                type="number"
                step={0.005}
                min={0}
                max={0.2}
                value={tier.bonus_system.prob_growth_coefficient}
                onChange={(e) =>
                  onChange({
                    ...tier,
                    bonus_system: {
                      ...tier.bonus_system,
                      prob_growth_coefficient: Math.max(
                        0,
                        Math.min(0.2, Number(e.target.value) || 0)
                      ),
                    },
                  })
                }
                className="w-full px-2.5 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Bonus Min
              </label>
              <input
                type="number"
                min={0}
                value={tier.bonus_system.bonus_range[0]}
                onChange={(e) => {
                  const minVal = Math.max(0, Number(e.target.value) || 0);
                  onChange({
                    ...tier,
                    bonus_system: {
                      ...tier.bonus_system,
                      bonus_range: [minVal, Math.max(minVal, tier.bonus_system.bonus_range[1])],
                    },
                  });
                }}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Bonus Max
              </label>
              <input
                type="number"
                min={0}
                value={tier.bonus_system.bonus_range[1]}
                onChange={(e) => {
                  const maxVal = Math.max(
                    tier.bonus_system.bonus_range[0],
                    Number(e.target.value) || 0
                  );
                  onChange({
                    ...tier,
                    bonus_system: {
                      ...tier.bonus_system,
                      bonus_range: [tier.bonus_system.bonus_range[0], maxVal],
                    },
                  });
                }}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
              />
            </div>
          </div>
        </div>

        {/* Mood, Daily Task, Skills, Motives */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Ideal Mood
              </label>
              <select
                value={tier.ideal_mood}
                onChange={(e) => onChange({ ...tier, ideal_mood: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg bg-white"
              >
                {MOODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Task Category
              </label>
              <select
                value={tier.daily_task.category}
                onChange={(e) =>
                  onChange({
                    ...tier,
                    daily_task: { ...tier.daily_task, category: e.target.value },
                  })
                }
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg bg-white"
              >
                {TASK_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Daily Task Name
              </label>
              <input
                type="text"
                value={tier.daily_task.name}
                onChange={(e) =>
                  onChange({
                    ...tier,
                    daily_task: { ...tier.daily_task, name: e.target.value },
                  })
                }
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Hours
              </label>
              <input
                type="number"
                step={0.5}
                min={0.5}
                max={8}
                value={tier.daily_task.hours_required}
                onChange={(e) =>
                  onChange({
                    ...tier,
                    daily_task: {
                      ...tier.daily_task,
                      hours_required: Math.max(0.5, Number(e.target.value) || 1),
                    },
                  })
                }
                className="w-full px-2.5 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-600">Skill Requirements</label>
              <button
                type="button"
                onClick={addSkill}
                className="text-xs font-medium text-indigo-700 hover:text-indigo-900"
              >
                + Add Skill
              </button>
            </div>
            <div className="space-y-1.5">
              {skillEntries.map(([skillName, level]) => (
                <div key={skillName} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={skillName}
                    onChange={(e) => updateSkill(skillName, e.target.value, level)}
                    className="flex-1 px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-md"
                  />
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={level}
                    onChange={(e) =>
                      updateSkill(skillName, skillName, Number(e.target.value) || 1)
                    }
                    className="w-16 px-2 py-1.5 text-xs font-mono tabular-nums border border-slate-200 rounded-md"
                  />
                  {skillEntries.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSkill(skillName)}
                      className="text-xs text-slate-400 hover:text-rose-600 px-1"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Motive Drain Multipliers
            </label>
            <div className="grid grid-cols-2 gap-2">
              {motiveEntries.map(([motive, mult]) => (
                <div key={motive} className="flex items-center gap-2 border border-slate-200 rounded-md px-2.5 py-1.5">
                  <span className="text-xs font-mono text-slate-600 flex-1">{motive}</span>
                  <input
                    type="number"
                    step={0.05}
                    min={0.2}
                    max={4.0}
                    value={mult}
                    onChange={(e) => updateMotive(motive, Number(e.target.value) || 1)}
                    className="w-16 text-right text-xs font-mono tabular-nums focus:outline-none"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
