import { cardEffect } from './combat';
import { cardFor, rulesetVersion } from './rulesets';
import type { CardDefinition, CardEffect, GameAction, RpgState } from './types';

export const CARD_PLAY_DURATION_MS = 1100;
// Audio and visual impact share the same short cast lead-in.
export const CARD_PLAY_IMPACT_MS = 150;
export const MAX_CARD_PLAY_CUES = 4;

export interface CardPlayTarget {
  uid: string;
  index: number;
  damage: number;
  absorbed: number;
  burn: number;
  weak: number;
  vulnerable: number;
  defeated: boolean;
}

// Presentation receipts are transient: never serialize them into player saves.
export interface CardPlayCue {
  id: string;
  lifeId: string;
  encounterId: string;
  battleSeed: number;
  turn: number;
  cardId: string;
  cardName: string;
  school: CardDefinition['school'];
  actor?: CardDefinition['actor'];
  color: string;
  upgraded: boolean;
  all: boolean;
  durationMs: number;
  effect: CardEffect;
  targets: CardPlayTarget[];
  hero: { block: number; heal: number; cleanse: number; draw: number; energy: number };
}

/** Read actual committed deltas without simulating combat or consuming RNG. */
export function buildCardPlayCue(before: RpgState, after: RpgState, action: GameAction): CardPlayCue | null {
  const previous = before.battle, next = after.battle;
  if (action.type !== 'playCard' || before.scene !== 'battle' || previous?.result !== 'playing' || !next
    || before.id !== after.id || before.seed !== after.seed || after.revision !== before.revision + 1
    || previous.encounterId !== next.encounterId || previous.seed !== next.seed || previous.turn !== next.turn
    || next.played !== previous.played + 1 || !previous.hand.includes(action.uid)
    || !['battle', 'reward'].includes(after.scene) || rulesetVersion(before) !== rulesetVersion(after)) return null;

  const owned = before.collection.find(card => card.uid === action.uid);
  if (!owned) return null;
  const card = cardFor(before, owned.cardId), effect = cardEffect(before, owned);
  const hostile = !!(effect.damage || effect.burn || effect.weak || effect.vulnerable);
  const targets: CardPlayTarget[] = [];
  for (const [index, enemy] of previous.enemies.entries()) {
    if (!hostile || enemy.hp <= 0 || (!effect.all && enemy.uid !== action.target)) continue;
    const result = next.enemies.find(target => target.uid === enemy.uid);
    if (!result) return null;
    targets.push({
      uid: enemy.uid, index,
      damage: Math.max(0, enemy.hp - result.hp),
      absorbed: Math.max(0, enemy.block - result.block),
      burn: Math.max(0, result.statuses.burn - enemy.statuses.burn),
      weak: Math.max(0, result.statuses.weak - enemy.statuses.weak),
      vulnerable: Math.max(0, result.statuses.vulnerable - enemy.statuses.vulnerable),
      defeated: result.hp <= 0,
    });
  }
  if (hostile && !targets.length) return null;
  const cleansed = (['burn', 'weak', 'vulnerable'] as const).reduce((sum, key) => sum + Math.max(0, previous.statuses[key] - next.statuses[key]), 0);
  return {
    id: `${after.id}:${next.seed}:${after.revision}`,
    lifeId: after.id, encounterId: next.encounterId, battleSeed: next.seed, turn: next.turn,
    cardId: card.id, cardName: card.name, school: card.school, actor: card.actor, color: card.color,
    upgraded: owned.upgraded, all: !!effect.all, durationMs: CARD_PLAY_DURATION_MS, effect,
    targets,
    hero: {
      block: Math.max(0, next.block - previous.block),
      heal: Math.max(0, next.hp - previous.hp),
      cleanse: effect.cleanse ? cleansed : 0,
      draw: effect.draw ? Math.max(0, next.hand.length - previous.hand.length + 1) : 0,
      energy: effect.energy ? Math.max(0, next.energy - previous.energy + card.cost) : 0,
    },
  };
}
