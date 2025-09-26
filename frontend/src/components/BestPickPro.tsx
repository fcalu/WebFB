import { useMemo, useState } from "react";

type Scoreline = { score: string; pct: number };
type BestPick = { market?: string; selection?: string; prob_pct?: number; confidence?: number; reasons?: string[] };

type Data = {
  league?: string;
  home_team?: string;
  away_team?: string;
  probs?: {
    home_win_pct?: number;
    draw_pct?: number;
    away_win_pct?: number;
    over_2_5_pct?: number;
    btts_pct?: number;
    o25_mlp_pct?: number;
  };
  poisson?: {
    home_lambda?: number;
    away_lambda?: number;
    top_scorelines?: Scoreline[];
  };
  averages?: {
    total_yellow_cards_avg?: number;
    total_corners_avg?: number;
    corners_mlp_pred?: number;
  };
  best_pick?: BestPick;
  summary?: string;
};

const pct = (n?: number) =>
  n == null || Number.isNaN(n) ? "—" : `${(+n).toFixed(2)}%`;

const num = (n?: number, dig = 2) =>
  n == null || Number.isNaN(n) ? "—" : (+n).toFixed(dig);

export default function BestPickPro({ data }: { data: Data }) {
  // Fallbacks seguros
  const probs = data?.probs ?? {};
  const poisson = data?.poisson ?? {};
  const avg = data?.averages ?? {};
  const best = data?.best_pick ?? {};
  const reasons = best?.reasons ?? [];
  const tops: Scoreline[] = Array.isArray(poisson?.top_scorelines)
    ? (poisson!.top_scorelines as Scoreline[])
    : [];

  const [openMore, setOpenMore] = useState(false);

  const title = useMemo(
    () =>
      `${data?.home_team ?? "Local"} vs ${data?.away_team ?? "Visitante"}`,
    [data?.home_team, data?.away_team]
  );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Card principal */}
      <div
        style={{
          borderRadius: 18,
          padding: 18,
          background:
            "linear-gradient(135deg, rgba(168,85,247,.18), rgba(99,102,241,.18))",
          border: "1px solid rgba(99,102,241,.28)",
          boxShadow: "0 20px 40px rgba(0,0,0,.25)",
        }}
      >
        <div style={{ opacity: 0.85, fontSize: 12, fontWeight: 800, marginBottom: 6 }}>
          Mejor predicción
        </div>

        <div style={{ fontSize: 26, fontWeight: 900, marginBottom: 4 }}>
          {best?.market ?? "—"} — {best?.selection ?? "—"}
        </div>

        <div style={{ fontSize: 16, marginBottom: 10 }}>
          Prob: <b>{pct(best?.prob_pct)}</b> · Confianza: <b>{pct(best?.confidence)}</b>
        </div>

        <div style={{ marginBottom: 10, opacity: 0.9 }}>
          {data?.summary ?? title}
        </div>

        {reasons.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            {reasons.map((r, i) => (
              <li key={i} style={{ color: "#d1d5db" }}>
                {r}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Desplegable: más detalles */}
      <div
        style={{
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,.08)",
          background: "rgba(255,255,255,.04)",
        }}
      >
        <button
          onClick={() => setOpenMore((s) => !s)}
          style={{
            width: "100%",
            textAlign: "left",
            padding: "14px 16px",
            background: "transparent",
            border: "none",
            color: "#e5e7eb",
            fontWeight: 800,
          }}
        >
          {openMore ? "▼" : "►"} Ver detalles y mercados
        </button>

        {openMore && (
          <div style={{ padding: 16, display: "grid", gap: 12 }}>
            {/* Mercados */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
                gap: 12,
              }}
            >
              <Card>
                <Title>1X2</Title>
                <div>1: {pct(probs.home_win_pct)}</div>
                <div>X: {pct(probs.draw_pct)}</div>
                <div>2: {pct(probs.away_win_pct)}</div>
              </Card>

              <Card>
                <Title>Goles</Title>
                <div>Over 2.5: {pct(probs.over_2_5_pct)}</div>
                <div>BTTS Sí: {pct(probs.btts_pct)}</div>
              </Card>

              <Card>
                <Title>Marcadores probables</Title>
                {tops.slice(0, 3).map((t) => (
                  <div key={t.score}>
                    {t.score} · {num(t.pct)}%
                  </div>
                ))}
                {tops.length === 0 && <div>—</div>}
              </Card>
            </div>

            {/* Info técnica */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
                gap: 12,
              }}
            >
              <Card>
                <Title>Lambdas (λ)</Title>
                <div>λ Local: {num(poisson?.home_lambda)}</div>
                <div>λ Visitante: {num(poisson?.away_lambda)}</div>
              </Card>

              <Card>
                <Title>Corners y tarjetas</Title>
                <div>Corners (prom): {num(avg?.total_corners_avg)}</div>
                <div>Amarillas (prom): {num(avg?.total_yellow_cards_avg)}</div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,.03)",
        border: "1px solid rgba(255,255,255,.08)",
        borderRadius: 14,
        padding: 12,
        color: "#c7cdd5",
      }}
    >
      {children}
    </div>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return <div style={{ fontWeight: 800, marginBottom: 6 }}>{children}</div>;
}
