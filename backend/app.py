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
# Configuración básica
# --------------------------------------------------------------------------------------
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
POISSON_MAX_GOALS = 7  # tope de la matriz de Poisson (0..7)

app = FastAPI(title="FootyMines API (no-train)")

# CORS abierto (ajústalo si quieres)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------------------------------------------------------------
# Carga de CSVs y cacheo de estadísticas por liga/equipo
# --------------------------------------------------------------------------------------
class LeagueStore:
    def __init__(self, name: str, df: pd.DataFrame):
        self.name = name
        self.df = df

        # Normaliza columnas que usamos
        # Nombres esperados (si falta, se crea con 0)
        self.cols = {
            "home_team_name": "home_team_name",
            "away_team_name": "away_team_name",
            "home_team_goal_count": "home_team_goal_count",
            "away_team_goal_count": "away_team_goal_count",
            "home_team_yellow_cards": "home_team_yellow_cards",
            "away_team_yellow_cards": "away_team_yellow_cards",
            "home_team_corner_count": "home_team_corner_count",
            "away_team_corner_count": "away_team_corner_count",
        }
        for c in list(self.cols.values()):
            if c not in self.df.columns:
                self.df[c] = 0

        # Asegura tipos numéricos donde aplica
        num_cols = [
            "home_team_goal_count",
            "away_team_goal_count",
            "home_team_yellow_cards",
            "away_team_yellow_cards",
            "home_team_corner_count",
            "away_team_corner_count",
        ]
        for c in num_cols:
            self.df[c] = pd.to_numeric(self.df[c], errors="coerce").fillna(0)

        # Medias de liga (para baseline y escalado)
        self.league_means = {
            "home_goals": float(self.df["home_team_goal_count"].mean() or 0.0),
            "away_goals": float(self.df["away_team_goal_count"].mean() or 0.0),
            "goals_per_game": float(
                (self.df["home_team_goal_count"] + self.df["away_team_goal_count"]).mean()
                or 0.0
            ),
            "corners_per_game": float(
                (self.df["home_team_corner_count"] + self.df["away_team_corner_count"]).mean()
                or 0.0
            ),
            "yellows_per_game": float(
                (self.df["home_team_yellow_cards"] + self.df["away_team_yellow_cards"]).mean()
                or 0.0
            ),
        }

        # Estadísticos por equipo (medias home/away a favor y en contra)
        # Home
        home_group = self.df.groupby("home_team_name").agg(
            home_goals_for=("home_team_goal_count", "mean"),
            home_goals_against=("away_team_goal_count", "mean"),
            home_corners=("home_team_corner_count", "mean"),
            home_yellows=("home_team_yellow_cards", "mean"),
        )

        # Away
        away_group = self.df.groupby("away_team_name").agg(
            away_goals_for=("away_team_goal_count", "mean"),
            away_goals_against=("home_team_goal_count", "mean"),
            away_corners=("away_team_corner_count", "mean"),
            away_yellows=("away_team_yellow_cards", "mean"),
        )

        # Unión
        self.team_stats = home_group.join(away_group, how="outer").fillna(0)

        # Lista de equipos
        self.teams = sorted(self.team_stats.index.astype(str).tolist())

    def get_lambda_pair(self, home: str, away: str) -> Tuple[float, float]:
        """Calcula lambdas home/away con un modelo aditivo simple ajustado al promedio de liga."""
        if home not in self.team_stats.index or away not in self.team_stats.index:
            raise KeyError("Equipo no encontrado en esta liga")

        ts = self.team_stats
        means = self.league_means
        # Baselines de liga
        Lh = max(means["home_goals"], 0.1)
        La = max(means["away_goals"], 0.1)

        # Intensidad ataque/defensa relativa
        # Relación a promedio de liga: >1 fuerte / <1 débil
        home_att = (ts.loc[home, "home_goals_for"] or Lh) / Lh
        away_def = (ts.loc[away, "away_goals_against"] or Lh) / Lh

        away_att = (ts.loc[away, "away_goals_for"] or La) / La
        home_def = (ts.loc[home, "home_goals_against"] or La) / La

        # Lambdas finales con mezcla y límites
        lam_home = Lh * (0.55 * home_att + 0.45 * away_def)
        lam_away = La * (0.55 * away_att + 0.45 * home_def)

        lam_home = float(max(lam_home, 0.05))
        lam_away = float(max(lam_away, 0.05))
        return lam_home, lam_away

    def get_additional_avgs(self, home: str, away: str) -> Dict[str, float]:
        ts = self.team_stats
        # corners/yellows promedios totales aproximados
        home_corners = float(ts.loc[home, "home_corners"]) if home in ts.index else 0.0
        away_corners = float(ts.loc[away, "away_corners"]) if away in ts.index else 0.0
        home_y = float(ts.loc[home, "home_yellows"]) if home in ts.index else 0.0
        away_y = float(ts.loc[away, "away_yellows"]) if away in ts.index else 0.0

        return {
            "total_corners_avg": max(home_corners + away_corners, 0.0),
            "total_yellow_cards_avg": max(home_y + away_y, 0.0),
        }


