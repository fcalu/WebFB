# backend/app.py
# -*- coding: utf-8 -*-
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, List, Tuple

import os
import pandas as pd
import numpy as np
from scipy.stats import poisson
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.neural_network import MLPClassifier, MLPRegressor

# -------------------------------------------------------------------
# CONFIG
# -------------------------------------------------------------------
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

# CSV según tus capturas (colócalos en backend/data/)
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

# Aliases -> nombres esperados
COL_ALIASES = {
    "home_team_name": ["home_team_name","home_team","local","home","equipo_local","HomeTeam","homeTeam"],
    "away_team_name": ["away_team_name","away_team","visitante","away","equipo_visitante","AwayTeam","awayTeam"],
    "home_team_goal_count": ["home_team_goal_count","home_goals","goles_local","home_score","FTHG","fthg","homeGoals"],
    "away_team_goal_count": ["away_team_goal_count","away_goals","goles_visitante","away_score","FTAG","ftag","awayGoals"],
    "home_team_yellow_cards": ["home_team_yellow_cards","local_yellow","home_yellow_cards","amarillas_local","HY","hyc"],
    "away_team_yellow_cards": ["away_team_yellow_cards","visit_yellow","away_yellow_cards","amarillas_visitante","AY","ayc"],
    "home_team_corner_count": ["home_team_corner_count","local_corners","home_corners","corners_local","HC","hc"],
    "away_team_corner_count": ["away_team_corner_count","visit_corners","away_corners","corners_visitante","AC","ac"],
    # opcional; si falta, se estima
    "over_25_percentage_pre_match": ["over_25_percentage_pre_match","over25_pre","o25_pre","pct_o25","%o25"],
}

# -------------------------------------------------------------------
# UTILIDADES CSV
# -------------------------------------------------------------------
def _smart_read_csv(path: str) -> pd.DataFrame:
    for enc in ("utf-8", "latin-1"):
        for sep in (",", ";", "\t"):
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
    if ren:
        df = df.rename(columns=ren)

    # Rellenos seguros
    for col in ("home_team_yellow_cards","away_team_yellow_cards",
                "home_team_corner_count","away_team_corner_count"):
        if col not in df.columns:
            df[col] = 0

    if "over_25_percentage_pre_match" not in df.columns:
        if "home_team_goal_count" in df.columns and "away_team_goal_count" in df.columns:
            rate = float(((pd.to_numeric(df["home_team_goal_count"], errors="coerce").fillna(0) +
                           pd.to_numeric(df["away_team_goal_count"], errors="coerce").fillna(0)) > 2.5).mean())
        else:
            rate = 0.5
        df["over_25_percentage_pre_match"] = np.round(rate * 100.0, 2)
    return df

# -------------------------------------------------------------------
# FEATURES + MODELOS
# -------------------------------------------------------------------
def _augment_df(df: pd.DataFrame) -> pd.DataFrame:
    req = ["home_team_name","away_team_name","home_team_goal_count","away_team_goal_count"]
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

class ModelPack:
    def __init__(self, scaler: StandardScaler, o25_model: MLPClassifier, corners_model: MLPRegressor):
        self.scaler = scaler
        self.o25_model = o25_model
        self.corners_model = corners_model

def _build_models(df: pd.DataFrame) -> ModelPack:
    feats = df[["home_team_goals_avg","away_team_goals_avg",
                "home_team_corner_count_avg","away_team_corner_count_avg"]].fillna(0.0)
    y_o25 = df["over_2_5_goals"].astype(int)
    y_corners = df["total_corners"].astype(float)

    scaler = StandardScaler()
    X = scaler.fit_transform(feats)

    Xtr, Xte, ytr, yte = train_test_split(X, y_o25, test_size=0.2, random_state=42)
    Xtrc, Xtec, ytrc, ytec = train_test_split(X, y_corners, test_size=0.2, random_state=42)

    clf = MLPClassifier(hidden_layer_sizes=(64,64), activation="relu", random_state=42, max_iter=600)
    clf.fit(Xtr, ytr)

    reg = MLPRegressor(hidden_layer_sizes=(64,64), activation="relu", random_state=42, max_iter=900)
    reg.fit(Xtrc, ytrc)

    return ModelPack(scaler, clf, reg)

def _poisson_1x2(hλ: float, aλ: float, max_goals: int = 7) -> Tuple[float,float,float]:
    hg = poisson.pmf(np.arange(0, max_goals+1), hλ)
    ag = poisson.pmf(np.arange(0, max_goals+1), aλ)
    mat = np.outer(hg, ag)
    home = np.tril(mat, -1).sum()
    draw = np.trace(mat)
    away = np.triu(mat, 1).sum()
    return float(home), float(draw), float(away)

