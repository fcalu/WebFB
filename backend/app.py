import os, glob, re
from typing import Dict, List, Optional, Tuple, Any

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from scipy.stats import poisson

# ========================= Config =========================
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
POISSON_MAX_GOALS = 7

# Priors / pesos
PRIOR_STRENGTH_1X2 = 6.0      # Dirichlet total para 1X2
PRIOR_STRENGTH_O25 = 6.0      # Beta total para Over 2.5
PRIOR_STRENGTH_BTTS = 6.0     # Beta total para BTTS
NEFF_MIN, NEFF_MAX = 8, 40    # rango de n_eff para mezclar con el modelo

# Pesos para λ (suman 1.0)
W_LAMBDA = {
    "league": 0.15,     # media liga
    "team_for": 0.30,   # GF del equipo (home/away)
    "opp_against": 0.25,# GC del rival (away/home)
    "xg": 0.20,         # xG pre-partido (prom. equipo)
    "ppg": 0.10,        # delta PPG pre-partido -> goles
}

# Factores para convertir diferencia PPG a gol esperado (~0.25 gol por punto)
PPG_TO_GOALS = 0.25

# ========================= App & CORS ======================
app = FastAPI(title="FootyMines API (Poisson + Bayes con xG/PPG/porcentajes)")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

# ========================= Utilidades ======================
def _snake(s: str) -> str:
    s = re.sub(r"[^A-Za-z0-9]+", "_", s.strip())
    s = re.sub(r"_+", "_", s).strip("_")
    return s.lower()

def _to_float(x) -> Optional[float]:
    if x is None: return None
    try:
        if isinstance(x, str): x = x.replace(",", ".").strip()
        v = float(x)
        return v if np.isfinite(v) else None
    except Exception:
        return None

def poisson_matrix(lh: float, la: float, kmax: int = POISSON_MAX_GOALS) -> np.ndarray:
    i = np.arange(0, kmax + 1)
    j = np.arange(0, kmax + 1)
    ph = poisson.pmf(i, lh).reshape(-1, 1)
    pa = poisson.pmf(j, la).reshape(1, -1)
    M = (ph @ pa)
    return M / M.sum()

def probs_from_matrix(M: np.ndarray) -> Dict[str, float]:
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
        "home_win_pct": round(home * 100, 2),
        "draw_pct": round(draw * 100, 2),
        "away_win_pct": round(away * 100, 2),
        "over_2_5_pct": round(over25 * 100, 2),
        "btts_pct": round(btts * 100, 2),
        "top_scorelines": top,
    }

def implied_1x2(odds: Dict[str, Any]) -> Optional[Dict[str, float]]:
    o1 = _to_float(odds.get("1") or odds.get("odds_ft_home_team_win"))
    ox = _to_float(odds.get("X") or odds.get("odds_ft_draw"))
    o2 = _to_float(odds.get("2") or odds.get("odds_ft_away_team_win"))
    if not (o1 and ox and o2): return None
    inv = np.array([1.0/o1, 1.0/ox, 1.0/o2], dtype=float)
    if not np.isfinite(inv).all(): return None
    probs = inv / inv.sum()
    return {"1": float(probs[0]), "X": float(probs[1]), "2": float(probs[2])}

def implied_single(odd) -> Optional[float]:
    o = _to_float(odd)
    if not o: return None
    return float(1.0 / o)

def confidence_from_prob(p: float, nscale: float = 1.0) -> float:
    conf = max(0.0, min(1.0, abs(p - 0.5) * 2.0 * nscale))
    return round(conf * 100.0, 2)

