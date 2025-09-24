import React from "react";

type Props = {
  rows: string[];        // ["0","1","2","3","4","5"]
  cols: string[];        // idem
  data: number[][];      // porcentajes 0..100 (matriz filas=home, cols=away)
  title?: string;
};

export default function Heatmap({ rows, cols, data, title = "Mapa de marcadores" }: Props) {
  // escala simple morada
  const cellStyle = (p: number) => {
    const alpha = Math.max(0.08, Math.min(0.88, p / 100)); // 8%..88%
    return { backgroundColor: `rgba(139, 92, 246, ${alpha})` }; // tailwind purple-500
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs uppercase opacity-70 mb-2">{title}</div>
      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th className="w-10" />
              {cols.map((c) => (
                <th key={c} className="px-1 py-1 text-center opacity-70">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r}>
                <th className="pr-2 text-right opacity-70">{r}</th>
                {cols.map((c, j) => {
                  const p = Math.round((data?.[i]?.[j] ?? 0) * 100) / 100; // ya viene en %
                  return (
                    <td key={c} className="p-0.5">
                      <div
                        className="rounded-md text-[10px] sm:text-[11px] text-white text-center leading-5 px-1 py-1"
                        style={cellStyle(p)}
                        title={`${r}-${c} · ${p}%`}
                      >
                        {r}-{c} · {p}%
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-[11px] opacity-60">Filas = goles local · Columnas = goles visitante.</div>
    </div>
  );
}
