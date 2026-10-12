import { PRESETS, SKILL_RANKS } from "../game/characters";
import { cardFor, rulesetVersion, CURRENT_RULESET } from "./rulesets";
import { cardEffect } from "./combat";
import { ENCOUNTERS, EVENTS } from "./content";
import { canLearnCard, schoolLabel } from "./engine";
import type { CardDefinition, OwnedCard, RpgState } from "./types";

export type CardMechanism = "damage" | "block" | "heal" | "draw" | "energy" | "burn" | "weak" | "vulnerable" | "cleanse" | "all" | "retain" | "exhaust";
export const MECHANISM_LABELS: Record<CardMechanism, string> = { damage: "伤害", block: "格挡", heal: "治疗", draw: "抽牌", energy: "行动力", burn: "燃烧", weak: "虚弱", vulnerable: "易伤", cleanse: "净化", all: "全体", retain: "保留", exhaust: "消耗" };
export interface CatalogFilters { query: string; school: string; cost: string; mechanism: string; ownership: "all" | "owned" | "unowned" | "learned"; }
export const EMPTY_FILTERS: CatalogFilters = { query: "", school: "all", cost: "all", mechanism: "all", ownership: "all" };
export interface CardGroup { card: CardDefinition; copies: OwnedCard[]; included: OwnedCard[]; }

export function cardSchoolLabel(card: CardDefinition): string { return card.school === "neutral" ? "通用" : card.school === "identity" ? "身份技法" : schoolLabel(card.school); }
export function cardMechanisms(card: CardDefinition): CardMechanism[] { return (Object.keys(MECHANISM_LABELS) as CardMechanism[]).filter(key => key === "retain" || key === "exhaust" ? card[key] : card.effect[key]); }
function stableUid(a: OwnedCard, b: OwnedCard): number { return a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0; }
export function sortedCopies(copies: OwnedCard[]): OwnedCard[] { return [...copies].sort((a, b) => Number(b.upgraded) - Number(a.upgraded) || stableUid(a, b)); }
export function groupCards(collection: OwnedCard[], deck: string[], state?: RpgState): CardGroup[] {
  const included = new Set(deck), grouped = new Map<string, OwnedCard[]>();
  for (const copy of collection) { const copies = grouped.get(copy.cardId) ?? []; copies.push(copy); grouped.set(copy.cardId, copies); }
  return [...grouped.entries()].map(([id, copies]) => ({ card: cardFor(state,id), copies: sortedCopies(copies), included: sortedCopies(copies.filter(copy => included.has(copy.uid))) })).sort((a, b) => a.card.cost - b.card.cost || a.card.id.localeCompare(b.card.id));
}

// Changing quantity selects real saved UIDs; it never replaces a selected copy.
export function changeCardQuantity(state: RpgState, deck: string[], cardId: string, delta: 1 | -1): string[] {
  const copies = state.collection.filter(copy => copy.cardId === cardId), selected = copies.filter(copy => deck.includes(copy.uid));
  if (delta === -1) { const remove = [...selected].sort((a, b) => Number(a.upgraded) - Number(b.upgraded) || stableUid(a, b))[0]; return remove ? deck.filter(uid => uid !== remove.uid) : deck; }
  const card = cardFor(state,cardId);
  if (!card || !canLearnCard(state, card)) throw new Error("尚未学会这张卡牌。");
  if (deck.length >= 25) throw new Error("牌组最多25张，先取下一张卡牌。");
  if (selected.length >= 3) throw new Error("普通版与强化版合计最多3张。");
  const add = sortedCopies(copies.filter(copy => !deck.includes(copy.uid)))[0];
  return add ? [...deck, add.uid] : deck;
}

export function matchesCard(state: RpgState, card: CardDefinition, filters: CatalogFilters): boolean {
  card = cardFor(state,card.id);
  const count = state.collection.filter(copy => copy.cardId === card.id).length;
  const query = filters.query.trim().toLocaleLowerCase();
  const searchable = `${card.name} ${card.text} ${cardSchoolLabel(card)} ${cardMechanisms(card).map(key => MECHANISM_LABELS[key]).join(" ")}`.toLocaleLowerCase();
  return (!query || searchable.includes(query)) && (filters.school === "all" || card.school === filters.school) && (filters.cost === "all" || card.cost === Number(filters.cost)) && (filters.mechanism === "all" || cardMechanisms(card).includes(filters.mechanism as CardMechanism)) && (filters.ownership === "all" || (filters.ownership === "owned" ? count > 0 : filters.ownership === "unowned" ? count === 0 : canLearnCard(state, card)));
}

