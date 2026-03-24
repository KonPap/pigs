// ES module — entry point, button listeners

import socket, { setScaleTable } from './socket.js';
import { setSocket } from './render.js';
import { state } from './state.js';
import { showLobbyError } from './ui.js';
import { addChatMessage, setChatOpen } from './chat.js';

setSocket(socket);

const $ = id => document.getElementById(id);

$('btnCreate').addEventListener('click', () => {
  const name = $('playerName').value.trim();
  if (!name) { showLobbyError('Enter your name first'); return; }
  socket.emit('createRoom', { name });
});

$('btnJoin').addEventListener('click', joinRoom);
$('roomCodeInput').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });
$('roomCodeInput').addEventListener('input', e => {
  e.target.value = e.target.value.replace(/\D/g, '');
});

function joinRoom() {
  const name = $('playerName').value.trim();
  const code = $('roomCodeInput').value.trim().toUpperCase();
  if (!name) { showLobbyError('Enter your name'); return; }
  if (!code) { showLobbyError('Enter a room code'); return; }
  socket.emit('joinRoom', { roomId: code, name });
}

$('btnCopyCode').addEventListener('click', () => {
  navigator.clipboard.writeText(state.myRoomId).then(() => {
    $('btnCopyCode').textContent = '✓ Copied';
    setTimeout(() => { $('btnCopyCode').textContent = '⎘ Copy'; }, 1500);
  });
});

$('btnStart').addEventListener('click', () => socket.emit('startGame'));
$('btnPlayAgain').addEventListener('click', () => socket.emit('playAgain'));
$('btnConcede').addEventListener('click', () => {
  if (confirm('Concede and lose this game?')) socket.emit('concede');
});

// ── Responsive table scaling ──────────────────────────────────
function scaleTable() {
  const table = $('table');
  if (!table) return;

  const barH     = 110;
  const availW   = window.innerWidth;
  const availH   = window.innerHeight - barH;
  const naturalW = 480;
  const naturalH = 760;
  const scale    = Math.min(1, availW / naturalW, availH / naturalH);
  const scaledW  = naturalW * scale;
  const scaledH  = naturalH * scale;

  table.style.zoom     = scale;
  table.style.position = 'absolute';
  table.style.left     = `${(availW - scaledW) / 2}px`;
  table.style.top      = `${(availH - scaledH) / 2}px`;
}

setScaleTable(scaleTable);
scaleTable();
window.addEventListener('resize', scaleTable);

// ── Chat ──────────────────────────────────────────────────────
let chatOpen = false;

$('btnChatToggle').addEventListener('click', () => {
  chatOpen = !chatOpen;
  setChatOpen(chatOpen);
  $('chatPanel').classList.toggle('chat-closed', !chatOpen);
  $('btnChatToggle').textContent = chatOpen ? '✕' : '💬';
  if (chatOpen) {
    $('chatMessages').scrollTop = $('chatMessages').scrollHeight;
    $('chatInput').focus();
  }
});

function sendChat() {
  const text = $('chatInput').value.trim();
  if (!text) return;
  socket.emit('chatMessage', { text });
  $('chatInput').value = '';
}

$('btnChatSend').addEventListener('click', sendChat);
$('chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });

