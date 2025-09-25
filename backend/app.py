# -*- coding: utf-8 -*-
import os, json, math, datetime as dt
from typing import Optional, Dict, Any, List, Tuple

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# === modelos ===
from models.dixon_coles import fit_dixon_coles, score_matrix
from models.markets import markets_from_matrix
from models.market_blend import remove_overround, blend

# ======== Config ========
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
SKIP_TRAIN_ON_STARTUP = os.getenv("SKIP_TRAIN_ON_STARTUP", "1") == "1"
HALF_LIFE_DAYS = int(os.getenv("DC_HALFLIFE_DAYS", "180"))
MAX_GOALS = int(os.getenv("DC_MAX_GOALS", "10"))

LEAGUES_FILES = {
    "Belgica Pro League": "Belgica_Pro_League.csv",
    "Bundesliga": "Bundesliga.csv",
    "Champions League": "ChampionsLegue.csv",
    "Allsvenskan (Suecia)": "datos_Allsvenskan.csv",
    "Brasileirão": "datos_Brasileirao.csv",
    "Liga Chilena": "datos_ChileLigue.csv",
    "Eredivisie": "datos_Eredivisie.csv",
    "Europa League": "datos_EuropaLeague.csv",
    "Liga MX": "datos_LigaMX.csv",
    "Liga Portuguesa": "datos_LigaNos.csv",
    "Conference League": "datoss_ConferenceLeague.csv",
    "EFL League One": "EFL League One.csv",
    "JLeague": "JLeague.csv",
    "La Liga España": "La Liga.csv",
    "Ligue 1 France": "LigueOneFrance.csv",
    "MLS Histórico": "MLS_Historico.csv",
    "UEFA Nations League (Europa)": "NationsLegueEUROPA.csv",
    "Premier League": "Premier League.csv",
    # "Serie A Italia": "SerieItalia.csv",
}

# ======== App ========
app = FastAPI(title="Footy Predictions API", version="2.1")

