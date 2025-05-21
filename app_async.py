import os
import logging
from uuid import uuid4
from quart import Quart, request, jsonify, render_template_string, abort, session, websocket
from functools import lru_cache
import asyncio

from main import process_question  # Use the async process_question from main.py

# ─── QUART SETUP ─────────────────────────────────────────────────────────
app = Quart(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY") or os.urandom(24)
logging.basicConfig(level=logging.INFO)

# ─── INLINE FLOATING CHAT WIDGET (reuse HTML from app.py) ───────────────
HTML = """
<!doctype html>
<html lang=\"en\"><head>
  <meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
  <title>24/7 Virtual Assistant (Async)</title>
  <style>
    body { margin:0; font-family:'Inter', Arial, sans-serif; background:linear-gradient(135deg,#f8fafd 0%,#eef1fc 100%); }
    #chat-launcher {
      position:fixed; bottom:24px; right:24px;
      background:linear-gradient(135deg,#6a8dff 0%,#7ee8fa 100%);
      color:#fff; border-radius:50%;
      width:56px; height:56px; display:flex; align-items:center; justify-content:center;
      box-shadow:0 6px 24px rgba(80,120,255,0.18);
      cursor:pointer; z-index:1000;
      border:none; outline:none; transition:box-shadow .2s, background .2s;
    }
    #chat-launcher:hover {
      box-shadow:0 8px 32px rgba(80,120,255,0.28);
      background:linear-gradient(135deg,#4e6cff 0%,#5fd6e8 100%);
    }
    #chat-launcher img {
      width:32px;height:32px;border-radius:50%;background:#fff;padding:4px;
      box-shadow:0 2px 8px rgba(80,120,255,0.10);
    }
    #chat-launcher span { display:none; }
    #chat-window {
      display:none; position:fixed; bottom:92px; right:24px;
      width:340px; max-height:480px; background:#fff;
      border-radius:20px; box-shadow:0 8px 40px rgba(80,120,255,0.18);
      border:1.5px solid #e3e8f7;
      flex-direction:column; overflow:hidden; z-index:1000;
      transform: scale(0.85); opacity: 0;
      transition: transform .3s cubic-bezier(.4,2,.6,1), opacity .3s;
    }
    #chat-window.show { transform: scale(1); opacity: 1; display:flex; }
    #chat-header {
      background:linear-gradient(90deg,#6a8dff 0%,#7ee8fa 100%);
      color:#fff; padding:14px 18px;
      display:flex; justify-content:space-between; align-items:center;
      font-weight:600; font-size:1.08em; letter-spacing:0.01em;
      border-bottom:1.5px solid #e3e8f7;
    }
    #chat-header .close-btn {
      cursor:pointer; font-size:22px; line-height:22px; opacity:.7;
      transition: opacity .2s;
    }
    #chat-header .close-btn:hover { opacity:1; }
    #chat-body { flex:1; padding:16px 12px; overflow-y:auto; background:#f7faff; }
    .message { margin:10px 0; display:flex; }
    .message.user { justify-content:flex-end; }
    .message.bot  { justify-content:flex-start; }
    .bubble {
      max-width:75%; padding:10px 16px; border-radius:18px;
      background:#f1f4fa; transition: transform .2s, max-width .2s;
      font-size:1em; box-shadow:0 2px 8px rgba(80,120,255,0.04);
    }
    .user .bubble { background:linear-gradient(90deg,#e1f3ff 0%,#eaf6ff 100%); color:#2a3a5a; }
    .bot .bubble { background:#f1f4fa; color:#3a4a6a; }
    .bubble:hover { transform: scale(1.03); max-width:85%; }
    #chat-input { border-top:1.5px solid #e3e8f7; display:flex; background:#f7faff; }
    #chat-input input {
      flex:1; border:none; padding:14px 12px; outline:none; font-size:1em;
      background:transparent;
    }
    #chat-input button {
      background:linear-gradient(135deg,#6a8dff 0%,#7ee8fa 100%);
      border:none; color:#fff; border-radius:16px;
      padding:0 22px; margin:8px 8px 8px 0; font-size:1em; font-weight:600;
      cursor:pointer; transition: background .2s, box-shadow .2s;
      box-shadow:0 2px 8px rgba(80,120,255,0.10);
    }
    #chat-input button:hover {
      background:linear-gradient(135deg,#4e6cff 0%,#5fd6e8 100%);
      box-shadow:0 4px 16px rgba(80,120,255,0.18);
    }
    .typing-dot {
      display:inline-block; width:7px; height:7px; margin:0 1px;
      background:#b0c4fa; border-radius:50%; animation:blink 1s infinite;
    }
    @keyframes blink { 0%,100%{opacity:0.2;} 50%{opacity:1;} }
  </style>
</head><body>
  <div id="chat-launcher">
    <img src="https://i.pravatar.cc/32" alt="Agent"><span>Chat with us</span>
  </div>
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
  // DOM elements
  const launcher = document.getElementById('chat-launcher'),
        win = document.getElementById('chat-window'),
        closeBtn = document.getElementById('close-btn'),
        bodyEl = document.getElementById('chat-body'),
        inputEl = document.getElementById('user-input'),
        btn = document.getElementById('send-btn');
  
  // State
  let firstOpen = true;
  let isTyping = false;

  // Toggle chat visibility
  function toggleChat(show) {
    win.classList.toggle('show', show);
    if (show) inputEl.focus(); // Auto-focus when opening
  }

  // Chat launcher click handler
  launcher.onclick = () => {
    const open = win.classList.contains('show');
    toggleChat(!open);
    if (!open && firstOpen) {
      // Queue initial messages with slight delay between them
      setTimeout(() => typeMessage('bot', '🤖 Hello! I\'m here 24/7—ask me anything.'), 300);
      setTimeout(() => typeMessage('bot', 'Need any assistance with anything?'), 1000);
      firstOpen = false;
    }
  };

  // Close button handler
  closeBtn.onclick = () => toggleChat(false);

  // Auto-open after load
  window.addEventListener('load', () => setTimeout(() => launcher.click(), 500));

  // Add user message
  function appendUser(text) {
    if (!text.trim()) return;
    
    const msg = document.createElement('div');
    msg.className = 'message user';
    const bub = document.createElement('div');
    bub.className = 'bubble';
    bub.textContent = text;
    msg.appendChild(bub);
    bodyEl.appendChild(msg);
    scrollToBottom();
  }

  // Typewriter effect for bot messages
  function typeMessage(role, text) {
    if (isTyping) {
      setTimeout(() => typeMessage(role, text), 500); // Simple queueing
      return;
    }
    
    isTyping = true;
    const msg = document.createElement('div');
    msg.className = `message ${role}`;
    const bub = document.createElement('div');
    bub.className = 'bubble';
    msg.appendChild(bub);
    bodyEl.appendChild(msg);
    scrollToBottom();
    
    let i = 0;
    const typingSpeed = 20 + Math.random() * 20; // Slightly variable speed
    
    function type() {
      if (i < text.length) {
        bub.textContent = text.slice(0, i + 1);
        i++;
        setTimeout(type, typingSpeed);
      } else {
        isTyping = false;
      }
    }
    
    // Show typing indicator
    bub.textContent = '...';
    setTimeout(type, 300);
  }

  // Scroll to bottom helper
  function scrollToBottom() {
    bodyEl.scrollTop = bodyEl.scrollHeight;
  }

  // Send message to server
  async function sendMessage() {
    const txt = inputEl.value.trim();
    if (!txt || isTyping) return; // Prevent sending while bot is typing
    
    appendUser(txt);
    inputEl.value = '';
    
    // Show typing indicator
    typeMessage('bot', '');
    
    try {
      const res = await fetch('/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: txt })
      });
      
      if (!res.ok) throw new Error('API error');
      
      const { answer } = await res.json();
      
      // Replace typing indicator with actual response
      if (bodyEl.lastChild) {
        bodyEl.removeChild(bodyEl.lastChild);
      }
      typeMessage('bot', answer);
    } catch {
      if (bodyEl.lastChild) {
        bodyEl.removeChild(bodyEl.lastChild);
      }
      typeMessage('bot', '😕 Sorry, something went wrong.');
    }
  }

  // Event listeners
  btn.onclick = sendMessage;
  inputEl.addEventListener('keypress', e => {
    if (e.key === 'Enter') sendMessage();
  });
</script>
</body>
</html>
"""

# ─── ROUTES ─────────────────────────────────────────────────────────────
@app.route('/')
async def index():
    session["user_id"] = session.get("user_id") or str(uuid4())
    user_name = session.get("user_name", "there")
    html = HTML.replace("Virtual Assistant", f"Virtual Assistant for {user_name}")
    return await render_template_string(html)

@app.route('/ask_stream', methods=['POST'])
async def ask_stream():
    data = await request.get_json(force=True)
    question = data.get('question', '').strip()
    if not question:
        return jsonify({'answer': "Question required"}), 400
    user_id = session.get("user_id")
    # Stream the answer word by word
    async def event_stream():
        answer = await process_question(question, user_id)
        for word in answer.split():
            yield f"data: {word} "
            await asyncio.sleep(0.04)  # Simulate typing
    return app.response_class(event_stream(), mimetype='text/event-stream')

@app.route('/health')
async def health():
    return jsonify(status='healthy')

@app.route('/ping')
async def ping():
    return 'pong'

if __name__ == '__main__':
    print("🚀 Starting Async AI assistant at http://127.0.0.1:5002")
    app.run(host='0.0.0.0', port=5002, debug=True) 