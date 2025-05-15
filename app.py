# app.py
import os
import logging
from uuid import uuid4
from flask import Flask, request, jsonify, session, abort
from flask_cors import CORS  # allow CORS if you ever bypass your proxy
from main import get_answer

app = Flask(__name__)
CORS(app)  # optional if you proxy via Angular CLI
app.secret_key = os.getenv("FLASK_SECRET_KEY") or os.urandom(24)
logging.getLogger("werkzeug").setLevel(logging.ERROR)
app.logger.setLevel(logging.INFO)

VISITORS_DIR = "visitors"
os.makedirs(VISITORS_DIR, exist_ok=True)

def user_log_path() -> str:
    uid = session.get("user_id") or str(uuid4())
    session["user_id"] = uid
    return os.path.join(VISITORS_DIR, f"{uid}.txt")

@app.route("/ask", methods=["POST"])
def ask_route():
    data = request.get_json(force=True)
    q = data.get("question", "").strip()
    if not q:
        abort(400, description="Question required")

    app.logger.info(f"🔍 Received: {q!r}")
    with open(user_log_path(), "a", encoding="utf-8") as f:
        f.write(q + "\n")

    try:
        ans = get_answer(q)
    except Exception as e:
        app.logger.error("Error in get_answer", exc_info=True)
        ans = "😕 Something went wrong."

    return jsonify(answer=ans)

@app.route("/health")
def health():
    return jsonify(status="healthy")

if __name__ == "__main__":
    print("🚀 Flask API running on http://0.0.0.0:5001")
    app.run(host="0.0.0.0", port=5001, debug=True)
