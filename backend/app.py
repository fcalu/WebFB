# backend/app.py
import os
import time
import glob
import math
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from scipy.stats import poisson
from pydantic import BaseModel, Field
# (Opcional) calibración Platt con sklearn; si no está, seguimos sin calibrar
try:
    from sklearn.linear_model import LogisticRegression
    SKLEARN_OK = True
except Exception:
    SKLEARN_OK = False

# --------------------------------------------------------------------------------------
# Feature flags y parámetros (ajusta en variables de entorno en Render)
# --------------------------------------------------------------------------------------
USE_DIXON_COLES      = os.getenv("USE_DIXON_COLES", "0") == "1"   # Ajuste leve al empate/diagonal
DC_RHO               = float(os.getenv("DC_RHO", "0.10"))         # Intensidad del ajuste diagonal
USE_CALIBRATION      = os.getenv("USE_CALIBRATION", "0") == "1"   # Calibración Platt (si sklearn)
MARKET_WEIGHT        = float(os.getenv("MARKET_WEIGHT", "0.35"))  # peso de mercado en log-odds
USE_CACHED_RATINGS   = os.getenv("USE_CACHED_RATINGS", "1") == "1"
CACHE_TTL_SECONDS    = int(os.getenv("CACHE_TTL_SECONDS", "600")) # 10 min
EXPOSE_DEBUG         = os.getenv("EXPOSE_DEBUG", "0") == "1"      # anexa campo "debug" en output

# --------------------------------------------------------------------------------------
# Configuración básica
# --------------------------------------------------------------------------------------
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
POISSON_MAX_GOALS = 7

app = FastAPI(title="FootyMines API (hybrid-core)")

# CORS abierto (ajusta si necesitas)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------------------------------------------------------------
# Utilidades generales
# --------------------------------------------------------------------------------------
def clamp01(x: float) -> float:
    return max(0.0, min(1.0, float(x)))

def safe_prob(p: float, eps: float = 1e-6) -> float:
    return clamp01(max(eps, min(1.0 - eps, float(p))))

def logit(p: float) -> float:
    p = safe_prob(p)
    return math.log(p / (1.0 - p))

def sigmoid(z: float) -> float:
    return 1.0 / (1.0 + math.exp(-z))

def blend_logit(p_model: float, p_market: Optional[float], w: float) -> float:
    """ Mezcla en espacio log-odds: (1-w)*model + w*mercado """
    if p_market is None:
        return clamp01(p_model)
    z = (1.0 - w) * logit(p_model) + w * logit(p_market)
    return clamp01(sigmoid(z))

def implied_1x2(odds: Dict[str, float]) -> Optional[Dict[str, float]]:
    """ Convierte 1/X/2 a probabilidades implícitas normalizadas """
    try:
        o1, ox, o2 = float(odds["1"]), float(odds["X"]), float(odds["2"])
    except Exception:
        return None
    inv = np.array([1.0 / o1, 1.0 / ox, 1.0 / o2], dtype=float)
    s = inv.sum()
    if s <= 0:
        return None
    probs = inv / s
    return {"1": float(probs[0]), "X": float(probs[1]), "2": float(probs[2])}

def implied_single(odd: Optional[float]) -> Optional[float]:
    if odd is None:
        return None
    try:
        odd = float(odd)
    except Exception:
        return None
    if odd <= 1e-9:
        return None
    return 1.0 / odd

# --------------------------------------------------------------------------------------
# Matrices de Poisson y (opcional) ajuste DC ligero
# --------------------------------------------------------------------------------------
def poisson_matrix(lh: float, la: float, kmax: int = POISSON_MAX_GOALS) -> np.ndarray:
    """Matriz (kmax+1 x kmax+1) de probabilidades de marcador i-j."""
    i = np.arange(0, kmax + 1)
    j = np.arange(0, kmax + 1)
    ph = poisson.pmf(i, lh).reshape(-1, 1)
    pa = poisson.pmf(j, la).reshape(1, -1)
    M = ph @ pa
    M = M / M.sum()
    return M

