import os
import json

from dotenv import load_dotenv
from fastapi import HTTPException
from google import genai

load_dotenv()

MODEL = "gemini-3.8-flash"
API_KEY = os.getenv("GEMINI_API_KEY")

_client = genai.Client(api_key=API_KEY) if API_KEY else None


def ask_gemini(prompt: str) -> str:
    """Send a prompt to Gemini and return the plain text reply."""
    if not _client:
        raise HTTPException(503, "AI is not configured — GEMINI_API_KEY is missing")

    try:
        result = _client.interactions.create(model=MODEL, input=prompt)
        return (result.output_text or "").strip()
    except Exception as e:
        print("Gemini error:", repr(e))
        raise HTTPException(502, "The AI service did not respond. Try again.")


def ask_gemini_json(prompt: str) -> dict:
    """Same, but for prompts that ask for JSON back."""
    raw = ask_gemini(prompt)
    cleaned = raw.replace("```json", "").replace("```", "").strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        print("Gemini returned non-JSON:", raw[:300])
        raise HTTPException(502, "The AI returned an unexpected format. Try again.")
    