# backend/advanced_models.py
# ------------------------------------------------------------
# Ensamble ligero sin dependencias extra:
# - Poisson con ajuste Dixon–Coles (decaimiento temporal)
# - Elo rápido por liga (home adv)
# - Ajuste con xG si existen columnas de xG
# - Mezcla con cuotas (log-odds) si el usuario las ingresa
# - Selección de pick por EV y confianza
#
# Devuelve dicts listos para construir el PredictOut.
# Si algo no está disponible (fechas/xG/odds), hace fallback suave.
# ------------------------------------------------------------
from __future__ import annotations

import math
import numpy as np
import pandas as pd
from typing import Dict, Optional, Tuple, List
from scipy.stats import poisson

# --- Parámetros tunables (se pueden sobre-escribir con os.getenv desde app si quieres)
DC_DECAY = 0.003          # decaimiento temporal (por día) para medias de goles
ELO_K = 20.0              # K de Elo
ELO_HOME_BONUS = 50.0     # ventaja de casa en puntos elo
ELO_SCALE = 400.0         # escala de logistic para Elo
ELO_GOAL_BONUS = 1.0      # opcional, extra por diferencia de goles
ELO_TO_XG_ALPHA = 0.1     # cuánto influye elo_diff en lambdas (e^ (alpha * elo_diff/scale))
XG_BLEND = 0.35           # mezcla de lambdas con xG si existen columnas xG
MARKET_W_NEAR = 0.40      # peso de mercado si el partido está “cerca”
MARKET_W_FAR = 0.20       # peso de mercado si muy lejos (o sin hora)
OVER25_LINE = 2.5         # línea para over
KMAX = 7                  # tamaño de matriz Poisson

# --- Columnas flexibles para xG (usamos las que existan)
XG_HOME_CAND = [
    "team_a_xg", "Home Team Pre-Match xG", "home_xg", "home_team_xg"
]
XG_AWAY_CAND = [
    "team_b_xg", "Away Team Pre-Match xG", "away_xg", "away_team_xg"
]

# --- Columnas de fecha (para decaimiento / orden)
DATE_CAND = ["date_GMT", "timestamp"]


def _parse_date_col(df: pd.DataFrame) -> Optional[pd.Series]:
    """Devuelve una Serie datetime si hay columna usable."""
    for c in DATE_CAND:
        if c in df.columns:
            s = pd.to_datetime(df[c], errors="coerce", utc=True)
            if s.notna().any():
                return s
    return None


def _days_ago_weights(dates: Optional[pd.Series], decay: float) -> pd.Series:
    """Pesos por decaimiento temporal e^{-decay * days}."""
    if dates is None or dates.isna().all():
        return pd.Series(np.ones(len(dates) if dates is not None else 0), index=dates.index if dates is not None else None)
    now = pd.Timestamp.utcnow()
    days = (now - dates).dt.total_seconds() / 86400.0
    days = days.fillna(days.max() if len(days) else 0.0)
    w = np.exp(-decay * days)
    return w


def _league_means(df: pd.DataFrame) -> Tuple[float, float]:
    hg = float(pd.to_numeric(df.get("home_team_goal_count", 0), errors="coerce").fillna(0).mean() or 0.0)
    ag = float(pd.to_numeric(df.get("away_team_goal_count", 0), errors="coerce").fillna(0).mean() or 0.0)
    return max(hg, 0.05), max(ag, 0.05)


def _weighted_team_means(df: pd.DataFrame, w: pd.Series) -> pd.DataFrame:
    """Medias ponderadas home/away a favor y en contra por equipo."""
    d = df.copy()
    for col in [
        "home_team_goal_count","away_team_goal_count",
        "home_team_name","away_team_name"
    ]:
        if col not in d.columns:
            d[col] = 0

    d["_w"] = (w if (w is not None and len(w)==len(d)) else 1.0)

    # home side
    h = d.groupby("home_team_name").apply(
        lambda g: pd.Series({
            "home_for": np.average(pd.to_numeric(g["home_team_goal_count"], errors="coerce").fillna(0), weights=g["_w"]),
            "home_against": np.average(pd.to_numeric(g["away_team_goal_count"], errors="coerce").fillna(0), weights=g["_w"]),
        })
    )

    # away side
    a = d.groupby("away_team_name").apply(
        lambda g: pd.Series({
            "away_for": np.average(pd.to_numeric(g["away_team_goal_count"], errors="coerce").fillna(0), weights=g["_w"]),
            "away_against": np.average(pd.to_numeric(g["home_team_goal_count"], errors="coerce").fillna(0), weights=g["_w"]),
        })
    )

    m = h.join(a, how="outer").fillna(0.0)
    return m


