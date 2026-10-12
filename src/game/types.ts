export const STAT_KEYS = [
  "vitality",
  "mana",
  "strength",
  "agility",
  "insight",
  "charisma",
] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type Stats = Record<StatKey, number>;
export type ActorId = "custom" | "rudeus" | "eris" | "sylphie" | "roxy";
export type Race = "human" | "elf" | "beast" | "migurd";
export type Origin = "village" | "noble" | "demon" | "forest";
export type SkillId =
  | "fire"
  | "water"
  | "earth"
  | "wind"
  | "healing"
  | "sword"
  | "waterSword"
  | "northSword";
export interface CharacterConfig {
  actor: ActorId;
  name: string;
  race: Race;
  origin: Origin;
  birthYear: number;
  stats: Stats;
  budget: number;
  traits: string[];
  randomized?: boolean;
}
export interface Requirement {
  stat?: StatKey;
  min?: number;
  flag?: string;
  absent?: string;
  relation?: string;
  skill?: SkillId;
  anySkill?: SkillId[];
  resource?: "money" | "supplies";
  actor?: ActorId;
}
export interface Effects {
  stats?: Partial<Stats>;
  skills?: Partial<Record<SkillId, number>>;
  relations?: Record<string, number>;
  flags?: string[];
  removeFlags?: string[];
  money?: number;
  supplies?: number;
  injury?: number;
  guild?: number;
}
export interface Choice {
  id: string;
  label: string;
  detail: string;
  target: string;
  requirements?: Requirement[];
  effects?: Effects;
  risk?: "safe" | "caution" | "danger" | "fatal";
  feedback: string;
  actors?: ActorId[];
}
export interface StoryNode {
  id: string;
  chapter: number;
  title: string;
  location: string;
  year: number | "childhood" | "youth";
  body: string;
  actorBodies?: Partial<Record<ActorId, string>>;
  actors?: ActorId[];
  choices: Choice[];
  kind?: "decision" | "ending";
  endingId?: string;
  tag?: "IF" | "身份";
  source?: string;
}
export interface Ending {
  id: string;
  title: string;
  subtitle: string;
  kind: "alive" | "dead";
  description: string;
  condition: string;
  icon: string;
}
export interface HistoryEntry {
  nodeId: string;
  title: string;
  choiceId: string;
  choice: string;
  feedback: string;
  year: number;
  age: number;
}
export interface GameState {
  id: string;
  character: CharacterConfig;
  stats: Stats;
  skills: Record<SkillId, number>;
  relations: Record<string, number>;
  flags: string[];
  money: number;
  supplies: number;
  injury: number;
  guild: number;
  year: number;
  age: number;
  nodeId: string;
  step: number;
  status: "active" | "alive" | "dead";
  endingId?: string;
  history: HistoryEntry[];
  createdAt: string;
  updatedAt: string;
}
export interface SaveEnvelope {
  schemaVersion: number;
  contentVersion: string;
  revision: number;
  saves: Record<string, unknown>;
  unlocked: string[];
}
export interface Chapter {
  number: number;
  title: string;
  subtitle: string;
}