def dixon_coles_soft(M: np.ndarray, rho: float) -> np.ndarray:
    """
    Ajuste leve a la masa de empates bajos. Multiplica 0-0 y 1-1 por (1+rho)
    y renormaliza. Es una aproximación suave y segura (no exacta DC).
    """
    M = M.copy()
    kmax = M.shape[0] - 1
    for (i, j) in [(0, 0), (1, 1)]:
        if i <= kmax and j <= kmax:
            M[i, j] *= (1.0 + rho)
    M = M / M.sum()
    return M

def matrix_1x2_o25_btts(M: np.ndarray) -> Dict[str, float]:
    """Agrega la matriz a probabilidades de 1/X/2, Over2.5 y BTTS."""
    kmax = M.shape[0] - 1
    home = float(np.tril(M, -1).sum())          # i > j
    draw = float(np.trace(M))                   # i == j
    away = float(np.triu(M, 1).sum())           # i < j
    over25 = float(sum(M[i, j] for i in range(kmax + 1)
                       for j in range(kmax + 1) if (i + j) >= 3))
    btts = float(sum(M[i, j] for i in range(1, kmax + 1)
                     for j in range(1, kmax + 1)))
    # Top scorelines
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

# --------------------------------------------------------------------------------------
# League store (stats por liga) + calibradores opcionales
# --------------------------------------------------------------------------------------
class PlattScaler:
    """ Calibración Platt: p' = sigmoid(a*logit(p)+b) """
    def __init__(self, a: float = 1.0, b: float = 0.0):
        self.a = a
        self.b = b

    def __call__(self, p: float) -> float:
        z = self.a * logit(p) + self.b
        return clamp01(sigmoid(z))

class TrioCalibrator:
    """
    Calibrador multi-clase simple para 1X2 (one-vs-rest con renormalización).
    """
    def __init__(self, h: PlattScaler, d: PlattScaler, a: PlattScaler):
        self.h = h
        self.d = d
        self.a = a

    def __call__(self, ph: float, pd: float, pa: float) -> Tuple[float, float, float]:
        h = self.h(ph)
        d = self.d(pd)
        a = self.a(pa)
        s = max(1e-9, (h + d + a))
        return (h / s, d / s, a / s)

