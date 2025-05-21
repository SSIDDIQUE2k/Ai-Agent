import os
import logging
from uuid import uuid4
from flask import Flask, request, jsonify, render_template_string, session
from main import get_answer  # your existing RAG logic

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY") or os.urandom(24)
logging.getLogger("werkzeug").setLevel(logging.ERROR)
app.logger.setLevel(logging.INFO)

VISITORS_DIR = "visitors"
os.makedirs(VISITORS_DIR, exist_ok=True)

def user_log_path() -> str:
    uid = session.get("user_id")
    if not uid:
        uid = str(uuid4())
        session["user_id"] = uid
    return os.path.join(VISITORS_DIR, f"{uid}.txt")

HTML = """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Chat Widget</title>
  <style>
    body { height:100vh; font-family:Roboto,sans-serif; margin:0; background:gainsboro; display:flex; overflow:hidden; }
    .main-card.collapsed { width:48px; height:48px; border-radius:24px; margin:16px; }
    @media (min-width:450px) {
      .main-card { width:96%; max-width:400px; margin:16px; height:calc(100% - 32px); max-height:600px; border-radius:8px; }
    }
    .main-card {
      position:absolute; right:0; bottom:0; background:#fff; display:flex; flex-direction:column;
      overflow:hidden; transition:all .5s; box-shadow:0 10px 16px rgba(0,0,0,0.2), 0 6px 20px rgba(0,0,0,0.19);
    }
    #chatbot_toggle {
      position:absolute; right:0; width:48px; height:48px; border:none;
      background:rebeccapurple; color:#fff; padding:14px; cursor:pointer;
    }
    #chatbot_toggle:hover { background:#7d56a5; }
    .main-title {
      display:flex; align-items:center; height:48px; background:rebeccapurple; color:#fff; font-weight:bold;
    }
    .main-title svg { height:24px; margin:0 8px; fill:#fff; }
    .line { height:1px; background:rebeccapurple; opacity:.2; }
    .chat-area {
      flex:1; padding:16px; overflow:auto; display:flex; flex-direction:column; background:#f9f9f9;
    }
    .input-div { display:flex; height:48px; background:#fff; align-items:center; }
    .input-message {
      flex:1; padding:8px 16px; border:none; font-size:14px;
    }
    .input-message:focus { outline:none; }
    .input-send {
      width:48px; height:48px; border:none; background:transparent; cursor:pointer;
    }
    .input-send:hover { background:lavender; }
    .input-send svg { fill:rebeccapurple; margin:11px 8px; }
    .chat-message-div { display:flex; margin:8px 0; }
    .chat-message-sent { margin-left:auto; background:lavender; padding:8px 16px; border-radius:8px 8px 2px 8px; color:#000; }
    .chat-message-received { margin-right:auto; background:lavender; padding:8px 16px; border-radius:8px 8px 8px 2px; color:#000; }
    @keyframes fadeIn { from{opacity:0;} to{opacity:1;} }

    /* typing placeholder */
    .typing-bubble {
      display:inline-block;
      padding:8px 12px;
      border-radius:8px 8px 8px 2px;
      background:#eee;
    }
    .typing-bubble .dot {
      display:inline-block; width:6px; height:6px; margin:0 2px;
      background:#888; border-radius:50%; animation:blink 1s infinite;
    }
    .typing-bubble .dot:nth-child(2) { animation-delay:.2s; }
    .typing-bubble .dot:nth-child(3) { animation-delay:.4s; }
    @keyframes blink { 0%,100%{opacity:0.2;} 50%{opacity:1;} }
  </style>
</head>
<body>
  <div class="main-card collapsed" id="chat-card">
    <button id="chatbot_toggle" aria-label="Toggle chat">💬</button>
    <div class="main-title">
      <svg viewBox="0 0 24 24"><path d="M12,3A9,9 0 0,0 3,12C3,16.42 ..."/></svg>
      <span>PLQ Chatbot</span>
    </div>
    <div class="line"></div>
    <div class="chat-area" id="chat-area"></div>
    <div class="input-div">
      <input type="text" id="chat-input" class="input-message" placeholder="Type your message…" autocomplete="off">
      <button class="input-send" id="chat-send" aria-label="Send">
        <svg viewBox="0 0 24 24"><path d="M2,21L23,12 2,3 2,10l15,2L2,14z"/></svg>
      </button>
    </div>
  </div>

  <script>
    (function(){
      const card      = document.getElementById('chat-card');
      const toggleBtn = document.getElementById('chatbot_toggle');
      const chatArea  = document.getElementById('chat-area');
      const input     = document.getElementById('chat-input');
      const sendBtn   = document.getElementById('chat-send');
      let firstOpen   = true;

      function addBubble(text, sentByUser) {
        const wrapper = document.createElement('div');
        wrapper.className = 'chat-message-div ' +
          (sentByUser ? 'chat-message-sent' : 'chat-message-received');
        const bub = document.createElement('div');
        bub.className = 'bubble';
        bub.textContent = text;
        wrapper.appendChild(bub);
        chatArea.appendChild(wrapper);
        chatArea.scrollTop = chatArea.scrollHeight;
      }

      function showTyping() {
        const wrapper = document.createElement('div');
        wrapper.className = 'chat-message-div chat-message-received typing';
        const bub = document.createElement('div');
        bub.className = 'typing-bubble';
        bub.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
        wrapper.appendChild(bub);
        chatArea.appendChild(wrapper);
        chatArea.scrollTop = chatArea.scrollHeight;
        return wrapper;
      }

      toggleBtn.addEventListener('click', () => {
        card.classList.toggle('collapsed');
        if (!card.classList.contains('collapsed') && firstOpen) {
          addBubble('🤖 Hi there! How can I help you?', false);
          firstOpen = false;
        }
      });

      async function sendMessage() {
        const txt = input.value.trim();
        if (!txt) return;
        addBubble(txt, true);
        input.value = '';

        const typingNode = showTyping();

        try {
          const res = await fetch('/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: txt })
          });
          const { answer } = await res.json();
          chatArea.removeChild(typingNode);
          addBubble(answer, false);
        } catch {
          chatArea.removeChild(typingNode);
          addBubble('😕 Sorry, something went wrong.', false);
        }
      }

      sendBtn.addEventListener('click', sendMessage);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });
      window.addEventListener('load', () => setTimeout(() => toggleBtn.click(), 500));
    })();
  </script>
</body>
</html>
"""

@app.route('/')
def index():
    session["user_id"] = session.get("user_id") or str(uuid4())
    return render_template_string(HTML)

@app.route('/ask', methods=['POST'])
def ask_route():
    data = request.get_json(force=True)
    question = data.get('question', '').strip()
    if not question:
        return jsonify(answer="😕 Please ask something."), 400

    with open(user_log_path(), "a", encoding="utf-8") as f:
        f.write(question + "\n")

    try:
        answer = get_answer(question, session["user_id"])
    except Exception:
        answer = "😕 I'm sorry, something went wrong."

    return jsonify(answer=answer)

@app.route('/health')
def health():
    return jsonify(status='healthy')

if __name__ == '__main__':
    print("🚀 Starting AI assistant at http://127.0.0.1:5001")
    app.run(host='0.0.0.0', port=5001, debug=True)
