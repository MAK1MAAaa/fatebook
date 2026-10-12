import { COMPANIONS } from './cards';
import { cardFor, equipmentFor, rulesetVersion, CURRENT_RULESET } from './rulesets';
import { ENEMY_BY_ID } from './enemies';
import { ENCOUNTER_BY_ID } from './content';
import type { BattleState, CardEffect, EnemyUnit, Intent, OwnedCard, RpgState, Statuses } from './types';
export const emptyStatuses=():Statuses=>({burn:0,weak:0,vulnerable:0});
export function hashSeed(text:string):number {let h=2166136261;for(const ch of text){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0||1;}
function random(b:BattleState):number {let x=b.rng;x^=x<<13;x^=x>>>17;x^=x<<5;b.rng=x>>>0||1;return b.rng/4294967296;}
function shuffle(cards:string[],b:BattleState):string[]{const result=[...cards];for(let i=result.length-1;i>0;i--){const j=Math.floor(random(b)*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
export function gearEffects(state:RpgState){return Object.values(state.equipment).reduce((sum,id)=>{const effect=id?equipmentFor(state,id)?.effect:{};return {damage:sum.damage+(effect?.damage??0),block:sum.block+(effect?.block??0),health:sum.health+(effect?.health??0),draw:sum.draw+(effect?.draw??0)};},{damage:0,block:0,health:0,draw:0});}
export function cardEffect(state:RpgState,owned:OwnedCard):CardEffect{
 const card=cardFor(state,owned.cardId),effect={...card.effect},gear=gearEffects(state),comp=COMPANIONS.find(c=>c.id===state.companionId);
 const current=rulesetVersion(state)===CURRENT_RULESET;
 const physical=['neutral','sword','waterSword','northSword'].includes(card.school);
 const attribute=current?(card.damageScaling==='hybrid'?Math.max(state.stats.strength,state.stats.mana):state.stats[card.damageScaling??'mana']):(physical?state.stats.strength:state.stats.mana);
 if(effect.damage) effect.damage+=Math.min(12,Math.floor(attribute/3))+(state.chapter-1)*3+gear.damage+(comp?.passive==='damage'?3:0);
 if(effect.block) effect.block+=Math.floor((state.chapter-1)*1.5)+Math.min(8,Math.floor(state.stats.vitality/5))+Math.min(6,Math.floor(state.stats.agility/6))+gear.block+(comp?.passive==='block'?3:0);
 if(effect.heal) effect.heal+=Math.min(8,Math.floor(state.stats.insight/6))+(state.chapter-1)*2;
 if(owned.upgraded){
  if(current){for(const key of ['damage','block','heal','draw','energy','burn','weak','vulnerable'] as const)if(card.upgradeEffect?.[key])effect[key]=(effect[key]??0)+card.upgradeEffect[key]!;}
  else {if(effect.damage)effect.damage+=6;if(effect.block)effect.block+=6;if(effect.heal)effect.heal+=7;if(effect.burn)effect.burn+=2;if(effect.weak)effect.weak+=1;if(effect.vulnerable)effect.vulnerable+=1;}
 }
 return effect;
}
export function effectText(e:CardEffect):string {return [e.damage&&`伤害 ${e.damage}${e.all?' · 全体':''}`,e.block&&`格挡 ${e.block}`,e.heal&&`治疗 ${e.heal}`,e.draw&&`抽牌 ${e.draw}`,e.energy&&`行动 +${e.energy}`,e.burn&&`燃烧 ${e.burn}`,e.weak&&`虚弱 ${e.weak}`,e.vulnerable&&`易伤 ${e.vulnerable}`,e.cleanse&&'净化'].filter(Boolean).join(' / ');}
function log(b:BattleState,text:string){b.log=[...b.log.slice(-13),text];}
function draw(b:BattleState,count:number){for(let i=0;i<count&&b.hand.length<10;i++){if(!b.drawPile.length){b.drawPile=shuffle(b.discard,b);b.discard=[];}const uid=b.drawPile.pop();if(uid)b.hand.push(uid);}}
export function enemyIntent(unit:EnemyUnit,turn:number):Intent {const def=ENEMY_BY_ID[unit.definitionId];const phase=def.phase&&unit.hp<=unit.maxHp*def.phase.threshold;unit.phase=phase?1:0;const pattern=phase?def.phase!.pattern:def.pattern;return {...pattern[(turn-1)%pattern.length]};}
function scaledDamage(amount:number,attacker:Statuses,target:Statuses):number{return Math.max(0,Math.floor(amount*(attacker.weak>0?.75:1)*(target.vulnerable>0?1.5:1)));}
function hurt(target:{hp:number;block:number},amount:number):number{const absorbed=Math.min(target.block,amount);target.block-=absorbed;const actual=Math.min(target.hp,amount-absorbed);target.hp=Math.max(0,target.hp-actual);return actual;}
export function createBattle(state:RpgState,encounterId:string):BattleState{
 const encounter=ENCOUNTER_BY_ID[encounterId],gear=gearEffects(state),comp=COMPANIONS.find(c=>c.id===state.companionId);
 const seed=hashSeed(`${state.seed}:${encounterId}`),maxHp=120+state.stats.vitality*4+state.chapter*12+gear.health+(comp?.passive==='health'?20:0);
 const b:BattleState={encounterId,seed,rng:seed,turn:1,hp:maxHp,maxHp,block:0,energy:3,statuses:emptyStatuses(),hand:[],drawPile:[],discard:[],exhausted:[],enemies:[],supportCooldown:0,potions:encounter.modifier==='duel'?0:encounter.modifier==='supplies'?3:2,escortHp:escortMaxHp(state),ritual:3,result:'playing',log:[],played:0,damageTaken:0};
 // Deck editing changes membership, not an exploitable pre-shuffle ordering.
 const canonicalDeck=[...state.deck].sort((a,c)=>{const left=state.collection.find(card=>card.uid===a)!,right=state.collection.find(card=>card.uid===c)!;return left.cardId.localeCompare(right.cardId)||a.localeCompare(c);});
 b.drawPile=shuffle(canonicalDeck,b);
 b.enemies=encounter.enemies.map((id,index)=>{const def=ENEMY_BY_ID[id],maxHp=Math.round(def.hp*(1+(state.chapter-1)*.08));const unit:EnemyUnit={uid:`enemy-${index}`,definitionId:id,name:def.name,hp:maxHp,maxHp,block:encounter.modifier==='ward'?12:encounter.modifier==='reinforce'?6:0,statuses:emptyStatuses(),intent:{...def.pattern[0]},phase:0};return unit;});
 if(encounter.modifier==='ambush')b.statuses.vulnerable=2;
 if(encounter.modifier==='fire')b.statuses.burn=4;
 if(encounter.modifier==='ward')b.block=8;
 if(state.chapter===3&&state.flags.includes('languageDemon')&&!encounter.boss)b.enemies.forEach(e=>e.statuses.weak=1);
 if(state.chapter>=6&&state.flags.includes('superdTrust'))b.block+=8;
 if(state.flags.includes('warningVerified')&&state.chapter>=5)b.block+=10;
 draw(b,5+gear.draw+(comp?.passive==='draw'?1:0)-(encounter.modifier==='fog'?1:0));
 log(b,`${encounter.title}：${encounter.objectiveText}。敌方动作已经显示。`);
 return b;
}
function evaluate(b:BattleState){const encounter=ENCOUNTER_BY_ID[b.encounterId];if(b.hp<=0||(encounter.goal==='rescue'&&b.turn>encounter.rounds)||(encounter.goal==='escort'&&b.escortHp<=0)||(encounter.goal==='ritual'&&b.ritual>=8)){b.result='lost';log(b,b.hp<=0?'你失去作战能力，可以免费调整牌组后重试。':encounter.goal==='escort'?'护送目标被压制，重新安排掩护。':encounter.goal==='rescue'?'救援时限已过，下次优先提高输出或集中目标。':'仪式失控，下一次优先压制核心。');return;}
 if(b.enemies.every(e=>e.hp<=0)||((encounter.goal==='survive'||encounter.goal==='escort')&&b.turn>encounter.rounds)||(encounter.goal==='ritual'&&b.ritual<=0&&b.turn>3)){b.result='won';log(b,'目标完成。普通战败与训练不计为剧情死亡。');}}
export function applyCombatEffect(state:RpgState,effect:CardEffect,targetId?:string){const b=state.battle!;const targets=effect.all?b.enemies.filter(e=>e.hp>0):[b.enemies.find(e=>e.uid===targetId&&e.hp>0)].filter((e):e is EnemyUnit=>!!e);
 if((effect.damage||effect.burn||effect.weak||effect.vulnerable)&&!targets.length)throw new Error('请选择仍在战场上的敌人。');
 for(const target of targets){if(effect.damage){const actual=hurt(target,scaledDamage(effect.damage,b.statuses,target.statuses));log(b,`对${target.name}造成 ${actual} 点伤害。`);if(ENCOUNTER_BY_ID[b.encounterId].goal==='ritual'&&actual>=20)b.ritual=Math.max(0,b.ritual-1);}for(const key of ['burn','weak','vulnerable'] as const)target.statuses[key]+=effect[key]??0;target.intent=enemyIntent(target,b.turn);}
 if(effect.block)b.block+=effect.block;
 if(effect.heal)b.hp=Math.min(b.maxHp,b.hp+effect.heal);
 if(effect.energy)b.energy=Math.min(9,b.energy+effect.energy);
 if(effect.draw)draw(b,effect.draw);
 if(effect.cleanse)b.statuses=emptyStatuses();
 evaluate(b);
}
export function playCard(state:RpgState,uid:string,target?:string){const b=state.battle!;if(b.result!=='playing')throw new Error('本场战斗已经结束。');if(!b.hand.includes(uid))throw new Error('这张牌不在当前手牌中。');const owned=state.collection.find(c=>c.uid===uid);if(!owned)throw new Error('卡牌资料缺失。');const card=cardFor(state,owned.cardId);if(b.energy<card.cost)throw new Error('行动力不足。');
 const effect=cardEffect(state,owned);b.energy-=card.cost;b.hand=b.hand.filter(id=>id!==uid);(card.exhaust?b.exhausted:b.discard).push(uid);applyCombatEffect(state,effect,target);b.played++;log(b,`使用 ${card.name}${owned.upgraded?'＋':''}，消耗 ${card.cost} 行动力。`);
}
export function activateSupport(state:RpgState,target?:string){const b=state.battle!;const comp=COMPANIONS.find(c=>c.id===state.companionId);if(b.result!=='playing'||!comp)throw new Error('当前没有可用援助。');if(b.supportCooldown>0)throw new Error('援助还在冷却。');applyCombatEffect(state,{...comp.skill},target);b.supportCooldown=3;log(b,`${comp.name}：${comp.skillName}。`);}
export function drinkPotion(state:RpgState){const b=state.battle!;if(b.result!=='playing'||b.potions<1)throw new Error('本场没有剩余应急治疗。');b.potions--;b.hp=Math.min(b.maxHp,b.hp+35+state.chapter*5);log(b,'使用战斗应急包；重试会恢复本场用量。');}
export function endTurn(state:RpgState){const b=state.battle!;if(b.result!=='playing')throw new Error('本场战斗已经结束。');
 const retained:string[]=[];for(const uid of b.hand){const own=state.collection.find(c=>c.uid===uid)!;(cardFor(state,own.cardId).retain?retained:b.discard).push(uid);}b.hand=retained;
 if(b.statuses.burn>0){const damage=Math.min(b.hp,b.statuses.burn);b.hp-=damage;b.damageTaken+=damage;log(b,`燃烧造成 ${damage} 点伤害。`);b.statuses.burn=Math.max(0,b.statuses.burn-1);}
 evaluate(b);if(b.result!=='playing')return;
 // Expire the hero's previous debuffs before enemies apply new ones.
 b.statuses.weak=Math.max(0,b.statuses.weak-1);b.statuses.vulnerable=Math.max(0,b.statuses.vulnerable-1);
 for(const enemy of b.enemies){if(enemy.hp<=0)continue;enemy.block=0;const burning=enemy.statuses.burn>0;if(burning){enemy.hp=Math.max(0,enemy.hp-enemy.statuses.burn);enemy.statuses.burn=Math.max(0,enemy.statuses.burn-1);}evaluate(b);if(b.result!=='playing')return;if(enemy.hp<=0)continue;
  const intent=enemy.intent,scale=state.chapter-1;
  if(intent.kind==='attack'){for(let hit=0;hit<(intent.hits??1);hit++){const amount=scaledDamage(intent.amount+Math.floor(scale*1.2),enemy.statuses,b.statuses),actual=hurt(b,amount);b.damageTaken+=actual;if(ENCOUNTER_BY_ID[b.encounterId].goal==='escort')b.escortHp=Math.max(0,b.escortHp-Math.max(2,Math.floor((amount-actual)/8)+Math.floor(actual/4)));log(b,`${enemy.name} · ${intent.label}：${actual} 伤害。`);}}
  else if(intent.kind==='guard')enemy.block=intent.amount+scale;
  else if(intent.kind==='heal'){const anti=burning||state.flags.includes('hydraCounterKnown');enemy.hp=Math.min(enemy.maxHp,enemy.hp+Math.floor(intent.amount*(anti?.5:1)));log(b,`${enemy.name}恢复生命${anti?'，反再生准备降低了恢复量':''}。`);}
  else if(intent.kind==='drain'){b.hand.splice(0,Math.min(intent.amount,b.hand.length)).forEach(id=>b.discard.push(id));log(b,`${enemy.name}扰乱保留的手牌。`);}
  else if(intent.kind==='ritual'){b.ritual+=intent.amount;log(b,`仪式值 +${intent.amount}。`);}
  else b.statuses[intent.kind]+=intent.amount;
  enemy.statuses.weak=Math.max(0,enemy.statuses.weak-1);enemy.statuses.vulnerable=Math.max(0,enemy.statuses.vulnerable-1);
  evaluate(b);if(b.result!=='playing')return;
 }
 b.turn++;b.energy=3;b.block=ENCOUNTER_BY_ID[b.encounterId].modifier==='ward'?8:0;b.supportCooldown=Math.max(0,b.supportCooldown-1);b.enemies.forEach(e=>e.intent=enemyIntent(e,b.turn));draw(b,5);evaluate(b);
}

export function intentAmount(state:RpgState,unit:EnemyUnit):number {const intent=unit.intent;if(intent.kind==='attack'){const statuses={...state.battle!.statuses,vulnerable:Math.max(0,state.battle!.statuses.vulnerable-1)};return scaledDamage(intent.amount+Math.floor((state.chapter-1)*1.2),unit.statuses,statuses);}if(intent.kind==='guard')return intent.amount+state.chapter-1;if(intent.kind==='heal')return Math.floor(intent.amount*(unit.statuses.burn>0||state.flags.includes('hydraCounterKnown')?.5:1));return intent.amount;}

export interface EnemyIntentForecast { amount: number; willAct: boolean; reason?: string; }

// Forecast the announced actions in their actual execution order. Work only on
// local values: drawing, RNG, the saved battle and its action log stay untouched.
export function forecastEnemyIntents(state: RpgState): Record<string, EnemyIntentForecast> {
 const battle = state.battle;
 if (!battle) return {};
 const encounter = ENCOUNTER_BY_ID[battle.encounterId];
 const hero = { hp: Math.max(0, battle.hp - battle.statuses.burn), block: battle.block };
 const heroStatuses = { ...battle.statuses, weak: Math.max(0, battle.statuses.weak - 1), vulnerable: Math.max(0, battle.statuses.vulnerable - 1) };
 const enemyHp = new Map(battle.enemies.map(enemy => [enemy.uid, enemy.hp]));
 let escortHp = battle.escortHp, ritual = battle.ritual;
 const forecasts: Record<string, EnemyIntentForecast> = {};
 const ended = () => battle.result !== 'playing' || hero.hp <= 0
  || (encounter.goal === 'rescue' && battle.turn > encounter.rounds)
  || (encounter.goal === 'escort' && escortHp <= 0)
  || (encounter.goal === 'ritual' && (ritual >= 8 || (ritual <= 0 && battle.turn > 3)))
  || [...enemyHp.values()].every(hp => hp <= 0)
  || ((encounter.goal === 'survive' || encounter.goal === 'escort') && battle.turn > encounter.rounds);
 for (const enemy of battle.enemies) {
  if (enemy.hp <= 0) { forecasts[enemy.uid] = { amount: 0, willAct: false, reason: '已退场' }; continue; }
  if (ended()) { forecasts[enemy.uid] = { amount: 0, willAct: false, reason: '此前行动将结束战斗' }; continue; }
  const burning = enemy.statuses.burn > 0;
  const hpAfterBurn = Math.max(0, enemy.hp - enemy.statuses.burn);
  enemyHp.set(enemy.uid, hpAfterBurn);
  if (hpAfterBurn <= 0) { forecasts[enemy.uid] = { amount: 0, willAct: false, reason: '燃烧将使其退场' }; continue; }
  const intent = enemy.intent;
  let amount = intent.amount;
  if (intent.kind === 'attack') {
   amount = scaledDamage(intent.amount + Math.floor((state.chapter - 1) * 1.2), enemy.statuses, heroStatuses);
   for (let hit = 0; hit < (intent.hits ?? 1); hit++) {
    const actual = hurt(hero, amount);
    if (encounter.goal === 'escort') escortHp = Math.max(0, escortHp - Math.max(2, Math.floor((amount - actual) / 8) + Math.floor(actual / 4)));
   }
  } else if (intent.kind === 'guard') amount += state.chapter - 1;
  else if (intent.kind === 'heal') {
   amount = Math.floor(intent.amount * (burning || state.flags.includes('hydraCounterKnown') ? .5 : 1));
   enemyHp.set(enemy.uid, Math.min(enemy.maxHp, hpAfterBurn + amount));
  } else if (intent.kind === 'ritual') ritual += amount;
  else if (intent.kind === 'burn' || intent.kind === 'weak' || intent.kind === 'vulnerable') heroStatuses[intent.kind] += amount;
  forecasts[enemy.uid] = { amount, willAct: true };
 }
 return forecasts;
}
export const escortMaxHp=(state:RpgState)=>180+(state.flags.includes('teamwork')?55:0)+(state.flags.includes('languageBeast')?20:0);