class LeagueStore:
    def __init__(self, name: str, df: pd.DataFrame):
        self.name = name
        self.df = df.copy()

        # Columnas mínimas esperadas; si no están, se crean
        for col in [
            "home_team_name", "away_team_name",
            "home_team_goal_count", "away_team_goal_count",
            "home_team_yellow_cards", "away_team_yellow_cards",
            "home_team_corner_count", "away_team_corner_count",
        ]:
            if col not in self.df.columns:
                self.df[col] = 0

        # Tipo numérico
        for col in [
            "home_team_goal_count", "away_team_goal_count",
            "home_team_yellow_cards", "away_team_yellow_cards",
            "home_team_corner_count", "away_team_corner_count",
        ]:
            self.df[col] = pd.to_numeric(self.df[col], errors="coerce").fillna(0)

        # Medias de liga
        self.league_means = {
            "home_goals": float(self.df["home_team_goal_count"].mean() or 0.0),
            "away_goals": float(self.df["away_team_goal_count"].mean() or 0.0),
            "goals_per_game": float(
                (self.df["home_team_goal_count"] + self.df["away_team_goal_count"]).mean() or 0.0
            ),
            "corners_per_game": float(
                (self.df["home_team_corner_count"] + self.df["away_team_corner_count"]).mean() or 0.0
            ),
            "yellows_per_game": float(
                (self.df["home_team_yellow_cards"] + self.df["away_team_yellow_cards"]).mean() or 0.0
            ),
        }

        # Stats por equipo (medias home/away a favor y en contra)
        home_group = self.df.groupby("home_team_name").agg(
            home_goals_for=("home_team_goal_count", "mean"),
            home_goals_against=("away_team_goal_count", "mean"),
            home_corners=("home_team_corner_count", "mean"),
            home_yellows=("home_team_yellow_cards", "mean"),
        )
        away_group = self.df.groupby("away_team_name").agg(
            away_goals_for=("away_team_goal_count", "mean"),
            away_goals_against=("home_team_goal_count", "mean"),
            away_corners=("away_team_corner_count", "mean"),
            away_yellows=("away_team_yellow_cards", "mean"),
        )
        self.team_stats = home_group.join(away_group, how="outer").fillna(0.0)
        self.teams = sorted(self.team_stats.index.astype(str).tolist())

        # Rho DC leve (opcional): fijo por liga o derivado de draws empíricos
        self.dc_rho = float(DC_RHO)

        # Calibradores (opcionales)
        self.cal_1x2: Optional[TrioCalibrator] = None
        self.cal_o25: Optional[PlattScaler] = None
        self.cal_btts: Optional[PlattScaler] = None

        if USE_CALIBRATION and SKLEARN_OK:
            try:
                self._fit_calibrators()
            except Exception:
                # Si algo falla, seguimos sin calibración
                self.cal_1x2 = None
                self.cal_o25 = None
                self.cal_btts = None

    def get_lambda_pair(self, home: str, away: str) -> Tuple[float, float]:
        """ Lambdas desde medias por equipo ajustadas a medias de liga. """
        if home not in self.team_stats.index or away not in self.team_stats.index:
            raise KeyError("Equipo no encontrado en esta liga")

        ts = self.team_stats
        Lh = max(self.league_means["home_goals"], 0.1)
        La = max(self.league_means["away_goals"], 0.1)

        home_att = (ts.loc[home, "home_goals_for"] or Lh) / Lh
        away_def = (ts.loc[away, "away_goals_against"] or Lh) / Lh
        away_att = (ts.loc[away, "away_goals_for"] or La) / La
        home_def = (ts.loc[home, "home_goals_against"] or La) / La

        lam_home = Lh * (0.55 * home_att + 0.45 * away_def)
        lam_away = La * (0.55 * away_att + 0.45 * home_def)
        lam_home = float(max(lam_home, 0.05))
        lam_away = float(max(lam_away, 0.05))
        return lam_home, lam_away

    def get_additional_avgs(self, home: str, away: str) -> Dict[str, float]:
        ts = self.team_stats
        home_corners = float(ts.loc[home, "home_corners"]) if home in ts.index else 0.0
        away_corners = float(ts.loc[away, "away_corners"]) if away in ts.index else 0.0
        home_y = float(ts.loc[home, "home_yellows"]) if home in ts.index else 0.0
        away_y = float(ts.loc[away, "away_yellows"]) if away in ts.index else 0.0
        return {
            "total_corners_avg": max(home_corners + away_corners, 0.0),
            "total_yellow_cards_avg": max(home_y + away_y, 0.0),
        }

    # ---------- Calibración (opcional) ----------
    def _fit_calibrators(self):
        """Ajusta calibración Platt para 1X2, Over2.5 y BTTS usando nuestro modelo como feature."""
        # Construye dataset de matches válidos
        rows = self.df[[
            "home_team_name","away_team_name",
            "home_team_goal_count","away_team_goal_count"
        ]].dropna()
        if len(rows) < 200:
            # muy pocos datos, omitimos
            return

        X_model = []
        y_home = []
        y_draw = []
        y_away = []
        y_o25  = []
        y_btts = []

        for _, r in rows.iterrows():
            h = str(r["home_team_name"])
            a = str(r["away_team_name"])
            gh = float(r["home_team_goal_count"])
            ga = float(r["away_team_goal_count"])

            try:
                lam_h, lam_a = self.get_lambda_pair(h, a)
            except Exception:
                continue

            M = poisson_matrix(lam_h, lam_a, kmax=POISSON_MAX_GOALS)
            if USE_DIXON_COLES:
                M = dixon_coles_soft(M, self.dc_rho)

            agg = matrix_1x2_o25_btts(M)
            p1 = agg["home_win_pct"] / 100.0
            px = agg["draw_pct"] / 100.0
            p2 = agg["away_win_pct"] / 100.0
            po = agg["over_2_5_pct"] / 100.0
            pb = agg["btts_pct"] / 100.0

            X_model.append([logit(p1), logit(px), logit(p2), logit(po), logit(pb)])

            y_home.append(1.0 if gh > ga else 0.0)
            y_draw.append(1.0 if gh == ga else 0.0)
            y_away.append(1.0 if gh < ga else 0.0)
            y_o25.append(1.0 if (gh + ga) >= 3 else 0.0)
            y_btts.append(1.0 if (gh > 0 and ga > 0) else 0.0)

        if len(X_model) < 200:
            return

        X = np.array(X_model, dtype=float)
        # Entrena un LR por mercado con la feature correspondiente
        def platt_fit(col: int, y: List[float]) -> Optional[PlattScaler]:
            try:
                lr = LogisticRegression(max_iter=200)
                lr.fit(X[:, [col]], np.array(y))
                a = float(lr.coef_[0][0]); b = float(lr.intercept_[0])
                return PlattScaler(a, b)
            except Exception:
                return None

        # 0:home,1:draw,2:away,3:o25,4:btts (por cómo llenamos X)
        ch = platt_fit(0, y_home)
        cd = platt_fit(1, y_draw)
        ca = platt_fit(2, y_away)
        co = platt_fit(3, y_o25)
        cb = platt_fit(4, y_btts)

        if ch and cd and ca:
            self.cal_1x2 = TrioCalibrator(ch, cd, ca)
        if co:
            self.cal_o25 = co
        if cb:
            self.cal_btts = cb

