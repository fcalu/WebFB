import React from "react";

type Odds = Record<string, number>;

export type OddsFormValue = {
  odds: Odds;
  kickoff_utc?: string;
};

export function OddsForm({
  value,
  onChange,
}: {
  value: OddsFormValue;
  onChange: (v: OddsFormValue) => void;
}) {
  const set = (k: string, v: string) => {
    const num = v === "" ? NaN : Number(v.replace(",", "."));
    onChange({ ...value, odds: { ...value.odds, [k]: Number.isFinite(num) ? num : NaN } });
  };

  const setKickoff = (s: string) => {
    onChange({ ...value, kickoff_utc: s || undefined });
  };

  const field = (key: string, label: string, placeholder?: string) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-zinc-400">{label}</label>
      <input
        inputMode="decimal"
        value={Number.isFinite(value.odds[key]) ? String(value.odds[key]) : ""}
        onChange={(e) => set(key, e.target.value)}
        placeholder={placeholder ?? "2.00"}
        className="rounded-xl bg-zinc-900/60 border border-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
      />
    </div>
  );

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Cuotas (opcionales)</h3>
        <span className="text-[11px] text-zinc-400">Sug.: ingrésalas ~5h antes</span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {field("1", "1 (Local)")}
        {field("X", "X (Empate)")}
        {field("2", "2 (Visitante)")}
        {field("O2_5", "Over 2.5")}
        {field("U2_5", "Under 2.5")}
        {field("BTTS", "BTTS Sí")}
        {field("NOBTTS", "BTTS No")}
        {field("O3_5", "Over 3.5")}
        {field("U3_5", "Under 3.5")}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-400">Kickoff (UTC, ISO 8601)</label>
          <input
            type="datetime-local"
            value={value.kickoff_utc ? value.kickoff_utc.substring(0, 16) : ""}
            onChange={(e) => {
              const iso = e.target.value ? new Date(e.target.value).toISOString() : "";
              setKickoff(iso);
            }}
            className="rounded-xl bg-zinc-900/60 border border-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <div className="text-[11px] text-zinc-400 self-end">
          Recomendación: agregar cuotas ~5 horas antes del partido para mayor precisión.
        </div>
      </div>
    </div>
  );
}
