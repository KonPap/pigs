// ES module — entry point, button listeners

import socket, { setScaleTable } from './socket.js';
import { setSocket } from './render.js';
import { state } from './state.js';
import { showLobbyError } from './ui.js';

setSocket(socket);

const $ = id => document.getElementById(id);

$('btnCreate').addEventListener('click', () => {
  const name = $('playerName').value.trim();
  if (!name) { showLobbyError('Enter your name first'); return; }
  socket.emit('createRoom', { name });
});

$('btnJoin').addEventListener('click', joinRoom);
$('roomCodeInput').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });

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

// ── Responsive table scaling ──────────────────────────────────
function scaleTable() {
  const table = $('table');
  if (!table) return;

  const barH   = 110;
  const availW = window.innerWidth;
  const availH = window.innerHeight - barH;
  const naturalW = 524;   // 480px + 2×22px border
  const naturalH = 804;   // 760px + 2×22px border
  const scale  = Math.min(1, availW / naturalW, availH / naturalH);

  table.style.zoom = scale;
}

setScaleTable(scaleTable);
scaleTable();
window.addEventListener('resize', scaleTable);
