# app.py
import os
import logging
from uuid import uuid4
from flask import Flask, request, jsonify, render_template_string, abort, session

from main import get_answer  # existing RAG logic expecting (question, user_id)

# ─── FLASK SETUP ─────────────────────────────────────────────────────────
app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY") or os.urandom(24)
logging.getLogger("werkzeug").setLevel(logging.ERROR)
app.logger.setLevel(logging.INFO)

# ─── VISITOR LOG FOLDER ──────────────────────────────────────────────────
VISITORS_DIR = "visitors"
os.makedirs(VISITORS_DIR, exist_ok=True)

def user_log_path() -> str:
    """Return per-visitor log file path, ensuring persistent user_id in session."""
    uid = session.get("user_id")
    if not uid:
        uid = str(uuid4())
        session["user_id"] = uid
    return os.path.join(VISITORS_DIR, f"{uid}.txt")

# ─── INLINE FLOATING CHAT WIDGET ─────────────────────────────────────────
HTML = """

<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>24/7 Virtual Assistant</title>
  <style>
    body { margin:0; font-family:Arial,sans-serif; }
    #chat-launcher {
      position:fixed; bottom:20px; right:20px;
      background:#007bff; color:#fff; border-radius:50px;
      padding:10px 20px; cursor:pointer; display:flex; align-items:center;
      box-shadow:0 4px 12px rgba(0,0,0,0.15); z-index:1000;
      transition: background .2s;
    }
    #chat-launcher:hover { background:#0056d1; }
    #chat-launcher img { width:32px;height:32px;border-radius:50%;margin-right:8px; }

    #chat-window {
      display:none; position:fixed; bottom:80px; right:20px;
      width:320px; max-height:400px; background:#fff;border:1px solid #ddd;
      border-radius:8px; box-shadow:0 4px 24px rgba(0,0,0,0.2);
      flex-direction:column; overflow:hidden; z-index:1000;
      transform: scale(0.8); opacity: 0;
      transition: transform .3s ease, opacity .3s ease;
    }
    #chat-window.show { transform: scale(1); opacity: 1; display:flex; }

    #chat-header {
      background:#007bff; color:#fff; padding:10px;
      display:flex; justify-content:space-between; align-items:center;
      font-weight:bold;
    }
    #chat-header .close-btn {
      cursor:pointer; font-size:18px; line-height:18px; opacity:.7;
      transition: opacity .2s;
    }
    #chat-header .close-btn:hover { opacity:1; }

    #chat-body { flex:1; padding:10px; overflow-y:auto; background:#f7f9fc; }

    .message { margin:8px 0; display:flex; }
    .message.user { justify-content:flex-end; }
    .message.bot  { justify-content:flex-start; }
    .bubble {
      max-width:75%; padding:8px 12px; border-radius:16px;
      background:#f1f1f1; transition: transform .2s ease, max-width .2s ease;
    }
    .user .bubble { background:#e1f3ff; }
    .bubble:hover { transform: scale(1.02); max-width:85%; }

    #chat-input { border-top:1px solid #ddd; display:flex; }
    #chat-input input {
      flex:1; border:none; padding:10px; outline:none;
    }
    #chat-input button {
      background:#007bff; border:none; color:#fff;
      padding:0 16px; cursor:pointer; transition: background .2s;
    }
    #chat-input button:hover { background:#0056d1; }

    .typing-dot {
      display:inline-block; width:6px; height:6px; margin:0 1px;
      background:#888; border-radius:50%; animation:blink 1s infinite;
    }
    @keyframes blink { 0%,100%{opacity:0.2;} 50%{opacity:1;} }
  </style>
</head><body>
  <!-- Launcher -->
  <div id="chat-launcher">
    <img src="https://i.pravatar.cc/32" alt="Agent"><span>Chat with us</span>
  </div>

  <!-- Chat Window -->
  <div id="chat-window">
    <div id="chat-header">
      <span>Virtual Assistant</span>
      <span class="close-btn" id="close-btn">&times;</span>
    </div>
    <div id="chat-body"></div>
    <div id="chat-input">
      <input id="user-input" placeholder="Type your message…" autocomplete="off">
      <button id="send-btn">Send</button>
    </div>
  </div>

  <script>
    const launcher = document.getElementById('chat-launcher'),
          win      = document.getElementById('chat-window'),
          closeBtn = document.getElementById('close-btn'),
          bodyEl   = document.getElementById('chat-body'),
          inputEl  = document.getElementById('user-input'),
          btn      = document.getElementById('send-btn');
    let firstOpen = true;

    function toggleChat(show){
      win.classList.toggle('show', show);
    }
    launcher.onclick = () => {
      const open = win.classList.contains('show');
      toggleChat(!open);
      if (!open && firstOpen) {
        typeMessage('bot','🤖 Hello! I’m here 24/7—ask me anything.');
        typeMessage('bot','Need any assistance with anything?');
        firstOpen = false;
      }
    };
    closeBtn.onclick = () => toggleChat(false);
    window.addEventListener('load', ()=> setTimeout(()=> launcher.click(), 500));

    function appendUser(text){
      const msg = document.createElement('div'); msg.className='message user';
      const bub = document.createElement('div'); bub.className='bubble';
      bub.textContent = text; msg.appendChild(bub); bodyEl.appendChild(msg);
      bodyEl.scrollTop = bodyEl.scrollHeight;
    }

    function typeMessage(role, text){
      const msg = document.createElement('div'); msg.className='message '+role;
      const bub = document.createElement('div'); bub.className='bubble';
      msg.appendChild(bub); bodyEl.appendChild(msg);
      bodyEl.scrollTop = bodyEl.scrollHeight;
      let i=0, dots=0, showDots=false;
      function step(){
        if (i<=text.length){
          bub.textContent = text.slice(0,i);
          if (showDots){
            bub.innerHTML = text.slice(0,i) +
              '<span class="typing-dot"></span>'.repeat(dots);
            dots = (dots+1)%4;
          }
          i++; setTimeout(step,30);
        }
      }
      setTimeout(()=>{ showDots=true; step(); }, 200);
    }

    async function sendMessage(){
      const txt = inputEl.value.trim();
      if (!txt) return;
      appendUser(txt);
      inputEl.value='';
      typeMessage('bot','');
      try {
        const res = await fetch('/ask',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({question:txt})
        });
        const {answer} = await res.json();
        bodyEl.removeChild(bodyEl.lastChild);
        typeMessage('bot', answer);
      } catch {
        bodyEl.removeChild(bodyEl.lastChild);
        typeMessage('bot','😕 Sorry, something went wrong.');
      }
    }
    btn.onclick = sendMessage;
    inputEl.addEventListener('keypress', e => { if(e.key==='Enter') sendMessage(); });
  </script>
</body>
</html>


"""

# ─── ROUTES ──────────────────────────────────────────────────────────────
@app.route('/')
def index():
    session["user_id"] = session.get("user_id") or str(uuid4())
    return render_template_string(HTML)

@app.route('/ask', methods=['POST'])
def ask_route():
    data = request.get_json(force=True)
    question = data.get('question', '').strip()
    if not question:
        abort(400, 'Question required')

    app.logger.info(f"🔍 Received question: {question!r}")
    with open(user_log_path(), "a", encoding="utf-8") as f:
        f.write(question + "\n")

    try:
        answer = get_answer(question, session["user_id"])
    except Exception as e:
        app.logger.error(f"Error in get_answer: {e}", exc_info=True)
        answer = "😕 I'm sorry, something went wrong."

    return jsonify(answer=answer)

@app.route('/health')
def health():
    return jsonify(status='healthy')

if __name__ == '__main__':
    print("🚀 Starting AI assistant at http://127.0.0.1:5001")
    app.run(host='0.0.0.0', port=5001, debug=True)
