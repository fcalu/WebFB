import os, sys, time, glob, math, re, secrets, sqlite3
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timezone, timedelta

# === terceros ===
import numpy as np
import pandas as pd
from scipy.stats import poisson
from fastapi import FastAPI, HTTPException, Request, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, JSONResponse
from pydantic import BaseModel, Field
import requests
from openai import OpenAI
from tenacity import retry, wait_exponential, stop_after_attempt
from fastapi import FastAPI, HTTPException, Query

# Asumiendo que 'top_matches_payload' existe
try:
    from top_matches import top_matches_payload
except ImportError:
    def top_matches_payload(date: Optional[str] = None):
        """
        Obtiene los partidos principales y sus cuotas (si están disponibles) de ESPN.
        Usa el endpoint de Soccer Scoreboard para la fecha actual o especificada.
        """
        target_date = date if date else datetime.now(timezone.utc).strftime("%Y%m%d")
        
        # Usamos el endpoint de soccer/all para obtener todas las ligas disponibles para ese día
        # y así replicar el comportamiento que tenía tu frontend.
        ESPN_URL = f"http://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?dates={target_date}"
        
        try:
            response = requests.get(ESPN_URL, timeout=10)
            response.raise_for_status()
            data = response.json()
        except requests.exceptions.RequestException as e:
            # En caso de error de conexión o API, devolvemos un stub
            return {
                "matches": [],
                "date": target_date,
                "warning": f"Error al cargar ESPN API: {e}",
            }

        matches_out = []
        
        # La estructura de la respuesta de ESPN es compleja (unidades -> eventos)
        for event_container in data.get("events", []):
            event = event_container.get("competitions", [{}])[0]
            
            # --- MEJORA EN LA EXTRACCIÓN DE LIGA ---
            league_name = event.get("league", {}).get("name") 
            if not league_name:
                # Fallback al slug de temporada, ej: '2025-26-laliga' -> LaLiga
                slug = event_container.get("season", {}).get("slug", "")
                if slug:
                    league_name = slug.split("-")[-1].replace('laliga', 'La Liga').replace('premierleague', 'Premier League').title()
                else:
                    league_name = "Desconocida"
            # ---------------------------------------

            # Filtramos solo eventos que tengan al menos dos competidores definidos
            if len(event.get("competitors", [])) < 2: continue

            # Nombres de equipos
            # El equipo local (home) es siempre competitors[0] y visitante (away) es competitors[1]
            # Usamos .get("team", {}).get("displayName", ...) si está disponible, si no, .get("name")
            home_team_data = event["competitors"][0].get("team", {})
            away_team_data = event["competitors"][1].get("team", {})

            home_team = home_team_data.get("displayName", home_team_data.get("name", "N/A"))
            away_team = away_team_data.get("displayName", away_team_data.get("name", "N/A"))

            # Cuotas (Odds) - Asumimos que están en el primer pronóstico de apuestas
            odds_raw = {}
            odds_list = event.get("odds", [])
            if odds_list:
                provider = odds_list[0]
                # Mapeo de ESPN a tus claves (1, X, 2)
                for selection in provider.get("spreads", []) + provider.get("moneyline", []):
                    label = selection.get("label", "")
                    if label == "1": odds_raw["1"] = selection.get("value")
                    elif label == "X": odds_raw["X"] = selection.get("value")
                    elif label == "2": odds_raw["2"] = selection.get("value")
                
                # Para Over/Under y BTTS tendríamos que buscar en otros endpoints o en spreads/totals, 
                # pero para mantenerlo simple y funcional con los datos que tenemos:
                # Buscamos Total Goals (O2.5/U2.5) en "totals"
                for total in provider.get("totals", []):
                    if total.get("overOdds") and total.get("underOdds"):
                        # Usamos la primera línea de total goals que encontremos, asumiendo 2.5
                        odds_raw["O2_5"] = total.get("overOdds")
                        break 
                
            matches_out.append({
                "league": league_name,
                "home_team": home_team,
                "away_team": away_team,
                "date": event.get("date"),
                "odds": odds_raw if len(odds_raw) > 0 else None,
            })

        return {
            "matches": matches_out[:8], # Limitar a 8 como en tu stub original
            "date": target_date,
            "warning": None,
        }

# === sklearn (opcional) ===
try:
    from sklearn.linear_model import LogisticRegression
    SKLEARN_OK = True
except Exception:
    SKLEARN_OK = False


# --- CONFIGURACIÓN GLOBAL ---
DOMAIN = os.getenv("RENDER_EXTERNAL_URL", "http://localhost:8000")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# --------------------------------------------------------------------------------------
# Feature flags y parámetros
# --------------------------------------------------------------------------------------
USE_DIXON_COLES 	  = os.getenv("USE_DIXON_COLES", "0") == "1"
DC_RHO 	 	     = float(os.getenv("DC_RHO", "0.10"))
USE_CALIBRATION 	  = os.getenv("USE_CALIBRATION", "0") == "1"
MARKET_WEIGHT 	 	= float(os.getenv("MARKET_WEIGHT", "0.35"))
USE_CACHED_RATINGS 	= os.getenv("USE_CACHED_RATINGS", "1") == "1"
CACHE_TTL_SECONDS 	= int(os.getenv("CACHE_TTL_SECONDS", "600"))
EXPOSE_DEBUG 	 	 = os.getenv("EXPOSE_DEBUG", "0") == "1"
# === IA Boot flags ===
IABOOT_ON = os.getenv("IABOOT_ON", "0") == "1"
IABOOT_MODEL = os.getenv("IABOOT_MODEL", "gpt-4o")
IABOOT_TEMPERATURE = float(os.getenv("IABOOT_TEMPERATURE", "0.5"))

