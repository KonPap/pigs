/* ════════════════════════════════════════════
   Pig Card Game — Client
   ════════════════════════════════════════════ */

const socket = io();

let myId = null;
let myRoomId = null;
let isHost = false;
let gameState = null;

const $ = id => document.getElementById(id);

// ── Lobby ──────────────────────────────────────────────────────
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
  navigator.clipboard.writeText(myRoomId).then(() => {
    $('btnCopyCode').textContent = '✓ Copied';
    setTimeout(() => { $('btnCopyCode').textContent = '⎘ Copy'; }, 1500);
  });
});

$('btnStart').addEventListener('click', () => socket.emit('startGame'));
$('btnPlayAgain').addEventListener('click', () => socket.emit('playAgain'));

function showLobbyError(msg) {
  $('lobbyError').textContent = msg;
  setTimeout(() => { $('lobbyError').textContent = ''; }, 3000);
}

// ── Socket Events ──────────────────────────────────────────────
socket.on('roomCreated', ({ roomId }) => {
  myRoomId = roomId;
  isHost = true;
  $('displayRoomId').textContent = roomId;
  $('nameForm').style.display = 'none';
  $('waitingRoom').style.display = 'block';
  $('btnStart').style.display = 'block';
  $('waitingMsg').style.display = 'none';
});

socket.on('roomUpdate', ({ roomId, players, hostId }) => {
  myRoomId = roomId;
  isHost = socket.id === hostId;
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

  $('btnStart').style.display = isHost ? 'block' : 'none';
  $('waitingMsg').style.display = isHost ? 'none' : 'block';

  $('lobby').style.display = 'flex';
  $('gameOverScreen').style.display = 'none';
  $('game').style.display = 'none';
});

socket.on('joinError', msg => showLobbyError(msg));
socket.on('gameError', msg => console.warn('Game error:', msg));

socket.on('gameStarted', state => {
  myId = state.myId;
  gameState = state;
  $('lobby').style.display = 'none';
  $('gameOverScreen').style.display = 'none';
  $('game').style.display = 'flex';
  $('scoreTable').style.display = '';  // reset for next game
  renderGame();
});

socket.on('stateUpdate', state => {
  myId = state.myId;
  gameState = state;
  renderGame();
});

socket.on('gameOver', ({ scores, loser, phase }) => {
  gameState = null;
  showGameOver(scores, loser, phase);
});

// ── Card Helpers ───────────────────────────────────────────────
const SUIT_SYMBOL = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const SUIT_COLOR  = { hearts: 'red', diamonds: 'red', clubs: 'black', spades: 'black' };
const RANK_LABEL  = r => ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[r] || String(r));

function makeCard(card, sizeClass = 'card-lg') {
  const el = document.createElement('div');
  el.className = `card ${SUIT_COLOR[card.suit]} ${sizeClass}`;
  el.innerHTML = `
    <div class="card-rank">${RANK_LABEL(card.rank)}</div>
    <div class="card-suit-top">${SUIT_SYMBOL[card.suit]}</div>
    <div class="card-center-suit">${SUIT_SYMBOL[card.suit]}</div>
  `;
  return el;
}

function makeCardBack() {
  const el = document.createElement('div');
  el.className = 'pile-card-back';
  return el;
}

// ── Render ─────────────────────────────────────────────────────
function renderGame() {
  if (!gameState) return;
  if (gameState.phase === 'phase2') {
    $('drawnSection').style.display = 'none';
    $('phase2HandSection').style.display = 'flex';
    renderPhase2Circle();
    renderSequences();      // static display only
    renderPlayerZones();
    renderPhase2Hand();
    renderPhase2StatusBar();
  } else {
    $('drawnSection').style.display = 'flex';
    $('phase2HandSection').style.display = 'none';
    renderDrawCircle();
    renderSequences();
    renderPlayerZones();
    renderDrawnCard();
    renderStatusBar();
  }
}