def _team_xg_means(df: pd.DataFrame) -> pd.DataFrame:
    """Medias de xG por equipo (si hay columnas)."""
    d = df.copy()
    for col in ["home_team_name","away_team_name"]:
        if col not in d.columns:
            d[col] = ""

    # detectar columnas de xG
    hxg_col = next((c for c in XG_HOME_CAND if c in d.columns), None)
    axg_col = next((c for c in XG_AWAY_CAND if c in d.columns), None)

    if not hxg_col or not axg_col:
        # no xG
        idx = pd.Index(sorted(set(list(d["home_team_name"]) + list(d["away_team_name"]))), name=None)
        return pd.DataFrame(index=idx, data={"home_xg":0.0, "away_xg":0.0})

    d["hxg"] = pd.to_numeric(d[hxg_col], errors="coerce").fillna(0.0)
    d["axg"] = pd.to_numeric(d[axg_col], errors="coerce").fillna(0.0)

    h = d.groupby("home_team_name")["hxg"].mean().rename("home_xg")
    a = d.groupby("away_team_name")["axg"].mean().rename("away_xg")
    m = h.to_frame().join(a.to_frame(), how="outer").fillna(0.0)
    return m


def _elo_table(df: pd.DataFrame) -> Dict[str, float]:
    """Elo simple por liga (ordenado por fecha si existe)."""
    d = df.copy()
    for col in ["home_team_name","away_team_name","home_team_goal_count","away_team_goal_count"]:
        if col not in d.columns:
            d[col] = 0

    order = _parse_date_col(d)
    if order is not None:
        d = d.loc[order.sort_values().index]
    # arranque
    elo: Dict[str,float] = {}
    def get_elo(t: str) -> float:
        return elo.get(t, 1500.0)

    for _, r in d.iterrows():
        h, a = str(r["home_team_name"]), str(r["away_team_name"])
        hg = float(pd.to_numeric(r["home_team_goal_count"], errors="coerce") or 0.0)
        ag = float(pd.to_numeric(r["away_team_goal_count"], errors="coerce") or 0.0)

        Eh = 1.0 / (1.0 + 10.0 ** ( ((get_elo(a) - (get_elo(h)+ELO_HOME_BONUS)))/ELO_SCALE ))
        out = 0.5
        if hg > ag: out = 1.0
        elif hg < ag: out = 0.0

        # opcional: considerar margen de victoria en la actualización
        margin = abs(hg - ag)
        k = ELO_K * (1.0 + ELO_GOAL_BONUS * margin)

        elo[h] = get_elo(h) + k * (out - Eh)
        elo[a] = get_elo(a) + k * ((1.0-out) - (1.0-Eh))
    return elo


def _poisson_matrix(lh: float, la: float, kmax: int = KMAX) -> np.ndarray:
    i = np.arange(0, kmax + 1)
    j = np.arange(0, kmax + 1)
    ph = poisson.pmf(i, lh).reshape(-1, 1)
    pa = poisson.pmf(j, la).reshape(1, -1)
    M = ph @ pa
    return M / M.sum()


def _market_to_prob(odds: Optional[float]) -> Optional[float]:
    if not odds or odds <= 0.0:
        return None
    return 1.0 / float(odds)


def _mix_logodds(p_model: float, p_market: Optional[float], weight: float) -> float:
    """Mezcla en log-odds: logit^-1((1-w)*logit(model)+w*logit(market))"""
    pm = min(max(p_model, 1e-6), 1-1e-6)
    if p_market is None:
        return pm
    qm = min(max(p_market, 1e-6), 1-1e-6)
    def logit(x): return math.log(x/(1-x))
    def inv(z):   return 1.0/(1.0+math.exp(-z))
    z = (1.0-weight)*logit(pm) + weight*logit(qm)
    return inv(z)


