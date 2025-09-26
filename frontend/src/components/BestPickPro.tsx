// src/components/BestPickPro.tsx
import Accordion from "./Accordion";

type Scoreline = { score: string; pct: number };
type BestPick = { market: string; selection: string; prob_pct: number; confidence: number; reasons: string[] };

export type PredictResponse = {
  league: string;
  home_team: string;
  away_team: string;
  probs: {
    home_win_pct: number;
    draw_pct: number;
    away_win_pct: number;
    over_2_5_pct: number;
    btts_pct: number;
    o25_mlp_pct?: number;
  };
  poisson: {
    home_lambda: number;
    away_lambda: number;
    top_scorelines: Scoreline[];
  };
  averages: {
    total_yellow_cards_avg: number;
    total_corners_avg: number;
    corners_mlp_pred: number;
  };
  best_pick: BestPick;
  summary: string;

  // opcionales del backend (si existen, se muestran)
  ev?: number;
  kelly?: number;     // 0..1
  edge_pct?: number;  // %
};

const pct = (n?: number) => (n == null || Number.isNaN(n) ? "—" : `${(+n).toFixed(2)}%`);

const cardGradient: React.CSSProperties = {
  borderRadius: 20,
  padding: 20,
  background:
    "linear-gradient(135deg, rgba(168,85,247,.18), rgba(99,102,241,.18))",
  border: "1px solid rgba(99,102,241,.28)",
  boxShadow: "0 20px 40px rgba(0,0,0,.25)",
};

const block: React.CSSProperties = {
  background: "rgba(255,255,255,.03)",
  border: "1px solid rgba(255,255,255,.08)",
  borderRadius: 14,
  padding: 12,
  color: "#d1d5db",
};

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: .85 }}>
        <span>{label}</span>
        <span>{pct(value)}</span>
      </div>
      <div style={{ height: 8, background: "rgba(255,255,255,.08)", borderRadius: 999, overflow: "hidden" }}>
        <div
          style={{
            width: `${Math.max(0, Math.min(100, value))}%`,
            height: "100%",
            background: "linear-gradient(90deg,#7c3aed,#5b21b6)",
          }}
        />
      </div>
    </div>
  );
}

function Gauge({ value }: { value: number }) {
  // value 0..100
  const R = 34;
  const C = 2 * Math.PI * R;
  const frac = Math.max(0, Math.min(100, value)) / 100;
  const dash = `${C * frac} ${C * (1 - frac)}`;
  return (
    <svg width="90" height="90" viewBox="0 0 90 90">
      <circle cx="45" cy="45" r={R} stroke="rgba(255,255,255,.12)" strokeWidth="10" fill="none" />
      <circle
        cx="45" cy="45" r={R}
        stroke="url(#g)"
        strokeLinecap="round"
        strokeWidth="10"
        fill="none"
        strokeDasharray={dash}
        transform="rotate(-90 45 45)"
      />
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a78bfa"/>
          <stop offset="100%" stopColor="#7c3aed"/>
        </linearGradient>
      </defs>
      <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontWeight={900} fontSize="16" fill="#e5e7eb">
        {Math.round(value)}
      </text>
    </svg>
  );
}

