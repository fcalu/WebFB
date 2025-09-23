import React from "react";
export function TeamSelect({ label, teams, value, onChange, name }:{ label:string; teams:string[]; value:string; onChange:(v:string)=>void; name:string; }){
  return (
    <div>
      <label className="block text-sm text-dim mb-2">{label}</label>
      <div className="relative">
        <input list={`${name}-list`} className="w-full bg-bg border border-line rounded-2xl px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-primary/40" value={value} onChange={(e)=>onChange(e.target.value)} placeholder="Escribe para buscar..." />
        <datalist id={`${name}-list`}>{teams.map((t)=>(<option key={`${name}-${t}`} value={t}/>))}</datalist>
        {value && (<button onClick={()=>onChange("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-dim text-sm" title="Limpiar">✕</button>)}
      </div>
    </div>
  );
}