# --------------------------------------------------------------------------------------
# Configuración básica
# --------------------------------------------------------------------------------------
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
POISSON_MAX_GOALS = 7

# Inicialización de OpenAI (Asegúrate de tener la variable OPENAI_API_KEY configurada)
try:
    _openai_client = OpenAI()
except Exception:
    _openai_client = None

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
# Lógica de Validación PREMIUM (SIMPLIFICADA / ELIMINADA)
# --------------------------------------------------------------------------------------
def check_premium(key: Optional[str], request: Optional[Request] = None):
    return True

# Funciones de utilidades generales
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

# Funciones de Poisson y Dixon-Coles
def poisson_matrix(lh: float, la: float, kmax: int = POISSON_MAX_GOALS) -> np.ndarray:
    """Matriz (kmax+1 x kmax+1) de probabilidades de marcador i-j."""
    i = np.arange(0, kmax + 1)
    j = np.arange(0, kmax + 1)
    ph = poisson.pmf(i, lh).reshape(-1, 1)
    pa = poisson.pmf(j, la).reshape(1, -1)
    M = ph @ pa
    M = M / M.sum()
    return M
def p_over_xdot5(lam: float, xdot5: float) -> float:
    """P(X >= floor(xdot5)+1) con X~Poisson(lam). Ej: xdot5=7.5 -> >=8."""
    kmin = int(math.floor(xdot5)) + 1
    return float(1.0 - poisson.cdf(kmin - 1, lam))

def p_under_xdot5(lam: float, xdot5: float) -> float:
    """P(X <= floor(xdot5)) con X~Poisson(lam). Ej: xdot5=4.5 -> <=4."""
    kmax = int(math.floor(xdot5))
    return float(poisson.cdf(kmax, lam))


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
    home = float(np.tril(M, -1).sum()) 		# i > j
    draw = float(np.trace(M)) 			# i == j
    away = float(np.triu(M, 1).sum()) 			# i < j
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

# Clases y Lógica de LeagueStore y Calibración
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
        y_o25 	= []
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

# ---------- Historial (SQLite) ----------
DB_PATH = os.path.join(os.path.dirname(__file__), "history.db")

def _db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = _db()
    cur = conn.cursor()
    # 📝 IMPORTANTE: Se asegura que la columna total_goals_proj exista
    cur.execute("""
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER,
      league TEXT,
      home TEXT,
      away TEXT,
      market TEXT,
      selection TEXT,
      prob_pct REAL,
      odd REAL,
      stake REAL,
      result TEXT DEFAULT 'pending',
      total_goals_proj REAL DEFAULT NULL 
    )
    """)
    conn.commit()
    conn.close()

init_db()

# ELIMINADO: init_premium_db, premium_upsert, premium_find_by_key, premium_find_or_create_for_customer, _derive_cpe_from_sub

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
    odds: Optional[Dict[str, float]] = None
    expert: bool = False
    premium_key: Optional[str] = None # Se mantiene por compatibilidad del endpoint IABoot/Parlay


class BestPick(BaseModel):
    market: str
    selection: str
    prob_pct: float
    confidence: float
    reasons: List[str]

# 🚀 INICIO MEJORA: Evaluación de Rendimiento de Goles
class PredictOut(BaseModel):
    league: str
    home_team: str
    away_team: str
    probs: Dict[str, float]
    poisson: Dict[str, object]
    averages: Dict[str, float]
    best_pick: BestPick
    # MEJORA: Añadido el campo de proyección total de goles
    total_goals_proj: float
    summary: str
    debug: Optional[Dict[str, object]] = None
# 🚀 FIN MEJORA: Evaluación de Rendimiento de Goles


class ParlayLegIn(BaseModel):
    league: str
    home_team: str
    away_team: str
    odds: Optional[Dict[str, float]] = None

class ParlayIn(BaseModel):
    legs: List[ParlayLegIn] = Field(default_factory=list)
    mode: Optional[str] = "value"
    premium_key: Optional[str] = None # Se mantiene por compatibilidad

class ParlayLegOut(BaseModel):
    league: str
    home_team: str
    away_team: str
    pick: BestPick
    probs: Dict[str, float]
    used_odd: Optional[float] = None
    fair_prob_pct: float
    ev: Optional[float] = None

class ParlayOut(BaseModel):
    legs: List[ParlayLegOut]
    combined_prob_pct: float
    combined_fair_odds: float
    combined_used_odds: Optional[float] = None
    combined_ev: Optional[float] = None
    summary: str
    premium: bool = False # Cambiado a False

class BuilderIn(BaseModel):
    league: str
    home_team: str
    away_team: str
    odds: Optional[Dict[str, float]] = None
    premium_key: Optional[str] = None # Se mantiene por compatibilidad

class BuilderLegOut(BaseModel):
    market: str
    selection: str
    prob_pct: float

class BuilderOut(BaseModel):
    legs: List[BuilderLegOut]
    combo_prob_pct: float
    summary: str
    debug: Optional[Dict[str, float]] = None

# ELIMINADO: CheckoutIn

# ===== IA Boot (salida estructurada) =====
class IABootLeg(BaseModel):
    market: str
    selection: str
    prob_pct: float
    confidence: float
    rationale: str

class IABootOut(BaseModel):
    match: str
    league: str
    summary: str
    picks: List[IABootLeg]

