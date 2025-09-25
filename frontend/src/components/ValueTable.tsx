import React from "react";

export type ValueRow = {
  market: string;
  prob_model: number;
  fair_odds: number;
  odd: number;
  edge_pct: number;
  ev: number;
  kelly_frac: number;
};

export function ValueTable({ rows }: { rows: ValueRow[] }) {
  if (!rows?.length) return null;
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Value table (EV/Kelly)</h3>
        <span className="text-[11px] text-zinc-400">Ordenado por EV</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-xs text-zinc-400">
            <tr className="text-left">
              <th className="py-2 pr-4">Mercado</th>
              <th className="py-2 pr-4">Prob%</th>
              <th className="py-2 pr-4">Cuota justa</th>
              <th className="py-2 pr-4">Tu cuota</th>
              <th className="py-2 pr-4">Edge</th>
              <th className="py-2 pr-4">EV</th>
              <th className="py-2 pr-4">Kelly</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.market} className="border-t border-zinc-800/60">
                <td className="py-2 pr-4 font-medium">{labelMarket(r.market)}</td>
                <td className="py-2 pr-4">{(r.prob_model * 100).toFixed(1)}%</td>
                <td className="py-2 pr-4">{r.fair_odds.toFixed(2)}</td>
                <td className="py-2 pr-4">{r.odd.toFixed(2)}</td>
                <td className="py-2 pr-4">
                  <span className={r.edge_pct >= 0 ? "text-emerald-400" : "text-red-400"}>
                    {r.edge_pct.toFixed(2)}%
                  </span>
                </td>
                <td className="py-2 pr-4">
                  <span className={r.ev >= 0 ? "text-emerald-400" : "text-red-400"}>
                    {r.ev.toFixed(3)}
                  </span>
                </td>
                <td className="py-2 pr-4">{(r.kelly_frac * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
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
