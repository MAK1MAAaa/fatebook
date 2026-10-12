import { describe, expect, it, vi } from "vitest";
import type { GameState, Requirement, StoryNode } from "../src/game/types";

vi.mock("../src/content", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/content")>();
  const boundary: StoryNode = {
    id: "insights-boundary",
    chapter: 1,
    title: "测试演练",
    location: "训练场",
    year: "childhood",
    body: "测试真实结算边界。",
    choices: [
      {
        id: "insights-boundary:train",
        label: "训练",
        detail: "",
        target: actual.START_NODE,
        feedback: "",
        effects: {
          stats: { insight: 5, mana: 4 },
          skills: { water: 3, northSword: 2 },
          relations: { family: 4, allies: -4 },
          flags: ["illnessPrevented", "companionLost"],
          removeFlags: ["correspondence"],
          money: -5,
          supplies: -3,
          injury: -5,
          guild: 3,
        },
      },
      {
        id: "insights-boundary:locked",
        label: "不可执行",
        detail: "",
        target: actual.START_NODE,
        feedback: "",
        requirements: [{ stat: "insight", min: 101 }],
      },
    ],
  };
  return {
    ...actual,
    STORY_BY_ID: { ...actual.STORY_BY_ID, [boundary.id]: boundary },
  };
});

import { ENDINGS, STORY_BY_ID } from "../src/content";
import { createCharacter } from "../src/game/characters";
import {
  checkRequirements,
  createGame,
  resolveChoice,
} from "../src/game/engine";
import {
  getChoiceChanges,
  getLastChoiceChanges,
  getLifeDirections,
  getRequirementStatuses,
} from "../src/game/insights";

const born = () =>
  createGame(
    createCharacter("custom", { budget: 0 }),
    "insights-life",
    "2026-10-04T00:00:00.000Z",
  );

