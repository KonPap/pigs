// ES module — card constants and DOM factories

export const SUIT_SYMBOL = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
export const SUIT_COLOR  = { hearts: 'red', diamonds: 'red', clubs: 'black', spades: 'black' };
export const RANK_LABEL  = r => ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[r] || String(r));

export function makeCard(card, sizeClass = 'card-lg') {
  const el = document.createElement('div');
  el.className = `card ${SUIT_COLOR[card.suit]} ${sizeClass}`;
  el.innerHTML = `
    <div class="card-rank">${RANK_LABEL(card.rank)}</div>
    <div class="card-suit-top">${SUIT_SYMBOL[card.suit]}</div>
    <div class="card-center-suit">${SUIT_SYMBOL[card.suit]}</div>
  `;
  return el;
}

export function makeCardBack() {
  const el = document.createElement('div');
  el.className = 'pile-card-back';
  return el;
}
