import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createCharacter } from '../src/game/characters';
import type { CharacterConfig, SkillId } from '../src/game/types';
import { ENDINGS } from '../src/content';
import { COMPANIONS } from '../src/rpg/cards';
import { cardEffect, forecastEnemyIntents } from '../src/rpg/combat';
import { CONTENT_VERSION, DEATH_CHAPTER, ENCOUNTERS } from '../src/rpg/content';
import { availableCompanions, canLearnCard, chapterEvents, chapterProgress, createRpg, deckPresetScore, resolveAction, safeDeckPreset, shopPrice, validateDeck } from '../src/rpg/engine';
import type { DeckPresetStyle } from '../src/rpg/engine';
import { cardFor, cardsFor, CURRENT_RULESET, equipmentListFor, LEGACY_RULESET } from '../src/rpg/rulesets';
import type { GameAction, RpgState, RulesetVersion } from '../src/rpg/types';

export const POLICY_VERSION = '2026-10-12.v1';
export const CAMPAIGN_SEEDS = ['paired-01', 'paired-02', 'paired-03', 'paired-04'];
export const EARLY_SEEDS = [...CAMPAIGN_SEEDS, 'paired-05', 'paired-06', 'paired-07', 'paired-08'];
export const STYLES: DeckPresetStyle[] = ['balanced', 'attack', 'guard', 'magic'];
export const FIXED_RANDOM_CHARACTER: CharacterConfig = { ...createCharacter('custom', { name: '莉亚', race: 'beast', origin: 'forest', budget: 0 }), randomized: true };
export const CHARACTERS: Record<string, CharacterConfig> = {
  ...Object.fromEntries(['custom', 'rudeus', 'eris', 'sylphie', 'roxy'].map(actor => [actor, createCharacter(actor as CharacterConfig['actor'], { budget: 0 })])),
  'random-fixed': FIXED_RANDOM_CHARACTER,
};
type Policy = 'entry' | 'heuristic' | 'heuristic-cycling';
type Scope = 'campaign' | 'chapter-one';
interface Specification { character: string; style: DeckPresetStyle; seed: string; policy: Policy; ruleset: RulesetVersion; scope: Scope }
interface BattleMetric { encounter: string; chapter: number; goal: string; outcome: 'won' | 'lost' | 'timeout'; turns: number; played: number; damageTaken: number; hp: number; maxHp: number; potionsUsed: number; supportUses: number; moneyBefore: number; moneyAfter: number }
interface RewardMetric { encounter: string; cardId: string | null; uid: string | null; enteredDeck: boolean; played: number }
interface RunResult extends Specification {
  policyVersion: string; gameSeed: number; outcome: 'won' | 'lost' | 'timeout' | 'error'; furthestChapter: number; failure: string | null;
  actions: number; turns: number; played: number; damageTaken: number; money: number; moneyMinimum: number; income: Record<string, number>; spending: Record<string, number>;
  battles: BattleMetric[]; rewards: RewardMetric[]; cardPlays: Record<string, number>; deckChanges: number; traceHash: string;
  failureState?: ReturnType<typeof failureSummary>;
}
interface Decision { action: GameAction; score: number }
interface TraceRow { before: ReturnType<typeof stateSummary>; considered: Decision[]; chosen: GameAction; after: ReturnType<typeof stateSummary> }
interface Options { optional?: boolean; events?: Record<string, string>; trace?: TraceRow[]; snapshots?: Map<number, RpgState> }

function stateSummary(s: RpgState) {
  const b = s.battle;
  return { revision: s.revision, chapter: s.chapter, scene: s.scene, money: s.money, rng: b?.rng ?? null, turn: b?.turn ?? null, hp: b?.hp ?? null, block: b?.block ?? null, energy: b?.energy ?? null, hand: b?.hand ?? [], enemies: b?.enemies.map(e => ({ uid: e.uid, hp: e.hp, block: e.block, intent: e.intent })) ?? [], result: b?.result ?? null };
}

function failureSummary(s: RpgState) {
  return { ...stateSummary(s), stats: s.stats, skills: s.skills, companion: s.companionId, equipment: s.equipment,
    deck: s.deck.map(uid => { const own = s.collection.find(c => c.uid === uid)!, card = cardFor(s, own.cardId); return { ...own, name: card.name, cost: card.cost, retain: !!card.retain, exhaust: !!card.exhaust, effect: cardEffect(s, own) }; }) };
}

function validCardTargets(s: RpgState, uid: string): Array<string | undefined> {
  const owned = s.collection.find(c => c.uid === uid)!;
  const e = cardEffect(s, owned);
  if (!e.damage && !e.burn && !e.weak && !e.vulnerable) return [undefined];
  const alive = s.battle!.enemies.filter(enemy => enemy.hp > 0);
  return e.all ? [alive[0]?.uid] : alive.map(enemy => enemy.uid);
}

