# backend/app.py
# -*- coding: utf-8 -*-
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Tuple, Optional

import os, joblib
import pandas as pd
import numpy as np
from scipy.stats import poisson
from math import exp, log, lgamma, factorial

# -------------------------------------------------------------------
# CONFIG
# -------------------------------------------------------------------
BASE_DIR = os.path.dirname(__file__)
DATA_DIR = os.path.join(BASE_DIR, "data")
ART_DIR  = os.path.join(BASE_DIR, "artifacts")

# (ya NO entrenamos on-start ni on-demand)
SKIP_TRAIN_ON_STARTUP = True
DC_HALFLIFE_DAYS = 180
DC_MAX_GOALS = 10

LEAGUES_FILES: Dict[str, str] = {
    "Belgica Pro League":          "Belgica_Pro_League.csv",
    "Bundesliga":                  "Bundesliga.csv",
    "Champions League":            "ChampionsLegue.csv",
    "Allsvenskan (Suecia)":        "datos_Allsvenskan.csv",
    "Brasileirão":                 "datos_Brasileirao.csv",
    "Liga Chilena":                "datos_ChileLigue.csv",
    "Eredivisie":                  "datos_Eredivisie.csv",
    "Europa League":               "datos_EuropaLeague.csv",
    "Liga MX":                     "datos_LigaMX.csv",
    "Liga Portuguesa":             "datos_LigaNos.csv",
    "Conference League":           "datoss_ConferenceLeague.csv",
    "EFL League One":              "EFL League One.csv",
    "JLeague":                     "JLeague.csv",
    "La Liga España":              "La Liga.csv",
    "Ligue 1 France":              "LigueOneFrance.csv",
    "MLS Histórico":               "MLS_Historico.csv",
    "UEFA Nations League (Europa)":"NationsLegueEUROPA.csv",
    "Premier League":              "Premier League.csv",
    "Serie A Italia":              "SerieItalia.csv",
}

COL_ALIASES = {
    "home_team_name": ["home_team_name","home_team","local","home","equipo_local","HomeTeam","homeTeam"],
    "away_team_name": ["away_team_name","away_team","visitante","away","equipo_visitante","AwayTeam","awayTeam"],
    "home_team_goal_count": ["home_team_goal_count","home_goals","goles_local","home_score","FTHG","fthg","homeGoals"],
    "away_team_goal_count": ["away_team_goal_count","away_goals","goles_visitante","away_score","FTAG","ftag","awayGoals"],
    "home_team_yellow_cards": ["home_team_yellow_cards","local_yellow","home_yellow_cards","amarillas_local","HY","hyc"],
    "away_team_yellow_cards": ["away_team_yellow_cards","visit_yellow","away_yellow_cards","amarillas_visitante","AY","ayc"],
    "home_team_corner_count": ["home_team_corner_count","local_corners","home_corners","corners_local","HC","hc"],
    "away_team_corner_count": ["away_team_corner_count","visit_corners","away_corners","corners_visitante","AC","ac"],
    "over_25_percentage_pre_match": ["over_25_percentage_pre_match","over25_pre","o25_pre","pct_o25","%o25"],
    "date": ["date","match_date","utc_date","game_started_at","start_date","fecha","Date"],
}

# -------------------------------------------------------------------
# CSV utils
# -------------------------------------------------------------------
def _smart_read_csv(path: str) -> pd.DataFrame:
    for enc in ("utf-8","latin-1","cp1252"):
        for sep in (",",";","\t"):
            try:
                return pd.read_csv(path, encoding=enc, sep=sep)
            except Exception:
                pass
    return pd.read_csv(path)

def _rename_with_aliases(df: pd.DataFrame) -> pd.DataFrame:
    cols_lower = {c.lower(): c for c in df.columns}
    ren = {}
    for target, aliases in COL_ALIASES.items():
        for a in aliases:
            if a.lower() in cols_lower:
                ren[cols_lower[a.lower()]] = target
                break
    if ren: df = df.rename(columns=ren)

    for col in ("home_team_yellow_cards","away_team_yellow_cards",
                "home_team_corner_count","away_team_corner_count"):
        if col not in df.columns: df[col] = 0

    if "date" not in df.columns:
        df["date"] = pd.date_range("2018-01-01", periods=len(df), freq="D")
    else:
        df["date"] = pd.to_datetime(df["date"], errors="coerce")
        if df["date"].isna().all():
            df["date"] = pd.date_range("2018-01-01", periods=len(df), freq="D")
        else:
            df["date"] = df["date"].ffill().bfill()

    if "over_25_percentage_pre_match" not in df.columns:
        rate = ((pd.to_numeric(df["home_team_goal_count"], errors="coerce").fillna(0) +
                 pd.to_numeric(df["away_team_goal_count"], errors="coerce").fillna(0)) > 2.5).mean()
        df["over_25_percentage_pre_match"] = round(float(rate)*100.0, 2)

    return df

