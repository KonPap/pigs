const crypto = require('crypto');
const { SUITS, RANKS } = require('./config');

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

// Phase 2 helper: get cards in player's pile that can be played to sequences
function getPhase2ValidCards(player, sequences) {
  return player.pile.filter(card => canPlaySequence(card, sequences) !== -1);
}

module.exports = {
  createDeck,
  shuffle,
  canPlaySequence,
  evaluatePlays,
  checkMustPlayFromPile,
  getPhase2ValidCards
};