// Policies inspect visible effects and intents. They never look ahead in RNG or
// search future draws; all effects and legal executions remain in the engine.
export function combatDecisions(s: RpgState, policy: Policy): Decision[] {
  const b = s.battle!;
  const living = b.enemies.filter(e => e.hp > 0);
  const forecast = forecastEnemyIntents(s);
  const threat = living.reduce((n, e) => n + (e.intent.kind === 'attack' && forecast[e.uid].willAct ? forecast[e.uid].amount * (e.intent.hits ?? 1) : 0), 0);
  const decisions: Decision[] = [];
  for (const [index, uid] of b.hand.entries()) {
    const own = s.collection.find(c => c.uid === uid)!;
    const card = cardFor(s, own.cardId), e = cardEffect(s, own);
    if (card.cost > b.energy) continue;
    for (const target of validCardTargets(s, uid)) {
      const enemy = living.find(candidate => candidate.uid === target);
      let score: number;
      if (policy === 'entry') {
        // Basic priorities, one visible target, no goal-specific adaptation.
        if (target && target !== living[0]?.uid) continue;
        score = e.damage ? 60 : e.heal && b.hp < b.maxHp * .65 ? 55 : e.block && threat > b.block ? 40 : e.draw || e.energy ? 30 : e.burn || e.weak || e.vulnerable ? 20 : e.cleanse && Object.values(b.statuses).some(n => n > 0) ? 15 : 0;
        score -= index * .01;
      } else {
        const targets = e.all ? living : enemy ? [enemy] : [];
        const damageValue = targets.reduce((n, candidate) => n + Math.min(candidate.hp + candidate.block, e.damage ?? 0) + ((e.damage ?? 0) >= candidate.hp + candidate.block ? 14 : 0), 0);
        const goal = ENCOUNTERS.find(encounter => encounter.id === b.encounterId)!.goal;
        const attackWeight = goal === 'rescue' || goal === 'ritual' ? 1.35 : 1;
        const missing = b.maxHp - b.hp;
        score = damageValue * attackWeight + Math.min(e.block ?? 0, Math.max(0, threat - b.block)) * 1.2 + Math.min(e.heal ?? 0, missing) * 1.1
          + Math.min(e.burn ?? 0, enemy?.hp ?? 0) * 2.5 + (e.weak ?? 0) * (enemy?.intent.kind === 'attack' ? 5 : 2)
          + (e.vulnerable ?? 0) * 3 + (e.draw ?? 0) * (b.hand.length >= 9 ? 0 : 6) + (e.energy ?? 0) * (b.energy >= 8 ? 0 : 10)
          + (e.cleanse ? b.statuses.burn * 1.3 + b.statuses.weak * 5 + b.statuses.vulnerable * 6 : 0);
        if (enemy?.intent.kind === 'ritual') score += damageValue * .25;
        // Separately named sensitivity policy: spend spare energy to clear
        // retained cards before the ten-card hand cap prevents future draws.
        if (policy === 'heuristic-cycling' && card.retain && b.hand.length >= 8) score += 6;
      }
      decisions.push({ action: { type: 'playCard', uid, ...(target ? { target } : {}) }, score });
    }
  }
  if (b.potions > 0 && b.hp < b.maxHp * (policy === 'entry' ? .35 : .6)) decisions.push({ action: { type: 'potion' }, score: 1000 });
  const companion = COMPANIONS.find(c => c.id === s.companionId);
  if (companion && b.supportCooldown === 0) {
    const e = companion.skill;
    const target = policy === 'entry' ? living[0]?.uid : [...living].sort((a, c) => a.hp - c.hp || a.uid.localeCompare(c.uid))[0]?.uid;
    if (!e.heal || b.hp < b.maxHp * .85 || e.block || e.damage) decisions.push({ action: { type: 'support', ...(target ? { target } : {}) }, score: 900 });
  }
  decisions.push({ action: { type: 'endTurn' }, score: 0 });
  return decisions.sort((a, c) => c.score - a.score || JSON.stringify(a.action).localeCompare(JSON.stringify(c.action)));
}

const FOCUS: Record<DeckPresetStyle, SkillId[]> = {
  balanced: ['waterSword', 'healing', 'sword', 'wind'],
  attack: ['sword', 'northSword', 'wind', 'healing'],
  guard: ['waterSword', 'healing', 'earth', 'sword'],
  magic: ['water', 'fire', 'wind', 'healing'],
};

