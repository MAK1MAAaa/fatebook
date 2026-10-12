import { EQUIPMENT,CARDS,CARD_BY_ID } from '../src/rpg/cards';
import { ENCOUNTERS } from '../src/rpg/content';
import { resolveAction, chapterEvents, availableCompanions,chapterProgress,safeDeckPreset } from '../src/rpg/engine';
import { cardEffect } from '../src/rpg/combat';
import type { GameAction, RpgState } from '../src/rpg/types';
let recording:GameAction[]|null=null;
export function captureActions(actions:GameAction[]|null){recording=actions;}
export const act=(s:RpgState,a:GameAction)=>{const next=resolveAction(s,a,s.revision);recording?.push(structuredClone(a));return next;};
export function autoFight(initial:RpgState):RpgState {
 let s=initial;
 for(let rounds=0;rounds<100&&s.battle?.result==='playing';rounds++){
  let b=s.battle;
  const target=()=>s.battle!.enemies.filter(e=>e.hp>0).sort((a,b)=>a.hp-b.hp)[0]?.uid;
  if(s.companionId&&b.supportCooldown===0)s=act(s,{type:'support',target:target()});
  b=s.battle!;if(b.result!=='playing')break;
  if(b.hp<b.maxHp*.6&&b.potions>0)s=act(s,{type:'potion'});
  for(let plays=0;plays<40&&s.battle?.result==='playing';plays++){
   b=s.battle!;
   const incoming=b.enemies.filter(e=>e.hp>0&&e.intent.kind==='attack').reduce((n,e)=>n+(e.intent.amount+(s.chapter-1))*(e.intent.hits??1)*(b.statuses.vulnerable>0?1.5:1),0);
   const candidates=b.hand.map(uid=>{const owned=s.collection.find(c=>c.uid===uid)!;const e=cardEffect(s,owned);try{const next=resolveAction(s,{type:'playCard',uid,target:target()},s.revision);const nb=next.battle!;const dealt=b.enemies.reduce((n,x)=>n+x.hp,0)-nb.enemies.reduce((n,x)=>n+x.hp,0);const score=dealt*.8+Math.min(e.block??0,Math.max(0,incoming-b.block))*1.2+Math.min(e.heal??0,b.maxHp-b.hp)*1.05+(e.burn??0)*3+(e.weak??0)*(incoming>0?4:1)+(e.vulnerable??0)*2+(e.draw??0)*4+(e.energy??0)*7;return{uid,score};}catch{return null;}}).filter(x=>x!==null).sort((a,b)=>b.score-a.score);
   if(!candidates.length||candidates[0].score<=0)break;s=act(s,{type:'playCard',uid:candidates[0].uid,target:target()});
  }
  if(s.battle?.result==='playing')s=act(s,{type:'endTurn'});
 }
 if(s.battle?.result!=='won')throw new Error(`未获胜 ${s.battle?.encounterId} turn=${s.battle?.turn} hp=${s.battle?.hp} enemy=${s.battle?.enemies.map(e=>e.hp).join(',')}`);
 return s;
}
export function resolveEvents(s:RpgState,overrides:Record<string,string>={}):RpgState {for(const e of chapterEvents(s)){if(!s.resolvedEvents.includes(e.id))s=act(s,{type:'event',eventId:e.id,choiceId:overrides[e.id]??e.choices[0].id});}const companion=availableCompanions(s)[0];if(companion)s=act(s,{type:'setCompanion',companionId:companion.id});return s;}

export function prepare(s:RpgState):RpgState {for(const gear of EQUIPMENT.filter(e=>e.chapter===s.chapter)){if(s.money>=gear.price&&!s.ownedEquipment.includes(gear.id))s=act(s,{type:'buyEquipment',equipmentId:gear.id});}for(const skill of ['waterSword','healing','sword'] as const){while(s.skills[skill]<Math.min(4,s.chapter)){const cost=s.skills[skill]===0?12:25+s.skills[skill]*12;if(s.money<cost)break;s=act(s,{type:'train',skill});}}
 const wanted=CARDS.filter(c=>['waterSword','healing','sword'].includes(c.school)&&c.rank<=s.skills[c.school as 'sword']&&['sword-1','sword-3','sword-5','waterSword-1','waterSword-4','waterSword-7','waterSword-8','healing-5','healing-8'].includes(c.id));for(const c of wanted){while(s.collection.filter(own=>own.cardId===c.id).length<2&&s.money>=18+c.rank*8)s=act(s,{type:'buyCard',cardId:c.id});}for(const card of s.collection.filter(c=>!c.upgraded&&(CARD_BY_ID[c.cardId].effect.damage||CARD_BY_ID[c.cardId].effect.heal))){if(s.money<25+s.chapter*5)break;s=act(s,{type:'upgradeCard',uid:card.uid});}return act(s,{type:'setDeck',deck:safeDeckPreset(s,'balanced')});}
export function fullCampaign(state:RpgState,overrides:Record<string,string>={},optional=false):RpgState {let s=state;for(let c=1;c<=7;c++){s=resolveEvents(s,overrides);s=prepare(s);for(const e of ENCOUNTERS.filter(e=>e.chapter===c&&(optional||!e.optional))){if(!s.acceptedQuests.includes(e.questId))s=act(s,{type:'acceptQuest',questId:e.questId});if(e.goal==='rescue')s=act(s,{type:'setDeck',deck:safeDeckPreset(s,'attack')});s=autoFight(act(s,{type:'startBattle',encounterId:e.id}));s=act(s,{type:'claimReward',cardId:s.reward?.choices[0]??null});if(e.index%3===0)s=prepare(s);}const progress=chapterProgress(s);if(progress.done!==progress.total||progress.events!==0)throw new Error('章节未完成');if(c<7)s=act(s,{type:'nextChapter'});}return s;}