# 🚀 INICIO MEJORA: Evaluación de Rendimiento de Goles
class EvaluationOut(BaseModel):
    home_team: str
    away_team: str
    real_score: str
    total_goals_real: int
    
    pick_model: str
    line_book: str
    projection_model: float
    
    ats_covered: bool
    error_abs: float
    direction_correct: bool
    precision_rating: str
    conclusion: str
# 🚀 FIN MEJORA: Evaluación de Rendimiento de Goles


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
        # 🚀 MEJORA: Se añade el valor proyectado
        total_goals_proj=base["total_goals_proj"],
        summary=base["summary"],
        debug=base.get("debug") if (inp.expert or EXPOSE_DEBUG) else None,
    )

@retry(wait=wait_exponential(multiplier=1, min=1, max=8), stop=stop_after_attempt(3))
def _call_openai_structured(model: str, temperature: float, schema: dict, messages: list[dict]):
    if not _openai_client:
        raise HTTPException(status_code=500, detail="OpenAI client not initialized.")
    # El método correcto es chat.completions.create
    return _openai_client.chat.completions.create(
        model=model,
        temperature=temperature,
        # Usaremos el formato JSON estándar
        response_format={"type": "json_object"},
        messages=messages,
        max_tokens=800,
    )

# --------------------------------------------------------------------------------------
# ENDPOINTS DE CHECKOUT / BILLING (ELIMINADOS)
# --------------------------------------------------------------------------------------
@app.get("/top-matches")
def top_matches(date: str | None = Query(default=None)):
    try:
        # Asumiendo que 'top_matches_payload' es una función de utilidades externa
        # que no depende de la lógica de pagos.
        return top_matches_payload(date)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --------------------------------------------------------------------------------------
# ENDPOINT PARLAY (CON ELIMINACIÓN DE GATEO)
# --------------------------------------------------------------------------------------
@app.post("/parlay/suggest", response_model=ParlayOut)
def parlay_suggest(inp: ParlayIn, request: Request):
    # --- PASO 1: ELIMINAR EL GATEO PREMIUM ---
    # check_premium(inp.premium_key, request) # ELIMINADO
    # ----------------------------------------
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
        premium=False, # Ahora es siempre False
    )

# NÚCLEO DE PREDICCIÓN (Se mantiene)
def confidence_from_prob(prob_pct: float) -> float:
    """ Devuelve una 'confianza' 0..100 a partir de qué tan lejos está de 50%. """
    try:
        p = float(prob_pct)
    except Exception:
        p = 50.0
    return max(0.0, min(100.0, abs(p - 50.0) * 2.0))

def _choose_best_pick(probs_pct: Dict[str, float], odds: Optional[Dict[str, float]]) -> BestPick:
    """ Selecciona el mejor pick (lógica completa). """
    # Candidatos
    cands = []
    # 1X2
    for k_sel, label in (("1","1"), ("X","X"), ("2","2")):
        p01 = (probs_pct["home_win_pct" if k_sel=="1" else "draw_pct" if k_sel=="X" else "away_win_pct"])/100.0
        odd = float(odds.get(k_sel)) if odds and odds.get(k_sel) else None
        ev = (p01 * odd - 1.0) if (odd and odd > 1.0) else None
        cands.append(("1X2", label, p01*100.0, ev))
    # Over 2.5 (Sí)
    p_o = probs_pct.get("over_2_5_pct", 0.0)/100.0
    odd_o = float(odds.get("O2_5")) if odds and odds.get("O2_5") else None
    ev_o = (p_o * odd_o - 1.0) if (odd_o and odd_o > 1.0) else None
    cands.append(("Over 2.5", "Sí", p_o*100.0, ev_o))
    # BTTS (Sí)
    p_b = probs_pct.get("btts_pct", 0.0)/100.0
    odd_b = float(odds.get("BTTS_YES")) if odds and odds.get("BTTS_YES") else None
    ev_b = (p_b * odd_b - 1.0) if (odd_b and odd_b > 1.0) else None
    cands.append(("BTTS", "Sí", p_b*100.0, ev_b))

    # Con cuotas -> prioriza mayor EV; sin cuotas -> mayor prob
    any_odds = odds and any(odds.get(k) for k in ("1","X","2","O2_5","BTTS_YES"))
    if any_odds:
        if all(ev is None for _,_,_,ev in cands):
            best = max(cands, key=lambda x: x[2]) 	# por prob
        else:
            best = max(cands, key=lambda x: (x[3] if x[3] is not None else -1e9))
    else:
        best = max(cands, key=lambda x: x[2])

    market, selection, prob_pct, _ = best
    conf = confidence_from_prob(prob_pct)
    reasons = []
    if market == "1X2": reasons.append("Selección 1X2 con mayor expectativa del modelo.")
    elif market == "Over 2.5": reasons.append("Alta suma esperada de goles según Poisson.")
    elif market == "BTTS": reasons.append("Ambos equipos con tasas ofensivas apreciables.")

    return BestPick(
        market=market,
        selection=selection,
        prob_pct=round(prob_pct, 2),
        confidence=round(conf, 2),
        reasons=reasons
    )

