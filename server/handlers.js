const crypto = require('crypto');
const { createDeck, shuffle, canPlaySequence, evaluatePlays, checkMustPlayFromPile, getPhase2ValidCards } = require('./game');
const { rooms, generateRoomId, freshRoomState, resetForGame, buildState, broadcastState } = require('./rooms');
const { MAX_PLAYERS } = require('./config');

// ── Phase 2 helpers ──────────────────────────────────────────────

// End: last player with cards loses
function checkPhase2End(io, roomId) {
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
function checkPhase2AllStuck(io, roomId) {
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

function startPhase2(io, roomId) {
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

  if (checkPhase2End(io, roomId)) return;

  // Find first player who has cards and can play
  room.currentTurnIndex = -1; // advancePhase2Turn increments before checking
  const allStuck = advancePhase2Turn(room);
  if (allStuck) { checkPhase2AllStuck(io, roomId); return; }

  broadcastState(io, roomId);
}

// Circle ends → go to phase 2
function endCirclePhase(io, roomId) {
  const room = rooms[roomId];
  if (!room) return;
  startPhase2(io, roomId);
}

function nextTurn(room) {
  room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;
  checkMustPlayFromPile(room);
}

function handleDraw(io, roomId, requestedSlot) {
  const room = rooms[roomId];
  if (!room || room.phase !== 'playing') return;

  const filled = room.drawCircleSlots
    .map((s, i) => (s !== null ? i : -1))
    .filter(i => i !== -1);

  if (filled.length === 0) { endCirclePhase(io, roomId); return; }

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

  broadcastState(io, roomId);

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
        endCirclePhase(io, roomId);
        return;
      }
      nextTurn(r);
      broadcastState(io, roomId);
    }, 1200);
  }
}

// ── Socket handlers ──────────────────────────────────────────────

function registerHandlers(io, socket) {
  let myRoomId = null;

  // Helper to assert it's the caller's turn
  function assertMyTurn(room) {
    const currentPlayer = room.players[room.currentTurnIndex];
    return currentPlayer && currentPlayer.id === socket.id;
  }

  socket.on('createRoom', ({ name }) => {
    let roomId = generateRoomId();
    while (rooms[roomId]) roomId = generateRoomId();

    rooms[roomId] = freshRoomState(socket.id, name);

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
    if (room.players.length >= MAX_PLAYERS) { socket.emit('joinError', 'Room is full (max 4)'); return; }
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

    resetForGame(room);
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

    if (!assertMyTurn(room)) {
      socket.emit('gameError', 'Not your turn'); return;
    }
    if (!room.mustPlayFromPile) {
      socket.emit('gameError', 'No forced dump available'); return;
    }
    if (!room.pileDumpTargets.some(t => t.targetId === targetId)) {
      socket.emit('gameError', 'Invalid dump target'); return;
    }
    const currentPlayer = room.players[room.currentTurnIndex];
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
    broadcastState(io, myRoomId);
  });

  // Play top pile card to a sequence pile (forced at turn start)
  socket.on('playPileToSequence', () => {
    if (!myRoomId) return;
    const room = rooms[myRoomId];
    if (!room || room.phase !== 'playing') return;

    if (!assertMyTurn(room)) {
      socket.emit('gameError', 'Not your turn'); return;
    }
    if (!room.mustPlayFromPile || room.pileSequenceIndex === -1) {
      socket.emit('gameError', 'No pile-to-sequence play available'); return;
    }
    const currentPlayer = room.players[room.currentTurnIndex];
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
    broadcastState(io, myRoomId);
  });

  socket.on('drawCard', ({ slotIndex } = {}) => {
    if (!myRoomId) return;
    const room = rooms[myRoomId];
    if (!room || room.phase !== 'playing') return;

    if (!assertMyTurn(room)) {
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
      endCirclePhase(io, myRoomId); return;
    }

    handleDraw(io, myRoomId, slotIndex);
  });

  socket.on('playSequence', ({ pileIndex }) => {
    if (!myRoomId) return;
    const room = rooms[myRoomId];
    if (!room || room.phase !== 'playing') return;

    if (!assertMyTurn(room)) {
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
      endCirclePhase(io, myRoomId);
    } else {
      broadcastState(io, myRoomId);
    }
  });

  socket.on('playCard', ({ targetId }) => {
    if (!myRoomId) return;
    const room = rooms[myRoomId];
    if (!room || room.phase !== 'playing') return;

    if (!assertMyTurn(room)) {
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
      endCirclePhase(io, myRoomId);
    } else {
      broadcastState(io, myRoomId);
    }
  });

  // Phase 2: play a card from hand to sequence pile
  socket.on('playPhase2Card', ({ cardId }) => {
    if (!myRoomId) return;
    const room = rooms[myRoomId];
    if (!room || room.phase !== 'phase2') return;

    if (!assertMyTurn(room)) {
      socket.emit('gameError', 'Not your turn'); return;
    }

    const currentPlayer = room.players[room.currentTurnIndex];
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

    if (checkPhase2End(io, myRoomId)) return;
    const allStuck = advancePhase2Turn(room);
    if (allStuck) { checkPhase2AllStuck(io, myRoomId); return; }
    broadcastState(io, myRoomId);
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
}

module.exports = { registerHandlers };
