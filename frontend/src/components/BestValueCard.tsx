import React from "react";
import { TrendingUp } from "lucide-react";
import type { ValueRow } from "./ValueTable";

export function BestValueCard({ pick }: { pick: ValueRow | null | undefined }) {
  if (!pick) return null;
  return (
    <div className="rounded-2xl border border-violet-600/30 bg-gradient-to-br from-violet-900/20 via-zinc-950 to-zinc-950 p-4">
      <div className="flex items-center gap-2 mb-1">
        <TrendingUp className="h-4 w-4 text-violet-400" />
        <h3 className="text-sm font-semibold">Mejor valor (según EV)</h3>
      </div>
      <div className="text-lg font-bold">{labelMarket(pick.market)}</div>
      <div className="mt-1 text-sm text-zinc-300">
        Prob: {(pick.prob_model * 100).toFixed(1)}% · Cuota justa: {pick.fair_odds.toFixed(2)} · Tu cuota: {pick.odd.toFixed(2)}
      </div>
      <div className="mt-1 text-sm">
        Edge: <span className={pick.edge_pct >= 0 ? "text-emerald-400" : "text-red-400"}>{pick.edge_pct.toFixed(2)}%</span>
        {" · "}
        Kelly: {(pick.kelly_frac * 100).toFixed(1)}%
      </div>
    </div>
  );
}

function labelMarket(k: string) {
  const map: Record<string, string> = {
    "1": "1 (Local)",
    "X": "Empate",
    "2": "2 (Visitante)",
    "1X": "Doble: 1X",
    "12": "Doble: 12",
    "X2": "Doble: X2",
    "BTTS": "Ambos anotan",
    "O1_5": "Over 1.5",
    "U1_5": "Under 1.5",
    "O2_5": "Over 2.5",
    "U2_5": "Under 2.5",
    "O3_5": "Over 3.5",
    "U3_5": "Under 3.5",
    "1_&_U3_5": "Gana local & U3.5",
    "1_&_O2_5": "Gana local & O2.5",
    "2_&_U3_5": "Gana visita & U3.5",
    "2_&_O2_5": "Gana visita & O2.5",
  };
  return map[k] ?? k;
}
