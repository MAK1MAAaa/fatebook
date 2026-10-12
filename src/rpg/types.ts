import type { ActorId, Effects, GameState, SkillId } from '../game/types';
export type StatusKey = 'burn' | 'weak' | 'vulnerable';
export type Statuses = Record<StatusKey, number>;
export type CardEffect = { damage?: number; block?: number; heal?: number; draw?: number; energy?: number; burn?: number; weak?: number; vulnerable?: number; cleanse?: boolean; all?: boolean };
export type RulesetVersion = '2.0.0' | '2.1.0';
export type DamageScaling = 'strength' | 'mana' | 'hybrid';
export interface CardDefinition { id: string; name: string; cost: number; school: SkillId | 'neutral' | 'identity'; rank: number; actor?: ActorId; text: string; effect: CardEffect; damageScaling?: DamageScaling; upgradeEffect?: CardEffect; retain?: boolean; exhaust?: boolean; color: string; }
export interface OwnedCard { uid: string; cardId: string; upgraded: boolean; }
export interface Intent { kind: 'attack' | 'guard' | 'burn' | 'weak' | 'vulnerable' | 'heal' | 'drain' | 'ritual'; amount: number; hits?: number; label: string; }
export interface EnemyDefinition { id: string; name: string; role: string; hp: number; pattern: Intent[]; color: string; boss?: boolean; phase?: { threshold: number; pattern: Intent[]; name: string }; }
export interface EnemyUnit { uid: string; definitionId: string; name: string; hp: number; maxHp: number; block: number; statuses: Statuses; intent: Intent; phase: number; }
export interface Companion { id: string; actor?: ActorId; name: string; chapter: number; description: string; passive: 'health' | 'damage' | 'block' | 'draw'; skill: CardEffect; skillName: string; requiredFlag?: string; }
export interface Equipment { id: string; name: string; chapter: number; slot: 'weapon' | 'armor' | 'charm'; price: number; description: string; effect: { damage?: number; block?: number; health?: number; draw?: number }; }
export interface EncounterDefinition { id: string; chapter: number; index: number; title: string; location: string; summary: string; objectiveText: string; goal: 'defeat' | 'survive' | 'escort' | 'ritual' | 'rescue'; rounds: number; enemies: string[]; modifier: 'none' | 'ambush' | 'fog' | 'supplies' | 'fire' | 'ward' | 'duel' | 'reinforce'; optional: boolean; questId: string; requires: string[]; boss: boolean; reward: number; cardRewards: string[]; rewardEffects?: Effects; }
export interface QuestDefinition { id: string; chapter: number; title: string; description: string; location: string; encounters: string[]; optional: boolean; }
export interface BattleState { encounterId: string; seed: number; rng: number; turn: number; hp: number; maxHp: number; block: number; energy: number; statuses: Statuses; hand: string[]; drawPile: string[]; discard: string[]; exhausted: string[]; enemies: EnemyUnit[]; supportCooldown: number; potions: number; escortHp: number; ritual: number; result: 'playing' | 'won' | 'lost'; log: string[]; played: number; damageTaken: number; }
export interface BattleReceipt { encounterId: string; turns: number; played: number; damageTaken: number; goal: string; }
export interface RpgState extends GameState { version: 2; rulesetVersion?: RulesetVersion; revision: number; seed: number; chapter: number; scene: 'hub' | 'battle' | 'reward'; collection: OwnedCard[]; deck: string[]; companionId: string | null; equipment: Partial<Record<Equipment['slot'], string>>; ownedEquipment: string[]; acceptedQuests: string[]; victories: string[]; claimedRewards: string[]; receipts: BattleReceipt[]; resolvedEvents: string[]; battle: BattleState | null; reward: { encounterId: string; choices: string[] } | null; battleAttempts: Record<string, number>; xp: number; }
export type GameAction =
 | { type: 'acceptQuest'; questId: string }
 | { type: 'startBattle'; encounterId: string; practice?: boolean }
 | { type: 'playCard'; uid: string; target?: string }
 | { type: 'endTurn' } | { type: 'support'; target?: string } | { type: 'potion' }
 | { type: 'retryBattle' } | { type: 'returnHub' }
 | { type: 'claimReward'; cardId: string | null }
 | { type: 'setDeck'; deck: string[] }
 | { type: 'upgradeCard'; uid: string } | { type: 'removeCard'; uid: string }
 | { type: 'buyCard'; cardId: string } | { type: 'buyEquipment'; equipmentId: string }
 | { type: 'equip'; equipmentId: string } | { type: 'setCompanion'; companionId: string | null }
 | { type: 'train'; skill: SkillId }
 | { type: 'event'; eventId: string; choiceId: string }
 | { type: 'nextChapter' }
 | { type: 'migrateRuleset'; confirmed: true }
 | { type: 'finish'; endingId: string; confirmed?: boolean };
export interface RpgEvent { id: string; chapter: number; title: string; summary: string; detail?: string; actor?: ActorId; choices: { id: string; label: string; detail: string; effects: Effects }[]; requires?: string[]; }