origins = os.getenv("CORS_ORIGINS", "*")
allow_origins = ["*"] if origins == "*" else [o.strip() for o in origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ======== Estado ========
frames: Dict[str, pd.DataFrame] = {}
teams_cache: Dict[str, List[str]] = {}
dc_models: Dict[str, Any] = {}

# ======== Utils ========
def _smart_read_csv(path: str) -> pd.DataFrame:
    for enc in ["utf-8", "latin1", "cp1252"]:
        try:
            return pd.read_csv(path, encoding=enc)
        except Exception:
            continue
    return pd.read_csv(path)

def _rename_with_aliases(df: pd.DataFrame) -> pd.DataFrame:
    df = df.rename(columns={c: c.strip() for c in df.columns})
    mapping = {
        "home_team": "home_team_name", "away_team": "away_team_name",
        "HomeTeam": "home_team_name", "AwayTeam": "away_team_name",
        "home_score": "home_team_goal_count", "away_score": "away_team_goal_count",
        "FTHG": "home_team_goal_count", "FTAG": "away_team_goal_count",
        "home_goals": "home_team_goal_count", "away_goals": "away_team_goal_count",
        "match_date": "date", "Date": "date", "fecha": "date", "utc_date": "date",
        "game_started_at": "date", "start_date": "date",
    }
    for k, v in mapping.items():
        if k in df.columns and v not in df.columns:
            df[v] = df[k]
    if "date" not in df.columns:
        df["date"] = pd.date_range("2018-01-01", periods=len(df), freq="D")
    else:
        df["date"] = pd.to_datetime(df["date"], errors="coerce").fillna(method="ffill")
    req = ["home_team_name", "away_team_name", "home_team_goal_count", "away_team_goal_count"]
    for r in req:
        if r not in df.columns:
            raise ValueError(f"Columna requerida no encontrada: {r}")
    return df[["date", "home_team_name", "away_team_name",
               "home_team_goal_count", "away_team_goal_count"]].copy()

def _load_all(build_models: bool = True) -> None:
    frames.clear(); teams_cache.clear()
    if build_models: dc_models.clear()
    for pretty, fname in LEAGUES_FILES.items():
        path = os.path.join(DATA_DIR, fname)
        if not os.path.exists(path):
            print(f"[SKIP] No encontrado: {path}"); continue
        try:
            raw = _smart_read_csv(path)
            df = _rename_with_aliases(raw)
            frames[pretty] = df
            teams_cache[pretty] = sorted(set(df["home_team_name"]).union(df["away_team_name"]))
            if build_models:
                try:
                    dc_models[pretty] = fit_dixon_coles(df, HALF_LIFE_DAYS, MAX_GOALS)
                    print(f"[OK] {pretty}: {len(df)} filas, {len(teams_cache[pretty])} equipos")
                except Exception as me:
                    print(f"[WARN] Modelo DC falló para {pretty}: {me}")
            else:
                print(f"[OK] {pretty}: {len(df)} filas, {len(teams_cache[pretty])} equipos (sin entrenar)")
        except Exception as e:
            print(f"[ERROR] Cargando {pretty}: {e}")

def _ensure_dc_model(league: str):
    if league in dc_models: return dc_models[league]
    if league not in frames: raise HTTPException(400, f"Liga no cargada: {league}")
    print(f"[INFO] Entrenando DC on-demand para {league}…")
    dc_models[league] = fit_dixon_coles(frames[league], HALF_LIFE_DAYS, MAX_GOALS)
    return dc_models[league]

def _best_pick_by_prob(mk: Dict[str,float], lam_h: float, lam_a: float) -> Dict[str,Any]:
    candidates = [
        ("1_&_U3_5", mk.get("1_&_U3_5",0)),
        ("2_&_U3_5", mk.get("2_&_U3_5",0)),
        ("BTTS", mk.get("BTTS",0)),
        ("O2_5", mk.get("O2_5",0)),
        ("1X", mk.get("1X",0)),
        ("X2", mk.get("X2",0)),
        ("1", mk.get("1",0)),
        ("2", mk.get("2",0)),
        ("U2_5", mk.get("U2_5",0)),
    ]
    market, prob = max(candidates, key=lambda x: x[1])
    conf = int(100 * min(0.95, max(0.0, abs(prob - 0.5) * 2)))
    why = [
        f"λ local {lam_h:.2f} vs λ visitante {lam_a:.2f} → tendencia de goles "
        f"{'alta' if lam_h+lam_a>2.6 else 'media' if lam_h+lam_a>2.2 else 'baja'}.",
        f"1X2: 1={mk.get('1',0)*100:.2f}% • X={mk.get('X',0)*100:.2f}% • 2={mk.get('2',0)*100:.2f}%.",
        f"O2.5={mk.get('O2_5',0)*100:.2f}% • U3.5={mk.get('U3_5',0)*100:.2f}% • BTTS={mk.get('BTTS',0)*100:.2f}%.",
    ]
    return {"market": market, "prob": prob, "confidence": conf, "why": why}

def _ev(odd: float, p: float) -> float:
    # EV para stake 1 con cuota decimal
    return p*odd - 1.0

def _kelly(odd: float, p: float) -> float:
    b = max(odd - 1.0, 1e-9); q = 1.0 - p
    f = ((b*p) - q) / b
    return max(0.0, float(f))

def _value_table(mk: Dict[str,float], odds: Dict[str,float]) -> List[Dict[str,Any]]:
    rows = []
    for k, odd in odds.items():
        if k not in mk: continue
        p = float(mk[k])
        fair = float(1.0/max(p,1e-9))
        ev = _ev(odd, p)
        kelly = _kelly(odd, p)
        rows.append({
            "market": k,
            "prob_model": p,
            "fair_odds": fair,
            "odd": odd,
            "edge_pct": (p - 1.0/odd)*100.0,
            "ev": ev,
            "kelly_frac": kelly
        })
    rows.sort(key=lambda r: r["ev"], reverse=True)
    return rows

def _hours_to_kickoff(kickoff_utc: Optional[str]) -> Optional[float]:
    if not kickoff_utc: return None
    try:
        ko = dt.datetime.fromisoformat(kickoff_utc.replace("Z","+00:00")).astimezone(dt.timezone.utc)
        now = dt.datetime.now(dt.timezone.utc)
        return round((ko - now).total_seconds() / 3600.0, 2)
    except Exception:
        return None

# ======== Modelos de request ========
class PredictBody(BaseModel):
    league: str
    home_team: str
    away_team: str
    kickoff_utc: Optional[str] = Field(None, description="ISO 8601 UTC, ej. 2025-05-20T19:00:00Z")
    # Cuotas opcionales (decimales). Puedes enviar cualquier subset.
    odds: Optional[Dict[str, float]] = Field(
        default=None,
        description="Ej: {'1':2.15,'X':3.3,'2':3.5,'O2_5':1.95,'U2_5':1.85,'BTTS':1.85,'NOBTTS':2.05,'U3_5':1.45,'O3_5':2.7}"
    )
    blend_with_market: bool = Field(default=True, description="Mezclar modelo con mercado en log-odds")
    with_ai: bool = Field(default=False, description="Incluir análisis IA (requiere OPENAI_API_KEY)")
    ai_model: str = Field(default="gpt-4o-mini", description="Modelo OpenAI (ej. gpt-4o-mini)")
    ai_lang: str = Field(default="es", description="Idioma del análisis IA")

# ======== Endpoints ========
@app.on_event("startup")
def _startup():
    _load_all(build_models=not SKIP_TRAIN_ON_STARTUP)

@app.get("/")
def root():
    return {"ok": True, "service": "Footy Predictions API", "docs": "/docs", "health": "/health"}

@app.get("/health")
def health():
    return {
        "ok": True,
        "leagues_loaded": list(frames.keys()),
        "dc_models_ready": list(dc_models.keys()),
        "skip_train_on_startup": SKIP_TRAIN_ON_STARTUP,
        "half_life_days": HALF_LIFE_DAYS,
    }

@app.get("/leagues")
def leagues():
    return {"leagues": list(frames.keys())}

@app.get("/teams")
def teams(league: str):
    if league not in teams_cache: raise HTTPException(400, f"Liga no encontrada: {league}")
    return {"league": league, "teams": teams_cache[league]}

@app.get("/refresh")
def refresh():
    _load_all(build_models=False)
    return {"ok": True, "refreshed": list(frames.keys())}

@app.post("/warmup")
def warmup():
    built = []
    for lg in frames.keys():
        if lg in dc_models: continue
        try:
            dc_models[lg] = fit_dixon_coles(frames[lg], HALF_LIFE_DAYS, MAX_GOALS)
            built.append(lg)
        except Exception as e:
            print(f"[WARMUP] fallo {lg}: {e}")
    return {"built": built, "total": len(built)}

def _blend_with_odds(mk: Dict[str,float], odds: Dict[str,float]) -> Tuple[Dict[str,float], Dict[str, Dict[str,float]]]:
    detail = {}
    if not odds: return mk, detail

    # 1X2
    trio = {k:odds[k] for k in ["1","X","2"] if k in odds}
    if len(trio) >= 2:  # si hay al menos 2, normalizamos igualmente
        imp = remove_overround(trio)
        for k in ["1","X","2"]:
            if k in imp:
                detail[k] = {"model": mk.get(k,0.0), "market": imp[k]}
                mk[k] = blend(mk.get(k,0.0), imp[k], w=0.6)

    # Pares: O/U 2.5
    pair = {k:odds[k] for k in ["O2_5","U2_5"] if k in odds}
    if len(pair) >= 2:
        imp = remove_overround(pair)
        for k in ["O2_5","U2_5"]:
            if k in imp:
                detail[k] = {"model": mk.get(k,0.0), "market": imp[k]}
                mk[k] = blend(mk.get(k,0.0), imp[k], w=0.6)

    # BTTS Sí/No
    pair = {k:odds[k] for k in ["BTTS","NOBTTS"] if k in odds}
    if len(pair) >= 2:
        imp = remove_overround(pair)
        if "BTTS" in imp:
            detail["BTTS"] = {"model": mk.get("BTTS",0.0), "market": imp["BTTS"]}
            mk["BTTS"] = blend(mk.get("BTTS",0.0), imp["BTTS"], w=0.6)

    # O/U 3.5 (si lo envían)
    pair = {k:odds[k] for k in ["O3_5","U3_5"] if k in odds}
    if len(pair) >= 2:
        imp = remove_overround(pair)
        for k in ["O3_5","U3_5"]:
            if k in imp:
                # si no tenemos O3_5 del modelo, aproximamos desde matriz total (mk["O3_5"] ya existe)
                detail[k] = {"model": mk.get(k,0.0), "market": imp[k]}
                mk[k] = blend(mk.get(k,0.0), imp[k], w=0.6)

    return mk, detail

def _ai_analysis(payload: Dict[str,Any], model_name: str, lang: str) -> str:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return "IA deshabilitada: falta OPENAI_API_KEY."
    try:
        try:
            from openai import OpenAI
            client = OpenAI(api_key=api_key)
            # nuevo SDK
            messages = [
                {"role":"system","content":(
                    "Eres un analista profesional de apuestas deportivas. "
                    "Hablas en español claro, sintetizas en 6-10 viñetas. "
                    "Evita lenguaje de venta y recuerda que son probabilidades, no garantías. "
                    "Cita cifras clave (probabilidades %, λ, EV/edge) y su interpretación. "
                    "Si las cuotas son tempranas o faltan, advierte la incertidumbre. "
                    "Termina con 1-3 picks con justificación y riesgos.")},
                {"role":"user","content": json.dumps(payload, ensure_ascii=False)}
            ]
            resp = client.chat.completions.create(
                model=model_name,
                temperature=0.25,
                max_tokens=800,
                messages=messages,
            )
            return resp.choices[0].message.content.strip()
        except Exception:
            import openai as openai_legacy
            openai_legacy.api_key = api_key
            resp = openai_legacy.ChatCompletion.create(
                model=model_name,
                temperature=0.25,
                max_tokens=800,
                messages=[
                    {"role":"system","content":"Eres un analista profesional de apuestas deportivas en español."},
                    {"role":"user","content": json.dumps(payload, ensure_ascii=False)}
                ]
            )
            return resp.choices[0].message["content"].strip()
    except Exception as e:
        return f"IA no disponible: {e}"

@app.post("/predict")
def predict(body: PredictBody):
    league = body.league
    if league not in frames: raise HTTPException(400, f"Liga no cargada: {league}")
    df = frames[league]

    pool = set(df["home_team_name"]).union(df["away_team_name"])
    if body.home_team not in pool: raise HTTPException(400, f"Local no encontrado en {league}")
    if body.away_team not in pool: raise HTTPException(400, f"Visitante no encontrado en {league}")

    model = _ensure_dc_model(league)
    P, lam_h, lam_a = score_matrix(model, body.home_team, body.away_team)
    mk = markets_from_matrix(P)  # probabilidades del modelo

    # Mezcla con mercado si mandan cuotas
    blend_detail = {}
    if body.odds and body.blend_with_market:
        mk, blend_detail = _blend_with_odds(mk, body.odds)

    # Tabla de valor (EV/Kelly) si mandan cuotas
    value_table = _value_table(mk, body.odds) if body.odds else []

    best_prob = _best_pick_by_prob(mk, lam_h, lam_a)
    best_value = value_table[0] if value_table and value_table[0]["ev"] > 0 else None

    # Top marcadores para la UI
    flat = []
    for i in range(P.shape[0]):
        for j in range(P.shape[1]):
            flat.append((i, j, float(P[i, j])))
    top_scores = sorted(flat, key=lambda x: x[2], reverse=True)[:10]

    hours_left = _hours_to_kickoff(body.kickoff_utc)
    legend = "Sugerencia: ingresa las cuotas ~5 horas antes del partido para un cálculo más preciso."
    if hours_left is not None:
        legend += f" Faltan {hours_left} h para el inicio."

    # IA (opcional)
    ai_text = None
    if body.with_ai:
        ai_payload = {
            "partido": {
                "liga": league,
                "local": body.home_team,
                "visitante": body.away_team,
                "kickoff_utc": body.kickoff_utc,
            },
            "lambda": {"local": round(lam_h,2), "visitante": round(lam_a,2)},
            "mercados": {k: round(v,4) for k,v in mk.items()},
            "mejor_por_prob": best_prob,
            "cuotas": body.odds or {},
            "value_table_top": value_table[:5],
            "nota": "No es asesoría financiera; usa stake responsable."
        }
        ai_text = _ai_analysis(ai_payload, body.ai_model, body.ai_lang)

    return {
        "league": league,
        "home_team": body.home_team,
        "away_team": body.away_team,
        "lambda_home": lam_h,
        "lambda_away": lam_a,
        "markets": mk,
        "best_pick_prob": best_prob,
        "best_value_pick": best_value,
        "value_table": value_table[:12],
        "top_scores": [{"home": i, "away": j, "p": p} for i,j,p in top_scores],
        "blend_detail": blend_detail or None,
        "legend": legend,
        "ai_analysis": ai_text,
        "note": "Modelo Dixon-Coles + recencia; probabilidades, no garantías."
    }
