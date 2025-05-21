
# vector.py
import os
import io
import contextlib
import csv, chardet
from pathlib import Path
from glob import glob

from langchain_core.documents import Document
from langchain_ollama import OllamaEmbeddings
from langchain_chroma import Chroma

# ─── CONFIG ─────────────────────────────────────────────────────────────
DATA_DIR      = "data"             # your folder of CSVs and/or PDFs
PERSIST_DIR   = "./chroma_db"      # persistent Chroma store
COLLECTION    = "all_documents"
EMBED_MODEL   = "mxbai-embed-large"
MIN_SCORE     = 0.65
TOP_K         = 5

# ensure persistence dir exists
os.makedirs(PERSIST_DIR, exist_ok=True)

# initialize embeddings + vector store
embeddings = OllamaEmbeddings(model=EMBED_MODEL)
vector_store = Chroma(
    collection_name=COLLECTION,
    persist_directory=PERSIST_DIR,
    embedding_function=embeddings
)

# ─── INDEX ONCE ─────────────────────────────────────────────────────────
def _sanitize_meta(meta: dict) -> dict:
    """Convert all keys/values to strings for Chroma compatibility."""
    return {str(k): str(v) for k, v in meta.items() if k is not None}

def _index_documents():
    docs, ids = [], []
    for filepath in glob(f"{DATA_DIR}/*"):
        ext  = Path(filepath).suffix.lower()
        name = Path(filepath).name

        # — CSV —
        if ext == ".csv":
            # detect encoding
            raw = open(filepath, "rb").read(50000)
            enc = chardet.detect(raw)["encoding"] or "utf-8"
            with open(filepath, encoding=enc, newline="") as fp:
                reader = csv.DictReader(fp)
                rows = list(reader)

            for i, row in enumerate(rows):
                text = "\n".join(f"{k}: {v}" for k, v in row.items())
                meta = _sanitize_meta({**row, "source": name, "row": i})
                doc_id = f"{name}_row{i}"
                docs.append(Document(page_content=text, metadata=meta, id=doc_id))
                ids.append(doc_id)

        # — PDF —
        elif ext == ".pdf":
            try:
                import pdfplumber
                with pdfplumber.open(filepath) as pdf:
                    for i, page in enumerate(pdf.pages):
                        txt = page.extract_text() or ""
                        if not txt.strip():
                            continue
                        meta = _sanitize_meta({"source": name, "page": i})
                        doc_id = f"{name}_page{i}"
                        docs.append(Document(page_content=txt, metadata=meta, id=doc_id))
                        ids.append(doc_id)
            except ImportError:
                # skip PDFs if pdfplumber not installed
                continue

    if docs:
        vector_store.add_documents(documents=docs, ids=ids)
        print(f"✅ Indexed {len(docs)} docs into '{PERSIST_DIR}'")
    else:
        print("⚠️  No documents found to index.")

# only index if empty
if vector_store._collection.count() == 0:
    _index_documents()

# ─── RETRIEVER ──────────────────────────────────────────────────────────
def get_snippets(question: str, k: int = TOP_K) -> str:
    """Return up to k page_contents whose score ≥ MIN_SCORE."""
    total = vector_store._collection.count()
    k_eff = min(k, total)

    # suppress Chroma's console output
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        results = vector_store.similarity_search_with_score(question, k=k_eff)

    filtered, seen = [], set()
    for doc, score in results:
        if score >= MIN_SCORE and doc.page_content not in seen:
            seen.add(doc.page_content)
            filtered.append(doc.page_content)
            if len(filtered) >= k_eff:
                break

    return "\n\n".join(filtered)

class RetrieverCaller:
    """Expose a simple `retriever.invoke(question)` interface."""
    def invoke(self, question: str) -> str:
        return get_snippets(question)

# singleton retriever for import
retriever = RetrieverCaller()