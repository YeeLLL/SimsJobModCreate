import React, { useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { CareerMod } from '../types/career.ts';

interface JsonViewerProps {
  mod: CareerMod;
  onDownload: () => void;
}

export const JsonViewer: React.FC<JsonViewerProps> = ({ mod, onDownload }) => {
  const [copied, setCopied] = useState(false);
  const formatted = JSON.stringify(mod, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-slate-200">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Mod JSON Output</h3>
          <p className="text-xs text-slate-500 mt-0.5 font-mono">
            {mod.career_name} · {mod.tier_count} Tiers · {formatted.length.toLocaleString()} bytes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy JSON'}
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Download .json
          </button>
        </div>
      </div>

      <pre className="p-6 text-xs leading-relaxed font-mono text-slate-800 bg-slate-50/60 overflow-x-auto max-h-[680px]">
        {formatted}
      </pre>
    </div>
  );
};
