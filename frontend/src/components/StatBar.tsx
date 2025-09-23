import React from "react";
export default function StatBar({ label, value }:{ label:string; value:number }){
  const v = Math.min(Math.max(value,0),100);
  return (
    <div className="mb-3">
      <div className="flex justify-between mb-1"><span className="text-dim">{label}</span><span className="font-semibold">{v.toFixed(2)}%</span></div>
      <div className="h-2 w-full bg-line rounded-full overflow-hidden"><div className="h-full bg-accent" style={{ width: `${v}%` }}/></div>
    </div>
  );
}