// ── Draw Circle ────────────────────────────────────────────────
function renderDrawCircle() {
  const state = gameState;
  const slots = state.drawCircleSlots; // array of booleans, length 36
  const container = $('drawCircle');
  container.innerHTML = '';
  if (!slots || slots.length === 0) return;

  const tw = 640, th = 580;
  const cx = tw / 2, cy = th / 2;
  const radius = 170;
  const total = slots.length;

  const isMyTurn = state.currentPlayerId === myId;
  const canDraw = isMyTurn && !state.drawnCard && !state.mustPlayFromPile;

  for (let i = 0; i < total; i++) {
    if (!slots[i]) continue; // slot is empty — leave the gap

    const angle = (i / total) * 2 * Math.PI - Math.PI / 2;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);

    const card = document.createElement('div');
    card.className = 'draw-card' + (canDraw ? ' draw-card-active' : '');
    const rotateDeg = (angle * 180) / Math.PI + 90;
    card.style.left = (x - 21) + 'px';
    card.style.top  = (y - 30) + 'px';
    card.style.transform = `rotate(${rotateDeg}deg)`;

    if (canDraw) {
      const slotIndex = i;
      card.addEventListener('click', () => {
        socket.emit('drawCard', { slotIndex });
      });
    }

    container.appendChild(card);
  }
}

// ── Sequence Piles ─────────────────────────────────────────────
function renderSequences() {
  const state = gameState;
  const isMyTurn = state.currentPlayerId === myId;
  const drawnCard = state.drawnCard;

  for (let i = 0; i < 4; i++) {
    const pile = state.sequences[i]; // { topCard, count }
    const pileEl = $(`seq-${i}`);
    const pileCards = pileEl.querySelector('.pile-cards');
    pileCards.innerHTML = '';

    const emptyLabel = pileEl.querySelector('.seq-empty');
    emptyLabel.style.display = pile.count > 0 ? 'none' : 'block';

    if (pile.count > 0 && pile.topCard) {
      const cardEl = document.createElement('div');
      cardEl.className = `pile-card ${SUIT_COLOR[pile.topCard.suit]}`;
      cardEl.innerHTML = `<span>${RANK_LABEL(pile.topCard.rank)}</span><span>${SUIT_SYMBOL[pile.topCard.suit]}</span>`;
      pileCards.appendChild(cardEl);
    }

    pileEl.classList.remove('valid-target');
    pileEl.onclick = null;
    pileEl.style.cursor = 'default';

    if (isMyTurn) {
      // Drawn card must go to sequence
      if (drawnCard && state.mustSequence && state.sequencePileIndex === i) {
        pileEl.classList.add('valid-target');
        pileEl.style.cursor = 'pointer';
        pileEl.onclick = () => socket.emit('playSequence', { pileIndex: i });
      }
      // Top pile card must go to sequence (at turn start, before drawing)
      else if (!drawnCard && state.mustPlayFromPile && state.pileSequenceIndex === i) {
        pileEl.classList.add('valid-target');
        pileEl.style.cursor = 'pointer';
        pileEl.onclick = () => socket.emit('playPileToSequence');
      }
    }
  }
}

// ── Player Zones — fixed N/E/W/S seats (all players including self) ──
// Slot 0 = South (you, bottom of table)
// Slot 1 = East  (right neighbor)
// Slot 2 = North (opposite, 4-player only)
// Slot 3 = West  (left neighbor)
function slotPosition(relativeSlot, totalPlayers) {
  const all = {
    0: { x: 320, y: 505 },  // South — you
    1: { x: 565, y: 285 },  // East
    2: { x: 320, y: 62  },  // North
    3: { x: 75,  y: 285 },  // West
  };
  if (totalPlayers === 2) {
    // You (S), opponent (N)
    return relativeSlot === 0 ? all[0] : all[2];
  }
  if (totalPlayers === 3) {
    // You (S), East, West — no North
    return [all[0], all[1], all[3]][relativeSlot];
  }
  // 4 players: S, E, N, W
  return all[relativeSlot];
}

