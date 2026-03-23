const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = [6, 7, 8, 9, 10, 11, 12, 13, 14]; // J=11 Q=12 K=13 A=14
const MAX_PLAYERS = 4;
const PORT = process.env.PORT || 3000;

module.exports = { SUITS, RANKS, MAX_PLAYERS, PORT };
