import { createGame, checkRequirements, SKILL_KEYS } from '../game/engine';
import { ENDINGS } from '../content';
import { STAT_KEYS, type CharacterConfig, type Effects, type Requirement, type SkillId } from '../game/types';
import { COMPANIONS } from './cards';
import { cardFor, cardsFor, equipmentFor, rulesetVersion, CURRENT_RULESET, LEGACY_RULESET } from './rulesets';
import { CHAPTER_INFO, DEATH_CHAPTER, ENCOUNTERS, ENCOUNTER_BY_ID, EVENTS, EVENT_BY_ID, QUEST_BY_ID } from './content';
import { createBattle, endTurn, hashSeed, playCard, drinkPotion, activateSupport, cardEffect } from './combat';
import type { CardDefinition, GameAction, RpgState, OwnedCard, RulesetVersion } from './types';
const clamp=(n:number,max:number)=>Math.max(0,Math.min(max,n));
export function canLearnCard(state:RpgState,card:CardDefinition):boolean{if(card.id==='identity-alliance'&&!state.flags.includes('superdTrust')&&!state.flags.includes('dragonPact'))return false;return card.school==='neutral'||(card.school==='identity'?(!card.actor||card.actor===state.character.actor)&&state.chapter>=card.rank:(state.skills[card.school]??0)>=card.rank);}
function addCard(state:RpgState,id:string){const card=cardFor(state,id);if(!card||!canLearnCard(state,card)||state.collection.filter(c=>c.cardId===id).length>=3)return;state.collection.push({uid:`${state.id}:card:${state.revision}:${state.collection.length}`,cardId:id,upgraded:false});}
export function createRpg(character:CharacterConfig,id?:string,now=new Date().toISOString(),version:RulesetVersion=CURRENT_RULESET):RpgState {
 rulesetVersion({rulesetVersion:version});
 const base=createGame(character,id,now),starter=['neutral-1','neutral-1','neutral-1','neutral-2','neutral-2','neutral-2','neutral-4','neutral-4','neutral-4','neutral-10','neutral-10','neutral-10','neutral-3','neutral-3','neutral-6','neutral-6','neutral-13','neutral-13'];
 // The shared engine handles browsers without randomUUID on HTTP origins.
 // Derive the seed and card IDs from its actual ID, including fallback IDs.
 const state:RpgState={...base,version:2,rulesetVersion:version,revision:0,seed:hashSeed(base.id),chapter:1,nodeId:'rpg-hub-1',scene:'hub',collection:starter.map((cardId,i)=>({uid:`${base.id}:card:start:${i}`,cardId,upgraded:false})),deck:[],companionId:null,equipment:{},ownedEquipment:[],acceptedQuests:[],victories:[],claimedRewards:[],receipts:[],resolvedEvents:[],battle:null,reward:null,battleAttempts:{},xp:0};state.deck=state.collection.map(c=>c.uid);return state;
}
export function validateDeck(state:RpgState,deck:string[]):void {if(deck.length<15||deck.length>25||new Set(deck).size!==deck.length)throw new Error('牌组须为15–25张，不可重复放入同一张实体牌。');const counts:Record<string,number>={};for(const uid of deck){const own=state.collection.find(c=>c.uid===uid);if(!own||!canLearnCard(state,cardFor(state,own.cardId)))throw new Error('牌组包含未拥有或尚未学会的卡牌。');counts[own.cardId]=(counts[own.cardId]??0)+1;if(counts[own.cardId]>3)throw new Error('同一基础卡牌最多放入3张。');}}
export function chapterEvents(state:RpgState){return EVENTS.filter(e=>e.chapter===state.chapter&&(!e.actor||e.actor===state.character.actor));}
export function availableCompanions(state:RpgState){return COMPANIONS.filter(c=>c.chapter<=state.chapter&&c.actor!==state.character.actor&&(!c.requiredFlag||state.flags.includes(c.requiredFlag)));}
export function availableEncounters(state:RpgState){return ENCOUNTERS.filter(e=>e.chapter===state.chapter&&state.acceptedQuests.includes(e.questId)&&e.requires.every(id=>state.victories.includes(id))&&!state.victories.includes(e.id));}
export function chapterProgress(state:RpgState){const ids=ENCOUNTERS.filter(e=>e.chapter===state.chapter&&!e.optional).map(e=>e.id);return {done:ids.filter(id=>state.victories.includes(id)).length,total:ids.length,events:chapterEvents(state).filter(e=>!state.resolvedEvents.includes(e.id)).length};}
export const ENDING_REQUIREMENTS:Record<string,Requirement[]>={
 'end-family':[{flag:'sharedHome'},{flag:'relationshipRepaired'}],
 'end-dragon':[{flag:'dragonPact'},{flag:'allianceVictory'}],
 'end-teacher':[{flag:'curriculum'},{flag:'independentGraduates'},{anySkill:['fire','water','earth','wind','healing'],min:1}],
 'end-sword':[{flag:'swordTrial'},{flag:'heirTrained'},{anySkill:['sword','waterSword','northSword'],min:1}],
 'end-research':[{flag:'prototype'},{flag:'independentVerified'}],
 'end-rebuild':[{flag:'residentsSettled'},{flag:'rebuildFund'},{flag:'tradeRoutes'}],
 'end-politics':[{flag:'stableSuccession'},{flag:'peaceTerms'},{flag:'civilianProtection'}],
 'end-traveler':[{flag:'travelLog'},{flag:'tradeRoutes'}],
 'end-retired':[],
 'end-defiant':[{flag:'conspiracyExposed'},{flag:'heirProtected'},{flag:'dragonPact'},{flag:'allianceVictory'}],
};
export function endingOptions(state:RpgState){return ENDINGS.filter(e=>e.kind==='alive').map(ending=>({ending,...checkRequirements(ENDING_REQUIREMENTS[ending.id],state)}));}
function effects(state:RpgState,value:Effects){for(const key of STAT_KEYS)state.stats[key]=clamp(state.stats[key]+(value.stats?.[key]??0),100);for(const key of SKILL_KEYS)state.skills[key]=clamp(state.skills[key]+(value.skills?.[key]??0),7);for(const [id,n] of Object.entries(value.relations??{}))state.relations[id]=clamp((state.relations[id]??0)+n,100);state.flags=[...new Set([...state.flags.filter(f=>!value.removeFlags?.includes(f)),...(value.flags??[])])];state.money=Math.max(0,state.money+(value.money??0));state.supplies=Math.max(0,state.supplies+(value.supplies??0));state.guild=clamp(state.guild+(value.guild??0),6);state.injury=clamp(state.injury+(value.injury??0),100);}
function addHistory(state:RpgState,nodeId:string,title:string,choiceId:string,choice:string,feedback:string){state.history.push({nodeId,title,choiceId,choice,feedback,year:state.year,age:state.age});state.step++;}
function camp(state:RpgState){if(state.scene!=='hub'&&state.battle?.result!=='lost')throw new Error('请先结束当前战斗或领取奖励。');}
function spend(state:RpgState,amount:number){if(state.money<amount)throw new Error(`旅费不足，需要${amount}。`);state.money-=amount;}
export function firstVictoryRewards(state:RpgState,encounterId:string):string[]{
 const encounter=ENCOUNTER_BY_ID[encounterId];
 if(rulesetVersion(state)===LEGACY_RULESET)return [...new Set([...encounter.cardRewards,...cardsFor(state).filter(c=>canLearnCard(state,c)).filter(c=>c.school!=='neutral').map(c=>c.id)])].filter(id=>canLearnCard(state,cardFor(state,id))&&state.collection.filter(c=>c.cardId===id).length<3).slice(0,3);
 const deck=state.deck.map(uid=>state.collection.find(c=>c.uid===uid)!).filter(Boolean).map(owned=>cardFor(state,owned.cardId));
 const mechanism=(c:CardDefinition)=>[!!c.effect.draw,!!c.effect.energy,!!c.effect.burn,!!(c.effect.weak||c.effect.vulnerable),!!c.effect.cleanse];
 const present=[0,1,2,3,4].map(i=>deck.some(c=>mechanism(c)[i]));
 const pool=cardsFor(state).filter(c=>canLearnCard(state,c)&&state.collection.filter(own=>own.cardId===c.id).length<3);
 const score=(c:CardDefinition)=>{const owned=state.collection.filter(own=>own.cardId===c.id).length;return [12,4,0][owned]+(deck.filter(d=>d.school===c.school).length>=2?8:0)+(mechanism(c).some((has,i)=>has&&!present[i])?6:0)+(encounter.cardRewards.includes(c.id)?3:0)+c.rank;};
 pool.sort((a,b)=>score(b)-score(a)||hashSeed(`${state.seed}:${encounterId}:reward:${a.id}`)-hashSeed(`${state.seed}:${encounterId}:reward:${b.id}`)||a.id.localeCompare(b.id));
 const category=(c:CardDefinition)=>c.effect.damage||c.effect.burn?'attack':c.effect.block||c.effect.heal?'guard':'utility';
 const chosen:CardDefinition[]=[];
 for(const kind of ['attack','guard','utility']){const card=pool.find(c=>category(c)===kind);if(card)chosen.push(card);}
 for(const card of pool){if(chosen.length>=3)break;if(!chosen.includes(card))chosen.push(card);}
 return chosen.map(c=>c.id);
}
function settleBattle(state:RpgState,previous:RpgState){const b=state.battle;if(!b||b.result!=='won'||previous.battle?.result==='won')return;const encounter=ENCOUNTER_BY_ID[b.encounterId];if(state.claimedRewards.includes(encounter.id))return;state.scene='reward';state.reward={encounterId:encounter.id,choices:firstVictoryRewards(state,encounter.id)};}
export function resolveAction(previous:RpgState,action:GameAction,expectedRevision:number):RpgState{
 rulesetVersion(previous);if(previous.status!=='active')throw new Error('这段人生已封存，不能继续操作。');if(expectedRevision!==previous.revision)throw new Error('动作已结算或其他页面更新了存档，请重新读取。');const state=structuredClone(previous);
 switch(action.type){
 case 'migrateRuleset': {if(action.confirmed!==true)throw new Error('规则更新需要明确确认。');if(state.scene!=='hub'||state.battle!==null||state.reward!==null)throw new Error('请回到地区并结算战斗和奖励后再更新规则。');if(rulesetVersion(state)!==LEGACY_RULESET)throw new Error('当前已经使用优化规则。');state.rulesetVersion=CURRENT_RULESET;break;}
 case 'acceptQuest': {camp(state);const q=QUEST_BY_ID[action.questId];if(!q||q.chapter!==state.chapter)throw new Error('任务不在当前章节。');if(state.acceptedQuests.includes(q.id))throw new Error('已经接受该任务。');state.acceptedQuests.push(q.id);break;}
 case 'startBattle': {camp(state);const e=ENCOUNTER_BY_ID[action.encounterId];if(!e||e.chapter!==state.chapter)throw new Error('当前不能进入这场遭遇。');if(!state.resolvedEvents.includes('rpg-learning'))throw new Error('先完成第一位导师的基础教学。');if(!state.acceptedQuests.includes(e.questId)||!e.requires.every(id=>state.victories.includes(id)))throw new Error('先接受任务并完成前置遭遇。');if(state.victories.includes(e.id)&&!action.practice)throw new Error('任务已经完成，可改为无奖励练习。');validateDeck(state,state.deck);state.battle=createBattle(state,e.id);state.scene='battle';state.battleAttempts[e.id]=(state.battleAttempts[e.id]??0)+1;break;}
 case 'playCard': if(state.scene!=='battle'||!state.battle)throw new Error('当前不在战斗中。');playCard(state,action.uid,action.target);break;
 case 'endTurn': if(state.scene!=='battle'||!state.battle)throw new Error('当前不在战斗中。');endTurn(state);break;
 case 'support': if(state.scene!=='battle'||!state.battle)throw new Error('当前不在战斗中。');activateSupport(state,action.target);break;
 case 'potion': if(state.scene!=='battle'||!state.battle)throw new Error('当前不在战斗中。');drinkPotion(state);break;
 case 'retryBattle': {if(state.battle?.result!=='lost')throw new Error('只有战败后才能重试。');validateDeck(state,state.deck);const id=state.battle.encounterId;state.battle=createBattle(state,id);state.battleAttempts[id]=(state.battleAttempts[id]??0)+1;state.scene='battle';break;}
 case 'returnHub': if(state.battle?.result==='playing'||state.scene==='reward')throw new Error('战斗或奖励尚未结算。');state.battle=null;state.scene='hub';break;
 case 'claimReward': {const reward=state.reward,b=state.battle;if(state.scene!=='reward'||!reward||!b||b.result!=='won'||state.claimedRewards.includes(reward.encounterId))throw new Error('奖励已经领取或当前没有奖励。');if(action.cardId!==null&&!reward.choices.includes(action.cardId))throw new Error('请选择本次提供的卡牌。');const e=ENCOUNTER_BY_ID[reward.encounterId];state.money+=e.reward+(action.cardId===null?12:0);if(action.cardId)addCard(state,action.cardId);state.xp+=e.boss?30:10;state.victories.push(e.id);state.claimedRewards.push(e.id);state.receipts.push({encounterId:e.id,turns:b.turn,played:b.played,damageTaken:b.damageTaken,goal:e.objectiveText});effects(state,e.rewardEffects??{});if(!e.optional&&e.index%3===0)effects(state,{stats:{strength:1,mana:1,vitality:1}});if(e.id==='c4-main-9'&&state.flags.includes('hydraCounterKnown')&&state.flags.includes('teamwork'))state.flags.push('rescueWithoutLoss');if(e.id==='c6-main-18')state.flags.push('allianceVictory');if(e.id==='c7-main-18')state.flags.push('heirProtected');state.guild=Math.min(6,Math.floor(state.victories.length/18));state.battle=null;state.reward=null;state.scene='hub';break;}
 case 'setDeck': camp(state);validateDeck(state,action.deck);state.deck=[...action.deck];break;
 case 'upgradeCard': {camp(state);const card=state.collection.find(c=>c.uid===action.uid);if(!card||card.upgraded)throw new Error('此卡不存在或已经强化。');spend(state,25+state.chapter*5);card.upgraded=true;break;}
 case 'removeCard': {camp(state);if(state.deck.includes(action.uid))throw new Error('先从牌组取下这张牌。');if(!state.collection.some(c=>c.uid===action.uid))throw new Error('卡牌不存在。');state.collection=state.collection.filter(c=>c.uid!==action.uid);break;}
 case 'buyCard': {camp(state);const card=cardFor(state,action.cardId);if(!card||!canLearnCard(state,card)||state.collection.filter(c=>c.cardId===card.id).length>=3)throw new Error('尚未学会或已经拥有3张。');spend(state,shopPrice(state,18+card.rank*8));addCard(state,card.id);break;}
 case 'buyEquipment': {camp(state);const e=equipmentFor(state,action.equipmentId);if(!e||e.chapter>state.chapter||state.ownedEquipment.includes(e.id))throw new Error('装备尚未出售或已经拥有。');spend(state,shopPrice(state,e.price));state.ownedEquipment.push(e.id);state.equipment[e.slot]=e.id;break;}
 case 'equip': {camp(state);const e=equipmentFor(state,action.equipmentId);if(!e||!state.ownedEquipment.includes(e.id))throw new Error('尚未拥有此装备。');state.equipment[e.slot]=e.id;break;}
 case 'setCompanion': camp(state);if(action.companionId!==null&&!availableCompanions(state).some(c=>c.id===action.companionId))throw new Error('当前同伴不适用或尚未建立联系。');state.companionId=action.companionId;break;
 case 'train': {camp(state);if(!SKILL_KEYS.includes(action.skill))throw new Error('未知技艺。');if(state.skills[action.skill]>=Math.min(4,state.chapter))throw new Error('当前导师能教授的阶位已经完成。');spend(state,state.skills[action.skill]===0?12:25+state.skills[action.skill]*12);state.skills[action.skill]++;for(const c of cardsFor(state).filter(c=>c.school===action.skill&&c.rank===state.skills[action.skill]))addCard(state,c.id);break;}
 case 'event': {camp(state);const e=EVENT_BY_ID[action.eventId];if(!e||e.chapter!==state.chapter||(e.actor&&e.actor!==state.character.actor)||state.resolvedEvents.includes(e.id))throw new Error('事件不适用或已作出选择。');const choice=e.choices.find(c=>c.id===action.choiceId);if(!choice)throw new Error('事件选项不存在。');effects(state,choice.effects);state.resolvedEvents.push(e.id);addHistory(state,e.id,e.title,choice.id,choice.label,choice.detail);if(e.id==='rpg-learning')for(const c of cardsFor(state).filter(c=>c.school!=='neutral'&&c.school!=='identity'&&canLearnCard(state,c)))addCard(state,c.id);if(e.actor)for(const c of cardsFor(state).filter(c=>c.actor===e.actor&&canLearnCard(state,c)))addCard(state,c.id);if(e.id==='rpg-outcast'&&state.flags.includes('superdTrust'))addCard(state,'identity-alliance');if(e.id==='rpg-warning'&&state.flags.includes('correspondence'))effects(state,{money:25,flags:['warningVerified']});break;}
 case 'nextChapter': {camp(state);const progress=chapterProgress(state);if(progress.done!==progress.total||progress.events>0)throw new Error('请先完成本章主线遭遇和人生事件。');if(state.chapter>=7)throw new Error('已经来到人生收束。');addHistory(state,`chapter-${state.chapter}`,'阶段交接','next','进入下一章','你带着牌组、约定与经历继续前行。');state.chapter++;const years=[state.character.birthYear+5,state.character.birthYear+9,417,422,427,429,441];state.year=Math.max(state.year,years[state.chapter-1]);state.age=state.year-state.character.birthYear;state.nodeId=`rpg-hub-${state.chapter}`;state.battle=null;state.scene='hub';state.supplies+=2;state.money+=35;break;}
 case 'finish': {camp(state);const ending=ENDINGS.find(e=>e.id===action.endingId);if(!ending)throw new Error('结局不存在。');if(ending.kind==='dead'){if(action.confirmed!==true)throw new Error('不可逆剧情需要明确的二次确认。');if(DEATH_CHAPTER[ending.id]!==state.chapter||(ending.id==='dead-illness'&&state.character.actor!=='roxy'))throw new Error('该不可逆选择不属于当前人物或阶段。');}else{const p=chapterProgress(state);if(state.chapter!==7||p.done!==p.total||p.events>0)throw new Error('请先完成七章旅程。');const result=checkRequirements(ENDING_REQUIREMENTS[ending.id],state);if(!result.ok)throw new Error(result.missing.join('；'));}state.endingId=ending.id;state.status=ending.kind;addHistory(state,ending.id,ending.title,'finish',ending.title,ending.description);state.scene='hub';state.nodeId=ending.id;break;}
 }
 settleBattle(state,previous);state.revision++;return state;
}
export function chapterName(state:RpgState){return CHAPTER_INFO[state.chapter-1].title;}
function legacyDeckPreset(state:RpgState,style:'balanced'|'attack'|'guard'|'magic'):string[]{const sorted=[...state.collection].filter(c=>canLearnCard(state,cardFor(state,c.cardId))).sort((a,b)=>{const score=(c:typeof a)=>{const d=cardFor(state,c.cardId),e=d.effect;return (c.upgraded?6:0)+(style==='magic'&&d.school!=='neutral'?15:0)+(style==='attack'?(e.damage??0):style==='guard'?(e.block??0)+(e.heal??0):(e.damage??0)+(e.block??0)+(e.heal??0))-(d.cost*2);};return score(b)-score(a);});const counts={balanced:[3,5,6],attack:[2,3,10],guard:[4,8,4],magic:[3,4,8]}[style];const heals=sorted.filter(c=>cardFor(state,c.cardId).effect.heal).slice(0,counts[0]),guards=sorted.filter(c=>cardFor(state,c.cardId).effect.block).slice(0,counts[1]),attacks=sorted.filter(c=>cardFor(state,c.cardId).effect.damage).slice(0,counts[2]);const selected=[...new Set([...heals,...guards,...attacks,...sorted].map(c=>c.uid))].slice(0,18);return selected.length>=15?selected:[...state.deck];}
export function schoolLabel(skill:SkillId){return {fire:'火魔术',water:'水魔术',earth:'土魔术',wind:'风魔术',healing:'治疗魔术',sword:'剑神流',waterSword:'水神流',northSword:'北神流'}[skill];}

