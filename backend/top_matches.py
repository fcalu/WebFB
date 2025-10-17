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
    return (
        f"Usando la herramienta web_search, encuentra hasta 8 partidos de fútbol masculino IMPORTANTES y REALES para la fecha {target_date} (formato YYYY-MM-DD). "
        "Prioriza selecciones nacionales, torneos UEFA, las 5 grandes ligas europeas y clásicos relevantes para México. "
        "NO inventes partidos bajo ninguna circunstancia. Si hay menos de 8 partidos reales, devuelve sólo los que existan. "
        "Tu respuesta debe ser únicamente un objeto JSON, sin texto adicional, exactamente con esta estructura:\n\n"
        '{"date":"YYYY-MM-DD", "timezone":"America/Mexico_City", "matches":[...]}'
        "\n\n"
        "Cada partido en 'matches' debe tener estos campos EXACTOS: "
        "'home' (nombre del equipo local), 'away' (visitante), 'competition' (nombre del torneo), "
        "'country' (país donde se celebra la competición), "
        "'kickoff_local' (hora en America/Mexico_City, formato HH:MM, 24h), "
        "'kickoff_utc' (hora UTC, formato HH:MM, 24h), "
        "y 'sources' (lista con 1 o 2 URLs REALES de páginas deportivas donde verificaste el partido). "
        "Asegúrate de convertir correctamente las horas a America/Mexico_City y a UTC. "
        "No incluyas comentarios, metadatos ni texto fuera del JSON."
    )

@retry(wait=wait_exponential(multiplier=1, min=2, max=10), stop=stop_after_attempt(2))
def _fetch_json_from_openai(prompt: str) -> str:
    """Llama a la API de OpenAI pidiendo directamente una respuesta JSON."""
    if not client:
        raise RuntimeError("El cliente de OpenAI no está disponible.")
    
    print(f"[INFO] Realizando llamada a gpt-4o para la fecha correcta...", file=sys.stderr)
    completion = client.chat.completions.create(
        model="gpt-4o",  # Usamos el modelo más potente para asegurar conocimiento actualizado
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": "Eres un API de datos deportivos. Tu única respuesta es un objeto JSON bien formado basado en hechos reales de tu conocimiento interno."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.0,
        max_tokens=2500,
    )
    content = completion.choices[0].message.content
    if not content:
        raise ValueError("La respuesta de la API de OpenAI vino vacía.")
    print(f"[INFO] OpenAI respondió con JSON. Contenido parcial: {content[:300]}...", file=sys.stderr)
    return content

def top_matches_payload(target_date_str: Optional[str] = None) -> Dict[str, Any]:
    if target_date_str:
        try:
            target_date = datetime.strptime(target_date_str, "%Y-%m-%d").date()
        except ValueError:
            # Si la fecha es inválida, usar la de mañana
            target_date = (datetime.now(TZ).date() + timedelta(days=1))
    else:
        target_date = (datetime.now(TZ).date() + timedelta(days=1))
    
    target = target_date.isoformat()
    
    fallback_payload = {"date": target, "timezone": "America/Mexico_City", "matches": []}

    if not client:
        print("[ERROR] Cliente de OpenAI no inicializado.", file=sys.stderr)
        fallback_payload["error"] = "OpenAI client not initialized."
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

