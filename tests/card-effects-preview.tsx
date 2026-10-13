// Development-only fixture: gameplay saves are untouched; audio preferences share the production controls.
import '../src/index.css';
import '../src/App.css';
import '../src/components/rpg/rpg.css';
import '../src/components/rpg/card-catalog.css';
import '../src/components/rpg/portraits.css';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, ArrowRight, ChevronDown, Flame, Heart, Layers, RotateCcw, Shield, Sparkles, Swords, Zap } from 'lucide-react';
import { createCharacter } from '../src/game/characters';
import { SKILL_KEYS } from '../src/game/engine';
import { CARDS } from '../src/rpg/cards';
import { cardSchoolLabel } from '../src/rpg/catalog';
import { cardEffect, createBattle, effectText, escortMaxHp, forecastEnemyIntents } from '../src/rpg/combat';
import { ENCOUNTERS, ENCOUNTER_BY_ID } from '../src/rpg/content';
import { ENEMY_BY_ID } from '../src/rpg/enemies';
import { canLearnCard, createRpg, resolveAction, validateDeck } from '../src/rpg/engine';
import { buildCardPlayCue, MAX_CARD_PLAY_CUES, type CardPlayCue } from '../src/rpg/card-play-effects';
import { cardFor, cardsFor, CURRENT_RULESET, LEGACY_RULESET } from '../src/rpg/rulesets';
import { characterPortraitKey, enemyPortraitKey } from '../src/rpg/portraits';
import { Portrait } from '../src/components/rpg/Artwork';
import { BattleCastEffects, CardCastAnnouncements, UnitCardEffects } from '../src/components/rpg/CardPlayEffects';
import { BattleFeedbackStage, EnemyActionEffects, HeroDamageEffects, BattleOutcomeEffects, BattleFeedbackAnnouncements } from '../src/components/rpg/BattleFeedbackEffects';
import { buildBattleFeedbackCue, reduceBattleFeedbackCue, type BattleFeedbackCue } from '../src/rpg/battle-feedback';
import type { CombatEvent } from '../src/rpg/combat-events';
import BattleAudioControls from '../src/components/rpg/BattleAudioControls';
import { useBattleAudio } from '../src/hooks/use-battle-audio';
import { buildBattleAudioPlan, buildBattleFeedbackAudioPlan } from '../src/rpg/battle-audio';
import CardTile, { OwnedCardTile } from '../src/components/rpg/CardTile';
import type { GameAction, RpgState, RulesetVersion, Statuses } from '../src/rpg/types';

export interface FixtureOptions {
  cardId: string;
  upgraded: boolean;
  ruleset: RulesetVersion;
  enemies: 2 | 3;
  fullHealth: boolean;
  fullBlock: boolean;
}
const INITIAL: FixtureOptions = { cardId: 'fire-1', upgraded: false, ruleset: CURRENT_RULESET, enemies: 3, fullHealth: false, fullBlock: false };
const SCHOOLS = [...new Set(CARDS.map(card => card.school))];
const SELECTED_UID = 'card-effects-fixture:selected';
const CREATED_AT = '2026-10-13T00:00:00.000Z';
const FEEDBACK_SCENARIOS = [
  ['card', '卡牌施放与命中'], ['card-win', '卡牌最后一击与胜利'],
  ['enemy-attack', '三名敌人逐次攻击'], ['enemy-combo', '三名敌人连续攻击'],
  ['hero-block', '主角完全格挡'], ['hero-burn', '主角燃烧伤害'], ['hero-loss', '主角受伤败北'],
  ['enemy-burn-win', '敌人燃烧致胜'], ['survive-win', '守住撤离窗口胜利'],
  ['escort-win', '护送成功'], ['escort-loss', '护送目标倒下'], ['rescue-timeout', '救援超时'],
  ['ritual-win', '仪式压制胜利'], ['ritual-loss', '仪式失控败北'],
  ['enemy-utility', '敌方防御、恢复与异常'], ['enemy-drain', '敌方扰乱保留手牌'],
] as const;
export type FeedbackScenario = typeof FEEDBACK_SCENARIOS[number][0];

