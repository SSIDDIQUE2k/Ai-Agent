# main.py
import os
import sys
import random
import threading
import itertools
import re
import logging
from datetime import datetime
from functools import lru_cache
from typing import Optional, Dict, Any
import asyncio
from concurrent.futures import ThreadPoolExecutor

from flask import Flask, request, jsonify, session, abort  # if you ever run this as a micro-service
from langchain_ollama.llms import OllamaLLM
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from werkzeug.exceptions import BadRequest
from langchain_core.documents import Document

from vector import retriever   # your RAG retriever, returns a string of snippets

# ─── LOGGING SETUP ───────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('app.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# ─── MODEL & PROMPT SETUP ────────────────────────────────────────────────
try:
    model = OllamaLLM(
        model="llama3.2",
        temperature=0.0,
        num_ctx=2048,  # Optimize context window
        num_thread=4,  # Use multiple threads
        repeat_penalty=1.1,  # Slightly reduce repetition
        top_k=40,  # Optimize token selection
        top_p=0.9  # Optimize probability threshold
    )
    template = """
    You are a {tone} virtual assistant. Use ONLY the snippets below—do NOT invent new information.
    Speak naturally and clearly, as if you're having a friendly conversation.
    If the user asks a 5W question (who, what, where, when, why, or how), answer based on the PDF data provided.
    If you don't know the answer, apologize and say so.
    Always keep your answer to one or two sentences.

    --- SNIPPETS ---
    {snippets}

    --- QUESTION ---
    {question}

    Assistant:
    """
    prompt = ChatPromptTemplate.from_template(template)
    
    # Create a chain using the new RunnableSequence approach
    chain = (
        {"tone": lambda _: user_tone, "snippets": lambda q: "\n\n".join([d.page_content for d in retriever.invoke(q)]), "question": RunnablePassthrough()}
        | prompt
        | model
    )
except Exception as e:
    logger.error(f"Failed to initialize model: {e}")
    raise

# ─── CONSTANTS & CANNED RESPONSES ────────────────────────────────────────
user_tone = "friendly"
RESP = {
    "welcome": "🤖 Hello! I'm here 24/7—ask me anything.",
    "greeting": ["👋 Hi there!", "😊 Hey! What would you like to know?"],
    "affirm": "👍 Great! What would you like help with?",
    "unknown": "😕 I'm sorry, I don't have that info. Can I help you with something else?",
    "exit": "👋 Goodbye!",
    "error": "⚠️ Something went wrong—please try again.",
    "invalid_input": "⚠️ Please provide a valid question.",
    "rate_limit": "⚠️ Too many requests. Please wait a moment.",
}
GREETINGS = {"hi", "hello", "hey", "yo", "greetings"}
AFFIRMATIVES = {"yes", "yep", "sure", "ok", "okay", "please"}
DECLINES = {"no", "nah", "nope", "stop"}
BYES = {"bye", "goodbye", "see ya", "later"}
GRATITUDES = {"thanks", "thank you", "thx", "thank u","ty","awsome"}

# Rate limiting with improved performance
RATE_LIMIT = 10  # requests per minute
request_history: Dict[str, list] = {}
CLEANUP_INTERVAL = 60  # seconds

def cleanup_old_requests():
    """Periodically clean up old requests."""
    now = datetime.now()
    for user_id in list(request_history.keys()):
        request_history[user_id] = [
            t for t in request_history[user_id]
            if (now - t).total_seconds() < 60
        ]
        if not request_history[user_id]:
            del request_history[user_id]

def is_rate_limited(user_id: str) -> bool:
    """Check if user has exceeded rate limit with optimized cleanup."""
    now = datetime.now()
    if user_id not in request_history:
        request_history[user_id] = []
    
    # Cleanup old requests
    if random.random() < 0.1:  # 10% chance to cleanup
        cleanup_old_requests()
    
    # Remove requests older than 1 minute
    request_history[user_id] = [
        t for t in request_history[user_id]
        if (now - t).total_seconds() < 60
    ]
    
    if len(request_history[user_id]) >= RATE_LIMIT:
        return True
    
    request_history[user_id].append(now)
    return False

def sanitize_input(text: str) -> str:
    """Sanitize user input with optimized regex."""
    return re.sub(r'[<>]', '', text).strip()

@lru_cache(maxsize=1000)
def truncate_to_two_sentences(text: str) -> str:
    """Cache the last 1000 responses for better performance."""
    parts = re.split(r"(?<=[\.\?\!])\s+", text.strip())
    return " ".join(parts[:2]).strip()

# Thread pool for parallel processing
thread_pool = ThreadPoolExecutor(max_workers=4)

async def process_question(q: str, user_id: str) -> str:
    """Process question asynchronously."""
    try:
        # Input validation
        if not q or len(q) > 500:
            logger.warning(f"Invalid input length: {len(q)}")
            return RESP["invalid_input"]
        
        # Rate limiting
        if is_rate_limited(user_id):
            logger.warning(f"Rate limit exceeded for user {user_id}")
            return RESP["rate_limit"]
        
        # Sanitize input
        q = sanitize_input(q)
        lower = q.lower().strip()
        
        # Log the question
        logger.info(f"Processing question: {q}")

        # If 5W/How question, always answer from PDF (skip canned responses)
        if re.match(r'^(who|what|where|when|why|how)\\b', lower):
            pass  # proceed to RAG answer
        else:
            if lower in BYES:
                return RESP["exit"]
            if lower in DECLINES:
                return RESP["decline"]
            if any(g in lower for g in GRATITUDES):
                return "You're welcome! 😊"
            if lower in AFFIRMATIVES:
                return RESP["affirm"]
            if lower in GREETINGS:
                return random.choice(RESP["greeting"])

        # Get snippets as Documents
        snippets_docs = retriever.invoke(q)
        if not snippets_docs:
            logger.info(f"No relevant snippets found for: {q}")
            web_fallback = retriever.invoke_str(q)
            # If web fallback contains links, prepend a friendly message
            if "http" in web_fallback:
                return ("I couldn't find that in my data, but here are some resources that might help you:\n\n" + web_fallback)
            else:
                return RESP["unknown"]

        # Call the chain
        try:
            llm_out = chain.invoke(q).strip()
            
            if llm_out.lower().startswith(("i'm sorry", "i don't know", "i dont know")):
                return RESP["unknown"]
                
            response = truncate_to_two_sentences(llm_out)
            logger.info(f"Generated response: {response}")
            return response
            
        except Exception as e:
            logger.error(f"Error in LLM chain: {e}")
            return RESP["error"]
            
    except Exception as e:
        logger.error(f"Unexpected error in process_question: {e}")
        return RESP["error"]

def get_answer(q: str, user_id: str) -> str:
    """Get answer with improved performance."""
    try:
        return asyncio.run(process_question(q, user_id))
    except Exception as e:
        logger.error(f"Error in get_answer: {e}")
        return RESP["error"]

# If you're running this as a CLI:
def main():
    print(RESP["welcome"])
    while True:
        try:
            q = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n" + RESP["exit"])
            break
        if not q:
            continue

        if any(tok in q.lower() for tok in BYES|DECLINES|AFFIRMATIVES|GREETINGS):
            answer = get_answer(q, "cli_user")
        else:
            answer = get_answer(q, "cli_user")

        print("Assistant:", answer, "\n")
        if answer == RESP["exit"]:
            break

if __name__ == "__main__":
    main()
