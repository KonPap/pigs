const crypto = require('crypto');
const { getPhase2ValidCards } = require('./game');

const rooms = {};

function generateRoomId() {
  return String(crypto.randomInt(10000)).padStart(4, '0');
}

function freshRoomState(hostId, name) {
  return {
    hostId,
    players: [{ id: hostId, name, pile: [], connected: true }],
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
}

function resetForGame(room) {
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
}

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

function broadcastState(io, roomId) {
  const room = rooms[roomId];
  if (!room) return;
  for (const p of room.players) {
    const sock = io.sockets.sockets.get(p.id);
    if (sock) sock.emit('stateUpdate', buildState(room, p.id));
  }
}

module.exports = { rooms, generateRoomId, freshRoomState, resetForGame, buildState, broadcastState };