def predict_core(store: "LeagueStore", home: str, away: str, odds: Optional[Dict[str, float]]) -> dict:
    # 1) Lambdas
    lam_h, lam_a = store.get_lambda_pair(home, away)

    # 2) Matriz Poisson (+ DC suave si procede)
    M = poisson_matrix(lam_h, lam_a, kmax=POISSON_MAX_GOALS)
    if USE_DIXON_COLES:
        M = dixon_coles_soft(M, store.dc_rho)

    # 3) Agregación de mercados base
    agg = matrix_1x2_o25_btts(M)
    p1, px, p2 = agg["home_win_pct"]/100.0, agg["draw_pct"]/100.0, agg["away_win_pct"]/100.0
    po, pb = agg["over_2_5_pct"]/100.0, agg["btts_pct"]/100.0

    # 4) Calibración (si existe)
    if store.cal_1x2:
        p1, px, p2 = store.cal_1x2(p1, px, p2)
    if store.cal_o25:
        po = store.cal_o25(po)
    if store.cal_btts:
        pb = store.cal_btts(pb)

    # 5) Blend con mercado (si hay cuotas)
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

    # 6) Empaquetar probabilidades finales (%)
    probs_pct = {
        "home_win_pct": round(p1*100.0, 2),
        "draw_pct": round(px*100.0, 2),
        "away_win_pct": round(p2*100.0, 2),
        "over_2_5_pct": round(po*100.0, 2),
        "btts_pct": round(pb*100.0, 2),
        "top_scorelines": agg["top_scorelines"], 	# útil para debug
    }

    # 7) Medias adicionales (córners/tarjetas)
    avgs = store.get_additional_avgs(home, away)
    # tu UI espera corners_mlp_pred; usa la media como proxy si no hay MLP
    avgs_out = {
        "total_corners_avg": round(avgs.get("total_corners_avg", 0.0), 2),
        "total_yellow_cards_avg": round(avgs.get("total_yellow_cards_avg", 0.0), 2),
        "corners_mlp_pred": round(avgs.get("total_corners_avg", 0.0), 2),
    }

    # 8) Mejor pick
    best = _choose_best_pick(probs_pct, odds)
    
    # 🚀 INICIO MEJORA: Cálculo de goles totales proyectados
    total_goals_proj = round(lam_h + lam_a, 4)
    # 🚀 FIN MEJORA: Cálculo de goles totales proyectados

    # 9) Resumen cortito
    summary = (
        f"{home} vs {away}: Local {probs_pct['home_win_pct']}% · "
        f"Empate {probs_pct['draw_pct']}% · Visitante {probs_pct['away_win_pct']}% · "
        f"Over2.5 {probs_pct['over_2_5_pct']}% · BTTS {probs_pct['btts_pct']}%."
    )

    # 10) Salida base para predict_sync
    return {
        "probs": {
            "home_win_pct": probs_pct["home_win_pct"],
            "draw_pct": probs_pct["draw_pct"],
            "away_win_pct": probs_pct["away_win_pct"],
            "over_2_5_pct": probs_pct["over_2_5_pct"],
            "btts_pct": probs_pct["btts_pct"],
        },
        "poisson": {
            "home_lambda": round(lam_h, 4),
            "away_lambda": round(lam_a, 4),
            "top_scorelines": probs_pct["top_scorelines"],
        },
        "averages": avgs_out,
        "best_pick": best,
        "total_goals_proj": total_goals_proj, # 🚀 MEJORA: Añadido el campo
        "summary": summary,
        "debug": {
            "used_dixon_coles": bool(USE_DIXON_COLES),
            "market_implied": implied if implied else None,
        },
    }

# (Opcional) helpers para IABoot (Se mantienen)
def _canon_market_selection(mkt: str, sel: str, home_name: str, away_name: str) -> tuple[str, str, str, str]:
    mkt = mkt.lower().strip()
    sel = sel.lower().strip()

    ui_mkt = mkt
    ui_sel = sel

    if "1x2" in mkt or "ganador" in mkt:
        canon_mkt = "1X2"
        if sel in ("1", "local", home_name.lower()):
            canon_sel = "1"; ui_sel = "1"
        elif sel in ("2", "visitante", away_name.lower()):
            canon_sel = "2"; ui_sel = "2"
        else:
            canon_sel = "X"; ui_sel = "X"
        ui_mkt = "1X2"
    elif "over" in mkt or "más de" in mkt:
        canon_mkt = "Over 2.5"
        canon_sel = "Sí"
        ui_mkt = "Over 2.5"
        ui_sel = "Sí"
    elif "under" in mkt or "menos de" in mkt:
        canon_mkt = "UNDER_2_5"
        canon_sel = "No"
        ui_mkt = "Under 2.5"
        ui_sel = "No"
    elif "btts" in mkt or "ambos" in mkt:
        canon_mkt = "BTTS"
        if sel in ("sí", "si", "yes"):
            canon_sel = "Sí"; ui_sel = "Sí"
        else:
            canon_sel = "No"; ui_sel = "No"
        ui_mkt = "BTTS"
    else:
        # Fallback to 1X2 1
        canon_mkt = "1X2"
        canon_sel = "1"
        ui_mkt = mkt
        ui_sel = sel
    
    return canon_mkt, canon_sel, ui_mkt, ui_sel


def _recent_form_snippet(store: "LeagueStore", home: str, away: str, n: int = 6) -> str:
    # Stub sencillo; si quieres, puedes enriquecer con rachas reales desde store.df
    return ""

def _iaboot_schema() -> dict:
    return {
        "name": "iaboot_schema",
        "schema": {
            "type": "object",
            "properties": {
                "match": 	{"type": "string"},
                "league": {"type": "string"},
                "summary":{"type": "string"},
                "picks": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 3,
                    "items": {
                        "type": "object",
                        "properties": {
                            "market": {
                                "type": "string",
                                "enum": ["1X2", "Over 2.5", "UNDER_2_5", "BTTS"]
                            },
                            "selection": {
                                "type": "string",
                                "enum": ["1","X","2","Sí","No"]
                            },
                            "prob_pct": 	{"type": "number", "minimum": 0, "maximum": 100},
                            "confidence": {"type": "number", "minimum": 0, "maximum": 100},
                            "rationale": 	{"type": "string"}
                        },
                        "required": ["market","selection","prob_pct","confidence"]
                    }
                }
            },
            "required": ["picks","match","league"]
        }
    }