def _o25_btts(hλ: float, aλ: float, over25_hist: float, max_goals: int = 7) -> Tuple[float,float]:
    hg = poisson.pmf(np.arange(0, max_goals+1), hλ)
    ag = poisson.pmf(np.arange(0, max_goals+1), aλ)
    mat = np.outer(hg, ag)
    over25 = sum(mat[i,j] for i in range(max_goals+1) for j in range(max_goals+1) if i+j >= 3)
    p_zero_h = mat[0,:].sum(); p_zero_a = mat[:,0].sum(); p_00 = mat[0,0]
    btts = 1.0 - (p_zero_h + p_zero_a - p_00)
    over25 = (float(over25) + float(over25_hist)) / 2.0
    return float(over25), float(btts)

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

def _pct(x: float) -> float:
    return round(100.0*float(x), 2)

def _best_pick(
    home: str, away: str,
    hλ: float, aλ: float,
    p_home: float, p_draw: float, p_away: float,
    p_o25: float, p_btts: float,
    mat: np.ndarray,
    poisson_payload: Dict[str, Any]
) -> Dict[str, Any]:
    # Totales clásicos U/O 1.5 / 2.5 / 3.5
    def prob_under(k: int) -> float:
        return float(sum(mat[i, j] for i in range(mat.shape[0]) for j in range(mat.shape[1]) if i + j <= k))
    def prob_over(k: int) -> float:
        return float(1.0 - prob_under(k))

    p_U15, p_O15 = prob_under(1), prob_over(1)
    p_U25, p_O25 = prob_under(2), prob_over(2)
    p_U35, p_O35 = prob_under(3), prob_over(3)

    # BTTS exacto
    p_btts_yes = float(mat[1:, 1:].sum())
    p_btts_no = float(1.0 - p_btts_yes)

    # Doble oportunidad
    p_1x = float(np.tril(mat, 0).sum())
    p_12 = float(1.0 - np.trace(mat))
    p_x2 = float(np.triu(mat, 0).sum())

    # Combos habituales
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

    candidates = []
    # 1X2
    candidates += [
        {"prio": 4, "market": "1X2", "selection": f"1 ({home})", "prob": p_home},
        {"prio": 4, "market": "1X2", "selection": "X", "prob": p_draw},
        {"prio": 4, "market": "1X2", "selection": f"2 ({away})", "prob": p_away},
    ]
    # Doble oportunidad
    candidates += [
        {"prio": 2, "market": "Doble oportunidad", "selection": "1X", "prob": p_1x},
        {"prio": 2, "market": "Doble oportunidad", "selection": "12", "prob": p_12},
        {"prio": 2, "market": "Doble oportunidad", "selection": "X2", "prob": p_x2},
    ]
    # Totales
    candidates += [
        {"prio": 3, "market": "Goles", "selection": "Under 3.5", "prob": p_U35},
        {"prio": 3, "market": "Goles", "selection": "Over 1.5", "prob": p_O15},
        {"prio": 3, "market": "Goles", "selection": "Over 2.5", "prob": p_O25},
    ]
    # Combos (prioridad alta)
    candidates += [
        {"prio": 1, "market": "Combo", "selection": "1 & Under 3.5", "prob": p_1_U35},
        {"prio": 1, "market": "Combo", "selection": "2 & Under 3.5", "prob": p_2_U35},
        {"prio": 1, "market": "Combo", "selection": "1 & Over 1.5", "prob": p_1_O15},
        {"prio": 1, "market": "Combo", "selection": "2 & Over 1.5", "prob": p_2_O15},
        {"prio": 1, "market": "Combo", "selection": "1X & Under 3.5", "prob": p_1x_U35},
        {"prio": 1, "market": "Combo", "selection": "X2 & Under 3.5", "prob": p_x2_U35},
        {"prio": 1, "market": "Combo", "selection": "12 & Over 1.5", "prob": p_12_O15},
        {"prio": 1, "market": "Combo", "selection": "BTTS Sí & Over 2.5", "prob": p_btts_o25},
        {"prio": 1, "market": "Combo", "selection": "BTTS No & Under 3.5", "prob": p_nbtts_u35},
    ]

    # Umbrales para hacerlo presentable
    def passes(c):
        if c["market"] == "1X2":
            return c["prob"] >= 0.55
        if c["market"] == "Doble oportunidad":
            return c["prob"] >= 0.65
        if c["market"] == "Goles":
            return 0.55 <= c["prob"] <= 0.88
        if c["market"] == "Combo":
            return c["prob"] >= 0.50
        return True

    filtered = [c for c in candidates if passes(c)]
    pool = filtered if filtered else candidates
    pool.sort(key=lambda x: (x["prio"], -x["prob"]))  # prio asc, prob desc
    best = pool[0]
    best["prob_pct"] = round(best["prob"] * 100.0, 2)
    best["confidence"] = round(best["prob"] * 100.0, 2)

    # Razones y resumen
    top = poisson_payload.get("top_scorelines", [])
    top_txt = ", ".join([f"{t['score']} ({t['pct']}%)" for t in top[:3]]) if top else "s/datos"
    goals_skew = "alta" if (hλ + aλ) >= 2.7 else ("media" if (hλ + aλ) >= 2.2 else "baja")
    reasons = [
        f"λ local {hλ:.2f} vs λ visitante {aλ:.2f} → tendencia de goles {goals_skew}.",
        f"1X2: 1={round(p_home*100,2)}% · X={round(p_draw*100,2)}% · 2={round(p_away*100,2)}%.",
        f"U3.5={round(prob_under(3)*100,2)}% · O1.5={round(prob_over(1)*100,2)}% · O2.5={round(prob_over(2)*100,2)}% · AA={round(p_btts_yes*100,2)}%.",
        f"Marcadores más probables: {top_txt}.",
    ]
    tilt = "local" if p_home > p_away else ("visitante" if p_away > p_home else "parejo")
    sumtxt = (
        f"Partido {tilt}; {home} λ={hλ:.2f} / {away} λ={aλ:.2f}. "
        f"Mejor jugada: {best['market']} – {best['selection']} "
        f"({best['prob_pct']}%, confianza {round(best['confidence'])})."
    )
    return {
        "market": best["market"],
        "selection": best["selection"],
        "prob_pct": best["prob_pct"],
        "confidence": best["confidence"],
        "reasons": reasons,
        "summary": sumtxt,
    }

