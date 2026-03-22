const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {};

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = [6, 7, 8, 9, 10, 11, 12, 13, 14]; // J=11 Q=12 K=13 A=14

function createDeck(numDecks = 1) {
  const deck = [];
  for (let d = 0; d < numDecks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ suit, rank, id: `${suit}_${rank}_${d}` });
      }
    }
  }
  return deck;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateRoomId() {
  return crypto.randomBytes(2).toString('hex').toUpperCase();
}

// Returns pile index (0-3) if card can be placed on that pile, else -1.
// Sequences run 6→7→…→K (rank 13). Aces are never placed on sequences.
function canPlaySequence(card, sequences) {
  if (card.rank === 14) return -1; // Aces never go on sequences
  for (let i = 0; i < 4; i++) {
    const pile = sequences[i];
    if (pile.length === 0 && card.rank === 6) return i;
    if (pile.length > 0 && card.rank === pile[pile.length - 1].rank + 1) return i;
  }
  return -1;
}

function evaluatePlays(card, sequences, players, currentPlayerId) {
  const pileIndex = canPlaySequence(card, sequences);
  if (pileIndex !== -1) {
    return { mustSequence: true, sequencePileIndex: pileIndex, playerTargets: [] };
  }

  const n = players.length;
  const myIdx = players.findIndex(p => p.id === currentPlayerId);
  const neighborIds = new Set();
  if (n >= 2) {
    neighborIds.add(players[(myIdx + 1) % n].id);
    neighborIds.add(players[(myIdx - 1 + n) % n].id);
  }

  const playerTargets = [];
  for (const player of players) {
    if (player.id === currentPlayerId) continue;
    if (!neighborIds.has(player.id)) continue;
    if (player.pile.length === 0) continue;
    const topCard = player.pile[player.pile.length - 1];
    if (card.rank === topCard.rank - 1) {
      playerTargets.push({ targetId: player.id, targetName: player.name });
    }
  }
  return { mustSequence: false, sequencePileIndex: -1, playerTargets };
}

function nextTurn(room) {
  room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;
  checkMustPlayFromPile(room);
}

// At turn start: check if top pile card must be played (sequence first, then neighbor dump).
// Keeps re-checking after each forced play until nothing is possible.
function checkMustPlayFromPile(room) {
  const currentPlayer = room.players[room.currentTurnIndex];
  if (!currentPlayer || currentPlayer.pile.length === 0) {
    room.mustPlayFromPile = false;
    room.pileSequenceIndex = -1;
    room.pileDumpTargets = [];
    return;
  }

  const topCard = currentPlayer.pile[currentPlayer.pile.length - 1];

  // 1. Sequence has priority
  const seqIdx = canPlaySequence(topCard, room.sequences);
  if (seqIdx !== -1) {
    room.mustPlayFromPile = true;
    room.pileSequenceIndex = seqIdx;
    room.pileDumpTargets = [];
    return;
  }

  // 2. Neighbor dump
  const n = room.players.length;
  const myIdx = room.currentTurnIndex;
  const neighborIds = new Set();
  if (n >= 2) {
    neighborIds.add(room.players[(myIdx + 1) % n].id);
    neighborIds.add(room.players[(myIdx - 1 + n) % n].id);
  }

  const targets = [];
  for (const player of room.players) {
    if (player.id === currentPlayer.id) continue;
    if (!neighborIds.has(player.id)) continue;
    if (player.pile.length === 0) continue;
    const neighborTop = player.pile[player.pile.length - 1];
    if (topCard.rank === neighborTop.rank - 1) {
      targets.push({ targetId: player.id, targetName: player.name });
    }
  }

  room.mustPlayFromPile = targets.length > 0;
  room.pileSequenceIndex = -1;
  room.pileDumpTargets = targets;
}

// ── Phase 2 helpers ──────────────────────────────────────────────
function getPhase2ValidCards(player, sequences) {
  return player.pile.filter(card => canPlaySequence(card, sequences) !== -1);
}

// End: last player with cards loses
function checkPhase2End(roomId) {
  const room = rooms[roomId];
  const withCards = room.players.filter(p => p.pile.length > 0);
  if (withCards.length <= 1) {
    room.phase = 'ended';
    const loser = withCards[0] || null;
    io.to(roomId).emit('gameOver', {
      phase: 'phase2',
      loser: loser ? { id: loser.id, name: loser.name } : null
    });
    return true;
  }
  return false;
}