export function runSimulation(spec: Specification, options: Options = {}): { result: RunResult; state: RpgState } {
  // IDs deliberately exclude ruleset, policy and scope for genuinely paired RNG.
  const id = `balance:${spec.character}:${spec.style}:${spec.seed}`;
  let s = createRpg(CHARACTERS[spec.character], id, '2026-10-12T00:00:00.000Z', spec.ruleset);
  const digest = createHash('sha256');
  const result: RunResult = { ...spec, policyVersion: POLICY_VERSION, gameSeed: s.seed, outcome: 'error', furthestChapter: 1, failure: null, actions: 0, turns: 0, played: 0, damageTaken: 0, money: s.money, moneyMinimum: s.money, income: {}, spending: {}, battles: [], rewards: [], cardPlays: {}, deckChanges: 0, traceHash: '' };
  let support = 0, potions = 0;
  const act = (action: GameAction, considered: Decision[] = [{ action, score: 0 }]) => {
    const before = options.trace ? stateSummary(s) : null;
    const money = s.money;
    s = resolveAction(s, action, s.revision);
    result.actions++;
    digest.update(JSON.stringify([action, s.battle?.rng ?? null, s.battle?.hp ?? null, s.money]));
    result.moneyMinimum = Math.min(result.moneyMinimum, s.money);
    const delta = s.money - money;
    if (delta > 0) result.income[action.type] = (result.income[action.type] ?? 0) + delta;
    if (delta < 0) result.spending[action.type] = (result.spending[action.type] ?? 0) - delta;
    if (action.type === 'support') support++;
    if (action.type === 'potion') potions++;
    if (action.type === 'setDeck') {
      result.deckChanges++;
      for (const reward of result.rewards) if (reward.uid && s.deck.includes(reward.uid)) reward.enteredDeck = true;
    }
    if (action.type === 'playCard') {
      const cardId = s.collection.find(c => c.uid === action.uid)!.cardId;
      result.cardPlays[cardId] = (result.cardPlays[cardId] ?? 0) + 1;
      for (const reward of result.rewards) if (reward.uid === action.uid) reward.played++;
    }
    if (options.trace) options.trace.push({ before: before!, considered, chosen: action, after: stateSummary(s) });
  };
  const preset = () => act({ type: 'setDeck', deck: safeDeckPreset(s, spec.style) });
  const prepare = () => {
    for (const slot of ['weapon', 'armor', 'charm'] as const) {
      if (slot === 'charm' && s.equipment.charm) continue;
      const gear = equipmentListFor(s).find(e => e.slot === slot && e.chapter === (slot === 'charm' ? 1 : s.chapter));
      if (gear && !s.ownedEquipment.includes(gear.id) && s.money >= shopPrice(s, gear.price)) act({ type: 'buyEquipment', equipmentId: gear.id });
    }
    // Entry players train two familiar schools; the full policy learns utility.
    const focus = FOCUS[spec.style].slice(0, spec.policy === 'entry' ? 2 : 4);
    for (const skill of focus) {
      while (s.skills[skill] < Math.min(4, s.chapter)) {
        const cost = s.skills[skill] === 0 ? 12 : 25 + s.skills[skill] * 12;
        if (s.money < cost) break;
        act({ type: 'train', skill });
      }
    }
    if (spec.policy !== 'entry') {
      const candidates = cardsFor(s).filter(c => canLearnCard(s, c) && (focus.includes(c.school as SkillId) || c.school === 'identity'))
        .map(c => ({ card: c, score: deckPresetScore(s, { uid: 'estimate', cardId: c.id, upgraded: false }, spec.style) }))
        .sort((a, b) => b.score - a.score || a.card.id.localeCompare(b.card.id));
      let bought = 0;
      for (const { card } of candidates) {
        while (bought < 4 && s.collection.filter(c => c.cardId === card.id).length < 2 && s.money >= shopPrice(s, 18 + card.rank * 8)) { act({ type: 'buyCard', cardId: card.id }); bought++; }
        if (bought >= 4) break;
      }
    }
    preset();
    const upgrades = s.deck.map(uid => s.collection.find(c => c.uid === uid)!).filter(c => !c.upgraded)
      .sort((a, b) => deckPresetScore(s, b, spec.style) - deckPresetScore(s, a, spec.style) || a.uid.localeCompare(b.uid));
    for (const owned of upgrades.slice(0, spec.policy === 'entry' ? 2 : 5)) {
      if (s.money < 25 + s.chapter * 5) break;
      act({ type: 'upgradeCard', uid: owned.uid });
    }
    preset();
  };
  try {
    const lastChapter = spec.scope === 'campaign' ? 7 : 1;
    for (let chapter = 1; chapter <= lastChapter; chapter++) {
      result.furthestChapter = chapter;
      for (const event of chapterEvents(s)) {
        if (s.resolvedEvents.includes(event.id)) continue;
        const lesson = spec.style === 'magic' ? 'magic' : spec.style === 'guard' ? 'support' : 'blade';
        act({ type: 'event', eventId: event.id, choiceId: options.events?.[event.id] ?? (event.id === 'rpg-learning' ? lesson : event.choices[0].id) });
      }
      const companions = availableCompanions(s);
      const selected = spec.policy === 'entry' ? companions[0] : [...companions].sort((a, b) => {
        const value = (c: typeof a) => (c.skill.damage ?? 0) * (c.skill.all ? 2 : 1) + (c.skill.block ?? 0) + (c.passive === 'draw' ? 8 : c.passive === 'damage' ? 9 : 0);
        return value(b) - value(a) || a.id.localeCompare(b.id);
      })[0];
      if (selected) act({ type: 'setCompanion', companionId: selected.id });
      prepare();
      for (const encounter of ENCOUNTERS.filter(e => e.chapter === chapter && (options.optional || !e.optional))) {
        if (!s.acceptedQuests.includes(encounter.questId)) act({ type: 'acceptQuest', questId: encounter.questId });
        const moneyBefore = s.money;
        support = 0; potions = 0;
        act({ type: 'startBattle', encounterId: encounter.id });
        let playsInTurn = 0, actionLimitReached = false;
        while (s.battle!.result === 'playing' && s.battle!.turn <= 100) {
          if (playsInTurn >= 80) { actionLimitReached = true; break; }
          const choices = combatDecisions(s, spec.policy);
          // Zero-value cards are legal trace candidates; ending wins a tie.
          const action = choices[0].score > 0 ? choices[0].action : { type: 'endTurn' as const };
          if (action.type === 'endTurn') playsInTurn = 0; else playsInTurn++;
          act(action, choices);
        }
        const battle = s.battle!;
        const outcome = battle.result === 'playing' ? 'timeout' : battle.result;
        const metric: BattleMetric = { encounter: encounter.id, chapter, goal: encounter.goal, outcome, turns: battle.turn, played: battle.played, damageTaken: battle.damageTaken, hp: battle.hp, maxHp: battle.maxHp, potionsUsed: potions, supportUses: support, moneyBefore, moneyAfter: s.money };
        result.battles.push(metric); result.turns += battle.turn; result.played += battle.played; result.damageTaken += battle.damageTaken;
        if (outcome !== 'won') {
          result.outcome = outcome; result.failure = `${encounter.id}: ${actionLimitReached ? 'action-limit' : battle.hp <= 0 ? 'hp' : encounter.goal}; turn=${battle.turn}; rng=${battle.rng}`;
          result.failureState = failureSummary(s);
          result.money = s.money; result.traceHash = digest.digest('hex');
          return { result, state: s };
        }
        const choices = s.reward!.choices;
        const cardId = spec.policy === 'entry' ? choices[0] ?? null : [...choices].sort((a, b) => deckPresetScore(s, { uid: 'reward', cardId: b, upgraded: false }, spec.style) - deckPresetScore(s, { uid: 'reward', cardId: a, upgraded: false }, spec.style) || a.localeCompare(b))[0] ?? null;
        const beforeUids = new Set(s.collection.map(c => c.uid));
        act({ type: 'claimReward', cardId }); metric.moneyAfter = s.money;
        const owned = s.collection.find(c => !beforeUids.has(c.uid));
        result.rewards.push({ encounter: encounter.id, cardId, uid: owned?.uid ?? null, enteredDeck: false, played: 0 });
        if (encounter.index % 3 === 0) prepare();
      }
      const progress = chapterProgress(s);
      if (progress.done !== progress.total || progress.events !== 0) throw new Error(`章节 ${chapter} 未完成`);
      options.snapshots?.set(chapter, structuredClone(s));
      if (chapter < lastChapter) act({ type: 'nextChapter' });
    }
    if (spec.scope === 'campaign') act({ type: 'finish', endingId: 'end-retired' });
    result.outcome = 'won';
  } catch (error) {
    result.outcome = 'error'; result.failure = error instanceof Error ? error.message : String(error);
    result.failureState = failureSummary(s);
  }
  result.money = s.money; result.traceHash = digest.digest('hex');
  return { result, state: s };
}

