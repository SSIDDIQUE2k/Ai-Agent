import os
import io
import contextlib
import csv
import chardet
import logging
from pathlib import Path
from glob import glob
from functools import lru_cache
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import numpy as np
import requests
from bs4 import BeautifulSoup
from urllib.parse import quote_plus

from langchain_core.documents import Document
from langchain_ollama import OllamaEmbeddings
from langchain_chroma import Chroma
from langchain.text_splitter import RecursiveCharacterTextSplitter

# ─── CONFIG ─────────────────────────────────────────────────────────────
DATA_DIR = "data"             # your folder of CSVs and/or PDFs
PERSIST_DIR = "./chroma_db"   # persistent Chroma store
COLLECTION = "all_documents"
EMBED_MODEL = "mxbai-embed-large"
MIN_SCORE = 0.65
TOP_K = 3  # Reduced from 5 to 3 for faster retrieval
CHUNK_SIZE = 2000  # Increased chunk size to reduce number of chunks
CHUNK_OVERLAP = 200
CACHE_TTL = 3600  # 1 hour cache TTL
BATCH_SIZE = 100  # Batch size for document processing

# ─── LOGGER SETUP ────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('vector.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# ensure persistence dir exists
os.makedirs(PERSIST_DIR, exist_ok=True)

# Initialize text splitter with optimized settings
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=CHUNK_SIZE,
    chunk_overlap=CHUNK_OVERLAP,
    length_function=len,
    separators=["\n\n", "\n", ".", "!", "?", ",", " ", ""]  # Optimized separators
)

# Cache for embeddings with improved memory management
embedding_cache: Dict[str, tuple[datetime, np.ndarray]] = {}
MAX_CACHE_SIZE = 1000  # Maximum number of cached embeddings

def cleanup_cache():
    """Remove oldest entries if cache exceeds MAX_CACHE_SIZE."""
    if len(embedding_cache) > MAX_CACHE_SIZE:
        sorted_items = sorted(embedding_cache.items(), key=lambda x: x[1][0])
        items_to_remove = len(embedding_cache) - MAX_CACHE_SIZE
        for key, _ in sorted_items[:items_to_remove]:
            del embedding_cache[key]

def get_cached_embedding(text: str) -> Optional[np.ndarray]:
    """Get cached embedding if it exists and is not expired."""
    if text in embedding_cache:
        timestamp, embedding = embedding_cache[text]
        if datetime.now() - timestamp < timedelta(seconds=CACHE_TTL):
            return embedding
        else:
            del embedding_cache[text]  # Remove expired embedding
    return None

def cache_embedding(text: str, embedding: List[float]):
    """Cache embedding with current timestamp and cleanup if needed."""
    embedding_cache[text] = (datetime.now(), np.array(embedding))
    cleanup_cache()

# Initialize embeddings + vector store with optimized settings
try:
    embeddings = OllamaEmbeddings(
        model=EMBED_MODEL,
        temperature=0.0,  # Disable temperature for faster embeddings
        num_ctx=2048,    # Optimize context window
        num_thread=4     # Use multiple threads for embedding
    )
    vector_store = Chroma(
        collection_name=COLLECTION,
        persist_directory=PERSIST_DIR,
        embedding_function=embeddings,
        collection_metadata={
            "hnsw:space": "cosine",  # Optimize for cosine similarity
            "hnsw:construction_ef": 100,  # Optimize index construction
            "hnsw:search_ef": 50  # Optimize search speed
        }
    )
except Exception as e:
    logger.error(f"Failed to initialize embeddings or vector store: {e}")
    raise

# ─── INDEX ONCE ─────────────────────────────────────────────────────────
def _sanitize_meta(meta: dict) -> dict:
    """Convert all keys/values to strings for Chroma compatibility."""
    return {str(k): str(v) for k, v in meta.items() if k is not None}

def _process_text(text: str, metadata: dict) -> List[Document]:
    """Process text into chunks with metadata."""
    chunks = text_splitter.split_text(text)
    return [
        Document(
            page_content=chunk,
            metadata={**metadata, "chunk": i}
        )
        for i, chunk in enumerate(chunks)
    ]