# --------------------------------------------------------------------------------------
# Carga de ligas y cache básico
# --------------------------------------------------------------------------------------
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
        LEAGUES[name] = LeagueStore(name, df)

load_all_leagues()

# Cache simple (clave → (ts, data))
_CACHE: Dict[str, Tuple[float, dict]] = {}

def cache_get(key: str) -> Optional[dict]:
    it = _CACHE.get(key)
    if not it:
        return None
    ts, val = it
    if (time.time() - ts) > CACHE_TTL_SECONDS:
        _CACHE.pop(key, None)
        return None
    return val

def cache_set(key: str, val: dict):
    _CACHE[key] = (time.time(), val)

def cache_key(league: str, home: str, away: str, odds: Optional[Dict[str, float]]) -> str:
    # redondea cuotas para que cambios mínimos no invalide
    if odds:
        o = {k: round(float(v), 3) for k, v in odds.items() if v is not None}
    else:
        o = {}
    return f"{league}::{home}::{away}::{sorted(o.items())}"

# --------------------------------------------------------------------------------------
# Modelos de entrada/salida
# --------------------------------------------------------------------------------------
class PredictIn(BaseModel):
    league: str
    home_team: str
    away_team: str
    odds: Optional[Dict[str, float]] = None  # {"1":2.1,"X":3.2,"2":3.5,"O2_5":1.9,"BTTS_YES":1.8}
    # 'mode' se ignora por compatibilidad (frontend puede enviarlo)

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
    debug: Optional[Dict[str, object]] = None
class ParlayLegIn(BaseModel):
    league: str
    home_team: str
    away_team: str
    odds: Optional[Dict[str, float]] = None  # opcional

class ParlayIn(BaseModel):
    legs: List[ParlayLegIn] = Field(default_factory=list)
    mode: Optional[str] = "value"  # o "prob", por si luego lo usas

class ParlayLegOut(BaseModel):
    league: str
    home_team: str
    away_team: str
    pick: BestPick
    probs: Dict[str, float]       # los probs del partido
    used_odd: Optional[float] = None
    fair_prob_pct: float          # = pick.prob_pct (comodidad)
    ev: Optional[float] = None

class ParlayOut(BaseModel):
    legs: List[ParlayLegOut]
    combined_prob_pct: float
    combined_fair_odds: float
    combined_used_odds: Optional[float] = None
    combined_ev: Optional[float] = None
    summary: str
    premium: bool = True