// eslint-disable-next-line react-refresh/only-export-components -- Expose this development fixture for headless QA; it is never imported by the production entry.
export function createCardEffectsFixture(options: FixtureOptions, sequence = 0): RpgState {
  const selected = cardFor({ rulesetVersion: options.ruleset }, options.cardId);
  if (!selected) throw new Error('验收卡牌不存在。');
  let state = createRpg(createCharacter(selected.actor ?? 'custom', { budget: 0 }), 'card-effects-fixture', CREATED_AT, options.ruleset);
  // Explicit fixture progression unlocks legal cards without claiming a played campaign or writing witnesses.
  state.chapter = 7;
  state.year = 441;
  state.age = state.year - state.character.birthYear;
  state.nodeId = 'rpg-hub-7';
  state.revision = sequence * 2;
  for (const skill of SKILL_KEYS) state.skills[skill] = 4;
  state.stats = { ...state.stats, vitality: 20, mana: 24, strength: 24, agility: 18, insight: 24 };
  state.flags = ['superdTrust'];
  state.resolvedEvents = ['rpg-learning'];
  state.collection = [{ uid: SELECTED_UID, cardId: selected.id, upgraded: options.upgraded }];
  const fillers = cardsFor(state).filter(card => card.school === 'neutral' && card.id !== selected.id);
  const copies = new Map([[selected.id, 1]]);
  for (let index = 0; state.collection.length < 18; index += 1) {
    const card = fillers[index % fillers.length];
    const count = copies.get(card.id) ?? 0;
    if (count >= 3) continue;
    copies.set(card.id, count + 1);
    state.collection.push({ uid: `card-effects-fixture:filler:${index}`, cardId: card.id, upgraded: false });
  }
  state.deck = state.collection.map(card => card.uid);
  if (!canLearnCard(state, selected)) throw new Error('验收身份不能学习此卡。');
  validateDeck(state, state.deck);
  const encounter = ENCOUNTERS.find(item => item.chapter === 7 && item.enemies.length === options.enemies && item.goal === 'defeat' && !item.boss);
  if (!encounter) throw new Error('未找到指定敌人数的真实遭遇。');
  state.acceptedQuests = [encounter.questId];
  state.victories = [...encounter.requires];
  state = resolveAction(state, { type: 'startBattle', encounterId: encounter.id }, state.revision);
  const battle = state.battle!;
  // Keep damage, healing, cleansing, draws and energy observable; only setup is synthetic.
  battle.hp = options.fullHealth ? battle.maxHp : battle.maxHp - 90;
  battle.block = 12;
  battle.energy = 6;
  battle.statuses = { burn: 4, weak: 2, vulnerable: 2 };
  battle.hand = state.deck.slice(0, 3);
  battle.drawPile = state.deck.slice(3);
  battle.discard = [];
  battle.exhausted = [];
  for (const enemy of battle.enemies) {
    enemy.hp = enemy.maxHp = 600;
    enemy.block = options.fullBlock ? 999 : 12;
    enemy.statuses = { burn: 0, weak: 0, vulnerable: 0 };
  }
  return state;
}

