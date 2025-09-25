# backend/app.py
import os
import glob
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from scipy.stats import poisson

# --------------------------------------------------------------------------------------
# Config
# --------------------------------------------------------------------------------------
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
POISSON_MAX_GOALS = 7

# Prior/mezclas (puedes afinarlas)
TAU_HOME = 8.0     # fuerza del prior (en "partidos") para tasas de gol en casa
TAU_AWAY = 8.0     # fuerza del prior (en "partidos") para tasas de gol fuera
PRIOR_STRENGTH_1X2 = 6.0   # tamaño efectivo del prior Dirichlet del mercado
PRIOR_STRENGTH_O25 = 6.0   # tamaño efectivo del prior Beta del mercado
CAP_LAMBDA = (0.05, 4.5)   # límites de seguridad para lambdas

app = FastAPI(title="FootyMines API (Poisson+Bayes)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

# --------------------------------------------------------------------------------------
# Carga/normalización de datos
# --------------------------------------------------------------------------------------
class LeagueStore:
    """Carga una liga y autodetecta columnas con alias. Agrega sumas y conteos para Bayes."""
    ALIASES = {
        "home_team_name": ["home_team_name","HomeTeam","home_team","local_team","home_name","home","team_home_name"],
        "away_team_name": ["away_team_name","AwayTeam","away_team","visitor_team","away_name","away","team_away_name"],
        "home_team_goal_count": ["home_team_goal_count","home_score","home_goals","FTHG","HG","HomeGoals","HomeScore"],
        "away_team_goal_count": ["away_team_goal_count","away_score","away_goals","FTAG","AG","AwayGoals","AwayScore"],
        "home_team_yellow_cards": ["home_team_yellow_cards","home_yellow","home_yellow_cards","HY","YCH","HomeYellows"],
        "away_team_yellow_cards": ["away_team_yellow_cards","away_yellow","away_yellow_cards","AY","YCA","AwayYellows"],
        "home_team_corner_count": ["home_team_corner_count","home_corners","HC","CHH","HomeCorners"],
        "away_team_corner_count": ["away_team_corner_count","away_corners","AC","CHA","AwayCorners"],
    }

    def __init__(self, name: str, df: pd.DataFrame):
        self.name = name
        self.df = df.copy()

        # --- escoger columnas reales por alias ---
        cols: Dict[str, Optional[str]] = {}
        for key, cand in self.ALIASES.items():
            cols[key] = next((c for c in cand if c in self.df.columns), None)

        if not cols["home_team_name"] or not cols["away_team_name"]:
            raise ValueError(f"[{name}] No encontré columnas de nombres de equipo (home/away).")

        self.df["home_team_name"] = self.df[cols["home_team_name"]].astype(str)
        self.df["away_team_name"] = self.df[cols["away_team_name"]].astype(str)

        def numcol(key, default=0.0):
            found = cols[key]
            if found:
                return pd.to_numeric(self.df[found], errors="coerce").fillna(default)
            return pd.Series(default, index=self.df.index, dtype=float)

        self.df["home_team_goal_count"]   = numcol("home_team_goal_count")
        self.df["away_team_goal_count"]   = numcol("away_team_goal_count")
        self.df["home_team_yellow_cards"] = numcol("home_team_yellow_cards")
        self.df["away_team_yellow_cards"] = numcol("away_team_yellow_cards")
        self.df["home_team_corner_count"] = numcol("home_team_corner_count")
        self.df["away_team_corner_count"] = numcol("away_team_corner_count")

        # --- medias de liga (asegúrate de que no son cero) ---
        eps = 1e-6
        self.league_means = {
            "home_goals": float(max(self.df["home_team_goal_count"].mean(), eps)),
            "away_goals": float(max(self.df["away_team_goal_count"].mean(), eps)),
            "goals_per_game": float(max(
                (self.df["home_team_goal_count"] + self.df["away_team_goal_count"]).mean(), eps
            )),
            "corners_per_game": float(max(
                (self.df["home_team_corner_count"] + self.df["away_team_corner_count"]).mean(), eps
            )),
            "yellows_per_game": float(max(
                (self.df["home_team_yellow_cards"] + self.df["away_team_yellow_cards"]).mean(), eps
            )),
        }

        # --- agregados por equipo para Bayes ---
        home = self.df.groupby("home_team_name").agg(
            home_for_sum=("home_team_goal_count","sum"),
            home_for_n=("home_team_goal_count","count"),
            home_against_sum=("away_team_goal_count","sum"),
            home_against_n=("away_team_goal_count","count"),
            home_corners=("home_team_corner_count","mean"),
            home_yellows=("home_team_yellow_cards","mean"),
        )
        away = self.df.groupby("away_team_name").agg(
            away_for_sum=("away_team_goal_count","sum"),
            away_for_n=("away_team_goal_count","count"),
            away_against_sum=("home_team_goal_count","sum"),
            away_against_n=("home_team_goal_count","count"),
            away_corners=("away_team_corner_count","mean"),
            away_yellows=("away_team_yellow_cards","mean"),
        )
        self.team = home.join(away, how="outer").fillna(0.0)

        # listado de equipos
        self.teams = sorted(self.team.index.astype(str).tolist())

        print(f"[OK] {name}: {len(self.df):,} filas, {len(self.teams)} equipos | "
              f"μ_home={self.league_means['home_goals']:.2f}, μ_away={self.league_means['away_goals']:.2f}")

    @staticmethod
    def _post_rate(sum_goals: float, n_games: float, mu_league: float, tau: float) -> float:
        """Media posterior Gamma-Poisson (tasa por partido)."""
        return float((sum_goals + tau * mu_league) / (n_games + tau))

    def get_lambda_pair(self, home: str, away: str) -> Tuple[float, float, int]:
        """Lambdas Bayesianos para un partido home vs away. Devuelve (λh, λa, n_eff)."""
        if home not in self.team.index or away not in self.team.index:
            raise KeyError("Equipo no encontrado en esta liga")

        mu_h = self.league_means["home_goals"]
        mu_a = self.league_means["away_goals"]

        t = self.team

        # Tasas a posteriori (por partido)
        att_home = self._post_rate(t.loc[home, "home_for_sum"],     t.loc[home, "home_for_n"],     mu_h, TAU_HOME)
        def_away = self._post_rate(t.loc[away, "away_against_sum"], t.loc[away, "away_against_n"], mu_h, TAU_HOME)

        att_away = self._post_rate(t.loc[away, "away_for_sum"],     t.loc[away, "away_for_n"],     mu_a, TAU_AWAY)
        def_home = self._post_rate(t.loc[home, "home_against_sum"], t.loc[home, "home_against_n"], mu_a, TAU_AWAY)

        # Combine con escala de liga (multiplicativo con normalización por media de liga)
        lam_home = mu_h * (att_home / mu_h) * (def_away / mu_h)
        lam_away = mu_a * (att_away / mu_a) * (def_home / mu_a)

        # límites de seguridad
        lam_home = float(min(max(lam_home, CAP_LAMBDA[0]), CAP_LAMBDA[1]))
        lam_away = float(min(max(lam_away, CAP_LAMBDA[0]), CAP_LAMBDA[1]))

        # tamaño muestral efectivo para blending con mercado
        n_eff = int(max(1,
                        0.5 * (t.loc[home, "home_for_n"] + t.loc[home, "home_against_n"] +
                               t.loc[away, "away_for_n"] + t.loc[away, "away_against_n"])))
        n_eff = int(min(n_eff, 40))  # cota superior

        return lam_home, lam_away, n_eff

    def get_additional_avgs(self, home: str, away: str) -> Dict[str, float]:
        t = self.team
        home_corners = float(t.loc[home, "home_corners"]) if home in t.index else 0.0
        away_corners = float(t.loc[away, "away_corners"]) if away in t.index else 0.0
        home_y = float(t.loc[home, "home_yellows"]) if home in t.index else 0.0
        away_y = float(t.loc[away, "away_yellows"]) if away in t.index else 0.0
        return {
            "total_corners_avg": max(home_corners + away_corners, 0.0),
            "total_yellow_cards_avg": max(home_y + away_y, 0.0),
        }

LEAGUES: Dict[str, LeagueStore] = {}

def load_all_leagues():
    LEAGUES.clear()
    pattern = os.path.join(DATA_DIR, "*.csv")
    for path in sorted(glob.glob(pattern)):
        name = os.path.splitext(os.path.basename(path))[0]
        try:
            df = pd.read_csv(path, encoding="utf-8", low_memory=False)
        except Exception:
            df = pd.read_csv(path, encoding="latin-1", low_memory=False)
        try:
            LEAGUES[name] = LeagueStore(name, df)
        except Exception as e:
            print(f"[SKIP] {name}: {e}")

load_all_leagues()

# --------------------------------------------------------------------------------------
# Modelos I/O
# --------------------------------------------------------------------------------------
class PredictIn(BaseModel):
    league: str
    home_team: str
    away_team: str
    odds: Optional[Dict[str, float]] = None  # {"1":2.1,"X":3.2,"2":3.5,"O2_5":1.9}

class ScorelineProb(BaseModel):
    score: str
    pct: float

class BestPick(BaseModel):
    market: str
    selection: str
    prob_pct: float
    confidence: float
    reasons: List[str]

class PredictOut(BaseModel):
    league: str
    home_team: str
    away_team: str
    probs: Dict[str, float]
    poisson: Dict[str, object]
    averages: Dict[str, float]
    best_pick: BestPick
    summary: str

# --------------------------------------------------------------------------------------
# Utilidades prob/mercado
# --------------------------------------------------------------------------------------
def poisson_matrix(lh: float, la: float, kmax: int = POISSON_MAX_GOALS) -> np.ndarray:
    i = np.arange(0, kmax + 1)
    j = np.arange(0, kmax + 1)
    ph = poisson.pmf(i, lh).reshape(-1, 1)
    pa = poisson.pmf(j, la).reshape(1, -1)
    M = ph @ pa
    return M / M.sum()

def probs_from_matrix(M: np.ndarray) -> Dict[str, float]:
    kmax = M.shape[0] - 1
    home = float(np.tril(M, -1).sum())
    draw = float(np.trace(M))
    away = float(np.triu(M, 1).sum())
    over25 = float(sum(M[i, j] for i in range(kmax + 1) for j in range(kmax + 1) if (i + j) >= 3))
    btts = float(sum(M[i, j] for i in range(1, kmax + 1) for j in range(1, kmax + 1)))
    # top marcadores
    pairs = [((i, j), float(M[i, j])) for i in range(kmax + 1) for j in range(kmax + 1)]
    pairs.sort(key=lambda x: x[1], reverse=True)
    top = [{"score": f"{a}-{b}", "pct": round(p * 100, 2)} for (a, b), p in pairs[:5]]
    return {
        "home_win_pct": round(home * 100, 2),
        "draw_pct": round(draw * 100, 2),
        "away_win_pct": round(away * 100, 2),
        "over_2_5_pct": round(over25 * 100, 2),
        "btts_pct": round(btts * 100, 2),
        "top_scorelines": top,
    }

def implied_1x2(odds: Dict[str, float]) -> Optional[Dict[str, float]]:
    try:
        o1, ox, o2 = float(odds["1"]), float(odds["X"]), float(odds["2"])
    except Exception:
        return None
    inv = np.array([1.0 / o1, 1.0 / ox, 1.0 / o2], dtype=float)
    s = inv.sum()
    if s <= 0:
        return None
    return {"1": inv[0] / s, "X": inv[1] / s, "2": inv[2] / s}

def implied_single(odd: Optional[float]) -> Optional[float]:
    if not odd or odd <= 1e-9:
        return None
    return float(1.0 / odd)

def dirichlet_blend(model_vec, market_vec, prior_strength: float, n_model: float):
    """Posterior de Dirichlet: α_post = α0 + n*model; luego normaliza."""
    if market_vec is None:
        return np.asarray(model_vec, dtype=float)
    alpha0 = prior_strength * np.asarray(market_vec, dtype=float)
    post = alpha0 + n_model * np.asarray(model_vec, dtype=float)
    post = post / post.sum()
    return post

def beta_blend(model_p: float, market_p: Optional[float], prior_strength: float, n_model: float) -> float:
    """Posterior Beta-Binomial: a0=prior_strength*p_mkt, b0=prior_strength*(1-p_mkt)."""
    if market_p is None:
        return float(model_p)
    a0 = prior_strength * market_p
    b0 = prior_strength * (1 - market_p)
    a_post = a0 + n_model * model_p
    b_post = b0 + n_model * (1 - model_p)
    return float(a_post / (a_post + b_post))

def confidence_from_prob(p: float, nscale: float = 1.0) -> float:
    conf = max(0.0, min(1.0, abs(p - 0.5) * 2.0 * nscale))
    return round(conf * 100.0, 2)

# --------------------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------------------
@app.get("/healthz")
def healthz():
    return {"ok": True, "leagues": len(LEAGUES)}

@app.get("/leagues")
def get_leagues():
    return {"leagues": sorted(LEAGUES.keys())}

@app.get("/teams")
def get_teams(league: str):
    if league not in LEAGUES:
        return {"teams": []}
    return {"teams": LEAGUES[league].teams}

@app.post("/predict", response_model=PredictOut)
def predict(inp: PredictIn):
    if inp.league not in LEAGUES:
        raise HTTPException(status_code=400, detail="Liga no encontrada")
    store = LEAGUES[inp.league]

    home = inp.home_team
    away = inp.away_team
    if home == away:
        raise HTTPException(status_code=400, detail="Equipos deben ser distintos")

    try:
        lam_h, lam_a, n_eff = store.get_lambda_pair(home, away)
    except KeyError:
        raise HTTPException(status_code=400, detail="Equipo no encontrado en esta liga")

    # Poisson
    M = poisson_matrix(lam_h, lam_a, kmax=POISSON_MAX_GOALS)
    base = probs_from_matrix(M)

    # Vector modelo 1X2 (0..1)
    model_vec = np.array([
        base["home_win_pct"]/100.0,
        base["draw_pct"]/100.0,
        base["away_win_pct"]/100.0
    ], dtype=float)

    # Mezcla Bayes con mercado si hay cuotas 1X2
    market_1x2 = implied_1x2(inp.odds or {})
    if market_1x2:
        m_vec = np.array([market_1x2["1"], market_1x2["X"], market_1x2["2"]], dtype=float)
        post_vec = dirichlet_blend(model_vec, m_vec, PRIOR_STRENGTH_1X2, n_eff)
    else:
        post_vec = model_vec

    # Over 2.5 mezcla Beta
    market_o25 = implied_single((inp.odds or {}).get("O2_5"))
    model_o25 = base["over_2_5_pct"]/100.0
    post_o25 = beta_blend(model_o25, market_o25, PRIOR_STRENGTH_O25, n_eff)

    pbtts = base["btts_pct"]/100.0

    probs_out = {
        "home_win_pct": round(float(post_vec[0]) * 100, 2),
        "draw_pct":      round(float(post_vec[1]) * 100, 2),
        "away_win_pct":  round(float(post_vec[2]) * 100, 2),
        "over_2_5_pct":  round(post_o25 * 100, 2),
        "btts_pct":      round(pbtts * 100, 2),
        "o25_mlp_pct":   round(post_o25 * 100, 2),  # nunca None
    }

    extras = store.get_additional_avgs(home, away)
    poisson_info = {
        "home_lambda": round(lam_h, 3),
        "away_lambda": round(lam_a, 3),
        "top_scorelines": base["top_scorelines"],
    }

    # Best pick por prob + EV si hay cuotas
    reasons = [
        f"λ local {lam_h:.2f} vs λ visitante {lam_a:.2f} (Bayes).",
        f"Media de goles liga: {store.league_means['goals_per_game']:.2f}.",
        f"Corners medios estimados: {extras['total_corners_avg']:.2f}.",
    ]

    p1, px, p2 = float(post_vec[0]), float(post_vec[1]), float(post_vec[2])
    best_market, best_sel, best_prob = "1X2", "1", p1
    best_conf = confidence_from_prob(best_prob)

    if p2 > best_prob: best_market, best_sel, best_prob, best_conf = "1X2", "2", p2, confidence_from_prob(p2)
    if px > best_prob: best_market, best_sel, best_prob, best_conf = "1X2", "X", px, confidence_from_prob(px)
    if post_o25 > best_prob:
        best_market, best_sel, best_prob, best_conf = "Over 2.5", "Sí", post_o25, confidence_from_prob(post_o25)

    # Si hay cuotas, calcula EV y prioriza EV>0
    if inp.odds:
        cands = []
        for key, p in [("1", p1), ("X", px), ("2", p2)]:
            odd = float(inp.odds.get(key, 0) or 0)
            if odd > 1.0:
                ev = p * odd - 1.0
                edge = p - (market_1x2[key] if market_1x2 else 0.0)
                cands.append(("1X2", key, p, ev, edge, odd))
        odd_o25 = float((inp.odds or {}).get("O2_5") or 0)
        if odd_o25 > 1.0:
            ev = post_o25 * odd_o25 - 1.0
            edge = post_o25 - (market_o25 if market_o25 is not None else 0.0)
            cands.append(("Over 2.5","Sí", post_o25, ev, edge, odd_o25))

        if cands:
            cands.sort(key=lambda x: (x[3], x[2]), reverse=True)
            if cands[0][3] > 0:
                best_market, best_sel, best_prob, best_ev, best_edge, best_odd = cands[0]
                best_conf = confidence_from_prob(best_prob)
                reasons.append(f"EV {best_ev:+.2f} con cuota {best_odd:.2f} (edge {best_edge:+.2%} vs mercado).")

    summary = (f"Partido: {home} vs {away}. Mejor jugada: {best_market} – {best_sel} "
               f"(prob {best_prob*100:.2f}%, confianza {best_conf:.0f}/100).")

    best = BestPick(
        market=best_market,
        selection=best_sel,
        prob_pct=round(best_prob * 100, 2),
        confidence=best_conf,
        reasons=reasons,
    )

    out = PredictOut(
        league=inp.league,
        home_team=home,
        away_team=away,
        probs=probs_out,
        poisson=poisson_info,
        averages={
            "total_yellow_cards_avg": round(extras["total_yellow_cards_avg"], 2),
            "total_corners_avg": round(extras["total_corners_avg"], 2),
            "corners_mlp_pred": round(extras["total_corners_avg"], 2),
        },
        best_pick=best,
        summary=summary,
    )
    return out