function renderPlayerZones() {
  const state = gameState;
  const container = $('playerZones');
  container.innerHTML = '';

  const myIndex = state.players.findIndex(p => p.id === myId);
  const n = state.players.length;
  const isMyTurn = state.currentPlayerId === myId;
  const targets = state.playerTargets || [];

  state.players.forEach((player, i) => {
    const relSlot = ((i - myIndex) + n) % n; // 0=self, 1=right, 2=opposite, 3=left
    const pos = slotPosition(relSlot, n);

    const zone = document.createElement('div');
    zone.className = 'player-zone';
    zone.style.left = pos.x + 'px';
    zone.style.top  = pos.y + 'px';

    const isSelf = player.id === myId;
    const isActive = player.id === state.currentPlayerId;

    // Dump from drawn card (after drawing)
    const canDumpDrawn = !isSelf && isMyTurn && state.drawnCard && !state.mustSequence &&
      targets.some(t => t.targetId === player.id);

    // Forced dump from own pile (at turn start, before drawing)
    const pileDumpTargets = state.pileDumpTargets || [];
    const mustDumpOwn = !isSelf && isMyTurn && state.mustPlayFromPile && state.pileSequenceIndex === -1 &&
      pileDumpTargets.some(t => t.targetId === player.id);

    if (canDumpDrawn) {
      zone.classList.add('valid-dump');
      zone.addEventListener('click', () => {
        socket.emit('playCard', { targetId: player.id });
      });
    } else if (mustDumpOwn) {
      zone.classList.add('valid-dump');
      zone.addEventListener('click', () => {
        socket.emit('dumpPileCard', { targetId: player.id });
      });
    }

    const nameEl = document.createElement('div');
    nameEl.className = 'player-name' + (isActive ? ' active-name' : '') + (isSelf ? ' self-name' : '');
    nameEl.textContent = isSelf ? `${player.name} (you)` : player.name;
    zone.appendChild(nameEl);

    // Pile display (top card face-up, rest face-down)
    const pileWrap = document.createElement('div');
    pileWrap.className = 'player-pile';

    if (player.pileCount === 0) {
      const empty = document.createElement('div');
      empty.className = 'pile-empty-label';
      empty.textContent = 'empty';
      pileWrap.appendChild(empty);
    } else {
      const behind = Math.min(player.pileCount - 1, 2);
      for (let k = behind; k >= 1; k--) {
        const back = makeCardBack();
        back.style.position = 'absolute';
        back.style.top = (k * -3) + 'px';
        back.style.left = (k * 2) + 'px';
        pileWrap.appendChild(back);
      }
      if (player.topCard) {
        const topEl = makeCard(player.topCard, 'card-sm pile-top-card');
        pileWrap.appendChild(topEl);
      }
    }
    zone.appendChild(pileWrap);

    const countEl = document.createElement('div');
    countEl.className = 'player-count';
    countEl.textContent = `${player.pileCount} card${player.pileCount !== 1 ? 's' : ''}`;
    zone.appendChild(countEl);

    container.appendChild(zone);
  });
}

// ── Drawn Card (status bar) ────────────────────────────────────
function renderDrawnCard() {
  const state = gameState;
  const infoEl = $('drawnInfo');
  const displayEl = $('drawnCardDisplay');
  displayEl.innerHTML = '';

  const isMyTurn = state.currentPlayerId === myId;

  if (!state.drawnCard) {
    infoEl.className = '';
    if (isMyTurn && state.mustPlayFromPile) {
      infoEl.textContent = state.pileSequenceIndex !== -1
        ? 'Play your top card to the sequence!'
        : 'Dump your top card first!';
      infoEl.className = 'my-turn no-play';
    } else if (isMyTurn && state.drawCircleCount > 0) {
      infoEl.textContent = 'Click a circle card to draw';
      infoEl.className = 'my-turn';
    } else if (isMyTurn && state.drawCircleCount === 0) {
      infoEl.textContent = 'Circle is empty — game ending…';
      infoEl.className = 'my-turn';
    } else {
      infoEl.textContent = '';
    }
    return;
  }

  const card = state.drawnCard;
  const cardEl = makeCard(card, 'card-lg');
  displayEl.appendChild(cardEl);

  if (isMyTurn) {
    infoEl.className = 'my-turn';
    if (state.mustSequence) {
      infoEl.textContent = `Goes to sequence!\nClick the ${SUIT_SYMBOL[card.suit]} pile`;
    } else if ((state.playerTargets || []).length > 0) {
      infoEl.textContent = 'Click a highlighted\nplayer to dump on them\n(or keep drawing next turn)';
    } else {
      infoEl.textContent = 'No valid plays.\nCard goes to YOUR pile.';
      infoEl.className = 'my-turn no-play';
    }
  } else {
    const name = state.players.find(p => p.id === state.currentPlayerId)?.name || '';
    infoEl.className = '';
    infoEl.textContent = `${name} drew:`;
  }
}

