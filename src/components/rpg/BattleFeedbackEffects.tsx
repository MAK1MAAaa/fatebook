import type { CSSProperties } from 'react';
import type { BattleFeedbackCue, BattleFeedbackEvent } from '../../rpg/battle-feedback';
import './battle-feedback-effects.css';

interface FeedbackProps { cues: readonly BattleFeedbackCue[]; }
interface FeedbackValue { kind: 'damage' | 'shield' | 'burn' | 'status' | 'drain' | 'escort'; text: string; }

function eventStyle(event: BattleFeedbackEvent, impact = false): CSSProperties {
  const leadIn = impact ? event.impactMs : 0;
  return {
    '--battle-feedback-color': event.color,
    '--battle-feedback-delay': `${event.offsetMs + leadIn}ms`,
    '--battle-feedback-duration': `${Math.max(1, event.durationMs - leadIn)}ms`,
  } as CSSProperties;
}

function cueClass(cue: BattleFeedbackCue): string {
  return cue.durationMs <= 240 ? ' battle-feedback-is-reduced' : '';
}

function ActionSigil({ event }: { event: BattleFeedbackEvent }) {
  const kind = event.kind;
  return <svg className="battle-action-sigil" viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'enemy-attack' && <><path className="battle-enemy-blade" d="m21 23 12 2 55 55-6 9L27 34Zm61 48 17 17m-20 6 15-15M81 21l-3 14-40 46-9-6 39-46Z" /><path className="battle-enemy-strike" d="M11 53c17 23 29 40 56 50m42-57c-11 33-38 54-68 62" /><path d="m52 99 8 13 10-11" /></>}
    {kind === 'enemy-guard' && <><path className="battle-feedback-fill" d="M60 17 96 33v31c-3 23-20 33-36 43-16-10-33-20-36-43V33Z" /><path d="m43 60 12 13 25-27M11 43l13 5m72 0 13-5" /></>}
    {kind === 'enemy-heal' && <><circle cx="60" cy="60" r="44" strokeDasharray="7 5" /><path className="battle-feedback-fill" d="M51 30h18v21h21v18H69v21H51V69H30V51h21Z" /><path d="M16 16v12m-6-6h12m76 74v12m-6-6h12" /></>}
    {(kind === 'hero-burn' || kind === 'enemy-burn' || (kind === 'enemy-status' && event.status === 'burn')) && <><path className="battle-feedback-fill battle-burn-flame" d="M60 108C28 104 15 83 32 54c1 19 16 17 15 3-3-12 0-25 18-42-2 25 24 31 24 53 3-3 5-9 6-14 17 30 4 50-35 54Z" /><path d="M60 92c-19-4-22-20-10-32 1 11 8 9 10 3 3-8 2-16 9-23 1 15 17 27 10 40-4 7-11 12-19 12Z" /></>}
    {kind === 'enemy-status' && event.status === 'weak' && <><path d="M20 25c59-36 100 23 67 67-23 28-63 17-61-16 1-26 41-36 47-10 4 17-18 27-27 15" /><path className="battle-feedback-fill" d="m59 28-8 20 16 10-14 18 15 9-8 20" /><path d="M16 45h11m69 29h11" /></>}
    {kind === 'enemy-status' && event.status === 'vulnerable' && <><path className="battle-feedback-fill" d="M60 17 96 33v31c-3 23-20 33-36 43-16-10-33-20-36-43V33Z" /><path d="m67 20-19 27 21 17-24 29m-31-59 11 5m72 48 10 6" strokeWidth="4" /></>}
    {kind === 'enemy-drain' && <><path className="battle-feedback-fill" d="M31 34h48v65H31ZM44 20h48v65" /><path d="m36 76 18-22 15 10 24-37m-18 3 18-3-2 16M17 50h12m-18 18h18" /><path d="m42 87 22-28" strokeDasharray="5 5" /></>}
    {kind === 'enemy-ritual' && <><circle cx="60" cy="60" r="43" /><path className="battle-ritual-rune" d="m60 15 32 77H28Zm0 90L28 28h64Zm-45-45h90M60 15v90" /><circle className="battle-feedback-fill" cx="60" cy="60" r="17" /></>}
  </svg>;
}

