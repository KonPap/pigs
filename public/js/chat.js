// Chat message renderer + toast notifications

const $ = id => document.getElementById(id);

let chatOpen = false;
export function setChatOpen(val) { chatOpen = val; }

export function addChatMessage(name, text, isSystem = false) {
  const msgs = $('chatMessages');
  if (!msgs) return;

  const el = document.createElement('div');
  el.className = 'chat-msg' + (isSystem ? ' system' : '');
  if (isSystem) {
    el.textContent = text;
  } else {
    const nameSpan = document.createElement('span');
    nameSpan.className = 'chat-name';
    nameSpan.textContent = name + ': ';
    el.appendChild(nameSpan);
    el.appendChild(document.createTextNode(text));
  }
  msgs.appendChild(el);
  msgs.scrollTop = msgs.scrollHeight;

  if (!chatOpen) showToast(name, text, isSystem);
}

function showToast(name, text, isSystem) {
  const toast = document.createElement('div');
  toast.className = 'chat-toast';
  toast.textContent = isSystem ? text : `${name}: ${text}`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
