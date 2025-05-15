# main.py
import os
import sys
import random
import threading
import itertools
import re
from datetime import datetime
from functools import lru_cache

from flask import Flask, request, jsonify, session, abort  # if you ever run this as a micro-service
from langchain.chains import LLMChain
from langchain_ollama.llms import OllamaLLM
from langchain_core.prompts import ChatPromptTemplate

from vector import retriever   # your RAG retriever, returns a string of snippets

# ─── MODEL & PROMPT SETUP ────────────────────────────────────────────────
model = OllamaLLM(model="llama3.2", temperature=0.0)
template = """
You are a {tone} virtual assistant. Use ONLY the snippets below—do NOT invent new information.
Speak naturally and clearly. If you don’t know the answer, apologize and say so.
Always keep your answer to one or two sentences.

--- SNIPPETS ---
{snippets}

--- QUESTION ---
{question}

Assistant:
"""
prompt = ChatPromptTemplate.from_template(template)
chain  = LLMChain(llm=model, prompt=prompt)

# ─── CONSTANTS & CANNED RESPONSES ────────────────────────────────────────
user_tone    = "friendly"
RESP = {
    "welcome":  "🤖 Hello! I’m here 24/7—ask me anything.",
    "greeting": ["👋 Hi there!", "😊 Hey! What would you like to know?"],
    "affirm":   "👍 Great! What would you like help with?",
    "unknown":  "😕 I’m sorry, I don’t know the answer to that.",
    "exit":     "👋 Goodbye!",
    "error":    "⚠️ Something went wrong—please try again.",
}
GREETINGS    = {"hi", "hello", "hey", "yo", "greetings"}
AFFIRMATIVES = {"yes", "yep", "sure", "ok", "okay", "please"}
DECLINES     = {"no", "nah", "nope", "stop"}
BYES         = {"bye", "goodbye", "see ya", "later"}

def truncate_to_two_sentences(text: str) -> str:
    parts = re.split(r"(?<=[\.\?\!])\s+", text.strip())
    return " ".join(parts[:2]).strip()

def get_answer(q: str) -> str:
    lower = q.lower().strip()

    # quick replies
    if lower in BYES:
        return RESP["exit"]
    if lower in DECLINES:
        return RESP["decline"]
    if lower in AFFIRMATIVES:
        return RESP["affirm"]
    if any(g in lower for g in GREETINGS):
        return random.choice(RESP["greeting"])

    # fetch your RAG snippets (a single string)
    snippets = retriever.invoke(q)
    if not snippets:
        return RESP["unknown"]

    # call the chain correctly!
    try:
        llm_out = chain.predict(
            tone=user_tone,
            snippets=snippets,
            question=q
        ).strip()
        if llm_out.lower().startswith(("i’m sorry", "i don’t know", "i dont know")):
            return RESP["unknown"]
        return truncate_to_two_sentences(llm_out)
    except Exception:
        return RESP["error"]

# If you’re running this as a CLI:
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
            answer = get_answer(q)
        else:
            stop_ev = threading.Event()
            t = threading.Thread(target=lambda: spinner(stop_ev), args=(stop_ev,))
            t.start()
            answer = get_answer(q)
            stop_ev.set()
            t.join()

        print("Assistant:", answer, "\n")
        if answer == RESP["exit"]:
            break

if __name__ == "__main__":
    main()
