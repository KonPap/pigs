// ES module — socket instance + all socket.on handlers

import { state } from './state.js';
import { renderGame } from './render.js';
import { showWaitingRoom, showGameOver, showLobbyError } from './ui.js';

// Imported lazily to avoid circular deps — set by main.js after init
let _scaleTable = () => {};
export function setScaleTable(fn) { _scaleTable = fn; }

const $ = id => document.getElementById(id);

const socket = window.io();

socket.on('roomCreated', ({ roomId }) => {
  state.myRoomId = roomId;
  state.isHost = true;
  $('displayRoomId').textContent = roomId;
  $('nameForm').style.display = 'none';
  $('waitingRoom').style.display = 'block';
  $('btnStart').style.display = 'block';
  $('waitingMsg').style.display = 'none';
});

socket.on('roomUpdate', ({ roomId, players, hostId }) => {
  state.myRoomId = roomId;
  state.isHost = socket.id === hostId;
  showWaitingRoom({ roomId, players, hostId, mySocketId: socket.id });
});

socket.on('joinError', msg => showLobbyError(msg));
socket.on('gameError', msg => console.warn('Game error:', msg));

socket.on('gameStarted', gs => {
  state.myId = gs.myId;
  state.gameState = gs;
  $('lobby').style.display = 'none';
  $('gameOverScreen').style.display = 'none';
  $('game').style.display = 'flex';
  $('scoreTable').style.display = '';  // reset for next game
  _scaleTable();
  renderGame();
});

socket.on('stateUpdate', gs => {
  state.myId = gs.myId;
  state.gameState = gs;
  renderGame();
});

socket.on('gameOver', ({ scores, loser, phase }) => {
  state.gameState = null;
  showGameOver({ scores, loser, phase });
});

export default socket;