def _augment_df(df: pd.DataFrame) -> pd.DataFrame:
    req = ["home_team_name","away_team_name","home_team_goal_count","away_team_goal_count","date"]
    for c in req:
        if c not in df.columns:
            raise ValueError(f"Falta la columna obligatoria '{c}'")

    df = df.copy()
    for c in ["home_team_goal_count","away_team_goal_count",
              "home_team_yellow_cards","away_team_yellow_cards",
              "home_team_corner_count","away_team_corner_count",
              "over_25_percentage_pre_match"]:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)

    df["home_team_goals_avg"] = df.groupby("home_team_name")["home_team_goal_count"].transform("mean")
    df["away_team_goals_avg"] = df.groupby("away_team_name")["away_team_goal_count"].transform("mean")
    df["home_team_goals_conceded_avg"] = df.groupby("home_team_name")["away_team_goal_count"].transform("mean")
    df["away_team_goals_conceded_avg"] = df.groupby("away_team_name")["home_team_goal_count"].transform("mean")
    df["home_team_yellow_cards_avg"] = df.groupby("home_team_name")["home_team_yellow_cards"].transform("mean")
    df["away_team_yellow_cards_avg"] = df.groupby("away_team_name")["away_team_yellow_cards"].transform("mean")
    df["home_team_corner_count_avg"] = df.groupby("home_team_name")["home_team_corner_count"].transform("mean")
    df["away_team_corner_count_avg"] = df.groupby("away_team_name")["away_team_corner_count"].transform("mean")

    df["over_2_5_goals"] = ((df["home_team_goal_count"] + df["away_team_goal_count"]) > 2.5).astype(int)
    df["total_corners"] = df["home_team_corner_count"] + df["away_team_corner_count"]
    return df

# -------------------------------------------------------------------
# Poisson & DC helpers
# -------------------------------------------------------------------
def _poisson_1x2(hλ: float, aλ: float, max_goals: int = 7) -> Tuple[float,float,float]:
    hg = poisson.pmf(np.arange(0, max_goals+1), hλ)
    ag = poisson.pmf(np.arange(0, max_goals+1), aλ)
    mat = np.outer(hg, ag)
    return float(np.tril(mat, -1).sum()), float(np.trace(mat)), float(np.triu(mat, 1).sum())

def _poisson_matrix(hλ: float, aλ: float, max_goals: int = 7) -> np.ndarray:
    hg = poisson.pmf(np.arange(0, max_goals + 1), hλ)
    ag = poisson.pmf(np.arange(0, max_goals + 1), aλ)
    return np.outer(hg, ag)

def _scoreline_matrix(hλ: float, aλ: float, max_goals: int = 5) -> Dict[str, Any]:
    hg = poisson.pmf(np.arange(0, max_goals+1), hλ)
    ag = poisson.pmf(np.arange(0, max_goals+1), aλ)
    mat = np.outer(hg, ag)
    items = []
    for i in range(0, max_goals+1):
        for j in range(0, max_goals+1):
            items.append((f"{i}-{j}", float(mat[i,j])))
    items.sort(key=lambda x: x[1], reverse=True)
    top = [{"score": s, "pct": round(100.0*p, 2)} for s,p in items[:8]]
    return {
        "home_lambda": round(float(hλ), 4),
        "away_lambda": round(float(aλ), 4),
        "rows": [str(i) for i in range(0, max_goals+1)],
        "cols": [str(j) for j in range(0, max_goals+1)],
        "matrix": [[round(float(x)*100.0, 2) for x in row] for row in mat.tolist()],
        "top_scorelines": top,
    }

def _dc_correction(i: int, j: int, lam_h: float, lam_a: float, rho: float) -> float:
    if i == 0 and j == 0: return 1 - lam_h*lam_a*rho
    if i == 0 and j == 1: return 1 + lam_h*rho
    if i == 1 and j == 0: return 1 + lam_a*rho
    if i == 1 and j == 1: return 1 - rho
    return 1.0

