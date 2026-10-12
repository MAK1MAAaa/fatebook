import { CARDS, EQUIPMENT } from './cards';
import type { CardDefinition, CardEffect, DamageScaling, Equipment, RpgState, RulesetVersion } from './types';

export const APP_VERSION = '2.1.0';
export const LEGACY_RULESET: RulesetVersion = '2.0.0';
export const CURRENT_RULESET: RulesetVersion = '2.1.0';

export function rulesetVersion(state?: Pick<RpgState, 'rulesetVersion'>): RulesetVersion {
  const version = state?.rulesetVersion ?? LEGACY_RULESET;
  if (version !== LEGACY_RULESET && version !== CURRENT_RULESET) throw new Error('规则版本不兼容，请刷新或更新客户端；原存档已保留。');
  return version;
}

function scalingFor(card: CardDefinition): DamageScaling {
  if (card.actor === 'custom' || card.id === 'identity-alliance') return 'hybrid';
  return card.actor === 'eris' || ['neutral', 'sword', 'waterSword', 'northSword'].includes(card.school) ? 'strength' : 'mana';
}

function upgradeFor(effect: CardEffect): CardEffect {
  const upgrade: CardEffect = {};
  if (effect.damage) upgrade.damage = 6;
  if (effect.block) upgrade.block = 6;
  if (effect.heal) upgrade.heal = 7;
  if (effect.burn) upgrade.burn = 2;
  if (effect.weak) upgrade.weak = 1;
  if (effect.vulnerable) upgrade.vulnerable = 1;
  if (!Object.keys(upgrade).length) {
    if (effect.draw) upgrade.draw = 1;
    else if (effect.energy) upgrade.energy = 1;
  }
  return upgrade;
}

// Keep original definitions untouched: in-progress legacy battles must retain
// their costs, keywords and upgrade behavior, as well as their saved RNG.
const currentCards: CardDefinition[] = CARDS.map(legacy => {
  const card = { ...legacy, effect: { ...legacy.effect }, damageScaling: scalingFor(legacy) };
  if (card.id === 'wind-4') {
    card.cost = 1;
    card.effect = { energy: 2, draw: 1 };
    card.exhaust = true;
  }
  if (card.id === 'identity-custom-2') card.exhaust = true;
  return { ...card, upgradeEffect: upgradeFor(card.effect) };
});
const legacyCardsById = Object.fromEntries(CARDS.map(card => [card.id, card]));
const currentCardsById = Object.fromEntries(currentCards.map(card => [card.id, card]));
const currentEquipment = EQUIPMENT.map(gear => gear.slot === 'charm' ? { ...gear, price: 35 } : gear);
const legacyEquipmentById = Object.fromEntries(EQUIPMENT.map(gear => [gear.id, gear]));
const currentEquipmentById = Object.fromEntries(currentEquipment.map(gear => [gear.id, gear]));

export function cardsFor(state?: Pick<RpgState, 'rulesetVersion'>): CardDefinition[] {
  return rulesetVersion(state) === CURRENT_RULESET ? currentCards : CARDS;
}
export function cardFor(state: Pick<RpgState, 'rulesetVersion'> | undefined, id: string): CardDefinition {
  return (rulesetVersion(state) === CURRENT_RULESET ? currentCardsById : legacyCardsById)[id];
}
export function equipmentListFor(state?: Pick<RpgState, 'rulesetVersion'>): Equipment[] {
  return rulesetVersion(state) === CURRENT_RULESET ? currentEquipment : EQUIPMENT;
}
export function equipmentFor(state: Pick<RpgState, 'rulesetVersion'> | undefined, id: string): Equipment {
  return (rulesetVersion(state) === CURRENT_RULESET ? currentEquipmentById : legacyEquipmentById)[id];
}