function ShieldImpact({ partial = false }: { partial?: boolean }) {
  return <svg className={`battle-hero-shield${partial ? ' battle-shield-partial' : ''}`} viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M60 12 98 32v34c-4 23-24 37-38 43-14-6-34-20-38-43V32Z" /><path d="m42 60 13 13 25-29M10 36l12 7m76 0 12-7M10 88l16-8m68 0 16 8" /></svg>;
}

function HeroImpact({ burning }: { burning: boolean }) {
  return <svg className={`battle-hero-impact${burning ? ' battle-hero-burn-impact' : ''}`} viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {burning ? <><path className="battle-feedback-fill" d="M60 108C28 104 15 83 32 54c1 19 16 17 15 3-3-12 0-25 18-42-2 25 24 31 24 53 3-3 5-9 6-14 17 30 4 50-35 54Z" /><path d="M60 92c-19-4-22-20-10-32 1 11 8 9 10 3 3-8 2-16 9-23 1 15 17 27 10 40" /></> : <><path d="m60 8 6 36 24-22-19 31 40 7-40 9 17 30-24-23-4 36-7-36-25 21 20-30L8 60l40-7-21-31 26 22Z" /><path d="m30 31 17 22-7 14 18 15M92 26 73 51l8 17-18 20" /></>}
  </svg>;
}

function heroValues(event: BattleFeedbackEvent): FeedbackValue[] {
  const values: FeedbackValue[] = [];
  if (event.damage > 0 && (event.kind === 'enemy-attack' || event.kind === 'hero-burn')) values.push({ kind: event.kind === 'hero-burn' ? 'burn' : 'damage', text: `${event.kind === 'hero-burn' ? '燃烧' : '受伤'} −${event.damage}` });
  if (event.absorbed > 0) values.push({ kind: 'shield', text: `格挡 ${event.absorbed}` });
  if (event.escortDamage > 0) values.push({ kind: 'escort', text: `护送 −${event.escortDamage}` });
  if (event.kind === 'enemy-status') values.push({ kind: event.status === 'burn' ? 'burn' : 'status', text: `${event.status === 'burn' ? '燃烧' : event.status === 'weak' ? '虚弱' : '易伤'} +${event.amount}` });
  if (event.kind === 'enemy-drain') values.push({ kind: 'drain', text: event.amount ? `手牌 −${event.amount}` : '未失牌' });
  return values;
}

function summaryValues(events: readonly BattleFeedbackEvent[]): FeedbackValue[] {
  const values: FeedbackValue[] = [];
  const damage = events.reduce((total, event) => total + (event.kind === 'enemy-attack' ? event.damage : 0), 0);
  const burn = events.reduce((total, event) => total + (event.kind === 'hero-burn' ? event.damage : 0), 0);
  const absorbed = events.reduce((total, event) => total + event.absorbed, 0);
  const escort = events.reduce((total, event) => total + event.escortDamage, 0);
  if (damage + burn) values.push({ kind: 'damage', text: `受伤 −${damage + burn}` });
  if (absorbed) values.push({ kind: 'shield', text: `格挡 ${absorbed}` });
  if (escort) values.push({ kind: 'escort', text: `护送 −${escort}` });
  // The status text remains in the action announcement; compact portrait receipts
  // retain every actual damage and block amount without stacking several hits.
  if (!values.length) {
    const last = events.filter(event => heroValues(event).length).at(-1);
    if (last) values.push(...heroValues(last));
  }
  return values;
}

function ValueList({ values }: { values: readonly FeedbackValue[] }) {
  return <div className="battle-hero-values">{values.map((value, index) => <strong key={`${value.kind}:${index}`} className={`battle-feedback-value feedback-value-${value.kind}`}>{value.text}</strong>)}</div>;
}

