import { describe, expect, it, vi } from 'vitest';
import { CHARACTERS, combatDecisions, FIXED_RANDOM_CHARACTER, runSimulation } from '../scripts/rpg-balance';
import { createRpg, resolveAction } from '../src/rpg/engine';
import { CURRENT_RULESET, LEGACY_RULESET } from '../src/rpg/rulesets';

const spec = { character: 'custom', style: 'balanced' as const, seed: 'paired-01', policy: 'heuristic' as const, ruleset: CURRENT_RULESET, scope: 'chapter-one' as const };

describe('无界面政策与正式引擎的可复现边界', () => {
  it('固定实例不依赖全局随机数或当前时间，重复动作与指标完全一致', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('hidden RNG'); });
    const now = vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('hidden clock'); });
    try {
      const one = runSimulation(spec), two = runSimulation(spec);
      expect(one.result).toEqual(two.result);
      expect(one.state).toEqual(two.state);
      expect(one.result.outcome).toBe('won');
      expect(one.result.battles).toHaveLength(8);
    } finally { random.mockRestore(); now.mockRestore(); }
  });

  it('规则、政策与实验范围不改变配对人生种子，随机配置零追加属性', () => {
    const current = runSimulation(spec).result;
    const old = runSimulation({ ...spec, ruleset: LEGACY_RULESET }).result;
    const entry = runSimulation({ ...spec, policy: 'entry' }).result;
    expect(current.gameSeed).toBe(old.gameSeed);
    expect(current.gameSeed).toBe(entry.gameSeed);
    expect(FIXED_RANDOM_CHARACTER).toMatchObject({ budget: 0, randomized: true, race: 'beast', origin: 'forest' });
    for (const character of Object.values(CHARACTERS)) expect(character.budget).toBe(0);
  });

  it('政策候选不修改状态、RNG或收藏，所有候选能通过正式动作校验', () => {
    const trace: NonNullable<Parameters<typeof runSimulation>[1]>['trace'] = [];
    runSimulation(spec, { trace });
    let state = createRpg(CHARACTERS.custom, 'balance:custom:balanced:paired-01', '2026-10-12T00:00:00.000Z', CURRENT_RULESET);
    for (const row of trace) {
      if (state.battle?.result === 'playing') {
        const before = structuredClone(state);
        const candidates = combatDecisions(state, 'heuristic');
        expect(state).toEqual(before);
        for (const candidate of candidates) expect(() => resolveAction(state, candidate.action, state.revision)).not.toThrow();
      }
      state = resolveAction(state, row.chosen, state.revision);
      expect(state.battle?.rng ?? null).toBe(row.after.rng);
      expect(state.revision).toBe(row.after.revision);
    }
    expect(state.victories).toHaveLength(8);
  });
});
