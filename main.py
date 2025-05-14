# main.py
import os
import sys
import random
import time
import threading
import itertools
from datetime import datetime
from functools import lru_cache

from langchain_ollama.llms import OllamaLLM
from langchain_core.prompts import ChatPromptTemplate
from vector import retriever

# ─── MODEL & PROMPT SETUP ─────────────────────────────────────────────────
model = OllamaLLM(model="llama3.2", temperature=0.0)

template = '''
You are a {tone} virtual assistant. Use ONLY the snippets below—do NOT invent new information.
Speak naturally and clearly. If you don’t know the answer, apologize and say so.

--- SNIPPETS ---
{reviews}

--- QUESTION ---
{question}

Assistant:
'''
prompt = ChatPromptTemplate.from_template(template)
chain = prompt | model

# ─── STATE & RESPONSES ────────────────────────────────────────────────────
user_tone  = "friendly"  # or “professional” if you add that feature
RESP = {
    "welcome":  "🤖 Hello! I’m here 24/7—ask me anything.",
    "greeting": ["👋 Hi there!", "😊 Hey! What would you like to know?"],
    "unknown":  "😕 I’m sorry, I don’t know the answer to that.",
    "exit":     "👋 Goodbye!",
    "error":    "⚠️ Something went wrong—please try again.",
    "decline":  "👍 Okay."
}
GREETINGS = {"hi","hello","hey","yo","greetings"}
DECLINES  = {"no","nah","nope","stop"}
BYES      = {"bye","goodbye","see ya","later"}

# ─── VISITOR LOGGING ──────────────────────────────────────────────────────
LOG_DIR  = "visitors"
LOG_FILE = os.path.join(LOG_DIR, "questions.txt")
os.makedirs(LOG_DIR, exist_ok=True)

def log_question(q: str):
    timestamp = datetime.utcnow().isoformat()
    with open(LOG_FILE, "a") as f:
        f.write(f"{timestamp}  {q}\n")

# ─── SNIPPET CACHING ──────────────────────────────────────────────────────
@lru_cache(maxsize=128)
def get_snippets(q: str) -> str:
    return retriever.invoke(q)

# ─── FETCH SPINNER ────────────────────────────────────────────────────────
def spinner(stop_ev):
    spin = itertools.cycle(['⠁','⠃','⠇','⠧'])
    while not stop_ev.is_set():
        sys.stdout.write(f"\r🔍 Fetching {next(spin)} ")
        sys.stdout.flush()
        time.sleep(0.1)
    sys.stdout.write("\r✅ Done fetching!   \n")

# ─── CORE ANSWER LOGIC ─────────────────────────────────────────────────────
def get_answer(q: str) -> str:
    lower = q.lower().strip()

    # 1) Bye / exit
    if lower in BYES or lower in ("q","quit","exit"):
        return RESP["exit"]

    # 2) Decline
    if lower in DECLINES:
        return RESP["decline"]

    # 3) Greeting
    if any(g in lower for g in GREETINGS):
        return random.choice(RESP["greeting"])

    # 4) Retrieve snippets
    snippets = get_snippets(q)
    if not snippets:
        return RESP["unknown"]

    # 5) Invoke the model
    try:
        ans = chain.invoke({
            "tone":    user_tone,
            "reviews": snippets,
            "question": q
        }).strip()
        # If it tries to hallucinate, force unknown
        if ans.lower().startswith("i’m sorry") or ans.lower().startswith("i don’t know"):
            return RESP["unknown"]
        return ans
    except Exception:
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

        # Log every question
        log_question(q)

        # Show spinner while retrieving
        stop = threading.Event()
        t = threading.Thread(target=spinner, args=(stop,))
        t.start()

        _ = get_snippets(q)  # warm/cached retrieval

        stop.set()
        t.join()

        # Compute & print answer
        answer = get_answer(q)
        print("Assistant:", answer, "\n")

        if answer == RESP["exit"]:
            break

if __name__ == "__main__":
    main()