def _iaboot_messages(pred: PredictOut, odds: dict | None, form_text: str) -> tuple[str, str]:
    sys_msg = (
        "Eres un analista profesional de apuestas deportivas que transforma métricas de un "
        "modelo estadístico (Poisson calibrado + blend con mercado) en picks accionables.\n"
        "REGLAS:\n"
        "1) Mercados permitidos: '1X2','Over 2.5','UNDER_2_5','BTTS' con selecciones válidas.\n"
        "2) No inventes probabilidades; usa las del modelo.\n"
        "3) Si hay cuotas, prioriza EV≈p*cuota−1; si no, probabilidad base.\n"
        "4) Máximo 3 picks, evita correlaciones fuertes.\n"
        "5) Cada pick: market, selection, prob_pct, confidence, rationale (1–2 frases con datos).\n"
        "6) Tono profesional y sin promesas.\n"
        "7) SALIDA: SOLO JSON con match, league, summary, picks[].\n"
    )
    odds_text = str(odds) if odds else "N/A"
    top = pred.poisson.get("top_scorelines") or []
    user_msg = (
        f"Partido: {pred.home_team} vs {pred.away_team} en {pred.league}.\n"
        f"Probabilidades del modelo (%%):\n"
        f"- 1: {pred.probs['home_win_pct']} 	X: {pred.probs['draw_pct']} 	2: {pred.probs['away_win_pct']}\n"
        f"- Over 2.5: {pred.probs['over_2_5_pct']}\n"
        f"- BTTS Sí: {pred.probs['btts_pct']}\n\n"
        f"Lambdas Poisson: local={pred.poisson.get('home_lambda')} 	visitante={pred.poisson.get('away_lambda')}\n"
        f"Marcadores más probables (top-5): {top}\n"
        f"Cuotas (si hay): {odds_text}\n"
        f"Contexto breve: {form_text or 'N/A'}\n\n"
        "Instrucciones:\n"
        "- Si hay cuotas, estima EV≈p*cuota−1 y ordena por EV>0. Si no hay EV positivo, usa probabilidad base.\n"
        "- Evita picks fuertemente correlacionados. Máx. 3.\n"
        "- 'confidence' puede basarse en distancia a 50%% y coherencia con lambdas/cuotas.\n"
        "Devuelve SOLO el JSON.\n"
    )
    return sys_msg, user_msg

