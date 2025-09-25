import React from "react";

export type AIControlsValue = {
  blend_with_market: boolean;
  with_ai: boolean;
  ai_model: string;
  ai_lang: string;
};

export function AIControls({
  value,
  onChange,
}: {
  value: AIControlsValue;
  onChange: (v: AIControlsValue) => void;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Ajustes de análisis</h3>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.blend_with_market}
          onChange={(e) => onChange({ ...value, blend_with_market: e.target.checked })}
        />
        Mezclar modelo con mercado (log-odds)
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.with_ai}
          onChange={(e) => onChange({ ...value, with_ai: e.target.checked })}
        />
        Incluir análisis IA (requiere API Key en backend)
      </label>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-400">Modelo IA</label>
          <select
            value={value.ai_model}
            onChange={(e) => onChange({ ...value, ai_model: e.target.value })}
            className="rounded-xl bg-zinc-900/60 border border-zinc-800 px-3 py-2 text-sm"
          >
            <option value="gpt-4o-mini">gpt-4o-mini</option>
            <option value="gpt-4o">gpt-4o</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-400">Idioma</label>
          <select
            value={value.ai_lang}
            onChange={(e) => onChange({ ...value, ai_lang: e.target.value })}
            className="rounded-xl bg-zinc-900/60 border border-zinc-800 px-3 py-2 text-sm"
          >
            <option value="es">Español</option>
            <option value="en">English</option>
            <option value="pt">Português</option>
          </select>
        </div>
      </div>
    </div>
  );
}
