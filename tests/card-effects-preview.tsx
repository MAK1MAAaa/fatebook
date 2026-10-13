// Development-only fixture: gameplay saves are untouched; audio preferences share the production controls.
import '../src/index.css';
import '../src/App.css';
import '../src/components/rpg/rpg.css';
import '../src/components/rpg/card-catalog.css';
import '../src/components/rpg/portraits.css';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, ArrowRight, ChevronDown, Flame, Heart, Layers, RotateCcw, Shield, Sparkles, Swords, Zap } from 'lucide-react';
import { createCharacter } from '../src/game/characters';
import { SKILL_KEYS } from '../src/game/engine';
import { CARDS } from '../src/rpg/cards';
import { cardSchoolLabel } from '../src/rpg/catalog';
import { cardEffect, effectText, forecastEnemyIntents } from '../src/rpg/combat';
import { ENCOUNTERS, ENCOUNTER_BY_ID } from '../src/rpg/content';
import { ENEMY_BY_ID } from '../src/rpg/enemies';
import { canLearnCard, createRpg, resolveAction, validateDeck } from '../src/rpg/engine';
import { buildCardPlayCue, MAX_CARD_PLAY_CUES, type CardPlayCue } from '../src/rpg/card-play-effects';
import { cardFor, cardsFor, CURRENT_RULESET, LEGACY_RULESET } from '../src/rpg/rulesets';
import { characterPortraitKey, enemyPortraitKey } from '../src/rpg/portraits';
import { Portrait } from '../src/components/rpg/Artwork';
import { BattleCastEffects, CardCastAnnouncements, UnitCardEffects } from '../src/components/rpg/CardPlayEffects';
import BattleAudioControls from '../src/components/rpg/BattleAudioControls';
import { useBattleAudio } from '../src/hooks/use-battle-audio';
import { buildBattleAudioPlan } from '../src/rpg/battle-audio';
import CardTile, { OwnedCardTile } from '../src/components/rpg/CardTile';
import type { GameAction, RpgState, RulesetVersion, Statuses } from '../src/rpg/types';