export function cardUnlockReason(state: RpgState, card: CardDefinition): string {
  if (canLearnCard(state, card)) return "已学会";
  if (card.actor && card.actor !== state.character.actor) return `${PRESETS[card.actor].name}专属技法`;
  if (card.school === "identity") { const reasons: string[] = []; if (state.chapter < card.rank) reasons.push(`第${card.rank}章`); if (card.id === "identity-alliance" && !state.flags.includes("superdTrust") && !state.flags.includes("dragonPact")) reasons.push("为被排斥者作证，或建立龙神盟约"); return `需要${reasons.join("，并")}`; }
  return `需要${cardSchoolLabel(card)}达到${SKILL_RANKS[card.rank]}`;
}

export function cardSources(card: CardDefinition, expanded = false, state?: RpgState): string[] {
  const sources: string[] = [];
  function listSources(items: { chapter: number; title: string }[]): string {
    const shown = expanded ? items : items.slice(0, 3);
    const more = items.length - shown.length;
    return `${shown.map(item => `第${item.chapter}章「${item.title}」`).join("、")}${more > 0 ? `，另有${more}项相关来源` : ""}`;
  }
  if (["neutral-1", "neutral-2", "neutral-3", "neutral-4", "neutral-6", "neutral-10", "neutral-13"].includes(card.id)) sources.push("出生时加入初始牌组。");
  if (card.school !== "neutral" && card.school !== "identity") {
    sources.push(card.rank <= 4 ? `导师训练：课程从第${card.rank}章开放。首次学会${cardSchoolLabel(card)}${SKILL_RANKS[card.rank]}时赠送该阶位的牌；本版导师只教授至圣级（4阶）。` : "本版导师只教授至圣级（4阶），此阶位没有导师赠牌课程。");
    sources.push("第1章「第一位导师」：选择水魔术、剑神流或治疗魔术教学后，赠送当时所有已学会的非身份流派牌，并非任选一张卡牌。");
  }
  if (card.actor) { const events = EVENTS.filter(event => event.actor === card.actor && event.chapter >= card.rank); if (events.length) sources.push(`人物专属经历：${listSources(events)}。完成任一相关经历时会赠送已解锁的该人物身份牌，每种基础卡最多3张。`); }
  if (card.id === "identity-alliance") sources.push("第3章「营地里的陌生人」选择为被排斥者作证时赠送；龙神盟约也可解锁购买。");
  sources.push("地区商店：学会后可购买，每种基础卡最多收藏3张，普通与强化合计。");
  const encounters = ENCOUNTERS.filter(encounter => encounter.cardRewards.includes(card.id));
  if (encounters.length) sources.push(`首胜奖励优先候选：${listSources(encounters)}。候选须已学会且未满3张，${rulesetVersion(state)===CURRENT_RULESET?'按攻击、守护、功能分组，并优先补充收藏与构筑缺口':'最终仅提供前3个合法候选'}，并非保证获得。`);
  else if (card.school !== "neutral") sources.push("首胜奖励：学会后可补入候选池，实际提供前3个合法候选，以领奖界面为准。");
  return sources;
}

export function deckStatistics(state: RpgState, deck: string[]) {
  const copies = deck.map(uid => state.collection.find(copy => copy.uid === uid)).filter((copy): copy is OwnedCard => !!copy);
  const cards = copies.map(copy => cardFor(state,copy.cardId)), effects = copies.map(copy => cardEffect(state,copy));
  return { costs: [0, 1, 2, 3].map(cost => cards.filter(card => card.cost === cost).length), upgraded: copies.filter(copy => copy.upgraded).length, attack: effects.filter(e => !!e.damage || !!e.burn).length, defense: effects.filter(e => !!e.block || !!e.heal).length, draw: effects.filter(e => !!e.draw).length, block: effects.filter(e=>!!e.block).length, heal: effects.filter(e=>!!e.heal).length, utility: effects.filter(e=>!!(e.draw||e.energy||e.weak||e.vulnerable||e.cleanse)).length, energy: effects.filter(e=>!!e.energy).length, averageCost: cards.length?cards.reduce((sum,c)=>sum+c.cost,0)/cards.length:0 };
}
