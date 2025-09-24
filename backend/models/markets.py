# -*- coding: utf-8 -*-
import numpy as np

def markets_from_matrix(P: np.ndarray):
    i = np.arange(P.shape[0])[:, None]
    j = np.arange(P.shape[1])[None, :]

    p_home = P[i > j].sum()
    p_draw = P[i == j].sum()
    p_away = P[i < j].sum()

    over = lambda x: P[(i + j) > x].sum()
    under = lambda x: P[(i + j) <= x].sum()

    res = {
        "1": p_home, "X": p_draw, "2": p_away,
        "O1_5": over(1), "U1_5": under(1),
        "O2_5": over(2), "U2_5": under(2),
        "O3_5": over(3), "U3_5": under(3),
        "BTTS": P[(i > 0) & (j > 0)].sum(),
        "1X": p_home + p_draw,
        "12": p_home + p_away,
        "X2": p_draw + p_away,
    }
    # Combos “Gana & U3.5 / O2.5”
    res["1_&_U3_5"] = P[(i > j) & ((i + j) <= 3)].sum()
    res["1_&_O2_5"] = P[(i > j) & ((i + j) > 2)].sum()
    res["2_&_U3_5"] = P[(i < j) & ((i + j) <= 3)].sum()
    res["2_&_O2_5"] = P[(i < j) & ((i + j) > 2)].sum()
    return res