function actionReceipt(event: BattleFeedbackEvent): string {
  if (event.kind === 'enemy-burn') return `燃烧 −${event.damage}${event.defeated ? ' · 退场' : ''}`;
  if (event.kind === 'enemy-guard') return `格挡 +${event.amount}`;
  if (event.kind === 'enemy-heal') return `生命 +${event.amount}`;
  if (event.kind === 'enemy-attack' && (event.hitCount ?? 1) > 1) return `连击 ${(event.hitIndex ?? 0) + 1}/${event.hitCount}`;
  return event.label;
}

export function EnemyActionEffects({ cues, targetId }: FeedbackProps & { targetId: string }) {
  const cue = cues.at(-1);
  const events = cue?.events.filter(event => event.enemyUid === targetId) ?? [];
  if (!cue || !events.length) return null;
  return <div className={`enemy-action-effects${cueClass(cue)}`} aria-hidden="true">{events.map((event, index) => <div key={`${cue.id}:${index}`} className={`battle-feedback-event feedback-sequential feedback-${event.kind}`} style={eventStyle(event)}>
    <span className="battle-action-ring" /><ActionSigil event={event} /><span className="battle-enemy-receipt">{actionReceipt(event)}</span>
  </div>)}<div className="battle-feedback-summary"><ActionSigil event={events.at(-1)!} /><span className="battle-enemy-receipt">{actionReceipt(events.at(-1)!)}</span></div></div>;
}

export function HeroDamageEffects({ cues }: FeedbackProps) {
  const cue = cues.at(-1);
  if (!cue) return null;
  const events = cue.events.filter(event => heroValues(event).length > 0);
  if (!events.length) return null;
  const values = summaryValues(events);
  const tookDamage = values.some(value => value.kind === 'damage' || value.kind === 'burn');
  const blocked = values.some(value => value.kind === 'shield');
  return <div className={`hero-damage-effects${cueClass(cue)}`} aria-hidden="true">{events.map((event, index) => <div key={`${cue.id}:${index}`} className={`battle-feedback-event feedback-sequential feedback-${event.kind}${event.damage > 0 ? ' hero-feedback-damaged' : ' hero-feedback-protected'}`} style={eventStyle(event, true)}>
    {event.damage > 0 && <><span className="battle-hero-damage-ring" /><HeroImpact burning={event.kind === 'hero-burn'} /></>}
    {event.absorbed > 0 && <ShieldImpact partial={event.damage > 0} />}
    {event.kind === 'enemy-status' && <ActionSigil event={event} />}
    {event.kind === 'enemy-drain' && <ActionSigil event={event} />}
    <ValueList values={heroValues(event)} />
  </div>)}<div className={`battle-feedback-summary${tookDamage ? ' hero-feedback-damaged' : ' hero-feedback-protected'}`}>{tookDamage && <span className="battle-hero-damage-ring" />}{blocked && <ShieldImpact partial={tookDamage} />}<ValueList values={values} /></div></div>;
}

export function BattleFeedbackAnnouncements({ cues }: FeedbackProps) {
  const cue = cues.at(-1);
  if (!cue || !cue.events.length) return null;
  const reducedEvents = cue.events.filter(event => event.kind !== 'enemy-burn');
  const damage = cue.events.reduce((total, event) => total + (event.kind === 'enemy-attack' || event.kind === 'hero-burn' ? event.damage : 0), 0);
  const absorbed = cue.events.reduce((total, event) => total + event.absorbed, 0);
  const escort = cue.events.reduce((total, event) => total + event.escortDamage, 0);
  const summary = [damage ? `受伤 ${damage}` : '', absorbed ? `格挡 ${absorbed}` : '', escort ? `护送损伤 ${escort}` : ''].filter(Boolean).join(' · ');
  return <div className={`battle-feedback-announcements${cueClass(cue)}${cue.outcome ? ' battle-feedback-has-outcome' : ''}`} aria-hidden="true">{cue.events.map((event, index) => <div key={`${cue.id}:${index}`} className={`battle-feedback-event battle-action-announcement feedback-sequential feedback-${event.kind}`} style={eventStyle(event)}>
    <ActionSigil event={event} /><span>{event.enemyName ?? '主角'}{event.kind === 'enemy-burn' || event.kind === 'hero-burn' ? ' · 燃烧结算' : ' · 敌方行动'}</span><strong>{event.label}{event.kind === 'enemy-attack' && (event.hitCount ?? 1) > 1 ? ` ${(event.hitIndex ?? 0) + 1}/${event.hitCount}` : ''}</strong>
    {event.escortDamage > 0 && <small>护送目标 −{event.escortDamage}</small>}
  </div>)}<div className="battle-feedback-summary battle-action-announcement"><span>敌方行动结算 · {reducedEvents.length} 段反馈</span><strong>{summary || reducedEvents.at(-1)?.label || '燃烧结算完成'}</strong></div></div>;
}

