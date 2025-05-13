# vector.py

import os
from pathlib import Path
from glob import glob
import csv
import chardet
import pdfplumber
import contextlib
import io

from langchain_core.documents import Document
from langchain_ollama import OllamaEmbeddings
from langchain_chroma import Chroma

# ─── CONFIG ─────────────────────────────────────────────────────────────
DATA_PATH   = "data/Cookie.pdf"             # file OR directory of CSVs/PDFs
PERSIST_DIR = "./chroma_db"                 # persistent vector DB
COLLECTION  = "all_documents"                # Chroma collection name
EMBED_MODEL = "mxbai-embed-large"           # embeddings model
MIN_SCORE   = 0.65                            # similarity score threshold

# Validate source path
src = Path(DATA_PATH)
if not src.exists():
    raise FileNotFoundError(f"Data path '{DATA_PATH}' not found")

# Initialize Chroma with persistence
embeddings = OllamaEmbeddings(model=EMBED_MODEL)
vector_store = Chroma(
    collection_name=COLLECTION,
    persist_directory=PERSIST_DIR,
    embedding_function=embeddings
)

# ─── INDEXING UTILS ─────────────────────────────────────────────────────
def sanitize_metadata(metadata: dict) -> dict:
    """Convert all keys to str and values to str"""
    out = {}
    for k, v in metadata.items():
        if k is None:
            continue
        key = str(k)
        out[key] = str(v)
    return out

# Build list of files to index
if src.is_dir():
    files = [str(p) for p in src.iterdir() if p.suffix.lower() in {'.csv', '.pdf'}]
elif src.is_file():
    files = [str(src)]
else:
    files = []

documents, ids = [], []
for file in files:
    ext = Path(file).suffix.lower()
    name = Path(file).name

    if ext == ".csv":
        # process CSV
        with open(file, 'rb') as f:
            raw = f.read(50000)
            encoding = chardet.detect(raw)['encoding'] or 'utf-8'
        with open(file, newline='', encoding=encoding) as fp:
            reader = csv.DictReader(fp)
            rows = list(reader)
        print(f"📊 Indexing {len(rows)} rows from {name}")
        for i, row in enumerate(rows):
            content = "\n".join(f"{k}: {v}" for k, v in row.items())
            if not content.strip():
                continue
            meta = sanitize_metadata({**row, 'source': name, 'row': i, 'file_type': 'csv'})
            doc_id = f"{name}_row{i}"
            documents.append(Document(page_content=content, metadata=meta, id=doc_id))
            ids.append(doc_id)

    elif ext == ".pdf":
        # process PDF with pdfplumber
        try:
            with pdfplumber.open(file) as pdf:
                pages = pdf.pages
                print(f"📄 Indexing {len(pages)} pages from {name}")
                for j, page in enumerate(pages):
                    text = page.extract_text() or ''
                    if not text.strip():
                        continue
                    meta = sanitize_metadata({'source': name, 'page': j, 'file_type': 'pdf'})
                    doc_id = f"{name}_page{j}"
                    documents.append(Document(page_content=text, metadata=meta, id=doc_id))
                    ids.append(doc_id)
        except Exception as e:
            print(f"⚠️ Error processing PDF '{name}': {e}")
            continue

    else:
        continue

# Load documents into Chroma
if documents:
    vector_store.add_documents(documents=documents, ids=ids)
    print(f"✅ Indexed {len(documents)} documents into '{PERSIST_DIR}'")
else:
    print("⚠️ No documents indexed.")

# ─── RETRIEVER ──────────────────────────────────────────────────────────
def get_reviews(question: str, k: int = 5) -> str:
    """Retrieve top-k snippets filtered by MIN_SCORE without overshoot warnings"""
    # clamp k to available docs
    total = vector_store._collection.count()
    k_eff = min(k, total)
    # suppress any internal prints from Chroma
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        results = vector_store.similarity_search_with_score(question, k=k_eff)
    # filter by score and dedupe
    filtered, seen = [], set()
    for doc, score in results:
        if score >= MIN_SCORE and doc.page_content not in seen:
            seen.add(doc.page_content)
            filtered.append(doc.page_content)
            if len(filtered) == k_eff:
                break
    return "\n\n".join(filtered)

class RetrieverCaller:
    def invoke(self, question: str) -> str:
        try:
            return get_reviews(question)
        except Exception as e:
            print(f"Retrieval error: {e}")
            return ""

retriever = RetrieverCaller()