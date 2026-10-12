import { CONTENT_VERSION, ENDINGS, START_NODE, STORY_BY_ID } from "../content";
import {
  createCharacter,
  ORIGIN_LABELS,
  RACE_LABELS,
  SKILL_LABELS,
  STAT_LABELS,
} from "./characters";
import { FLAG_LABELS } from "./flag-labels";
import {
  STAT_KEYS,
  type CharacterConfig,
  type Choice,
  type Effects,
  type GameState,
  type Requirement,
  type SkillId,
  type StoryNode,
} from "./types";

export const GAME_CONTENT_VERSION = CONTENT_VERSION;
export const SKILL_KEYS: SkillId[] = [
  "fire",
  "water",
  "earth",
  "wind",
  "healing",
  "sword",
  "waterSword",
  "northSword",
];
export const RELATION_LABELS: Record<string, string> = {
  family: "家人",
  mentor: "导师",
  companions: "同伴",
  villagers: "村民",
  guild: "公会",
  allies: "盟友",
  dragon: "龙神阵营",
  refugees: "难民",
};
const clamp = (value: number, max: number): number =>
  Math.max(0, Math.min(max, value));

export function nodeYear(
  node: StoryNode,
  character: CharacterConfig,
  previousYear = character.birthYear,
): number {
  const requested =
    node.year === "childhood"
      ? character.birthYear + 5
      : node.year === "youth"
        ? character.birthYear + 9
        : node.year;
  return Math.max(character.birthYear, previousYear, requested);
}

