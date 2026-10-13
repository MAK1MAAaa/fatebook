import { ENCOUNTER_BY_ID } from './content';
import { ENEMY_BY_ID } from './enemies';
import { rulesetVersion } from './rulesets';
import type { CombatEvent } from './combat-events';
import type { BattleState, GameAction, RpgState } from './types';

export interface BattleFeedbackEvent extends CombatEvent {
  enemyName?: string;
  color: string;
  offsetMs: number;
  impactMs: number;
  durationMs: number;
}

export interface BattleFeedbackCue {
  id: string;
  lifeId: string;
  encounterId: string;
  battleSeed: number;
  revision: number;
  sourceTurn: number;
  turn: number;
  durationMs: number;
  events: BattleFeedbackEvent[];
  outcome: { result: 'won' | 'lost'; reason: string; offsetMs: number; durationMs: number } | null;
}

function outcomeReason(battle: BattleState): string {
  const encounter = ENCOUNTER_BY_ID[battle.encounterId];
  // Match evaluate's actual precedence, including failures on the last round.
  if (battle.result === 'lost') {
    if (battle.hp <= 0) return '主角失去作战能力';
    if (encounter.goal === 'rescue' && battle.turn > encounter.rounds) return '救援时限已过';
    if (encounter.goal === 'escort' && battle.escortHp <= 0) return '护送目标被击倒';
    return '仪式失控';
  }
  if (battle.enemies.every(enemy => enemy.hp <= 0)) {
    if (encounter.goal === 'rescue') return '击退阻截者，救援完成';
    if (encounter.goal === 'ritual') return '仪式核心已击破';
    return '全部敌人已击退';
  }
  if (encounter.goal === 'escort') return '护送目标安全抵达';
  if (encounter.goal === 'survive') return '守住撤离窗口';
  return '仪式已压制';
}

/** Read one real action and its observations without simulating combat again. */
export function buildBattleFeedbackCue(before: RpgState, after: RpgState, action: GameAction, observations: readonly CombatEvent[]): BattleFeedbackCue | null {
  const previous = before.battle, next = after.battle;
  if (!['endTurn', 'playCard', 'support'].includes(action.type) || before.scene !== 'battle'
    || previous?.result !== 'playing' || !next || before.id !== after.id || before.seed !== after.seed
    || after.revision !== before.revision + 1 || previous.encounterId !== next.encounterId
    || previous.seed !== next.seed || !['battle', 'reward'].includes(after.scene)
    || rulesetVersion(before) !== rulesetVersion(after)) return null;
  if (action.type === 'endTurn') {
    if (next.turn !== previous.turn && next.turn !== previous.turn + 1) return null;
    if (next.result === 'playing' && next.turn !== previous.turn + 1) return null;
  } else {
    if (previous.turn !== next.turn) return null;
    if (action.type === 'playCard' && (!previous.hand.includes(action.uid) || next.played !== previous.played + 1)) return null;
  }

  const finished = next.result === 'won' || next.result === 'lost';
  const sourceEvents = action.type === 'endTurn' ? observations : [];
  if (!sourceEvents.length && !finished) return null;
  const slot = sourceEvents.length ? Math.min(520, Math.max(1, Math.floor((finished ? 2350 : 3000) / sourceEvents.length))) : 0;
  const events = sourceEvents.map((event, index): BattleFeedbackEvent => {
    const enemy = previous.enemies.find(unit => unit.uid === event.enemyUid);
    return { ...event, enemyName: enemy?.name,
      color: event.kind === 'hero-burn' || event.kind === 'enemy-burn' ? '#ed8b62' : enemy ? ENEMY_BY_ID[enemy.definitionId]?.color ?? '#c37c72' : '#c37c72',
      offsetMs: index * slot, impactMs: Math.min(150, Math.floor(slot / 2)), durationMs: slot };
  });
  const outcome = finished ? { result: next.result as 'won' | 'lost', reason: outcomeReason(next),
    offsetMs: action.type === 'playCard' ? 600 : action.type === 'support' ? 180 : events.length * slot,
    durationMs: 800 } : null;
  return { id: `feedback:${after.id}:${next.seed}:${after.revision}`, lifeId: after.id,
    encounterId: next.encounterId, battleSeed: next.seed, revision: after.revision, sourceTurn: previous.turn, turn: next.turn,
    durationMs: outcome ? outcome.offsetMs + outcome.durationMs : events.length * slot, events, outcome };
}

export function reduceBattleFeedbackCue(cue: BattleFeedbackCue): BattleFeedbackCue {
  return { ...cue, durationMs: 240, events: cue.events.map(event => ({ ...event, offsetMs: 0, impactMs: 0, durationMs: 220 })),
    outcome: cue.outcome ? { ...cue.outcome, offsetMs: 0, durationMs: 220 } : null };
}
