// ES module — lobby / overlay UI

import { state } from './state.js';

const $ = id => document.getElementById(id);

export function showLobbyError(msg) {
  $('lobbyError').textContent = msg;
  setTimeout(() => { $('lobbyError').textContent = ''; }, 3000);
}

export function showWaitingRoom({ roomId, players, hostId, mySocketId }) {
  $('displayRoomId').textContent = roomId;
  $('nameForm').style.display = 'none';
  $('waitingRoom').style.display = 'block';

  const ul = $('playerList');
  ul.innerHTML = '';
  players.forEach(p => {
    const li = document.createElement('li');
    li.textContent = p.name;
    if (p.id === hostId) li.classList.add('host-li');
    ul.appendChild(li);
  });

  const isHost = mySocketId === hostId;
  $('btnStart').style.display = isHost ? 'block' : 'none';
  $('waitingMsg').style.display = isHost ? 'none' : 'block';

  $('lobby').style.display = 'flex';
  $('gameOverScreen').style.display = 'none';
  $('game').style.display = 'none';
}

export function showGameOver({ loser, phase }) {
  const myId = state.myId;
  const isHost = state.isHost;

  $('game').style.display = 'none';
  $('gameOverScreen').style.display = 'flex';

  if (phase === 'phase2') {
    // Phase 2 end: show who lost
    if (!loser) {
      $('gameOverTitle').textContent = "It's a draw!";
    } else if (loser.id === myId) {
      $('gameOverTitle').textContent = '😬 You Lose!';
    } else {
      $('gameOverTitle').textContent = `😅 ${loser.name} Loses!`;
    }
    $('scoreTable').style.display = 'none';
  } else {
    // Phase 1 scores (shouldn't normally reach here anymore, but keep as fallback)
    $('scoreTable').style.display = '';
    $('gameOverTitle').textContent = 'Game Over';
  }

  if (isHost) {
    $('btnPlayAgain').style.display = 'block';
    $('playAgainMsg').style.display = 'none';
  } else {
    $('btnPlayAgain').style.display = 'none';
    $('playAgainMsg').style.display = 'block';
  }
}
