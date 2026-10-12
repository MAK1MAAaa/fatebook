import { describe,it,expect } from 'vitest';
import { createCharacter } from '../src/game/characters';
import { createRpg, resolveAction, validateDeck, chapterProgress } from '../src/rpg/engine';
import { CARDS, COMPANIONS, EQUIPMENT } from '../src/rpg/cards';
import { ENEMIES,BOSSES } from '../src/rpg/enemies';
import { ENCOUNTERS, QUESTS, EVENTS } from '../src/rpg/content';
import { act,autoFight,resolveEvents } from './rpg-helper';
const born=()=>createRpg(createCharacter('custom',{budget:0}),'rpg-vertical','2026-10-08T00:00:00.000Z');
describe('2.0卡牌与第一章完整链',()=>{
 it('内容配额、引用与身份专属记忆齐全',()=>{expect(CARDS).toHaveLength(96);expect(ENEMIES).toHaveLength(32);expect(BOSSES).toHaveLength(14);expect(COMPANIONS).toHaveLength(10);expect(EQUIPMENT).toHaveLength(21);expect(ENCOUNTERS.filter(e=>!e.optional)).toHaveLength(116);expect(ENCOUNTERS.filter(e=>e.optional)).toHaveLength(28);expect(ENCOUNTERS.filter(e=>e.boss)).toHaveLength(14);expect([...new Set(ENCOUNTERS.flatMap(e=>e.enemies))].sort()).toEqual([...ENEMIES,...BOSSES].map(e=>e.id).sort());for(const actor of ['custom','rudeus','eris','sylphie','roxy'])expect(EVENTS.filter(e=>e.actor===actor)).toHaveLength(8);for(const e of ENCOUNTERS){expect(QUESTS.some(q=>q.id===e.questId)).toBe(true);for(const id of e.requires)expect(ENCOUNTERS.find(p=>p.id===id)?.index).toBeLessThan(e.index);}});
 it('零加点可经正式引擎完成第一章并领取一次奖励',()=>{let s=resolveEvents(born());for(const e of ENCOUNTERS.filter(e=>e.chapter===1&&!e.optional)){if(!s.acceptedQuests.includes(e.questId))s=act(s,{type:'acceptQuest',questId:e.questId});s=autoFight(act(s,{type:'startBattle',encounterId:e.id}));s=act(s,{type:'claimReward',cardId:s.reward?.choices[0]??null});expect(()=>act(s,{type:'claimReward',cardId:null})).toThrow();}expect(chapterProgress(s)).toEqual({done:8,total:8,events:0});expect(act(s,{type:'nextChapter'}).chapter).toBe(2);});
 it('同一输入确定、过期提交被拒绝且原状态不变',()=>{const s=born(),a={type:'event' as const,eventId:'rpg-language',choiceId:'demon'};const next=act(s,a);expect(act(s,a)).toEqual(next);expect(s.revision).toBe(0);expect(()=>resolveAction(next,a,0)).toThrow('动作已结算');});
 it('非法牌组与没有二次确认的死亡被拒绝',()=>{const s=born();expect(()=>validateDeck(s,s.deck.slice(0,14))).toThrow();expect(()=>validateDeck(s,[...s.deck.slice(0,17),s.deck[0]])).toThrow();expect(()=>act(s,{type:'finish',endingId:'dead-childhood'})).toThrow('二次确认');const dead=act(s,{type:'finish',endingId:'dead-childhood',confirmed:true});expect(dead.status).toBe('dead');expect(()=>act(dead,{type:'nextChapter'})).toThrow('封存');});
});