# --------------------------------------------------------------------------------------
# ENDPOINT BUILDER (CON ELIMINACIÓN DE GATEO)
# --------------------------------------------------------------------------------------
@app.post("/builder/suggest", response_model=BuilderOut)
def builder_suggest(inp: BuilderIn, request: Request):
    # --- PASO 1: ELIMINAR EL GATEO PREMIUM ---
    # check_premium(inp.premium_key, request) # ELIMINADO
    # ----------------------------------------
    # Reutiliza las probabilidades ya calibradas/mezcladas del core
    pred = predict_sync(PredictIn(
        league=inp.league, home_team=inp.home_team, away_team=inp.away_team, odds=inp.odds
    ))

    # --- Probabilidades ya blendeadas ---
    p1 	= pred.probs["home_win_pct"] / 100.0
    px 	= pred.probs["draw_pct"] / 100.0
    p2 	= pred.probs["away_win_pct"] / 100.0
    po25 = pred.probs["over_2_5_pct"] / 100.0
    pbtts = pred.probs["btts_pct"] / 100.0

    p1x = clamp01(p1 + px)

    # Lambdas de goles
    lam_h = float(pred.poisson.get("home_lambda", 1.1) or 1.1)
    lam_a = float(pred.poisson.get("away_lambda", 1.1) or 1.1)
    lam_sum = lam_h + lam_a

    # Medias para córners y tarjetas
    lam_corners = float(pred.averages.get("total_corners_avg", 9.0) or 9.0)
    lam_cards 	= float(pred.averages.get("total_yellow_cards_avg", 4.5) or 4.5)

    picks: List[BuilderLegOut] = []
    flags = {"has_over": False, "has_btts": False, "has_1x2": False}

    # ---- 1) 1X2/Doble oportunidad ----
    if p1 >= 0.62:
        picks.append(BuilderLegOut(market="Ganador", selection="Gana Local", prob_pct=round(p1*100,2)))
        flags["has_1x2"] = True
    elif p2 >= 0.62:
        picks.append(BuilderLegOut(market="Ganador", selection="Gana Visitante", prob_pct=round(p2*100,2)))
        flags["has_1x2"] = True
    elif p1x >= 0.58:
        picks.append(BuilderLegOut(market="Doble oportunidad", selection="1X (Local o Empate)", prob_pct=round(p1x*100,2)))
        flags["has_1x2"] = True
    # si ninguna puerta pasa, no agregamos pick 1x2

    # ---- 2) BTTS ----
    if pbtts >= 0.58 and lam_h >= 0.85 and lam_a >= 0.85:
        picks.append(BuilderLegOut(market="BTTS", selection="Sí", prob_pct=round(pbtts*100,2)))
        flags["has_btts"] = True

    # ---- 3) Goles (Over 2.5 o Under 3.5) ----
    added_goals = False
    if po25 >= 0.60 and lam_sum >= 2.5:
        picks.append(BuilderLegOut(market="Goles", selection="Más de 2.5", prob_pct=round(po25*100,2)))
        flags["has_over"] = True
        added_goals = True
    else:
        # Under 3.5 si pinta cerrado
        p_u35 = p_under_xdot5(lam_sum, 3.5) 		# <=3 goles
        if p_u35 >= 0.59 and lam_sum <= 2.4:
            picks.append(BuilderLegOut(market="Goles", selection="Menos de 3.5", prob_pct=round(p_u35*100,2)))
            added_goals = True
    # si no hay nada sólido en goles, omitimos

    # ---- 4) Córners (elige la línea MÁS alta que cruce 60%) ----
    best_corners = None
    for line in [9.5, 8.5, 7.5]: 		# probamos de alta a baja; elegimos la primera que pase
        p_over = p_over_xdot5(lam_corners, line)
        if p_over >= 0.60:
            best_corners = (line, p_over)
            break
    if best_corners:
        line, p_over = best_corners
        picks.append(BuilderLegOut(market="Córners", selection=f"Más de {line}", prob_pct=round(p_over*100,2)))

    # ---- 5) Tarjetas (preferencia: Under si λ bajo, Over si λ alto) ----
    best_cards = None
    # candidatos bajo/over típicos
    cands = []
    cands.append(("Menos de 4.5", p_under_xdot5(lam_cards, 4.5)))
    cands.append(("Menos de 5.5", p_under_xdot5(lam_cards, 5.5)))
    cands.append(("Más de 3.5", 1.0 - p_under_xdot5(lam_cards, 3.5)))
    cands.append(("Más de 4.5", 1.0 - p_under_xdot5(lam_cards, 4.5)))
    # orden preferente según λ
    if lam_cards <= 4.8:
        # under-friendly: priorizamos los under
        cands.sort(key=lambda x: (("Menos" not in x[0]), -x[1])) 	# under primero, luego prob desc
    else:
        # over-friendly
        cands.sort(key=lambda x: (("Más" not in x[0]), -x[1])) 		# over primero
    for sel, p in cands:
        if p >= 0.60:
            best_cards = (sel, p)
            break
    if best_cards:
        sel, p = best_cards
        picks.append(BuilderLegOut(market="Tarjetas", selection=sel, prob_pct=round(p*100,2)))

    # ---- Selecciona como máximo 3 picks, priorizando probabilidad ----
    if len(picks) > 3:
        picks.sort(key=lambda x: x.prob_pct, reverse=True)
        picks = picks[:3]

    # ---- Probabilidad combinada con recortes por correlación ----
    probs01 = [min(0.99, max(0.01, p.prob_pct/100.0)) for p in picks]
    prod = 1.0
    for p in probs01:
        prod *= p

    k = len(probs01)
    prod_adj = prod * (0.92 ** max(0, k-1)) 			# penalización general por múltiples

    has_over = any(p.market=="Goles" and "Más de 2.5" in p.selection for p in picks)
    has_btts = any(p.market=="BTTS" and "Sí" in p.selection for p in picks)
    has_1x2 	= any(p.market in ("Ganador","Doble oportunidad") for p in picks)

    if has_over and has_btts:
        prod_adj *= 0.88 		# correlación fuerte
    if has_1x2 and has_over:
        prod_adj *= 0.95 		# algo correlacionados

    prod_adj = clamp01(prod_adj)

    combo_pct = round(prod_adj * 100.0, 2)
    fair_odds = float("inf") if prod_adj <= 0 else round(1.0 / prod_adj, 2)

    # Resumen legible
    nice = ", ".join([f"{p.market}: {p.selection}" for p in picks]) or "—"
    summary = (f"Selección combinada para {inp.home_team} vs {inp.away_team}: "
            f"{combo_pct}% (cuota justa {fair_odds}). {nice}")

    return BuilderOut(
        legs=picks,
        combo_prob_pct=combo_pct,
        summary=summary,
        debug=None
    )