const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
const quantile = (values: number[], q: number) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor((sorted.length - 1) * q)] ?? 0; };
function wilson(wins: number, sample: number) {
  if (!sample) return [0, 0];
  const z = 1.96, p = wins / sample, denominator = 1 + z * z / sample;
  const center = (p + z * z / (2 * sample)) / denominator;
  const margin = z * Math.sqrt(p * (1 - p) / sample + z * z / (4 * sample * sample)) / denominator;
  return [center - margin, center + margin];
}
function aggregate(runs: RunResult[]) {
  const wins = runs.filter(r => r.outcome === 'won').length;
  const battles = runs.flatMap(r => r.battles);
  const rewards = runs.flatMap(r => r.rewards);
  return { samples: runs.length, wins, winRate: runs.length ? wins / runs.length : 0, wilson95: wilson(wins, runs.length), errors: runs.filter(r => r.outcome === 'error').length,
    battleSamples: battles.length, meanTurns: mean(battles.map(b => b.turns)), p50Turns: quantile(battles.map(b => b.turns), .5), p90Turns: quantile(battles.map(b => b.turns), .9), maxTurns: Math.max(0, ...battles.map(b => b.turns)),
    meanDamageTaken: mean(battles.map(b => b.damageTaken)), meanCardsPlayed: mean(battles.map(b => b.played)), meanMoney: mean(runs.map(r => r.money)), p10Money: quantile(runs.map(r => r.money), .1), moneyMinimum: runs.length ? Math.min(...runs.map(r => r.moneyMinimum)) : 0,
    totalSpending: Object.fromEntries(['buyEquipment', 'train', 'buyCard', 'upgradeCard', 'event'].map(action => [action, runs.reduce((n, r) => n + (r.spending[action] ?? 0), 0)])),
    rewardCards: rewards.filter(r => r.cardId).length, rewardsEnteredDeck: rewards.filter(r => r.enteredDeck).length, rewardsPlayed: rewards.filter(r => r.played > 0).length,
    chapters: Array.from({ length: 7 }, (_, index) => { const chapter = index + 1, rows = battles.filter(b => b.chapter === chapter); return { chapter, attempts: rows.length, losses: rows.filter(b => b.outcome !== 'won').length, meanTurns: mean(rows.map(b => b.turns)), p90Turns: quantile(rows.map(b => b.turns), .9), meanDamageTaken: mean(rows.map(b => b.damageTaken)), maxDamageTaken: Math.max(0, ...rows.map(b => b.damageTaken)) }; }),
    failures: runs.filter(r => r.outcome !== 'won').map(r => ({ character: r.character, style: r.style, seed: r.seed, reason: r.failure, chapter: r.furthestChapter })),
  };
}

function paired(runs: RunResult[], policy: Policy, scope: Scope) {
  const old = runs.filter(r => r.ruleset === LEGACY_RULESET && r.policy === policy && r.scope === scope);
  const rows = old.map(legacy => {
    const current = runs.find(r => r.ruleset === CURRENT_RULESET && r.policy === policy && r.scope === scope && r.character === legacy.character && r.style === legacy.style && r.seed === legacy.seed)!;
    const common = legacy.battles.filter(b => b.outcome === 'won' && current.battles.some(c => c.encounter === b.encounter && c.outcome === 'won'));
    const differences = common.map(b => { const c = current.battles.find(c => c.encounter === b.encounter)!; return { turns: c.turns - b.turns, damage: c.damageTaken - b.damageTaken, played: c.played - b.played }; });
    return { character: legacy.character, style: legacy.style, seed: legacy.seed, oldOutcome: legacy.outcome, newOutcome: current.outcome, oldFailure: legacy.failure, newFailure: current.failure,
      commonBattles: common.length, turnDifference: mean(differences.map(d => d.turns)), damageDifference: mean(differences.map(d => d.damage)), cardsDifference: mean(differences.map(d => d.played)), moneyDifference: current.money - legacy.money };
  });
  return { policy, scope, samples: rows.length, improved: rows.filter(r => r.oldOutcome !== 'won' && r.newOutcome === 'won').length, regressed: rows.filter(r => r.oldOutcome === 'won' && r.newOutcome !== 'won').length,
    commonBattles: rows.reduce((n, r) => n + r.commonBattles, 0), meanTurnDifference: mean(rows.map(r => r.turnDifference)), meanDamageDifference: mean(rows.map(r => r.damageDifference)), meanMoneyDifference: mean(rows.map(r => r.moneyDifference)), rows };
}

