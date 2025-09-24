/// <reference types="vite/client" />
import React, { useEffect, useState } from "react";
import {
  warmup,
  getLeagues,
  getTeams,
  predict,
  friendlyError,
  type Engine,
  type PredictResponse,
} from "./lib/api";

type Status = "idle" | "loading" | "ready" | "error";

export default function App() {
  const [engine, setEngine] = useState<Engine>("poisson");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  const [leagues, setLeagues] = useState<string[]>([]);
  const [league, setLeague] = useState("");
  const [teams, setTeams] = useState<string[]>([]);
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");

  const [result, setResult] = useState<PredictResponse | null>(null);

  // Calienta el backend y luego carga ligas
  useEffect(() => {
    (async () => {
      try {
        setStatus("loading");
        await warmup();
        const { leagues } = await getLeagues();
        setLeagues(leagues);
        if (leagues.length) setLeague(leagues[0]);
        setStatus("idle");
      } catch (e) {
        setError(friendlyError(e));
        setStatus("error");
      }
    })();
  }, []);

  // Cargar equipos al cambiar liga
  useEffect(() => {
    if (!league) return;
    (async () => {
      try {
        setStatus("loading");
        const { teams } = await getTeams(league);
        setTeams(teams);
        setHome("");
        setAway("");
        setStatus("idle");
      } catch (e) {
        setError(friendlyError(e));
        setStatus("error");
      }
    })();
  }, [league]);

  async function onPredict() {
    if (!league || !home || !away) return;
    setStatus("loading");
    setError("");
    setResult(null);
    try {
      const data = await predict({ league, home_team: home, away_team: away, engine });
      setResult(data);
      setStatus("ready");
    } catch (e) {
      setError(friendlyError(e));
      setStatus("error");
    }
  }

  const disabled = !league || !home || !away || status === "loading";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-4xl p-4">
        {/* Header simple */}
        <header className="mb-5">
          <h1 className="text-2xl font-extrabold">Footy Predictions</h1>
          <p className="text-sm opacity-80">
            Probabilidades reales con Poisson y Dixon-Coles (ponderación por recencia).
          </p>
        </header>

        {/* Controles */}
        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <select
              className="w-full rounded border border-zinc-700 bg-zinc-900 p-2"
              value={league}
              onChange={(e) => setLeague(e.target.value)}
            >
              <option value="" disabled>
                Selecciona liga
              </option>
              {leagues.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>

            <select
              className="w-full rounded border border-zinc-700 bg-zinc-900 p-2"
              value={home}
              onChange={(e) => setHome(e.target.value)}
            >
              <option value="" disabled>
                Equipo local
              </option>
              {teams.map((t) => (
                <option key={"H-" + t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <select
              className="w-full rounded border border-zinc-700 bg-zinc-900 p-2"
              value={away}
              onChange={(e) => setAway(e.target.value)}
            >
              <option value="" disabled>
                Equipo visitante
              </option>
              {teams.map((t) => (
                <option key={"A-" + t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Motor */}
          <div className="mt-3 flex items-center gap-3 text-sm">
            <label className="opacity-80">Motor:</label>
            <select
              className="rounded border border-zinc-700 bg-zinc-900 p-1.5"
              value={engine}
              onChange={(e) => setEngine(e.target.value as Engine)}
            >
              <option value="poisson">Poisson</option>
              <option value="dc">Dixon-Coles</option>
            </select>

            <button
              onClick={onPredict}
              disabled={disabled}
              className="ml-auto rounded bg-indigo-600 px-4 py-2 font-medium hover:bg-indigo-500 disabled:opacity-50"
            >
              {status === "loading" ? "Calculando…" : "Predecir"}
            </button>
          </div>

          {error && (
            <div className="mt-3 rounded border border-red-500/40 bg-red-500/10 p-3 text-sm">
              {error}
            </div>
          )}
        </section>

        {/* Resultado */}
        {result && status === "ready" && (
          <section className="mt-5 grid gap-4">
            <article className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase opacity-70 mb-1">Mejor jugada</div>
              <div className="text-base font-semibold">
                {result.best_pick.market} — {result.best_pick.selection}
              </div>
              <div className="text-sm opacity-90">
                Prob: <b>{result.best_pick.prob_pct}%</b> · Confianza:{" "}
                <b>{Math.round(result.best_pick.confidence)}%</b>
              </div>
              <ul className="mt-3 list-disc pl-5 text-sm opacity-95 space-y-1">
                {result.best_pick.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
              <div className="mt-3 text-sm">{result.summary}</div>
            </article>

            <article className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase opacity-70 mb-2">Mercados</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                <div>1: {result.probs.home_win_pct}%</div>
                <div>X: {result.probs.draw_pct}%</div>
                <div>2: {result.probs.away_win_pct}%</div>
                <div>O2.5: {result.probs.over_2_5_pct}%</div>
                <div>AA: {result.probs.btts_pct}%</div>
                <div>O2.5 (MLP): {result.probs.o25_mlp_pct}%</div>
              </div>
              <div className="mt-3 text-sm opacity-80">
                λ Local: <b>{result.poisson.home_lambda}</b> · λ Visitante:{" "}
                <b>{result.poisson.away_lambda}</b>
              </div>
              <div className="mt-1 text-sm opacity-90">
                Top marcadores:{" "}
                {result.poisson.top_scorelines
                  .slice(0, 5)
                  .map((s) => `${s.score} (${s.pct}%)`)
                  .join(", ")}
              </div>
            </article>
          </section>
        )}
      </div>
    </div>
  );
}
