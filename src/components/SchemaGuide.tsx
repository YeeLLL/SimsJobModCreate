import React from 'react';

export const SchemaGuide: React.FC = () => {
  const schemaRows = [
    {
      field: 'career_name / tier_count',
      type: 'string / integer (1–20)',
      rule: 'Career display title and total number of tiers (1–20), strictly synced with tier_progression length.',
    },
    {
      field: 'endgame_config',
      type: 'object',
      rule: 'Max-tier raise loop: defines max_tier_raise_pct (permanent raise per cycle) and max_tier_raise_perf_req (performance needed).',
    },
    {
      field: 'schedule',
      type: '{ days, start_hour, end_hour }',
      rule: 'Supports overnight wrap-around shifts (e.g., 22 to 2 = 4h), up to 7 days/week and 70 total weekly hours.',
    },
    {
      field: 'hourly_wage & bonus_system',
      type: 'number / object',
      rule: 'Base hourly pay plus probabilistic bonuses; combined weekly expected income stays within range without regressing, while individual tiers can boost bonus variance.',
    },
    {
      field: 'motive_drain_multipliers',
      type: 'Record<string, number>',
      rule: 'Per-motive drain multipliers (energy, fun, social, etc.) bounded by safety thresholds to prevent burnout loops.',
    },
    {
      field: 'daily_task & skill_requirement',
      type: 'object / Record<string, number>',
      rule: 'Daily task definition, category, required hours, and skill level dictionary capped at Lv.10 max per skill.',
    },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-200">
        <h3 className="text-base font-semibold text-slate-900">
          Schema Specification & Extensible Balance Engine
        </h3>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-3xl">
          This workbench pairs structured LLM output schemas with deterministic server-side normalization so every export conforms strictly to your game mod loader. Additional hard balance formulas (such as shift-to-drain compensation or skill whitelist enforcement) can be layered directly onto this rule engine.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
              <th className="py-2.5 px-6 w-60">JSON Field</th>
              <th className="py-2.5 px-4 w-56">Type</th>
              <th className="py-2.5 px-6">Generation & Guardrail Strategy</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {schemaRows.map((row) => (
              <tr key={row.field} className="hover:bg-slate-50/70">
                <td className="py-3.5 px-6 font-mono font-medium text-slate-900">
                  {row.field}
                </td>
                <td className="py-3.5 px-4 font-mono text-slate-500">{row.type}</td>
                <td className="py-3.5 px-6 text-slate-600 leading-relaxed">{row.rule}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
