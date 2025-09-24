/// <reference types="vite/client" />
// src/App.tsx
import React, { useEffect, useState } from "react";
import EngineSelector from "./components/EngineSelector";
import {
  getLeagues,
  getTeams,
  predict,
  friendlyError,
  type Engine,
  type PredictResponse,
} from "./lib/api";

type Status = "idle" | "loading" | "ready" | "error";

export default function App() {
  const [engine, setEngine] = useState<Engine>("poisson"); // cambia a "dc" si prefieres por defecto
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>("");

  const [leagues, setLeagues] = useState<string[]>([]);
  const [league, setLeague] = useState<string>("");

  const [teams, setTeams] = useState<string[]>([]);
  const [home, setHome] = useState<string>("");
  const [away, setAway] = useState<string>("");

  const [result, setResult] = useState<PredictResponse | null>(null);

  // Carga de ligas al montar
  useEffect(() => {
    (async () => {
      try {
        setStatus("loading");
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

  // Carga de equipos cuando cambia la liga
  useEffect(() => {
    if (!league) return;
    (async () => {
      try {
        setError("");
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
      const data = await predict({
        league,
        home_team: home,
        away_team: away,
        engine, // clave: envía Poisson o Dixon-Coles al backend
      });
      setResult(data);
      setStatus("ready");
    } catch (e) {
      setError(friendlyError(e));
      setStatus("error");
    }
  }

  const disabled = !league || !home || !away || status === "loading";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl p-4">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Footy Predictions</h1>
            <p className="text-sm opacity-70">
              Probabilidades reales con Poisson y Dixon-Coles (ponderación por recencia).
            </p>
          </div>
          <EngineSelector value={engine} onChange={setEngine} />
        </header>

        {/* Controles */}
        <section className="rounded-xl border border-white/10 bg-white/5 p-4 mb-4">
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
                <option key={`H-${t}`} value={t}>
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
                <option key={`A-${t}`} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={onPredict}
              disabled={disabled}
              className="rounded bg-indigo-600 px-4 py-2 font-medium hover:bg-indigo-500 disabled:opacity-50"
            >
              {status === "loading" ? "Calculando..." : "Predecir"}
            </button>
            <div className="text-sm opacity-70">
              Motor: <span className="font-semibold">{engine === "dc" ? "Dixon-Coles" : "Poisson"}</span>
            </div>
          </div>

          {error && (
            <div className="mt-3 rounded border border-red-500/40 bg-red-500/10 p-3 text-sm">
              {error}
            </div>
          )}
        </section>

        {/* Resultado */}
        {result && (
          <section className="grid gap-4">
            {/* Mejor jugada */}
            <article className="rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-600/20 to-purple-600/20 p-4">
              <div className="text-xs uppercase opacity-70 mb-1">Mejor jugada</div>
              <div className="text-lg font-semibold">
                {result.best_pick.market} — {result.best_pick.selection}
              </div>
              <div className="text-sm opacity-90">
                Prob: <span className="font-medium">{result.best_pick.prob_pct}%</span> ·
                Confianza: <span className="font-medium">{Math.round(result.best_pick.confidence)}%</span>
              </div>
              <ul className="mt-3 list-disc pl-5 text-sm opacity-95 space-y-1">
                {result.best_pick.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
              <div className="mt-3 text-sm">{result.summary}</div>
            </article>

            {/* 1X2 / O2.5 / AA */}
            <article className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase opacity-70 mb-2">Mercados</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                <div>
                  <span className="opacity-80">1:</span> {result.probs.home_win_pct}%
                </div>
                <div>
                  <span className="opacity-80">X:</span> {result.probs.draw_pct}%
                </div>
                <div>
                  <span className="opacity-80">2:</span> {result.probs.away_win_pct}%
                </div>
                <div>
                  <span className="opacity-80">O2.5:</span> {result.probs.over_2_5_pct}%
                </div>
                <div>
                  <span className="opacity-80">AA:</span> {result.probs.btts_pct}%
                </div>
                <div>
                  <span className="opacity-80">O2.5 (MLP):</span> {result.probs.o25_mlp_pct}%
                </div>
              </div>
            </article>

            {/* Lambdas y top marcadores */}
            <article className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase opacity-70 mb-2">Lambdas y marcadores</div>
              <div className="text-sm">
                λ Local: <span className="font-medium">{result.poisson.home_lambda}</span> · λ Visitante:{" "}
                <span className="font-medium">{result.poisson.away_lambda}</span>
              </div>
              <div className="mt-2 text-sm opacity-90">
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