function replayLegacyWitnesses(root: string) {
  const path = resolve(root, 'docs/rpg-witnesses.json');
  const witness = JSON.parse(readFileSync(path, 'utf8')) as { contentVersion: string; campaigns: { id: string; character: CharacterConfig; createdAt: string; actions: GameAction[] }[]; endings: { id: string; campaignId: string; actionCount: number; action: GameAction }[] };
  const reached = new Set<string>(), endings = new Set<string>();
  for (const campaign of witness.campaigns) {
    let s = createRpg(campaign.character, campaign.id, campaign.createdAt, LEGACY_RULESET);
    for (let index = 0; index <= campaign.actions.length; index++) {
      for (const ending of witness.endings.filter(e => e.campaignId === campaign.id && e.actionCount === index)) {
        const finished = resolveAction(s, ending.action, s.revision);
        if (finished.endingId !== ending.id || finished.status !== ENDINGS.find(e => e.id === ending.id)!.kind) throw new Error(`结局见证失败 ${ending.id}`);
        endings.add(ending.id);
      }
      if (index < campaign.actions.length) s = resolveAction(s, campaign.actions[index], s.revision);
    }
    s.victories.forEach(id => reached.add(id));
  }
  if (witness.contentVersion !== CONTENT_VERSION || reached.size !== ENCOUNTERS.length || endings.size !== ENDINGS.length) throw new Error('旧规则见证覆盖不完整');
  return { ruleset: LEGACY_RULESET, source: 'docs/rpg-witnesses.json', sha256: createHash('sha256').update(readFileSync(path)).digest('hex'), campaigns: witness.campaigns.length, encounters: reached.size, optionalEncounters: [...reached].filter(id => ENCOUNTERS.find(e => e.id === id)!.optional).length, endings: [...endings].sort(), method: '逐正式动作重放；独立于两个数值政策' };
}

function currentWitnesses() {
  const reached = new Set<string>(), endings = new Set<string>(), failures: string[] = [];
  const specs: { character: string; seed: string; optional?: boolean; events: Record<string, string>; endings: string[] }[] = [
    { character: 'custom', seed: 'witness-base-2.1', optional: true, events: {}, endings: ['end-family', 'end-dragon', 'end-rebuild', 'end-retired'] },
    { character: 'custom', seed: 'witness-politics-2.1', events: { 'rpg-alliance': 'talk', 'rpg-legacy': 'future', 'rpg-outcast': 'guide' }, endings: ['end-politics', 'end-traveler', 'end-defiant', 'end-research'] },
    { character: 'custom', seed: 'witness-teaching-2.1', events: { 'rpg-legacy': 'teach' }, endings: ['end-teacher', 'end-sword'] },
    { character: 'roxy', seed: 'witness-roxy-2.1', events: {}, endings: [] },
  ];
  for (const spec of specs) {
    const snapshots = new Map<number, RpgState>();
    const run = runSimulation({ character: spec.character, seed: spec.seed, style: 'balanced', policy: 'heuristic', ruleset: CURRENT_RULESET, scope: 'campaign' }, { optional: spec.optional, events: spec.events, snapshots });
    run.state.victories.forEach(id => reached.add(id));
    if (run.result.outcome !== 'won') failures.push(`${spec.seed}: ${run.result.failure}`);
    for (const id of spec.endings) {
      const state = snapshots.get(7); if (!state) continue;
      try { const finished = resolveAction(state, { type: 'finish', endingId: id }, state.revision); if (finished.endingId === id) endings.add(id); }
      catch (error) { failures.push(`${id}: ${String(error)}`); }
    }
    if (spec.seed === 'witness-base-2.1' || spec.character === 'roxy') {
      for (const [id, chapter] of Object.entries(DEATH_CHAPTER)) {
        if ((id === 'dead-illness') !== (spec.character === 'roxy')) continue;
        const state = snapshots.get(chapter); if (!state) continue;
        try { const finished = resolveAction(state, { type: 'finish', endingId: id, confirmed: true }, state.revision); if (finished.endingId === id) endings.add(id); }
        catch (error) { failures.push(`${id}: ${String(error)}`); }
      }
    }
  }
  return { ruleset: CURRENT_RULESET, policy: `heuristic/${POLICY_VERSION}`, campaigns: specs.length, encounters: reached.size, optionalEncounters: [...reached].filter(id => ENCOUNTERS.find(e => e.id === id)!.optional).length, endings: [...endings].sort(), failures };
}