// End when nobody with cards can play: most cards = loser
function checkPhase2AllStuck(roomId) {
  const room = rooms[roomId];
  const canPlay = room.players.some(
    p => p.pile.length > 0 && getPhase2ValidCards(p, room.sequences).length > 0
  );
  if (canPlay) return false;
  room.phase = 'ended';
  const sorted = room.players.filter(p => p.pile.length > 0)
    .sort((a, b) => b.pile.length - a.pile.length);
  const loser = sorted[0] || null;
  io.to(roomId).emit('gameOver', {
    phase: 'phase2',
    loser: loser ? { id: loser.id, name: loser.name } : null
  });
  return true;
}

// Advance to next player who has cards AND valid plays; skip others.
// Returns true if all remaining players are stuck (no valid plays exist).
function advancePhase2Turn(room) {
  const n = room.players.length;
  for (let attempts = 0; attempts < n; attempts++) {
    room.currentTurnIndex = (room.currentTurnIndex + 1) % n;
    const player = room.players[room.currentTurnIndex];
    if (player.pile.length > 0 && getPhase2ValidCards(player, room.sequences).length > 0) {
      return false; // found a valid player
    }
  }
  return true; // all stuck
}

function startPhase2(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.phase = 'phase2';
  room.mustSequence = false;
  room.sequencePileIndex = -1;
  room.playerTargets = [];
  room.mustPlayFromPile = false;
  room.pileSequenceIndex = -1;
  room.pileDumpTargets = [];
  room.drawnCard = null;
  room.drawingPlayerId = null;

  // Remove aces from all piles
  for (const p of room.players) {
    p.pile = p.pile.filter(c => c.rank !== 14);
  }

  if (checkPhase2End(roomId)) return;

  // Find first player who has cards and can play
  room.currentTurnIndex = -1; // advancePhase2Turn increments before checking
  const allStuck = advancePhase2Turn(room);
  if (allStuck) { checkPhase2AllStuck(roomId); return; }

  broadcastState(roomId);
}

// ── State builder ────────────────────────────────────────────────
function buildState(room, forPlayerId) {
  const current = room.players[room.currentTurnIndex];
  const isPhase2 = room.phase === 'phase2';
  const myPlayer = room.players.find(p => p.id === forPlayerId);

  return {
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      pileCount: p.pile.length,
      topCard: p.pile.length > 0 ? p.pile[p.pile.length - 1] : null,
      connected: p.connected,
      isHost: p.id === room.hostId
    })),
    drawCircleCount: isPhase2 ? 0 : room.drawCircleSlots.filter(s => s !== null).length,
    drawCircleSlots: isPhase2 ? [] : room.drawCircleSlots.map(s => s !== null),
    sequences: room.sequences.map(pile => ({
      topCard: pile.length > 0 ? pile[pile.length - 1] : null,
      count: pile.length
    })),
    currentTurnIndex: room.currentTurnIndex,
    currentPlayerId: current ? current.id : null,
    drawnCard: room.drawnCard,
    mustSequence: room.mustSequence,
    sequencePileIndex: room.sequencePileIndex,
    playerTargets: room.playerTargets,
    mustPlayFromPile: room.mustPlayFromPile,
    pileSequenceIndex: room.pileSequenceIndex,
    pileDumpTargets: room.pileDumpTargets,
    // Phase 2 specific
    phase: room.phase,
    myHand: isPhase2 && myPlayer ? myPlayer.pile.slice() : null,
    // Which of the player's own cards can be played right now
    phase2ValidCardIds: isPhase2 && myPlayer
      ? getPhase2ValidCards(myPlayer, room.sequences).map(c => c.id)
      : [],
    myId: forPlayerId
  };
}

function broadcastState(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  for (const p of room.players) {
    const sock = io.sockets.sockets.get(p.id);
    if (sock) sock.emit('stateUpdate', buildState(room, p.id));
  }
}

// Circle ends → go to phase 2
function endCirclePhase(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  startPhase2(roomId);
}

