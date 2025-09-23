import React from "react";
import { motion } from "framer-motion";
function colorFor(value:number, max:number){ const v=Math.max(0,Math.min(1,value/(max||1))); const hue=(1-v)*200; const sat=80; const light=35+(1-v)*25; return `hsl(${hue}deg ${sat}% ${light}%)`; }
export default function Heatmap({ rows, cols, matrix, title="Matriz de probabilidad (Poisson)" }:{ rows:string[]; cols:string[]; matrix:number[][]; title?:string; }){
  const max = Math.max(...matrix.flat());
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="card p-6">
      <div className="mb-4"><div className="text-dim text-sm">Home goals × Away goals</div><h3 className="text-lg font-bold">{title}</h3></div>
      <div className="overflow-auto">
        <div className="inline-grid" style={{ gridTemplateColumns: `auto repeat(${cols.length}, minmax(40px, 1fr))` }}>
          <div />
          {cols.map((c)=>(<div key={`h-${c}`} className="px-2 py-1 text-center text-dim text-xs">{c}</div>))}
          {rows.map((r,i)=>(<React.Fragment key={`row-${r}`}>
            <div className="px-2 py-1 text-right text-dim text-xs">{r}</div>
            {cols.map((c,j)=>{ const val = matrix[i][j]; return (
              <div key={`cell-${i}-${j}`} className="h-10 w-10 sm:w-12 sm:h-12 grid place-items-center text-[11px] rounded-md m-[2px]" style={{ background: colorFor(val, max) }} title={`${r}-${c}: ${val.toFixed(2)}%`}>
                <span className="text-white/90 drop-shadow">{val.toFixed(1)}%</span>
              </div>
            );})}
          </React.Fragment>))}
        </div>
      </div>
      <div className="mt-4 text-xs text-dim">* Intensidad de color = mayor probabilidad del marcador.</div>
    </motion.div>
  );
}