# ========================= Carga ligas ======================
class LeagueStore:
    """
    Prepara agregados por equipo (GF/GC, xG pre, PPG pre, % pre-match) para
    construir λ y priors informativos.
    """
    def __init__(self, name: str, df_raw: pd.DataFrame):
        self.name = name
        df = df_raw.copy()

        # Renombra a snake_case para columnas complicadas
        df.columns = [_snake(c) for c in df.columns]

        # Mapas de nombres (acepta ambos si existen)
        C = {
            "home": "home_team_name",
            "away": "away_team_name",
            "gf_h": "home_team_goal_count",
            "ga_h": "away_team_goal_count",
            "gf_a": "away_team_goal_count",    # usado desde perspectiva del equipo away (GF)
            "ga_a": "home_team_goal_count",    # GC cuando es away
            "prematch_xg_h": "home_team_pre_match_xg",
            "prematch_xg_a": "away_team_pre_match_xg",
            "ppg_h": "pre_match_ppg_home",
            "ppg_a": "pre_match_ppg_away",
            "over25_pct": "over_25_percentage_pre_match",
            "btts_pct": "btts_percentage_pre_match",
            "odds1": "odds_ft_home_team_win",
            "oddsx": "odds_ft_draw",
            "odds2": "odds_ft_away_team_win",
            "odds_o25": "odds_ft_over25",
            "odds_btts_yes": "odds_btts_yes",
        }
        for v in C.values():
            if v not in df.columns:
                df[v] = np.nan

        # Convierte numéricos
        num_cols = [
            C["gf_h"], C["ga_h"], C["prematch_xg_h"], C["ppg_h"],
            C["gf_a"], C["ga_a"], C["prematch_xg_a"], C["ppg_a"],
            C["over25_pct"], C["btts_pct"],
            C["odds1"], C["oddsx"], C["odds2"], C["odds_o25"], C["odds_btts_yes"]
        ]
        for c in num_cols:
            df[c] = pd.to_numeric(df[c], errors="coerce")

        self.df = df

        # Medias de liga (goles)
        self.league_means = {
            "home_goals": float(df[C["gf_h"]].mean(skipna=True) or 1.2),
            "away_goals": float(df[C["ga_h"]].mean(skipna=True) or 1.0),
        }

        # Agregados por equipo (cuando juegan en casa / fuera)
        # Goles a favor/en contra
        home_group = df.groupby(C["home"]).agg(
            gf_h_mean=(C["gf_h"], "mean"),    # GF de local
            ga_h_mean=(C["ga_h"], "mean"),    # GC que sufren en casa (goles del rival)
            xg_h_mean=(C["prematch_xg_h"], "mean"),
            ppg_h_mean=(C["ppg_h"], "mean"),
            over25_h_mean=(C["over25_pct"], "mean"),
            btts_h_mean=(C["btts_pct"], "mean"),
        )
        away_group = df.groupby(C["away"]).agg(
            gf_a_mean=(C["gf_a"], "mean"),    # GF de visitante
            ga_a_mean=(C["ga_a"], "mean"),    # GC que sufren fuera
            xg_a_mean=(C["prematch_xg_a"], "mean"),
            ppg_a_mean=(C["ppg_a"], "mean"),
            over25_a_mean=(C["over25_pct"], "mean"),
            btts_a_mean=(C["btts_pct"], "mean"),
        )

        self.team = home_group.join(away_group, how="outer").fillna(0.0)
        self.teams = sorted(self.team.index.astype(str).tolist())

        self.cols = C

    # Numero efectivo de partidos del cruce
    def n_eff(self, home: str, away: str) -> int:
        C = self.cols
        h = int((self.df[C["home"]] == home).sum())
        a = int((self.df[C["away"]] == away).sum())
        return int(np.clip(h + a, NEFF_MIN, NEFF_MAX))

    # Construcción de lambdas con mezcla de señales
    def lambdas(self, home: str, away: str) -> Tuple[float, float, Dict[str, float]]:
        T = self.team
        C = self.cols
        means = self.league_means

        if home not in T.index or away not in T.index:
            raise KeyError("Equipo no encontrado")

        # Señales
        Lh, La = means["home_goals"], means["away_goals"]
        h_for  = float(T.loc[home, "gf_h_mean"] or Lh)
        a_agst = float(T.loc[away, "ga_a_mean"] or Lh)
        a_for  = float(T.loc[away, "gf_a_mean"] or La)
        h_agst = float(T.loc[home, "ga_h_mean"] or La)

        xg_h = float(T.loc[home, "xg_h_mean"] or Lh)
        xg_a = float(T.loc[away, "xg_a_mean"] or La)

        ppg_h = float(T.loc[home, "ppg_h_mean"] or 1.0)
        ppg_a = float(T.loc[away, "ppg_a_mean"] or 1.0)
        d_ppg = (ppg_h - ppg_a) * PPG_TO_GOALS  # en goles

        # λ final (mezcla convexa + delta ppg)
        lam_h = (W_LAMBDA["league"]*Lh + W_LAMBDA["team_for"]*h_for +
                 W_LAMBDA["opp_against"]*a_agst + W_LAMBDA["xg"]*xg_h) + W_LAMBDA["ppg"]*max(d_ppg, -0.5)
        lam_a = (W_LAMBDA["league"]*La + W_LAMBDA["team_for"]*a_for +
                 W_LAMBDA["opp_against"]*h_agst + W_LAMBDA["xg"]*xg_a) + W_LAMBDA["ppg"]*max(-d_ppg, -0.5)

        lam_h = float(max(lam_h, 0.05))
        lam_a = float(max(lam_a, 0.05))

        dbg = dict(Lh=Lh, La=La, h_for=h_for, a_agst=a_agst, a_for=a_for, h_agst=h_agst,
                   xg_h=xg_h, xg_a=xg_a, d_ppg=d_ppg, lam_h=lam_h, lam_a=lam_a)
        return lam_h, lam_a, dbg

    # Priors informativos desde porcentajes pre-match (promedio equipo local/visitante)
    def priors_pre_match(self, home: str, away: str) -> Dict[str, Optional[float]]:
        T = self.team
        over25 = None
        btts = None
        if home in T.index and away in T.index:
            o = (float(T.loc[home, "over25_h_mean"]) + float(T.loc[away, "over25_a_mean"])) / 200.0
            b = (float(T.loc[home, "btts_h_mean"]) + float(T.loc[away, "btts_a_mean"])) / 200.0
            over25 = o if np.isfinite(o) and 0.0 < o < 1.0 else None
            btts = b if np.isfinite(b) and 0.0 < b < 1.0 else None
        return {"over25": over25, "btts": btts}

