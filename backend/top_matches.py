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
    # Prompt simplificado que no depende de herramientas externas
    return (
        f"Devuelve un objeto JSON con los 8 partidos de fútbol masculino más importantes a nivel mundial para la fecha {target_date}. "
        "Prioriza partidos de selecciones, torneos UEFA, las 5 grandes ligas de Europa y clásicos relevantes para México. "
        "Calcula la hora para 'America/Mexico_City' (formato HH:MM 24h) y también en UTC. "
        "No incluyas partidos si no estás seguro de la fecha. La respuesta debe ser únicamente el objeto JSON, sin texto adicional."
    )

@retry(wait=wait_exponential(multiplier=1, min=2, max=10), stop=stop_after_attempt(3))
def _fetch_json_from_openai(prompt: str) -> str:
    """Llama a la API de OpenAI pidiendo directamente una respuesta JSON."""
    if not client:
        raise RuntimeError("El cliente de OpenAI no está disponible.")
    
    print("[INFO] Realizando llamada directa a OpenAI para obtener JSON...", file=sys.stderr)
    completion = client.chat.completions.create(
        model="gpt-4o-mini",
        response_format={"type": "json_object"}, # El método más fiable para obtener JSON
        messages=[
            {"role": "system", "content": "Eres un editor deportivo experto en fútbol mundial. Tu única respuesta es un objeto JSON bien formado."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.1,
        max_tokens=2048,
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
        
        # Asegurarnos de que los campos básicos existan
        payload.setdefault("date", target)
        payload.setdefault("timezone", "America/Mexico_City")
        payload.setdefault("matches", [])
        
        return payload

    except Exception as e:
        print(f"[ERROR] Ocurrió una excepción final en top_matches_payload: {type(e).__name__} - {e}", file=sys.stderr)
        fallback_payload["error"] = str(e)
        return fallback_payload

