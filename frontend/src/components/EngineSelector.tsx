// src/components/EngineSelector.tsx
import React from "react";
import type { Engine } from "../lib/api";

interface Props {
  value: Engine;
  onChange: (e: Engine) => void;
}

export default function EngineSelector({ value, onChange }: Props) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 dark:bg-zinc-800 p-1">
      {(["poisson", "dc"] as Engine[]).map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-3 py-1.5 text-sm rounded-full transition
            ${value === opt ? "bg-white dark:bg-zinc-700 shadow font-semibold" : "opacity-70 hover:opacity-100"}`}
          title={opt === "poisson" ? "Modelo Poisson clásico" : "Dixon-Coles (ataque/defensa + ρ)"}
          type="button"
        >
          {opt === "poisson" ? "Poisson" : "Dixon-Coles"}
        </button>
      ))}
    </div>
  );
}
