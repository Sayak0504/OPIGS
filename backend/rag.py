import json
import re

import numpy as np
from pypdf import PdfReader

from ai import embed_texts, embed_query

CHUNK_WORDS = 220
OVERLAP_WORDS = 40


def read_pdf_pages(path):
    reader = PdfReader(path)
    pages = []
    for n, page in enumerate(reader.pages, start=1):
        text = (page.extract_text() or "").strip()
        text = re.sub(r"[ \t]+", " ", text)
        if text:
            pages.append((n, text))
    return pages


def chunk_page(text):
    """Split a page into overlapping word windows."""
    words = text.split()
    if not words:
        return []

    chunks = []
    step = CHUNK_WORDS - OVERLAP_WORDS
    for start in range(0, len(words), step):
        piece = words[start:start + CHUNK_WORDS]
        if len(piece) < 25 and chunks:      # tail too small to stand alone
            break
        chunks.append(" ".join(piece))
    return chunks


def build_chunks(path, doc_name):
    out = []
    for page_no, text in read_pdf_pages(path):
        for i, chunk in enumerate(chunk_page(text)):
            out.append({"doc_name": doc_name, "page": page_no, "chunk_index": i, "content": chunk})
    return out


def embed_chunks(chunks):
    vectors = embed_texts([c["content"] for c in chunks])
    for c, v in zip(chunks, vectors):
        c["embedding"] = json.dumps(v)
    return chunks


def search(question, rows, top_k=5):
    """rows: list of PolicyChunk. Returns the top_k most relevant."""
    if not rows:
        return []

    matrix = np.array([json.loads(r.embedding) for r in rows], dtype=np.float32)
    query = np.array(embed_query(question), dtype=np.float32)

    matrix /= (np.linalg.norm(matrix, axis=1, keepdims=True) + 1e-9)
    query /= (np.linalg.norm(query) + 1e-9)

    scores = matrix @ query
    best = np.argsort(scores)[::-1][:top_k]

    return [(rows[i], float(scores[i])) for i in best]