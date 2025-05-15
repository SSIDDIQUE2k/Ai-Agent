import os
import io
import contextlib
import csv
import chardet
import logging
from pathlib import Path
from glob import glob

from langchain_core.documents import Document
from langchain_ollama import OllamaEmbeddings
from langchain_chroma import Chroma

# ─── CONFIG ─────────────────────────────────────────────────────────────
DATA_DIR    = "data"             # your folder of CSVs and/or PDFs
PERSIST_DIR = "./chroma_db"      # persistent Chroma store
COLLECTION  = "all_documents"
EMBED_MODEL = "mxbai-embed-large"
MIN_SCORE   = 0.65
TOP_K       = 5

# ─── LOGGER SETUP ────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s: %(message)s")
logger = logging.getLogger(__name__)

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
        logger.info(f"Found file: {name} (ext={ext})")

        # — CSV —
        if ext == ".csv":
            try:
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
                logger.info(f"  + CSV indexed: {len(rows)} rows from {name}")
            except Exception as e:
                logger.error(f"❌ error processing CSV {name}: {e}")

        # — PDF —
        elif ext == ".pdf":
            try:
                import pdfplumber
            except ImportError:
                logger.error("❌ pdfplumber not installed; skipping PDF processing")
                continue

            try:
                with pdfplumber.open(filepath) as pdf:
                    page_count = 0
                    for i, page in enumerate(pdf.pages):
                        txt = page.extract_text() or ""
                        if not txt.strip():
                            logger.warning(f"  – page {i} of {name} is empty; skipping")
                            continue
                        meta    = _sanitize_meta({"source": name, "page": i})
                        doc_id  = f"{name}_page{i}"
                        docs.append(Document(page_content=txt, metadata=meta, id=doc_id))
                        ids.append(doc_id)
                        logger.info(f"  + indexed page {i} of {name}")
                        page_count += 1
                    if page_count == 0:
                        logger.warning(f"⚠️  no text pages found in {name}")
            except Exception as e:
                logger.error(f"❌ error reading PDF {name}: {e}")

        else:
            logger.warning(f"Skipping unsupported file type: {name}")

    if docs:
        vector_store.add_documents(documents=docs, ids=ids)
        try:
            vector_store.persist()
            logger.info(f"✅ Indexed {len(docs)} docs into '{PERSIST_DIR}'")
        except Exception as e:
            logger.error(f"❌ error persisting vector store: {e}")
    else:
        logger.warning("⚠️  No documents found to index.")

# only index if empty
if vector_store._collection.count() == 0:
    logger.info("Vector store is empty, starting indexing...")
    _index_documents()
else:
    logger.info(f"Vector store already contains {vector_store._collection.count()} documents; skipping re-index.")

# ─── RETRIEVER ──────────────────────────────────────────────────────────
def get_snippets(question: str, k: int = TOP_K) -> str:
    """Return up to k page_contents whose score ≥ MIN_SCORE."""
    total = vector_store._collection.count()
    k_eff = min(k, total)

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
