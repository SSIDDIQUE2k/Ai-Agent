
# app.py
from flask import Flask, request, jsonify, render_template_string, abort
import logging
import sys

from main import get_answer  # reuse CLI logic

# ─── FLASK SETUP ─────────────────────────────────────────────────────────
app = Flask(__name__)
app.logger.setLevel(logging.INFO)

# ─── HTML TEMPLATE ────────────────────────────────────────────────────────
# Using Bootstrap for a polished, responsive UI
HTML = '''
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
    <title>Virtual Assistant</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
      body { padding-top: 2rem; background-color: #f8f9fa; }
      .chat-window { max-height: 60vh; overflow-y: auto; padding: 1rem; background: #fff; border: 1px solid #dee2e6; border-radius: .5rem; }
      .message { margin-bottom: .75rem; }
      .message.user .text { background-color: #e9f5ff; text-align: right; }
      .message.bot .text { background-color: #f1f1f1; }
      .text { display: inline-block; padding: .5rem .75rem; border-radius: .5rem; }
    </style>
  </head>
  <body>
    <div class="container">
      <h1 class="mb-4">Virtual Assistant</h1>
      <div id="chat" class="chat-window mb-3"></div>
      <div class="input-group">
        <input id="input" type="text" class="form-control" placeholder="Ask anything...">
        <button id="send" class="btn btn-primary">Send</button>
      </div>
    </div>
    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
    <script>
      const chat = $('#chat');
      const input = $('#input');
      const send = $('#send');

      function appendMessage(role, text) {
        const msg = $('<div>').addClass('message ' + role);
        const bubble = $('<span>').addClass('text').text(text);
        msg.append(bubble);
        chat.append(msg);
        chat.scrollTop(chat[0].scrollHeight);
      }

      async function ask() {
        const question = input.val().trim();
        if (!question) return;
        appendMessage('user', question);
        input.val('');

        try {
          const res = await fetch('/ask', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question })
          });
          const data = await res.json();
          appendMessage('bot', data.answer || 'Sorry, no answer.');
        } catch (err) {
          appendMessage('bot', 'Error processing request');
          console.error(err);
        }
      }

      send.on('click', ask);
      input.on('keypress', e => { if (e.which === 13) ask(); });
    </script>
  </body>
</html>
'''

# ─── ROUTES ──────────────────────────────────────────────────────────────
@app.route('/')
def index():
    return render_template_string(HTML)

@app.route('/ask', methods=['POST'])
def ask_route():
    data = request.get_json(force=True)
    question = data.get('question', '').strip()
    if not question:
        abort(400, 'Question required')

    try:
        answer = get_answer(question)
    except Exception as e:
        app.logger.error(f"Error generating answer: {e}")
        answer = "I’m sorry, something went wrong."

    return jsonify(answer=answer)

@app.route('/health')
def health():
    return jsonify(status='healthy')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
