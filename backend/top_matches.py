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
try:
    client = OpenAI()
    print("[INFO] Cliente de OpenAI inicializado.", file=sys.stderr)
except Exception as e:
    print(f"[ERROR CRÍTICO] No se pudo inicializar OpenAI. Revisa la API Key. Error: {e}", file=sys.stderr)
    client = None

def _get_prompt_for_date(target_date: str) -> str:
    """Un prompt profesional que funciona con la herramienta web_search."""
    return (
        f"Usando la herramienta web_search, encuentra 8 partidos de fútbol masculino importantes y REALES para la fecha {target_date}. "
        "Prioriza partidos de selecciones, torneos UEFA, las 5 grandes ligas de Europa y clásicos relevantes para México. "
        "NO inventes partidos bajo ninguna circunstancia. "
        "Tu respuesta debe ser únicamente un objeto JSON, sin texto adicional, siguiendo esta estructura exacta:\n\n"
        '{"date":"YYYY-MM-DD", "timezone":"America/Mexico_City", "matches":[...]}'
        "\n\n"
        "Cada partido en la lista 'matches' debe tener estos campos exactos: "
        "'home', 'away', 'competition', 'country', 'kickoff_local' (formato HH:MM para America/Mexico_City), "
        "'kickoff_utc' (formato HH:MM), y 'sources' (una lista con 1 o 2 URLs REALES de fuentes deportivas donde encontraste la información)."
    )

@retry(wait=wait_exponential(multiplier=1, min=2, max=10), stop=stop_after_attempt(2))
def _fetch_with_websearch(prompt: str) -> str:
    """Paso 1: Llama a la API con web_search, esperando una respuesta de texto que contenga JSON."""
    if not client:
        raise RuntimeError("El cliente de OpenAI no está disponible.")
    
    print("[INFO] Paso 1: Realizando llamada a OpenAI con web_search...", file=sys.stderr)
    completion = client.chat.completions.create(
        model="gpt-4o-mini", # Suficiente y más económico con web_search
        tools=[{"type": "web_search"}],
        messages=[
            {"role": "system", "content": "Eres un API de datos deportivos. Tu única respuesta es un objeto JSON bien formado basado en información verificada de la web."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.0,
        max_tokens=2500,
    )
    content = completion.choices[0].message.content
    if not content:
        raise ValueError("La respuesta de la API (paso 1 con web_search) vino vacía.")
    print(f"[INFO] Paso 1: OpenAI respondió con texto. Contenido parcial: {content[:300]}...", file=sys.stderr)
    return content

def _clean_and_parse_json(raw_text: str) -> Dict[str, Any]:
    """Paso 2: Extrae y, si es necesario, repara el texto para obtener un JSON válido."""
    match = re.search(r"\{.*\}", raw_text, re.DOTALL)
    if not match:
        raise ValueError("No se encontró un bloque JSON en la respuesta de la IA.")
    
    text_to_parse = match.group(0)

    try:
        return json.loads(text_to_parse)
    except json.JSONDecodeError:
        print("[WARN] El JSON extraído es inválido. Pidiendo a la IA que lo repare...", file=sys.stderr)
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

def top_matches_payload(target_date_str: Optional[str] = None) -> Dict[str, Any]:
    if target_date_str:
        target_date = datetime.strptime(target_date_str, "%Y-%m-%d").date()
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
        raw_text_response = _fetch_with_websearch(prompt)
        payload = _clean_and_parse_json(raw_text_response)
        
        payload.setdefault("date", target)
        payload.setdefault("timezone", "America/Mexico_City")
        payload.setdefault("matches", [])
        
        return payload

    except Exception as e:
        print(f"[ERROR] Ocurrió una excepción final en top_matches_payload: {type(e).__name__} - {e}", file=sys.stderr)
        fallback_payload["error"] = str(e)
        return fallback_payload

