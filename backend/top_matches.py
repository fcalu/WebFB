import os
import sys
import json
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from typing import Dict, Any, Optional

from openai import OpenAI
from tenacity import retry, wait_exponential, stop_after_attempt

# --- CONFIGURACIÓN ---
TZ = ZoneInfo("America/Mexico_City")
try:
    client = OpenAI()
    print("[INFO] Cliente de OpenAI inicializado.", file=sys.stderr)
except Exception as e:
    print(f"[ERROR CRÍTICO] No se pudo inicializar OpenAI. Revisa la API Key. Error: {e}", file=sys.stderr)
    client = None

def _get_prompt_for_date(target_date: str) -> str:
    """
    Un prompt profesional y estricto para obtener partidos de fútbol reales y bien formados.
    Utiliza la técnica de "one-shot learning" con un ejemplo claro.
    """
    return (
        f"Tu tarea es generar un objeto JSON con una lista de exactamente 8 partidos de fútbol masculino REALES y verificables para la fecha {target_date}. "
        "NO inventes partidos bajo ninguna circunstancia. Si no puedes encontrar 8 partidos reales, es preferible que devuelvas menos. "
        "Tu respuesta debe ser únicamente el objeto JSON, sin texto adicional, siguiendo esta estructura exacta:\n\n"
        '{"date":"YYYY-MM-DD", "timezone":"America/Mexico_City", "matches":[...]}'
        "\n\n"
        "Cada partido en la lista 'matches' debe tener estos campos exactos: "
        "'home', 'away', 'competition', 'country', 'kickoff_local' (formato HH:MM para America/Mexico_City), "
        "'kickoff_utc' (formato HH:MM), y 'sources' (una lista con 1 o 2 URLs de fuentes deportivas conocidas como ESPN, BBC Sport, etc.).\n\n"
        "Ejemplo de un partido en la lista:\n"
        '{"home":"Club América", "away":"Cruz Azul", "competition":"Liga MX", "country":"Mexico", "kickoff_local":"21:05", "kickoff_utc":"03:05", "sources":["https://www.espn.com/soccer/match/_/gameId/12345"]}'
        "\n\n"
        f"Ahora, genera el JSON completo para la fecha {target_date}."
    )

@retry(wait=wait_exponential(multiplier=1, min=2, max=10), stop=stop_after_attempt(3))
def _fetch_json_from_openai(prompt: str) -> str:
    """Llama a la API de OpenAI pidiendo directamente una respuesta JSON."""
    if not client:
        raise RuntimeError("El cliente de OpenAI no está disponible.")
    
    print("[INFO] Realizando llamada a OpenAI con prompt profesional...", file=sys.stderr)
    completion = client.chat.completions.create(
        model="gpt-4o", # Usamos gpt-4o para mayor fiabilidad y conocimiento actualizado
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": "Eres un API de datos deportivos. Tu única respuesta es un objeto JSON bien formado basado en hechos reales."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.0, # Temperatura 0 para respuestas deterministas y basadas en hechos
        max_tokens=2500,
    )
    content = completion.choices[0].message.content
    if not content:
        raise ValueError("La respuesta de la API de OpenAI vino vacía.")
    print(f"[INFO] OpenAI respondió con JSON. Contenido parcial: {content[:300]}...", file=sys.stderr)
    return content

def top_matches_payload(target_date: Optional[str] = None) -> Dict[str, Any]:
    target = target_date or (datetime.now(TZ).date() + timedelta(days=1)).isoformat()
    
    fallback_payload = {
        "date": target,
        "timezone": "America/Mexico_City",
        "matches": []
    }

    if not client:
        print("[ERROR] Cliente de OpenAI no inicializado. Devolviendo payload vacío.", file=sys.stderr)
        fallback_payload["error"] = "OpenAI client not initialized. Check API Key."
        return fallback_payload

    try:
        prompt = _get_prompt_for_date(target)
        json_string = _fetch_json_from_openai(prompt)
        payload = json.loads(json_string)
        
        payload.setdefault("date", target)
        payload.setdefault("timezone", "America/Mexico_City")
        payload.setdefault("matches", [])
        
        return payload

    except Exception as e:
        print(f"[ERROR] Ocurrió una excepción final en top_matches_payload: {type(e).__name__} - {e}", file=sys.stderr)
        fallback_payload["error"] = str(e)
        return fallback_payload

