import { useState } from "react";

type Odds = { "1"?: number; X?: number; "2"?: number; O2_5?: number; BTTS_YES?: number };

export default function IABootDrawer({
  open, onClose, API_BASE, league, home, away, odds
}: {
  open: boolean; onClose: ()=>void; API_BASE: string;
  league: string; home: string; away: string; odds: Odds;
}) {

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState<any>(null);

  async function generate() {
    setLoading(true); setErr(""); setData(null);
    try {
      const body:any = { league, home_team: home, away_team: away };
      if (odds && (odds["1"]||odds["2"]||odds["X"]||odds.O2_5||odds.BTTS_YES)) body.odds = odds;
      const res = await fetch(`${API_BASE}/iaboot/predict`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setData(json);
    } catch(e:any) {
      setErr(e?.message || "Error IA Boot");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,.45)", display:"grid",
      gridTemplateColumns:"1fr min(720px, 92vw)", zIndex:50
    }}>
      <div onClick={onClose} />
      <div style={{ background:"#0b1020", borderLeft:"1px solid rgba(255,255,255,.12)", padding:16, overflowY:"auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <div style={{ fontSize:20, fontWeight:900 }}>🤖 Predicción IA Boot</div>
          <button onClick={onClose} style={{ borderRadius:10, padding:"6px 10px" }}>Cerrar ✕</button>
        </div>

        <button
          onClick={generate}
          disabled={loading || !league || !home || !away}
          style={{ padding:"12px 16px", borderRadius:12, fontWeight:900,
                   background:"linear-gradient(135deg, #7c3aed, #5b21b6)", color:"#fff" }}
        >
          {loading ? "Analizando…" : "Generar con IA"}
        </button>

        {err && <div style={{ marginTop:12, color:"#fecaca" }}>{err}</div>}

        {data && (
          <div style={{ marginTop:16 }}>
            <div style={{ opacity:.9, marginBottom:8 }}>{data.league} — {data.match}</div>
            <div style={{
              background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)",
              padding:12, borderRadius:12, marginBottom:12
            }}>
              {data.summary}
            </div>

            {data.picks?.map((p:any, i:number) => (
              <div key={i} style={{
                marginBottom:10, padding:12, borderRadius:12,
                border:"1px dashed rgba(255,255,255,.2)", background:"rgba(124,58,237,.06)"
              }}>
                <div style={{ fontWeight:900 }}>{p.market} · {p.selection}</div>
                <div style={{ opacity:.85, fontSize:14 }}>Prob: {p.prob_pct?.toFixed?.(2)}% · Confianza: {p.confidence?.toFixed?.(0)}/100</div>
                <div style={{ marginTop:6, opacity:.9 }}>{p.rationale}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
