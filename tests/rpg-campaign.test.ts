import { describe,it,expect } from 'vitest';
import { createCharacter,randomCharacter } from '../src/game/characters';
import { createRpg,endingOptions } from '../src/rpg/engine';
import { act,fullCampaign } from './rpg-helper';
describe('完整七章正式引擎通关',()=>{
 for(const actor of ['custom','rudeus','eris','sylphie','roxy'] as const)it(`${actor}零追加属性完成116场主线`,()=>{let s=fullCampaign(createRpg(createCharacter(actor,{budget:0}),`full-${actor}`,'2026-10-08T00:00:00.000Z'));expect(s.victories).toHaveLength(116);expect(endingOptions(s).find(e=>e.ending.id==='end-retired')?.ok).toBe(true);s=act(s,{type:'finish',endingId:'end-retired'});expect(s.status).toBe('alive');expect(s.receipts.length).toBe(116);},30000);
 it('随机配置完整通关，正式动作可到达全部生存结局',()=>{const base=fullCampaign(createRpg(randomCharacter(0),'random-rpg','2026-10-08T00:00:00.000Z'));for(const id of ['end-family','end-dragon','end-rebuild'])expect(act(base,{type:'finish',endingId:id}).endingId).toBe(id);const political=fullCampaign(createRpg(createCharacter('custom',{budget:0}),'political-rpg','2026-10-08T00:00:00.000Z'),{'rpg-alliance':'talk','rpg-legacy':'future','rpg-outcast':'guide'});for(const id of ['end-politics','end-traveler','end-defiant','end-retired','end-research'])expect(act(political,{type:'finish',endingId:id}).endingId).toBe(id);const teaching=fullCampaign(createRpg(createCharacter('custom',{budget:0}),'teaching-rpg','2026-10-08T00:00:00.000Z'),{'rpg-legacy':'teach'});for(const id of ['end-teacher','end-sword'])expect(act(teaching,{type:'finish',endingId:id}).endingId).toBe(id);},30000);
});