LEAGUES: Dict[str, LeagueStore] = {}  # nombre -> store


def load_all_leagues():
    LEAGUES.clear()
    pattern = os.path.join(DATA_DIR, "*.csv")
    for path in sorted(glob.glob(pattern)):
        name = os.path.splitext(os.path.basename(path))[0]
        try:
            df = pd.read_csv(path, encoding="utf-8", low_memory=False)
        except Exception:
            # Intento alternativo
            df = pd.read_csv(path, encoding="latin-1", low_memory=False)
        LEAGUES[name] = LeagueStore(name, df)


load_all_leagues()

# --------------------------------------------------------------------------------------
# Modelos de entrada/salida
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
# Utilidades de probabilidad/mercado
# --------------------------------------------------------------------------------------
def poisson_matrix(lh: float, la: float, kmax: int = POISSON_MAX_GOALS) -> np.ndarray:
    """Matriz (kmax+1 x kmax+1) de probabilidades de marcador i-j."""
    i = np.arange(0, kmax + 1)
    j = np.arange(0, kmax + 1)
    ph = poisson.pmf(i, lh).reshape(-1, 1)
    pa = poisson.pmf(j, la).reshape(1, -1)
    M = ph @ pa
    # normaliza (seguridad numérica)
    M = M / M.sum()
    return M


def probs_from_matrix(M: np.ndarray) -> Dict[str, float]:
    kmax = M.shape[0] - 1
    # 1X2
    home = float(np.tril(M, -1).sum())  # i>j
    draw = float(np.trace(M))
    away = float(np.triu(M, 1).sum())   # i<j
    # Over 2.5
    over25 = float(
        sum(M[i, j] for i in range(kmax + 1) for j in range(kmax + 1) if (i + j) >= 3)
    )
    # BTTS
    btts = float(
        sum(M[i, j] for i in range(1, kmax + 1) for j in range(1, kmax + 1))
    )
    # Top marcadores
    pairs = []
    for i in range(kmax + 1):
        for j in range(kmax + 1):
            pairs.append(((i, j), float(M[i, j])))
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
    probs = inv / s
    return {"1": probs[0], "X": probs[1], "2": probs[2]}


def implied_single(odd: Optional[float]) -> Optional[float]:
    if not odd or odd <= 1e-9:
        return None
    return 1.0 / odd  # sin normalizar (mercado unitario)


def blend(model_p: float, market_p: Optional[float], w: float = 0.35) -> float:
    """Mezcla simple: (1-w)*modelo + w*mercado si hay mercado."""
    if market_p is None:
        return model_p
    return float((1 - w) * model_p + w * market_p)


