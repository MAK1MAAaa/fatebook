import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTENT_VERSION, ENDINGS, STORY_BY_ID } from "../src/content";
import { createGame, renderBody, resolveChoice } from "../src/game/engine";
import type { ActorId, CharacterConfig, GameState } from "../src/game/types";
import { witness } from "./witness-helper";

interface EndingWitness {
  endingId: string;
  actor: ActorId;
  character: CharacterConfig;
  choiceIds: string[];
  finalEndingId: string;
  decisionCount: number;
  renderedDecisionCharacters: number;
  renderedEndingCharacters: number;
  renderedCharacterCount: number;
}
interface WitnessDocument {
  schemaVersion: number;
  contentVersion: string;
  countDefinition: string;
  witnesses: EndingWitness[];
}
const file = new URL("../docs/ending-witnesses.json", import.meta.url);
const epoch = "2026-10-02T00:00:00.000Z";
const bodyCharacters = (state: GameState) =>
  Array.from(renderBody(STORY_BY_ID[state.nodeId], state).replace(/\s/gu, ""))
    .length;

function replay(character: CharacterConfig, choiceIds: string[]) {
  let state = createGame(character, "witness-replay", epoch);
  let renderedDecisionCharacters = 0;
  for (const choiceId of choiceIds) {
    renderedDecisionCharacters += bodyCharacters(state);
    state = resolveChoice(state, choiceId, state.step).state;
  }
  const renderedEndingCharacters = bodyCharacters(state);
  return {
    state,
    renderedDecisionCharacters,
    renderedEndingCharacters,
    renderedCharacterCount:
      renderedDecisionCharacters + renderedEndingCharacters,
  };
}

// Opt in when intentionally regenerating the deliverable after story changes.
if (process.env.GENERATE_ENDING_WITNESSES === "1") {
  const witnesses = ENDINGS.map((ending): EndingWitness => {
    const actor = ending.id === "dead-illness" ? "roxy" : "custom";
    const result = witness(ending.id, actor);
    const choiceIds = result.history.map((entry) => entry.choiceId);
    const replayed = replay(result.character, choiceIds);
    if (!replayed.state.endingId) throw new Error(`路线未达终局：${ending.id}`);
    return {
      endingId: ending.id,
      actor,
      character: result.character,
      choiceIds,
      finalEndingId: replayed.state.endingId,
      decisionCount: replayed.state.step,
      renderedDecisionCharacters: replayed.renderedDecisionCharacters,
      renderedEndingCharacters: replayed.renderedEndingCharacters,
      renderedCharacterCount: replayed.renderedCharacterCount,
    };
  });
  const document: WitnessDocument = {
    schemaVersion: 1,
    contentVersion: CONTENT_VERSION,
    countDefinition:
      "渲染正文去除空白后的可见字符数，包含姓名、年龄、身份补充和结局正文及标点；不含按钮、选择反馈、界面和历史记录。配置使用合法60点预算，过程只调用createGame与resolveChoice。",
    witnesses,
  };
  writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`, "utf8");
}

const document = JSON.parse(readFileSync(file, "utf8")) as WitnessDocument;
describe("可交付结局见证文件", () => {
  it("剧情版本和18个结局完整对应", () => {
    expect(document.schemaVersion).toBe(1);
    expect(document.contentVersion).toBe(CONTENT_VERSION);
    expect(document.witnesses.map((route) => route.endingId).sort()).toEqual(
      ENDINGS.map((ending) => ending.id).sort(),
    );
    expect(
      new Set(document.witnesses.map((route) => route.endingId)).size,
    ).toBe(18);
  });

  for (const route of document.witnesses)
    it(`重放文件中 ${route.endingId} 的选择顺序和字数`, () => {
      expect(route.actor).toBe(route.character.actor);
      expect(route.character.budget).toBe(60);
      const result = replay(route.character, route.choiceIds);
      expect(result.state.endingId).toBe(route.endingId);
      expect(result.state.endingId).toBe(route.finalEndingId);
      expect(result.state.step).toBe(route.decisionCount);
      expect(route.choiceIds).toHaveLength(route.decisionCount);
      expect(result.state.status).toBe(
        ENDINGS.find((ending) => ending.id === route.endingId)?.kind,
      );
      expect(result.renderedDecisionCharacters).toBe(
        route.renderedDecisionCharacters,
      );
      expect(result.renderedEndingCharacters).toBe(
        route.renderedEndingCharacters,
      );
      expect(result.renderedCharacterCount).toBe(route.renderedCharacterCount);
    });
});
