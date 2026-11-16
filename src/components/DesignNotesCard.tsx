import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Info,
  Sparkles,
} from 'lucide-react';
import { CareerDesignNotes } from '../types/career.ts';

interface DesignNotesCardProps {
  notes: CareerDesignNotes;
  onApplySuggestion: (tweak: string) => void;
  isBusy: boolean;
}

export const DesignNotesCard: React.FC<DesignNotesCardProps> = ({
  notes,
  onApplySuggestion,
  isBusy,
}) => {
  const [expanded, setExpanded] = useState(true);

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-6 py-4 flex items-center justify-between gap-4 border-b border-slate-200">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            Playtest Brief & Balance Risk Alerts
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Review how this career feels in play across progression stages and apply targeted rebalancing tweaks in one click.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          {expanded ? 'Collapse' : 'Expand'}
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {expanded && (
        <div className="p-6 space-y-6">
          {/* Playstyle Overview + 3-stage pacing */}
          <div className="space-y-4">
            <p className="text-sm text-slate-800 leading-relaxed max-w-4xl">
              {notes.playstyle_overview}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-4 border-t border-slate-100">
              <div>
                <div className="text-xs font-semibold text-slate-900 mb-1">
                  Early Game Feel
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {notes.early_game_feel}
                </p>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-900 mb-1">
                  Mid Game Transition
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {notes.mid_game_feel}
                </p>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-900 mb-1">
                  Late & Endgame Loop
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {notes.late_game_feel}
                </p>
              </div>
            </div>
          </div>

          {/* Balance Risk Alerts */}
          <div className="pt-5 border-t border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-slate-900">
                Balance Risk Alerts & Suggested Tweaks
              </h4>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {notes.balance_risks.length} {notes.balance_risks.length === 1 ? 'alert' : 'alerts'}
              </span>
            </div>

            {notes.balance_risks.length === 0 ? (
              <p className="text-xs text-slate-500">
                No major economy or pacing risks detected for the current configuration.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {notes.balance_risks.map((risk, idx) => (
                  <div
                    key={`${risk.title}-${idx}`}
                    className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors"
                  >
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        {risk.severity === 'high' && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 shrink-0">
                            <AlertCircle className="w-3.5 h-3.5" />
                            High Risk
                          </span>
                        )}
                        {risk.severity === 'medium' && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 shrink-0">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Medium Risk
                          </span>
                        )}
                        {risk.severity === 'low' && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 shrink-0">
                            <Info className="w-3.5 h-3.5" />
                            Low Risk
                          </span>
                        )}
                        <span className="text-slate-300" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-xs font-semibold text-slate-900">
                          {risk.title}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {risk.detail}
                      </p>
                      <div className="text-xs text-slate-500 pt-0.5">
                        Suggested tweak: {risk.suggested_tweak}
                      </div>
                    </div>

                    <div className="shrink-0">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => onApplySuggestion(risk.suggested_tweak)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100/80 border border-indigo-200 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Apply Tweak
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
