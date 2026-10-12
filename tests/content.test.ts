import { describe, expect, it } from "vitest";
import { ENDINGS, START_NODE, STORY_BY_ID, STORY_NODES } from "../src/content";
import { createCharacter, randomCharacter } from "../src/game/characters";
import {
  createGame,
  getAvailableChoices,
  nodeYear,
  resolveChoice,
} from "../src/game/engine";
import type { StatKey } from "../src/game/types";
import { actors, born, witness } from "./witness-helper";

describe("完整剧情图", () => {
  it("包含120决策、18结局及各章约定配额", () => {
    expect(STORY_NODES.filter((node) => node.kind !== "ending")).toHaveLength(
      120,
    );
    expect(STORY_NODES.filter((node) => node.kind === "ending")).toHaveLength(
      18,
    );
    expect(ENDINGS).toHaveLength(18);
    for (const [chapter, count] of [13, 17, 24, 18, 17, 16, 15].entries())
      expect(
        STORY_NODES.filter(
          (node) => node.chapter === chapter + 1 && node.kind !== "ending",
        ),
      ).toHaveLength(count);
  });

  it("旧版只读剧情引用唯一，所有决策都有出口", () => {
    expect(new Set(STORY_NODES.map((node) => node.id)).size).toBe(
      STORY_NODES.length,
    );
    const choiceIds = STORY_NODES.flatMap((node) =>
      node.choices.map((choice) => choice.id),
    );
    expect(new Set(choiceIds).size).toBe(choiceIds.length);
    expect(new Set(ENDINGS.map((ending) => ending.id)).size).toBe(
      ENDINGS.length,
    );
    for (const node of STORY_NODES) {
      if (node.kind !== "ending") {
        expect(node.choices.length, node.id).toBeGreaterThan(0);
      } else expect(node.choices, node.id).toHaveLength(0);
      expect(
        new Set(node.choices.map((choice) => choice.id)).size,
        node.id,
      ).toBe(node.choices.length);
      for (const choice of node.choices) {
        const target = STORY_BY_ID[choice.target];
        expect(target, `${node.id} → ${choice.target}`).toBeDefined();
        if (typeof node.year === "number" && typeof target.year === "number")
          expect(
            target.year,
            `${node.id} → ${target.id}`,
          ).toBeGreaterThanOrEqual(node.year);
      }
    }
  });

  it("所有节点从出生可达、无剧情循环，每个身份至少8个专属节点", () => {
    const reachable = new Set<string>();
    const visiting = new Set<string>();
    function visit(id: string) {
      if (visiting.has(id)) throw new Error(`剧情循环：${id}`);
      if (reachable.has(id)) return;
      visiting.add(id);
      for (const choice of STORY_BY_ID[id].choices) visit(choice.target);
      visiting.delete(id);
      reachable.add(id);
    }
    visit(START_NODE);
    expect(reachable.size).toBe(STORY_NODES.length);
    for (const actor of actors)
      expect(
        STORY_NODES.filter(
          (node) =>
            node.actors?.length === 1 &&
            node.actors[0] === actor &&
            node.kind !== "ending",
        ).length,
        actor,
      ).toBeGreaterThanOrEqual(8);
  });

  for (const actor of actors)
    it(`${actor} 可从童年完整走到隐退且年代不倒退`, () => {
      const state = witness(
        "end-retired",
        actor,
        createGame(
          createCharacter(actor, { budget: 0 }),
          `default-${actor}`,
          "2026-10-02T00:00:00.000Z",
        ),
      );
      expect(state.status).toBe("alive");
      expect(state.history.length).toBeGreaterThanOrEqual(45);
      expect(state.history.length).toBeLessThanOrEqual(65);
      expect(state.year).toBeGreaterThanOrEqual(417);
      let previousYear = state.character.birthYear;
      for (const entry of state.history) {
        expect(entry.year).toBeGreaterThanOrEqual(previousYear);
        expect(entry.year).toBe(
          nodeYear(STORY_BY_ID[entry.nodeId], state.character, previousYear),
        );
        previousYear = entry.year;
      }
    });

  it("随机开局的实际配置可完整通关", () => {
    for (const budget of [0, 20, 60]) {
      const initial = createGame(
        randomCharacter(budget),
        `random-${budget}`,
        "2026-10-02T00:00:00.000Z",
      );
      expect(witness("end-retired", "custom", initial).status).toBe("alive");
    }
  });

  for (const id of [
    "end-family",
    "end-dragon",
    "end-teacher",
    "end-sword",
    "end-research",
    "end-rebuild",
    "end-politics",
    "end-traveler",
    "end-retired",
    "end-defiant",
    "dead-childhood",
    "dead-quest",
    "dead-journey",
    "dead-dragon",
    "dead-labyrinth",
    "dead-illness",
    "dead-assassin",
    "dead-battle",
  ]) {
    it(`以正式引擎重放 ${id} 的见证路径`, () => {
      const state = witness(id, id === "dead-illness" ? "roxy" : "custom");
      expect(state.endingId).toBe(id);
      expect(state.status).toBe(id.startsWith("dead-") ? "dead" : "alive");
      if (id === "end-family") {
        expect(state.flags).toContain("rescueWithoutLoss");
        expect(state.flags).not.toContain("companionLost");
      }
      if (id === "dead-battle")
        expect(state.flags).not.toContain("battlePrepared");
      expect(() => resolveChoice(state, "any")).toThrow("封存");
    });
  }

  it("关键跨阶段因果包含实际门槛与不同结果", () => {
    const gatedFlags = STORY_NODES.flatMap((node) =>
      node.choices.flatMap((choice) =>
        (choice.requirements ?? []).flatMap((requirement) =>
          requirement.flag ? [requirement.flag] : [],
        ),
      ),
    );
    for (const flag of [
      "languageDemon",
      "correspondence",
      "superdTrust",
      "monsterNotes",
      "teamwork",
      "hydraCounterKnown",
    ])
      expect(gatedFlags, flag).toContain(flag);
    const rescue = STORY_NODES.flatMap((node) => node.choices).find((choice) =>
      choice.requirements?.some(
        (requirement) => requirement.flag === "hydraCounterKnown",
      ),
    );
    expect(
      rescue?.requirements
        ?.filter((requirement) => requirement.flag)
        .map((requirement) => requirement.flag),
    ).toEqual(
      expect.arrayContaining(["monsterNotes", "teamwork", "hydraCounterKnown"]),
    );
  });

  it("洛琪希疾病死亡只属于其本人，其他人物面对的是同伴后果", () => {
    const node = STORY_BY_ID["c4-remedy"];
    for (const actor of actors) {
      const visible = getAvailableChoices(node, born(actor)).map(
        (entry) => entry.choice.target,
      );
      expect(visible.includes("dead-illness"), actor).toBe(actor === "roxy");
    }
  });

  it("童年敏捷、路途体魄与公会交涉在阈值上下确实改变可选路线", () => {
    const gates: {
      nodeId: string;
      choiceId: string;
      stat: StatKey;
      min: number;
    }[] = [
      { nodeId: "c1-edge", choiceId: "c1-edge:2", stat: "agility", min: 7 },
      { nodeId: "c2-road", choiceId: "c2-road:1", stat: "vitality", min: 7 },
      { nodeId: "c3-guild", choiceId: "c3-guild:4", stat: "charisma", min: 9 },
    ];
    for (const gate of gates)
      for (const value of [gate.min - 1, gate.min]) {
        const points = value - 3;
        const state = createGame(
          createCharacter("custom", {
            budget: points,
            allocation: { [gate.stat]: points },
          }),
        );
        const available = getAvailableChoices(
          STORY_BY_ID[gate.nodeId],
          state,
        ).find((entry) => entry.choice.id === gate.choiceId);
        expect(available?.ok, `${gate.choiceId}/${value}`).toBe(
          value >= gate.min,
        );
        if (value < gate.min)
          expect(
            available?.missing.some((reason) =>
              reason.includes(String(gate.min)),
            ),
          ).toBe(true);
      }
  });
});
