import React from 'react';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { BalanceAuditItem, CareerMod } from '../types/career.ts';
import { computeTierMetrics } from '../utils/balance.ts';

interface EconomyAnalyzerProps {
  mod: CareerMod;
  auditItems: BalanceAuditItem[];
  onAutoFixWithAi: () => void;
  isBusy: boolean;
}

export const EconomyAnalyzer: React.FC<EconomyAnalyzerProps> = ({
  mod,
  auditItems,
  onAutoFixWithAi,
  isBusy,
}) => {
  const metrics = mod.tier_progression.map(computeTierMetrics);
  const maxWeeklyTotal = Math.max(1, ...metrics.map((m) => m.weeklyExpectedTotal));
  const issueCount = auditItems.filter((a) => a.severity !== 'pass').length;

  return (
    <div className="space-y-6">
      {/* Income Curve Visualization */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Weekly Expected Income Breakdown (Base Pay vs. Bonus EV)
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Calculated from weekly shift hours and expected bonus payouts (midpoint × base probability) to verify economy pacing.
            </p>
          </div>
          <div className="flex items-center gap-5 text-xs text-slate-600">
            <span className="inline-flex items-center gap-2">
              <span className="w-3 h-3 rounded-xs bg-indigo-700 inline-block" />
              Weekly Base Pay
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="w-3 h-3 rounded-xs bg-amber-500 inline-block" />
              Expected Weekly Bonus
            </span>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {metrics.map((m) => {
            const tier = mod.tier_progression[m.tier - 1];
            const basePct = (m.weeklyBasePay / maxWeeklyTotal) * 100;
            const bonusPct =
              ((m.weeklyExpectedTotal - m.weeklyBasePay) / maxWeeklyTotal) * 100;
            return (
              <div key={m.tier} className="grid grid-cols-12 items-center gap-3 text-xs">
                <div className="col-span-3 sm:col-span-3 truncate font-medium text-slate-800">
                  <span className="font-mono text-slate-500 mr-2 tabular-nums">
                    Lv.{m.tier}
                  </span>
                  {tier?.title}
                </div>
                <div className="col-span-6 sm:col-span-6">
                  <div className="h-5 w-full bg-slate-100 rounded-sm overflow-hidden flex">
                    <div
                      className="h-full bg-indigo-700 transition-all duration-200"
                      style={{ width: `${Math.max(1, basePct)}%` }}
                      title={`Weekly Base Pay: ${m.weeklyBasePay}`}
                    />
                    <div
                      className="h-full bg-amber-500 transition-all duration-200"
                      style={{ width: `${Math.max(0, bonusPct)}%` }}
                      title={`Expected Bonus: ${m.weeklyExpectedTotal - m.weeklyBasePay}`}
                    />
                  </div>
                </div>
                <div className="col-span-3 text-right font-mono tabular-nums text-slate-700">
                  <span className="font-semibold text-slate-900">
                    {m.weeklyExpectedTotal.toLocaleString()}
                  </span>
                  <span className="text-slate-400 mx-1">/</span>
                  <span className="text-slate-500">{m.weeklyHours}h</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Guardrail Audit Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Balance Guardrail Audit</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {issueCount === 0
                ? `All ${auditItems.length} economy and playability guardrails passed cleanly.`
                : `${issueCount} guardrail check(s) flagged warnings or errors. Edit manually or auto-rebalance with AI.`}
            </p>
          </div>
          {issueCount > 0 && (
            <button
              type="button"
              disabled={isBusy}
              onClick={onAutoFixWithAi}
              className="px-4 py-2 text-xs font-medium text-white bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {isBusy ? 'Rebalancing...' : 'Auto-Fix Flagged Issues'}
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-6 w-28">Status</th>
                <th className="py-2.5 px-4 w-56">Guardrail Rule</th>
                <th className="py-2.5 px-4">Audit Summary</th>
                <th className="py-2.5 px-6 text-right w-40">Affected Tiers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {auditItems.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-6">
                    {item.severity === 'pass' && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        Pass
                      </span>
                    )}
                    {item.severity === 'warning' && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        Warning
                      </span>
                    )}
                    {item.severity === 'error' && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700">
                        <XCircle className="w-4 h-4 shrink-0" />
                        Error
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-900">{item.ruleName}</td>
                  <td className="py-3 px-4 text-slate-600 text-xs">{item.summary}</td>
                  <td className="py-3 px-6 text-right font-mono text-xs tabular-nums text-slate-500">
                    {item.affectedTiers.length > 0
                      ? item.affectedTiers.map((t) => `Lv.${t}`).join(' · ')
                      : 'All clear'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
