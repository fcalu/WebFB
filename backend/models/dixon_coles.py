# -*- coding: utf-8 -*-
import numpy as np
import pandas as pd
from scipy.optimize import minimize
from math import exp, log, lgamma, factorial

def dc_correction(i, j, lam_h, lam_a, rho):
    # Corrección Dixon-Coles solo para marcadores bajos (0 y 1)
    if i == 0 and j == 0:
        return 1 - lam_h*lam_a*rho
    if i == 0 and j == 1:
        return 1 + lam_h*rho
    if i == 1 and j == 0:
        return 1 + lam_a*rho
    if i == 1 and j == 1:
        return 1 - rho
    return 1.0

def _indexers(teams):
    idx = {t:i for i,t in enumerate(teams)}
    return idx, len(teams)

def fit_dixon_coles(df: pd.DataFrame, half_life_days: int = 180, max_goals: int = 10):
    """
    df columnas requeridas (con esos nombres):
      date, home_team_name, away_team_name, home_team_goal_count, away_team_goal_count
    """
    df = df.copy()
    df["date"] = pd.to_datetime(df["date"])
    teams = sorted(set(df.home_team_name).union(df.away_team_name))
    t_idx, T = _indexers(teams)

    latest = df["date"].max()
    age = (latest - df["date"]).dt.days.clip(lower=0)
    w = np.exp(-np.log(2) * age / max(1, half_life_days))
    w = w.values

    h = df["home_team_name"].map(t_idx).values
    a = df["away_team_name"].map(t_idx).values
    gh = df["home_team_goal_count"].values.astype(int)
    ga = df["away_team_goal_count"].values.astype(int)

    # parámetros: ataque[T], defensa[T], home_adv, rho
    n_params = 2*T + 2
    x0 = np.zeros(n_params)
    x0[-2] = 0.25   # home advantage inicial
    x0[-1] = 0.05   # rho inicial

    def unpack(x):
        att = x[:T]
        deff = x[T:2*T]
        home = x[-2]
        rho = np.tanh(x[-1]) * 0.2     # acota rho ≈ (-0.2, 0.2)
        att = att - np.mean(att)       # identifiability
        return att, deff, home, rho

    def neg_log_like(x):
        att, deff, home, rho = unpack(x)
        lam_h = np.exp(home + att[h] - deff[a])
        lam_a = np.exp(att[a] - deff[h])
        ll = 0.0
        for gh_i, ga_i, l1, l2, wi in zip(gh, ga, lam_h, lam_a, w):
            base = (-l1 + gh_i*log(l1) - lgamma(gh_i+1)) + (-l2 + ga_i*log(l2) - lgamma(ga_i+1))
            corr = dc_correction(gh_i, ga_i, l1, l2, rho)
            ll += wi * (base + log(max(corr, 1e-12)))
        return -ll

    res = minimize(neg_log_like, x0, method="L-BFGS-B")
    att, deff, home, rho = unpack(res.x)

    return {
        "teams": teams,
        "attack": att, "defence": deff,
        "home_adv": home, "rho": rho,
        "max_goals": max_goals
    }

def score_matrix(model, home_team: str, away_team: str):
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
            P[i, j] = base * dc_correction(i, j, lam_h, lam_a, rho)
    P /= P.sum()  # normaliza por truncamiento
    return P, lam_h, lam_a