def _dc_score_matrix(model: Dict[str, Any], home_team: str, away_team: str):
    teams = model["teams"]; att = model["attack"]; deff = model["defence"]
    home = model["home_adv"]; rho = model["rho"]; G = model["max_goals"]
    t_idx = {t:i for i,t in enumerate(teams)}
    ih, ia = t_idx[home_team], t_idx[away_team]
    lam_h = exp(home + att[ih] - deff[ia])
    lam_a = exp(att[ia] - deff[ih])

    P = np.zeros((G+1, G+1))
    for i in range(G+1):
        for j in range(G+1):
            base = (np.exp(-lam_h) * lam_h**i / factorial(i)) * (np.exp(-lam_a) * lam_a**j / factorial(j))
            P[i, j] = base * _dc_correction(i, j, lam_h, lam_a, rho)
    P /= P.sum()
    return P, lam_h, lam_a

def _pct(x: float) -> float:
    return round(100.0*float(x), 2)

# -------------------------------------------------------------------
# Carga de datos + artifacts
# -------------------------------------------------------------------
frames: Dict[str, pd.DataFrame] = {}
teams_cache: Dict[str, List[str]] = {}
mlp_models: Dict[str, Dict[str, Any]] = {}   # scaler, o25_model, corners_model
dc_models:  Dict[str, Dict[str, Any]] = {}   # dict retornado por train_cache

def _slug(name: str) -> str:
    keep = "".join(ch if ch.isalnum() else "_" for ch in name)
    while "__" in keep: keep = keep.replace("__","_")
    return keep.strip("_").lower()

def _load_frames() -> None:
    frames.clear(); teams_cache.clear()
    for pretty, fname in LEAGUES_FILES.items():
        path = os.path.join(DATA_DIR, fname)
        if not os.path.exists(path):
            print(f"[SKIP] No encontrado: {path}"); continue
        try:
            raw = _smart_read_csv(path)
            raw = _rename_with_aliases(raw)
            df  = _augment_df(raw)
            frames[pretty] = df
            teams_cache[pretty] = sorted(set(df["home_team_name"]).union(df["away_team_name"]))
            print(f"[OK] {pretty}: {len(df)} filas, {len(teams_cache[pretty])} equipos")
        except Exception as e:
            print(f"[ERROR] Cargando {pretty}: {e}")

def _load_artifacts() -> None:
    mlp_models.clear(); dc_models.clear()
    for league in LEAGUES_FILES.keys():
        slug = _slug(league)
        p_mlp = os.path.join(ART_DIR, f"mlp_{slug}.joblib")
        p_dc  = os.path.join(ART_DIR, f"dc_{slug}.joblib")
        if os.path.exists(p_mlp):
            try:
                mlp_models[league] = joblib.load(p_mlp); print(f"[ART] MLP {league}")
            except Exception as e:
                print(f"[ART] err MLP {league}: {e}")
        if os.path.exists(p_dc):
            try:
                dc_models[league] = joblib.load(p_dc);  print(f"[ART] DC  {league}")
            except Exception as e:
                print(f"[ART] err DC  {league}: {e}")

# -------------------------------------------------------------------
# API
# -------------------------------------------------------------------
class PredictPayload(BaseModel):
    league: str
    home_team: str
    away_team: str
    engine: Optional[str] = Field("poisson", description="poisson | dc")

