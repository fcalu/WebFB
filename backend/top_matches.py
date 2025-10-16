# backend/top_matches.py
# === stdlib ===
import os
import json
import re
from datetime import datetime, timedelta

# === terceros ===
from openai import OpenAI
from tenacity import retry, wait_exponential, stop_after_attempt
from zoneinfo import ZoneInfo # Estándar moderno para timezones

# El cliente se inicializa una vez y reutiliza la variable de entorno OPENAI_API_KEY
_openai_client = OpenAI()

# --- Constantes y Configuración ---
MEXICO_TZ = ZoneInfo("America/Mexico_City")
SCHEMA_KEYS_REQUIRED = ["home", "away", "competition", "country", "kickoff_local", "kickoff_utc", "sources"]

# --- Funciones de Ayuda ---

def _get_prompt_for_date(target_date: str) -> str:
    """Genera el prompt de usuario para la fecha especificada."""
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
        '      "sources": ["https://..."]\n'
        "    }\n"
        "  ]\n"
        "}\n"
        "Si algún partido no tiene fuentes o la fecha no coincide EXACTAMENTE, descártalo y elige otro."
    )

@retry(wait=wait_exponential(multiplier=1, min=2, max=10), stop=stop_after_attempt(3))
def _fetch_from_openai(prompt: str) -> str:
    """Llama a la API de OpenAI pidiendo JSON y usando web_search, con reintentos."""
    completion = _openai_client.chat.completions.create(
        model="gpt-4o-mini",
        response_format={"type": "json_object"},
        tools=[{"type": "web_search"}],
        messages=[
            {"role": "system", "content": "Eres un editor deportivo para México. Responde SOLO JSON válido y estructurado. No agregues texto fuera del JSON. Verifica las fechas en las fuentes."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.2,
        max_tokens=2048,
    )
    content = completion.choices[0].message.content
    if not content:
        raise ValueError("La respuesta de la API de OpenAI vino vacía.")
    return content

def _validate_payload(payload: dict, target_date: str) -> dict:
    """Valida que el payload de la IA cumpla con los requisitos del esquema."""
    if not isinstance(payload, dict):
        raise TypeError("El payload no es un diccionario JSON válido.")

    payload.setdefault("date", target_date)
    payload.setdefault("timezone", str(MEXICO_TZ))
    matches = payload.get("matches", [])

    if not isinstance(matches, list) or len(matches) != 8:
        raise ValueError(f"Se esperaban 8 partidos, pero se recibieron {len(matches)}.")

    seen_pairs = set()
    for i, match in enumerate(matches, 1):
        if not isinstance(match, dict):
            raise TypeError(f"El partido en el índice {i} no es un objeto válido.")
        
        for key in SCHEMA_KEYS_REQUIRED:
            if key not in match or not match[key]:
                raise ValueError(f"El partido {i} no tiene el campo requerido o está vacío: '{key}'.")
        
        # Validación de URLs en sources
        sources = match.get("sources", [])
        if not all(isinstance(url, str) and url.startswith(("http://", "https://")) for url in sources):
            raise ValueError(f"El partido {i} tiene 'sources' inválidas. Deben ser URLs completas.")

        # Chequeo de duplicados
        home_away_pair = (str(match["home"]).strip().lower(), str(match["away"]).strip().lower())
        if home_away_pair in seen_pairs:
            raise ValueError(f"Partido duplicado encontrado en el índice {i}: {match['home']} vs {match['away']}.")
        seen_pairs.add(home_away_pair)

    return payload

# --- Función Principal (importada por app.py) ---

def top_matches_payload(date: str | None = None) -> dict:
    """
    Función principal que obtiene y valida 8 partidos de fútbol para una fecha.
    Si la fecha es None, usa el día de mañana.
    """
    try:
        if date and re.match(r"^\d{4}-\d{2}-\d{2}$", date):
            target_date = date
        else:
            tomorrow = datetime.now(MEXICO_TZ).date() + timedelta(days=1)
            target_date = tomorrow.isoformat()
    except Exception:
        # Fallback si la fecha es inválida
        tomorrow = datetime.now(MEXICO_TZ).date() + timedelta(days=1)
        target_date = tomorrow.isoformat()
        
    fallback_payload = {
        "date": target_date,
        "timezone": str(MEXICO_TZ),
        "matches": []
    }

    try:
        prompt = _get_prompt_for_date(target_date)
        raw_json_str = _fetch_from_openai(prompt)
        payload = json.loads(raw_json_str)
        validated_payload = _validate_payload(payload, target_date)
        return validated_payload
    except Exception as e:
        print(f"[ERROR] No se pudo generar top_matches para {target_date}: {type(e).__name__} - {e}", file=sys.stderr)
        return fallback_payload
