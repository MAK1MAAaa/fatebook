import { STORY_BY_ID, STORY_NODES } from "../src/content";
import { createCharacter } from "../src/game/characters";
import {
  createGame,
  getAvailableChoices,
  resolveChoice,
} from "../src/game/engine";
import type {
  ActorId,
  Choice,
  GameState,
  Requirement,
  SkillId,
  StoryNode,
} from "../src/game/types";

export const actors: ActorId[] = [
  "custom",
  "rudeus",
  "eris",
  "sylphie",
  "roxy",
];
export const born = (actor: ActorId) =>
  createGame(
    createCharacter(actor, {
      budget: 60,
      allocation: {
        vitality: 10,
        mana: 10,
        strength: 10,
        agility: 10,
        insight: 10,
        charisma: 10,
      },
    }),
    `witness-${actor}`,
    "2026-10-02T00:00:00.000Z",
  );
const allows = (node: StoryNode, actor: ActorId) =>
  !node.actors || node.actors.includes(actor);

/** A backward recipe chooses actual available decisions; no flags or resources are injected. */
export function witness(
  endingId: string,
  actor: ActorId,
  initial = born(actor),
  waypointOverrides: Record<string, string> = {},
): GameState {
  const target = STORY_NODES.find((node) => node.endingId === endingId);
  if (!target) throw new Error(`缺少结局节点 ${endingId}`);
  const requiredFlags = new Set<string>();
  const forbiddenFlags = new Set<string>();
  const waypoints: Record<string, string> = {
    ...(endingId === "end-family"
      ? {
          "c1-language": "c1-language:4",
          "c1-library": "c1-library:1",
          "c4-return": "c4-return:depart",
          "c4-school": "c4-school:research",
          "c4-research": "c4-research:counter",
          "c4-party": "c4-party:rehearse",
          "c4-labyrinth": "c4-labyrinth:coordinated",
        }
      : {}),
    ...waypointOverrides,
  };
  const requiredSkills = new Map<string, { skills: SkillId[]; min: number }>();
  const collectRequirements = (
    requirements: Requirement[] | undefined,
  ): boolean => {
    let changed = false;
    for (const requirement of requirements ?? []) {
      if (requirement.flag && !requiredFlags.has(requirement.flag)) {
        requiredFlags.add(requirement.flag);
        changed = true;
      }
      if (requirement.absent) forbiddenFlags.add(requirement.absent);
      const skills =
        requirement.anySkill ??
        (requirement.skill ? [requirement.skill] : undefined);
      if (skills)
        requiredSkills.set(`${skills.join(",")}/${requirement.min ?? 1}`, {
          skills,
          min: requirement.min ?? 1,
        });
    }
    return changed;
  };
  for (const node of STORY_NODES)
    for (const choice of node.choices) {
      if (choice.target === target.id) collectRequirements(choice.requirements);
    }
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const node of STORY_NODES)
      for (const choice of node.choices) {
        if (choice.effects?.flags?.some((flag) => requiredFlags.has(flag))) {
          if (collectRequirements(choice.requirements)) expanded = true;
        }
      }
  }
  const distances = new Map<string, number>([[target.id, 0]]);
  for (let pass = 0; pass < STORY_NODES.length; pass += 1) {
    for (const node of STORY_NODES) {
      if (!allows(node, actor)) continue;
      for (const choice of node.choices) {
        if (choice.actors && !choice.actors.includes(actor)) continue;
        const nextDistance = distances.get(choice.target);
        if (
          nextDistance !== undefined &&
          (distances.get(node.id) ?? Infinity) > nextDistance + 1
        )
          distances.set(node.id, nextDistance + 1);
      }
    }
  }
  let state = initial;
  for (let steps = 0; steps < 140 && state.status === "active"; steps += 1) {
    const node = STORY_BY_ID[state.nodeId];
    const score = (choice: Choice): number => {
      const acquired =
        choice.effects?.flags?.filter(
          (flag) => requiredFlags.has(flag) && !state.flags.includes(flag),
        ).length ?? 0;
      const next = STORY_BY_ID[choice.target];
      const nearby = next.choices
        .filter(
          (candidate) => !candidate.actors || candidate.actors.includes(actor),
        )
        .reduce(
          (max, candidate) =>
            Math.max(
              max,
              candidate.effects?.flags?.filter(
                (flag) =>
                  requiredFlags.has(flag) && !state.flags.includes(flag),
              ).length ?? 0,
            ),
          0,
        );
      const skillScore = (candidate: Choice): number =>
        [...requiredSkills.values()].filter(
          (group) =>
            !group.skills.some((skill) => state.skills[skill] >= group.min) &&
            group.skills.some(
              (skill) => (candidate.effects?.skills?.[skill] ?? 0) > 0,
            ),
        ).length;
      const nearbySkill = next.choices.reduce(
        (max, candidate) => Math.max(max, skillScore(candidate)),
        0,
      );
      const forbidden = choice.effects?.flags?.some((flag) =>
        forbiddenFlags.has(flag),
      )
        ? 10000
        : 0;
      const waypoint = waypoints[node.id] === choice.id ? 20000 : 0;
      return (
        waypoint +
        acquired * 100 +
        skillScore(choice) * 80 +
        nearby * 15 +
        nearbySkill * 12 -
        forbidden -
        (distances.get(choice.target) ?? 1000) -
        (choice.risk === "fatal" && choice.target !== target.id ? 1000 : 0)
      );
    };
    const available = getAvailableChoices(node, state)
      .filter((entry) => entry.ok && distances.has(entry.choice.target))
      .sort((a, b) => score(b.choice) - score(a.choice));
    if (!available[0])
      throw new Error(
        `${endingId}/${actor} 卡在 ${node.id}，已获经历：${state.flags.join(", ")}`,
      );
    state = resolveChoice(state, available[0].choice.id, state.step).state;
  }
  if (state.endingId !== endingId)
    throw new Error(
      `${endingId}/${actor} 未到达预期结局，停在 ${state.nodeId}`,
    );
  return state;
}