app = FastAPI(title="Footy Predictions API", version="2.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

@app.on_event("startup")
def _startup():
    _load_frames()
    _load_artifacts()
    print(f"[BOOT] ligas={len(frames)} mlp={len(mlp_models)} dc={len(dc_models)}")

@app.get("/")
def root():
    return {"ok": True, "service": "Footy Predictions API", "docs": "/docs", "health": "/health"}

@app.get("/health")
def health():
    return {
        "ok": True,
        "leagues_loaded": list(frames.keys()),
        "mlp_models_loaded": list(mlp_models.keys()),
        "dc_models_loaded": list(dc_models.keys()),
        "artifacts_dir_exists": os.path.isdir(ART_DIR),
    }

@app.get("/leagues")
def get_leagues():
    return {"leagues": list(frames.keys())}

@app.get("/teams")
def get_teams(league: str):
    if league not in teams_cache:
        raise HTTPException(status_code=404, detail=f"Liga '{league}' no cargada.")
    return {"teams": teams_cache[league]}

@app.post("/predict")
def predict(payload: PredictPayload):
    league = payload.league
    if league not in frames:
        raise HTTPException(status_code=404, detail=f"Liga '{league}' no cargada.")
    df = frames[league]

    hs = df[df["home_team_name"] == payload.home_team]
    as_ = df[df["away_team_name"] == payload.away_team]
    if hs.empty or as_.empty:
        raise HTTPException(status_code=404, detail="Equipo(s) no encontrados en esta liga.")

    hs0 = hs.iloc[0]; as0 = as_.iloc[0]
    hλ = float(hs0["home_team_goals_avg"])
    aλ = float(as0["away_team_goals_avg"])

    engine = (payload.engine or "poisson").lower()
    if engine == "dc" and league in dc_models:
        P, lam_h, lam_a = _dc_score_matrix(dc_models[league], payload.home_team, payload.away_team)
        i = np.arange(P.shape[0])[:,None]; j = np.arange(P.shape[1])[None,:]
        p_home = float(P[i>j].sum()); p_draw = float(P[i==j].sum()); p_away = float(P[i<j].sum())
        mat = P; hλ_eff, aλ_eff = lam_h, lam_a
        poisson_payload = _scoreline_matrix(hλ_eff, aλ_eff)
        engine_used = "dc"
    else:
        p_home, p_draw, p_away = _poisson_1x2(hλ, aλ)
        mat = _poisson_matrix(hλ, aλ, max_goals=7)
        hλ_eff, aλ_eff = hλ, aλ
        poisson_payload = _scoreline_matrix(hλ_eff, aλ_eff)
        engine_used = "poisson"

    # Probabilidades derivadas de la matriz
    def prob_under(k: int) -> float:
        return float(sum(mat[i, j] for i in range(mat.shape[0]) for j in range(mat.shape[1]) if i + j <= k))
    def prob_over(k: int) -> float:
        return float(1.0 - prob_under(k))
    p_o25 = prob_over(2)
    p_btts = float(mat[1:, 1:].sum())

    # Promedios
    total_yc = float(hs0["home_team_yellow_cards_avg"] + as0["away_team_yellow_cards_avg"])
    total_corners_avg = float(hs0["home_team_corner_count_avg"] + as0["away_team_corner_count_avg"])

    # MLP pre-entrenado
    if league in mlp_models:
        mp = mlp_models[league]
        X = np.array([[hλ, aλ, float(hs0["home_team_corner_count_avg"]), float(as0["away_team_corner_count_avg"])]], dtype=float)
        Xs = mp["scaler"].transform(X)
        o25_prob_mlp = float(mp["o25_model"].predict_proba(Xs)[0,1])
        corners_pred  = float(mp["corners_model"].predict(Xs)[0])
    else:
        over25_hist_share = float(df["over_25_percentage_pre_match"].mean()) / 100.0
        o25_prob_mlp = (p_o25 + over25_hist_share) / 2.0
        corners_pred  = total_corners_avg

    # Mejor jugada
    def _best_pick(home: str, away: str, hλ: float, aλ: float,
                   p_home: float, p_draw: float, p_away: float,
                   p_o25: float, p_btts: float,
                   mat: np.ndarray, poisson_payload: Dict[str, Any]) -> Dict[str, Any]:
        def prob_under(k: int) -> float:
            return float(sum(mat[i, j] for i in range(mat.shape[0]) for j in range(mat.shape[1]) if i + j <= k))
        def prob_over(k: int) -> float:
            return float(1.0 - prob_under(k))
        p_U35, p_O15, p_O25 = prob_under(3), prob_over(1), prob_over(2)
        p_btts_yes = float(mat[1:, 1:].sum())
        p_1x = float(np.tril(mat, 0).sum()); p_12 = float(1.0 - np.trace(mat)); p_x2 = float(np.triu(mat, 0).sum())
        def sum_mask(pred) -> float:
            return float(sum(mat[i, j] for i in range(mat.shape[0]) for j in range(mat.shape[1]) if pred(i, j)))
        p_1_U35  = sum_mask(lambda i, j: i > j and (i + j) <= 3)
        p_2_U35  = sum_mask(lambda i, j: j > i and (i + j) <= 3)
        p_1_O15  = sum_mask(lambda i, j: i > j and (i + j) >= 2)
        p_2_O15  = sum_mask(lambda i, j: j > i and (i + j) >= 2)
        p_1x_U35 = sum_mask(lambda i, j: i >= j and (i + j) <= 3)
        p_x2_U35 = sum_mask(lambda i, j: j >= i and (i + j) <= 3)
        p_12_O15 = sum_mask(lambda i, j: i != j and (i + j) >= 2)
        p_btts_o25 = sum_mask(lambda i, j: i > 0 and j > 0 and (i + j) >= 3)
        p_nbtts_u35 = sum_mask(lambda i, j: (i == 0 or j == 0) and (i + j) <= 3)
        candidates = [
          {"prio":4,"market":"1X2","selection":f"1 ({home})","prob":p_home},
          {"prio":4,"market":"1X2","selection":"X","prob":p_draw},
          {"prio":4,"market":"1X2","selection":f"2 ({away})","prob":p_away},
          {"prio":2,"market":"Doble oportunidad","selection":"1X","prob":p_1x},
          {"prio":2,"market":"Doble oportunidad","selection":"12","prob":p_12},
          {"prio":2,"market":"Doble oportunidad","selection":"X2","prob":p_x2},
          {"prio":3,"market":"Goles","selection":"Under 3.5","prob":p_U35},
          {"prio":3,"market":"Goles","selection":"Over 1.5","prob":p_O15},
          {"prio":3,"market":"Goles","selection":"Over 2.5","prob":p_O25},
          {"prio":1,"market":"Combo","selection":"1 & Under 3.5","prob":p_1_U35},
          {"prio":1,"market":"Combo","selection":"2 & Under 3.5","prob":p_2_U35},
          {"prio":1,"market":"Combo","selection":"1 & Over 1.5","prob":p_1_O15},
          {"prio":1,"market":"Combo","selection":"2 & Over 1.5","prob":p_2_O15},
          {"prio":1,"market":"Combo","selection":"1X & Under 3.5","prob":p_1x_U35},
          {"prio":1,"market":"Combo","selection":"X2 & Under 3.5","prob":p_x2_U35},
          {"prio":1,"market":"Combo","selection":"12 & Over 1.5","prob":p_12_O15},
          {"prio":1,"market":"Combo","selection":"BTTS Sí & Over 2.5","prob":p_btts_o25},
          {"prio":1,"market":"Combo","selection":"BTTS No & Under 3.5","prob":p_nbtts_u35},
        ]
        def passes(c):
            if c["market"] == "1X2": return c["prob"] >= 0.55
            if c["market"] == "Doble oportunidad": return c["prob"] >= 0.65
            if c["market"] == "Goles": return 0.55 <= c["prob"] <= 0.88
            if c["market"] == "Combo": return c["prob"] >= 0.50
            return True
        filtered = [c for c in candidates if passes(c)]
        pool = filtered if filtered else candidates
        pool.sort(key=lambda x:(x["prio"], -x["prob"]))
        best = pool[0]; best["prob_pct"]=round(best["prob"]*100,2); best["confidence"]=best["prob_pct"]
        top = poisson_payload.get("top_scorelines", [])
        top_txt = ", ".join([f"{t['score']} ({t['pct']}%)" for t in top[:3]]) if top else "s/datos"
        goals_skew = "alta" if (hλ + aλ) >= 2.7 else ("media" if (hλ + aλ) >= 2.2 else "baja")
        reasons = [
            f"λ local {hλ:.2f} vs λ visitante {aλ:.2f} → tendencia de goles {goals_skew}.",
            f"1X2: 1={round(p_home*100,2)}% · X={round(p_draw*100,2)}% · 2={round(p_away*100,2)}%.",
            f"U3.5={round(prob_under(3)*100,2)}% · O1.5={round(prob_over(1)*100,2)}% · O2.5={round(prob_over(2)*100,2)}% · AA={round(p_btts_yes*100,2)}%.",
            f"Marcadores más probables: {top_txt}.",
        ]
        summary = f"Partido {'local' if p_home>p_away else 'visitante' if p_away>p_home else 'parejo'}; " \
                  f"{home} λ={hλ:.2f} / {away} λ={aλ:.2f}. Mejor jugada: {best['market']} – {best['selection']} ({best['prob_pct']}%)."
        return {"market":best["market"],"selection":best["selection"],"prob_pct":best["prob_pct"],
                "confidence":best["confidence"],"reasons":reasons,"summary":summary}

    best_pick = _best_pick(payload.home_team, payload.away_team,
                           hλ_eff, aλ_eff, p_home, p_draw, p_away, p_o25, p_btts,
                           mat, poisson_payload)

    return {
        "engine": engine_used,
        "league": league,
        "home_team": payload.home_team,
        "away_team": payload.away_team,
        "probs": {
            "home_win_pct": _pct(p_home),
            "draw_pct": _pct(p_draw),
            "away_win_pct": _pct(p_away),
            "over_2_5_pct": _pct(p_o25),
            "btts_pct": _pct(p_btts),
            "o25_mlp_pct": _pct(o25_prob_mlp),
        },
        "poisson": poisson_payload,
        "averages": {
            "total_yellow_cards_avg": round(float(hs0['home_team_yellow_cards_avg'] + as0['away_team_yellow_cards_avg']), 2),
            "total_corners_avg": round(float(hs0['home_team_corner_count_avg'] + as0['away_team_corner_count_avg']), 2),
            "corners_mlp_pred": round(float(corners_pred), 2),
        },
        "best_pick": best_pick,
        "summary": best_pick["summary"],
    }