def try_advanced_predict(
    league_name: str,
    home: str,
    away: str,
    odds: Dict[str, float],
    store,
) -> Optional[Dict[str, object]]:
    """
    Devuelve dict listo para construir PredictOut:
      { 'probs': {...}, 'poisson': {...}, 'averages': {...}, 'best_pick': {...}, 'summary': '...' }
    Si falta algo crítico, retorna None y que app haga fallback.
    """
    df = store.df.copy()
    if home not in store.team_stats.index or away not in store.team_stats.index:
        return None

    # pesos temporales (Dixon–Coles)
    dates = _parse_date_col(df)
    w = _days_ago_weights(dates, DC_DECAY)

    # medias liga
    Lh, La = _league_means(df)

    # intensidades equipo ponderadas por tiempo
    tm = _weighted_team_means(df, w)
    # si faltaran equipos, fallo suave
    if home not in tm.index or away not in tm.index:
        return None

    # xG (si existe)
    xg = _team_xg_means(df)

    # Elo
    try:
        elo = _elo_table(df)
    except Exception:
        elo = {}

    elo_h = elo.get(home, 1500.0)
    elo_a = elo.get(away, 1500.0)
    elo_diff = (elo_h + ELO_HOME_BONUS) - elo_a
    elo_factor = math.exp(ELO_TO_XG_ALPHA * (elo_diff / ELO_SCALE))
    # elo_factor >1 favorece al local en goles esperados

    # lambdas base por ataque/defensa relativo (home vs away)
    home_att = (tm.loc[home, "home_for"] / Lh) if Lh > 0 else 1.0
    away_def = (tm.loc[away, "away_against"] / Lh) if Lh > 0 else 1.0
    away_att = (tm.loc[away, "away_for"] / La) if La > 0 else 1.0
    home_def = (tm.loc[home, "home_against"] / La) if La > 0 else 1.0

    lam_h = Lh * (0.55*home_att + 0.45*away_def)
    lam_a = La * (0.55*away_att + 0.45*home_def)

    # ajuste por Elo
    lam_h *= elo_factor
    lam_a /= elo_factor

    # mezcla con xG si existen
    hxg = float(xg.loc[home, "home_xg"]) if home in xg.index else 0.0
    axg = float(xg.loc[away, "away_xg"]) if away in xg.index else 0.0
    if hxg > 0 or axg > 0:
        lam_h = (1.0 - XG_BLEND) * lam_h + XG_BLEND * hxg
        lam_a = (1.0 - XG_BLEND) * lam_a + XG_BLEND * axg

    # seguridad numérica
    lam_h = max(lam_h, 0.05)
    lam_a = max(lam_a, 0.05)

    # Poisson
    M = _poisson_matrix(lam_h, lam_a, kmax=KMAX)
    kmax = KMAX
    # 1X2
    p1 = float(np.tril(M, -1).sum())
    px = float(np.trace(M))
    p2 = float(np.triu(M, 1).sum())
    # Over 2.5 y BTTS
    p_over = float(sum(M[i, j] for i in range(kmax+1) for j in range(kmax+1) if (i+j) >= OVER25_LINE))
    p_btts = float(sum(M[i, j] for i in range(1, kmax+1) for j in range(1, kmax+1)))

    # mezclar con mercado (si hay)
    # peso depende de si hay fecha cercana (si no, usamos peso bajo)
    w_market = MARKET_W_FAR
    if dates is not None and len(dates):
        # si el último registro es muy reciente no dice mucho del kickoff,
        # así que usamos peso por defecto; para algo más fino necesitarías
        # recibir kickoff del partido. Dejamos w_market=MARKET_W_NEAR si hay odds (usuario lo hace cerca del partido)
        if odds:
            w_market = MARKET_W_NEAR

    q1 = _market_to_prob(odds.get("1")) if odds else None
    qx = _market_to_prob(odds.get("X")) if odds else None
    q2 = _market_to_prob(odds.get("2")) if odds else None
    qO = _market_to_prob(odds.get("O2_5")) if odds else None

    p1b   = _mix_logodds(p1,   q1, w_market)
    pxb   = _mix_logodds(px,   qx, w_market)
    p2b   = _mix_logodds(p2,   q2, w_market)
    pO25b = _mix_logodds(p_over, qO, w_market)
    pBTTS = p_btts  # lo dejamos sin mezcla (casas no siempre dan BTTS con misma certidumbre)

    # marcadores más probables
    pairs = [((i, j), float(M[i, j])) for i in range(kmax+1) for j in range(kmax+1)]
    pairs.sort(key=lambda x: x[1], reverse=True)
    top = [{"score": f"{a}-{b}", "pct": round(p*100, 2)} for (a, b), p in pairs[:5]]

    # promedios extras (tarjetas/córners si existen en store)
    extras = store.get_additional_avgs(home, away)

    # elegir mejor pick (EV si hay cuotas)
    reasons: List[str] = [
        f"λ_home={lam_h:.2f}, λ_away={lam_a:.2f} (DC/Elo/xG).",
        f"Elo Δ={elo_diff:+.0f}, xG_home~{hxg:.2f}, xG_away~{axg:.2f}.",
    ]

    best_market, best_sel, best_p = "1X2", "1", p1b
    if p2b > best_p:
        best_market, best_sel, best_p = "1X2", "2", p2b
    if pxb > best_p:
        best_market, best_sel, best_p = "1X2", "X", pxb
    if pO25b > best_p:
        best_market, best_sel, best_p = "Over 2.5", "Sí", pO25b

    # EV si hay cuotas
    def ev(prob: float, odd: Optional[float]) -> Optional[float]:
        if not odd or odd <= 1.0:
            return None
        return prob * odd - 1.0

    best_ev = None
    if odds:
        cands = []
        for k, p in [("1", p1b), ("X", pxb), ("2", p2b)]:
            e = ev(p, odds.get(k))
            if e is not None:
                cands.append(("1X2", k, p, e, odds.get(k)))
        e = ev(pO25b, odds.get("O2_5"))
        if e is not None:
            cands.append(("Over 2.5", "Sí", pO25b, e, odds.get("O2_5")))
        if cands:
            cands.sort(key=lambda x: (x[3], x[2]), reverse=True)  # ordena por EV y prob
            if cands[0][3] > 0:
                best_market, best_sel, best_p, best_ev, best_odd = cands[0]
                reasons.append(f"EV {best_ev:+.2f} con cuota {best_odd:.2f}.")

    # confianza simple
    conf = max(0.0, min(1.0, abs(best_p - 0.5) * 2.0))
    confidence = round(conf * 100.0, 2)

    probs = {
        "home_win_pct": round(p1b*100, 2),
        "draw_pct": round(pxb*100, 2),
        "away_win_pct": round(p2b*100, 2),
        "over_2_5_pct": round(pO25b*100, 2),
        "btts_pct": round(pBTTS*100, 2),
        "o25_mlp_pct": round(pO25b*100, 2),  # compat con front
    }
    poisson_info = {
        "home_lambda": round(lam_h, 3),
        "away_lambda": round(lam_a, 3),
        "top_scorelines": top,
    }
    averages = {
        "total_yellow_cards_avg": round(extras["total_yellow_cards_avg"], 2),
        "total_corners_avg": round(extras["total_corners_avg"], 2),
        "corners_mlp_pred": round(extras["total_corners_avg"], 2),
    }
    best_pick = {
        "market": best_market,
        "selection": best_sel,
        "prob_pct": round(best_p*100, 2),
        "confidence": confidence,
        "reasons": reasons,
    }
    summary = (
        f"Partido: {home} vs {away}. Pick: {best_market} – {best_sel} "
        f"(prob {best_p*100:.2f}%, conf {confidence:.0f}/100)."
    )

    return {
        "probs": probs,
        "poisson": poisson_info,
        "averages": averages,
        "best_pick": best_pick,
        "summary": summary,
    }
