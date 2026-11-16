import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import {
  BalanceConstraints,
  CareerDesignNotes,
  CareerMod,
  CareerTier,
  EconomyArchetype,
} from './types/career.ts';
import {
  auditCareerBalance,
  computeTierMetrics,
  DEFAULT_CONSTRAINTS,
  formatHourRange,
  SAMPLE_DESIGN_NOTES,
  SAMPLE_HACKER_MOD,
} from './utils/balance.ts';
import { TierEditorPanel } from './components/TierEditorPanel.tsx';
import { EconomyAnalyzer } from './components/EconomyAnalyzer.tsx';
import { JsonViewer } from './components/JsonViewer.tsx';
import { SchemaGuide } from './components/SchemaGuide.tsx';
import { DesignNotesCard } from './components/DesignNotesCard.tsx';
import { PlaytestSimulator } from './components/PlaytestSimulator.tsx';

type WorkspaceTab = 'overview' | 'economy' | 'json' | 'schema';

const PRESET_CONCEPTS: Array<{ label: string; prompt: string; archetype: EconomyArchetype }> = [
  {
    label: 'Cyber Hacker',
    prompt:
      'Underground Cyber Hacker: nocturnal corporate server infiltration, vault decryption, and darknet intel brokering. Low early base wages offset by high-payout exploit bounties, fewer shifts at higher tiers with steep risk/reward variance, heavy energy and fun drain, and Programming + Logic skill gates.',
    archetype: 'high_risk_bonus',
  },
  {
    label: 'Space Smuggler',
    prompt:
      'Interstellar Smuggler: rise from cargo deckhand to legendary free-sector captain. Running blockades, bribing station customs, and tuning hyperdrives. Irregular long shifts with huge high-risk haul bonuses driven by Charisma, Handiness, and Rocket Science.',
    archetype: 'high_risk_bonus',
  },
  {
    label: 'Rogue Chef',
    prompt:
      'Underground Michelin Chef: cooking forbidden delicacies inside hidden private supper clubs. Grueling prep shifts early on before commanding an exclusive midnight kitchen. Evening schedule, steady base pay plus VIP tasting bonuses, high energy and hygiene drain, Cooking + Gourmet Cooking.',
    archetype: 'balanced',
  },
  {
    label: 'Royal Alchemist',
    prompt:
      'Court & Underground Alchemist: progress from herbalist apprentice to Philosopher Stone researcher. Brewing potions and transmuting reagents with reliable salary progression and rare commission bonuses, requiring Logic and Herbalism.',
    archetype: 'steady_salary',
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [concept, setConcept] = useState<string>(PRESET_CONCEPTS[0].prompt);
  const [constraints, setConstraints] = useState<BalanceConstraints>(DEFAULT_CONSTRAINTS);
  const [showGenerator, setShowGenerator] = useState<boolean>(true);
  const [showGuardrails, setShowGuardrails] = useState<boolean>(false);
  const [mod, setMod] = useState<CareerMod>(SAMPLE_HACKER_MOD);
  const [designNotes, setDesignNotes] = useState<CareerDesignNotes>(SAMPLE_DESIGN_NOTES);
  const [selectedTierNum, setSelectedTierNum] = useState<number | null>(1);
  const [refineInput, setRefineInput] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isRefining, setIsRefining] = useState<boolean>(false);
  const [streamChars, setStreamChars] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isBusy = isGenerating || isRefining;

  const auditItems = useMemo(
    () => auditCareerBalance(mod, constraints),
    [mod, constraints]
  );

  const issueCount = useMemo(
    () => auditItems.filter((item) => item.severity !== 'pass').length,
    [auditItems]
  );

  const tierMetrics = useMemo(
    () => mod.tier_progression.map(computeTierMetrics),
    [mod.tier_progression]
  );

  const summaryStats = useMemo(() => {
    const tiers = mod.tier_progression;
    if (tiers.length === 0) {
      return { minWage: 0, maxWage: 0, maxWeeklyExpected: 0 };
    }
    const wages = tiers.map((t) => t.hourly_wage);
    const minWage = Math.min(...wages);
    const maxWage = Math.max(...wages);
    const maxWeeklyExpected = Math.max(
      ...tierMetrics.map((m) => m.weeklyExpectedTotal)
    );
    return { minWage, maxWage, maxWeeklyExpected };
  }, [mod.tier_progression, tierMetrics]);

  const selectedTier = useMemo(
    () => mod.tier_progression.find((t) => t.tier === selectedTierNum) ?? null,
    [mod.tier_progression, selectedTierNum]
  );

  const readCareerStreamOrJson = async (
    response: Response
  ): Promise<{ mod: CareerMod; designNotes?: CareerDesignNotes }> => {
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/event-stream') && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalPayload: { mod: CareerMod; designNotes?: CareerDesignNotes } | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          const lines = frame.split('\n');
          let eventName = 'message';
          const dataLines: string[] = [];
          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              dataLines.push(line.slice(5).trim());
            }
          }
          if (dataLines.length === 0) continue;
          const payload = JSON.parse(dataLines.join('\n')) as {
            chars?: number;
            mod?: CareerMod;
            designNotes?: CareerDesignNotes;
            error?: string;
          };

          if (eventName === 'progress' && typeof payload.chars === 'number') {
            setStreamChars(payload.chars);
          } else if (eventName === 'error') {
            throw new Error(payload.error || 'Generation failed. Please try again.');
          } else if (eventName === 'result' && payload.mod) {
            finalPayload = { mod: payload.mod, designNotes: payload.designNotes };
          }
        }
      }

      if (!finalPayload) {
        throw new Error('Stream ended before receiving complete career mod data.');
      }
      return finalPayload;
    }

    const text = await response.text();
    let data: { mod?: CareerMod; designNotes?: CareerDesignNotes; error?: string } | null = null;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(
        `Server returned a non-JSON response (HTTP ${response.status}). Check that the backend server is running and did not time out.`
      );
    }
    if (!response.ok) {
      throw new Error(data?.error || `Request failed (HTTP ${response.status}). Please try again.`);
    }
    if (!data?.mod) {
      throw new Error('Server did not return valid career mod data.');
    }
    return { mod: data.mod, designNotes: data.designNotes };
  };

  const handleGenerate = async () => {
    if (!concept.trim() || isBusy) return;
    setErrorMessage(null);
    setStreamChars(0);
    setIsGenerating(true);
    try {
      const response = await fetch('/api/careers/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({ concept, constraints }),
      });
      const result = await readCareerStreamOrJson(response);
      setMod(result.mod);
      if (result.designNotes) {
        setDesignNotes(result.designNotes);
      }
      setSelectedTierNum(1);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Request failed. Please check your connection.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefine = async (instructionOverride?: string) => {
    const instruction = (instructionOverride ?? refineInput).trim();
    if (!instruction || isBusy) return;
    setErrorMessage(null);
    setStreamChars(0);
    setIsRefining(true);
    try {
      const response = await fetch('/api/careers/refine', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          currentMod: mod,
          instruction,
          constraints,
        }),
      });
      const result = await readCareerStreamOrJson(response);
      setMod(result.mod);
      if (result.designNotes) {
        setDesignNotes(result.designNotes);
      }
      if (!instructionOverride) {
        setRefineInput('');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Refinement request failed.');
    } finally {
      setIsRefining(false);
    }
  };

  const handleAutoFixAudit = () => {
    const failedSummary = auditItems
      .filter((a) => a.severity !== 'pass')
      .map(
        (a) =>
          `${a.ruleName} (Tiers: ${a.affectedTiers.join(',') || 'Global'}): ${a.summary}`
      )
      .join('; ');
    if (!failedSummary) return;
    handleRefine(
      `Preserve the career theme and flavor, and automatically resolve these balance audit issues: ${failedSummary}`
    );
  };

  const handleTierChange = (updated: CareerTier) => {
    setMod((prev) => ({
      ...prev,
      tier_progression: prev.tier_progression.map((t) =>
        t.tier === updated.tier ? updated : t
      ),
    }));
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(mod, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const slug = mod.career_name
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, '_')
      .replace(/^_+|_+$/g, '');
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${slug || 'career_mod'}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const handleResetSample = () => {
    setMod(SAMPLE_HACKER_MOD);
    setDesignNotes(SAMPLE_DESIGN_NOTES);
    setConstraints(DEFAULT_CONSTRAINTS);
    setConcept(PRESET_CONCEPTS[0].prompt);
    setSelectedTierNum(1);
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* 3-Zone Top Bar */}
      <header className="bg-white border-b border-slate-200 px-6 h-16 flex items-center justify-between gap-8 sticky top-0 z-20">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('overview');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 font-display"
        >
          CareerMod Forge
        </a>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
          {[
            { id: 'overview', label: 'Progression' },
            { id: 'economy', label: 'Economy & Balance' },
            { id: 'json', label: 'Raw JSON' },
            { id: 'schema', label: 'Schema & Rules' },
          ].map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id as WorkspaceTab)}
                className={`py-5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'border-indigo-700 text-slate-900 font-semibold'
                    : 'border-transparent hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleExportJson}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Export Mod JSON
          </button>
        </div>
      </header>

      {/* Mobile Tab Switcher */}
      <div className="md:hidden bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-2 overflow-x-auto">
        {[
          { id: 'overview', label: 'Progression' },
          { id: 'economy', label: 'Economy & Balance' },
          { id: 'json', label: 'Raw JSON' },
          { id: 'schema', label: 'Schema & Rules' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveTab(item.id as WorkspaceTab)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
              activeTab === item.id
                ? 'bg-indigo-700 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Split-Screen Workbench: Left = Mod Builder & Editor | Right = 20-Agent 60-Day Simulator */}
      <div className="flex-1 max-w-[1680px] w-full mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Side: Mod Builder, Guardrails, Progression & Analytics */}
        <main className="xl:col-span-7 min-w-0 w-full space-y-5">
          {/* Collapsible Concept & Guardrails Studio */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => setShowGenerator((v) => !v)}
                className="flex items-center gap-2 text-sm font-semibold text-slate-900 hover:text-indigo-700 transition-colors"
              >
                <span>Career Concept & Generator</span>
                {showGenerator ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </button>

              <div className="flex items-center gap-4 shrink-0">
                <span className="hidden sm:inline text-xs font-mono tabular-nums text-slate-500">
                  {constraints.tierCount} tiers · {constraints.archetype.replace(/_/g, ' ')}
                </span>
                <button
                  type="button"
                  onClick={handleResetSample}
                  className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 whitespace-nowrap"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset Sample
                </button>
              </div>
            </div>

            {showGenerator && (
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                  {/* Concept Prompt & Presets */}
                  <div className="md:col-span-7 space-y-2.5">
                    <textarea
                      rows={4}
                      value={concept}
                      onChange={(e) => setConcept(e.target.value)}
                      placeholder="Describe the career theme, promotion arc, shift timing, core skills, and risk/reward style..."
                      className="w-full px-3 py-2.5 text-xs leading-relaxed text-slate-800 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 resize-y"
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-medium text-slate-500 mr-1">
                        Presets:
                      </span>
                      {PRESET_CONCEPTS.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => {
                            setConcept(preset.prompt);
                            setConstraints((prev) => ({
                              ...prev,
                              archetype: preset.archetype,
                            }));
                          }}
                          className="px-2.5 py-1 text-xs text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md transition-colors whitespace-nowrap"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Tier Count, Economy Profile & Generate Button */}
                  <div className="md:col-span-5 space-y-3.5">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-medium text-slate-700">
                          Tier Count (tier_count)
                        </label>
                        <span className="text-xs font-mono font-semibold tabular-nums text-indigo-700">
                          {constraints.tierCount} Tiers
                        </span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={20}
                        value={constraints.tierCount}
                        onChange={(e) =>
                          setConstraints((prev) => ({
                            ...prev,
                            tierCount: Number(e.target.value),
                          }))
                        }
                        className="w-full accent-indigo-700 cursor-pointer"
                      />
                      <div className="flex justify-between text-[11px] font-mono text-slate-400">
                        <span>1</span>
                        <span>10 (Default)</span>
                        <span>20</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Economy Profile
                      </label>
                      <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
                        {(
                          [
                            { id: 'balanced', label: 'Balanced' },
                            { id: 'high_risk_bonus', label: 'High-Risk' },
                            { id: 'steady_salary', label: 'Steady' },
                          ] as const
                        ).map((arch) => (
                          <button
                            key={arch.id}
                            type="button"
                            onClick={() =>
                              setConstraints((prev) => ({ ...prev, archetype: arch.id }))
                            }
                            className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                              constraints.archetype === arch.id
                                ? 'bg-white text-slate-900 shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            {arch.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleGenerate}
                      disabled={isBusy || !concept.trim()}
                      className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                      {isGenerating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {isGenerating ? 'Generating Career Mod...' : 'Generate Career Mod'}
                    </button>
                  </div>
                </div>

                {/* Collapsible Balance Guardrails */}
                <div className="border-t border-slate-200 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowGuardrails((v) => !v)}
                    className="w-full flex items-center justify-between text-xs font-semibold text-slate-800 hover:text-slate-900"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
                      Balance Guardrails ({constraints.minWeeklyPayFloor}–
                      {constraints.maxWeeklyPayCap} weekly · max {constraints.maxWeeklyHours}h/wk ·{' '}
                      {constraints.maxDaysPerWeek}d · drain ≤{constraints.maxMotiveMultiplier}x)
                    </span>
                    {showGuardrails ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </button>

                  {showGuardrails && (
                    <div className="mt-3.5 space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-1">
                            Min Weekly Exp
                          </label>
                          <input
                            type="number"
                            step={50}
                            min={0}
                            value={constraints.minWeeklyPayFloor}
                            onChange={(e) =>
                              setConstraints((prev) => ({
                                ...prev,
                                minWeeklyPayFloor: Math.max(0, Number(e.target.value) || 0),
                              }))
                            }
                            className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums border border-slate-200 rounded-md"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-1">
                            Max Weekly Exp
                          </label>
                          <input
                            type="number"
                            step={500}
                            min={500}
                            value={constraints.maxWeeklyPayCap}
                            onChange={(e) =>
                              setConstraints((prev) => ({
                                ...prev,
                                maxWeeklyPayCap: Math.max(
                                  500,
                                  Number(e.target.value) || 5000
                                ),
                              }))
                            }
                            className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums border border-slate-200 rounded-md"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-1">
                            Max Hours / Wk
                          </label>
                          <input
                            type="number"
                            min={10}
                            max={112}
                            value={constraints.maxWeeklyHours}
                            onChange={(e) =>
                              setConstraints((prev) => ({
                                ...prev,
                                maxWeeklyHours: Math.max(
                                  10,
                                  Math.min(112, Number(e.target.value) || 70)
                                ),
                              }))
                            }
                            className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums border border-slate-200 rounded-md"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-1">
                            Max Days / Wk
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={7}
                            value={constraints.maxDaysPerWeek}
                            onChange={(e) =>
                              setConstraints((prev) => ({
                                ...prev,
                                maxDaysPerWeek: Math.max(
                                  1,
                                  Math.min(7, Number(e.target.value) || 7)
                                ),
                              }))
                            }
                            className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums border border-slate-200 rounded-md"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-1">
                            Max Drain (x)
                          </label>
                          <input
                            type="number"
                            step={0.1}
                            min={1.0}
                            max={4.0}
                            value={constraints.maxMotiveMultiplier}
                            onChange={(e) =>
                              setConstraints((prev) => ({
                                ...prev,
                                maxMotiveMultiplier: Math.max(
                                  1,
                                  Number(e.target.value) || 2
                                ),
                              }))
                            }
                            className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums border border-slate-200 rounded-md"
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-5 pt-0.5">
                        <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={constraints.enforceMonotonicIncome}
                            onChange={(e) =>
                              setConstraints((prev) => ({
                                ...prev,
                                enforceMonotonicIncome: e.target.checked,
                              }))
                            }
                            className="rounded border-slate-300 text-indigo-700 focus:ring-indigo-600"
                          />
                          Enforce monotonic expected income (base + bonus)
                        </label>
                        <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={constraints.enforceMonotonicSkill}
                            onChange={(e) =>
                              setConstraints((prev) => ({
                                ...prev,
                                enforceMonotonicSkill: e.target.checked,
                              }))
                            }
                            className="rounded border-slate-300 text-indigo-700 focus:ring-indigo-600"
                          />
                          Enforce smooth skill progression (max Lv.10)
                        </label>
                      </div>

                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          Custom Balance Rules (Optional)
                        </label>
                        <input
                          type="text"
                          value={constraints.customRules}
                          onChange={(e) =>
                            setConstraints((prev) => ({
                              ...prev,
                              customRules: e.target.value,
                            }))
                          }
                          placeholder="e.g., No skills above Lv.3 in Tiers 1-3; no Sunday shifts..."
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Career Header & Endgame Config */}
          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-5 border-b border-slate-200">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-slate-500 mb-1">
                  Career Display Name
                </div>
                <input
                  type="text"
                  value={mod.career_name}
                  onChange={(e) =>
                    setMod((prev) => ({ ...prev, career_name: e.target.value }))
                  }
                  className="w-full text-xl font-bold text-slate-900 font-display bg-transparent border border-transparent hover:border-slate-200 focus:border-indigo-600 focus:bg-white rounded-md px-2 py-1 -ml-2 focus:outline-none transition-colors"
                />
              </div>

              <div className="flex flex-wrap items-center gap-4 shrink-0">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Endgame Raise (max_tier_raise_pct)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step={0.01}
                      min={0.01}
                      max={0.5}
                      value={mod.endgame_config.max_tier_raise_pct}
                      onChange={(e) =>
                        setMod((prev) => ({
                          ...prev,
                          endgame_config: {
                            ...prev.endgame_config,
                            max_tier_raise_pct: Number(e.target.value) || 0.1,
                          },
                        }))
                      }
                      className="w-24 px-2.5 py-1.5 text-xs font-mono tabular-nums border border-slate-200 rounded-md"
                    />
                    <span className="text-xs font-mono text-slate-500 tabular-nums">
                      ({Math.round(mod.endgame_config.max_tier_raise_pct * 100)}%)
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Raise Perf Req (perf_req)
                  </label>
                  <input
                    type="number"
                    min={50}
                    step={10}
                    value={mod.endgame_config.max_tier_raise_perf_req}
                    onChange={(e) =>
                      setMod((prev) => ({
                        ...prev,
                        endgame_config: {
                          ...prev.endgame_config,
                          max_tier_raise_perf_req: Math.max(50, Number(e.target.value) || 300),
                        },
                      }))
                    }
                    className="w-28 px-2.5 py-1.5 text-xs font-mono tabular-nums border border-slate-200 rounded-md"
                  />
                </div>
              </div>
            </div>

            {/* 4-Column Summary Metric Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pt-5">
              <div>
                <div className="text-xs text-slate-500">Total Tiers</div>
                <div className="text-xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
                  {mod.tier_progression.length} Tiers
                </div>
                <div className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                  Endgame +{Math.round(mod.endgame_config.max_tier_raise_pct * 100)}%
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500">Hourly Wage Span</div>
                <div className="text-xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
                  {summaryStats.minWage} – {summaryStats.maxWage}
                </div>
                <div className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                  Scaling{' '}
                  {summaryStats.minWage > 0
                    ? (summaryStats.maxWage / summaryStats.minWage).toFixed(1)
                    : '0.0'}
                  x
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500">Peak Weekly Expected Pay</div>
                <div className="text-xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
                  {summaryStats.maxWeeklyExpected.toLocaleString()}
                </div>
                <div className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                  Cap {constraints.maxWeeklyPayCap.toLocaleString()}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500">Guardrail Audit</div>
                <div className="mt-1.5">
                  {issueCount === 0 ? (
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      All Passed ({auditItems.length}/{auditItems.length})
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveTab('economy')}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 hover:underline"
                    >
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      {issueCount} Flagged
                    </button>
                  )}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {issueCount === 0
                    ? 'Within active guardrails'
                    : 'Inspect details or auto-fix'}
                </div>
              </div>
            </div>
          </section>

          {/* AI Refinement Prompt Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <input
              type="text"
              value={refineInput}
              onChange={(e) => setRefineInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRefine();
              }}
              placeholder="Refine with AI, e.g.: Shift Lv.6-10 to weekend night shifts, widen bonus ranges, and lower energy drain..."
              className="flex-1 px-3 py-2 text-xs text-slate-800 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600"
            />
            <div className="flex items-center gap-2 shrink-0">
              {issueCount > 0 && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={handleAutoFixAudit}
                  className="px-3.5 py-2 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  Auto-Fix Warnings
                </button>
              )}
              <button
                type="button"
                disabled={isBusy || !refineInput.trim()}
                onClick={() => handleRefine()}
                className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
              >
                {isRefining && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isRefining ? 'Refining...' : 'Apply AI Refine'}
              </button>
            </div>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-4 py-3 text-xs flex items-center justify-between gap-3"
            >
              <span>{errorMessage}</span>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-rose-700 hover:underline font-medium shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Loading Skeleton */}
          {isBusy ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-slate-600 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-700" />
                  <span>
                    {isGenerating
                      ? 'Generating career tiers and balance analysis...'
                      : 'Applying AI refinement...'}
                  </span>
                </div>
                <span className="text-xs font-mono tabular-nums text-slate-500">
                  {streamChars > 0
                    ? `${streamChars.toLocaleString()} chars received`
                    : 'Connecting to model'}
                </span>
              </div>
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-10 w-full bg-slate-100 rounded animate-pulse"
                />
              ))}
            </div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <div className="space-y-5">
                  <DesignNotesCard
                    notes={designNotes}
                    onApplySuggestion={(tweak) => handleRefine(tweak)}
                    isBusy={isBusy}
                  />
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">
                          Tier Progression Table
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Select any tier row to inspect and edit schedules, bonus curves, motive drain, and skill gates below.
                        </p>
                      </div>
                      <span className="text-xs font-mono text-slate-500 tabular-nums whitespace-nowrap">
                        {mod.tier_progression.length} rows
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                            <th className="py-2.5 px-4 w-16">Tier</th>
                            <th className="py-2.5 px-4 min-w-[200px]">Role Title</th>
                            <th className="py-2.5 px-4 min-w-[170px]">Schedule</th>
                            <th className="py-2.5 px-4 text-right w-24">Hourly Wage</th>
                            <th className="py-2.5 px-4 text-right min-w-[165px]">
                              Bonus Range & Prob
                            </th>
                            <th className="py-2.5 px-4 text-right w-24">Perf Req</th>
                            <th className="py-2.5 px-4 min-w-[190px]">Daily Task & Mood</th>
                            <th className="py-2.5 px-4 min-w-[150px]">Skill Gate</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          {mod.tier_progression.map((tier, index) => {
                            const m = tierMetrics[index];
                            const isSelected = selectedTierNum === tier.tier;
                            const skillText = Object.entries(tier.skill_requirement)
                              .map(([k, v]) => `${k} ${v}`)
                              .join(' · ');

                            return (
                              <tr
                                key={tier.tier}
                                onClick={() =>
                                  setSelectedTierNum(isSelected ? null : tier.tier)
                                }
                                className={`cursor-pointer transition-colors ${
                                  isSelected
                                    ? 'bg-indigo-50/70'
                                    : 'hover:bg-slate-50/80'
                                }`}
                              >
                                <td className="py-2.5 px-4 font-mono font-semibold tabular-nums text-slate-700">
                                  Lv.{tier.tier}
                                </td>
                                <td className="py-2.5 px-4 font-medium text-slate-900">
                                  {tier.title}
                                </td>
                                <td className="py-2.5 px-4 text-slate-600 font-mono tabular-nums">
                                  <div>
                                    {formatHourRange(
                                      tier.schedule.start_hour,
                                      tier.schedule.end_hour
                                    )}{' '}
                                    ({m?.shiftHours}h)
                                  </div>
                                  <div className="text-[11px] text-slate-400 mt-0.5">
                                    {tier.schedule.days.join(' / ')}
                                  </div>
                                </td>
                                <td className="py-2.5 px-4 text-right font-mono font-semibold tabular-nums text-slate-900">
                                  {tier.hourly_wage}
                                </td>
                                <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                                  <div>
                                    {tier.bonus_system.bonus_range[0]}–
                                    {tier.bonus_system.bonus_range[1]}
                                  </div>
                                  <div className="text-[11px] text-slate-400 mt-0.5">
                                    {Math.round(tier.bonus_system.base_probability * 100)}% base · thr{' '}
                                    {tier.bonus_system.performance_threshold}
                                  </div>
                                </td>
                                <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                                  {tier.performance_required}
                                </td>
                                <td className="py-2.5 px-4 text-slate-700">
                                  <div className="truncate max-w-[210px]">
                                    {tier.daily_task.name}
                                  </div>
                                  <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                                    {tier.ideal_mood} · {tier.daily_task.hours_required}h
                                  </div>
                                </td>
                                <td className="py-2.5 px-4 font-mono text-slate-600">
                                  {skillText}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {selectedTier && (
                    <TierEditorPanel
                      tier={selectedTier}
                      onChange={handleTierChange}
                      onClose={() => setSelectedTierNum(null)}
                    />
                  )}
                </div>
              )}

              {activeTab === 'economy' && (
                <EconomyAnalyzer
                  mod={mod}
                  auditItems={auditItems}
                  onAutoFixWithAi={handleAutoFixAudit}
                  isBusy={isBusy}
                />
              )}

              {activeTab === 'json' && (
                <JsonViewer mod={mod} onDownload={handleExportJson} />
              )}

              {activeTab === 'schema' && <SchemaGuide />}
            </>
          )}
        </main>

        {/* Right Side: Live 20-Agent 60-Day Playtest Simulator */}
        <div className="xl:col-span-5 min-w-0 w-full xl:sticky xl:top-20">
          <PlaytestSimulator mod={mod} />
        </div>
      </div>
    </div>
  );
}