def _leg_used_odd_for_pick(predict_out: PredictOut, odds: Optional[Dict[str,float]]) -> Optional[float]:
    """Busca la cuota que corresponde al pick seleccionado."""
    if not odds:
        return None
    m = predict_out.best_pick.market
    s = predict_out.best_pick.selection
    # Mapeos básicos (ajusta si agregas más mercados)
    if m == "1X2":
        if s == "1": return float(odds.get("1", 0) or 0) or None
        if s == "X": return float(odds.get("X", 0) or 0) or None
        if s == "2": return float(odds.get("2", 0) or 0) or None
    if m == "Over 2.5" and s == "Sí":
        return float(odds.get("O2_5", 0) or 0) or None
    if m == "BTTS" and s == "Sí":
        return float(odds.get("BTTS_YES", 0) or 0) or None
    return None

def predict_sync(inp: PredictIn) -> PredictOut:
    """Versión síncrona de predict() para usar internamente (p. ej. en parlay),
    sin el parámetro Request."""
    if inp.league not in LEAGUES:
        raise HTTPException(status_code=400, detail="Liga no encontrada")
    store = LEAGUES[inp.league]

    home = inp.home_team
    away = inp.away_team
    if home == away:
        raise HTTPException(status_code=400, detail="Equipos deben ser distintos")

    # Cache por partido + cuotas
    key = cache_key(inp.league, home, away, inp.odds)
    cached = cache_get(key)
    if USE_CACHED_RATINGS and cached:
        base = cached
    else:
        try:
            base = predict_core(store, home, away, inp.odds)
        except KeyError:
            raise HTTPException(status_code=400, detail="Equipo no encontrado en esta liga")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error interno: {e}")
        cache_set(key, base)

    return PredictOut(
        league=inp.league,
        home_team=home,
        away_team=away,
        probs=base["probs"],
        poisson=base["poisson"],
        averages=base["averages"],
        best_pick=base["best_pick"],
        summary=base["summary"],
        debug=base.get("debug"),
    )


@app.post("/parlay/suggest", response_model=ParlayOut)
def parlay_suggest(inp: ParlayIn):
    if not inp.legs or len(inp.legs) == 0:
        raise HTTPException(status_code=400, detail="Debes enviar 1..4 partidos")

    legs_out: List[ParlayLegOut] = []
    probs01: List[float] = []
    used_odds: List[float] = []

    for L in inp.legs[:4]:
        # Reutilizamos tu predicción
        pred = predict_sync(PredictIn(league=L.league, home_team=L.home_team, away_team=L.away_team, odds=L.odds))
        p01 = (pred.best_pick.prob_pct or 0.0) / 100.0
        probs01.append(p01)

        uo = _leg_used_odd_for_pick(pred, L.odds)
        if uo and uo > 1.0:
            used_odds.append(uo)

        ev_leg = (p01 * uo - 1.0) if uo and uo > 1.0 else None

        legs_out.append(ParlayLegOut(
            league=L.league,
            home_team=L.home_team,
            away_team=L.away_team,
            pick=pred.best_pick,
            probs=pred.probs,
            used_odd=uo,
            fair_prob_pct=pred.best_pick.prob_pct,
            ev=ev_leg
        ))

    # Combinados (asumiendo independencia aprox.)
    import math
    prod_prob = 1.0
    for p in probs01:
        prod_prob *= max(0.0, min(1.0, p))

    combined_prob_pct = round(prod_prob * 100, 2)
    combined_fair_odds = float("inf") if prod_prob <= 0 else round(1.0 / prod_prob, 2)

    combined_used_odds = None
    combined_ev = None
    if used_odds and len(used_odds) == len(probs01):
        # Cuota total = producto de cuotas leg
        from functools import reduce
        import operator
        total_odds = reduce(operator.mul, used_odds, 1.0)
        combined_used_odds = round(total_odds, 2)
        combined_ev = round(total_odds * prod_prob - 1.0, 4)

    summary = f"Parley de {len(legs_out)} selecciones. Prob. combinada {combined_prob_pct}%, cuota justa {combined_fair_odds}."

    return ParlayOut(
        legs=legs_out,
        combined_prob_pct=combined_prob_pct,
        combined_fair_odds=combined_fair_odds,
        combined_used_odds=combined_used_odds,
        combined_ev=combined_ev,
        summary=summary,
        premium=True,
    )