# --------------------------------------------------------------------------------------
# ENDPOINT IABOOT (CON ELIMINACIÓN DE GATEO)
# --------------------------------------------------------------------------------------
@app.post("/iaboot/predict", response_model=IABootOut)
def iaboot_predict(inp: PredictIn, request: Request):
    # --- PASO 1: ELIMINAR EL GATEO PREMIUM ---
    # check_premium(inp.premium_key, request) # ELIMINADO
    # ----------------------------------------
    if not IABOOT_ON:
        raise HTTPException(status_code=503, detail="IABoot está desactivado")

    # Reusar nuestro core híbrido (calibrado+blend):
    pred = predict_sync(inp)

    # Form reciente para contexto
    store = LEAGUES.get(inp.league)
    form_text = _recent_form_snippet(store, inp.home_team, inp.away_team, n=6) if store else ""

    # Prompt + schema
    sys, user = _iaboot_messages(pred, inp.odds, form_text)
    schema = _iaboot_schema()

    # Llamada IA (con retry/espera exponencial)
    try:
        resp = _call_openai_structured(
            model=IABOOT_MODEL,
            temperature=IABOOT_TEMPERATURE,
            schema=schema,
            messages=[{"role":"system","content":sys}, {"role":"user","content":str(user)}],
        )
    except Exception as e:
        print(f"OPENAI API CALL FAILED: {type(e).__name__}: {e}", file=sys.stderr)
        # Fallback: si algo falla, devolvemos el best_pick base
        fallback = IABootOut(
            match=f"{pred.home_team} vs {pred.away_team}",
            league=pred.league,
            summary="Servicio IA no disponible. Se muestra el mejor pick del modelo base.",
            picks=[IABootLeg(
                market=pred.best_pick.market,
                selection=("Gana local" if pred.best_pick.selection=="1"
                                else "Gana visitante" if pred.best_pick.selection=="2"
                                else "Empate" if pred.best_pick.selection=="X"
                                else pred.best_pick.selection),
                prob_pct=pred.best_pick.prob_pct,
                confidence=pred.best_pick.confidence,
                rationale="Basado en Poisson calibrado y blend con mercado.",
            )],
        )
        return fallback

    # A partir de aquí, la llamada fue HTTP 200 OK

    # Extraer el JSON del campo estándar 'content'
    txt = ""
    if resp.choices and resp.choices[0].message.content:
        txt = resp.choices[0].message.content

    try:
        import json
        payload = json.loads(txt)
    except Exception as e:
        # Si falla el JSON.loads, logueamos el texto problemático y forzamos el fallback.
        print(f"ERROR PARSING AI JSON: {e}. Raw text: {txt[:200]}...", file=sys.stderr)
        raise ValueError("AI returned non-parseable JSON.")

    # LÓGICA DE INYECCIÓN DE PORCENTAJES FALTANTES (Se mantiene)
    home_name = pred.home_team
    away_name = pred.away_team

    picks = []
    for p in (payload.get("picks") or []):
        raw_mkt = p.get("market","")
        raw_sel = p.get("selection","")

        market_c, sel_c, ui_mkt, ui_sel = _canon_market_selection(raw_mkt, raw_sel, home_name, away_name)

        # Probabilidad base del modelo
        if market_c == "1X2":
            if sel_c == "1":
                p_base = float(pred.probs.get("home_win_pct", 0.0))
            elif sel_c == "2":
                p_base = float(pred.probs.get("away_win_pct", 0.0))
            else:
                p_base = float(pred.probs.get("draw_pct", 0.0))
        elif market_c == "Over 2.5":
            p_base = float(pred.probs.get("over_2_5_pct", 0.0))
        elif market_c == "UNDER_2_5":
            p_base = 100.0 - float(pred.probs.get("over_2_5_pct", 0.0))
        else: 	# BTTS
            if sel_c == "Sí":
                p_base = float(pred.probs.get("btts_pct", 0.0))
            else:
                p_base = 100.0 - float(pred.probs.get("btts_pct", 0.0))

        # % y confianza enviados por la IA (si no hay, usamos base)
        try:
            p_pct_ia = float(p.get("prob_pct") or 0.0)
        except Exception:
            p_pct_ia = 0.0
        p_final = p_pct_ia if p_pct_ia >= 0.01 else p_base

        try:
            conf_ia = float(p.get("confidence") or 0.0)
        except Exception:
            conf_ia = 0.0
        conf_final = conf_ia if conf_ia >= 0.01 else max(0.0, min(100.0, abs(p_final - 50.0) * 2.0))

        picks.append(IABootLeg(
            market=ui_mkt,
            selection=ui_sel,
            prob_pct=round(p_final, 2),
            confidence=round(conf_final, 2),
            rationale=p.get("rationale",""),
        ))

    return IABootOut(
        match=payload.get("match", f"{pred.home_team} vs {pred.away_team}"),
        league=payload.get("league", pred.league),
        summary=payload.get("summary", ""),
        picks=picks[:5],
    )

@app.post("/iaboot/suggest", response_model=IABootOut)
def iaboot_suggest(inp: PredictIn, request: Request):
    return iaboot_predict(inp, request)

# ===== Estado Premium (ELIMINADO / Simplificado) =====
class PremiumStatusOut(BaseModel):
    active: bool
    plan: Optional[str] = None
    current_period_end: Optional[int] = None
    email: Optional[str] = None
    status: Optional[str] = None

# Función simplificada, siempre activo
@app.get("/premium/status", response_model=PremiumStatusOut)
def premium_status(
    premium_key: Optional[str] = None,
    request: Request = None,
    premium_key_hdr: Optional[str] = Header(default=None, alias="X-Premium-Key"),
):
    # Ya que se eliminó el gateo, asumimos que el servicio es FREE / siempre 'active'
    return PremiumStatusOut(active=True, plan="free", status="active")

# =========================
# RUTAS BÁSICAS PARA FRONT (Se mantienen)
# =========================
from fastapi.responses import JSONResponse
from fastapi import Header

@app.get("/", response_class=PlainTextResponse)
def root():
    return "FootyMines API online"

@app.get("/__health", response_class=PlainTextResponse)
def health():
    return "ok"

@app.get("/leagues")
def get_leagues():
    return {"leagues": sorted(LEAGUES.keys())}

@app.get("/teams")
def get_teams(league: str):
    if league not in LEAGUES:
        raise HTTPException(status_code=400, detail="Liga no encontrada")
    return {"teams": LEAGUES[league].teams}

@app.post("/predict", response_model=PredictOut)
def predict_endpoint(
    inp: PredictIn,
    request: Request,
    premium_key_hdr: Optional[str] = Header(default=None, alias="X-Premium-Key")
):
    return predict_sync(inp)

# =========================
# HISTORIAL (SQLite) (Se mantiene)
# =========================
class HistoryLogIn(BaseModel):
    ts: Optional[int] = None
    league: str
    home: str
    away: str
    market: str
    selection: str
    prob_pct: Optional[float] = None
    odd: Optional[float] = None
    stake: Optional[float] = None
    # 🚀 MEJORA: Añadido el campo de proyección total de goles
    total_goals_proj: Optional[float] = None