function formatReport(report: ReturnType<typeof makeReport>) {
  const groups = report.groups;
  const rows = groups.map(group => `| ${group.scope === 'campaign' ? '七章' : '第一章'} | ${group.policy === 'entry' ? '入门' : '启发式'} | ${group.ruleset} | ${group.samples} | ${group.wins} (${(group.winRate * 100).toFixed(1)}%) | ${group.meanTurns.toFixed(2)} / ${group.p90Turns} | ${group.meanDamageTaken.toFixed(1)} | ${group.meanMoney.toFixed(0)} |`);
  return `# 2.1 无界面数值模拟\n\n问题：保持敌人基础数值与遭遇目标时，2.1 卡牌、强化、预设与首胜奖励能否改善可玩性，同时控制各章回合数、损血与旅费？\n\n使用正式 \`createRpg\`、\`resolveAction\`、\`cardEffect\`、\`safeDeckPreset\`，仅替换显示和玩家输入。政策版本 **${POLICY_VERSION}**；固定创建时间；同配置的旧新人生 ID 完全相同；不重置战斗 RNG、不追加属性、不免费修改收藏。模拟失败即停止，不把确定性的免费重试计为新样本。\n\n| 范围 | 政策 | 规则 | 人生样本 | 完成率 | 战斗回合均值 / P90 | 平均损血 | 最终旅费均值 |\n|---|---|---|---:|---:|---:|---:|---:|\n${rows.join('\n')}\n\n全七章：6 人物配置 × 4 构筑 × 4 种子 × 2 政策 × 2 规则 = 384 次。第一章另做 8 个种子，共 768 次；前 4 种子与七章实验重叠，不合并当作独立样本。固定随机人物为兽族／大森林／莉亚、零追加属性，并保留 randomized 标识，避开创建器的非种子 Math.random。\n\n入门政策按可见攻击、防护、治疗优先级行动，固定前排目标，只训练两个熟悉流派；启发式政策观察实时牌效与敌方意图，考虑击杀、救援、仪式、抽牌、回能、异常与同伴，学习四个相关流派。两者均每三场／每章整理牌组、购置可负担且提升效果的装备、强化实际预设牌；启发式补充至多四张高评分副本。奖励入门取第一张、启发式取正式预设评分最高的一张。政策版本已固定，旧新比较不改变行为。\n\n${report.pairs.map(p => `- ${p.scope === 'campaign' ? '七章' : '第一章'}／${p.policy}：${p.samples} 配对；完成改善 ${p.improved}，退化 ${p.regressed}；同配对共同获胜遭遇的平均回合差 ${p.meanTurnDifference.toFixed(2)}、损血差 ${p.meanDamageDifference.toFixed(2)}（新减旧；先按每对求均值再对配对取均值）。`).join('\n')}\n\n旧规则正式见证：${report.witnesses?.legacy.encounters ?? '未运行'} / ${ENCOUNTERS.length} 遭遇、${report.witnesses?.legacy.optionalEncounters ?? '未运行'} 可选遭遇、${report.witnesses?.legacy.endings.length ?? '未运行'} / ${ENDINGS.length} 结局；逐动作重放已有文件。新规则正式见证：${report.witnesses?.current.encounters ?? '未运行'} / ${ENCOUNTERS.length} 遭遇、${report.witnesses?.current.optionalEncounters ?? '未运行'} 可选遭遇、${report.witnesses?.current.endings.length ?? '未运行'} / ${ENDINGS.length} 结局。见证政策是覆盖证明，不计入配对完成率。\n\n${report.findings.map(f => `- ${f}`).join('\n')}\n\n硬性检查：所有实战预设通过正式牌组校验；每次失败报告人物、构筑、种子、遭遇和 RNG；完整运行记录保存在 \`docs/rpg-balance-runs.jsonl\`，汇总／逐章指标／配对／失败位置在 \`docs/rpg-balance.json\`。启动器记录参与引擎与政策源码哈希，报告不使用运行耗时换算真人时长。Wilson 95% 区间仅作固定样本描述；同配置多种子的关联与自适应采购使其不能作为真人胜率或正式总体推断。\n\n命令：\n\n\`\`\`sh\nnode scripts/simulate-rpg.mjs\nnode scripts/simulate-rpg.mjs --smoke\nnode scripts/simulate-rpg.mjs --trace --character=custom --style=balanced --seed=paired-01 --policy=heuristic --ruleset=2.1.0\n\`\`\`\n\n完整模拟写报告；smoke 写独立文件并重复一个固定实例核对 action trace 哈希；trace 保存每个决策之前／之后状态、可用出牌／援助／治疗／结束回合的政策评分、所选动作及 RNG。地区采购动作也记录，候选集合为该政策当次考虑的动作。\n`;
}

