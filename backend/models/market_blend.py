# -*- coding: utf-8 -*-
import numpy as np

def remove_overround(odds: dict[str, float]) -> dict[str, float]:
    inv = {k: 1.0/max(v, 1e-9) for k, v in odds.items()}
    s = sum(inv.values())
    return {k: inv[k]/s for k in inv}

def logit(p): 
    p = float(np.clip(p, 1e-6, 1-1e-6))
    return np.log(p/(1-p))

def inv_logit(z):
    return float(1/(1+np.exp(-z)))

def blend(p_model: float, p_market: float, w: float = 0.6) -> float:
    return inv_logit(w*logit(p_model) + (1-w)*logit(p_market))