export function createGame(
  character: CharacterConfig,
  id: string = globalThis.crypto?.randomUUID?.() ??
    `life-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  now = new Date().toISOString(),
): GameState {
  const node = STORY_BY_ID[START_NODE];
  if (!node) throw new Error("出生章节尚未载入。");
  if (
    STAT_KEYS.some(
      (key) =>
        !Number.isInteger(character.stats[key]) ||
        character.stats[key] < 0 ||
        character.stats[key] > 20,
    )
  )
    throw new Error("初始属性不合法。");
  const baseline = createCharacter(character.actor, { budget: 0 }).stats;
  const verified = createCharacter(character.actor, {
    name: character.name,
    race: character.race,
    origin: character.origin,
    budget: character.budget,
    allocation: Object.fromEntries(
      STAT_KEYS.map((key) => [key, character.stats[key] - baseline[key]]),
    ),
  });
  if (
    verified.birthYear !== character.birthYear ||
    verified.race !== character.race ||
    verified.origin !== character.origin ||
    verified.name !== character.name
  )
    throw new Error("人物出生资料不合法。");
  const year = nodeYear(node, character);
  const resources = {
    village: { money: 30, supplies: 6 },
    noble: { money: 50, supplies: 5 },
    demon: { money: 18, supplies: 8 },
    forest: { money: 22, supplies: 8 },
  }[verified.origin];
  const flags =
    verified.origin === "demon"
      ? ["languageDemon"]
      : verified.origin === "forest"
        ? ["languageBeast"]
        : [];
  if (
    verified.actor === "custom" &&
    verified.race === "migurd" &&
    !flags.includes("languageDemon")
  )
    flags.push("languageDemon");
  return {
    id,
    character: { ...verified, randomized: character.randomized },
    stats: { ...character.stats },
    skills: Object.fromEntries(SKILL_KEYS.map((key) => [key, 0])) as Record<
      SkillId,
      number
    >,
    relations: {},
    flags,
    ...resources,
    injury: 0,
    guild: 0,
    year,
    age: year - character.birthYear,
    nodeId: START_NODE,
    step: 0,
    status: "active",
    history: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function checkRequirements(
  requirements: Requirement[] | undefined,
  state: GameState,
): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const requirement of requirements ?? []) {
    const min = requirement.min ?? 1;
    if (requirement.stat && state.stats[requirement.stat] < min)
      missing.push(
        `${STAT_LABELS[requirement.stat]}需 ${min}（当前 ${state.stats[requirement.stat]}）`,
      );
    if (requirement.flag && !state.flags.includes(requirement.flag))
      missing.push(`尚未获得：${FLAG_LABELS[requirement.flag] ?? "相关经历"}`);
    if (requirement.absent && state.flags.includes(requirement.absent))
      missing.push(`已发生：${FLAG_LABELS[requirement.absent] ?? "相关经历"}`);
    if (
      requirement.relation &&
      (state.relations[requirement.relation] ?? 0) < min
    ) {
      const label =
        RELATION_LABELS[requirement.relation] ??
        (/\p{Script=Han}/u.test(requirement.relation)
          ? requirement.relation
          : "相关人物");
      missing.push(
        `与${label}的关系需 ${min}（当前 ${state.relations[requirement.relation] ?? 0}）`,
      );
    }
    if (requirement.skill && state.skills[requirement.skill] < min)
      missing.push(
        `${SKILL_LABELS[requirement.skill]}需 ${min} 阶（当前 ${state.skills[requirement.skill]}）`,
      );
    if (
      requirement.anySkill &&
      !requirement.anySkill.some((skill) => state.skills[skill] >= min)
    ) {
      missing.push(
        `${requirement.anySkill.map((skill) => SKILL_LABELS[skill]).join("、") || "适用技艺"}中至少一项需达 ${min} 阶`,
      );
    }
    if (requirement.resource && state[requirement.resource] < min)
      missing.push(
        `${requirement.resource === "money" ? "旅费" : "补给"}需 ${min}（当前 ${state[requirement.resource]}）`,
      );
    if (requirement.actor && state.character.actor !== requirement.actor)
      missing.push("此选择属于另一人物的人生。");
  }
  return { ok: missing.length === 0, missing };
}

export interface AvailableChoice {
  choice: Choice;
  ok: boolean;
  missing: string[];
  available: boolean;
}

export function getAvailableChoices(
  node: StoryNode,
  state: GameState,
): AvailableChoice[] {
  return node.choices
    .filter(
      (choice) =>
        !choice.actors || choice.actors.includes(state.character.actor),
    )
    .map((choice) => {
      const requirements = checkRequirements(choice.requirements, state);
      const target = STORY_BY_ID[choice.target];
      const actorAllowed =
        !target?.actors || target.actors.includes(state.character.actor);
      const missing = actorAllowed
        ? requirements.missing
        : [...requirements.missing, "此分支不适用于当前身份。"];
      return {
        choice,
        ok: missing.length === 0,
        missing,
        available: missing.length === 0,
      };
    });
}

export function renderBody(node: StoryNode, state: GameState): string {
  const extra = node.actorBodies?.[state.character.actor];
  const body = extra ? `${node.body}\n\n${extra}` : node.body;
  return body
    .replaceAll("{name}", state.character.name)
    .replaceAll("{age}", String(state.age))
    .replaceAll("{origin}", ORIGIN_LABELS[state.character.origin])
    .replaceAll(
      "{race}",
      state.character.actor === "sylphie"
        ? "人族、长耳族与兽族的混血"
        : RACE_LABELS[state.character.race],
    );
}

function applyEffects(state: GameState, effects: Effects = {}): GameState {
  const stats = { ...state.stats };
  const skills = { ...state.skills };
  const relations = { ...state.relations };
  for (const key of STAT_KEYS)
    stats[key] = clamp(stats[key] + (effects.stats?.[key] ?? 0), 100);
  for (const key of SKILL_KEYS)
    skills[key] = clamp(skills[key] + (effects.skills?.[key] ?? 0), 7);
  for (const [key, value] of Object.entries(effects.relations ?? {}))
    relations[key] = clamp((relations[key] ?? 0) + value, 100);
  const flags = [
    ...new Set([
      ...state.flags.filter((flag) => !effects.removeFlags?.includes(flag)),
      ...(effects.flags ?? []),
    ]),
  ];
  return {
    ...state,
    stats,
    skills,
    relations,
    flags,
    money: Math.max(0, state.money + (effects.money ?? 0)),
    supplies: Math.max(0, state.supplies + (effects.supplies ?? 0)),
    injury: clamp(state.injury + (effects.injury ?? 0), 100),
    guild: clamp(state.guild + (effects.guild ?? 0), 6),
  };
}

/** expectedStep lets the UI reject a second submission captured from an earlier render. */
export function resolveChoice(
  state: GameState,
  choiceId: string,
  expectedStep = state.step,
): { state: GameState; feedback: string } {
  if (state.status !== "active")
    throw new Error("这段人生已封存，不能继续推进。");
  if (expectedStep !== state.step)
    throw new Error("选择已经结算，请等待当前章节。");
  const node = STORY_BY_ID[state.nodeId];
  if (!node || node.kind === "ending")
    throw new Error("当前章节不能继续推进。");
  if (node.actors && !node.actors.includes(state.character.actor))
    throw new Error("当前章节不属于这位人物的人生。");
  const entry = getAvailableChoices(node, state).find(
    (item) => item.choice.id === choiceId,
  );
  if (!entry) throw new Error("该选择不属于当前章节。");
  if (!entry.ok) throw new Error(entry.missing.join("；"));
  const target = STORY_BY_ID[entry.choice.target];
  if (!target) throw new Error("目标章节不存在。");
  const next = applyEffects(state, entry.choice.effects);
  const year = nodeYear(target, state.character, state.year);
  const ending = target.endingId
    ? ENDINGS.find((item) => item.id === target.endingId)
    : undefined;
  if (target.kind === "ending" && !ending) throw new Error("结局资料缺失。");
  return {
    state: {
      ...next,
      nodeId: target.id,
      year,
      age: year - state.character.birthYear,
      step: state.step + 1,
      status: ending ? ending.kind : "active",
      endingId: ending?.id,
      history: [
        ...state.history,
        {
          nodeId: node.id,
          title: node.title,
          choiceId,
          choice: entry.choice.label,
          feedback: entry.choice.feedback,
          year: state.year,
          age: state.age,
        },
      ],
    },
    feedback: entry.choice.feedback,
  };
}