@app.post("/history/log")
def history_log(item: HistoryLogIn):
    ts = item.ts or int(time.time())
    conn = _db()
    # 📝 Se actualiza el INSERT para guardar el nuevo campo 'total_goals_proj'
    conn.execute(
        """INSERT INTO history(ts, league, home, away, market, selection, prob_pct, odd, stake, total_goals_proj)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (ts, item.league, item.home, item.away, item.market, item.selection,
         item.prob_pct, item.odd, item.stake, item.total_goals_proj)
    )
    conn.commit(); conn.close()
    return {"ok": True}

@app.get("/history/list")
def history_list(limit: int = 50):
    conn = _db()
    rows = conn.execute(
        "SELECT id, ts, league, home, away, market, selection, prob_pct, odd, stake, result, total_goals_proj "
        "FROM history ORDER BY ts DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    out = [dict(r) for r in rows]
    return {"items": out}

# =========================
# ALERTAS (stub amigable) (Se mantiene, sin gateo)
# =========================
class ValuePickIn(BaseModel):
    league: str
    home_team: str
    away_team: str
    odds: Optional[Dict[str, float]] = None
    premium_key: Optional[str] = None

@app.post("/alerts/value-pick")
def alerts_value_pick(inp: ValuePickIn, request: Request):
    # Calcula si sería un value pick
    pred = predict_sync(PredictIn(
        league=inp.league, home_team=inp.home_team, away_team=inp.away_team, odds=inp.odds
    ))
    used_odd = _leg_used_odd_for_pick(pred, inp.odds) if inp.odds else None
    p = (pred.best_pick.prob_pct or 0.0) / 100.0
    edge = (p * used_odd - 1.0) if (used_odd and used_odd > 1.0) else None
    qualifies = (edge is not None and edge >= 0.02) 	# umbral 2% de valor esperado

    # Aquí podrías integrar Telegram/email si qualifies == True
    return {"ok": True, "qualifies": qualifies, "edge": round(edge, 4) if edge is not None else None}


# =========================
# UTILIDAD: listar rutas (Se mantiene)
# =========================
@app.get("/__routes__")
def list_routes():
    items = []
    for r in app.routes:
        methods = getattr(r, "methods", None)
        if methods:
            items.append({"path": r.path, "methods": sorted(list(methods))})
    return sorted(items, key=lambda x: x["path"])

# 🚀 INICIO MEJORA: Endpoint de Evaluación de Rendimiento
@app.post("/evaluate/goals", response_model=EvaluationOut)
def evaluate_goals(
    league: str = Query(..., description="Liga del partido"),
    home_team: str = Query(..., description="Nombre del equipo local"),
    away_team: str = Query(..., description="Nombre del equipo visitante"),
    # === DATOS REALES ===
    real_home_goals: int = Query(..., description="Goles reales del equipo local"),
    real_away_goals: int = Query(..., description="Goles reales del equipo visitante"),
    # === DATOS DEL MODELO REQUERIDOS ===
    proj_total_goals: float = Query(..., description="Proyección Total de Goles del modelo (ej: 3.1)"),
    pick_market: str = Query(..., description="Pick del modelo para el mercado (ej: Over 2.5)"),
    line_book: float = Query(2.5, description="Línea de Goles de la casa de apuestas (ej: 2.5 o 3.5)"),
):
    """Evalúa la precisión del modelo de predicción de goles contra un resultado real."""
    
    total_goals_real = real_home_goals + real_away_goals
    real_score = f"{real_home_goals}-{real_away_goals}"
    
    # 1. Error Absoluto
    error_abs = abs(proj_total_goals - total_goals_real)
    
    # 2. Resultado ATS (Against The Spread)
    is_over_pick = "OVER" in pick_market.upper() or "MÁS DE" in pick_market.upper()

    if is_over_pick:
        ats_covered = (total_goals_real > line_book)
        ats_pick_text = f"Over {line_book}"
    else:
        ats_covered = (total_goals_real < line_book)
        ats_pick_text = f"Under {line_book}"
        
    # 3. Dirección Correcta (acertar en el Pick del modelo)
    direction_correct = ats_covered
    
    # 4. Precisión y Conclusión
    if error_abs <= 0.3:
        precision = "Altísima"
        conclusion = "El modelo demostró una precisión excepcional (Error Absoluto < 0.3), con una proyección virtualmente perfecta."
    elif error_abs <= 1.0 and direction_correct:
        precision = "Media-Alta"
        conclusion = f"El modelo acertó en la dirección ({ats_pick_text}) con un error aceptable (Error Absoluto <= 1.0), validando el Pick."
    elif direction_correct:
        precision = "Media"
        conclusion = f"El modelo acertó la dirección ({ats_pick_text}), pero subestimó/sobreestimó el total de goles significativamente (Error Absoluto > 1.0)."
    else:
        precision = "Baja"
        conclusion = "El modelo falló en la dirección principal (Over/Under) del mercado, lo que indica una desviación significativa en las lambdas proyectadas."


    return EvaluationOut(
        home_team=home_team,
        away_team=away_team,
        real_score=real_score,
        total_goals_real=total_goals_real,
        
        pick_model=ats_pick_text,
        line_book=f"Over/Under {line_book}",
        projection_model=round(proj_total_goals, 2),
        
        ats_covered=ats_covered,
        error_abs=round(error_abs, 2),
        direction_correct=direction_correct,
        precision_rating=precision,
        conclusion=conclusion
    )
# 🚀 FIN MEJORA: Endpoint de Evaluación de Rendimiento