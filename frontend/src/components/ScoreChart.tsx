import React from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
export default function ScoreChart({ data }:{ data:{score:string; pct:number}[] }){
  return (
    <div className="p-4 rounded-2xl border border-line">
      <div className="flex items-center justify-between mb-2">
        <div><div className="text-dim text-sm">Distribución Poisson</div><div className="text-lg font-bold">Top marcadores probables</div></div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="score" /><YAxis /><Tooltip formatter={(v)=>[`${Number(v).toFixed(2)}%`,"Prob"]} />
            <Bar dataKey="pct" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
