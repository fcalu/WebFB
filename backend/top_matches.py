# backend/top_matches.py
import os, json, re
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from typing import Dict, Any, List, Optional

# OpenAI SDK v1.x
from openai import OpenAI

# ========= CONFIG BÁSICA =========
TZ = ZoneInfo("America/Mexico_City")
REQUIRED = ["home","away","competition","country","kickoff_local","kickoff_utc","sources"]

def _default_date_str() -> str:
    return (datetime.now(TZ).date() + timedelta(days=1)).isoformat()

def _prompt_for(target_date: str) -> str:
    return (
        f"Devuélveme EXACTAMENTE 8 partidos de fútbol masculino para el {target_date}, "
        "ordenados por relevancia para audiencia en México. Prioriza selecciones, UEFA (CL/EL/Conf), "
        "Premier, LaLiga, Serie A, Bundesliga, Ligue 1, CONMEBOL/CONCACAF y clásicos relevantes. "
        "Convierte la hora a America/Mexico_City (HH:MM 24h) e incluye también hora UTC. "
        "NO inventes. Usa búsqueda web (web_search) y coloca 1–3 URLs REALES por partido en 'sources'. "
        "Evita duplicados. Responde SOLO un JSON con este formato EXACTO:\n\n"
        "{\n"
        '  "date": "YYYY-MM-DD",\n'
        '  "timezone": "America/Mexico_City",\n'
        '  "matches": [\n'
        "    {\n"
        '      "home": "Equipo",\n'
        '      "away": "Equipo",\n'
        '      "competition": "Liga/Torneo",\n'
        '      "country": "País del torneo",\n'
        '      "kickoff_local": "HH:MM",\n'
        '      "kickoff_utc": "HH:MM",\n'
        '      "tv_mexico": "canal/plataforma si aplica",\n'
        '      "importance_score": 0,\n'
        '      "rationale": "máx 40 palabras",\n'
        '      "sources": ["https://...","https://..."]\n'
        "    }\n"
        "  ]\n"
        "}\n"
        "Si algún partido no tiene fuentes o la fecha no coincide EXACTAMENTE, descártalo y elige otro."
    )

def _parse_json_loose(text: str) -> Dict[str, Any]:
    m = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not m:
        raise ValueError("No se detectó JSON en la salida del modelo.")
    return json.loads(m.group(0))

def _repair_json_to_schema(client: OpenAI, raw_text_or_data: Any) -> Dict[str, Any]:
    src = raw_text_or_data if isinstance(raw_text_or_data, str) else json.dumps(raw_text_or_data, ensure_ascii=False)
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        response_format={"type": "json_object"},
        temperature=0,
        messages=[
            {"role": "system", "content": "Reforma este texto a JSON válido. No inventes partidos nuevos."},
            {"role": "user", "content": src},
        ],
    )
    return json.loads(resp.choices[0].message.content)

def _validate(payload: Dict[str, Any], target_date: str) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("Payload no es dict.")
    payload.setdefault("date", target_date)
    payload.setdefault("timezone", "America/Mexico_City")
    matches = payload.get("matches", [])
    if len(matches) != 8:
        raise ValueError(f"Se recibieron {len(matches)} partidos; se requieren 8.")
    seen = set()
    for i, m in enumerate(matches, 1):
        for k in REQUIRED:
            if not m.get(k):
                raise ValueError(f"Partido {i} carece del campo requerido '{k}'.")
        pair = (m["home"].strip().lower(), m["away"].strip().lower())
        if pair in seen:
            raise ValueError(f"Partido duplicado (home/away) en índice {i}.")
        seen.add(pair)
        srcs = m.get("sources", [])
        if not all(isinstance(u, str) and u.startswith(("http://","https://")) for u in srcs):
            raise ValueError(f"Partido {i} con 'sources' inválidas.")
    return payload

def top_matches_payload(target_date: Optional[str] = None) -> Dict[str, Any]:
    """
    Devuelve un dict con:
      { "date": "YYYY-MM-DD", "timezone":"America/Mexico_City", "matches":[ ... 8 items ... ] }
    Si falla (tool no disponible, etc), devuelve matches:[] (no inventa).
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY no está configurada.")
    client = OpenAI(api_key=api_key)

    target = target_date or _default_date_str()

    # Puedes desactivar búsqueda web si hace falta:
    if os.getenv("USE_WEB_SEARCH", "1") == "0":
        return {"date": target, "timezone": "America/Mexico_City", "matches": []}

    try:
        r = client.responses.create(
            model="gpt-4o-mini",
            tools=[{"type": "web_search"}],
            input=[
                {"role": "system",
                 "content": "Eres editor deportivo para México. Responde SOLO JSON válido. Verifica fechas en fuentes."},
                {"role": "user", "content": _prompt_for(target)},
            ],
            max_output_tokens=1800,
        )
        text = getattr(r, "output_text", None) or r.output[0].content[0].text
        try:
            data = _parse_json_loose(text)
        except Exception:
            data = _repair_json_to_schema(client, text)
        data = _validate(data, target)
        return data
    except Exception as e:
        # No inventamos nada si falla web_search o formato.
        return {"date": target, "timezone": "America/Mexico_City", "matches": [], "error": str(e)}