def confidence_from_prob(p: float, nscale: float = 1.0) -> float:
    """Confianza 0..100 basada en distancia a 0.5; nscale ~ tamaño de muestra relativo."""
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
        lam_h, lam_a = store.get_lambda_pair(home, away)
    except KeyError:
        raise HTTPException(status_code=400, detail="Equipo no encontrado en esta liga")

    # Poisson
    M = poisson_matrix(lam_h, lam_a, kmax=POISSON_MAX_GOALS)
    base = probs_from_matrix(M)

    # Mezcla con mercado si hay cuotas
    market_1x2 = implied_1x2(inp.odds or {})
    market_o25 = implied_single((inp.odds or {}).get("O2_5"))

    # modelo en 0..1
    p1 = base["home_win_pct"] / 100.0
    px = base["draw_pct"] / 100.0
    p2 = base["away_win_pct"] / 100.0
    po25 = base["over_2_5_pct"] / 100.0
    pbtts = base["btts_pct"] / 100.0

    p1b = blend(p1, market_1x2["1"] if market_1x2 else None)
    pxb = blend(px, market_1x2["X"] if market_1x2 else None)
    p2b = blend(p2, market_1x2["2"] if market_1x2 else None)
    po25b = blend(po25, market_o25)

    probs_out = {
        "home_win_pct": round(p1b * 100, 2),
        "draw_pct": round(pxb * 100, 2),
        "away_win_pct": round(p2b * 100, 2),
        "over_2_5_pct": round(po25b * 100, 2),
        "btts_pct": round(pbtts * 100, 2),  # BTTS no se mezcla (pocas casas lo dan junto)
        "o25_mlp_pct": None,  # placeholder para compatibilidad front
    }

    # Estadísticos extra
    extras = store.get_additional_avgs(home, away)
    poisson_info = {
        "home_lambda": round(lam_h, 3),
        "away_lambda": round(lam_a, 3),
        "top_scorelines": base["top_scorelines"],
    }

    # Selección del "best pick"
    reasons = [
        f"λ local {lam_h:.2f} vs λ visitante {lam_a:.2f}.",
        f"Media de goles liga: {store.league_means['goals_per_game']:.2f}.",
        f"Corners medios estimados: {extras['total_corners_avg']:.2f}.",
    ]

    # Si hay cuotas, usa EV; sino, mayor probabilidad.
    best_market = "1X2"
    best_sel = "1"  # default
    best_prob = p1b
    best_conf = confidence_from_prob(best_prob)

    if (p2b > best_prob):
        best_prob = p2b
        best_sel = "2"
        best_conf = confidence_from_prob(best_prob)
    if (pxb > best_prob):
        best_prob = pxb
        best_sel = "X"
        best_conf = confidence_from_prob(best_prob)

    # Comparar con Over 2.5 también como candidato
    if (po25b > best_prob):
        best_market = "Over 2.5"
        best_sel = "Sí"
        best_prob = po25b
        best_conf = confidence_from_prob(best_prob)

    # Si hay cuotas, calcular EV y escoger la mejor con edge positivo
    if inp.odds:
        candidates = []
        # 1X2
        for key, p in [("1", p1b), ("X", pxb), ("2", p2b)]:
            odd = float(inp.odds.get(key, 0) or 0)
            if odd > 1.0:
                ev = p * odd - 1.0
                edge = p - (market_1x2[key] if market_1x2 else 0.0)
                candidates.append(("1X2", key, p, ev, edge, odd))
        # Over 2.5
        odd_o25 = float(inp.odds.get("O2_5", 0) or 0)
        if odd_o25 > 1.0:
            ev = po25b * odd_o25 - 1.0
            edge = po25b - (market_o25 if market_o25 is not None else 0.0)
            candidates.append(("Over 2.5", "Sí", po25b, ev, edge, odd_o25))

        # elige mayor EV; si todos EV<=0, deja el de mayor probabilidad
        if candidates:
            candidates.sort(key=lambda x: (x[3], x[2]), reverse=True)
            if candidates[0][3] > 0:  # EV positivo
                best_market, best_sel, best_prob, best_ev, best_edge, best_odd = candidates[0]
                best_conf = confidence_from_prob(best_prob)
                reasons.append(
                    f"EV {best_ev:+.2f} con cuota {best_odd:.2f} (edge {best_edge:+.2%} vs mercado)."
                )

    summary = (
        f"Partido: {home} vs {away}. "
        f"Mejor jugada: {best_market} – {best_sel} "
        f"(prob {best_prob*100:.2f}%, confianza {best_conf:.0f}/100)."
    )

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
            "corners_mlp_pred": round(extras["total_corners_avg"], 2),  # compat front
        },
        best_pick=best,
        summary=summary,
    )
    return out