export type DeckPresetStyle = 'balanced' | 'attack' | 'guard' | 'magic';
export const PRESET_SLOTS: Record<DeckPresetStyle, Record<'attack' | 'block' | 'heal' | 'utility' | 'free', number>> = {
 balanced: { attack: 6, block: 4, heal: 2, utility: 3, free: 3 },
 attack: { attack: 9, block: 2, heal: 1, utility: 3, free: 3 },
 guard: { attack: 3, block: 7, heal: 3, utility: 3, free: 2 },
 magic: { attack: 6, block: 3, heal: 2, utility: 3, free: 4 },
};
export const PRESET_WEIGHTS = {
 balanced: { damage: 1, block: 1, heal: .8, burn: .8, utility: 1 },
 attack: { damage: 1.4, block: .4, heal: .3, burn: 1.1, utility: 1 },
 guard: { damage: .6, block: 1.4, heal: 1.2, burn: .6, utility: 1 },
 magic: { damage: 1, block: .9, heal: .8, burn: 1, utility: 1.15 },
} as const;
export function deckPresetScore(state:RpgState,owned:OwnedCard,style:DeckPresetStyle):number {
 const card=cardFor(state,owned.cardId),e=cardEffect(state,owned),w=PRESET_WEIGHTS[style],burn=e.burn??0;
 const utility=6*(e.draw??0)+10*(e.energy??0)+3*Math.min(e.weak??0,3)+3*Math.min(e.vulnerable??0,3)+(e.cleanse?6:0);
 let value=(e.damage??0)*(e.all?2:1)*w.damage+(e.block??0)*w.block+(e.heal??0)*w.heal+(burn+Math.max(0,burn-1)+Math.max(0,burn-2))*w.burn+utility*w.utility;
 if(style==='magic'&&e.damage&&card.damageScaling==='mana')value*=1.15;
 return value/Math.max(1,card.cost)*(card.exhaust?.75:1)+(card.retain?2:0);
}
export function safeDeckPreset(state:RpgState,style:DeckPresetStyle):string[] {
 if(rulesetVersion(state)===LEGACY_RULESET)return legacyDeckPreset(state,style);
 const sorted=state.collection.filter(c=>canLearnCard(state,cardFor(state,c.cardId))).sort((a,b)=>deckPresetScore(state,b,style)-deckPresetScore(state,a,style)||a.cardId.localeCompare(b.cardId)||Number(b.upgraded)-Number(a.upgraded)||a.uid.localeCompare(b.uid));
 const chosen:OwnedCard[]=[],counts:Record<string,number>={};
 const add=(card:OwnedCard)=>{if(chosen.includes(card)||(counts[card.cardId]??0)>=3)return false;chosen.push(card);counts[card.cardId]=(counts[card.cardId]??0)+1;return true;};
 const matches=(card:OwnedCard,category:'heal'|'block'|'utility'|'attack')=>{const e=cardEffect(state,card);return category==='utility'?!!(e.draw||e.energy||e.cleanse||e.weak||e.vulnerable):category==='attack'?!!(e.damage||e.burn):!!e[category];};
 for(const category of ['heal','block','utility','attack'] as const){
  const candidates=sorted.filter(c=>matches(c,category));
  if(style==='magic'&&category==='attack')candidates.sort((a,b)=>Number(cardFor(state,b.cardId).damageScaling==='mana')-Number(cardFor(state,a.cardId).damageScaling==='mana')||sorted.indexOf(a)-sorted.indexOf(b));
  let remaining=PRESET_SLOTS[style][category];for(const card of candidates){if(!remaining)break;if(add(card))remaining--;}
 }
 for(const card of sorted){if(chosen.length>=18)break;add(card);}
 const deck=chosen.map(card=>card.uid);
 if(deck.length<15){validateDeck(state,state.deck);return [...state.deck];}
 validateDeck(state,deck);return deck;
}

// Diplomacy reduces trade costs; language knowledge adds a concrete benefit after the disaster.
export function shopPrice(state:RpgState,base:number):number {const discount=Math.min(.25,Math.min(.1,state.stats.charisma*.005)+(state.chapter>=3&&state.flags.includes('languageDemon')?.15:0));return Math.max(1,Math.floor(base*(1-discount)));}
export function regionInfo(state:RpgState){const base=CHAPTER_INFO[state.chapter-1];if(state.chapter===1){const birthplaces={village:'阿斯拉村落',noble:'阿斯拉宅邸',demon:'魔大陆村落',forest:'大森林部落'};return {...base,region:state.character.actor==='roxy'?'米格路德村':birthplaces[state.character.origin]};}if(state.flags.includes('careerTeacher'))return {...base,region:`当地教学与支援 · ${base.title}`,subtitle:'通过当地对练、护卫与支援任务参与共同时代'};return base;}
