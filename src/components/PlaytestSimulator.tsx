import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Play,
  RefreshCw,
} from 'lucide-react';
import { CareerMod } from '../types/career.ts';
import { CareerSimulationResult } from '../types/simulation.ts';
import { runCareerSimulation } from '../utils/simulator.ts';

interface PlaytestSimulatorProps {
  mod: CareerMod;
}

function formatCompactMoney(val: number): string {
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1000000) return `${sign}${(abs / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}k`;
  return `${val}`;
}

export const PlaytestSimulator: React.FC<PlaytestSimulatorProps> = ({ mod }) => {
  const [seed, setSeed] = useState<number>(20261116);
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
  const [showRoster, setShowRoster] = useState<boolean>(false);

  const result: CareerSimulationResult = useMemo(
    () => runCareerSimulation(mod, seed, 60),
    [mod, seed]
  );

  // SVG Chart Geometry
  const width = 620;
  const height = 240;
  const padL = 52;
  const padR = 16;
  const padT = 16;
  const padB = 30;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const { minVal, maxVal } = useMemo(() => {
    let minV = 0;
    let maxV = 1000;
    for (const pt of result.dailyTrajectory) {
      if (pt.p10 < minV) minV = pt.p10;
      if (pt.p90 > maxV) maxV = pt.p90;
    }
    const span = Math.max(500, maxV - minV);
    return {
      minVal: minV < 0 ? Math.floor(minV - span * 0.08) : 0,
      maxVal: Math.ceil(maxV + span * 0.08),
    };
  }, [result.dailyTrajectory]);

  const toX = (day: number) =>
    padL + ((day - 1) / Math.max(1, result.daysSimulated - 1)) * plotW;

  const toY = (val: number) =>
    padT + (1 - (val - minVal) / Math.max(1, maxVal - minVal)) * plotH;

  const { medianPath, p10Path, p90Path, bandArea } = useMemo(() => {
    const pts = result.dailyTrajectory;
    if (pts.length === 0) {
      return { medianPath: '', p10Path: '', p90Path: '', bandArea: '' };
    }
    const med = pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.day).toFixed(1)},${toY(p.median).toFixed(1)}`)
      .join(' ');
    const p90 = pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.day).toFixed(1)},${toY(p.p90).toFixed(1)}`)
      .join(' ');
    const p10 = pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.day).toFixed(1)},${toY(p.p10).toFixed(1)}`)
      .join(' ');

    const upper = pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.day).toFixed(1)},${toY(p.p90).toFixed(1)}`)
      .join(' ');
    const lower = [...pts]
      .reverse()
      .map((p) => `L${toX(p.day).toFixed(1)},${toY(p.p10).toFixed(1)}`)
      .join(' ');
    return {
      medianPath: med,
      p10Path: p10,
      p90Path: p90,
      bandArea: `${upper} ${lower} Z`,
    };
  }, [result.dailyTrajectory, minVal, maxVal]);

  const activeDayPoint =
    result.dailyTrajectory.find((d) => d.day === hoveredDay) ??
    result.dailyTrajectory[result.dailyTrajectory.length - 1];

  const isGreenlight = result.verdict === 'GREENLIGHT';

  const yTicks = [
    minVal,
    Math.round(minVal + (maxVal - minVal) * 0.33),
    Math.round(minVal + (maxVal - minVal) * 0.66),
    maxVal,
  ];

  return (
    <aside className="bg-white border border-slate-200 rounded-xl overflow-hidden xl:max-h-[calc(100vh-6.5rem)] xl:overflow-y-auto flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900 truncate">
            60-Day AI Agent Playtest Simulator
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 truncate">
            20 agents (8 Casual · 4 Min-Max · 4 Slacker · 4 Volatile) · -100..100 motives · 50–1,000/day lifestyle
          </p>
        </div>

        <button
          type="button"
          onClick={() => setSeed((s) => s + 17)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Re-Run Sim
        </button>
      </div>

      {/* Verdict Banner */}
      <div
        className={`px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4 ${
          isGreenlight ? 'bg-emerald-50/60' : 'bg-rose-50/70'
        }`}
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {isGreenlight ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
            )}
            <span
              className={`text-sm font-bold tracking-tight ${
                isGreenlight ? 'text-emerald-900' : 'text-rose-900'
              }`}
            >
              Verdict: {result.verdict}
            </span>
          </div>
          <ul className="space-y-0.5 text-xs text-slate-700">
            {result.verdictReasons.map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
        </div>
        <span className="text-[11px] font-mono tabular-nums text-slate-500 whitespace-nowrap shrink-0">
          Seed #{result.seed}
        </span>
      </div>

      {/* 4 Summary Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-6 py-4 border-b border-slate-200">
        <div>
          <div className="text-[11px] text-slate-500">Median Net Worth</div>
          <div className="text-lg font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
            {result.finalMedianNetWorth.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500">Day 60 P50</div>
        </div>

        <div>
          <div className="text-[11px] text-slate-500">P10 – P90 Range</div>
          <div className="text-lg font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
            {formatCompactMoney(result.finalP10NetWorth)} –{' '}
            {formatCompactMoney(result.finalP90NetWorth)}
          </div>
          <div className="text-[11px] text-slate-500">Wealth spread</div>
        </div>

        <div>
          <div className="text-[11px] text-slate-500">Deadlock / Burnout</div>
          <div
            className={`text-lg font-semibold font-mono tabular-nums mt-0.5 ${
              result.burnoutCount >= 4
                ? 'text-rose-700'
                : result.burnoutCount > 0
                  ? 'text-amber-700'
                  : 'text-emerald-700'
            }`}
          >
            {result.burnoutCount} / 20
          </div>
          <div className="text-[11px] text-slate-500">Failed / collapsed</div>
        </div>

        <div>
          <div className="text-[11px] text-slate-500">Active Workforce</div>
          <div className="text-lg font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
            {20 - result.burnoutCount} / 20
          </div>
          <div className="text-[11px] text-slate-500">Survived 60 days</div>
        </div>
      </div>

      {/* 60-Day Trajectory Chart */}
      <div className="p-6 border-b border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-xs font-semibold text-slate-900">
              60-Day Net Worth Trajectory (Median & P10–P90 Band)
            </h3>
            {activeDayPoint && (
              <div className="text-xs font-mono tabular-nums text-slate-600 mt-0.5">
                Day {activeDayPoint.day}: Median {activeDayPoint.median.toLocaleString()} · P10{' '}
                {activeDayPoint.p10.toLocaleString()} · P90 {activeDayPoint.p90.toLocaleString()} ·
                Burnout {activeDayPoint.burnoutCount}
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 text-[11px] text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-indigo-700 inline-block" />
              Median (P50)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-2.5 bg-indigo-200/70 border border-indigo-300 inline-block rounded-[1px]" />
              P10–P90 Band
            </span>
          </div>
        </div>

        <div className="w-full overflow-hidden">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto select-none"
            onMouseLeave={() => setHoveredDay(null)}
          >
            {/* Horizontal grid lines */}
            {yTicks.map((tick, idx) => {
              const y = toY(tick);
              return (
                <g key={idx}>
                  <line
                    x1={padL}
                    x2={width - padR}
                    y1={y}
                    y2={y}
                    stroke="#e2e8f0"
                    strokeDasharray={tick === 0 ? undefined : '3 3'}
                    strokeWidth={tick === 0 ? 1.2 : 1}
                  />
                  <text
                    x={padL - 8}
                    y={y + 3.5}
                    textAnchor="end"
                    className="fill-slate-400 text-[10px] font-mono tabular-nums"
                  >
                    {formatCompactMoney(tick)}
                  </text>
                </g>
              );
            })}

            {/* X-axis labels */}
            {[1, 15, 30, 45, 60].map((d) => (
              <text
                key={d}
                x={toX(d)}
                y={height - 8}
                textAnchor="middle"
                className="fill-slate-400 text-[10px] font-mono tabular-nums"
              >
                D{d}
              </text>
            ))}

            {/* P10-P90 Shaded Confidence Band */}
            {bandArea && <path d={bandArea} fill="#c7d2fe" fillOpacity={0.38} />}
            {p90Path && (
              <path
                d={p90Path}
                fill="none"
                stroke="#818cf8"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            )}
            {p10Path && (
              <path
                d={p10Path}
                fill="none"
                stroke="#818cf8"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            )}

            {/* Median Line */}
            {medianPath && (
              <path d={medianPath} fill="none" stroke="#3730a3" strokeWidth={2.2} />
            )}

            {/* Interactive Hover Vertical Indicator */}
            {activeDayPoint && hoveredDay !== null && (
              <g>
                <line
                  x1={toX(activeDayPoint.day)}
                  x2={toX(activeDayPoint.day)}
                  y1={padT}
                  y2={height - padB}
                  stroke="#475569"
                  strokeWidth={1}
                  strokeDasharray="2 2"
                />
                <circle
                  cx={toX(activeDayPoint.day)}
                  cy={toY(activeDayPoint.median)}
                  r={3.5}
                  fill="#3730a3"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
              </g>
            )}

            {/* Invisible hover columns */}
            {result.dailyTrajectory.map((pt) => {
              const colW = plotW / result.daysSimulated;
              return (
                <rect
                  key={pt.day}
                  x={toX(pt.day) - colW / 2}
                  y={padT}
                  width={colW}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHoveredDay(pt.day)}
                />
              );
            })}
          </svg>
        </div>
      </div>

      {/* Archetype Cohort Breakdown */}
      <div className="p-6 border-b border-slate-200">
        <h3 className="text-xs font-semibold text-slate-900 mb-3">
          Archetype Cohort Outcomes (Day 60)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-medium text-slate-500">
                <th className="py-2 pr-3">Archetype</th>
                <th className="py-2 px-2 text-right">Avg Tier</th>
                <th className="py-2 px-2 text-right">Median Worth</th>
                <th className="py-2 px-2 text-right">Avg Bonus</th>
                <th className="py-2 pl-2 text-right">Burnout</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
              {result.cohorts.map((cohort) => (
                <tr key={cohort.archetype} className="hover:bg-slate-50/70">
                  <td className="py-2 pr-3 font-sans font-medium text-slate-900">
                    {cohort.label}
                  </td>
                  <td className="py-2 px-2 text-right text-slate-700">
                    Lv.{cohort.avgFinalTier}
                  </td>
                  <td className="py-2 px-2 text-right font-semibold text-slate-900">
                    {cohort.medianNetWorth.toLocaleString()}
                  </td>
                  <td className="py-2 px-2 text-right text-slate-600">
                    {cohort.avgBonusEarned.toLocaleString()}
                  </td>
                  <td
                    className={`py-2 pl-2 text-right font-medium ${
                      cohort.burnoutCount > 0 ? 'text-rose-700' : 'text-emerald-700'
                    }`}
                  >
                    {cohort.burnoutCount}/{cohort.count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Expandable 20-Agent Roster & 6-Motive Inspector */}
      <div className="px-6 py-4">
        <button
          type="button"
          onClick={() => setShowRoster((v) => !v)}
          className="w-full flex items-center justify-between text-xs font-semibold text-slate-800 hover:text-slate-900"
        >
          <span className="inline-flex items-center gap-1.5">
            <Play className="w-3.5 h-3.5 text-slate-500" />
            Individual Agent Telemetry & 6-Motive State (20 Agents)
          </span>
          {showRoster ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {showRoster && (
          <div className="mt-4 overflow-x-auto max-h-[360px] border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-[11px] font-medium text-slate-500">
                <tr>
                  <th className="py-2 px-3">Agent</th>
                  <th className="py-2 px-2">Type</th>
                  <th className="py-2 px-2 text-right">Tier</th>
                  <th className="py-2 px-2 text-right">Net Worth</th>
                  <th className="py-2 px-2 text-right">Upkeep</th>
                  <th className="py-2 px-2 text-right">E / F / S</th>
                  <th className="py-2 px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.agents.map((agent) => (
                  <tr key={agent.id} className="hover:bg-slate-50/70">
                    <td className="py-2 px-3 font-medium text-slate-900 whitespace-nowrap">
                      {agent.name}
                    </td>
                    <td className="py-2 px-2 text-[11px] font-mono text-slate-500">
                      {agent.archetype}
                    </td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums text-slate-700">
                      Lv.{agent.finalTier}
                      {agent.endgameRaises > 0 ? `+${agent.endgameRaises}` : ''}
                    </td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums font-medium text-slate-900">
                      {agent.finalNetWorth.toLocaleString()}
                    </td>
                    <td
                      className="py-2 px-2 text-right font-mono tabular-nums text-[11px] text-slate-500"
                      title={`Average daily spend: ${agent.avgDailyExpense}/day · Day 60 choice: ${agent.lastDailyExpense}/day`}
                    >
                      {agent.avgDailyExpense}/d
                    </td>
                    <td
                      className={`py-2 px-2 text-right font-mono tabular-nums text-[11px] ${
                        agent.finalMotives.energy < 0 ||
                        agent.finalMotives.fun < 0 ||
                        agent.finalMotives.social < 0
                          ? 'text-rose-700 font-semibold'
                          : 'text-slate-600'
                      }`}
                      title={`Energy ${agent.finalMotives.energy} · Fun ${agent.finalMotives.fun} · Social ${agent.finalMotives.social} · Hygiene ${agent.finalMotives.hygiene} · Hunger ${agent.finalMotives.hunger} · Bladder ${agent.finalMotives.bladder} (-100 to 100 scale)`}
                    >
                      {agent.finalMotives.energy}/{agent.finalMotives.fun}/
                      {agent.finalMotives.social}
                    </td>
                    <td className="py-2 px-3 text-right whitespace-nowrap">
                      {agent.status === 'ACTIVE' ? (
                        <span className="text-xs font-medium text-emerald-700">Active</span>
                      ) : (
                        <span
                          className="text-xs font-medium text-rose-700"
                          title={agent.burnoutReason ?? undefined}
                        >
                          Burnout D{agent.burnoutDay}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </aside>
  );
};