# Memoria de ligas
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

# ========================= IO models ========================
class PredictIn(BaseModel):
    league: str
    home_team: str
    away_team: str
    odds: Optional[Dict[str, Any]] = None  # {"1":2.3,"X":3.1,"2":3.2,"O2_5":1.85,"BTTS_YES":1.80}

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
    poisson: Dict[str, Any]
    averages: Dict[str, float]
    best_pick: BestPick
    summary: str
    debug: Optional[Dict[str, Any]] = None

# ===================== Bayes mixing helpers ==================
def bayes_dirichlet_1x2(p_model: np.ndarray, p_mkt: Optional[Dict[str, float]], n_eff: int) -> np.ndarray:
    if p_mkt is None:  # sin mercado => el modelo manda
        return p_model
    pi = np.array([p_mkt["1"], p_mkt["X"], p_mkt["2"]], dtype=float)
    alpha0 = PRIOR_STRENGTH_1X2 * pi
    alpha_post = alpha0 + n_eff * p_model
    return (alpha_post / alpha_post.sum()).astype(float)

def bayes_beta(p_model: float, pi_prior: Optional[float], odds_prior: Optional[float], prior_strength: float, n_eff: int) -> float:
    """
    Mezcla Beta con prior combinado:
      - pi_prior (porcentaje pre-match, 0..1)
      - odds_prior (probabilidad implícita 0..1)
    Toma la media de ambos priors disponibles.
    """
    priors = [x for x in [pi_prior, odds_prior] if x is not None and 0 < x < 1]
    if not priors:  # sin prior => devuelve el modelo
        return p_model
    pi = float(np.mean(priors))
    a0 = prior_strength * pi
    b0 = prior_strength * (1.0 - pi)
    a = a0 + n_eff * p_model
    b = b0 + n_eff * (1.0 - p_model)
    return float(a / (a + b))