function Scorelines({ items }: { items: Scoreline[] }) {
  const top = (items || []).slice(0, 5);
  return (
    <div>
      {top.map((t) => (
        <div key={t.score} style={{ display: "grid", gridTemplateColumns: "70px 1fr 60px", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <div style={{ fontWeight: 800, opacity: .9 }}>{t.score}</div>
          <div style={{ height: 6, background: "rgba(255,255,255,.08)", borderRadius: 999 }}>
            <div style={{
              width: `${t.pct}%`,
              height: "100%",
              background: "linear-gradient(90deg,#22d3ee,#3b82f6)" }}/>
          </div>
          <div style={{ textAlign: "right", opacity: .9 }}>{t.pct.toFixed(2)}%</div>
        </div>
      ))}
    </div>
  );
}

export default function BestPickPro({ data }: { data: PredictResponse }) {
  const p = data.probs;

  // Doble oportunidad aproximada (asumiendo indep. parcial)
  const p1x = Math.max(0, Math.min(100, p.home_win_pct + p.draw_pct));
  const p12 = Math.max(0, Math.min(100, p.home_win_pct + p.away_win_pct));
  const px2 = Math.max(0, Math.min(100, p.draw_pct + p.away_win_pct));

  // Favorito + Under 3.5 (heurística simple)
  const fav =
    p.home_win_pct >= p.away_win_pct && p.home_win_pct >= p.draw_pct ? "1" :
    p.away_win_pct >= p.home_win_pct && p.away_win_pct >= p.draw_pct ? "2" : "X";

  const titlePick = `${data.best_pick.market} — ${data.best_pick.selection}`;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Tarjeta principal */}
      <div style={{ ...cardGradient }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, opacity: .85, marginBottom: 6 }}>Mejor predicción</div>
            <div style={{ fontSize: 30, fontWeight: 900, lineHeight: 1.2, marginBottom: 2 }}>{titlePick}</div>
            <div style={{ fontSize: 16 }}>
              Prob: <b>{pct(data.best_pick.prob_pct)}</b> · Confianza: <b>{pct(data.best_pick.confidence)}</b>
            </div>
          </div>

          <div style={{ display: "grid", placeItems: "center" }}>
            <Gauge value={data.best_pick.confidence} />
            <div style={{ fontSize: 12, textAlign: "center", marginTop: 6, opacity:.8 }}>Confianza</div>
          </div>
        </div>

        {(data.ev !== undefined || data.edge_pct !== undefined || data.kelly !== undefined) && (
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12 }}>
            {data.ev !== undefined && <div style={pill}>EV: <b style={{marginLeft:6}}>{data.ev.toFixed(2)}</b></div>}
            {data.edge_pct !== undefined && <div style={pill}>Edge: <b style={{marginLeft:6}}>{data.edge_pct.toFixed(2)}%</b></div>}
            {data.kelly !== undefined && <div style={pill}>Kelly: <b style={{marginLeft:6}}>{(data.kelly*100).toFixed(1)}%</b></div>}
          </div>
        )}

        <div style={{ marginTop: 10, opacity: 0.9 }}>{data.summary}</div>
      </div>

      {/* Panel colapsable con todo el análisis */}
      <Accordion title="Análisis avanzado (probabilidades, marcadores y opciones)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>
          <div style={block}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>1X2</div>
            <Bar label="1" value={p.home_win_pct} />
            <Bar label="X" value={p.draw_pct} />
            <Bar label="2" value={p.away_win_pct} />
          </div>

          <div style={block}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Goles</div>
            <Bar label="Over 2.5" value={p.over_2_5_pct} />
            <Bar label="BTTS Sí" value={p.btts_pct} />
          </div>

          <div style={block}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Marcadores probables</div>
            <Scorelines items={data.poisson?.top_scorelines || []} />
          </div>
        </div>

        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>
          <div style={block}>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Doble oportunidad: 1X</div>
            <div>Prob: <b>{pct(p1x)}</b></div>
            <div style={{ opacity: .9, marginTop: 6 }}>Cobras con Local o Empate (más segura que 1 limpio).</div>
          </div>
          <div style={block}>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Doble oportunidad: 12</div>
            <div>Prob: <b>{pct(p12)}</b></div>
            <div style={{ opacity: .9, marginTop: 6 }}>Gana cualquiera (evitas el empate).</div>
          </div>
          <div style={block}>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Doble oportunidad: X2</div>
            <div>Prob: <b>{pct(px2)}</b></div>
            <div style={{ opacity: .9, marginTop: 6 }}>Empate o Visitante (si el local no es sólido).</div>
          </div>

          <div style={block}>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Favorito ({fav}) + Under 3.5</div>
            <div style={{ opacity: .9, marginTop: 6 }}>
              {fav === "1" ? "Local" : fav === "2" ? "Visitante" : "Empate"} favorito por poco y tendencia a marcos cortos.
            </div>
          </div>
        </div>

        <div style={{ marginTop: 10, opacity: .6, fontSize: 12 }}>
          *Visualizaciones basadas en Poisson/mezcla de mercado. Uso informativo.
        </div>
      </Accordion>
    </div>
  );
}

const pill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(255,255,255,.06)",
  border: "1px solid rgba(255,255,255,.08)",
  color: "#cbd5e1",
  fontSize: 13,
};