// eslint-disable-next-line react-refresh/only-export-components -- Pure fixture matrix enables CLI validation of all 96 production cards.
export function auditCardEffectsFixtures() {
  const failures: string[] = [];
  let checked = 0;
  for (const ruleset of [LEGACY_RULESET, CURRENT_RULESET]) for (const upgraded of [false, true]) for (const enemies of [2, 3] as const) for (const card of CARDS) {
    try {
      const before = createCardEffectsFixture({ ...INITIAL, cardId: card.id, ruleset, upgraded, enemies });
      const action: GameAction = { type: 'playCard', uid: SELECTED_UID, target: before.battle!.enemies[0].uid };
      const after = resolveAction(before, action, before.revision);
      const cue = buildCardPlayCue(before, after, action);
      if (!cue || cue.cardId !== card.id || cue.upgraded !== upgraded) throw new Error('没有对应的真实结算特效回执');
      if (cue.all && cue.targets.length !== enemies) throw new Error('全体目标数量不符');
      const notes = buildBattleAudioPlan(cue);
      if (!notes.some(note => note.kind === 'cast') || notes.some(note => !Number.isFinite(note.frequency) || note.frequency <= 0)) throw new Error('音效计划缺失或频率无效');
      checked += 1;
    } catch (error) {
      failures.push(`${card.id} / ${ruleset} / ${upgraded ? '强化' : '普通'} / ${enemies}敌：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { checked, expected: CARDS.length * 8, failures };
}

// eslint-disable-next-line react-refresh/only-export-components -- Synthetic starts, followed by the unchanged production action resolver.
export function createBattleFeedbackFixture(scenario: FeedbackScenario, options: FixtureOptions = INITIAL, sequence = 0): { state: RpgState; action: GameAction } {
  const attackCard = cardFor({ rulesetVersion: options.ruleset }, options.cardId).effect.damage;
  const fixtureOptions = { ...options, enemies: 3 as const, cardId: scenario === 'card-win' && !attackCard ? 'fire-1' : options.cardId };
  const state = createCardEffectsFixture(scenario === 'card' || scenario === 'card-win' ? { ...fixtureOptions, enemies: options.enemies } : fixtureOptions, sequence);
  if (scenario === 'card') return { state, action: { type: 'playCard', uid: SELECTED_UID, target: state.battle!.enemies[0].uid } };
  if (scenario === 'card-win') {
    state.battle!.statuses = { burn: 0, weak: 0, vulnerable: 0 };
    state.battle!.enemies.forEach((enemy, index) => { enemy.hp = index === 0 ? 1 : 0; enemy.block = 0; });
    return { state, action: { type: 'playCard', uid: SELECTED_UID, target: state.battle!.enemies[0].uid } };
  }
  const goal = scenario.startsWith('escort') ? 'escort' : scenario === 'survive-win' ? 'survive' : scenario === 'rescue-timeout' ? 'rescue' : scenario.startsWith('ritual') ? 'ritual' : 'defeat';
  const encounter = ENCOUNTERS.find(item => item.chapter === 7 && item.goal === goal && (goal === 'ritual' || !item.boss) && (goal !== 'defeat' || item.enemies.length === 3))!;
  state.acceptedQuests = [encounter.questId];
  state.victories = [...encounter.requires];
  state.battle = createBattle(state, encounter.id);
  const battle = state.battle;
  battle.hp = battle.maxHp - 90;
  battle.block = 12;
  battle.energy = 6;
  battle.statuses = { burn: 0, weak: 0, vulnerable: 0 };
  for (const enemy of battle.enemies) {
    enemy.hp = enemy.maxHp = 600;
    enemy.block = 0;
    enemy.statuses = { burn: 0, weak: 0, vulnerable: 0 };
    enemy.intent = { kind: 'guard', amount: 20, label: '守势' };
  }
  if (scenario === 'enemy-attack' || scenario === 'hero-block') {
    battle.enemies.forEach((enemy, index) => { enemy.intent = { kind: 'attack', amount: 22 + index * 4, label: ['踏步斩', '远射', '重击'][index] }; });
    if (scenario === 'hero-block') battle.block = 999;
  } else if (scenario === 'enemy-combo') {
    battle.enemies.forEach((enemy, index) => { enemy.intent = { kind: 'attack', amount: 8 + index * 2, hits: 2, label: ['连续斩', '连射', '追击'][index] }; });
  } else if (scenario === 'hero-burn') {
    battle.statuses.burn = 8;
  } else if (scenario === 'hero-loss') {
    battle.hp = 18;
    battle.block = 5;
    battle.enemies[0].intent = { kind: 'attack', amount: 99, hits: 2, label: '终结连击' };
  } else if (scenario === 'enemy-burn-win') {
    battle.enemies.forEach((enemy, index) => { enemy.hp = index ? 0 : 6; });
    battle.enemies[0].statuses.burn = 8;
    battle.enemies[0].block = 999;
    battle.enemies[0].intent = { kind: 'attack', amount: 99, label: '燃烧后不会行动' };
  } else if (scenario === 'survive-win' || scenario === 'escort-win' || scenario === 'rescue-timeout') {
    battle.turn = encounter.rounds;
  } else if (scenario === 'escort-loss') {
    battle.escortHp = 3;
    battle.block = 999;
    battle.enemies[0].intent = { kind: 'attack', amount: 22, label: '压制护送目标' };
  } else if (scenario === 'ritual-win') {
    battle.turn = 3;
    battle.ritual = 0;
  } else if (scenario === 'ritual-loss') {
    battle.ritual = 7;
    battle.enemies[0].intent = { kind: 'ritual', amount: 2, label: '仪式失控' };
  } else if (scenario === 'enemy-utility') {
    battle.enemies[0].intent = { kind: 'guard', amount: 24, label: '筑起屏障' };
    battle.enemies[1].hp -= 20;
    battle.enemies[1].intent = { kind: 'heal', amount: 30, label: '生命恢复' };
    battle.enemies[2].intent = { kind: 'vulnerable', amount: 2, label: '暴露破绽' };
  } else if (scenario === 'enemy-drain') {
    const retained = state.collection.filter(owned => owned.uid !== SELECTED_UID).slice(0, 2);
    retained.forEach(owned => { owned.cardId = 'neutral-8'; });
    validateDeck(state, state.deck);
    battle.hand = retained.map(owned => owned.uid);
    battle.drawPile = state.deck.filter(uid => !battle.hand.includes(uid));
    battle.discard = [];
    battle.enemies[0].intent = { kind: 'drain', amount: 3, label: '扰乱保留手牌' };
  }
  return { state, action: { type: 'endTurn' } };
}

// eslint-disable-next-line react-refresh/only-export-components -- Reusable CLI and browser audit path; no player save storage access.
export function resolveBattleFeedbackFixture(scenario: FeedbackScenario, options: FixtureOptions = INITIAL, sequence = 0) {
  const { state: before, action } = createBattleFeedbackFixture(scenario, options, sequence);
  const events: CombatEvent[] = [];
  const after = resolveAction(before, action, before.revision, event => events.push(event));
  return { before, after, action, events, cardCue: buildCardPlayCue(before, after, action), feedback: buildBattleFeedbackCue(before, after, action, events) };
}

// eslint-disable-next-line react-refresh/only-export-components -- Check actual goals and observer invariance for every selectable feedback scenario.
export function auditBattleFeedbackFixtures() {
  const failures: string[] = [];
  const expectedOutcomes: Partial<Record<FeedbackScenario, [string, string]>> = {
    'card-win': ['won', '全部敌人已击退'], 'hero-loss': ['lost', '主角失去作战能力'],
    'enemy-burn-win': ['won', '全部敌人已击退'], 'survive-win': ['won', '守住撤离窗口'],
    'escort-win': ['won', '护送目标安全抵达'], 'escort-loss': ['lost', '护送目标被击倒'],
    'rescue-timeout': ['lost', '救援时限已过'], 'ritual-win': ['won', '仪式已压制'], 'ritual-loss': ['lost', '仪式失控'],
  };
  let checked = 0;
  for (const ruleset of [LEGACY_RULESET, CURRENT_RULESET]) for (const [scenario] of FEEDBACK_SCENARIOS) {
    try {
      const { before, after, action, feedback, cardCue } = resolveBattleFeedbackFixture(scenario, { ...INITIAL, ruleset });
      if (JSON.stringify(after) !== JSON.stringify(resolveAction(before, action, before.revision))) throw new Error('观察器改变了真实战局');
      const expected = expectedOutcomes[scenario];
      if (expected && (feedback?.outcome?.result !== expected[0] || feedback.outcome.reason !== expected[1])) throw new Error('真实结果或目标原因不符');
      if (!expected && scenario !== 'card' && !feedback?.events.length) throw new Error('敌方实际事件缺失');
      if (scenario === 'card' && !cardCue) throw new Error('真实卡牌回执缺失');
      if (scenario === 'hero-block' && feedback?.events.some(event => event.kind === 'enemy-attack' && (event.damage !== 0 || event.absorbed <= 0))) throw new Error('完全格挡虚报伤害');
      if (scenario === 'enemy-burn-win' && feedback?.events.some(event => event.kind !== 'enemy-burn')) throw new Error('燃烧致死后敌人继续行动');
      if (feedback) for (const receipt of [feedback, reduceBattleFeedbackCue(feedback)]) {
        if (buildBattleFeedbackAudioPlan(receipt).some(note => note.offsetMs + note.durationMs > receipt.durationMs || note.frequency <= 0)) throw new Error('音效超过反馈生命周期');
      }
      checked++;
    } catch (cause) { failures.push(`${scenario} / ${ruleset}：${cause instanceof Error ? cause.message : String(cause)}`); }
  }
  return { checked, expected: FEEDBACK_SCENARIOS.length * 2, failures };
}

function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  return <div className="rpg-meter" role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}><i style={{ width: `${Math.max(0, Math.min(100, value / max * 100))}%` }} /><span>{value} / {max}</span></div>;
}
function StatusChips({ statuses }: { statuses: Statuses }) {
  return <div className="status-chips">{statuses.burn > 0 && <span>燃烧 {statuses.burn}</span>}{statuses.weak > 0 && <span>虚弱 {statuses.weak}</span>}{statuses.vulnerable > 0 && <span>易伤 {statuses.vulnerable}</span>}</div>;
}

export default function CardEffectsPreview() {
  const audio = useBattleAudio();
  const [audioCheck, setAudioCheck] = useState<{ state: string; activeVoices: number } | null>(null);
  const [options, setOptions] = useState(INITIAL);
  const [scenario, setScenario] = useState<FeedbackScenario>('card');
  const [state, setState] = useState(() => createCardEffectsFixture(INITIAL));
  const [target, setTarget] = useState('enemy-0');
  const [cues, setCues] = useState<CardPlayCue[]>([]);
  const [receipt, setReceipt] = useState<CardPlayCue | null>(null);
  const [feedbackCues, setFeedbackCues] = useState<BattleFeedbackCue[]>([]);
  const [feedbackReceipt, setFeedbackReceipt] = useState<BattleFeedbackCue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audit, setAudit] = useState<ReturnType<typeof auditCardEffectsFixtures> | null>(null);
  const [feedbackAudit, setFeedbackAudit] = useState<ReturnType<typeof auditBattleFeedbackFixtures> | null>(null);
  const [frozen, setFrozen] = useState(false);
  const [previewTime, setPreviewTime] = useState(300);
  const [reducedMotion, setReducedMotion] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const sequence = useRef(0);
  const timers = useRef(new Map<string, number>());
  useEffect(() => {
    const current = timers.current;
    return () => { for (const timer of current.values()) window.clearTimeout(timer); };
  }, []);
  const battle = state.battle!;
  const selectedOwned = state.collection.find(card => card.uid === SELECTED_UID)!;
  const selectedCard = cardFor(state, selectedOwned.cardId);
  const selectedIndex = CARDS.findIndex(card => card.id === selectedOwned.cardId);
  const forecasts = forecastEnemyIntents(state);
  const timeChoices = new Map<number, string>([[300, '300ms · 出牌／首段反馈']]);
  feedbackReceipt?.events.forEach((event, index) => timeChoices.set(event.offsetMs + event.impactMs + Math.min(100, Math.floor((event.durationMs - event.impactMs) / 2)), `${index + 1} · ${event.enemyName ?? '主角'} · ${event.label}`));
  if (feedbackReceipt?.outcome) timeChoices.set(feedbackReceipt.outcome.offsetMs + 200, `结果 · ${feedbackReceipt.outcome.reason}`);
  if (!timeChoices.has(previewTime)) timeChoices.set(previewTime, `${previewTime}ms`);
  function clearCues() {
    for (const timer of timers.current.values()) window.clearTimeout(timer);
    timers.current.clear();
    setCues([]);
    setFeedbackCues([]);
  }
  function scheduleRemoval(cue: CardPlayCue | BattleFeedbackCue, durationMs = reducedMotion ? 240 : cue.durationMs) {
    timers.current.set(cue.id, window.setTimeout(() => {
      if ('events' in cue) setFeedbackCues(previous => previous.filter(item => item.id !== cue.id));
      else setCues(previous => previous.filter(item => item.id !== cue.id));
      timers.current.delete(cue.id);
    }, durationMs));
  }
  function reducePreviewMotion(enabled: boolean) {
    setReducedMotion(enabled);
    if (enabled) setFrozen(false);
    clearCues();
    audio.cancel();
  }
  function freezePreview(enabled: boolean) {
    setFrozen(enabled);
    for (const timer of timers.current.values()) window.clearTimeout(timer);
    timers.current.clear();
    if (enabled) {
      if (!cues.length && receipt) setCues([receipt]);
      if (!feedbackCues.length && feedbackReceipt) setFeedbackCues([feedbackReceipt]);
    } else {
      for (const cue of cues) scheduleRemoval(cue);
      for (const cue of feedbackCues) scheduleRemoval(cue);
    }
  }
  function configure(changes: Partial<FixtureOptions>, nextScenario = scenario) {
    const next = { ...options, ...changes };
    if (nextScenario === 'card-win' && !cardFor({ rulesetVersion: next.ruleset }, next.cardId).effect.damage) next.cardId = 'fire-1';
    setOptions(next);
    setScenario(nextScenario);
    setState(createBattleFeedbackFixture(nextScenario, next, ++sequence.current).state);
    setTarget('enemy-0');
    clearCues();
    audio.cancel();
    setReceipt(null);
    setFeedbackReceipt(null);
    setPreviewTime(300);
    setAudioCheck(null);
    setError(null);
  }
  function play() {
    audio.prepare();
    try {
      // Replay the same isolated setup each time so the selected card remains testable after exhaust/draw.
      const { state: before, action: fixtureAction } = createBattleFeedbackFixture(scenario, options, ++sequence.current);
      const action: GameAction = fixtureAction.type === 'playCard' ? { ...fixtureAction, target: scenario === 'card-win' ? 'enemy-0' : target } : fixtureAction;
      const events: CombatEvent[] = [];
      const after = resolveAction(before, action, before.revision, event => events.push(event));
      const result = buildCardPlayCue(before, after, action);
      const feedback = buildBattleFeedbackCue(before, after, action, events);
      if (!result && !feedback) throw new Error('正式引擎没有生成可显示的战斗反馈回执。');
      clearCues();
      audio.cancel();
      const cue = result ? reducedMotion ? { ...result, durationMs: 240 } : result : null;
      const turnCue = feedback ? reducedMotion ? reduceBattleFeedbackCue(feedback) : feedback : null;
      setState(after);
      setReceipt(cue);
      setFeedbackReceipt(turnCue);
      if (cue) {
        setCues(previous => [...previous, cue].slice(-MAX_CARD_PLAY_CUES));
        audio.play(cue);
        if (!frozen || reducedMotion) scheduleRemoval(cue);
      }
      if (turnCue) {
        setFeedbackCues([turnCue]);
        audio.playFeedback(turnCue);
        if (!frozen || reducedMotion) scheduleRemoval(turnCue);
      }
      setAudioCheck(audio.inspect());
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  return <main className="rpg-shell card-effects-preview" data-reduced-motion={reducedMotion} data-preview-frozen={frozen} style={{ '--preview-time': `${previewTime}ms` } as CSSProperties}>
    <div className="preview-notice"><strong>战斗反馈验收沙盒 · 仅开发页面</strong>角色、技能、牌组与战场起点为显式测试配置。每次播放调用正式引擎并清理上一轮演出；不读取或写入玩家人生存档，不是通关见证。音效设置与正式界面共用；定格与切换时点只调整视觉，不重播音效。</div>
    <div className="rpg-title-row"><div><span className="eyebrow">96 张卡牌 · 正式结算、视觉与音效</span><h1>{scenario.startsWith('card') ? '逐张检查施放、命中和音效' : '检查敌方行动与胜负反馈'}</h1><p>{FEEDBACK_SCENARIOS.find(([value]) => value === scenario)?.[1]} · {options.ruleset} 规则 · 第 {selectedIndex + 1} / {CARDS.length} 张：{selectedCard.name}{options.upgraded ? '＋' : ''}</p></div></div>
    <section className="preview-controls" aria-label="特效验收配置">
      <label>反馈场景<select aria-label="反馈场景" value={scenario} onChange={event => configure({}, event.target.value as FeedbackScenario)}>{FEEDBACK_SCENARIOS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>选择验收卡牌<select aria-label="选择验收卡牌" value={options.cardId} onChange={event => configure({ cardId: event.target.value })}>{SCHOOLS.map(school => <optgroup key={school} label={cardSchoolLabel(CARDS.find(card => card.school === school)!)}>{CARDS.filter(card => card.school === school).map(card => <option key={card.id} value={card.id}>{card.name} · {card.id}</option>)}</optgroup>)}</select></label>
      <label>卡牌版本<select aria-label="卡牌版本" value={options.upgraded ? 'upgraded' : 'normal'} onChange={event => configure({ upgraded: event.target.value === 'upgraded' })}><option value="normal">普通卡牌</option><option value="upgraded">强化卡牌</option></select></label>
      <label>结算规则<select aria-label="结算规则" value={options.ruleset} onChange={event => configure({ ruleset: event.target.value as RulesetVersion })}><option value={CURRENT_RULESET}>2.1 优化规则</option><option value={LEGACY_RULESET}>2.0 旧规则</option></select></label>
      <label>敌方阵容<select aria-label="敌方阵容" value={options.enemies} onChange={event => configure({ enemies: Number(event.target.value) as 2 | 3 })}><option value="2">两名敌人</option><option value="3">三名敌人</option></select></label>
    </section>
    <div className="preview-options"><label><input type="checkbox" checked={reducedMotion} onChange={event => reducePreviewMotion(event.target.checked)} />减少动画，静态反馈 240ms</label><label><input type="checkbox" checked={frozen} disabled={reducedMotion} onChange={event => freezePreview(event.target.checked)} />定格特效（开发截图）</label><label>定格时点<select aria-label="定格时点" value={previewTime} disabled={reducedMotion} onChange={event => setPreviewTime(Number(event.target.value))}>{[...timeChoices].sort((left, right) => left[0] - right[0]).map(([time, label]) => <option key={time} value={time}>{time}ms · {label}</option>)}</select></label><label><input type="checkbox" checked={options.fullHealth} onChange={event => configure({ fullHealth: event.target.checked })} />满生命（验证治疗上限）</label><label><input type="checkbox" checked={options.fullBlock} onChange={event => configure({ fullBlock: event.target.checked })} />敌方完全格挡（999）</label></div>
    <div className="preview-buttons"><button className="button primary" onClick={play}><Sparkles size={18} />{scenario === 'card' ? '出牌并播放特效' : '播放战斗反馈'}</button><button className="button subtle" onClick={() => configure({})}><RotateCcw size={17} />复位战场</button><button className="button subtle" onClick={() => configure({ cardId: CARDS[(selectedIndex + CARDS.length - 1) % CARDS.length].id })}><ArrowLeft size={17} />上一张</button><button className="button subtle" onClick={() => configure({ cardId: CARDS[(selectedIndex + 1) % CARDS.length].id })}>下一张<ArrowRight size={17} /></button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <section className="rpg-battlefield" aria-label="正式组件特效战场">
      <BattleCastEffects cues={cues} showAnnouncement={false} />
      <BattleFeedbackStage cues={feedbackCues} />
      <div className="battle-mission"><span><Swords size={17} />{ENCOUNTER_BY_ID[battle.encounterId].title} · {battle.enemies.length} 名敌人</span><strong>{feedbackCues.some(cue=>cue.events.length>0)?'敌方行动 · ':''}第 {feedbackCues.at(-1)?.sourceTurn??battle.turn} 回合</strong></div>
      <BattleAudioControls audio={audio} />
      <div className="enemy-line">{battle.enemies.map(enemy => {
        const definition = ENEMY_BY_ID[enemy.definitionId];
        const observedAction = feedbackCues.at(-1)?.events.find(event=>event.enemyUid===enemy.uid&&event.kind!=='enemy-burn');
        return <button key={enemy.uid} className={`enemy-unit ${target === enemy.uid ? 'targeted' : ''} ${enemy.hp <= 0 ? 'defeated' : ''} ${cues.some(cue => cue.targets.some(hit => hit.uid === enemy.uid)) || feedbackCues.some(cue => cue.events.some(event => event.enemyUid === enemy.uid)) ? 'receiving-card-effect' : ''}`} aria-pressed={target === enemy.uid} aria-label={`选择目标${enemy.name}`} onClick={() => setTarget(enemy.uid)}>
          <div className="enemy-intent">{observedAction?.label??enemy.intent.label} <strong>{observedAction?.amount??forecasts[enemy.uid].amount}{(observedAction?.hitCount??1)>1?`×${observedAction?.hitCount}`:''}</strong></div>
          <span className="battle-target-art"><Portrait name={enemy.name} portraitKey={enemyPortraitKey(enemy.definitionId)} color={definition.color} enemy boss={definition.boss} eager /><UnitCardEffects cues={cues} targetId={enemy.uid} /><EnemyActionEffects cues={feedbackCues} targetId={enemy.uid} /></span>
          <strong className="enemy-name">{enemy.name}</strong><Meter value={enemy.hp} max={enemy.maxHp} label={`${enemy.name}生命`} /><div className="enemy-under"><span><Shield size={14} />格挡 {enemy.block}</span></div><StatusChips statuses={enemy.statuses} />
        </button>;
      })}</div>
      <div className="card-cast-message-slot"><CardCastAnnouncements cues={cues} /><BattleFeedbackAnnouncements cues={feedbackCues} /><BattleOutcomeEffects cues={feedbackCues} /></div>
      <div className="battle-center">{ENCOUNTER_BY_ID[battle.encounterId].goal === 'escort' ? <div className="objective-meter">护送目标<Meter value={battle.escortHp} max={escortMaxHp(state)} label="护送目标生命" /></div> : ENCOUNTER_BY_ID[battle.encounterId].goal === 'ritual' ? `仪式 ${battle.ritual} / 8` : ENCOUNTER_BY_ID[battle.encounterId].objectiveText}</div>
      <div className="hero-line"><div className="hero-portrait-wrap"><Portrait name={state.character.name} portraitKey={characterPortraitKey(state.character, state.age, state.year)} eager /><UnitCardEffects cues={cues} targetId="hero" /><HeroDamageEffects cues={feedbackCues} /></div><div className="hero-vitals"><strong>{state.character.name}</strong><Meter value={battle.hp} max={battle.maxHp} label="角色生命" /><div className="hero-under"><span><Shield size={14} />格挡 {battle.block}</span><span><Layers size={14} />手牌 {battle.hand.length}</span></div><StatusChips statuses={battle.statuses} /></div><div className="energy-gauge"><span>行动力</span><strong>{battle.energy}<small>起点为 6</small></strong></div></div>
    </section>
    <section className="preview-feedback-readout surface-panel" aria-label="真实战斗反馈回执" data-feedback-scenario={scenario}>
      <h2>真实战斗反馈回执</h2><p>{FEEDBACK_SCENARIOS.find(([value]) => value === scenario)?.[1]} · 当前状态：{battle.result === 'won' ? '胜利' : battle.result === 'lost' ? '失利' : '进行中'}</p>
      <div className="preview-receipt" aria-live="polite">{feedbackReceipt ? <>
        {feedbackReceipt.events.map((event, index) => <span key={`${feedbackReceipt.id}:${index}`}>{index + 1}. {event.enemyName ?? '主角'} · {event.label}{event.hitCount ? ` ${event.hitIndex! + 1}/${event.hitCount}` : ''}：{event.kind === 'enemy-attack' ? `实际伤害 ${event.damage} / 格挡吸收 ${event.absorbed}` : event.kind === 'hero-burn' || event.kind === 'enemy-burn' ? `燃烧伤害 ${event.damage}${event.defeated ? ' / 倒下' : ''}` : event.kind === 'enemy-guard' ? `格挡 +${event.amount}` : event.kind === 'enemy-heal' ? `实际恢复 +${event.amount}` : event.kind === 'enemy-drain' ? `实际移除手牌 ${event.amount}` : event.kind === 'enemy-ritual' ? `仪式 +${event.amount}` : `${event.status === 'burn' ? '燃烧' : event.status === 'weak' ? '虚弱' : '易伤'} +${event.amount}`}{event.escortDamage ? ` / 护送损伤 ${event.escortDamage}` : ''}</span>)}
        {feedbackReceipt.outcome && <span data-feedback-result={feedbackReceipt.outcome.result}>{feedbackReceipt.outcome.result === 'won' ? '胜利' : '失利'}：{feedbackReceipt.outcome.reason} · 时点 {feedbackReceipt.outcome.offsetMs}ms</span>}
      </> : <span>{receipt ? '本次仅出牌，未触发敌方回合或胜负结算。' : '尚未播放'}</span>}</div>
      <p>演出 {feedbackReceipt?.durationMs ?? receipt?.durationMs ?? 0}ms。时点选择在回执生成后列出每一段真实行动与胜负结算，可切换定格观察。</p>
    </section>
    <section className="preview-cast-panel surface-panel"><CardTile card={selectedCard} state={state} owned={selectedOwned} selected /><div className="preview-cast-info"><h2>{selectedCard.name}{options.upgraded ? '＋' : ''}</h2><p>{effectText(cardEffect(state, selectedOwned))} · {selectedCard.cost} 行动力</p><p>{scenario === 'card' ? '普通格挡起点为12。角色起点缺失90生命，带燃烧4、虚弱2、易伤2；显示实际扣血、吸收、治疗及资源变化。' : '此场景使用显式的测试战场起点，实际行动由正式引擎结算。卡牌终结场景会将敌人生命设为1；未选攻击牌时自动采用火弹。'}</p>
      <div className="preview-receipt" aria-live="polite">{receipt ? <>{receipt.targets.map(item => <span key={item.uid}>{state.battle!.enemies.find(enemy => enemy.uid === item.uid)?.name}：伤害 {item.damage} / 格挡吸收 {item.absorbed}{item.burn ? ` / 燃烧 +${item.burn}` : ''}{item.weak ? ` / 虚弱 +${item.weak}` : ''}{item.vulnerable ? ` / 易伤 +${item.vulnerable}` : ''}</span>)}{receipt.hero.block > 0 && <span><Shield size={14} />格挡 +{receipt.hero.block}</span>}{receipt.effect.heal && <span><Heart size={14} />实际治疗 +{receipt.hero.heal}</span>}{receipt.effect.cleanse && <span><Flame size={14} />净化 {receipt.hero.cleanse} 层</span>}{receipt.hero.draw > 0 && <span><Layers size={14} />抽牌 +{receipt.hero.draw}</span>}{receipt.hero.energy > 0 && <span><Zap size={14} />回能 +{receipt.hero.energy}</span>}</> : <span>尚未出牌</span>}</div>
      {audioCheck && <div><p className="preview-audio-status" role="status" data-audio-state={audioCheck.state} data-audio-voices={audioCheck.activeVoices}>音频状态：{audioCheck.state} · 未结束声部 {audioCheck.activeVoices} 个。仅开发验收显示，正式界面保留开关与音量。</p><button className="button subtle" onClick={() => setAudioCheck(audio.inspect())}>检查当前音频状态</button></div>}
      <details><summary>出牌／回合回执与战斗日志<ChevronDown size={17} /></summary><pre>{JSON.stringify({ cue: receipt, feedback: feedbackReceipt, battleLog: battle.log }, null, 2)}</pre></details>
    </div></section>
    <details className="preview-hand"><summary>结算后的真实手牌 · {battle.hand.length} 张</summary><div className="rpg-hand">{battle.hand.map(uid => <OwnedCardTile key={uid} state={state} uid={uid} />)}</div></details>
    <section className="preview-audit surface-panel"><button className="button subtle" onClick={() => setAudit(auditCardEffectsFixtures())}>运行全部 {CARDS.length * 8} 个结算组合检查</button><p aria-live="polite">{audit ? `已通过 ${audit.checked} / ${audit.expected} 个组合；失败 ${audit.failures.length} 个。涵盖全部卡牌、普通/强化、旧/新规则及两敌/三敌。` : '组合检查只验证正式出牌和特效回执，不证明视觉通过或正式战局通关。'}</p>{audit?.failures.length ? <pre className="form-error">{audit.failures.join('\n')}</pre> : null}</section>
    <section className="preview-audit surface-panel"><button className="button subtle" onClick={() => setFeedbackAudit(auditBattleFeedbackFixtures())}>运行全部 {FEEDBACK_SCENARIOS.length * 2} 个反馈场景检查</button><p aria-live="polite">{feedbackAudit ? `已通过 ${feedbackAudit.checked} / ${feedbackAudit.expected} 个场景；失败 ${feedbackAudit.failures.length} 个。核验真实事件、目标胜负原因、旧新规则及正常／减少动画音效计划。` : '场景检查验证真实引擎回执，不替代像素和听感验收。'}</p>{feedbackAudit?.failures.length ? <pre className="form-error">{feedbackAudit.failures.join('\n')}</pre> : null}</section>
  </main>;
}

if (typeof document !== 'undefined') {
  const root = document.getElementById('root');
  if (root) {
    if (import.meta.env.DEV) {
      const previewRoot = createRoot(root);
      previewRoot.render(<CardEffectsPreview />);
      import.meta.hot?.dispose(() => previewRoot.unmount());
    } else root.textContent = '本页面仅供 Vite 开发环境验收。';
  }
}
