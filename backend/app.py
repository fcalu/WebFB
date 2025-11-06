# backend/app.py (CÓDIGO COMPLETO - ESPN MAÑANA - SIN PAGOS)

# === stdlib ===
import os, sys, time, glob, math, re, secrets, sqlite3, json
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timezone, timedelta # <-- Usamos timedelta para mañana

# === terceros ===
import numpy as np
import pandas as pd
from scipy.stats import poisson
from fastapi import FastAPI, HTTPException, Request, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, JSONResponse
from pydantic import BaseModel, Field
import requests
from requests.exceptions import RequestException
from tenacity import retry, wait_exponential, stop_after_attempt

# === OpenAI / retry ===
from openai import OpenAI
try:
    from sklearn.linear_model import LogisticRegression
    SKLEARN_OK = True
except ImportError:
    SKLEARN_OK = False


# --- CONFIGURACIÓN GLOBAL ---
DOMAIN = os.getenv("RENDER_EXTERNAL_URL", "http://localhost:8000")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# URL de API de ESPN
ESPN_SCOREBOARD_BASE_URL = "https://site.api.espn.com/apis/site/v2/sports"
ESPN_CORE_ODDS_BASE_URL = "https://sports.core.api.espn.com/v2/sports"

# Liga por defecto para /top-matches
DEFAULT_SPORT = os.getenv("DEFAULT_SPORT", "soccer")
DEFAULT_LEAGUE = os.getenv("DEFAULT_LEAGUE", "eng.1") # Premier League por defecto

# Feature flags y parámetros
USE_DIXON_COLES      = os.getenv("USE_DIXON_COLES", "0") == "1"
DC_RHO               = float(os.getenv("DC_RHO", "0.10"))
USE_CALIBRATION      = os.getenv("USE_CALIBRATION", "0") == "1" and SKLEARN_OK
MARKET_WEIGHT        = float(os.getenv("MARKET_WEIGHT", "0.35"))
USE_CACHED_RATINGS   = os.getenv("USE_CACHED_RATINGS", "1") == "1"
CACHE_TTL_SECONDS    = int(os.getenv("CACHE_TTL_SECONDS", "600"))
EXPOSE_DEBUG         = os.getenv("EXPOSE_DEBUG", "0") == "1"
IABOOT_ON = os.getenv("IABOOT_ON", "0") == "1"
IABOOT_MODEL = os.getenv("IABOOT_MODEL", "gpt-4o")
IABOOT_TEMPERATURE = float(os.getenv("IABOOT_TEMPERATURE", "0.5"))

# Configuración básica
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
POISSON_MAX_GOALS = 7

# Inicialización de clientes
try:
    _openai_client = OpenAI()
except Exception:
    IABOOT_ON = False
    