// ── Status Bar ─────────────────────────────────────────────────
function renderStatusBar() {
  const state = gameState;
  if (!state) return;

  const isMyTurn = state.currentPlayerId === myId;

  const turnEl = $('turnInfo');
  if (isMyTurn) {
    turnEl.textContent = 'Your turn';
    turnEl.style.color = '#f1c40f';
  } else {
    const name = state.players.find(p => p.id === state.currentPlayerId)?.name || '?';
    turnEl.textContent = `${name}'s turn`;
    turnEl.style.color = '#aaa';
  }

  $('circleCount').textContent = `${state.drawCircleCount} cards in circle`;

  // Piles are now visible on the table — just show circle count here
  $('allPiles').innerHTML = '';
}

// ── Phase 2: Clear the draw circle area (sequences take center stage) ──
function renderPhase2Circle() {
  $('drawCircle').innerHTML = '';
}

// ── Phase 2: Player's own hand ──────────────────────────────────
function renderPhase2Hand() {
  const state = gameState;
  const isMyTurn = state.currentPlayerId === myId;
  const validIds = new Set(state.phase2ValidCardIds || []);
  const handEl = $('phase2Cards');
  handEl.innerHTML = '';

  const hand = state.myHand || [];
  if (hand.length === 0) {
    const msg = document.createElement('div');
    msg.style.cssText = 'color:#aaa;font-size:0.8rem;padding:4px;';
    msg.textContent = 'No cards — done!';
    handEl.appendChild(msg);
    return;
  }

  // Sort by rank for easier reading
  const sorted = [...hand].sort((a, b) => a.rank - b.rank);
  sorted.forEach(card => {
    const cardEl = makeCard(card, 'card-sm');
    const canPlay = isMyTurn && validIds.has(card.id);
    if (canPlay) {
      cardEl.classList.add('playable');
      cardEl.addEventListener('click', () => {
        socket.emit('playPhase2Card', { cardId: card.id });
      });
    } else if (!isMyTurn && validIds.has(card.id)) {
      // Dim cards that aren't playable this turn but show which ones fit
      cardEl.style.opacity = '0.85';
    } else if (!validIds.has(card.id)) {
      cardEl.style.opacity = '0.45';
    }
    handEl.appendChild(cardEl);
  });
}

// ── Phase 2: Status bar ─────────────────────────────────────────
function renderPhase2StatusBar() {
  const state = gameState;
  const isMyTurn = state.currentPlayerId === myId;

  const turnEl = $('turnInfo');
  if (isMyTurn) {
    turnEl.textContent = 'Your turn — play a card';
    turnEl.style.color = '#f1c40f';
  } else {
    const name = state.players.find(p => p.id === state.currentPlayerId)?.name || '?';
    turnEl.textContent = `${name}'s turn`;
    turnEl.style.color = '#aaa';
  }

  const validIds = new Set(state.phase2ValidCardIds || []);
  if (isMyTurn && validIds.size === 0) {
    $('circleCount').textContent = 'No valid plays — skipping…';
  } else {
    $('circleCount').textContent = 'Phase 2 — play to the sequences';
  }
  $('allPiles').innerHTML = '';
}

// ── Game Over ──────────────────────────────────────────────────
function showGameOver(scores, loser, phase) {
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
    const winner = scores[0];
    $('gameOverTitle').textContent = winner.id === myId ? '🏆 You Win!' : `🎉 ${winner.name} Wins!`;

    const tbody = $('scoreRows');
    tbody.innerHTML = '';
    scores.forEach((s, i) => {
      const tr = document.createElement('tr');
      if (i === 0) tr.classList.add('winner-row');
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${s.name}${s.id === myId ? ' (you)' : ''}</td>
        <td>${s.pileCount}</td>
        <td>${s.score}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  if (isHost) {
    $('btnPlayAgain').style.display = 'block';
    $('playAgainMsg').style.display = 'none';
  } else {
    $('btnPlayAgain').style.display = 'none';
    $('playAgainMsg').style.display = 'block';
  }
}
