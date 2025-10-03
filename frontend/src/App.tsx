import { useEffect, useMemo, useState } from "react";
// Se eliminan las importaciones que causan conflicto con las declaraciones de función unificadas.
// import BestPickPro from "./components/BestPickPro";
// import ErrorBoundary from "./components/ErrorBoundary";
// import ParlayDrawer from "./components/ParlayDrawer";
// import BuilderDrawer from "./components/BuilderDrawer";
// import NavDrawer from "./components/NavDrawer";
// import IABootDrawer from "./components/IABootDrawer";
// import InstallBanner from "./components/InstallBanner";
// import PremiumDrawer from "./components/PremiumDrawer";
// import StakeModal from "./components/StakeModal";
// import BetHistoryDrawer from "./components/BetHistoryDrawer";

/* ===== Tipos mínimos ===== */
type ApiLeagues = { leagues: string[] };
type ApiTeams = { teams: string[] };

type PredictResponse = {
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
    top_scorelines: { score: string; pct: number }[];
  };
  averages: {
    total_yellow_cards_avg: number;
    total_corners_avg: number;
    corners_mlp_pred: number;
  };
  best_pick: {
    market: string;
    selection: string;
    prob_pct: number;
    confidence: number;
    reasons: string[];
  };
  summary: string;
  debug?: Record<string, any>;
};

type Odds = { "1"?: number; X?: number; "2"?: number; O2_5?: number; BTTS_YES?: number };
type RawOdds = { "1"?: string; X?: string; "2"?: string; O2_5?: string; BTTS_YES?: string };

const API_BASE: string =
  (typeof process !== "undefined" &&
    (process.env as any).VITE_API_BASE_URL?.replace(/\/$/, "")) ||
  "http://localhost:8000";

/* ===== Helpers ===== */
const toFloat = (v: any) => {
  if (v === undefined || v === null || v === "") return undefined;
  const s = String(v).replace(",", ".").trim();
  const x = Number(s);
  return Number.isFinite(x) ? x : undefined;
};

const pct = (n?: number) => (n == null || Number.isNaN(n) ? "—" : `${(+n).toFixed(2)}%`);

/* ===== Estilos base (dark) ===== */
const page: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(1200px 600px at 20% -10%, #3b0764 0%, transparent 60%), radial-gradient(900px 500px at 120% -20%, #1d4ed8 0%, transparent 55%), #0b1020",
  color: "#e5e7eb",
  fontFamily:
    "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Inter,Helvetica,Arial,Apple Color Emoji,Segoe UI Emoji",
};

const wrap: React.CSSProperties = {
  maxWidth: 900,
  margin: "0 auto",
  padding: "18px 14px 120px",
};

const panel: React.CSSProperties = {
  background: "rgba(255,255,255,.05)",
  border: "1px solid rgba(255,255,255,.10)",
  borderRadius: 16,
  padding: 14,
};

const label: React.CSSProperties = {
  color: "#a5b4fc",
  fontSize: 12,
  marginBottom: 6,
  fontWeight: 800,
  letterSpacing: 0.3,
};

const input: React.CSSProperties = {
  width: "100%",
  background: "#0f172a",
  color: "white",
  border: "1px solid rgba(255,255,255,.18)",
  borderRadius: 12,
  padding: "12px 14px",
  outline: "none",
};

const btnPrimary: React.CSSProperties = {
  background: "linear-gradient(135deg, #7c3aed, #5b21b6)",
  color: "white",
  border: "none",
  borderRadius: 14,
  padding: "14px 18px",
  fontWeight: 900,
  fontSize: 16,
};

const pill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(255,255,255,.06)",
  border: "1px solid rgba(255,255,255,.10)",
  color: "#d1d5db",
  fontSize: 12,
  whiteSpace: "nowrap",
};

