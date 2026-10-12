import { ENDINGS, STORY_BY_ID } from "../content";
import { PRESETS, SKILL_LABELS, SKILL_RANKS, STAT_LABELS } from "./characters";
import {
  checkRequirements,
  createGame,
  resolveChoice,
  SKILL_KEYS,
} from "./engine";
import { FLAG_LABELS, RELATION_LABELS } from "./flag-labels";
import {
  STAT_KEYS,
  type Ending,
  type GameState,
  type Requirement,
} from "./types";

export interface RequirementStatus {
  label: string;
  met: boolean;
}
export interface StateChange {
  label: string;
  tone: "gain" | "loss" | "neutral";
}
export interface LifeDirection {
  ending: Ending;
  requirements: RequirementStatus[];
  met: number;
  total: number;
  ready: boolean;
}

const flagLabel = (flag: string) =>
  Object.hasOwn(FLAG_LABELS, flag) ? FLAG_LABELS[flag] : "相关经历";
const relationLabel = (relation: string) =>
  Object.hasOwn(RELATION_LABELS, relation)
    ? RELATION_LABELS[relation]
    : /\p{Script=Han}/u.test(relation)
      ? relation
      : "相关人物";
const skillRank = (rank: number) => SKILL_RANKS[rank] ?? `${rank}阶`;
const signed = (value: number) => `${value > 0 ? "+" : ""}${value}`;

export function getRequirementStatuses(
  requirements: Requirement[] | undefined,
  state: GameState,
): RequirementStatus[] {
  const result: RequirementStatus[] = [];
  for (const requirement of requirements ?? []) {
    const min = requirement.min ?? 1;
    if (requirement.stat)
      result.push({
        label: `${STAT_LABELS[requirement.stat]}至少 ${min}（当前 ${state.stats[requirement.stat]}）`,
        met: state.stats[requirement.stat] >= min,
      });
    if (requirement.flag)
      result.push({
        label: `已有${flagLabel(requirement.flag)}`,
        met: state.flags.includes(requirement.flag),
      });
    if (requirement.absent)
      result.push({
        label: `尚未发生${flagLabel(requirement.absent)}`,
        met: !state.flags.includes(requirement.absent),
      });
    if (requirement.relation)
      result.push({
        label: `与${relationLabel(requirement.relation)}的羁绊至少 ${min}（当前 ${state.relations[requirement.relation] ?? 0}）`,
        met: (state.relations[requirement.relation] ?? 0) >= min,
      });
    if (requirement.skill)
      result.push({
        label: `${SKILL_LABELS[requirement.skill]}达到${skillRank(min)}（当前${skillRank(state.skills[requirement.skill])}）`,
        met: state.skills[requirement.skill] >= min,
      });
    if (requirement.anySkill)
      result.push({
        label: `${requirement.anySkill.map((skill) => SKILL_LABELS[skill]).join("、") || "适用技艺"}中任一达到${skillRank(min)}`,
        met: requirement.anySkill.some((skill) => state.skills[skill] >= min),
      });
    if (requirement.resource)
      result.push({
        label: `${requirement.resource === "money" ? "旅费" : "补给"}至少 ${min}（当前 ${state[requirement.resource]}）`,
        met: state[requirement.resource] >= min,
      });
    if (requirement.actor)
      result.push({
        label: `属于${requirement.actor === "custom" ? "自建角色" : PRESETS[requirement.actor].name}的人生`,
        met: state.character.actor === requirement.actor,
      });
  }
  return result;
}

