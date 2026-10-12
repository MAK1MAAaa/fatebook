import { describe, expect, it } from "vitest";
import { createCharacter } from "../src/game/characters";
import { createGame } from "../src/game/engine";
import type { ActorId } from "../src/game/types";
import { witness } from "./witness-helper";

describe("留守路线的家庭人生", () => {
  for (const actor of ["custom", "sylphie"] satisfies ActorId[]) {
    it(`${actor} 可以留守北部、建立家园并到达家人守望`, () => {
      const initial = createGame(
        createCharacter(actor, { budget: 0 }),
        `family-stay-${actor}`,
        "2026-10-04T00:00:00.000Z",
      );
      const state = witness("end-family", actor, initial, {
        "c4-school": "c4-school:stay",
      });

      expect(state.status).toBe("alive");
      expect(state.endingId).toBe("end-family");
      expect(
        state.history.some((entry) => entry.choiceId === "c4-school:stay"),
      ).toBe(true);
      expect(state.history.map((entry) => entry.nodeId)).not.toContain(
        "c4-labyrinth",
      );
      expect(state.history.map((entry) => entry.nodeId)).not.toContain(
        "c4-rescue",
      );
      expect(state.flags).not.toContain("rescueComplete");
      expect(state.flags).toEqual(
        expect.arrayContaining(["homeBuilt", "relationsRepaired"]),
      );
      expect(state.history.at(-1)?.choiceId).toBe("c7-conclusion:family");
    });
  }
});