/* ===== Cabecera minimal ===== */
/* ===== Cabecera con hamburguesa ===== */
function Header({
  onOpenMenu,
  onOpenHistory,
  onOpenParlay,
  onOpenBuilder,
  onOpenIABoot,
  onOpenPremium,
}: {
  onOpenMenu: () => void;
  onOpenHistory: () => void;
  onOpenParlay: () => void;
  onOpenBuilder: () => void;
  onOpenIABoot: () => void;
  onOpenPremium: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        justifyContent: "space-between",
        marginBottom: 12,
      }}
    >
      {/* Lado izquierdo: Hamburguesa + marca */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          aria-label="Abrir menú"
          onClick={onOpenMenu}
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,.12)",
            background: "rgba(255,255,255,.06)",
            color: "#e5e7eb",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
          }}
        >
          {/* ícono hamburguesa simple */}
          <div style={{ display: "grid", gap: 4 }}>
            <span style={{ display: "block", width: 18, height: 2, background: "#e5e7eb" }} />
            <span style={{ display: "block", width: 18, height: 2, background: "#e5e7eb" }} />
            <span style={{ display: "block", width: 18, height: 2, background: "#e5e7eb" }} />
          </div>
        </button>

        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 14,
            display: "grid",
            placeItems: "center",
            background: "linear-gradient(135deg,#7c3aed,#5b21b6)",
            boxShadow: "0 10px 22px rgba(124,58,237,.35)",
            fontSize: 24,
            fontWeight: 900,
          }}
        >
          ⚽
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1 }}>
            FootyMines · IA Predictor
          </div>
          <div style={{ opacity: 0.8, fontSize: 13 }}>Predicción clara para usuarios finales</div>
        </div>
      </div>

      {/* Acciones rápidas (ocultas en móvil) */}
      <div className="quick-actions" style={{ display: "flex", gap: 8 }}>
        <button
          onClick={onOpenBuilder}
          title="Generador de selección"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,.12)",
            color: "#d1d5db",
            background: "rgba(255,255,255,.06)",
          }}
        >
          🎯 Selección
        </button>
        <button
          onClick={onOpenHistory}
          title="Historial de apuestas"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,.12)",
            color: "#d1d5db",
            background: "rgba(255,255,255,.06)",
          }}
        >
          📒 Historial
        </button>
        <button
          onClick={onOpenParlay}
          title="Generador de Parley"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,.12)",
            color: "#d1d5db",
            background: "rgba(255,255,255,.06)",
          }}
        >
          🧮 Parley
        </button>
        <button
          onClick={onOpenIABoot}
          title="IA Boot"
          style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"10px 14px",
                  borderRadius:12, border:"1px solid rgba(255,255,255,.12)",
                  color:"#d1d5db", background:"rgba(255,255,255,.06)" }}
        >
          🤖 IA Boot
        </button>

      </div>
    </div>
  );
}

/* ===== Editor de cuotas (acepta punto/coma) ===== */
function OddsEditor({
  odds,
  setOdds,
  rawOdds,
  setRawOdds,
}: {
  odds: Odds;
  setOdds: (o: Odds) => void;
  rawOdds: RawOdds;
  setRawOdds: (o: RawOdds) => void;
}) {
  const Field = ({ k, labelText, ph }: { k: keyof Odds; labelText: string; ph: string }) => (
    <div>
      <div style={label}>{labelText}</div>
      <input
        type="text"
        inputMode="decimal"
        placeholder={ph}
        style={input}
        value={rawOdds[k] ?? ""}
        onChange={(e) => setRawOdds({ ...rawOdds, [k]: e.target.value })}
        onBlur={(e) => {
          const num = toFloat(e.target.value);
          setOdds({ ...odds, [k]: num });
          if (num !== undefined) setRawOdds({ ...rawOdds, [k]: String(num) });
        }}
      />
    </div>
  );

  const anyOdds = odds["1"] || odds.X || odds["2"] || odds.O2_5 || odds.BTTS_YES;

  return (
    <div style={{ ...panel, marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ ...pill }}>👛 Cuotas (opcional)</div>
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          Sugerencia: ingrésalas ~5 horas antes para mayor precisión.
        </div>
      </div>
      <div
      
        style={{
          marginTop: 10,
          display: "grid",
          gap: 10,
          gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
        }}
      >
        <Field k="1" labelText="1 (Local)" ph="2.10" />
        <Field k="X" labelText="X (Empate)" ph="3.30" />
        <Field k="2" labelText="2 (Visitante)" ph="3.40" />
        <Field k="O2_5" labelText="Más de 2.5" ph="1.95" />
        <Field k="BTTS_YES" labelText="BTTS Sí" ph="1.85" />
      </div>
      {anyOdds && (
        <div style={{ marginTop: 10 }}>
          <button
            onClick={() => {
              setOdds({});
              setRawOdds({});
            }}
            style={{ ...pill, cursor: "pointer" }}
          >
            🧹 Limpiar cuotas
          </button>
        </div>
      )}
    </div>
  );
}

