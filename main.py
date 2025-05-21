# main.py
import os
import sys
import random
import time
import threading
import itertools
import re
from datetime import datetime
from functools import lru_cache
from typing import Optional

from langchain_ollama.llms import OllamaLLM
from langchain_core.prompts import ChatPromptTemplate
from vector import retriever

# ─── MODEL & PROMPT SETUP ────────────────────────────────────────────────
model = OllamaLLM(model="llama3.2", temperature=0.0)

template = '''
You are a {tone} virtual assistant. Use ONLY the snippets below—do NOT invent new information.
Speak naturally and clearly. If you don’t know the answer, apologize and say so.
Always keep your answer to one or two sentences.

--- SNIPPETS ---
{reviews}

--- QUESTION ---
{question}

Assistant:
'''
prompt = ChatPromptTemplate.from_template(template)
chain  = prompt | model

# ─── STATE & RESPONSES ───────────────────────────────────────────────────
user_tone     = "friendly"
RESP = {
    "welcome":  "🤖 Hello! I’m here 24/7—ask me anything.",
    "greeting": ["👋 Hi there!", "😊 Hey! What would you like to know?"],
    "affirm":   "👍 Great! What would you like help with?",
    "unknown":  "😕 I’m sorry, I don’t know the answer to that.",
    "exit":     "👋 Goodbye!",
    "error":    "⚠️ Something went wrong—please try again.",
    "decline":  "👍 Okay."
}
GREETINGS     = {"hi", "hello", "hey", "yo", "greetings"}
AFFIRMATIVES  = {"yes", "yep", "sure", "ok", "okay", "please"}
DECLINES      = {"no", "nah", "nope", "stop"}
BYES          = {"bye", "goodbye", "see ya", "later"}

# ─── VISITOR LOGGING ──────────────────────────────────────────────────────
LOG_DIR  = "visitors"
LOG_FILE = os.path.join(LOG_DIR, "questions.txt")
os.makedirs(LOG_DIR, exist_ok=True)

def log_question(q: str):
    ts = datetime.utcnow().isoformat()
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(f"{ts}  {q}\n")

# ─── SNIPPET CACHING ──────────────────────────────────────────────────────
@lru_cache(maxsize=128)
def get_snippets(q: str) -> str:
    return retriever.invoke(q)

# ─── FETCH SPINNER ───────────────────────────────────────────────────────
def spinner(stop_ev):
    for c in itertools.cycle(['⠁','⠃','⠇','⠧']):
        if stop_ev.is_set():
            break
        sys.stdout.write(f"\r🔍 Fetching {c} ")
        sys.stdout.flush()
        time.sleep(0.1)
    sys.stdout.write("\r✅ Done fetching!   \n")

# ─── HELPER: TRUNCATE TO TWO SENTENCES ──────────────────────────────────
def truncate_to_two_sentences(text: str) -> str:
    parts = re.split(r'(?<=[\.\?\!])\s+', text.strip())
    return " ".join(parts[:2]).strip()

# ─── CORE ANSWER LOGIC ────────────────────────────────────────────────────
def get_answer(q: str, user_id: Optional[str] = None) -> str:
    """
    q: the user’s question
    user_id: optional session identifier (unused here, but accepted)
    """
    lower = q.lower().strip()

    if lower in BYES or lower in ("q","quit","exit"):
        return RESP["exit"]
    if lower in DECLINES:
        return RESP["decline"]
    if lower in AFFIRMATIVES:
        return RESP["affirm"]
    if any(g in lower for g in GREETINGS):
        return random.choice(RESP["greeting"])

    snippets = get_snippets(q)
    if not snippets:
        return RESP["unknown"]

    try:
        resp = chain.invoke({
            "tone": user_tone,
            "reviews": snippets,
            "question": q
        }).strip()
        if resp.lower().startswith(("i’m sorry","i don’t know","i dont know")):
            return RESP["unknown"]
        return truncate_to_two_sentences(resp)
    except Exception as e:
        # optionally log e to stderr or a logger
        return RESP["error"]

# ─── CLI INTERFACE ─────────────────────────────────────────────────────────
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

        log_question(q)
        lower = q.lower().strip()

        # Only show spinner if this is a "real" question requiring RAG
        is_quick_reply = (
            lower in BYES or lower in DECLINES or lower in AFFIRMATIVES
            or any(g in lower for g in GREETINGS)
        )

        if is_quick_reply:
            answer = get_answer(q)
        else:
            stop = threading.Event()
            t = threading.Thread(target=spinner, args=(stop,))
            t.start()
            answer = get_answer(q)
            stop.set()
            t.join()

        print("Assistant:", answer, "\n")
        if answer == RESP["exit"]:
            break

if __name__ == "__main__":
    main()
