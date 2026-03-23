// ES module — entry point, button listeners

import socket from './socket.js';
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
