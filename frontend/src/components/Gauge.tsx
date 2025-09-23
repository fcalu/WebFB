import React from "react";
export default function Gauge({ value, label }:{ value:number; label:string }){
  const v = Math.min(Math.max(value,0),100);
  const angle = (v/100)*360;
  return (
    <div className="flex items-center gap-4">
      <div className="w-24 h-24 rounded-full grid place-items-center" style={{ background: `conic-gradient(#F43F5E ${angle}deg, #2A2A40 ${angle}deg 360deg)` }}>
        <div className="w-18 h-18 rounded-full bg-surface grid place-items-center"><span className="font-bold">{v.toFixed(0)}%</span></div>
      </div>
      <div className="text-dim text-sm">{label}</div>
    </div>
  );
}