interface FixtureOptions {
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
  const [state, setState] = useState(() => createCardEffectsFixture(INITIAL));
  const [target, setTarget] = useState('enemy-0');
  const [cues, setCues] = useState<CardPlayCue[]>([]);
  const [receipt, setReceipt] = useState<CardPlayCue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audit, setAudit] = useState<ReturnType<typeof auditCardEffectsFixtures> | null>(null);
  const [frozen, setFrozen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const sequence = useRef(0);
  const timers = useRef(new Map<string, number>());
  useEffect(() => {
    const current = timers.current;
    return () => { for (const timer of current.values()) window.clearTimeout(timer); };
  }, []);
  const battle = state.battle!;
  const selectedCard = cardFor(state, options.cardId);
  const selectedOwned = state.collection.find(card => card.uid === SELECTED_UID)!;
  const selectedIndex = CARDS.findIndex(card => card.id === options.cardId);
  const forecasts = forecastEnemyIntents(state);
  function clearCues() {
    for (const timer of timers.current.values()) window.clearTimeout(timer);
    timers.current.clear();
    setCues([]);
  }
  function scheduleRemoval(cue: CardPlayCue, durationMs = reducedMotion ? 240 : cue.durationMs) {
    timers.current.set(cue.id, window.setTimeout(() => {
      setCues(previous => previous.filter(item => item.id !== cue.id));
      timers.current.delete(cue.id);
    }, durationMs));
  }
  function reducePreviewMotion(enabled: boolean) {
    setReducedMotion(enabled);
    if (enabled) setFrozen(false);
    for (const timer of timers.current.values()) window.clearTimeout(timer);
    timers.current.clear();
    for (const cue of cues) scheduleRemoval(cue, enabled ? 240 : cue.durationMs);
  }
  function freezePreview(enabled: boolean) {
    setFrozen(enabled);
    for (const timer of timers.current.values()) window.clearTimeout(timer);
    timers.current.clear();
    if (enabled) {
      if (!cues.length && receipt) setCues([receipt]);
    } else {
      for (const cue of cues) scheduleRemoval(cue);
    }
  }
  function configure(changes: Partial<FixtureOptions>) {
    const next = { ...options, ...changes };
    setOptions(next);
    setState(createCardEffectsFixture(next, ++sequence.current));
    setTarget('enemy-0');
    clearCues();
    setReceipt(null);
    setAudioCheck(null);
    setError(null);
  }
  function play() {
    audio.prepare();
    try {
      // Replay the same isolated setup each time so the selected card remains testable after exhaust/draw.
      const before = createCardEffectsFixture(options, ++sequence.current);
      const action: GameAction = { type: 'playCard', uid: SELECTED_UID, target };
      const after = resolveAction(before, action, before.revision);
      const result = buildCardPlayCue(before, after, action);
      if (!result) throw new Error('正式引擎没有生成可显示的出牌回执。');
      const cue = reducedMotion ? { ...result, durationMs: 240 } : result;
      setState(after);
      setReceipt(cue);
      setCues(previous => [...previous, cue].slice(-MAX_CARD_PLAY_CUES));
      audio.play(cue);
      setAudioCheck(audio.inspect());
      if (!frozen || reducedMotion) scheduleRemoval(cue);
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  return <main className="rpg-shell card-effects-preview" data-reduced-motion={reducedMotion} data-preview-frozen={frozen}>
    <div className="preview-notice"><strong>出牌特效验收沙盒 · 仅开发页面</strong>角色、技能、牌组与战场起点为显式测试配置。出牌调用正式引擎；不读取或写入玩家人生存档，不是通关见证。每次点击从相同条件复位后施放，可快速连点检查重叠特效。音效设置与正式界面共用，点击出牌试听本地合成音效。</div>
    <div className="rpg-title-row"><div><span className="eyebrow">96 张卡牌 · 正式结算、视觉与音效</span><h1>逐张检查施放、命中和音效</h1><p>当前第 {selectedIndex + 1} / {CARDS.length} 张：{selectedCard.name}{options.upgraded ? '＋' : ''} · {options.ruleset} 规则</p></div></div>
    <section className="preview-controls" aria-label="特效验收配置">
      <label>选择验收卡牌<select aria-label="选择验收卡牌" value={options.cardId} onChange={event => configure({ cardId: event.target.value })}>{SCHOOLS.map(school => <optgroup key={school} label={cardSchoolLabel(CARDS.find(card => card.school === school)!)}>{CARDS.filter(card => card.school === school).map(card => <option key={card.id} value={card.id}>{card.name} · {card.id}</option>)}</optgroup>)}</select></label>
      <label>卡牌版本<select aria-label="卡牌版本" value={options.upgraded ? 'upgraded' : 'normal'} onChange={event => configure({ upgraded: event.target.value === 'upgraded' })}><option value="normal">普通卡牌</option><option value="upgraded">强化卡牌</option></select></label>
      <label>结算规则<select aria-label="结算规则" value={options.ruleset} onChange={event => configure({ ruleset: event.target.value as RulesetVersion })}><option value={CURRENT_RULESET}>2.1 优化规则</option><option value={LEGACY_RULESET}>2.0 旧规则</option></select></label>
      <label>敌方阵容<select aria-label="敌方阵容" value={options.enemies} onChange={event => configure({ enemies: Number(event.target.value) as 2 | 3 })}><option value="2">两名敌人</option><option value="3">三名敌人</option></select></label>
    </section>
    <div className="preview-options"><label><input type="checkbox" checked={reducedMotion} onChange={event => reducePreviewMotion(event.target.checked)} />减少动画，静态反馈 240ms</label><label><input type="checkbox" checked={frozen} disabled={reducedMotion} onChange={event => freezePreview(event.target.checked)} />定格特效（开发截图，约 300ms）</label><label><input type="checkbox" checked={options.fullHealth} onChange={event => configure({ fullHealth: event.target.checked })} />满生命（验证治疗上限）</label><label><input type="checkbox" checked={options.fullBlock} onChange={event => configure({ fullBlock: event.target.checked })} />敌方完全格挡（999）</label></div>
    <div className="preview-buttons"><button className="button primary" onClick={play}><Sparkles size={18} />出牌并播放特效</button><button className="button subtle" onClick={() => configure({})}><RotateCcw size={17} />复位战场</button><button className="button subtle" onClick={() => configure({ cardId: CARDS[(selectedIndex + CARDS.length - 1) % CARDS.length].id })}><ArrowLeft size={17} />上一张</button><button className="button subtle" onClick={() => configure({ cardId: CARDS[(selectedIndex + 1) % CARDS.length].id })}>下一张<ArrowRight size={17} /></button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <section className="rpg-battlefield" aria-label="正式组件特效战场">
      <BattleCastEffects cues={cues} showAnnouncement={false} />
      <div className="battle-mission"><span><Swords size={17} />{ENCOUNTER_BY_ID[battle.encounterId].title} · {options.enemies} 名敌人</span><strong>第 {battle.turn} 回合</strong></div>
      <BattleAudioControls audio={audio} />
      <div className="enemy-line">{battle.enemies.map(enemy => {
        const definition = ENEMY_BY_ID[enemy.definitionId];
        return <button key={enemy.uid} className={`enemy-unit ${target === enemy.uid ? 'targeted' : ''} ${enemy.hp <= 0 ? 'defeated' : ''}`} aria-pressed={target === enemy.uid} aria-label={`选择目标${enemy.name}`} onClick={() => setTarget(enemy.uid)}>
          <div className="enemy-intent">{enemy.intent.label} <strong>{forecasts[enemy.uid].amount}</strong></div>
          <span className="battle-target-art"><Portrait name={enemy.name} portraitKey={enemyPortraitKey(enemy.definitionId)} color={definition.color} enemy boss={definition.boss} eager /><UnitCardEffects cues={cues} targetId={enemy.uid} /></span>
          <strong className="enemy-name">{enemy.name}</strong><Meter value={enemy.hp} max={enemy.maxHp} label={`${enemy.name}生命`} /><div className="enemy-under"><span><Shield size={14} />格挡 {enemy.block}</span></div><StatusChips statuses={enemy.statuses} />
        </button>;
      })}</div>
      <div className="card-cast-message-slot"><CardCastAnnouncements cues={cues} /></div>
      <div className="battle-center">{selectedCard.effect.all ? '全体牌：全部存活敌人均接收真实回执' : `当前目标：${battle.enemies.find(enemy => enemy.uid === target)?.name}`} · 点击敌人切换目标</div>
      <div className="hero-line"><div className="hero-portrait-wrap"><Portrait name={state.character.name} portraitKey={characterPortraitKey(state.character, state.age, state.year)} eager /><UnitCardEffects cues={cues} targetId="hero" /></div><div className="hero-vitals"><strong>{state.character.name}</strong><Meter value={battle.hp} max={battle.maxHp} label="角色生命" /><div className="hero-under"><span><Shield size={14} />格挡 {battle.block}</span><span><Layers size={14} />手牌 {battle.hand.length}</span></div><StatusChips statuses={battle.statuses} /></div><div className="energy-gauge"><span>行动力</span><strong>{battle.energy}<small>起点为 6</small></strong></div></div>
    </section>
    <section className="preview-cast-panel surface-panel"><CardTile card={selectedCard} state={state} owned={selectedOwned} selected /><div className="preview-cast-info"><h2>{selectedCard.name}{options.upgraded ? '＋' : ''}</h2><p>{effectText(cardEffect(state, selectedOwned))} · {selectedCard.cost} 行动力</p><p>普通格挡起点为 12。角色起点缺失 90 生命，带燃烧 4、虚弱 2、易伤 2；显示实际扣血、吸收、治疗及资源变化。</p>
      <div className="preview-receipt" aria-live="polite">{receipt ? <>{receipt.targets.map(item => <span key={item.uid}>{state.battle!.enemies.find(enemy => enemy.uid === item.uid)?.name}：伤害 {item.damage} / 格挡吸收 {item.absorbed}{item.burn ? ` / 燃烧 +${item.burn}` : ''}{item.weak ? ` / 虚弱 +${item.weak}` : ''}{item.vulnerable ? ` / 易伤 +${item.vulnerable}` : ''}</span>)}{receipt.hero.block > 0 && <span><Shield size={14} />格挡 +{receipt.hero.block}</span>}{receipt.effect.heal && <span><Heart size={14} />实际治疗 +{receipt.hero.heal}</span>}{receipt.effect.cleanse && <span><Flame size={14} />净化 {receipt.hero.cleanse} 层</span>}{receipt.hero.draw > 0 && <span><Layers size={14} />抽牌 +{receipt.hero.draw}</span>}{receipt.hero.energy > 0 && <span><Zap size={14} />回能 +{receipt.hero.energy}</span>}</> : <span>尚未出牌</span>}</div>
      {audioCheck && <div><p className="preview-audio-status" role="status" data-audio-state={audioCheck.state} data-audio-voices={audioCheck.activeVoices}>音频状态：{audioCheck.state} · 未结束声部 {audioCheck.activeVoices} 个。仅开发验收显示，正式界面保留开关与音量。</p><button className="button subtle" onClick={() => setAudioCheck(audio.inspect())}>检查当前音频状态</button></div>}
      <details><summary>出牌回执与战斗日志<ChevronDown size={17} /></summary><pre>{JSON.stringify({ cue: receipt, battleLog: battle.log }, null, 2)}</pre></details>
    </div></section>
    <details className="preview-hand"><summary>结算后的真实手牌 · {battle.hand.length} 张</summary><div className="rpg-hand">{battle.hand.map(uid => <OwnedCardTile key={uid} state={state} uid={uid} />)}</div></details>
    <section className="preview-audit surface-panel"><button className="button subtle" onClick={() => setAudit(auditCardEffectsFixtures())}>运行全部 {CARDS.length * 8} 个结算组合检查</button><p aria-live="polite">{audit ? `已通过 ${audit.checked} / ${audit.expected} 个组合；失败 ${audit.failures.length} 个。涵盖全部卡牌、普通/强化、旧/新规则及两敌/三敌。` : '组合检查只验证正式出牌和特效回执，不证明视觉通过或正式战局通关。'}</p>{audit?.failures.length ? <pre className="form-error">{audit.failures.join('\n')}</pre> : null}</section>
  </main>;
}

if (typeof document !== 'undefined') {
  const root = document.getElementById('root');
  if (root) {
    if (import.meta.env.DEV) createRoot(root).render(<CardEffectsPreview />);
    else root.textContent = '本页面仅供 Vite 开发环境验收。';
  }
}
