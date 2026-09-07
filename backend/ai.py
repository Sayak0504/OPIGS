import re
import time
import os
import json

from dotenv import load_dotenv
from fastapi import HTTPException
from google import genai

load_dotenv()

MODEL = "gemini-3.5-flash-lite"
API_KEY = os.getenv("GEMINI_API_KEY")

_client = genai.Client(api_key=API_KEY) if API_KEY else None


_RETRY_RE = re.compile(r"retry in ([\d.]+)s")


def _retry_after(message):
    """If this is a rate-limit error, how long to wait. Otherwise None."""
    if not any(k in message for k in ("429", "too_many_requests", "RESOURCE_EXHAUSTED")):
        return None
    m = _RETRY_RE.search(message)
    return float(m.group(1)) if m else 20.0


MAX_RETRY_WAIT = 8.0     # retry only short waits; anything longer, fail fast


def ask_gemini(prompt: str, _retries: int = 1) -> str:
    """Send a prompt to Gemini and return the plain text reply."""
    if not _client:
        raise HTTPException(503, "AI is not configured — GEMINI_API_KEY is missing")

    try:
        result = _client.interactions.create(model=MODEL, input=prompt)
        return (result.output_text or "").strip()

    except Exception as e:
        wait = _retry_after(str(e))

        if wait is None:
            print("Gemini error:", repr(e))
            raise HTTPException(502, "The AI service did not respond. Try again.")

        if wait <= MAX_RETRY_WAIT and _retries > 0:
            print(f"Rate limited — sleeping {wait + 0.5:.1f}s, then one retry")
            time.sleep(wait + 0.5)
            return ask_gemini(prompt, _retries - 1)

        print(f"Rate limited — {wait:.0f}s wait, failing fast")
        raise HTTPException(
            429,
            f"AI quota is full. Wait about {int(wait) + 1} seconds and try again."
        )

def ask_gemini_json(prompt: str) -> dict:
    """Same, but for prompts that ask for JSON back."""
    raw = ask_gemini(prompt)
    cleaned = raw.replace("```json", "").replace("```", "").strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        print("Gemini returned non-JSON:", raw[:300])
        raise HTTPException(502, "The AI returned an unexpected format. Try again.")


EMBED_MODEL = "gemini-embedding-001"


def embed_texts(texts, task_type="RETRIEVAL_DOCUMENT"):
    """Turn a list of strings into a list of vectors."""
    if not _client:
        raise HTTPException(503, "AI is not configured — GEMINI_API_KEY is missing")

    vectors = []
    for i in range(0, len(texts), 50):          # batch, the API caps per-request size
        batch = texts[i:i + 50]
        try:
            res = _client.models.embed_content(
                model=EMBED_MODEL,
                contents=batch,
                config={"task_type": task_type},
            )
            vectors.extend([e.values for e in res.embeddings])
        except Exception as e:
            print("Embedding error:", repr(e))
            raise HTTPException(502, "Could not generate embeddings. Try again.")

    return vectors


def embed_query(text):
    return embed_texts([text], task_type="RETRIEVAL_QUERY")[0]