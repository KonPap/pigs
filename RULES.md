# Pig — Card Game Rules

## Overview
Multiplayer turn-based card game for 2–4 players. The game has two phases. Players try to avoid being the last one holding cards at the end.

## Deck
- 36 cards: ranks 6, 7, 8, 9, 10, J, Q, K, A — all four suits (♥ ♦ ♣ ♠)
- All cards start in the **draw circle** (face-down ring in the center of the table)
- No starting hand — players accumulate a **pile** during Phase 1

## Table Layout
- Up to 4 players seated at fixed positions: South (you), East, North, West
- Center of table: 4 **sequence piles** (value-only, not suit-specific), running 6→7→8→…→K
- Phase 1: cards arranged in a face-down ring around the sequences
- Each player's pile is visible on the table; only the **top card** is shown face-up

---

## Phase 1 — The Circle

### Turn Order

**Step 1 — Forced pile play (before drawing)**

At the start of your turn, check your **top pile card**:
- If it fits a sequence pile (see below) → you **must** play it there. Click the glowing pile.
- If it is **exactly one less** than a **neighbor's** top pile card (left or right only) → you **must** dump it on them. Click the glowing player zone.
- Repeat after each forced play until your top card can't go anywhere.
- Sequence takes priority over neighbor dump.

**Step 2 — Draw from circle**

Click any face-down card in the draw circle to draw it. The slot you click becomes an empty gap.

**Step 3 — Play the drawn card (priority order)**
1. **Sequence (mandatory):** If the card fits a sequence pile, it **must** go there. Click the glowing pile.
2. **Dump on neighbor (optional):** If the card is **exactly one less** than a neighbor's top card, you **may** dump it on them. Click the glowing player zone.
3. **No valid play:** Card automatically goes to **your own pile** after a short delay.

After the drawn card is resolved, your turn continues — draw again until you get a card with no valid plays (it goes to your pile, ending your turn).

### Sequence Piles
- 4 shared piles in the center (value-only, any suit)
- Must start with a **6** (any suit)
- Cards placed in ascending order: 6 → 7 → 8 → 9 → 10 → J → Q → K
- **Aces are never placed on sequences**
- Sequence always has priority over dumping on a player

### Dump Rules
- Only dump on **immediate neighbors** (left or right — not the player across the table)
- Card must be **exactly one less** than the neighbor's top pile card (e.g., give them an 8 if they have a 9 on top)
- Cannot dump on a player with an empty pile

### Phase 1 Ends
When the draw circle is empty, Phase 1 ends and Phase 2 begins automatically.

---

## Phase 2 — The Hand

**Setup:**
- All **Aces** are removed from every player's pile
- Each player can now see **all their own cards** (face-up in the status bar)
- The 4 sequence piles from Phase 1 remain and continue

**Turn:**
- On your turn, play **one card** from your hand onto any sequence pile it fits
- Cards that fit a sequence are **highlighted** (full opacity); unplayable cards are dimmed
- If you have **no valid card** to play, your turn is automatically skipped
- If **all remaining players** are stuck (no one can play), the player with the most cards loses

**Winning:**
- Players who empty their hand are safe
- The **last player holding cards** loses

---

## Lobby
- Host creates a room and shares the 4-character room code
- Up to 4 players can join before the host starts the game
- After the game ends, only the host can start a new game (Play Again)