# --------------------------------------------------------------------------------------
# Núcleo de predicción (mejorado pero backward-compatible)
# --------------------------------------------------------------------------------------
def confidence_from_prob(p: float) -> float:
    # 0..100 según distancia a 0.5 (simple y estable)
    return round(max(0.0, min(1.0, abs(p - 0.5) * 2.0)) * 100.0, 2)

def predict_core(store: LeagueStore, home: str, away: str, odds: Optional[Dict[str, float]]):
    lam_h, lam_a = store.get_lambda_pair(home, away)

    M = poisson_matrix(lam_h, lam_a, kmax=POISSON_MAX_GOALS)
    if USE_DIXON_COLES:
        M = dixon_coles_soft(M, store.dc_rho)

    base = matrix_1x2_o25_btts(M)

    # Modelo base 0..1
    p1  = base["home_win_pct"] / 100.0
    px  = base["draw_pct"] / 100.0
    p2  = base["away_win_pct"] / 100.0
    po  = base["over_2_5_pct"] / 100.0
    pb  = base["btts_pct"] / 100.0

    # Calibración (opcional)
    if USE_CALIBRATION and store.cal_1x2:
        p1, px, p2 = store.cal_1x2(p1, px, p2)
    if USE_CALIBRATION and store.cal_o25:
        po = store.cal_o25(po)
    if USE_CALIBRATION and store.cal_btts:
        pb = store.cal_btts(pb)

    # Mezcla con mercado en log-odds
    m1x2 = implied_1x2(odds or {})
    mo25 = implied_single((odds or {}).get("O2_5"))
    mbtts = implied_single((odds or {}).get("BTTS_YES"))

    p1b = blend_logit(p1,  m1x2["1"] if m1x2 else None, MARKET_WEIGHT)
    pxb = blend_logit(px,  m1x2["X"] if m1x2 else None, MARKET_WEIGHT)
    p2b = blend_logit(p2,  m1x2["2"] if m1x2 else None, MARKET_WEIGHT)
    pob = blend_logit(po,  mo25,                         MARKET_WEIGHT)
    pbb = blend_logit(pb,  mbtts,                        MARKET_WEIGHT)

    probs_out = {
        "home_win_pct": round(p1b * 100, 2),
        "draw_pct": round(pxb * 100, 2),
        "away_win_pct": round(p2b * 100, 2),
        "over_2_5_pct": round(pob * 100, 2),
        "btts_pct": round(pbb * 100, 2),
        "o25_mlp_pct": round(pob * 100, 2),  # compat front: no None
    }

    # Extras
    extras = store.get_additional_avgs(home, away)
    poisson_info = {
        "home_lambda": round(lam_h, 3),
        "away_lambda": round(lam_a, 3),
        "top_scorelines": base["top_scorelines"],
    }

    # Best pick (modo “valor” si hay cuotas; si no, el más probable)
    reasons = [
        f"λ_home={lam_h:.2f}, λ_away={lam_a:.2f} (Poisson{' + DC' if USE_DIXON_COLES else ''}).",
        f"Media goles liga={store.league_means['goals_per_game']:.2f}.",
    ]

    # Candidatos por prob
    candidates = [
        ("1X2", "1", p1b, (odds or {}).get("1")),
        ("1X2", "X", pxb, (odds or {}).get("X")),
        ("1X2", "2", p2b, (odds or {}).get("2")),
        ("Over 2.5", "Sí", pob, (odds or {}).get("O2_5")),
        ("BTTS", "Sí", pbb, (odds or {}).get("BTTS_YES")),
    ]

    # Si hay cuotas, usa EV
    best_market, best_sel, best_prob = None, None, -1.0
    best_ev, best_edge, best_odd = None, None, None

    has_any_odds = any(v for _, _, _, v in candidates if v is not None)
    if has_any_odds:
        ranked = []
        for mk, sel, p, odd in candidates:
            try:
                odd = float(odd) if odd is not None else None
            except Exception:
                odd = None
            if odd and odd > 1.0:
                ev = p * odd - 1.0
                pim = implied_single(odd)
                edge = p - (pim if pim is not None else 0.0)
                ranked.append((mk, sel, p, ev, edge, odd))
        if ranked:
            ranked.sort(key=lambda x: (x[3], x[2]), reverse=True)  # EV, luego prob
            mk, sel, p, ev, edge, odd = ranked[0]
            best_market, best_sel, best_prob = mk, sel, p
            best_ev, best_edge, best_odd = ev, edge, odd
            reasons.append(f"Mejor EV con cuota {odd:.2f}: EV={ev:+.2f}, edge={edge:+.2%}.")
    # Si no hay odds, o ninguna con EV>0, toma mayor prob
    if best_market is None:
        candidates.sort(key=lambda x: x[2], reverse=True)
        mk, sel, p, odd = candidates[0]
        best_market, best_sel, best_prob = mk, sel, p

    best_conf = confidence_from_prob(best_prob)
    summary = f"Partido: {home} vs {away}. Pick: {best_market} – {best_sel} (prob {best_prob*100:.2f}%, conf {best_conf:.0f}/100)."

    best = BestPick(
        market=best_market,
        selection=best_sel,
        prob_pct=round(best_prob * 100, 2),
        confidence=best_conf,
        reasons=reasons,
    )

    out = {
        "probs": probs_out,
        "poisson": poisson_info,
        "averages": {
            "total_yellow_cards_avg": round(extras["total_yellow_cards_avg"], 2),
            "total_corners_avg": round(extras["total_corners_avg"], 2),
            "corners_mlp_pred": round(extras["total_corners_avg"], 2),  # compat
        },
        "best_pick": best,
        "summary": summary,
    }

    if EXPOSE_DEBUG:
        out["debug"] = {
            "p_model": {"1": p1, "X": px, "2": p2, "O2_5": po, "BTTS": pb},
            "p_blend": {"1": p1b, "X": pxb, "2": p2b, "O2_5": pob, "BTTS": pbb},
            "odds": odds or {},
            "market_impl": m1x2 | {"O2_5": mo25, "BTTS": mbtts} if m1x2 else {"O2_5": mo25, "BTTS": mbtts},
            "flags": {
                "USE_DIXON_COLES": USE_DIXON_COLES,
                "USE_CALIBRATION": USE_CALIBRATION,
                "MARKET_WEIGHT": MARKET_WEIGHT,
            },
        }

    return out

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
def predict(inp: PredictIn, request: Request):
    if inp.league not in LEAGUES:
        raise HTTPException(status_code=400, detail="Liga no encontrada")
    store = LEAGUES[inp.league]

    home = inp.home_team
    away = inp.away_team
    if home == away:
        raise HTTPException(status_code=400, detail="Equipos deben ser distintos")

    # Cache por partido + cuotas
    key = cache_key(inp.league, home, away, inp.odds)
    cached = cache_get(key)
    if USE_CACHED_RATINGS and cached:
        base = cached
    else:
        try:
            base = predict_core(store, home, away, inp.odds)
        except KeyError:
            raise HTTPException(status_code=400, detail="Equipo no encontrado en esta liga")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error interno: {e}")
        cache_set(key, base)

    # Arma respuesta
    out = PredictOut(
        league=inp.league,
        home_team=home,
        away_team=away,
        probs=base["probs"],
        poisson=base["poisson"],
        averages=base["averages"],
        best_pick=base["best_pick"],
        summary=base["summary"],
        debug=base.get("debug"),
    )
    return out