function OutcomeSeal({ won }: { won: boolean }) {
  return <svg className="battle-outcome-seal" viewBox="0 0 80 80" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="40" cy="40" r="33" /><circle cx="40" cy="40" r="27" strokeDasharray="5 4" />{won ? <><path className="battle-feedback-fill" d="m23 27 8 7 9-15 9 15 8-7-5 24H28Z" /><path d="m28 59 12 5 12-5M30 42h20m-16-4v8m12-8v8" /></> : <><path d="m28 25 12 7 12-7v22c-1 7-7 11-12 14-5-3-11-7-12-14Z" /><path d="m43 26-9 13 10 8-9 13m-17-26 8 4m30 8 8 4" /></>}</svg>;
}

export function BattleOutcomeEffects({ cues }: FeedbackProps) {
  const cue = cues.at(-1), outcome = cue?.outcome;
  if (!cue || !outcome) return null;
  const won = outcome.result === 'won';
  const style = { '--battle-feedback-delay': `${outcome.offsetMs}ms`, '--battle-feedback-duration': `${outcome.durationMs}ms` } as CSSProperties;
  return <div className={`battle-outcome-effects${cueClass(cue)}`} aria-hidden="true"><div className={`battle-feedback-event battle-outcome-banner battle-outcome-${outcome.result}`} style={style}>
    <OutcomeSeal won={won} /><div><strong>{won ? '战斗胜利' : '战斗失利'}</strong><span>{outcome.reason}</span><small>{won ? '战斗目标已完成' : '可重新挑战 · 不计入剧情死亡'}</small></div>
  </div></div>;
}

export function BattleFeedbackStage({ cues }: FeedbackProps) {
  const cue = cues.at(-1);
  if (!cue) return null;
  return <div className={`battle-feedback-stage${cueClass(cue)}`} aria-hidden="true">{cue.events.filter(event => event.kind === 'enemy-attack' || event.kind === 'enemy-ritual').map((event, index) => <div key={`${cue.id}:${index}`} className={`battle-feedback-event feedback-sequential feedback-${event.kind}`} style={eventStyle(event)}>
    {event.kind === 'enemy-attack' ? <span className="battle-enemy-pressure" /> : <span className="battle-ritual-pressure" />}
  </div>)}{cue.outcome && <div className={`battle-feedback-event battle-outcome-frame battle-outcome-${cue.outcome.result}`} style={{ '--battle-feedback-delay': `${cue.outcome.offsetMs}ms`, '--battle-feedback-duration': `${cue.outcome.durationMs}ms` } as CSSProperties}>
    {cue.outcome.result === 'won' ? <div className="battle-victory-motes">{Array.from({ length: 8 }, (_, index) => <i key={index} style={{ '--mote-index': index } as CSSProperties} />)}</div> : <svg className="battle-defeat-cracks" viewBox="0 0 800 500" preserveAspectRatio="none" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M0 74 37 91l-11 34 39 17M800 119l-28 17 13 27-40 22M0 419l34-28 16 13 27-35M800 438l-31-20 11-24-25-17" /></svg>}
  </div>}</div>;
}
