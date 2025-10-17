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

try:
    client = OpenAI()
    print("[INFO] Cliente de OpenAI inicializado correctamente.", file=sys.stderr)
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

@retry(wait=wait_exponential(multiplier=1, min=2, max=10), stop=stop_after_attempt(2))
def _fetch_with_websearch(prompt: str) -> str:
    """Paso 1: Llama a la API con web_search, esperando una respuesta de texto."""
    if not client:
        raise RuntimeError("El cliente de OpenAI no está disponible.")
    
    print("[INFO] Paso 1: Realizando llamada a OpenAI con web_search...", file=sys.stderr)
    completion = client.chat.completions.create(
        model="gpt-4o-mini",
        tools=[{"type": "web_search"}],
        messages=[
            {"role": "system", "content": "Eres un editor deportivo para México. Tu respuesta DEBE contener un bloque de código JSON. Verifica las fechas en las fuentes."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.1,
        max_tokens=2048,
    )
    content = completion.choices[0].message.content
    if not content:
        raise ValueError("La respuesta de la API (paso 1) vino vacía.")
    print(f"[INFO] Paso 1: OpenAI respondió con texto. Contenido parcial: {content[:300]}...", file=sys.stderr)
    return content

def _clean_and_parse_json(raw_text: str) -> Dict[str, Any]:
    """Paso 2: Extrae y si es necesario, repara el texto para obtener un JSON válido."""
    # Intenta extraer el JSON directamente
    match = re.search(r"\{.*\}", raw_text, re.DOTALL)
    if not match:
        print("[WARN] No se encontró un bloque JSON en la respuesta inicial. Intentando reparar el texto completo.", file=sys.stderr)
        text_to_parse = raw_text
    else:
        text_to_parse = match.group(0)

    try:
        # Intenta parsear directamente
        return json.loads(text_to_parse)
    except json.JSONDecodeError:
        print("[WARN] El JSON extraído es inválido. Pidiendo a la IA que lo repare...", file=sys.stderr)
        # Si falla, pide a la IA que lo limpie (sin web_search, más rápido y barato)
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "Convierte el siguiente texto a un objeto JSON válido y completo. No inventes datos."},
                {"role": "user", "content": text_to_parse}
            ],
        )
        repaired_content = completion.choices[0].message.content
        if not repaired_content:
            raise ValueError("La API de reparación de JSON devolvió una respuesta vacía.")
        print("[INFO] JSON reparado con éxito.", file=sys.stderr)
        return json.loads(repaired_content)

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
        raw_text_response = _fetch_with_websearch(prompt)
        payload = _clean_and_parse_json(raw_text_response)
        
        # Aquí puedes añadir tu función de validación si lo deseas
        # payload = _validate(payload, target)
        
        return payload

    except Exception as e:
        print(f"[ERROR] Ocurrió una excepción final en top_matches_payload: {type(e).__name__} - {e}", file=sys.stderr)
        fallback_payload["error"] = str(e)
        return fallback_payload

