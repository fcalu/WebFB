# backend/train_cache.py
# -*- coding: utf-8 -*-
"""
Entrena una vez los modelos por liga y guarda artefactos en backend/artifacts/.
Se ejecuta en el paso de build de Render (o localmente).
"""

import os
import json
import time
import joblib
import hashlib
from typing import Dict, Any, List, Tuple
import numpy as np
import pandas as pd
from scipy.stats import poisson
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.neural_network import MLPClassifier, MLPRegressor

# --- Config rutas ---
BASE_DIR = os.path.dirname(__file__)
DATA_DIR = os.path.join(BASE_DIR, "data")
ART_DIR  = os.path.join(BASE_DIR, "artifacts")
os.makedirs(ART_DIR, exist_ok=True)

# Mapea <nombre bonito> -> <archivo csv>
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
}

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

    # columnas opcionales
    for col in ("home_team_yellow_cards","away_team_yellow_cards",
                "home_team_corner_count","away_team_corner_count"):
        if col not in df.columns:
            df[col] = 0

    if "over_25_percentage_pre_match" not in df.columns:
        rate = ((pd.to_numeric(df["home_team_goal_count"], errors="coerce").fillna(0) +
                 pd.to_numeric(df["away_team_goal_count"], errors="coerce").fillna(0)) > 2.5).mean()
        df["over_25_percentage_pre_match"] = round(float(rate)*100.0, 2)
    return df

def _augment_df(df: pd.DataFrame) -> pd.DataFrame:
    req = ["home_team_name","away_team_name","home_team_goal_count","away_team_goal_count"]
    for c in req:
        if c not in df.columns:
            raise ValueError(f"Falta la columna '{c}'")
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

def _build_models(df: pd.DataFrame):
    feats = df[["home_team_goals_avg","away_team_goals_avg",
                "home_team_corner_count_avg","away_team_corner_count_avg"]].fillna(0.0)
    y_o25 = df["over_2_5_goals"].astype(int)
    y_cor = df["total_corners"].astype(float)

    scaler = StandardScaler()
    X = scaler.fit_transform(feats)

    Xtr, _, ytr, _ = train_test_split(X, y_o25, test_size=0.2, random_state=42)
    Xtrc, _, ytrc, _ = train_test_split(X, y_cor, test_size=0.2, random_state=42)

    clf = MLPClassifier(hidden_layer_sizes=(64,64), activation="relu", random_state=42, max_iter=600)
    clf.fit(Xtr, ytr)

    reg = MLPRegressor(hidden_layer_sizes=(64,64), activation="relu", random_state=42, max_iter=900)
    reg.fit(Xtrc, ytrc)

    return {"scaler": scaler, "o25_model": clf, "corners_model": reg}

def _slug(name: str) -> str:
    keep = "".join(ch if ch.isalnum() else "_" for ch in name)
    while "__" in keep:
        keep = keep.replace("__", "_")
    return keep.strip("_").lower()

def main():
    meta = {"generated_at": int(time.time()), "items": []}
    ok = 0

    for pretty, fname in LEAGUES_FILES.items():
        path = os.path.join(DATA_DIR, fname)
        if not os.path.exists(path):
            print(f"[SKIP] {pretty}: no existe {path}")
            continue
        try:
            raw = _smart_read_csv(path)
            raw = _rename_with_aliases(raw)
            df  = _augment_df(raw)
            pack = _build_models(df)

            slug = _slug(pretty)
            out_path = os.path.join(ART_DIR, f"model_{slug}.joblib")
            joblib.dump(pack, out_path, compress=3)

            meta["items"].append({
                "league": pretty,
                "slug": slug,
                "csv": fname,
                "rows": int(len(df)),
                "teams": int(len(set(df["home_team_name"]).union(df["away_team_name"]))),
                "artifact": os.path.basename(out_path),
            })
            ok += 1
            print(f"[OK] {pretty}: artefacto -> {out_path}")
        except Exception as e:
            print(f"[ERR] {pretty}: {e}")

    meta_path = os.path.join(ART_DIR, "meta.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print(f"\nListo: {ok} modelos guardados. Meta: {meta_path}")

if __name__ == "__main__":
    main()