describe("条件与实际变化展示", () => {
  it("展示已满足与缺失的所有条件，判定与正式引擎一致", () => {
    const state = born();
    state.skills.water = 2;
    state.relations.family = 4;
    state.flags = ["correspondence"];
    const cases: (Requirement[] | undefined)[] = [
      undefined,
      [],
      [{}],
      [
        { stat: "mana", min: 3 },
        { stat: "mana", min: 4 },
      ],
      [{ flag: "correspondence" }, { flag: "homeBuilt" }],
      [{ absent: "homeBuilt" }, { absent: "correspondence" }],
      [
        { skill: "water", min: 2 },
        { skill: "water", min: 3 },
      ],
      [
        { anySkill: ["fire", "water"], min: 2 },
        { anySkill: ["sword", "northSword"], min: 1 },
      ],
      [{ anySkill: [] }],
      [
        { relation: "family", min: 4 },
        { relation: "mentor", min: 1 },
      ],
      [
        { resource: "money", min: 30 },
        { resource: "supplies", min: 7 },
      ],
      [{ actor: "custom" }, { actor: "roxy" }],
      [
        {
          stat: "mana",
          min: 3,
          flag: "correspondence",
          absent: "homeBuilt",
          actor: "custom",
        },
      ],
    ];
    for (const requirements of cases) {
      const statuses = getRequirementStatuses(requirements, state);
      expect(statuses.every((status) => status.met)).toBe(
        checkRequirements(requirements, state).ok,
      );
    }
    const statuses = getRequirementStatuses(
      [{ stat: "mana", min: 3 }, { flag: "homeBuilt" }],
      state,
    );
    expect(statuses.map((status) => status.met)).toEqual([true, false]);
    expect(statuses[0].label).toContain("魔力");
    expect(statuses[1].label).toContain("安顿住所");
    const unknown = getRequirementStatuses(
      [{ flag: "untranslatedInternalFlag" }, { relation: "internalPerson" }],
      state,
    );
    expect(unknown.map((status) => status.label).join(" ")).not.toMatch(
      /untranslatedInternalFlag|internalPerson/,
    );
  });

  it("输出结算后的真实差异，遵守属性、技能、资源与关系边界", () => {
    const initial = born();
    const state: GameState = {
      ...initial,
      nodeId: "insights-boundary",
      stats: { ...initial.stats, insight: 98, mana: 100 },
      skills: { ...initial.skills, water: 6 },
      relations: { family: 99, allies: 1 },
      flags: ["correspondence"],
      money: 2,
      supplies: 1,
      injury: 3,
      guild: 5,
    };
    const before = structuredClone(state);
    const changes = getChoiceChanges(state, "insights-boundary:train");
    const labels = changes.map((change) => change.label).join("\n");
    expect(labels).toContain("悟性 +2（98 → 100）");
    expect(labels).not.toContain("魔力");
    expect(labels).toContain("水魔术 帝级 → 神级");
    expect(labels).toContain("北神流 未学习 → 中级");
    expect(labels).toContain("家人羁绊 +1（99 → 100）");
    expect(labels).toContain("盟友羁绊 -1（1 → 0）");
    expect(labels).toContain("旅费 -2（2 → 0）");
    expect(labels).toContain("补给 -1（1 → 0）");
    expect(
      changes.find((change) => change.label.startsWith("伤势"))?.tone,
    ).toBe("gain");
    expect(labels).toContain("公会履历 A → S");
    expect(labels).toContain("新增经历：病兆已处理");
    expect(labels).toContain("移除经历：长期通信约定");
    expect(
      changes.find((change) => change.label.includes("同伴牺牲"))?.tone,
    ).toBe("neutral");
    expect(labels).not.toMatch(/insights-boundary|一扇尚未推开的门|endingId/);
    expect(state).toEqual(before);
    expect(getChoiceChanges(state, "insights-boundary:locked")).toEqual([]);
    expect(getChoiceChanges(state, "不存在的选择")).toEqual([]);
    const capped = {
      ...state,
      skills: { ...state.skills, water: 7 },
      guild: 6,
    };
    const cappedLabels = getChoiceChanges(capped, "insights-boundary:train")
      .map((change) => change.label)
      .join("\n");
    expect(cappedLabels).not.toContain("水魔术");
    expect(cappedLabels).not.toContain("公会履历");
  });

  it("上一步变化只由完整合法历史重放取得，更新时间和旧文案不影响展示", () => {
    const state = born();
    const after = resolveChoice(state, "c1-start:1").state;
    const expected = getChoiceChanges(state, "c1-start:1");
    expect(getLastChoiceChanges(after)).toEqual(expected);
    const olderText = structuredClone(after);
    olderText.updatedAt = "2026-10-04T12:00:00.000Z";
    olderText.history[0].title = "旧标题";
    olderText.history[0].feedback = "旧版本措辞";
    expect(getLastChoiceChanges(olderText)).toEqual(expected);
    expect(getLastChoiceChanges(state)).toEqual([]);
  });

  it("不可重放的旧档安全省略变化，不修改记录或编造快照", () => {
    const after = resolveChoice(born(), "c1-start:1").state;
    const unknownChoice = structuredClone(after);
    unknownChoice.history[0].choiceId = "旧版本选择编号";
    const changedEffects = {
      ...after,
      stats: { ...after.stats, insight: after.stats.insight + 1 },
    };
    const wrongRoute = structuredClone(after);
    wrongRoute.history[0].nodeId = "c1-house";
    for (const oldState of [
      unknownChoice,
      changedEffects,
      wrongRoute,
      { ...after, step: 2 },
    ]) {
      const before = structuredClone(oldState);
      expect(getLastChoiceChanges(oldState)).toEqual([]);
      expect(oldState).toEqual(before);
    }
  });

  it("人生方向直接取10个生存终局真实条件，包含无条件隐退", () => {
    const state = born();
    const directions = getLifeDirections(state);
    expect(directions).toHaveLength(10);
    expect(directions.map((direction) => direction.ending.id).sort()).toEqual(
      ENDINGS.filter((ending) => ending.kind === "alive")
        .map((ending) => ending.id)
        .sort(),
    );
    for (const direction of directions) {
      const choice = STORY_BY_ID["c7-conclusion"].choices.find(
        (candidate) =>
          STORY_BY_ID[candidate.target]?.endingId === direction.ending.id,
      );
      expect(choice).toBeDefined();
      expect(direction.requirements).toEqual(
        getRequirementStatuses(choice?.requirements, state),
      );
      expect(direction.met).toBe(
        direction.requirements.filter((requirement) => requirement.met).length,
      );
      expect(direction.total).toBe(direction.requirements.length);
      expect(direction.ready).toBe(
        checkRequirements(choice?.requirements, state).ok,
      );
    }
    expect(
      directions.find((direction) => direction.ending.id === "end-retired"),
    ).toMatchObject({ requirements: [], met: 0, total: 0, ready: true });
  });
});
