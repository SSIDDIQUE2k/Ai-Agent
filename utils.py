# utils.py
import random
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

def get_answer_from_snippets(snippets, question: str) -> str:
    try:
        return chain.invoke({"reviews": snippets, "question": question})
    except Exception:
        return RESPONSES["error"]