# ========================= Endpoints ========================
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

    home, away = inp.home_team, inp.away_team
    if not home or not away or home == away:
        raise HTTPException(status_code=400, detail="Equipos inválidos")

    # Lambdas con señales (goles, xG, PPG)
    lam_h, lam_a, dbg_lambda = store.lambdas(home, away)

    # Poisson base
    M = poisson_matrix(lam_h, lam_a, kmax=POISSON_MAX_GOALS)
    base = probs_from_matrix(M)

    # Modelo -> 0..1
    p1, px, p2   = base["home_win_pct"]/100.0, base["draw_pct"]/100.0, base["away_win_pct"]/100.0
    po25, pbtts  = base["over_2_5_pct"]/100.0, base["btts_pct"]/100.0

    # Priors (mercado + porcentajes pre-match por equipo)
    m1x2 = implied_1x2(inp.odds or {})
    mO25 = implied_single((inp.odds or {}).get("O2_5") or (inp.odds or {}).get("odds_ft_over25"))
    mBTY = implied_single((inp.odds or {}).get("BTTS_YES") or (inp.odds or {}).get("odds_btts_yes"))

    pre_priors = store.priors_pre_match(home, away)  # {"over25": p, "btts": p}
    n_eff = store.n_eff(home, away)

    # Mezcla Bayes
    p_model_vec = np.array([p1, px, p2], dtype=float)
    p_bayes_vec = bayes_dirichlet_1x2(p_model_vec, m1x2, n_eff)
    p1b, pxb, p2b = map(float, p_bayes_vec.tolist())
    po25b = bayes_beta(po25, pre_priors["over25"], mO25, PRIOR_STRENGTH_O25, n_eff)
    pbttsb= bayes_beta(pbtts, pre_priors["btts"],  mBTY, PRIOR_STRENGTH_BTTS, n_eff)

    probs_out = {
        "home_win_pct": round(p1b * 100, 2),
        "draw_pct": round(pxb * 100, 2),
        "away_win_pct": round(p2b * 100, 2),
        "over_2_5_pct": round(po25b * 100, 2),
        "btts_pct": round(pbttsb * 100, 2),
        "o25_mlp_pct": round(po25b * 100, 2),
    }

    # Best pick (con EV si hay cuotas)
    reasons = [
        f"λ_home={lam_h:.2f}, λ_away={lam_a:.2f} (xG/PPG/medias).",
        f"n_eff={n_eff}, priors: over25={pre_priors['over25']}, btts={pre_priors['btts']}.",
    ]
    best_market, best_sel, best_prob = "1X2", "1", p1b
    best_conf = confidence_from_prob(best_prob)
    if p2b > best_prob: best_market, best_sel, best_prob, best_conf = "1X2", "2", p2b, confidence_from_prob(p2b)
    if pxb > best_prob: best_market, best_sel, best_prob, best_conf = "1X2", "X", pxb, confidence_from_prob(pxb)
    if po25b > best_prob: best_market, best_sel, best_prob, best_conf = "Over 2.5", "Sí", po25b, confidence_from_prob(po25b)
    if pbttsb > best_prob: best_market, best_sel, best_prob, best_conf = "BTTS", "Sí", pbttsb, confidence_from_prob(pbttsb)

    if inp.odds:
        cands = []
        for k, p in [("1", p1b), ("X", pxb), ("2", p2b)]:
            odd = _to_float((inp.odds or {}).get(k) or (inp.odds or {}).get({"1":"odds_ft_home_team_win","X":"odds_ft_draw","2":"odds_ft_away_team_win"}[k]))
            if odd:
                ev = p * odd - 1.0
                cands.append(("1X2", k, p, ev, odd))
        odd_o25 = _to_float((inp.odds or {}).get("O2_5") or (inp.odds or {}).get("odds_ft_over25"))
        if odd_o25:
            ev = po25b * odd_o25 - 1.0
            cands.append(("Over 2.5", "Sí", po25b, ev, odd_o25))
        odd_bty = _to_float((inp.odds or {}).get("BTTS_YES") or (inp.odds or {}).get("odds_btts_yes"))
        if odd_bty:
            ev = pbttsb * odd_bty - 1.0
            cands.append(("BTTS", "Sí", pbttsb, ev, odd_bty))
        if cands:
            cands.sort(key=lambda x: (x[3], x[2]), reverse=True)
            if cands[0][3] > 0:
                best_market, best_sel, best_prob, best_ev, best_odd = cands[0]
                best_conf = confidence_from_prob(best_prob)
                reasons.append(f"Valor esperado {best_ev:+.2f} con cuota {best_odd:.2f}.")

    summary = f"Partido: {home} vs {away}. Pick: {best_market} – {best_sel} (prob {best_prob*100:.2f}%, conf {best_conf:.0f}/100)."
    best = BestPick(
        market=best_market, selection=best_sel,
        prob_pct=round(best_prob * 100, 2), confidence=best_conf,
        reasons=reasons,
    )

    dbg = {
        "lambda_build": dbg_lambda,
        "market_1x2": m1x2,
        "market_O2_5": mO25,
        "market_BTTS_YES": mBTY,
        "pre_match_priors": pre_priors,
        "posterior": {"1": p1b, "X": pxb, "2": p2b, "O2_5": po25b, "BTTS": pbttsb},
    }

    # Extras informativos (promedios simples; úsalos en UI si quieres)
    extras = {
        "total_yellow_cards_avg": float(self_mean(store.df, ["home_team_yellow_cards","away_team_yellow_cards"])),
        "total_corners_avg": float(self_mean(store.df, ["home_team_corner_count","away_team_corner_count"])),
        "corners_mlp_pred": float(self_mean(store.df, ["home_team_corner_count","away_team_corner_count"])),
    }

    return PredictOut(
        league=inp.league, home_team=home, away_team=away,
        probs=probs_out,
        poisson={"home_lambda": round(lam_h,3), "away_lambda": round(lam_a,3), "top_scorelines": base["top_scorelines"]},
        averages=extras,
        best_pick=best, summary=summary, debug=dbg
    )

def self_mean(df: pd.DataFrame, cols: List[str]) -> float:
    vals = []
    for c in cols:
        c2 = _snake(c)
        if c2 in df.columns:
            vals.append(pd.to_numeric(df[c2], errors="coerce"))
    if not vals: return 0.0
    s = sum(v.fillna(0) for v in vals)
    return float(s.mean(skipna=True))