function changesBetween(before: GameState, after: GameState): StateChange[] {
  const changes: StateChange[] = [];
  const numeric = (
    label: string,
    previous: number,
    next: number,
    inverse = false,
  ) => {
    const delta = next - previous;
    if (delta === 0) return;
    changes.push({
      label: `${label} ${signed(delta)}（${previous} → ${next}）`,
      tone: (inverse ? delta < 0 : delta > 0) ? "gain" : "loss",
    });
  };
  for (const stat of STAT_KEYS)
    numeric(STAT_LABELS[stat], before.stats[stat], after.stats[stat]);
  for (const skill of SKILL_KEYS) {
    const previous = before.skills[skill];
    const next = after.skills[skill];
    if (next !== previous)
      changes.push({
        label: `${SKILL_LABELS[skill]} ${skillRank(previous)} → ${skillRank(next)}`,
        tone: next > previous ? "gain" : "loss",
      });
  }
  for (const relation of new Set([
    ...Object.keys(before.relations),
    ...Object.keys(after.relations),
  ])) {
    numeric(
      `${relationLabel(relation)}羁绊`,
      before.relations[relation] ?? 0,
      after.relations[relation] ?? 0,
    );
  }
  numeric("旅费", before.money, after.money);
  numeric("补给", before.supplies, after.supplies);
  numeric("伤势", before.injury, after.injury, true);
  if (before.guild !== after.guild) {
    const ranks = ["F", "E", "D", "C", "B", "A", "S"];
    changes.push({
      label: `公会履历 ${ranks[before.guild]} → ${ranks[after.guild]}`,
      tone: after.guild > before.guild ? "gain" : "loss",
    });
  }
  for (const flag of new Set(after.flags))
    if (!before.flags.includes(flag)) {
      changes.push({ label: `新增经历：${flagLabel(flag)}`, tone: "neutral" });
    }
  for (const flag of new Set(before.flags))
    if (!after.flags.includes(flag)) {
      changes.push({ label: `移除经历：${flagLabel(flag)}`, tone: "neutral" });
    }
  return changes;
}

export function getChoiceChanges(
  state: GameState,
  choiceId: string,
): StateChange[] {
  try {
    return changesBetween(
      state,
      resolveChoice(state, choiceId, state.step).state,
    );
  } catch {
    // Unavailable choices already have their missing conditions shown separately.
    return [];
  }
}

function progressSignature(state: GameState): string {
  return JSON.stringify({
    nodeId: state.nodeId,
    step: state.step,
    year: state.year,
    age: state.age,
    status: state.status,
    endingId: state.endingId,
    stats: STAT_KEYS.map((key) => state.stats[key]),
    skills: SKILL_KEYS.map((key) => state.skills[key]),
    relations: Object.entries(state.relations).sort(([a], [b]) =>
      a.localeCompare(b),
    ),
    flags: [...new Set(state.flags)].sort(),
    money: state.money,
    supplies: state.supplies,
    injury: state.injury,
    guild: state.guild,
  });
}

export function getLastChoiceChanges(state: GameState): StateChange[] {
  if (
    state.step <= 0 ||
    !Array.isArray(state.history) ||
    state.history.length !== state.step
  )
    return [];
  try {
    let replayed = createGame(state.character, state.id, state.createdAt);
    let previous = replayed;
    for (const entry of state.history) {
      if (
        entry.nodeId !== replayed.nodeId ||
        entry.year !== replayed.year ||
        entry.age !== replayed.age
      )
        return [];
      previous = replayed;
      replayed = resolveChoice(replayed, entry.choiceId, replayed.step).state;
    }
    // Older saves remain playable; only an unverifiable change summary is omitted.
    if (progressSignature(replayed) !== progressSignature(state)) return [];
    return changesBetween(previous, replayed);
  } catch {
    return [];
  }
}

export function getLifeDirections(state: GameState): LifeDirection[] {
  const conclusion = STORY_BY_ID["c7-conclusion"];
  if (!conclusion) return [];
  return conclusion.choices.flatMap((choice) => {
    const target = STORY_BY_ID[choice.target];
    const ending = ENDINGS.find((item) => item.id === target?.endingId);
    if (!ending || ending.kind !== "alive") return [];
    const requirements = getRequirementStatuses(choice.requirements, state);
    return [
      {
        ending,
        requirements,
        met: requirements.filter((requirement) => requirement.met).length,
        total: requirements.length,
        ready: checkRequirements(choice.requirements, state).ok,
      },
    ];
  });
}
