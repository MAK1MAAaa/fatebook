import { describe, expect, it } from 'vitest';
import { createCharacter } from '../src/game/characters';
import { createRpg, shopPrice, availableCompanions, canLearnCard } from '../src/rpg/engine';
import { CARD_BY_ID } from '../src/rpg/cards';
import { ENCOUNTERS, ENCOUNTER_BY_ID, QUESTS, EVENTS } from '../src/rpg/content';
import { createBattle, enemyIntent, endTurn, playCard, emptyStatuses, cardEffect,intentAmount } from '../src/rpg/combat';
import { ENEMY_BY_ID } from '../src/rpg/enemies';
import { validateRpg } from '../src/rpg/storage';

const born = () => createRpg(createCharacter('custom', { budget: 0 }), 'rules', '2026-10-08T00:00:00.000Z');
function battle(id = 'c1-main-1') { const s = born(); s.chapter = ENCOUNTER_BY_ID[id].chapter; s.scene = 'battle'; s.battle = createBattle(s, id); return s; }

describe('卡牌规则与跨章后果', () => {
  it('任务依赖无循环、可选任务独立、第一章八场非致命教学', () => {
    const visited = new Set<string>(), visiting = new Set<string>();
    function visit(id: string) {
      expect(visiting.has(id), `循环：${id}`).toBe(false);
      if (visited.has(id)) return;
      visiting.add(id);
      const e = ENCOUNTER_BY_ID[id];
      for (const parent of e.requires) { expect(ENCOUNTER_BY_ID[parent].chapter).toBe(e.chapter); visit(parent); }
      visiting.delete(id); visited.add(id);
    }
    for (const e of ENCOUNTERS) { visit(e.id); if (e.optional) expect(e.requires).toEqual([]); }
    expect(visited.size).toBe(144);expect(new Set(ENCOUNTERS.map(e=>JSON.stringify([e.enemies,e.modifier,e.goal,e.rounds]))).size).toBe(144);
    for (const q of QUESTS) expect(q.encounters.every(id => ENCOUNTER_BY_ID[id].questId === q.id)).toBe(true);
    for (const e of EVENTS) { expect(e.summary.length).toBeLessThanOrEqual(120); expect(e.choices.length).toBeGreaterThan(0); }
  });

  it('相同牌组仅改变编辑顺序仍保持完全相同的随机结果',()=>{const s=born(),initial=createBattle(s,'c1-main-1');s.deck.reverse();expect(createBattle(s,'c1-main-1')).toEqual(initial);});

  it('刚施加的1回合虚弱保留到主角出牌阶段，攻击固定降低', () => {
    const s = battle(); const b = s.battle!;
    b.enemies[0].intent = { kind: 'weak', amount: 1, label: '牵制' };
    endTurn(s); expect(b.statuses.weak).toBe(1);
    const uid = s.deck.find(id => s.collection.find(c => c.uid === id)?.cardId === 'neutral-1')!;
    b.hand = [uid]; b.drawPile = []; b.discard = []; b.enemies[0].block = 0;
    const damage = cardEffect(s, s.collection.find(c => c.uid === uid)!).damage!;
    const hp = b.enemies[0].hp; playCard(s, uid, 'enemy-0');
    expect(hp - b.enemies[0].hp).toBe(Math.floor(damage * .75));
    b.enemies[0].intent = { kind: 'guard', amount: 0, label: '等待' };
    endTurn(s); expect(b.statuses.weak).toBe(0);
  });

  it('保留牌留下、观察牌消耗，满手牌时抽牌也会先腾出出牌位置', () => {
    const s = battle(), b = s.battle!;
    const observe = s.collection.find(c => c.cardId === 'neutral-3')!.uid;
    const retained = { uid: 'retained', cardId: 'neutral-8', upgraded: false };
    s.collection.push(retained); s.deck.push(retained.uid);
    b.hand = [observe, retained.uid, ...s.deck.filter(id => id !== observe && id !== retained.uid).slice(0,8)];
    b.drawPile = s.deck.filter(id => !b.hand.includes(id));
    playCard(s, observe);
    expect(b.hand.length).toBe(10); expect(b.exhausted).toContain(observe);
    endTurn(s); expect(b.hand).toContain(retained.uid); expect(b.hand).not.toContain(observe);
    expect([...b.hand,...b.drawPile,...b.discard,...b.exhausted].sort()).toEqual([...s.deck].sort());
  });

  it('首领半血立即换招，龙神采用撤离目标，仪式失控算战败', () => {
    const s = battle('c7-main-9'), enemy = s.battle!.enemies[0], def = ENEMY_BY_ID[enemy.definitionId];
    enemy.hp = Math.floor(enemy.maxHp * .5);
    expect(enemyIntent(enemy, 1)).toEqual(def.phase!.pattern[0]); expect(enemy.phase).toBe(1);
    expect(ENCOUNTER_BY_ID['c3-main-18'].goal).toBe('survive');
    s.battle!.ritual = 7; enemy.intent = { kind: 'ritual', amount: 2, label: '仪式' };
    endTurn(s); expect(s.battle!.result).toBe('lost'); expect(s.status).toBe('active');
  });

  it('烧灼最后一层仍抑制再生，迷宫准备与协作改变实际战斗', () => {
    const s = battle('c4-main-9'), e = s.battle!.enemies[0]; e.hp -= 80;
    e.statuses.burn = 1; e.intent = { kind: 'heal', amount: 20, label: '再生' };
    const hp = e.hp; endTurn(s); expect(e.hp).toBe(hp - 1 + 10);
    const prepared = born(); prepared.chapter = 4; prepared.flags = ['hydraCounterKnown','teamwork','languageBeast'];
    const escort = createBattle(prepared, 'c4-main-6'); expect(escort.escortHp).toBe(255);
  });

  it('语言影响灾后首回合与价格，被排斥者援助解锁同伴与协作牌', () => {
    const s = born(); s.chapter = 3;
    const before = shopPrice(s,100); s.flags.push('languageDemon');
    expect(shopPrice(s,100)).toBeLessThan(before);
    expect(createBattle(s,'c3-main-1').enemies[0].statuses.weak).toBe(1);
    expect(canLearnCard(s,CARD_BY_ID['identity-alliance'])).toBe(false);
    s.flags.push('superdTrust');
    expect(availableCompanions(s).some(c=>c.id==='ruijerd')).toBe(true);
    expect(canLearnCard(s,CARD_BY_ID['identity-alliance'])).toBe(true);
    for (const actor of ['rudeus','eris','sylphie','roxy'] as const) {
      const own = createRpg(createCharacter(actor,{budget:0})); own.chapter=7;
      expect(availableCompanions(own).some(c=>c.actor===actor)).toBe(false);
    }
  });

  it('意图显示预计伤害与实际连击一致，限时救援超过回合算战败',()=>{const s=battle('c2-main-1'),b=s.battle!;b.enemies=b.enemies.slice(0,1);const e=b.enemies[0];e.intent={kind:'attack',amount:20,hits:2,label:'连击'};e.statuses.weak=1;b.statuses.vulnerable=2;b.block=0;const expected=intentAmount(s,e),hp=b.hp;endTurn(s);expect(hp-b.hp).toBe(expected*2);const rescue=battle('c3-main-13');rescue.battle!.turn=10;rescue.battle!.enemies.forEach(e=>e.intent={kind:'guard',amount:1,label:'防守'});endTurn(rescue);expect(rescue.battle!.result).toBe('lost');expect(rescue.battle!.log.at(-1)).toContain('时限');});

  it('缺失成长属性、未知任务和玩家自己的同伴被隔离', () => {
    const s=born(); delete (s.stats as Partial<typeof s.stats>).mana;
    expect(()=>validateRpg(s)).toThrow('字段缺失');
    const wrong=born(); wrong.acceptedQuests=['missing']; expect(()=>validateRpg(wrong)).toThrow('任务引用');
    const self=createRpg(createCharacter('roxy',{budget:0})); self.chapter=2; self.companionId='roxy';
    expect(()=>validateRpg(self)).toThrow('同伴记录');
    expect(emptyStatuses()).toEqual({burn:0,weak:0,vulnerable:0});
  });
});