function handleDraw(roomId, requestedSlot) {
  const room = rooms[roomId];
  if (!room || room.phase !== 'playing') return;

  const filled = room.drawCircleSlots
    .map((s, i) => (s !== null ? i : -1))
    .filter(i => i !== -1);

  if (filled.length === 0) { endCirclePhase(roomId); return; }

  const currentPlayer = room.players[room.currentTurnIndex];

  const slotIdx = (requestedSlot !== undefined && room.drawCircleSlots[requestedSlot] !== null)
    ? requestedSlot
    : filled[crypto.randomInt(filled.length)];
  const card = room.drawCircleSlots[slotIdx];
  room.drawCircleSlots[slotIdx] = null;
  room.drawnCard = card;
  room.drawingPlayerId = currentPlayer.id;

  const { mustSequence, sequencePileIndex, playerTargets } = evaluatePlays(
    card, room.sequences, room.players, currentPlayer.id
  );
  room.mustSequence = mustSequence;
  room.sequencePileIndex = sequencePileIndex;
  room.playerTargets = playerTargets;

  broadcastState(roomId);

  if (!mustSequence && playerTargets.length === 0) {
    setTimeout(() => {
      const r = rooms[roomId];
      if (!r || r.phase !== 'playing' || !r.drawnCard) return;
      const drawer = r.players.find(p => p.id === r.drawingPlayerId);
      if (drawer) drawer.pile.push(r.drawnCard);
      r.drawnCard = null;
      r.drawingPlayerId = null;
      r.mustSequence = false;
      r.sequencePileIndex = -1;
      r.playerTargets = [];
      // If that was the last card in the circle, start phase 2 now
      const remaining = r.drawCircleSlots.filter(s => s !== null).length;
      if (remaining === 0) {
        endCirclePhase(roomId);
        return;
      }
      nextTurn(r);
      broadcastState(roomId);
    }, 1200);
  }
}

