
# import sys
# import random
# import time
# from functools import lru_cache
# from langchain_ollama.llms import OllamaLLM
# from langchain_core.prompts import ChatPromptTemplate
# from vector import retriever

# # ─── MODEL SETUP ─────────────────────────────────────────────────────────
# model = OllamaLLM(
#     model="llama3.2",
#     temperature=0.0
# )

# # ─── PROMPT TEMPLATE ─────────────────────────────────────────────────────
# template = """
# Answer only from these snippets. If you don't know, say "I don't know."

# SNIPPETS:
# {reviews}

# QUESTION:
# {question}

# ANSWER:
# """
# prompt = ChatPromptTemplate.from_template(template)
# chain = prompt | model

# # ─── PREDEFINED RESPONSES ─────────────────────────────────────────────────
# RESPONSES = {
#     "welcome": "Hi! Instant answer ready—ask me anything!",
#     "greeting": ["Greetings, what can I fetch?"],
#     "unknown": "I don't know.",
#     "exit": "Bye! Come back any time.",
#     "error": "Error occurred—please try again."
# }
# GREETINGS = {"hi", "hello", "hey", "yo"}

# # ─── CACHING SNIPPET RETRIEVAL ────────────────────────────────────────────
# @lru_cache(maxsize=128)
# def get_snippets(question: str) -> str:
#     return retriever.invoke(question)

# # ─── MAIN INTERACTIVE LOOP ───────────────────────────────────────────────
# def main():
#     print("Assistant:", RESPONSES["welcome"])
#     while True:
#         try:
#             question = input("You: ").strip()
#         except (EOFError, KeyboardInterrupt):
#             print("Assistant:", RESPONSES["exit"])
#             break
#         if not question:
#             continue

#         ql = question.lower()
#         if ql in ("q", "quit", "exit"):
#             print("Assistant:", RESPONSES["exit"])
#             break

#         # Handle greetings
#         if any(greet in ql for greet in GREETINGS):
#             msg = random.choice(RESPONSES["greeting"])
#             print("Assistant:", msg)
#             continue

#         # Retrieve snippets with timing (optional)
#         start = time.perf_counter()
#         snippets = get_snippets(question)
#         # elapsed_ms = (time.perf_counter() - start) * 1000
#         # print(f"(retrieval: {elapsed_ms:.2f}ms)")

#         if not snippets:
#             print("Assistant:", RESPONSES["unknown"])
#             continue

#         # Generate answer
#         try:
#             answer = chain.invoke({"reviews": snippets, "question": question})
#         except Exception:
#             print("Assistant:", RESPONSES["error"])
#             continue

#         print("Assistant:", answer)

# if __name__ == "__main__":
#     main()


# main.py
import sys
import random
import time
from functools import lru_cache
from langchain_ollama.llms import OllamaLLM
from langchain_core.prompts import ChatPromptTemplate
from vector import retriever

# ─── MODEL SETUP ─────────────────────────────────────────────────────────
model = OllamaLLM(
    model="llama3.2",
    temperature=0.0
)

# ─── PROMPT TEMPLATE ─────────────────────────────────────────────────────
template = """
Answer only from these snippets. If you don't know, say "I don't know."

SNIPPETS:
{reviews}

QUESTION:
{question}

ANSWER:
"""
prompt = ChatPromptTemplate.from_template(template)
chain = prompt | model

# ─── PREDEFINED RESPONSES ─────────────────────────────────────────────────
RESPONSES = {
    "welcome": "Hi! Instant answer ready—ask me anything!",
    "greeting": ["Greetings, what can I fetch?"],
    "unknown": "I don't know.",
    "exit": "Bye! Come back any time.",
    "error": "Error occurred—please try again."
}
GREETINGS = {"hi", "hello", "hey", "yo"}

# ─── CACHING SNIPPET RETRIEVAL ────────────────────────────────────────────
@lru_cache(maxsize=128)
def get_snippets(question: str) -> str:
    return retriever.invoke(question)

# ─── CORE LOGIC ──────────────────────────────────────────────────────────
def get_answer(question: str) -> str:
    ql = question.strip().lower()
    # Exit command
    if ql in ("q", "quit", "exit"):
        return RESPONSES["exit"]
    # Greeting
    if any(greet in ql for greet in GREETINGS):
        return random.choice(RESPONSES["greeting"])
    # Retrieve snippets
    snippets = get_snippets(question)
    if not snippets:
        return RESPONSES["unknown"]
    # Generate answer
    try:
        return chain.invoke({"reviews": snippets, "question": question})
    except Exception:
        return RESPONSES["error"]

# ─── MAIN INTERACTIVE LOOP ───────────────────────────────────────────────
def main():
    print("Assistant:", RESPONSES["welcome"])
    while True:
        try:
            question = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("Assistant:", RESPONSES["exit"])
            break
        if not question:
            continue
        answer = get_answer(question)
        print("Assistant:", answer)
        if answer == RESPONSES["exit"]:
            break

if __name__ == "__main__":
    main()

