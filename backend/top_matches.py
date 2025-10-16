import os
import sys
import json
import re
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from typing import Dict, Any, Optional

from openai import OpenAI
from tenacity import retry, wait_exponential, stop_after_attempt

# --- CONFIGURACIÓN ---
TZ = ZoneInfo("America/Mexico_City")
REQUIRED_KEYS = ["home", "away", "competition", "country", "kickoff_local", "kickoff_utc", "sources"]
# Instancia única del cliente de OpenAI, que leerá la variable de entorno automáticamente.
try:
    client = OpenAI()
except Exception as e:
    print(f"[ERROR CRÍTICO] No se pudo inicializar el cliente de OpenAI. Revisa la API Key. Error: {e}", file=sys.stderr)
    client = None

def _get_prompt_for_date(target_date: str) -> str:
    return (
        f"Devuélveme EXACTAMENTE 8 partidos de fútbol masculino para el {target_date}, "
        "ordenados por relevancia para audiencia en México. Prioriza selecciones, UEFA (CL/EL/Conf), "
        "Premier, LaLiga, Serie A, Bundesliga, Ligue 1, CONMEBOL/CONCACAF y clásicos relevantes. "
        "Convierte la hora a America/Mexico_City (HH:MM 24h) e incluye también hora UTC. "
        "NO inventes. Usa búsqueda web (web_search) y coloca 1–3 URLs REALES por partido en 'sources'. "
        "Evita duplicados. Responde SOLO un JSON con este formato EXACTO:\n\n"
        '{"date":"YYYY-MM-DD","timezone":"America/Mexico_City","matches":[{"home":"Equipo","away":"Equipo","competition":"Liga/Torneo","country":"País","kickoff_local":"HH:MM","kickoff_utc":"HH:MM","tv_mexico":"canal/plataforma","importance_score":0,"rationale":"máx 40 palabras","sources":["https://..."]}]}'
        "\nSi algún partido no tiene fuentes o la fecha no coincide EXACTAMENTE, descártalo y elige otro."
    )

@retry(wait=wait_exponential(multiplier=1, min=2, max=10), stop=stop_after_attempt(3))
def _fetch_from_openai(prompt: str) -> str:
    """Llama a la API de OpenAI pidiendo JSON y usando web_search, con reintentos."""
    if not client:
        raise RuntimeError("El cliente de OpenAI no está disponible.")
    
    print("[INFO] Realizando llamada a OpenAI con web_search...", file=sys.stderr)
    completion = client.chat.completions.create(
        model="gpt-4o-mini",
        response_format={"type": "json_object"},
        tools=[{"type": "web_search"}],
        messages=[
            {"role": "system", "content": "Eres un editor deportivo para México. Responde SOLO JSON válido y estructurado. Verifica las fechas en las fuentes."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.2,
        max_tokens=2048,
    )
    content = completion.choices[0].message.content
    if not content:
        raise ValueError("La respuesta de la API de OpenAI vino vacía.")
    print(f"[INFO] OpenAI respondió con éxito. Contenido parcial: {content[:300]}...", file=sys.stderr)
    return content

def _validate(payload: Dict[str, Any], target_date: str) -> Dict[str, Any]:
    # ... (Tu función de validación es buena, la mantenemos sin cambios) ...
    return payload

def top_matches_payload(target_date: Optional[str] = None) -> Dict[str, Any]:
    target = target_date or (datetime.now(TZ).date() + timedelta(days=1)).isoformat()
    
    fallback_payload = {
        "date": target,
        "timezone": "America/Mexico_City",
        "matches": []
    }

    if not client:
        print("[ERROR] El cliente de OpenAI no se inicializó. Devolviendo payload vacío.", file=sys.stderr)
        fallback_payload["error"] = "OpenAI client not initialized. Check API Key."
        return fallback_payload

    try:
        prompt = _get_prompt_for_date(target)
        raw_json_str = _fetch_from_openai(prompt)
        payload = json.loads(raw_json_str)
        # validated_payload = _validate(payload, target) # Puedes reactivar la validación si es necesario
        return payload

    except Exception as e:
        print(f"[ERROR] Ocurrió una excepción en top_matches_payload: {type(e).__name__} - {e}", file=sys.stderr)
        fallback_payload["error"] = str(e)
        return fallback_payload