// ── Socket handlers ─────────────────────────────────────────────
io.on('connection', (socket) => {
  let myRoomId = null;

  socket.on('createRoom', ({ name }) => {
    let roomId = generateRoomId();
    while (rooms[roomId]) roomId = generateRoomId();

    rooms[roomId] = {
      hostId: socket.id,
      players: [{ id: socket.id, name, pile: [], connected: true }],
      drawCircleSlots: [],
      sequences: [[], [], [], []],
      currentTurnIndex: 0,
      drawnCard: null,
      drawingPlayerId: null,
      mustSequence: false,
      sequencePileIndex: -1,
      playerTargets: [],
      mustPlayFromPile: false,
      pileSequenceIndex: -1,
      pileDumpTargets: [],

      phase: 'waiting'
    };

    myRoomId = roomId;
    socket.join(roomId);
    socket.emit('roomCreated', { roomId });
    io.to(roomId).emit('roomUpdate', {
      roomId,
      players: rooms[roomId].players.map(p => ({ id: p.id, name: p.name })),
      hostId: socket.id
    });
  });

  socket.on('joinRoom', ({ roomId, name }) => {
    const room = rooms[roomId];
    if (!room) { socket.emit('joinError', 'Room not found'); return; }
    if (room.phase !== 'waiting') { socket.emit('joinError', 'Game already started'); return; }
    if (room.players.length >= 4) { socket.emit('joinError', 'Room is full (max 4)'); return; }
    if (room.players.find(p => p.name === name)) {
      socket.emit('joinError', 'Name already taken'); return;
    }

    room.players.push({ id: socket.id, name, pile: [], connected: true });
    myRoomId = roomId;
    socket.join(roomId);
    io.to(roomId).emit('roomUpdate', {
      roomId,
      players: room.players.map(p => ({ id: p.id, name: p.name })),
      hostId: room.hostId
    });
  });

  socket.on('startGame', () => {
    if (!myRoomId) return;
    const room = rooms[myRoomId];
    if (!room || room.hostId !== socket.id) return;

    room.phase = 'playing';
    room.sequences = [[], [], [], []];
    room.currentTurnIndex = 0;
    room.drawnCard = null;
    room.drawingPlayerId = null;
    room.mustSequence = false;
    room.sequencePileIndex = -1;
    room.playerTargets = [];
    room.mustPlayFromPile = false;
    room.pileSequenceIndex = -1;
    room.pileDumpTargets = [];
    for (const p of room.players) p.pile = [];

    room.drawCircleSlots = shuffle(createDeck(1));

    for (const p of room.players) {
      const sock = io.sockets.sockets.get(p.id);
      if (sock) sock.emit('gameStarted', buildState(room, p.id));
    }
  });

  // Forced dump from own pile (start of turn, before drawing)
  socket.on('dumpPileCard', ({ targetId }) => {
    if (!myRoomId) return;
    const room = rooms[myRoomId];
    if (!room || room.phase !== 'playing') return;

    const currentPlayer = room.players[room.currentTurnIndex];
    if (!currentPlayer || currentPlayer.id !== socket.id) {
      socket.emit('gameError', 'Not your turn'); return;
    }
    if (!room.mustPlayFromPile) {
      socket.emit('gameError', 'No forced dump available'); return;
    }
    if (!room.pileDumpTargets.some(t => t.targetId === targetId)) {
      socket.emit('gameError', 'Invalid dump target'); return;
    }
    if (currentPlayer.pile.length === 0) {
      socket.emit('gameError', 'Your pile is empty'); return;
    }

    const target = room.players.find(p => p.id === targetId);
    if (!target || target.pile.length === 0) {
      socket.emit('gameError', 'Target has no cards'); return;
    }

    const card = currentPlayer.pile.pop();
    target.pile.push(card);
    checkMustPlayFromPile(room);
    broadcastState(myRoomId);
  });

  // Play top pile card to a sequence pile (forced at turn start)
  socket.on('playPileToSequence', () => {
    if (!myRoomId) return;
    const room = rooms[myRoomId];
    if (!room || room.phase !== 'playing') return;

    const currentPlayer = room.players[room.currentTurnIndex];
    if (!currentPlayer || currentPlayer.id !== socket.id) {
      socket.emit('gameError', 'Not your turn'); return;
    }
    if (!room.mustPlayFromPile || room.pileSequenceIndex === -1) {
      socket.emit('gameError', 'No pile-to-sequence play available'); return;
    }
    if (currentPlayer.pile.length === 0) {
      socket.emit('gameError', 'Your pile is empty'); return;
    }

    const card = currentPlayer.pile[currentPlayer.pile.length - 1];
    const validIdx = canPlaySequence(card, room.sequences);
    if (validIdx !== room.pileSequenceIndex) {
      socket.emit('gameError', 'Card does not fit that pile'); return;
    }

    currentPlayer.pile.pop();
    room.sequences[validIdx].push(card);
    checkMustPlayFromPile(room);
    broadcastState(myRoomId);
  });

  socket.on('drawCard', ({ slotIndex } = {}) => {
    if (!myRoomId) return;
    const room = rooms[myRoomId];
    if (!room || room.phase !== 'playing') return;

    const currentPlayer = room.players[room.currentTurnIndex];
    if (!currentPlayer || currentPlayer.id !== socket.id) {
      socket.emit('gameError', 'Not your turn'); return;
    }
    if (room.drawnCard) {
      socket.emit('gameError', 'Already holding a drawn card'); return;
    }
    if (room.mustPlayFromPile) {
      socket.emit('gameError', 'Must dump your top card first'); return;
    }
    const filled = room.drawCircleSlots.filter(s => s !== null);
    if (filled.length === 0) {
      endCirclePhase(myRoomId); return;
    }

    handleDraw(myRoomId, slotIndex);
  });

  socket.on('playSequence', ({ pileIndex }) => {
    if (!myRoomId) return;
    const room = rooms[myRoomId];
    if (!room || room.phase !== 'playing') return;

    const currentPlayer = room.players[room.currentTurnIndex];
    if (!currentPlayer || currentPlayer.id !== socket.id) {
      socket.emit('gameError', 'Not your turn'); return;
    }
    if (!room.drawnCard || !room.mustSequence) {
      socket.emit('gameError', 'No sequence play available'); return;
    }
    if (pileIndex !== room.sequencePileIndex) {
      socket.emit('gameError', 'Wrong pile index'); return;
    }

    const card = room.drawnCard;
    const validIdx = canPlaySequence(card, room.sequences);
    if (validIdx !== pileIndex) {
      socket.emit('gameError', 'Card does not fit that pile'); return;
    }

    room.sequences[pileIndex].push(card);
    room.drawnCard = null;
    room.drawingPlayerId = null;
    room.mustSequence = false;
    room.sequencePileIndex = -1;
    room.playerTargets = [];
    checkMustPlayFromPile(room); // pile top card may now need to be played

    const remaining = room.drawCircleSlots.filter(s => s !== null).length;
    if (remaining === 0) {
      endCirclePhase(myRoomId);
    } else {
      broadcastState(myRoomId);
    }
  });

  socket.on('playCard', ({ targetId }) => {
    if (!myRoomId) return;
    const room = rooms[myRoomId];
    if (!room || room.phase !== 'playing') return;

    const currentPlayer = room.players[room.currentTurnIndex];
    if (!currentPlayer || currentPlayer.id !== socket.id) {
      socket.emit('gameError', 'Not your turn'); return;
    }
    if (!room.drawnCard) {
      socket.emit('gameError', 'No card drawn'); return;
    }
    if (room.mustSequence) {
      socket.emit('gameError', 'Must play to sequence first'); return;
    }

    const target = room.players.find(p => p.id === targetId);
    if (!target || target.id === socket.id) {
      socket.emit('gameError', 'Invalid target'); return;
    }
    if (target.pile.length === 0) {
      socket.emit('gameError', 'Target has no cards'); return;
    }
    const card = room.drawnCard;
    const topCard = target.pile[target.pile.length - 1];
    if (card.rank !== topCard.rank - 1) {
      socket.emit('gameError', 'Card must be exactly one less than their top card'); return;
    }

    target.pile.push(card);
    room.drawnCard = null;
    room.drawingPlayerId = null;
    room.mustSequence = false;
    room.sequencePileIndex = -1;
    room.playerTargets = [];
    checkMustPlayFromPile(room); // pile top card may now need to be played

    const remaining = room.drawCircleSlots.filter(s => s !== null).length;
    if (remaining === 0) {
      endCirclePhase(myRoomId);
    } else {
      broadcastState(myRoomId);
    }
  });

  // Phase 2: play a card from hand to discard pile
  socket.on('playPhase2Card', ({ cardId }) => {
    if (!myRoomId) return;
    const room = rooms[myRoomId];
    if (!room || room.phase !== 'phase2') return;

    const currentPlayer = room.players[room.currentTurnIndex];
    if (!currentPlayer || currentPlayer.id !== socket.id) {
      socket.emit('gameError', 'Not your turn'); return;
    }

    const cardIdx = currentPlayer.pile.findIndex(c => c.id === cardId);
    if (cardIdx === -1) {
      socket.emit('gameError', 'Card not in your hand'); return;
    }

    const card = currentPlayer.pile[cardIdx];
    const seqIdx = canPlaySequence(card, room.sequences);
    if (seqIdx === -1) {
      socket.emit('gameError', 'Card does not fit any sequence pile'); return;
    }

    currentPlayer.pile.splice(cardIdx, 1);
    room.sequences[seqIdx].push(card);

    if (checkPhase2End(myRoomId)) return;
    const allStuck = advancePhase2Turn(room);
    if (allStuck) { checkPhase2AllStuck(myRoomId); return; }
    broadcastState(myRoomId);
  });

  socket.on('playAgain', () => {
    if (!myRoomId) return;
    const room = rooms[myRoomId];
    if (!room || room.hostId !== socket.id) return;

    room.phase = 'waiting';
    room.drawCircleSlots = [];
    room.sequences = [[], [], [], []];
    room.drawnCard = null;
    room.drawingPlayerId = null;
    room.mustSequence = false;
    room.sequencePileIndex = -1;
    room.playerTargets = [];
    room.mustPlayFromPile = false;
    room.pileSequenceIndex = -1;
    room.pileDumpTargets = [];
    room.currentTurnIndex = 0;
    for (const p of room.players) p.pile = [];

    io.to(myRoomId).emit('roomUpdate', {
      roomId: myRoomId,
      players: room.players.map(p => ({ id: p.id, name: p.name })),
      hostId: room.hostId
    });
  });

  socket.on('disconnect', () => {
    if (!myRoomId || !rooms[myRoomId]) return;
    const room = rooms[myRoomId];
    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.connected = false;
      io.to(myRoomId).emit('playerDisconnected', { name: player.name });
    }
    if (room.players.every(p => !p.connected)) delete rooms[myRoomId];
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Pig card game running at http://localhost:${PORT}`));