/* ===== Skeleton simple ===== */
function SkeletonCard() {
  const sk = {
    background: "linear-gradient(90deg,#1f2937 0px,#111827 40px,#1f2937 80px)",
    backgroundSize: "600px",
    animation: "shimmer 1.4s infinite linear",
    height: 14,
    borderRadius: 8,
  } as React.CSSProperties;
  return (
    <div style={{ ...panel }}>
      <style>{`@keyframes shimmer{0%{background-position:-200px 0}100%{background-position:400px 0}}`}</style>
      <div style={{ ...sk, width: "50%", marginBottom: 8 }} />
      <div style={{ ...sk, width: "80%", height: 26, marginBottom: 8 }} />
      <div style={{ ...sk, width: "60%", marginBottom: 8 }} />
      <div style={{ width: "100%", marginBottom: 6 }} />
      <div style={{ width: "90%", marginBottom: 6 }} />
      <div style={{ width: "70%" }} />
    </div>
  );
}

// --- COMPONENTES AUXILIARES (UNIFICADOS) ---

// Componente BestPickPro - Placeholder
function BestPickPro(props: any) {
    if (props.data) {
        const pick = props.data.best_pick;
        return (
            <div style={{ ...panel, padding: 20, textAlign: 'center', backgroundColor: 'rgba(34, 197, 94, 0.1)' }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>Pick Principal: {pick.market} — {pick.selection}</div>
                <div style={{ fontSize: 14, opacity: 0.8, marginTop: 5 }}>Probabilidad: {pick.prob_pct.toFixed(2)}%</div>
            </div>
        );
    }
    return <div style={{ ...panel, padding: 20, textAlign: 'center' }}>Resultado de Pick Profesional (Esperando datos)</div>;
}

// Componente ErrorBoundary - Placeholder
function ErrorBoundary({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}

// Componente StakeModal - Placeholder
function StakeModal(props: any) {
    if (!props.open) return null;
    return <div style={{ ...panel, position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 70, color: 'white' }}>Calculadora de Stake (Modal)</div>;
}

// Componente NavDrawer - Placeholder
function NavDrawer(props: any) {
    if (!props.open) return null;
    return <div style={{ ...panel, position: 'fixed', inset: 0, width: '300px', background: '#111827', zIndex: 70, color: 'white' }}>Menú Principal</div>;
}

// Componente InstallBanner - Placeholder
function InstallBanner() {
    return null;
}

// Componente BetHistoryDrawer - Placeholder
function BetHistoryDrawer(props: any) {
    if (!props.open) return null;
    return <div style={{ ...panel, position: 'fixed', inset: 0, background: '#111827', zIndex: 65, color: 'white' }}>Historial de Apuestas</div>;
}

// Componente ParlayDrawer - Placeholder
function ParlayDrawer(props: any) {
    if (!props.open) return null;
    return <div style={{ ...panel, position: 'fixed', inset: 0, background: '#111827', zIndex: 65, color: 'white' }}>Generador de Parley (Premium: {props.premiumKey ? 'Sí' : 'No'})</div>;
}

// Componente BuilderDrawer - Placeholder
function BuilderDrawer(props: any) {
    if (!props.open) return null;
    return <div style={{ ...panel, position: 'fixed', inset: 0, background: '#111827', zIndex: 65, color: 'white' }}>Generador de Selección (Premium: {props.premiumKey ? 'Sí' : 'No'})</div>;
}

// Componente IABootDrawer - Placeholder
function IABootDrawer(props: any) {
    if (!props.open) return null;
    return <div style={{ ...panel, position: 'fixed', inset: 0, background: '#111827', zIndex: 65, color: 'white' }}>Predicción IA Boot (Premium: {props.premiumKey ? 'Sí' : 'No'})</div>;
}

// Componente PremiumDrawer (Gestión de Monetización)
function PremiumDrawer({ open, onClose, API_BASE, onKeySubmit, currentKey }: any) {
    const [inputKey, setInputKey] = useState(currentKey);
    const [loading, setLoading] = useState(false);
    const isPremiumActive = currentKey.trim().length > 5;

    const handleKeySubmit = () => {
        onKeySubmit(inputKey.trim());
        if (inputKey.trim() === currentKey.trim()) {
             alert(isPremiumActive ? "Clave verificada. ¡Acceso Premium activo!" : "Clave guardada. Verifica tu acceso en el siguiente pronóstico.");
        }
    };
    
    // NOTA: Esta lógica se conecta al endpoint /create-checkout-session de FastAPI
    const handleCheckout = async (plan: any) => {
        const userEmail = prompt("Por favor, ingresa tu dirección de email para la suscripción (usado por Stripe):");
        if (!userEmail) return;

        setLoading(true);

        try {
            const r = await fetch(API_BASE + '/create-checkout-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ price_id: plan.id, user_email: userEmail }),
            });
            
            if (!r.ok) {
                const errorText = await r.text();
                throw new Error('Error al crear la sesión de pago: ' + errorText);
            }

            const { session_url } = await r.json(); 
            
            // CORRECCIÓN FINAL: Simplemente se redirige si se obtiene la URL
            if (session_url) {
                window.location.href = session_url;
            } else {
                 throw new Error('El backend no devolvió una URL de pago válida.');
            }

        } catch (e) {
            alert("Fallo el pago: " + (e as Error).message);
        } finally {
            setLoading(false);
        }
    }

    const PLANS = [
        { id: 'price_SEMANAL_ID', name: 'SEMANAL', price: 70.00, interval: 'Semanal' },
        { id: 'price_MENSUAL_ID', name: 'MENSUAL', price: 130.00, interval: 'Mensual' },
        { id: 'price_ANUAL_ID', name: 'ANUAL', price: 1300.00, interval: 'Anual' },
    ];
    const buttonPrimary: React.CSSProperties = {
        background:"linear-gradient(135deg,#7c3aed,#5b21b6)",
        color:"#fff", border:"none", borderRadius:12, padding:"12px 18px",
        fontWeight:900, cursor:"pointer", transition: 'opacity 0.2s'
    };
    const planCardStyle: React.CSSProperties = {
        padding: 20,
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,.2)",
        textAlign: 'center',
        background: 'rgba(255,255,255,.05)',
        flex: 1,
        minWidth: '200px'
    };
    const inputStyleLocal: React.CSSProperties = {
        width: "100%",
        background: "#0f172a",
        color: "white",
        border: "1px solid rgba(255,255,255,.18)",
        borderRadius: 8,
        padding: "10px 14px",
        outline: "none",
        fontSize: 14
    };
    const overlayStyleLocal: React.CSSProperties = {
        position: "fixed", inset: 0, background: "rgba(0,0,0,.65)",
        display: "grid", placeItems: "center", zIndex: 60,
        backdropFilter: 'blur(5px)'
    };
    const cardStyleLocal: React.CSSProperties = {
        width: "min(900px, 92vw)", 
        background: "rgba(17,24,39,.98)",
        border: "1px solid rgba(255,255,255,.15)", 
        borderRadius: 16, 
        padding: 20,
        color: "#e5e7eb", 
        boxShadow: "0 30px 80px rgba(0,0,0,.45)",
        maxHeight: '90vh',
        overflowY: 'auto'
    };
    const pillLocal: React.CSSProperties = {
        display:"inline-flex", alignItems:"center", gap:8, padding:"8px 12px",
        borderRadius:999, background:"rgba(255,255,255,.06)",
        border:"1px solid rgba(255,255,255,.12)", color:"#d1d5db", fontSize:12, cursor: 'pointer'
    };


    if (!open) return null;

    return (
        <div style={overlayStyleLocal} onClick={onClose}>
            <div style={cardStyleLocal} onClick={(e) => e.stopPropagation()}>
                
                {/* ENCABEZADO */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center", marginBottom: 15}}>
                    <h2 style={{fontSize:24, fontWeight:900}}>
                        👑 Acceso Premium 
                        {isPremiumActive && <span style={{ marginLeft: 10, color: '#22c55e', fontSize: 16 }}>(ACTIVO)</span>}
                    </h2>
                    <button onClick={onClose} style={{...pillLocal, opacity: 0.8}}>Cerrar ✕</button>
                </div>

                {/* CONTENIDO PRINCIPAL */}
                <div style={{ display: 'flex', gap: 25, flexWrap: 'wrap' }}>
                    
                    {/* COLUMNA 1: BENEFICIOS */}
                    <div style={{ flex: 2, minWidth: '300px' }}>
                        <p style={{opacity:.9, marginTop:8, fontSize: 16, fontWeight: 600}}>
                            Desbloquea el poder del análisis profundo y las herramientas Pro:
                        </p>
                        <ul style={{marginTop:12, lineHeight:2, paddingLeft: 20, listStyleType: 'disc', color: '#d1d5db'}}>
                            <li>• **IA Boot:** Análisis completo con justificación narrativa.</li>
                            <li>• **Parley Builder:** Generador de combinadas con Valor Esperado (EV).</li>
                            <li>• **Selección Combinada:** Picks avanzados (Córners, BTTS, Over/Under).</li>
                            <li>• **Gestión Pro:** Stake recomendado (Kelly) y registro de tickets.</li>
                            <li>• **Experiencia Pura:** Sin anuncios + soporte prioritario.</li>
                        </ul>
                    </div>
                    
                    {/* COLUMNA 2: PLANES Y CLAVE */}
                    <div style={{ flex: 3, minWidth: '350px' }}>

                        {/* SECCIÓN DE PLANES DE PAGO */}
                        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 15, color: '#a5b4fc' }}>
                            1. Elige tu Plan de Suscripción
                        </h3>
                        
                        <div style={{ display: 'flex', gap: 15, flexWrap: 'wrap', marginBottom: 25 }}>
                            {PLANS.map((plan) => (
                                <div key={plan.id} style={planCardStyle}>
                                    <h4 style={{ color: '#f3f4f6', fontWeight: 800, fontSize: 18 }}>{plan.interval}</h4>
                                    <p style={{ fontSize: 26, fontWeight: 900, margin: '8px 0', color: '#7c3aed' }}>
                                        MXN {plan.price.toFixed(2)}
                                    </p>
                                    <p style={{ fontSize: 12, opacity: 0.8, marginBottom: 10 }}>Precio por {plan.interval.toLowerCase()}</p>
                                    
                                    <button 
                                        onClick={() => handleCheckout(plan)}
                                        disabled={loading}
                                        style={{
                                            ...buttonPrimary, 
                                            padding: '10px 16px', 
                                            fontSize: 14,
                                            opacity: loading ? 0.6 : 1
                                        }}
                                    >
                                        {loading ? "Cargando Pago..." : "Empezar prueba"}
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* SECCIÓN DE CLAVE DE ACCESO MANUAL */}
                        <div style={{ borderTop: '1px solid rgba(255,255,255,.1)', paddingTop: 15 }}>
                            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10, color: '#a5b4fc' }}>
                                2. Ingresar Clave de Acceso
                            </h3>

                            <input
                                type="text"
                                placeholder="Pega aquí tu Clave Premium..."
                                value={inputKey}
                                onChange={(e) => setInputKey(e.target.value)}
                                style={inputStyleLocal}
                            />

                            <div style={{display:"flex", gap:10, marginTop:15, flexWrap:"wrap"}}>
                                <button
                                    style={{
                                        ...buttonPrimary, 
                                        opacity: !inputKey ? 0.6 : 1,
                                    }}
                                    onClick={handleKeySubmit}
                                    disabled={!inputKey}
                                >
                                    {isPremiumActive ? 'Guardar y Verificar' : 'Guardar Clave de Acceso'}
                                </button>
                                
                                {isPremiumActive && (
                                    <button
                                        onClick={() => onKeySubmit('')} // Limpia la clave
                                        style={{...pillLocal, background: 'none', borderColor: '#ef4444', color: '#fecaca', fontWeight: 700}}
                                    >
                                        🗑️ Revocar Clave
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* FOOTER DE CONFIANZA */}
                        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: 'center'}}>
                            <span style={pillLocal}>⚡ 3 días gratis (al pagar)</span>
                            <span style={pillLocal}>🔒 Cancela cuando quieras</span>
                        </div>
                        
                    </div>
                </div>
                
            </div>
        </div>
    );
}