app = FastAPI(title="FootyMines API (hybrid-core)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------------------
# LÓGICA CORE: PREDICCIÓN, UTILIDADES Y CLASES
# --------------------------------------------------------------------------------------

# Lógica de Validación (siempre True)
def check_premium(key: Optional[str], request: Optional[Request] = None):
    return True

# Funciones de utilidades generales (clamp01, logit, sigmoid, blend_logit, etc.)
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
    if p_market is None: return clamp01(p_model)
    z = (1.0 - w) * logit(p_model) + w * logit(p_market)
    return clamp01(sigmoid(z))
def implied_1x2(odds: Dict[str, float]) -> Optional[Dict[str, float]]:
    try:
        o1, ox, o2 = float(odds.get("1", 0)), float(odds.get("X", 0)), float(odds.get("2", 0))
    except Exception: return None
    if min(o1, ox, o2) <= 1.05: return None
    inv = np.array([1.0 / o1, 1.0 / ox, 1.0 / o2], dtype=float)
    s = inv.sum()
    if s <= 0: return None
    probs = inv / s
    return {"1": float(probs[0]), "X": float(probs[1]), "2": float(probs[2])}
def implied_single(odd: Optional[float]) -> Optional[float]:
    if odd is None: return None
    try: odd = float(odd)
    except Exception: return None
    if odd <= 1.05: return None
    return 1.0 / odd

# Funciones de Poisson y Dixon-Coles
def poisson_matrix(lh: float, la: float, kmax: int = POISSON_MAX_GOALS) -> np.ndarray:
    i = np.arange(0, kmax + 1); j = np.arange(0, kmax + 1)
    ph = poisson.pmf(i, lh).reshape(-1, 1); pa = poisson.pmf(j, la).reshape(1, -1)
    M = ph @ pa; M = M / M.sum(); return M
def p_over_xdot5(lam: float, xdot5: float) -> float:
    kmin = int(math.floor(xdot5)) + 1; return float(1.0 - poisson.cdf(kmin - 1, lam))
def p_under_xdot5(lam: float, xdot5: float) -> float:
    kmax = int(math.floor(xdot5)); return float(poisson.cdf(kmax, lam))
def dixon_coles_soft(M: np.ndarray, rho: float) -> np.ndarray:
    M = M.copy(); kmax = M.shape[0] - 1
    for (i, j) in [(0, 0), (1, 1)]:
        if i <= kmax and j <= kmax: M[i, j] *= (1.0 + rho)
    M = M / M.sum(); return M
def matrix_1x2_o25_btts(M: np.ndarray) -> Dict[str, float]:
    kmax = M.shape[0] - 1
    home = float(np.tril(M, -1).sum())
    draw = float(np.trace(M))
    away = float(np.triu(M, 1).sum())
    over25 = float(sum(M[i, j] for i in range(kmax + 1) for j in range(kmax + 1) if (i + j) >= 3))
    btts = float(sum(M[i, j] for i in range(1, kmax + 1) for j in range(1, kmax + 1)))
    pairs = [((i, j), float(M[i, j])) for i in range(kmax + 1) for j in range(kmax + 1)]
    pairs.sort(key=lambda x: x[1], reverse=True)
    top = [{"score": f"{a}-{b}", "pct": round(p * 100, 2)} for (a, b), p in pairs[:5]]
    return {
        "home_win_pct": round(home * 100, 2), "draw_pct": round(draw * 100, 2), "away_win_pct": round(away * 100, 2),
        "over_2_5_pct": round(over25 * 100, 2), "btts_pct": round(btts * 100, 2), "top_scorelines": top,
    }

# Clases de LeagueStore y Calibración
class PlattScaler:
    def __init__(self, a: float = 1.0, b: float = 0.0): self.a, self.b = a, b
    def __call__(self, p: float) -> float:
        z = self.a * logit(p) + self.b; return clamp01(sigmoid(z))
class TrioCalibrator:
    def __init__(self, h: PlattScaler, d: PlattScaler, a: PlattScaler): self.h, self.d, self.a = h, d, a
    def __call__(self, ph: float, pd: float, pa: float) -> Tuple[float, float, float]:
        h = self.h(ph); d = self.d(pd); a = self.a(pa); s = max(1e-9, (h + d + a))
        return (h / s, d / s, a / s)
class LeagueStore:
    def __init__(self, name: str, df: pd.DataFrame):
        self.name = name; self.df = df.copy()
        for col in ["home_team_name", "away_team_name", "home_team_goal_count", "away_team_goal_count", "home_team_yellow_cards", "away_team_yellow_cards", "home_team_corner_count", "away_team_corner_count",]:
            if col not in self.df.columns: self.df[col] = 0
        for col in ["home_team_goal_count", "away_team_goal_count", "home_team_yellow_cards", "away_team_yellow_cards", "home_team_corner_count", "away_team_corner_count",]:
            self.df[col] = pd.to_numeric(self.df[col], errors="coerce").fillna(0)
        self.league_means = {
            "home_goals": float(self.df["home_team_goal_count"].mean() or 0.0),
            "away_goals": float(self.df["away_team_goal_count"].mean() or 0.0),
            "goals_per_game": float((self.df["home_team_goal_count"] + self.df["away_team_goal_count"]).mean() or 0.0),
            "corners_per_game": float((self.df["home_team_corner_count"] + self.df["away_team_corner_count"]).mean() or 0.0),
            "yellows_per_game": float((self.df["home_team_yellow_cards"] + self.df["away_team_yellow_cards"]).mean() or 0.0),
        }
        home_group = self.df.groupby("home_team_name").agg(home_goals_for=("home_team_goal_count", "mean"), home_goals_against=("away_team_goal_count", "mean"), home_corners=("home_team_corner_count", "mean"), home_yellows=("home_team_yellow_cards", "mean"),)
        away_group = self.df.groupby("away_team_name").agg(away_goals_for=("away_team_goal_count", "mean"), away_goals_against=("home_team_goal_count", "mean"), away_corners=("away_team_corner_count", "mean"), away_yellows=("away_team_yellow_cards", "mean"),)
        self.team_stats = home_group.join(away_group, how="outer").fillna(0.0)
        self.teams = sorted(self.team_stats.index.astype(str).tolist())
        self.dc_rho = float(DC_RHO)
        self.cal_1x2, self.cal_o25, self.cal_btts = None, None, None
        if USE_CALIBRATION:
            try: self._fit_calibrators()
            except Exception: pass
    def get_lambda_pair(self, home: str, away: str) -> Tuple[float, float]:
        if home not in self.team_stats.index or away not in self.team_stats.index:
            raise KeyError("Equipo no encontrado en esta liga")
        ts, Lh, La = self.team_stats, max(self.league_means["home_goals"], 0.1), max(self.league_means["away_goals"], 0.1)
        home_att = (ts.loc[home, "home_goals_for"] or Lh) / Lh
        away_def = (ts.loc[away, "away_goals_against"] or Lh) / Lh
        away_att = (ts.loc[away, "away_goals_for"] or La) / La
        home_def = (ts.loc[home, "home_goals_against"] or La) / La
        lam_home = Lh * (0.55 * home_att + 0.45 * away_def)
        lam_away = La * (0.55 * away_att + 0.45 * home_def)
        return float(max(lam_home, 0.05)), float(max(lam_away, 0.05))
    def get_additional_avgs(self, home: str, away: str) -> Dict[str, float]:
        ts = self.team_stats
        home_corners = float(ts.loc[home, "home_corners"]) if home in ts.index else 0.0
        away_corners = float(ts.loc[away, "away_corners"]) if away in ts.index else 0.0
        home_y = float(ts.loc[home, "home_yellows"]) if home in ts.index else 0.0
        away_y = float(ts.loc[away, "away_yellows"]) if away in ts.index else 0.0
        return {"total_corners_avg": max(home_corners + away_corners, 0.0), "total_yellow_cards_avg": max(home_y + away_y, 0.0)}
    def _fit_calibrators(self):
        rows = self.df[["home_team_name","away_team_name","home_team_goal_count","away_team_goal_count"]].dropna()
        if len(rows) < 200: return
        X_model, y_home, y_draw, y_away, y_o25, y_btts = [], [], [], [], [], []
        for _, r in rows.iterrows():
            h, a, gh, ga = str(r["home_team_name"]), str(r["away_team_name"]), float(r["home_team_goal_count"]), float(r["away_team_goal_count"])
            try: lam_h, lam_a = self.get_lambda_pair(h, a)
            except Exception: continue
            M = poisson_matrix(lam_h, lam_a, kmax=POISSON_MAX_GOALS)
            if USE_DIXON_COLES: M = dixon_coles_soft(M, self.dc_rho)
            agg = matrix_1x2_o25_btts(M)
            p1, px, p2, po, pb = agg["home_win_pct"] / 100.0, agg["draw_pct"] / 100.0, agg["away_win_pct"] / 100.0, agg["over_2_5_pct"] / 100.0, agg["btts_pct"] / 100.0
            X_model.append([logit(p1), logit(px), logit(p2), logit(po), logit(pb)])
            y_home.append(1.0 if gh > ga else 0.0); y_draw.append(1.0 if gh == ga else 0.0); y_away.append(1.0 if gh < ga else 0.0)
            y_o25.append(1.0 if (gh + ga) >= 3 else 0.0); y_btts.append(1.0 if (gh > 0 and ga > 0) else 0.0)
        if len(X_model) < 200: return
        X = np.array(X_model, dtype=float)
        def platt_fit(col: int, y: List[float]) -> Optional[PlattScaler]:
            try:
                lr = LogisticRegression(max_iter=200); lr.fit(X[:, [col]], np.array(y))
                return PlattScaler(float(lr.coef_[0][0]), float(lr.intercept_[0]))
            except Exception: return None
        ch, cd, ca, co, cb = platt_fit(0, y_home), platt_fit(1, y_draw), platt_fit(2, y_away), platt_fit(3, y_o25), platt_fit(4, y_btts)
        if ch and cd and ca: self.cal_1x2 = TrioCalibrator(ch, cd, ca)
        if co: self.cal_o25 = co
        if cb: self.cal_btts = cb

# Carga de ligas y cache básico
LEAGUES: Dict[str, LeagueStore] = {}
def load_all_leagues():
    LEAGUES.clear(); pattern = os.path.join(DATA_DIR, "*.csv")
    for path in sorted(glob.glob(pattern)):
        name = os.path.splitext(os.path.basename(path))[0]
        try: df = pd.read_csv(path, encoding="utf-8", low_memory=False)
        except Exception: df = pd.read_csv(path, encoding="latin-1", low_memory=False)
        LEAGUES[name] = LeagueStore(name, df)
load_all_leagues()

# Historial (SQLite)
DB_PATH = os.path.join(os.path.dirname(__file__), "history.db")
def _db(): conn = sqlite3.connect(DB_PATH); conn.row_factory = sqlite3.Row; return conn
def init_db():
    conn = _db(); cur = conn.cursor()
    cur.execute("""CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, league TEXT, home TEXT, away TEXT, market TEXT, selection TEXT, prob_pct REAL, odd REAL, stake REAL, result TEXT DEFAULT 'pending')""")
    conn.commit(); conn.close()
init_db()

# Cache
_CACHE: Dict[str, Tuple[float, dict]] = {}
def cache_get(key: str) -> Optional[dict]:
    it = _CACHE.get(key)
    if not it: return None
    ts, val = it
    if (time.time() - ts) > CACHE_TTL_SECONDS: _CACHE.pop(key, None); return None
    return val
def cache_set(key: str, val: dict): _CACHE[key] = (time.time(), val)
def cache_key(league: str, home: str, away: str, odds: Optional[Dict[str, float]]) -> str:
    if odds: o = {k: round(float(v), 3) for k, v in odds.items() if v is not None}
    else: o = {}
    return f"{league}::{home}::{away}::{sorted(o.items())}"


# --------------------------------------------------------------------------------------
# INTEGRACIÓN ESPN API (Real)
# --------------------------------------------------------------------------------------

@retry(wait=wait_exponential(multiplier=1, min=1, max=8), stop=stop_after_attempt(3))
def _fetch_scoreboard_data(sport: str, league: str, date: str) -> Optional[dict]:
    url = f"{ESPN_SCOREBOARD_BASE_URL}/{sport}/{league}/scoreboard"
    try:
        params = {"dates": date}; headers = {"Accept": "application/json"}
        response = requests.get(url, params=params, headers=headers, timeout=5)
        response.raise_for_status(); return response.json()
    except RequestException as e:
        return None
    except Exception as e:
        return None

@retry(wait=wait_exponential(multiplier=1, min=1, max=8), stop=stop_after_attempt(3))
def _fetch_odds_data(sport: str, league: str, event_id: str) -> Optional[Dict[str, float]]:
    url = f"{ESPN_CORE_ODDS_BASE_URL}/{sport}/leagues/{league}/events/{event_id}/competitions/{event_id}/odds"
    odds = {}
    try:
        headers = {"Accept": "application/json"}
        response = requests.get(url, headers=headers, timeout=3)
        response.raise_for_status()
        data = response.json()

        if data.get("odds"):
            first_odds_set = data["odds"][0]
            for ml in first_odds_set.get("moneyline", []):
                if ml.get("type") == "home" and ml.get("odd"): odds["1"] = float(ml["odd"])
                elif ml.get("type") == "draw" and ml.get("odd"): odds["X"] = float(ml["odd"])
                elif ml.get("type") == "away" and ml.get("odd"): odds["2"] = float(ml["odd"])
            
            for total in first_odds_set.get("totals", []):
                if total.get("overUnder") == 2.5 and total.get("overOdds"):
                    odds["O2_5"] = float(total["overOdds"])
            
        if odds.get("1") and odds.get("2") or odds.get("O2_5"): return odds
        return None
    except RequestException:
        return None
    except Exception as e:
        return None


def top_matches_payload(date: str | None = None):
    """Lógica para obtener partidos y cuotas reales de ESPN. Usa MAÑANA por defecto."""
    
    if not date:
        # Pide partidos de MAÑANA
        tomorrow = datetime.now(timezone.utc) + timedelta(days=1)
        date = tomorrow.strftime("%Y%m%d")
    
    SPORT, LEAGUE = DEFAULT_SPORT, DEFAULT_LEAGUE

    data = _fetch_scoreboard_data(SPORT, LEAGUE, date)
    if not data: return {"matches": [], "message": f"No se pudo obtener la data para {SPORT.upper()} {LEAGUE.upper()} en {date}."}

    matches = []
    for event in data.get("events", []):
        if event.get("status", {}).get("type", {}).get("state") == "pre":
            comp = event.get("competitions", [{}])[0]
            if not comp or len(comp.get("competitors", [])) < 2: continue
            
            event_id = event["id"]
            home_team = comp["competitors"][0]["team"]["displayName"]
            away_team = comp["competitors"][1]["team"]["displayName"]
            
            odds = _fetch_odds_data(SPORT, LEAGUE, event_id)
            if not odds: continue
            
            league_name = next((l for l in LEAGUES.keys() if l.lower() == LEAGUE.lower()), LEAGUE)

            matches.append({
                "league": league_name,
                "match_id": event_id,
                "home_team": home_team,
                "away_team": away_team,
                "date": event.get("date"),
                "odds": odds,
            })
            # Límite de partidos a 8 (puedes ajustar a 5 si quieres menos)
            if len(matches) >= 8: break

    return {"matches": matches, "count": len(matches), "source": f"ESPN {SPORT.upper()} {LEAGUE.upper()} ({date})"}


# --------------------------------------------------------------------------------------
# MODELOS DE ENTRADA/SALIDA (Pydantic)
# --------------------------------------------------------------------------------------
class PredictIn(BaseModel):
    league: str; home_team: str; away_team: str
    odds: Optional[Dict[str, float]] = None
    expert: bool = False; premium_key: Optional[str] = None
class BestPick(BaseModel):
    market: str; selection: str; prob_pct: float
    confidence: float; reasons: List[str]
class PredictOut(BaseModel):
    league: str; home_team: str; away_team: str
    probs: Dict[str, float]; poisson: Dict[str, object]
    averages: Dict[str, float]; best_pick: BestPick
    summary: str; debug: Optional[Dict[str, object]] = None

class ParlayLegIn(BaseModel):
    league: str; home_team: str; away_team: str
    odds: Optional[Dict[str, float]] = None
class ParlayIn(BaseModel):
    legs: List[ParlayLegIn] = Field(default_factory=list)
    mode: Optional[str] = "value"; premium_key: Optional[str] = None
class ParlayLegOut(BaseModel):
    league: str; home_team: str; away_team: str; pick: BestPick
    probs: Dict[str, float]; used_odd: Optional[float] = None
    fair_prob_pct: float; ev: Optional[float] = None
class ParlayOut(BaseModel):
    legs: List[ParlayLegOut]
    combined_prob_pct: float; combined_fair_odds: float
    combined_used_odds: Optional[float] = None; combined_ev: Optional[float] = None
    summary: str; premium: bool = False

class BuilderIn(BaseModel):
    league: str; home_team: str; away_team: str
    odds: Optional[Dict[str, float]] = None; premium_key: Optional[str] = None
class BuilderLegOut(BaseModel):
    market: str; selection: str; prob_pct: float
class BuilderOut(BaseModel):
    legs: List[BuilderLegOut]; combo_prob_pct: float
    summary: str; debug: Optional[Dict[str, float]] = None

class IABootLeg(BaseModel):
    market: str; selection: str; prob_pct: float
    confidence: float; rationale: str
class IABootOut(BaseModel):
    match: str; league: str; summary: str; picks: List[IABootLeg]

class HistoryLogIn(BaseModel):
    ts: Optional[int] = None; league: str; home: str; away: str
    market: str; selection: str; prob_pct: Optional[float] = None
    odd: Optional[float] = None; stake: Optional[float] = None

class PremiumStatusOut(BaseModel):
    active: bool; plan: Optional[str] = None
    current_period_end: Optional[int] = None; email: Optional[str] = None
    status: Optional[str] = None


# --------------------------------------------------------------------------------------
# LÓGICA DE NEGOCIO (Core Predict, Parlay, IABoot)
# --------------------------------------------------------------------------------------

def _leg_used_odd_for_pick(predict_out: PredictOut, odds: Optional[Dict[str,float]]) -> Optional[float]:
    m, s = predict_out.best_pick.market, predict_out.best_pick.selection
    if m == "1X2":
        if s == "1": return float(odds.get("1", 0) or 0) or None
        if s == "X": return float(odds.get("X", 0) or 0) or None
        if s == "2": return float(odds.get("2", 0) or 0) or None
    if m == "Over 2.5" and s == "Sí": return float(odds.get("O2_5", 0) or 0) or None
    if m == "BTTS" and s == "Sí": return float(odds.get("BTTS_YES", 0) or 0) or None
    return None

def confidence_from_prob(prob_pct: float) -> float:
    try: p = float(prob_pct)
    except Exception: p = 50.0
    return max(0.0, min(100.0, abs(p - 50.0) * 2.0))

def _choose_best_pick(probs_pct: Dict[str, float], odds: Optional[Dict[str, float]]) -> BestPick:
    cands = []
    for k_sel, label in (("1","1"), ("X","X"), ("2","2")):
        p01 = (probs_pct["home_win_pct" if k_sel=="1" else "draw_pct" if k_sel=="X" else "away_win_pct"])/100.0
        odd = float(odds.get(k_sel)) if odds and odds.get(k_sel) else None
        ev = (p01 * odd - 1.0) if (odd and odd > 1.0) else None
        cands.append(("1X2", label, p01*100.0, ev))
    p_o = probs_pct.get("over_2_5_pct", 0.0)/100.0
    odd_o = float(odds.get("O2_5")) if odds and odds.get("O2_5") else None
    ev_o = (p_o * odd_o - 1.0) if (odd_o and odd_o > 1.0) else None
    cands.append(("Over 2.5", "Sí", p_o*100.0, ev_o))
    p_b = probs_pct.get("btts_pct", 0.0)/100.0
    odd_b = float(odds.get("BTTS_YES")) if odds and odds.get("BTTS_YES") else None
    ev_b = (p_b * odd_b - 1.0) if (odd_b and odd_b > 1.0) else None
    cands.append(("BTTS", "Sí", p_b*100.0, ev_b))

    any_odds = odds and any(odds.get(k) for k in ("1","X","2","O2_5","BTTS_YES"))
    if any_odds:
        if all(ev is None for _,_,_,ev in cands): best = max(cands, key=lambda x: x[2])
        else: best = max(cands, key=lambda x: (x[3] if x[3] is not None else -1e9))
    else: best = max(cands, key=lambda x: x[2])
    market, selection, prob_pct, _ = best
    conf = confidence_from_prob(prob_pct); reasons = []
    if market == "1X2": reasons.append("Selección 1X2 con mayor expectativa del modelo.")
    elif market == "Over 2.5": reasons.append("Alta suma esperada de goles según Poisson.")
    elif market == "BTTS": reasons.append("Ambos equipos con tasas ofensivas apreciables.")
    return BestPick(market=market, selection=selection, prob_pct=round(prob_pct, 2), confidence=round(conf, 2), reasons=reasons)

def predict_core(store: "LeagueStore", home: str, away: str, odds: Optional[Dict[str, float]]) -> dict:
    lam_h, lam_a = store.get_lambda_pair(home, away)
    M = poisson_matrix(lam_h, lam_a, kmax=POISSON_MAX_GOALS)
    if USE_DIXON_COLES: M = dixon_coles_soft(M, store.dc_rho)
    agg = matrix_1x2_o25_btts(M)
    p1, px, p2, po, pb = agg["home_win_pct"]/100.0, agg["draw_pct"]/100.0, agg["away_win_pct"]/100.0, agg["over_2_5_pct"]/100.0, agg["btts_pct"]/100.0

    if store.cal_1x2: p1, px, p2 = store.cal_1x2(p1, px, p2)
    if store.cal_o25: po = store.cal_o25(po)
    if store.cal_btts: pb = store.cal_btts(pb)

    implied = {}
    if odds:
        imp_1x2 = implied_1x2(odds)
        if imp_1x2:
            p1 = blend_logit(p1, imp_1x2.get("1"), MARKET_WEIGHT)
            px = blend_logit(px, imp_1x2.get("X"), MARKET_WEIGHT)
            p2 = blend_logit(p2, imp_1x2.get("2"), MARKET_WEIGHT)
            implied.update({"1": imp_1x2.get("1"), "X": imp_1x2.get("X"), "2": imp_1x2.get("2")})
        imp_o = implied_single(odds.get("O2_5"))
        imp_b = implied_single(odds.get("BTTS_YES"))
        if imp_o is not None:
            po = blend_logit(po, imp_o, MARKET_WEIGHT)
            implied["O2_5"] = imp_o
        if imp_b is not None:
            pb = blend_logit(pb, imp_b, MARKET_WEIGHT)
            implied["BTTS_YES"] = imp_b

    probs_pct = {
        "home_win_pct": round(p1*100.0, 2), "draw_pct": round(px*100.0, 2), "away_win_pct": round(p2*100.0, 2),
        "over_2_5_pct": round(po*100.0, 2), "btts_pct": round(pb*100.0, 2), "top_scorelines": agg["top_scorelines"],
    }
    avgs = store.get_additional_avgs(home, away)
    avgs_out = {"total_corners_avg": round(avgs.get("total_corners_avg", 0.0), 2), "total_yellow_cards_avg": round(avgs.get("total_yellow_cards_avg", 0.0), 2), "corners_mlp_pred": round(avgs.get("total_corners_avg", 0.0), 2),}
    best = _choose_best_pick(probs_pct, odds)
    summary = f"{home} vs {away}: Local {probs_pct['home_win_pct']}% · Empate {probs_pct['draw_pct']}% · Visitante {probs_pct['away_win_pct']}% · Over2.5 {probs_pct['over_2_5_pct']}% · BTTS {probs_pct['btts_pct']}%."
    return {
        "probs": {"home_win_pct": probs_pct["home_win_pct"], "draw_pct": probs_pct["draw_pct"], "away_win_pct": probs_pct["away_win_pct"], "over_2_5_pct": probs_pct["over_2_5_pct"], "btts_pct": probs_pct["btts_pct"],},
        "poisson": {"home_lambda": round(lam_h, 4), "away_lambda": round(lam_a, 4), "top_scorelines": probs_pct["top_scorelines"],},
        "averages": avgs_out, "best_pick": best, "summary": summary,
        "debug": {"used_dixon_coles": bool(USE_DIXON_COLES), "market_implied": implied if implied else None,},
    }

def predict_sync(inp: PredictIn) -> PredictOut:
    if inp.league not in LEAGUES: raise HTTPException(status_code=400, detail="Liga no encontrada")
    store = LEAGUES[inp.league]; home, away = inp.home_team, inp.away_team
    if home == away: raise HTTPException(status_code=400, detail="Equipos deben ser distintos")
    key = cache_key(inp.league, home, away, inp.odds); cached = cache_get(key)
    if USE_CACHED_RATINGS and cached: base = cached
    else:
        try: base = predict_core(store, home, away, inp.odds)
        except KeyError: raise HTTPException(status_code=400, detail="Equipo no encontrado en esta liga")
        except Exception as e: raise HTTPException(status_code=500, detail=f"Error interno: {e}")
        cache_set(key, base)
    return PredictOut(league=inp.league, home_team=home, away_team=away, probs=base["probs"], poisson=base["poisson"], averages=base["averages"], best_pick=base["best_pick"], summary=base["summary"], debug=base.get("debug") if (inp.expert or EXPOSE_DEBUG) else None,)

def _recent_form_snippet(store: "LeagueStore", home: str, away: str, n: int = 6) -> str: return ""

@retry(wait=wait_exponential(multiplier=1, min=1, max=8), stop=stop_after_attempt(3))
def _call_openai_structured(model: str, temperature: float, schema: dict, messages: list[dict]):
    return _openai_client.chat.completions.create(model=model, temperature=temperature, response_format={"type": "json_object"}, messages=messages, max_tokens=800,)

# IABoot Helpers (se mantienen igual)
def _norm_text(s: str) -> str: return re.sub(r"\s+", " ", (s or "")).strip().lower()
def _canon_market_selection(market_raw: str, selection_raw: str, home_name: str, away_name: str):
    m, s, hn, an = _norm_text(market_raw), _norm_text(selection_raw), _norm_text(home_name), _norm_text(away_name)
    if "btts" in m or "ambos" in m or "both teams" in m or "gg" in m:
        sel = "Sí" if s in ("si","sí","yes","y","true","1") else ("No" if s in ("no","n","false","0") else "Sí")
        return ("BTTS", sel, "BTTS", sel)
    if any(k in m for k in ("1x2","resultado","ganador","winner","match result","resultado final")):
        if s in ("x","empate","draw"): return ("1X2","X","1X2","Empate")
        if any(k in s for k in ("local","home","casa")) or s == "1" or hn in s: return ("1X2","1","1X2","Gana local")
        if any(k in s for k in ("visit","away","fuera")) or s == "2" or an in s: return ("1X2","2","1X2","Gana visitante")
        if "local" in m:   return ("1X2","1","1X2","Gana local")
        if "visit" in m:   return ("1X2","2","1X2","Gana visitante")
        return ("1X2","1","1X2","Gana local")
    def has_over25(t):  return "over 2.5" in t or "más de 2.5" in t or "mas de 2.5" in t or "o2.5" in t
    def has_under25(t): return "under 2.5" in t or "menos de 2.5" in t or "u2.5" in t
    if has_over25(m) or has_over25(s): return ("Over 2.5","Sí","Over 2.5","Más de 2.5")
    if has_under25(m) or has_under25(s): return ("UNDER_2_5","Sí","Under 2.5","Menos de 2.5")
    return ("BTTS","Sí","BTTS","Sí")
def _iaboot_schema() -> dict:
    return {"name": "iaboot_schema", "schema": {"type": "object", "properties": {"match":  {"type": "string"}, "league": {"type": "string"}, "summary":{"type": "string"}, "picks": {"type": "array", "minItems": 1, "maxItems": 3, "items": {"type": "object", "properties": {"market": {"type": "string", "enum": ["1X2", "Over 2.5", "UNDER_2_5", "BTTS"]}, "selection": {"type": "string", "enum": ["1","X","2","Sí","No"]}, "prob_pct":  {"type": "number", "minimum": 0, "maximum": 100}, "confidence": {"type": "number", "minimum": 0, "maximum": 100}, "rationale":  {"type": "string"}}, "required": ["market","selection","prob_pct","confidence"]}}}, "required": ["picks","match","league"]}}
def _iaboot_messages(pred: PredictOut, odds: dict | None, form_text: str) -> tuple[str, str]:
    sys_msg = ("Eres un analista profesional de apuestas deportivas que transforma métricas de un modelo estadístico (Poisson calibrado + blend con mercado) en picks accionables.\nREGLAS:\n1) Mercados permitidos: '1X2','Over 2.5','UNDER_2_5','BTTS' con selecciones válidas.\n2) No inventes probabilidades; usa las del modelo.\n3) Si hay cuotas, prioriza EV≈p*cuota−1; si no, probabilidad base.\n4) Máximo 3 picks, evita correlaciones fuertes.\n5) Cada pick: market, selection, prob_pct, confidence, rationale (1–2 frases con datos).\n6) Tono profesional y sin promesas.\n7) SALIDA: SOLO JSON con match, league, summary, picks[].\n")
    odds_text = str(odds) if odds else "N/A"; top = pred.poisson.get("top_scorelines") or []
    user_msg = (f"Partido: {pred.home_team} vs {pred.away_team} en {pred.league}.\nProbabilidades del modelo (%%):\n- 1: {pred.probs['home_win_pct']}    X: {pred.probs['draw_pct']}    2: {pred.probs['away_win_pct']}\n- Over 2.5: {pred.probs['over_2_5_pct']}\n- BTTS Sí: {pred.probs['btts_pct']}\n\nLambdas Poisson: local={pred.poisson.get('home_lambda')}  visitante={pred.poisson.get('away_lambda')}\nMarcadores más probables (top-5): {top}\nCuotas (si hay): {odds_text}\nContexto breve: {form_text or 'N/A'}\n\nInstrucciones:\n- Si hay cuotas, estima EV≈p*cuota−1 y ordena por EV>0. Si no hay EV positivo, usa probabilidad base.\n- Evita picks fuertemente correlacionados. Máx. 3.\n- 'confidence' puede basarse en distancia a 50%% y coherencia con lambdas/cuotas.\nDevuelve SOLO el JSON.\n")
    return sys_msg, user_msg


# --------------------------------------------------------------------------------------
# ENDPOINTS (API REST)
# --------------------------------------------------------------------------------------

@app.get("/", response_class=PlainTextResponse)
def root(): return "FootyMines API online"

@app.get("/__health", response_class=PlainTextResponse)
def health(): return "ok"

@app.get("/leagues")
def get_leagues(): return {"leagues": sorted(LEAGUES.keys())}

@app.get("/teams")
def get_teams(league: str):
    if league not in LEAGUES: raise HTTPException(status_code=400, detail="Liga no encontrada")
    return {"teams": LEAGUES[league].teams}

@app.post("/predict", response_model=PredictOut)
def predict_endpoint(inp: PredictIn, request: Request, premium_key_hdr: Optional[str] = Header(default=None, alias="X-Premium-Key")):
    return predict_sync(inp)

@app.get("/premium/status", response_model=PremiumStatusOut)
def premium_status(premium_key: Optional[str] = None, request: Request = None, premium_key_hdr: Optional[str] = Header(default=None, alias="X-Premium-Key"),):
    return PremiumStatusOut(active=True, plan="free", status="active")

@app.get("/top-matches")
def top_matches(date: str | None = Query(default=None)):
    try:
        return top_matches_payload(date)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener top matches de ESPN: {e}")

@app.post("/parlay/suggest", response_model=ParlayOut)
def parlay_suggest(inp: ParlayIn, request: Request):
    check_premium(inp.premium_key, request)
    if not inp.legs or len(inp.legs) == 0: raise HTTPException(status_code=400, detail="Debes enviar 1..4 partidos")
    legs_out: List[ParlayLegOut] = []; probs01: List[float] = []; used_odds: List[float] = []
    for L in inp.legs[:4]:
        pred = predict_sync(PredictIn(league=L.league, home_team=L.home_team, away_team=L.away_team, odds=L.odds))
        p01 = (pred.best_pick.prob_pct or 0.0) / 100.0; probs01.append(p01)
        uo = _leg_used_odd_for_pick(pred, L.odds)
        if uo and uo > 1.0: used_odds.append(uo)
        ev_leg = (p01 * uo - 1.0) if uo and uo > 1.0 else None
        legs_out.append(ParlayLegOut(league=L.league, home_team=L.home_team, away_team=L.away_team, pick=pred.best_pick, probs=pred.probs, used_odd=uo, fair_prob_pct=pred.best_pick.prob_pct, ev=ev_leg))

    prod_prob = 1.0
    for p in probs01: prod_prob *= max(0.0, min(1.0, p))
    combined_prob_pct = round(prod_prob * 100, 2)
    combined_fair_odds = float("inf") if prod_prob <= 0 else round(1.0 / prod_prob, 2)
    combined_used_odds, combined_ev = None, None
    if used_odds and len(used_odds) == len(probs01):
        from functools import reduce; import operator
        total_odds = reduce(operator.mul, used_odds, 1.0)
        combined_used_odds = round(total_odds, 2)
        combined_ev = round(total_odds * prod_prob - 1.0, 4)
    summary = f"Parley de {len(legs_out)} selecciones. Prob. combinada {combined_prob_pct}%, cuota justa {combined_fair_odds}."
    return ParlayOut(legs=legs_out, combined_prob_pct=combined_prob_pct, combined_fair_odds=combined_fair_odds, combined_used_odds=combined_used_odds, combined_ev=combined_ev, summary=summary, premium=False)

@app.post("/builder/suggest", response_model=BuilderOut)
def builder_suggest(inp: BuilderIn, request: Request):
    check_premium(inp.premium_key, request)
    pred = predict_sync(PredictIn(league=inp.league, home_team=inp.home_team, away_team=inp.away_team, odds=inp.odds))
    p1, px, p2, po25, pbtts = pred.probs["home_win_pct"] / 100.0, pred.probs["draw_pct"] / 100.0, pred.probs["away_win_pct"] / 100.0, pred.probs["over_2_5_pct"] / 100.0, pred.probs["btts_pct"] / 100.0
    p1x = clamp01(p1 + px)
    lam_h, lam_a = float(pred.poisson.get("home_lambda", 1.1) or 1.1), float(pred.poisson.get("away_lambda", 1.1) or 1.1)
    lam_sum = lam_h + lam_a
    lam_corners = float(pred.averages.get("total_corners_avg", 9.0) or 9.0)
    lam_cards = float(pred.averages.get("total_yellow_cards_avg", 4.5) or 4.5)
    picks: List[BuilderLegOut] = []; flags = {"has_over": False, "has_btts": False, "has_1x2": False}

    if p1 >= 0.62: picks.append(BuilderLegOut(market="Ganador", selection="Gana Local", prob_pct=round(p1*100,2))); flags["has_1x2"] = True
    elif p2 >= 0.62: picks.append(BuilderLegOut(market="Ganador", selection="Gana Visitante", prob_pct=round(p2*100,2))); flags["has_1x2"] = True
    elif p1x >= 0.58: picks.append(BuilderLegOut(market="Doble oportunidad", selection="1X (Local o Empate)", prob_pct=round(p1x*100,2))); flags["has_1x2"] = True
    
    if pbtts >= 0.58 and lam_h >= 0.85 and lam_a >= 0.85: picks.append(BuilderLegOut(market="BTTS", selection="Sí", prob_pct=round(pbtts*100,2))); flags["has_btts"] = True

    if po25 >= 0.60 and lam_sum >= 2.5: picks.append(BuilderLegOut(market="Goles", selection="Más de 2.5", prob_pct=round(po25*100,2))); flags["has_over"] = True
    else:
        p_u35 = p_under_xdot5(lam_sum, 3.5)
        if p_u35 >= 0.59 and lam_sum <= 2.4: picks.append(BuilderLegOut(market="Goles", selection="Menos de 3.5", prob_pct=round(p_u35*100,2)))

    best_corners = None
    for line in [9.5, 8.5, 7.5]:
        p_over = p_over_xdot5(lam_corners, line);
        if p_over >= 0.60: best_corners = (line, p_over); break
    if best_corners:
        line, p_over = best_corners
        picks.append(BuilderLegOut(market="Córners", selection=f"Más de {line}", prob_pct=round(p_over*100,2)))

    best_cards = None; cands = []
    cands.append(("Menos de 4.5", p_under_xdot5(lam_cards, 4.5)))
    cands.append(("Menos de 5.5", p_under_xdot5(lam_cards, 5.5)))
    cands.append(("Más de 3.5", 1.0 - p_under_xdot5(lam_cards, 3.5)))
    cands.append(("Más de 4.5", 1.0 - p_under_xdot5(lam_cards, 4.5)))
    if lam_cards <= 4.8: cands.sort(key=lambda x: (("Menos" not in x[0]), -x[1]))
    else: cands.sort(key=lambda x: (("Más" not in x[0]), -x[1]))
    for sel, p in cands:
        if p >= 0.60: best_cards = (sel, p); break
    if best_cards:
        sel, p = best_cards
        picks.append(BuilderLegOut(market="Tarjetas", selection=sel, prob_pct=round(p*100,2)))

    if len(picks) > 3: picks.sort(key=lambda x: x.prob_pct, reverse=True); picks = picks[:3]

    probs01 = [min(0.99, max(0.01, p.prob_pct/100.0)) for p in picks]
    prod = 1.0; [prod := prod * p for p in probs01]
    k = len(probs01); prod_adj = prod * (0.92 ** max(0, k-1))
    
    has_over = any(p.market=="Goles" and "Más de 2.5" in p.selection for p in picks)
    has_btts = any(p.market=="BTTS" and "Sí" in p.selection for p in picks)
    has_1x2  = any(p.market in ("Ganador","Doble oportunidad") for p in picks)
    if has_over and has_btts: prod_adj *= 0.88
    if has_1x2 and has_over: prod_adj *= 0.95
    prod_adj = clamp01(prod_adj)
    combo_pct = round(prod_adj * 100.0, 2)
    fair_odds = float("inf") if prod_adj <= 0 else round(1.0 / prod_adj, 2)
    nice = ", ".join([f"{p.market}: {p.selection}" for p in picks]) or "—"
    summary = (f"Selección combinada para {inp.home_team} vs {inp.away_team}: {combo_pct}% (cuota justa {fair_odds}). {nice}")
    return BuilderOut(legs=picks, combo_prob_pct=combo_pct, summary=summary, debug=None)

@app.post("/iaboot/predict", response_model=IABootOut)
def iaboot_predict(inp: PredictIn, request: Request):
    check_premium(inp.premium_key, request)
    if not IABOOT_ON: raise HTTPException(status_code=503, detail="IABoot está desactivado")
    pred = predict_sync(inp)
    store = LEAGUES.get(inp.league)
    form_text = _recent_form_snippet(store, inp.home_team, inp.away_team, n=6) if store else ""
    sys, user = _iaboot_messages(pred, inp.odds, form_text); schema = _iaboot_schema()
    try: resp = _call_openai_structured(model=IABOOT_MODEL, temperature=IABOOT_TEMPERATURE, schema=schema, messages=[{"role":"system","content":sys}, {"role":"user","content":str(user)}],)
    except Exception as e:
        return IABootOut(match=f"{pred.home_team} vs {pred.away_team}", league=pred.league, summary="Servicio IA no disponible. Se muestra el mejor pick del modelo base.", picks=[IABootLeg(market=pred.best_pick.market, selection=("Gana local" if pred.best_pick.selection=="1" else "Gana visitante" if pred.best_pick.selection=="2" else "Empate" if pred.best_pick.selection=="X" else pred.best_pick.selection), prob_pct=pred.best_pick.prob_pct, confidence=pred.best_pick.confidence, rationale="Basado en Poisson calibrado y blend con mercado.",)],)
    txt = ""
    if resp.choices and resp.choices[0].message.content: txt = resp.choices[0].message.content
    try: payload = json.loads(txt)
    except Exception as e:
        raise ValueError("AI returned non-parseable JSON.")
    home_name, away_name = pred.home_team, pred.away_team; picks = []
    for p in (payload.get("picks") or []):
        raw_mkt, raw_sel = p.get("market",""), p.get("selection","")
        market_c, sel_c, ui_market, ui_selection = _canon_market_selection(raw_mkt, raw_sel, home_name, away_name)
        if market_c == "1X2":
            if sel_c == "1": p_base = float(pred.probs.get("home_win_pct", 0.0))
            elif sel_c == "2": p_base = float(pred.probs.get("away_win_pct", 0.0))
            else: p_base = float(pred.probs.get("draw_pct", 0.0))
        elif market_c == "Over 2.5": p_base = float(pred.probs.get("over_2_5_pct", 0.0))
        elif market_c == "UNDER_2_5": p_base = 100.0 - float(pred.probs.get("over_2_5_pct", 0.0))
        else:
            if sel_c == "Sí": p_base = float(pred.probs.get("btts_pct", 0.0))
            else: p_base = 100.0 - float(pred.probs.get("btts_pct", 0.0))
        try: p_pct_ia = float(p.get("prob_pct") or 0.0)
        except Exception: p_pct_ia = 0.0
        p_final = p_pct_ia if p_pct_ia >= 0.01 else p_base
        try: conf_ia = float(p.get("confidence") or 0.0)
        except Exception: conf_ia = 0.0
        conf_final = conf_ia if conf_ia >= 0.01 else max(0.0, min(100.0, abs(p_final - 50.0) * 2.0))
        picks.append(IABootLeg(market=ui_market, selection=ui_selection, prob_pct=round(p_final, 2), confidence=round(conf_final, 2), rationale=p.get("rationale",""),))
    return IABootOut(match=payload.get("match", f"{pred.home_team} vs {pred.away_team}"), league=payload.get("league", pred.league), summary=payload.get("summary", ""), picks=picks[:5],)

@app.post("/iaboot/suggest", response_model=IABootOut)
def iaboot_suggest(inp: PredictIn, request: Request): return iaboot_predict(inp, request)

@app.post("/history/log")
def history_log(item: HistoryLogIn):
    ts = item.ts or int(time.time()); conn = _db()
    conn.execute("""INSERT INTO history(ts, league, home, away, market, selection, prob_pct, odd, stake) VALUES (?,?,?,?,?,?,?,?,?)""", (ts, item.league, item.home, item.away, item.market, item.selection, item.prob_pct, item.odd, item.stake))
    conn.commit(); conn.close()
    return {"ok": True}

@app.get("/history/list")
def history_list(limit: int = 50):
    conn = _db(); rows = conn.execute("SELECT id, ts, league, home, away, market, selection, prob_pct, odd, stake, result FROM history ORDER BY ts DESC LIMIT ?", (limit,)).fetchall()
    conn.close(); out = [dict(r) for r in rows]; return {"items": out}

class ValuePickIn(BaseModel):
    league: str; home_team: str; away_team: str
    odds: Optional[Dict[str, float]] = None; premium_key: Optional[str] = None
@app.post("/alerts/value-pick")
def alerts_value_pick(inp: ValuePickIn, request: Request):
    pred = predict_sync(PredictIn(league=inp.league, home_team=inp.home_team, away_team=inp.away_team, odds=inp.odds))
    used_odd = _leg_used_odd_for_pick(pred, inp.odds) if inp.odds else None
    p = (pred.best_pick.prob_pct or 0.0) / 100.0
    edge = (p * used_odd - 1.0) if (used_odd and used_odd > 1.0) else None
    qualifies = (edge is not None and edge >= 0.02)
    return {"ok": True, "qualifies": qualifies, "edge": round(edge, 4) if edge is not None else None}

@app.get("/__routes__")
def list_routes():
    items = [];
    for r in app.routes:
        methods = getattr(r, "methods", None)
        if methods: items.append({"path": r.path, "methods": sorted(list(methods))})
    return sorted(items, key=lambda x: x["path"])