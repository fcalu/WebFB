import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Header from "./components/Header";
import { TeamSelect } from "./components/TeamSelect";
import ResultCard from "./components/ResultCard";
import Heatmap from "./components/Heatmap";
import HistoryDrawer from "./components/HistoryDrawer";
import BestPickCard from "./components/BestPickCard";

type PoissonPayload = {
  home_lambda: number;
  away_lambda: number;
  rows: string[];
  cols: string[];
  matrix: number[][];
  top_scorelines: { score: string; pct: number }[];
};

type Probs = {
  home_win_pct: number;
  draw_pct: number;
  away_win_pct: number;
  over_2_5_pct: number;
  btts_pct: number;
  o25_mlp_pct: number;
};

type Averages = {
  total_yellow_cards_avg: number;
  total_corners_avg: number;
  corners_mlp_pred: number;
};

type BestPick = {
  market: string;
  selection: string;
  prob_pct: number;
  confidence: number;
  reasons: string[];
  summary: string;
};

type ApiReply = {
  league: string;
  home_team: string;
  away_team: string;
  probs: Probs;
  poisson: PoissonPayload;
  averages: Averages;
  best_pick?: BestPick;
  summary?: string;
};

type HistItem = {
  id: string;
  league: string;
  home: string;
  away: string;
  payload: ApiReply;
  date: string;
};

//const API = (import.meta.env.VITE_API_BASE_URL as string) ?? "http://localhost:8000";
//const API = import.meta.env.VITE_API_BASE_URL ?? "/api";
const API = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");

const HISTORY_KEY = "fm_history_v2";

export default function App() {
  const [leagues, setLeagues] = useState<string[]>([]);
  const [league, setLeague] = useState<string>("");
  const [teams, setTeams] = useState<string[]>([]);
  const [home, setHome] = useState<string>("");
  const [away, setAway] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const [payload, setPayload] = useState<ApiReply | null>(null);

  const [histOpen, setHistOpen] = useState(false);
  const [history, setHistory] = useState<HistItem[]>(() => {
    try { const raw = localStorage.getItem(HISTORY_KEY); return raw ? JSON.parse(raw) as HistItem[] : []; }
    catch { return []; }
  });

  const saveHistory = (it: HistItem[]) => {
    setHistory(it);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(it)); } catch {}
  };

  const resetTeams = () => { setTeams([]); setHome(""); setAway(""); };

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/leagues`);
        const j = await r.json();
        setLeagues(j.leagues || []);
      } catch (e) { console.error(e); }
    })();
  }, []);

  useEffect(() => {
    if (!league) { resetTeams(); return; }
    (async () => {
      try {
        const r = await fetch(`${API}/teams?league=${encodeURIComponent(league)}`);
        if (!r.ok) throw new Error(await r.text());
        const j = await r.json();
        setTeams(j.teams || []);
        setHome(""); setAway("");
      } catch (e: any) {
        setError(`No se pudieron cargar equipos: ${e?.message ?? e}`);
        resetTeams();
      }
    })();
  }, [league]);

  const doPredict = async () => {
    setError(""); setLoading(true); setPayload(null);
    try {
      const body = JSON.stringify({ league, home_team: home, away_team: away });
      const r = await fetch(`${API}/predict`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
      if (!r.ok) throw new Error(await r.text());
      const j: ApiReply = await r.json();
      setPayload(j);
      const item: HistItem = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
        league, home, away, payload: j, date: new Date().toISOString(),
      };
      const next = [item, ...history].slice(0, 50);
      saveHistory(next);
    } catch (e: any) {
      setError(e?.message ?? "Error de predicción");
    } finally { setLoading(false); }
  };

  const isReady = league && home && away && home !== away;

  return (
    <div className="min-h-screen bg-bg text-text">
      <Header onOpenHistory={() => setHistOpen(true)} />

      <main className="max-w-6xl mx-auto px-6 pb-16">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="card p-6 mb-6">
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-dim mb-2">Liga</label>
              <select value={league} onChange={(e) => setLeague(e.target.value)} className="w-full bg-bg border border-line rounded-2xl px-3 py-2">
                <option value="">— Selecciona liga —</option>
                {leagues.map((l) => (<option key={l} value={l}>{l}</option>))}
              </select>
            </div>
            <TeamSelect label="Equipo local" teams={teams} value={home} onChange={setHome} name="home" />
            <TeamSelect label="Equipo visitante" teams={teams} value={away} onChange={setAway} name="away" />
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button onClick={doPredict} disabled={!isReady || loading} className="rounded-2xl px-5 py-2.5 bg-primary text-white font-semibold disabled:opacity-50">
              {loading ? "Calculando…" : "Predecir"}
            </button>
            {!isReady && (<span className="text-sm text-dim">Selecciona liga y ambos equipos (distintos).</span>)}
            {error && <span className="text-sm text-red-400">{error}</span>}
          </div>
        </motion.div>

        <AnimatePresence>
          {loading && (
            <motion.div key="skeleton" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="card p-6">
              <div className="animate-pulse space-y-4">
                <div className="h-6 bg-line rounded w-1/3" />
                <div className="h-4 bg-line rounded w-2/3" />
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="h-40 bg-line rounded-2xl" />
                  <div className="h-40 bg-line rounded-2xl" />
                  <div className="h-40 bg-line rounded-2xl" />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {payload && (
          <div className="space-y-6">
            {payload.best_pick && <BestPickCard data={payload.best_pick} />}

            <ResultCard
              home={payload.home_team}
              away={payload.away_team}
              probs={payload.probs}
              averages={payload.averages}
              topScores={payload.poisson?.top_scorelines || []}
            />

            {payload.poisson && (
              <Heatmap
                rows={payload.poisson.rows}
                cols={payload.poisson.cols}
                matrix={payload.poisson.matrix}
                title="Matriz de probabilidad (Poisson) 0–5"
              />
            )}
          </div>
        )}
      </main>

      <HistoryDrawer open={histOpen} onClose={() => setHistOpen(false)} items={history} />
    </div>
  );
}