def _index_documents():
    """Index documents with improved error handling and logging."""
    docs, ids = [], []
    total_files = 0
    total_chunks = 0
    
    # Clear existing collection to ensure fresh indexing
    try:
        vector_store._collection.delete(where={"$exists": "id"})
        logger.info("Cleared existing collection for fresh indexing")
    except Exception as e:
        logger.error(f"Error clearing collection: {e}")
    
    for filepath in glob(f"{DATA_DIR}/*"):
        ext = Path(filepath).suffix.lower()
        name = Path(filepath).name
        logger.info(f"Processing file: {name} (ext={ext})")
        
        try:
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
                        
                        # Process text into chunks
                        chunked_docs = _process_text(text, meta)
                        docs.extend(chunked_docs)
                        ids.extend([f"{doc_id}_chunk{j}" for j in range(len(chunked_docs))])
                        
                    logger.info(f"Indexed {len(rows)} rows from {name} into {len(chunked_docs)} chunks")
                    total_chunks += len(chunked_docs)
                    
                except Exception as e:
                    logger.error(f"Error processing CSV {name}: {e}")
                    continue

            # — PDF —
            elif ext == ".pdf":
                try:
                    import pdfplumber
                except ImportError:
                    logger.error("pdfplumber not installed; skipping PDF processing")
                    continue

                try:
                    with pdfplumber.open(filepath) as pdf:
                        logger.info(f"PDF has {len(pdf.pages)} pages")
                        for i, page in enumerate(pdf.pages):
                            txt = page.extract_text() or ""
                            if not txt.strip():
                                logger.warning(f"Page {i} of {name} is empty; skipping")
                                continue
                                
                            meta = _sanitize_meta({
                                "source": name,
                                "page": i,
                                "total_pages": len(pdf.pages)
                            })
                            doc_id = f"{name}_page{i}"
                            
                            # Process text into chunks
                            chunked_docs = _process_text(txt, meta)
                            docs.extend(chunked_docs)
                            ids.extend([f"{doc_id}_chunk{j}" for j in range(len(chunked_docs))])
                            
                            logger.info(f"Indexed page {i} of {name} into {len(chunked_docs)} chunks")
                            total_chunks += len(chunked_docs)
                            
                except Exception as e:
                    logger.error(f"Error reading PDF {name}: {e}")
                    continue

            else:
                logger.warning(f"Skipping unsupported file type: {name}")
                continue
                
            total_files += 1
            
        except Exception as e:
            logger.error(f"Unexpected error processing {name}: {e}")
            continue

    if docs:
        try:
            # Add documents in batches
            batch_size = 100
            for i in range(0, len(docs), batch_size):
                batch_docs = docs[i:i + batch_size]
                batch_ids = ids[i:i + batch_size]
                vector_store.add_documents(documents=batch_docs, ids=batch_ids)
                logger.info(f"Added batch {i//batch_size + 1} of {(len(docs) + batch_size - 1)//batch_size}")
                
            # ChromaDB automatically persists to disk
            logger.info(f"Successfully indexed {total_files} files into {total_chunks} chunks")
            
        except Exception as e:
            logger.error(f"Error adding documents to vector store: {e}")
            raise
    else:
        logger.warning("No documents found to index.")

# Only re-index if run directly
if __name__ == "__main__":
    logger.info("Starting document indexing...")
    _index_documents()

# ─── RETRIEVER ──────────────────────────────────────────────────────────
def search_web(query: str, num_results: int = 3) -> List[Dict[str, str]]:
    """Search the web for relevant information."""
    try:
        # Use DuckDuckGo's API (no API key required)
        search_url = f"https://html.duckduckgo.com/html/?q={quote_plus(query)}"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        
        response = requests.get(search_url, headers=headers, timeout=5)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        results = []
        
        # Extract search results
        for result in soup.select('.result')[:num_results]:
            title_elem = result.select_one('.result__title')
            snippet_elem = result.select_one('.result__snippet')
            link_elem = result.select_one('.result__url')
            
            if title_elem and snippet_elem and link_elem:
                results.append({
                    'title': title_elem.get_text(strip=True),
                    'snippet': snippet_elem.get_text(strip=True),
                    'url': link_elem.get_text(strip=True)
                })
        
        return results
    except Exception as e:
        logger.error(f"Error in web search: {e}")
        return []

@lru_cache(maxsize=1000)
def get_snippets(question: str, k: int = TOP_K) -> list[Document]:
    """Return up to k Documents whose score ≥ MIN_SCORE."""
    try:
        total = vector_store._collection.count()
        k_eff = min(k, total)
        results = vector_store.similarity_search_with_score(
            question,
            k=k_eff
        )
        docs = []
        for doc, score in results:
            if score >= MIN_SCORE:
                docs.append(doc)
                if len(docs) >= k_eff:
                    break
        return docs
    except Exception as e:
        logger.error(f"Error in get_snippets: {e}")
        return []

def get_snippets_str(question: str, k: int = TOP_K) -> str:
    docs = get_snippets(question, k)
    if not docs:
        # fallback to web search (reuse your previous logic)
        web_results = search_web(question)
        if web_results:
            snippets = ["I couldn't find that in my local data, but here are some relevant resources:"]
            for result in web_results:
                snippets.append(f"📌 {result['title']}\n{result['snippet']}\n🔗 {result['url']}")
            return "\n\n".join(snippets)
        else:
            return "I couldn't find relevant information in my local data or on the web. Could you please rephrase your question?"
    # Format local docs
    snippets = []
    for doc in docs:
        source = doc.metadata.get("source", "Unknown")
        snippets.append(f"From {source}:\n{doc.page_content}")
    return "\n\n".join(snippets)

class RetrieverCaller:
    """Expose a simple retriever.invoke(question) interface that returns Documents."""
    def invoke(self, question: str) -> list[Document]:
        return get_snippets(question)
    def invoke_str(self, question: str) -> str:
        return get_snippets_str(question)

retriever = RetrieverCaller()