// --- APP PRINCIPAL ---
export default function App() {
  const [leagues, setLeagues] = useState<string[]>([]);
  const [league, setLeague] = useState("");
  const [teams, setTeams] = useState<string[]>([]);
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [odds, setOdds] = useState<Odds>({});
  const [rawOdds, setRawOdds] = useState<RawOdds>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState<PredictResponse | null>(null);
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [expert, setExpert] = useState(false);
  const [iaOpen, setIaOpen] = useState(false);
  const [premiumKey, setPremiumKey] = useState(() => localStorage.getItem('fm_premium_key') || '');
  // Parley + Historial + Stake
  const [parlayOpen, setParlayOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [stakeOpen, setStakeOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

   // NUEVO: Función para manejar el guardado/borrado de la clave
  const handleKeySubmit = (newKey: string) => {
    const trimmedKey = newKey.trim();
    setPremiumKey(trimmedKey);
    if (trimmedKey) {
      localStorage.setItem('fm_premium_key', trimmedKey);
      // Opcional: Forzar una verificación al backend para confirmar la clave
    } else {
      localStorage.removeItem('fm_premium_key');
      alert("Acceso Premium revocado. Se ha restablecido el acceso Freemium.");
    }
  };
  
  // NUEVO: Manejo de redirección de Stripe
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const canceled = urlParams.get('canceled');

    if (success === 'true') {
      alert('¡Pago exitoso! En breve recibirás tu Clave Premium por correo electrónico. Ingresa la clave en el modal Premium para activarlo.');
      window.history.replaceState(null, '', window.location.pathname);
    } else if (canceled === 'true') {
      alert('El pago fue cancelado. Puedes intentarlo de nuevo.');
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []); 

  useEffect(() => {
    fetch(`${API_BASE}/leagues`)
      .then((r) => r.json())
      .then((d: ApiLeagues) => setLeagues(d.leagues ?? []))
      .catch(() => setLeagues([]));
  }, []);

  useEffect(() => {
    setHome("");
    setAway("");
    setData(null);
    setErr("");
    if (!league) return setTeams([]);
    fetch(`${API_BASE}/teams?league=${encodeURIComponent(league)}`)
      .then((r) => r.json())
      .then((d: ApiTeams) => setTeams(d.teams ?? []))
      .catch(() => setErr("No pude cargar equipos."));
  }, [league]);

  const canPredict = league && home && away && home !== away;

  const filteredHome = useMemo(
    () => teams.filter((t) => t.toLowerCase().includes(home.toLowerCase())),
    [teams, home]
  );
  const filteredAway = useMemo(
    () => teams.filter((t) => t.toLowerCase().includes(away.toLowerCase())),
    [teams, away]
  );

  async function onPredict() {
    if (!canPredict) return;
    setLoading(true);
    setErr("");
    setData(null);
    try {
      const body: any = { league, home_team: home, away_team: away }; // no envíes 'expert' al backend
        if (odds["1"] || odds.X || odds["2"] || odds.O2_5 || odds.BTTS_YES) {
          body.odds = odds;
        }
      const res = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const json: PredictResponse = await res.json();
      setData(json);

      try {
  // log al historial (sin stake por ahora)
  await fetch(`${API_BASE}/history/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ts: Math.floor(Date.now()/1000),
      league,
      home,
      away,
      market: json.best_pick.market,
      selection: json.best_pick.selection,
      prob_pct: json.best_pick.prob_pct,
      odd:
        json.best_pick.market === "1X2"
          ? json.best_pick.selection === "1" ? odds["1"] : json.best_pick.selection === "2" ? odds["2"] : odds["X"]
          : json.best_pick.market === "Over 2.5" ? odds.O2_5
          : json.best_pick.market === "BTTS" && json.best_pick.selection === "Sí" ? odds.BTTS_YES
          : undefined,
      stake: null,
    }),
  });
} catch {}


    } catch (e: any) {
      setErr(e?.message || "Error al predecir.");
    } finally {
      setLoading(false);
    }
  }

  // ======== Datos por defecto para el modal de Stake =========
  const stakeDefaults = useMemo(() => {
    if (!data) return null;
    const prob01 = (data.best_pick?.prob_pct ?? 0) / 100;

    // elegir cuota usada según el mercado
    let odd: number | undefined;
    if (data.best_pick.market === "1X2") {
      odd =
        data.best_pick.selection === "1"
          ? odds["1"]
          : data.best_pick.selection === "2"
          ? odds["2"]
          : odds["X"];
    } else if (data.best_pick.market === "Over 2.5") {
      odd = odds.O2_5;
    } else if (data.best_pick.market === "BTTS" && data.best_pick.selection === "Sí") {
      odd = odds.BTTS_YES;
    }

    const humanMarket =
      data.best_pick.market === "1X2"
        ? "Ganador del partido"
        : data.best_pick.market === "Over 2.5"
        ? "Más de 2.5 goles"
        : data.best_pick.market === "BTTS"
        ? "Ambos equipos anotan"
        : data.best_pick.market;

    const humanSelection =
      data.best_pick.market === "1X2"
        ? data.best_pick.selection === "1"
          ? "Gana Local"
          : data.best_pick.selection === "2"
          ? "Gana Visitante"
          : "Empate"
        : data.best_pick.selection;

    const matchLabel = `${data.home_team} vs ${data.away_team}`;

    return { prob01, odd, humanMarket, humanSelection, matchLabel };
  }, [data, odds]);

  return (
    <div style={page}>
      <style>{`
        @media (max-width: 720px) {
          .g3 { display:grid; grid-template-columns: 1fr; gap:12px; }
          .quick-actions { display: none !important; }
        }
        @media (min-width: 721px) {
          .g3 { display:grid; grid-template-columns: 1fr 1fr 1fr; gap:12px; }
        }
        .fixedbar {
          position: fixed; left: 0; right: 0; bottom: 0;
          background: rgba(11,16,32,.9); backdrop-filter: blur(6px);
          border-top: 1px solid rgba(255,255,255,.12);
          padding: 10px 14px; display:flex; gap:10px; align-items:center; justify-content:space-between;
        }
      `}</style>

      <div style={wrap}>
        <Header
          onOpenMenu={() => setNavOpen(true)}
          onOpenHistory={() => setHistOpen(true)}
          onOpenParlay={() => setParlayOpen(true)}
          onOpenBuilder={() => setBuilderOpen(true)}
          onOpenIABoot={() => setIaOpen(true)}
          onOpenPremium={() => setPremiumOpen(true)} 
          
        />
        <div style={{ display:"flex", gap:8, alignItems:"center", marginTop:8 }}>
        <label style={{ fontSize:12, opacity:.8 }}>
          <input type="checkbox" checked={expert} onChange={e=>setExpert(e.target.checked)} />
          &nbsp;Modo experto (ver detalles POISSON/DC)
        </label>
      </div>

        {/* Paso 1: Selección */}
        <div style={{ ...panel }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div style={pill}>1️⃣ Selecciona liga y equipos</div>
            <div style={pill}>2️⃣ (Opcional) Ingresar cuotas</div>
            <div style={pill}>3️⃣ Calcular</div>
          </div>

          <div className="g3" style={{ marginTop: 12 }}>
            <div>
              <div style={label}>Liga</div>
              <select
                value={league}
                onChange={(e) => setLeague(e.target.value)}
                style={input}
              >
                <option value="">— Selecciona liga —</option>
                {leagues.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div style={label}>Equipo local</div>
              <input
                placeholder="Escribe para buscar…"
                value={home}
                onChange={(e) => setHome(e.target.value)}
                list="home_list"
                style={input}
              />
              <datalist id="home_list">
                {filteredHome.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            <div>
              <div style={label}>Equipo visitante</div>
              <input
                placeholder="Escribe para buscar…"
                value={away}
                onChange={(e) => setAway(e.target.value)}
                list="away_list"
                style={input}
              />
              <datalist id="away_list">
                {filteredAway.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
          </div>
        </div>

        {/* Paso 2: Cuotas opcionales */}
        <OddsEditor odds={odds} setOdds={setOdds} rawOdds={rawOdds} setRawOdds={setRawOdds} />

        {/* CTA fijo inferior */}
        <div className="fixedbar">
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            {canPredict ? "Listo para calcular" : "Selecciona liga y ambos equipos"}
          </div>
          <button
            onClick={onPredict}
            disabled={!canPredict || loading}
            style={{
              ...btnPrimary,
              opacity: !canPredict || loading ? 0.6 : 1,
              cursor: !canPredict || loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Calculando…" : "Calcular ahora"}
          </button>
        </div>

        {/* Errores */}
        {err && (
          <div
            style={{
              background: "rgba(239,68,68,.12)",
              border: "1px solid rgba(239,68,68,.35)",
              padding: 12,
              borderRadius: 12,
              marginTop: 12,
              color: "#fecaca",
            }}
          >
            {err}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ marginTop: 12 }}>
            <SkeletonCard />
          </div>
        )}
        <NavDrawer
          open={navOpen}
          onClose={() => setNavOpen(false)}
          onOpenParlay={() => setParlayOpen(true)}
          onOpenBuilder={() => setBuilderOpen(true)}
          onOpenHistory={() => setHistOpen(true)}
        />
        {/* Parley & Historial (sliders) */}
        <ParlayDrawer
          open={parlayOpen}
          onClose={() => setParlayOpen(false)}
          API_BASE={API_BASE}
          isPremium={true /* o tu flag real */}
          premiumKey={premiumKey} 
        />

        <BuilderDrawer
          open={builderOpen}
          onClose={() => setBuilderOpen(false)}
          API_BASE={API_BASE}
          league={league}
          home={home}
          away={away}
          odds={odds}
          premiumKey={premiumKey} 
        />
        <IABootDrawer
          open={iaOpen}
          onClose={() => setIaOpen(false)}
          API_BASE={API_BASE}
          league={league}
          home={home}
          away={away}
          odds={odds}
          premiumKey={premiumKey} 
        />
        <button
          onClick={() => setPremiumOpen(true)}
          title="Premium"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,.12)",
            color: "#d1d5db",
            background: "rgba(255,255,255,.06)",
          }}
        >
          👑 Premium
        </button>

        <BetHistoryDrawer open={histOpen} onClose={() => setHistOpen(false)} />
        <PremiumDrawer open={premiumOpen} onClose={() => setPremiumOpen(false)} 
          onKeySubmit={handleKeySubmit} 
          currentKey={premiumKey}
          API_BASE={API_BASE} 
        />
        {/* <-- AQUÍ el banner PWA */}
        <InstallBanner />

        {/* Resultado (UNA sola tarjeta pro) + barra de acciones */}
        {data && !loading && (
          <>
            {/* Barra de acciones para el pick: Stake */}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <button
                onClick={() => setStakeOpen(true)}
                style={{
                  ...pill,
                  cursor: "pointer",
                  borderColor: "#22c55e",
                  background: "linear-gradient(135deg,#22c55e55,#16a34a55)",
                  fontWeight: 900,
                }}
                title="Calcular stake con Kelly"
              >
                💰 Stake
              </button>

              <button
              onClick={async ()=>{
                const body:any = { league, home_team: home, away_team: away };
                if (odds["1"]||odds.X||odds["2"]||odds.O2_5||odds.BTTS_YES) body.odds = odds;
                await fetch(`${API_BASE}/alerts/value-pick`, {
                  method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body)
                });
                alert("Enviado (si cumple umbrales).");
              }}
              style={{ ...pill, cursor:"pointer" }}
              title="Enviar a Telegram si es value pick"
            >📣 Alerta</button>

            </div>

            <div style={{ marginTop: 12 }}>
              <ErrorBoundary>
                <BestPickPro data={data} odds={odds} />
              </ErrorBoundary>
            </div>
          </>
        )}

        {/* Modal de Stake */}
        {stakeDefaults && (
          <StakeModal
            open={stakeOpen}
            onClose={() => setStakeOpen(false)}
            matchLabel={stakeDefaults.matchLabel}
            market={stakeDefaults.humanMarket}
            selection={stakeDefaults.humanSelection}
            defaultProb01={stakeDefaults.prob01}
            defaultOdd={stakeDefaults.odd}
          />
        )}
      </div>
    </div>
  );
}