# -------------------------------------------------------------------
# CARGA DE LIGAS
# -------------------------------------------------------------------
frames: Dict[str, pd.DataFrame] = {}
teams_cache: Dict[str, List[str]] = {}
models: Dict[str, ModelPack] = {}

def _load_all() -> None:
    frames.clear(); teams_cache.clear(); models.clear()
    for pretty, fname in LEAGUES_FILES.items():
        path = os.path.join(DATA_DIR, fname)
        if not os.path.exists(path):
            print(f"[SKIP] No encontrado: {path}")
            continue
        try:
            raw = _smart_read_csv(path)
            raw = _rename_with_aliases(raw)
            df = _augment_df(raw)
            frames[pretty] = df
            teams_cache[pretty] = sorted(set(df["home_team_name"]).union(df["away_team_name"]))
            try:
                models[pretty] = _build_models(df)
                print(f"[OK] {pretty}: {len(df)} filas, {len(teams_cache[pretty])} equipos")
            except Exception as me:
                print(f"[WARN] Modelo falló para {pretty}: {me}")
        except Exception as e:
            print(f"[ERROR] Cargando {pretty}: {e}")

# -------------------------------------------------------------------
# API
# -------------------------------------------------------------------
class PredictPayload(BaseModel):
    league: str
    home_team: str
    away_team: str

app = FastAPI(title="Footy Predictions API", version="1.4.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

@app.on_event("startup")
def _startup():
    _load_all()

@app.get("/health")
def health():
    return {"ok": True, "leagues_loaded": list(frames.keys())}

@app.get("/leagues")
def get_leagues():
    return {"leagues": list(frames.keys())}

@app.get("/teams")
def get_teams(league: str):
    if league not in teams_cache:
        raise HTTPException(status_code=404, detail=f"Liga '{league}' no cargada.")
    return {"teams": teams_cache[league]}

@app.get("/refresh")
def refresh():
    _load_all()
    return {"ok": True, "leagues": list(frames.keys())}

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

    p_home, p_draw, p_away = _poisson_1x2(hλ, aλ)
    over25_hist_share = float(df["over_25_percentage_pre_match"].mean()) / 100.0
    p_o25, p_btts = _o25_btts(hλ, aλ, over25_hist_share)

    total_yc = float(hs0["home_team_yellow_cards_avg"] + as0["away_team_yellow_cards_avg"])
    total_corners_avg = float(hs0["home_team_corner_count_avg"] + as0["away_team_corner_count_avg"])

    if league in models:
        mp = models[league]
        X = np.array([[hλ, aλ, float(hs0["home_team_corner_count_avg"]), float(as0["away_team_corner_count_avg"])]], dtype=float)
        Xs = mp.scaler.transform(X)
        o25_prob_mlp = float(mp.o25_model.predict_proba(Xs)[0,1])
        corners_pred = float(mp.corners_model.predict(Xs)[0])
    else:
        o25_prob_mlp = p_o25
        corners_pred = total_corners_avg

    poisson_payload = _scoreline_matrix(hλ, aλ)
    mat = _poisson_matrix(hλ, aλ, max_goals=7)
    best_pick = _best_pick(payload.home_team, payload.away_team,
                           hλ, aλ, p_home, p_draw, p_away, p_o25, p_btts,
                           mat, poisson_payload)

    return {
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
            "total_yellow_cards_avg": round(total_yc, 2),
            "total_corners_avg": round(total_corners_avg, 2),
            "corners_mlp_pred": round(corners_pred, 2),
        },
        "best_pick": best_pick,
        "summary": best_pick["summary"],
    }
