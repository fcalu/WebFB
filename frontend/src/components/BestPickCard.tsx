import React from "react";
import { Trophy, Info } from "lucide-react";

type Props = {
  data: {
    market: string;
    selection: string;
    prob_pct: number;
    confidence: number;
    reasons: string[];
    summary: string;
  };
};

export default function BestPickCard({ data }: Props) {
  return (
    <div className="rounded-3xl p-6 text-white shadow-xl bg-gradient-to-br from-pink-600 via-fuchsia-600 to-violet-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white/20 grid place-items-center">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm/5 opacity-90">Mejor predicción</div>
            <div className="text-2xl font-black tracking-tight">{data.selection}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-extrabold">{data.prob_pct.toFixed(2)}%</div>
          <div className="text-xs opacity-90">Confianza {data.confidence.toFixed(0)}/100</div>
        </div>
      </div>

      <div className="mt-4 inline-flex items-center gap-2 text-sm bg-white/15 px-3 py-1 rounded-full">
        <span className="font-semibold">{data.market}</span>
      </div>

      <div className="mt-5 text-sm/6 opacity-95">{data.summary}</div>

      <div className="mt-5">
        <div className="text-xs uppercase tracking-wide opacity-80 mb-2 flex items-center gap-2">
          <Info className="w-4 h-4" /> ¿Por qué?
        </div>
        <ul className="text-sm/6 list-disc pl-5 space-y-1 opacity-95">
          {data.reasons.slice(0, 3).map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      </div>

      <div className="mt-5 text-[11px] opacity-80">
        *Modelo: Poisson + BTTS + MLP (corners y O2.5). No constituye asesoría financiera.
      </div>
    </div>
  );
}
