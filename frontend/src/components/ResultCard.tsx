import React from "react";
import StatBar from "./StatBar";
import Gauge from "./Gauge";
import ScoreChart from "./ScoreChart";
import { pct, decOdds } from "../lib/format";
import { Copy } from "lucide-react";
import { motion } from "framer-motion";

type Props = {
  home: string; away: string;
  probs: { home_win_pct:number; draw_pct:number; away_win_pct:number; over_2_5_pct:number; btts_pct:number; o25_mlp_pct:number; };
  averages: { total_yellow_cards_avg:number; total_corners_avg:number; corners_mlp_pred:number; };
  topScores: { score:string; pct:number }[];
};
export default function ResultCard({ home, away, probs, averages, topScores }: Props){
  const lines = [
    `1 (${home}) @ ${decOdds(probs.home_win_pct, 0.03)}`,
    `X @ ${decOdds(probs.draw_pct, 0.03)}`,
    `2 (${away}) @ ${decOdds(probs.away_win_pct, 0.03)}`,
    `O2.5 @ ${decOdds(probs.over_2_5_pct, 0.03)}  |  BTTS @ ${decOdds(probs.btts_pct, 0.03)}`,
    `Corners (MLP): ${averages.corners_mlp_pred.toFixed(2)}; Avg: ${averages.total_corners_avg.toFixed(2)}`
  ].join("\n");
  const copy = async ()=>{ try{ await navigator.clipboard.writeText(lines); alert("Líneas copiadas al portapapeles"); }catch(e){} };
  const conf = Math.max(probs.home_win_pct, probs.draw_pct, probs.away_win_pct);
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="card p-6">
      <div className="flex items-start justify-between">
        <div><h3 className="text-lg font-bold">{home} vs {away}</h3><p className="text-dim text-sm">Resumen de probabilidades</p></div>
        <button onClick={copy} className="rounded-2xl border border-line px-3 py-2 text-sm text-dim hover:text-text hover:border-text transition flex items-center gap-2"><Copy className="w-4 h-4" /> Copiar líneas</button>
      </div>
      <div className="grid md:grid-cols-2 gap-8 mt-6">
        <div>
          <h4 className="font-semibold mb-3">1X2 (Poisson)</h4>
          <StatBar label={`${home} gana`} value={probs.home_win_pct} />
          <StatBar label="Empate" value={probs.draw_pct} />
          <StatBar label={`${away} gana`} value={probs.away_win_pct} />
        </div>
        <div className="space-y-3">
          <h4 className="font-semibold mb-3">Mercados</h4>
          <StatBar label="Más de 2.5 goles (blend)" value={probs.over_2_5_pct} />
          <StatBar label="Ambos anotan (BTTS)" value={probs.btts_pct} />
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-2xl border border-line"><div className="text-dim text-sm">O2.5 (MLP)</div><div className="text-xl font-bold">{pct(probs.o25_mlp_pct)}</div></div>
            <div className="p-4 rounded-2xl border border-line"><div className="text-dim text-sm">Corners (MLP)</div><div className="text-xl font-bold">{averages.corners_mlp_pred.toFixed(2)}</div></div>
          </div>
        </div>
      </div>
      <div className="mt-6 grid md:grid-cols-3 gap-6">
        <Gauge value={conf} label="Confianza (máxima prob. 1X2)" />
        <div className="p-4 rounded-2xl border border-line"><div className="text-dim text-sm">Corners promedio</div><div className="text-2xl font-bold">{averages.total_corners_avg.toFixed(2)}</div></div>
        <ScoreChart data={topScores} />
      </div>
    </motion.div>
  );
}