function makeReport(runs: RunResult[], root: string, witnesses?: { legacy: ReturnType<typeof replayLegacyWitnesses>; current: ReturnType<typeof currentWitnesses> }, sourceHashes?: Record<string, string>, sensitivityRuns: RunResult[] = []) {
  const files = ['scripts/rpg-balance.ts', 'src/rpg/engine.ts', 'src/rpg/combat.ts', 'src/rpg/rulesets.ts', 'src/rpg/cards.ts', 'src/rpg/enemies.ts', 'src/rpg/content.ts', 'src/game/engine.ts', 'src/game/characters.ts', 'src/content/index.ts'];
  const groups = (['campaign', 'chapter-one'] as Scope[]).flatMap(scope => (['entry', 'heuristic'] as Policy[]).flatMap(policy => ([LEGACY_RULESET, CURRENT_RULESET]).map(ruleset => {
    const rows = runs.filter(r => r.scope === scope && r.policy === policy && r.ruleset === ruleset);
    return rows.length ? { scope, policy, ruleset, ...aggregate(rows), styles: STYLES.map(style => ({ style, ...aggregate(rows.filter(r => r.style === style)) })) } : null;
  }))).filter(row => row !== null);
  const pairs = (['campaign', 'chapter-one'] as Scope[]).flatMap(scope => (['entry', 'heuristic'] as Policy[]).filter(policy => runs.some(r => r.scope === scope && r.policy === policy)).map(policy => paired(runs, policy, scope)));
  const currentFull = runs.filter(r => r.ruleset === CURRENT_RULESET && r.scope === 'campaign');
  const reached = new Set(currentFull.flatMap(r => r.battles.map(b => b.chapter)));
  const findings = [
    `新版配对样本实际进入 ${reached.size} / 7 章；失败记录必须结合其遭遇目标阅读，通关样本的均值不代表所有人生完成全部内容。`,
    '构筑自由度与主线可达性由多个政策测量；自动化失败只证明该政策在该配置失败，不证明游戏不可通关。',
    '所有章节战斗重建满生命及应急包；损血是该场受到的累计伤害，可以超过最大生命。旅费收入、装备、学习、购牌与强化分别记录，不能用最后余额替代经济流。',
    '七件饰品在两套规则均无额外效果；政策避免重复购买等效饰品，因此这里主要测量首次可负担性，不能据此推断真人会否误购。',
    '每回合 80 次动作、每战 100 回合是模拟保险上限；触发会标明 timeout，不将其归为已证明的无限循环。',
    '奖励用途按领取的实体 UID 跟踪是否进入预设以及后续是否实际打出；最后一场奖励没有后续出场机会，天然压低使用率。',
  ];
  const entryOld = groups.find(g => g.scope === 'campaign' && g.policy === 'entry' && g.ruleset === LEGACY_RULESET);
  const entryNew = groups.find(g => g.scope === 'campaign' && g.policy === 'entry' && g.ruleset === CURRENT_RULESET);
  const heuristicOld = groups.find(g => g.scope === 'campaign' && g.policy === 'heuristic' && g.ruleset === LEGACY_RULESET);
  const heuristicNew = groups.find(g => g.scope === 'campaign' && g.policy === 'heuristic' && g.ruleset === CURRENT_RULESET);
  if (entryOld && entryNew && heuristicOld && heuristicNew) {
    findings.unshift(`七章入门完成 ${entryOld.wins}/${entryOld.samples} → ${entryNew.wins}/${entryNew.samples}；即时收益启发式 ${heuristicOld.wins}/${heuristicOld.samples} → ${heuristicNew.wins}/${heuristicNew.samples}。新版有明确政策退化，不能宣称全面平衡改善。`);
    const guardOld = heuristicOld.styles.find(g => g.style === 'guard')!, guardNew = heuristicNew.styles.find(g => g.style === 'guard')!;
    const failures = currentFull.filter(r => r.policy === 'heuristic' && r.style === 'guard' && r.outcome !== 'won');
    findings.push(`即时收益启发式的防守构筑完成 ${guardOld.wins}/${guardOld.samples} → ${guardNew.wins}/${guardNew.samples}；新版 ${failures.length} 次失败全部位于 ${[...new Set(failures.map(r => r.battles.at(-1)?.encounter))].join('、')}。该构筑防御强，但限时救援的输出与手牌流转存在机会成本。`);
    const example = failures.find(r => r.character === 'custom' && r.seed === 'paired-01')?.battles.at(-1);
    if (example) findings.push(`可重放实例 custom/guard/paired-01：第 ${example.turns} 回合救援超时，仍 ${example.hp}/${example.maxHp} 生命、累计损血 ${example.damageTaken}、出牌 ${example.played} 次、援助 ${example.supportUses} 次。原政策只评估即时伤害／实际缺血／预计格挡需求，健康时不会打出无即时收益的保留牌；保留牌积累达到 10 张手牌上限后阻塞抽牌。失败包含明确政策局限，不能直接证明预设或规则结算有缺陷。`);
    const firstOld = groups.find(g => g.scope === 'chapter-one' && g.policy === 'entry' && g.ruleset === LEGACY_RULESET)!;
    const firstNew = groups.find(g => g.scope === 'chapter-one' && g.policy === 'entry' && g.ruleset === CURRENT_RULESET)!;
    findings.push(`第一章入门两套规则均 ${firstNew.wins}/${firstNew.samples} 完成，新版平均回合 ${firstOld.meanTurns.toFixed(2)} → ${firstNew.meanTurns.toFixed(2)}，平均损血 ${firstOld.meanDamageTaken.toFixed(2)} → ${firstNew.meanDamageTaken.toFixed(2)}。提速伴随更高损血，需人工判断是否符合教学体验。`);
    findings.push(`新版七章入门最终旅费均值 ${entryNew.meanMoney.toFixed(0)}，启发式 ${heuristicNew.meanMoney.toFixed(0)}；其中启发式包含提前失败人生，不能直接比较经济富余。多数完整人生余额较高，后期购买压力可能偏低；详细支出和各构筑完整率在 JSON。`);
  }
  const sensitivity = sensitivityRuns.length ? {
    question: '保留牌疏通能否改变即时收益启发式防守构筑的限时失败？',
    policy: `heuristic-cycling/${POLICY_VERSION}`, change: '仅战斗评分增加：手牌至少8张时，保留牌额外6分；创建、装备、学习、购牌、强化、奖励、构筑与原启发式完全相同',
    scope: 'campaign', style: 'guard', totalRuns: sensitivityRuns.length,
    groups: [LEGACY_RULESET, CURRENT_RULESET].map(ruleset => ({ ruleset, ...aggregate(sensitivityRuns.filter(r => r.ruleset === ruleset)) })),
    pairs: paired(sensitivityRuns, 'heuristic-cycling', 'campaign'),
  } : undefined;
  if (sensitivity) findings.push(`独立疏通政策敏感性实验（6配置×4种子×旧新，仅防守全章）：旧规则 ${sensitivity.groups[0].wins}/24、新规则 ${sensitivity.groups[1].wins}/24 完成。此实验保留主政策全部原始结果；只检验策略因素，不修改正式数值。`);
  if (witnesses?.current.failures.length) findings.push(`新规则见证未完全覆盖：${witnesses.current.failures.join('；')}`);
  return { formatVersion: 1, experiment: 'fatebook-2.1-paired-v1', contentVersion: CONTENT_VERSION, policyVersion: POLICY_VERSION,
    contract: { shared: ['state creation', 'seed and draw order', 'legal actions', 'combat', 'progression', 'shops', 'rewards', 'termination'], replaced: ['rendering', 'audio', 'wall-clock waits', 'human input'], pairing: 'ID excludes policy, ruleset and scope', retry: 'Stop at first defeat; identical-deck retries are deterministic', trace: 'Optional scored candidates + state before/after + RNG' },
    sourceHashes: sourceHashes ?? Object.fromEntries(files.map(path => [path, createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex')])),
    configuration: { characters: CHARACTERS, styles: STYLES, campaignSeeds: CAMPAIGN_SEEDS, earlySeeds: EARLY_SEEDS, policies: ['entry', 'heuristic'], rulesets: [LEGACY_RULESET, CURRENT_RULESET], maximumTurn: 100, maximumActionsPerTurn: 80 },
    totalRuns: runs.length, groups, pairs, witnesses, sensitivity, findings };
}

export async function main(args: string[], sourceHashes?: Record<string, string>) {
  const root = process.cwd();
  const value = (name: string, fallback: string) => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
  mkdirSync(resolve(root, 'docs'), { recursive: true });
  if (args.includes('--trace')) {
    const spec: Specification = { character: value('character', 'custom'), style: value('style', 'balanced') as DeckPresetStyle, seed: value('seed', 'paired-01'), policy: value('policy', 'heuristic') as Policy, ruleset: value('ruleset', CURRENT_RULESET) as RulesetVersion, scope: value('scope', 'campaign') as Scope };
    if (!CHARACTERS[spec.character] || !STYLES.includes(spec.style) || !['entry', 'heuristic', 'heuristic-cycling'].includes(spec.policy) || ![LEGACY_RULESET, CURRENT_RULESET].includes(spec.ruleset) || !['campaign', 'chapter-one'].includes(spec.scope)) throw new Error('未知 trace 配置');
    const trace: TraceRow[] = [];
    const { result, state } = runSimulation(spec, { trace });
    writeFileSync(resolve(root, 'docs/rpg-balance-trace.json'), `${JSON.stringify({ result, finalState: failureSummary(state), sourceHashes, trace }, null, 2)}\n`);
    console.log(JSON.stringify({ outcome: result.outcome, failure: result.failure, actions: result.actions, traceHash: result.traceHash, trace: 'docs/rpg-balance-trace.json' }));
    return;
  }
  const smoke = args.includes('--smoke');
  const specs: Specification[] = [];
  for (const scope of smoke ? ['chapter-one'] as Scope[] : ['campaign', 'chapter-one'] as Scope[]) {
    for (const character of smoke ? ['custom'] : Object.keys(CHARACTERS)) for (const style of smoke ? ['balanced'] as DeckPresetStyle[] : STYLES) {
      for (const seed of smoke ? CAMPAIGN_SEEDS.slice(0, 2) : scope === 'campaign' ? CAMPAIGN_SEEDS : EARLY_SEEDS) {
        for (const policy of ['entry', 'heuristic'] as Policy[]) for (const ruleset of [LEGACY_RULESET, CURRENT_RULESET]) specs.push({ character, style, seed, policy, ruleset, scope });
      }
    }
  }
  const runs: RunResult[] = [];
  for (const spec of specs) {
    const { result, state } = runSimulation(spec);
    validateDeck(state, state.deck);
    if (Object.values(state.stats).some(n => !Number.isFinite(n)) || !Number.isFinite(result.money) || result.money < 0) throw new Error(`非有限或负资源 ${JSON.stringify(spec)}`);
    runs.push(result);
    if (runs.length % 32 === 0) console.log(`模拟 ${runs.length}/${specs.length}`);
  }
  const repeated = runSimulation(specs[0]).result;
  if (JSON.stringify(repeated) !== JSON.stringify(runs[0])) throw new Error('可复现性失败：相同实例的动作与最终指标不同');
  const witnesses = smoke ? undefined : { legacy: replayLegacyWitnesses(root), current: currentWitnesses() };
  const sensitivityRuns: RunResult[] = [];
  if (!smoke) for (const character of Object.keys(CHARACTERS)) for (const seed of CAMPAIGN_SEEDS) for (const ruleset of [LEGACY_RULESET, CURRENT_RULESET]) {
    const { result } = runSimulation({ character, seed, ruleset, style: 'guard', policy: 'heuristic-cycling', scope: 'campaign' });
    sensitivityRuns.push(result);
  }
  const report = makeReport(runs, root, witnesses, sourceHashes, sensitivityRuns);
  const suffix = smoke ? '-smoke' : '';
  writeFileSync(resolve(root, `docs/rpg-balance${suffix}-runs.jsonl`), `${runs.map(r => JSON.stringify(r)).join('\n')}\n`);
  writeFileSync(resolve(root, `docs/rpg-balance${suffix}.json`), `${JSON.stringify({ ...report, reproducibility: { repeatedSpecification: specs[0], traceHash: repeated.traceHash, exactResultMatch: true } }, null, 2)}\n`);
  if (!smoke) writeFileSync(resolve(root, 'docs/rpg-balance.md'), formatReport(report));
  if (!smoke) writeFileSync(resolve(root, 'docs/rpg-balance-sensitivity-runs.jsonl'), `${sensitivityRuns.map(r => JSON.stringify(r)).join('\n')}\n`);
  console.log(JSON.stringify({ runs: runs.length, groups: report.groups.map(({ scope, policy, ruleset, samples, wins, meanTurns, meanDamageTaken }) => ({ scope, policy, ruleset, samples, wins, meanTurns, meanDamageTaken })), witnesses, sensitivity: report.sensitivity?.groups.map(({ ruleset, samples, wins }) => ({ ruleset, samples, wins })), reproducible: true }, null, 2));
}
