import type { ActorId, SkillId } from '../game/types';
import type { CardDefinition, CardEffect, Companion, Equipment } from './types';
const colors: Record<SkillId | 'neutral' | 'identity', string> = { fire:'#ce6650',water:'#609cc5',earth:'#b09460',wind:'#74ada0',healing:'#91b78a',sword:'#cb926f',waterSword:'#91aabd',northSword:'#ad95c0',neutral:'#aa976f',identity:'#d0b36d' };
const neutral: [string, number, CardEffect, string, boolean?, boolean?][] = [
 ['直击',1,{damage:13},'稳稳击中一名敌人。'], ['架势',1,{block:13},'保护自己，格挡下次攻击。'],
 ['观察',0,{draw:2},'看清来路，再作决定。',false,true],['深呼吸',1,{heal:16},'恢复生命，争取下一回合。'],
 ['佯攻',1,{damage:8,vulnerable:2},'先试探，再打开敌方防线。'],['压低重心',1,{block:9,weak:2},'保护自己并削弱敌方攻击。'],
 ['整备',0,{energy:1},'暂时多获得一点行动力。',false,true],['固守',2,{block:30},'用完整架势抵御重击。',true],
 ['绷带',1,{heal:12,cleanse:true},'止血，解除身上的负面状态。',false,true],['借势',1,{damage:11,block:7},'在反击时照看自己的空门。'],
 ['备用方案',1,{draw:2,block:6},'寻找更合适的下一张牌。',true],['勇气',2,{damage:30},'把一次出手做到完整。'],
 ['扫击',2,{damage:15,all:true},'同时攻击场上的全部敌人。'],['紧急掩护',0,{block:8},'不消耗行动力的短暂防御。',false,true],
 ['专注',1,{draw:3},'把注意力放在手中可用的招式。'],['留有余地',1,{block:15,heal:5},'保护自己，也为长战留出余力。',true],
];
const schools: {id:SkillId; names:string[]; flavor:string; style:'burn'|'control'|'guard'|'draw'|'heal'|'attack'|'counter'|'trick'}[] = [
 {id:'fire',names:['火弹','烧灼屏障','烈火引燃','火线压制','焰流','余烬整理','灼热风暴','红莲封锁'],flavor:'火魔术',style:'burn'},
 {id:'water',names:['水弹','水幕','冻结关节','冰刃','水流牵引','露水疗护','冰霜领域','暴雨冲击'],flavor:'水魔术',style:'control'},
 {id:'earth',names:['石弹','土壁','泥沼','岩枪','壁垒整理','坚岩护身','岩障轰击','陨石阵'],flavor:'土魔术',style:'guard'},
 {id:'wind',names:['风刃','侧风闪避','乱流','风行','涡流穿刺','静风调息','疾风回旋','风暴眼'],flavor:'风魔术',style:'draw'},
 {id:'healing',names:['治疗术','缓痛','净化','活力恢复','紧急治疗','治愈屏障','生命祝福','再生祈愿'],flavor:'治疗魔术',style:'heal'},
 {id:'sword',names:['直斩','收剑守势','踏步斩','连击起手','破甲斩','剑意整备','迅烈一击','剑闪'],flavor:'剑神流',style:'attack'},
 {id:'waterSword',names:['流水返','迎击架势','卸力','回流反击','静水防线','转守为攻','水镜','反击的极意'],flavor:'水神流',style:'counter'},
 {id:'northSword',names:['角度切入','地形掩护','绊步','诱敌','碎影','短兵整备','北方奇袭','战场变招'],flavor:'北神流',style:'trick'},
];
function schoolEffect(style: typeof schools[number]['style'], i: number): CardEffect {
 const variants: Record<typeof style, CardEffect[]> = {
  burn:[{damage:14,burn:2},{block:12,burn:2},{burn:8},{damage:16,weak:2},{damage:22,burn:4},{draw:2,energy:1},{damage:18,burn:4,all:true},{damage:32,burn:8}],
  control:[{damage:16},{block:18},{weak:3,vulnerable:2},{damage:23},{damage:12,draw:2},{heal:22},{weak:3,damage:12,all:true},{damage:38}],
  guard:[{damage:17},{block:22},{weak:3},{damage:28},{block:13,draw:2},{block:32},{damage:21,block:16},{damage:30,all:true}],
  draw:[{damage:15,draw:1},{block:12,draw:1},{weak:2,draw:1},{energy:2},{damage:24,draw:1},{heal:12,draw:2},{damage:16,all:true,draw:1},{damage:24,draw:3}],
  heal:[{heal:20},{heal:14,block:7},{cleanse:true,draw:1},{heal:12,energy:1},{heal:35},{heal:16,block:18},{heal:25,cleanse:true},{heal:40,block:12}],
  attack:[{damage:19},{block:14},{damage:26},{damage:12,draw:1},{damage:24,vulnerable:2},{energy:1,draw:1},{damage:39},{damage:48}],
  counter:[{damage:12,block:8},{block:21},{weak:3,block:8},{damage:18,block:13},{block:30},{damage:19,energy:1},{block:23,draw:2},{damage:29,block:24}],
  trick:[{damage:14,vulnerable:1},{block:12,draw:1},{weak:3},{vulnerable:3,draw:1},{damage:22},{energy:1,draw:2},{damage:18,all:true},{damage:33,weak:2}],
 };
 return variants[style][i];
}
export const CARDS: CardDefinition[] = neutral.map(([name,cost,effect,text,retain,exhaust],i)=>({id:`neutral-${i+1}`,name,cost,effect,text,retain,exhaust,school:'neutral',rank:0,color:colors.neutral}));
for (const school of schools) school.names.forEach((name,i)=>CARDS.push({id:`${school.id}-${i+1}`,name,cost:[1,1,1,2,2,0,2,3][i],school:school.id,rank:Math.floor(i/2)+1,text:`${school.flavor}的${['基本施展','守护动作','状态控制','战术进阶','持续施压','集中整备','领域技法','高阶收束'][i]}。`,effect:schoolEffect(school.style,i),retain:i===1||i===4,exhaust:i===5,color:colors[school.id]}));
const identities: [ActorId,string[],CardEffect[]][] = [
 ['custom',['旅人的准备','跨流派应变','自己的道路'],[{block:18,draw:1},{energy:1,draw:2},{damage:26,heal:15}]],
 ['rudeus',['石砾算计','魔术演算','前线魔术师'],[{damage:18,block:8},{draw:3},{damage:34,all:true}]],
 ['eris',['不退的踏步','练场直觉','守护之剑'],[{damage:23},{block:18,vulnerable:2},{damage:42,block:12}]],
 ['sylphie',['温柔的风','无声的守护','共同归处'],[{draw:2,heal:9},{block:24},{heal:28,block:19}]],
 ['roxy',['导师的笔记','冰霜教案','魔术师的远行'],[{draw:2,block:9},{damage:20,weak:3},{damage:34,heal:12}]],
];
for (const [actor,names,effects] of identities) names.forEach((name,i)=>CARDS.push({id:`identity-${actor}-${i+1}`,name,cost:i===2?3:1,school:'identity',rank:i+1,actor,text:'通过该人物的专属经历获得。卡牌表现属于原创 IF 战斗设计。',effect:effects[i],retain:i===1,color:colors.identity}));
CARDS.push({id:'identity-alliance',name:'共同的号令',cost:3,school:'identity',rank:3,text:'联盟任务留下的协作方案。',effect:{damage:26,all:true,block:20},exhaust:true,color:colors.identity});
export const CARD_BY_ID = Object.fromEntries(CARDS.map(c=>[c.id,c]));
export const COMPANIONS: Companion[] = [
 {id:'rudeus',actor:'rudeus',name:'鲁迪乌斯',chapter:3,description:'善于在施法前观察地形。',passive:'damage',skill:{damage:24,all:true},skillName:'岩弹支援'},
 {id:'eris',actor:'eris',name:'艾莉丝',chapter:3,description:'可靠的前排伙伴，为你打开攻击窗口。',passive:'damage',skill:{damage:28,vulnerable:2},skillName:'踏步破阵'},
 {id:'sylphie',actor:'sylphie',name:'希露菲',chapter:4,description:'治疗与防护让长战更从容。',passive:'health',skill:{heal:24,cleanse:true},skillName:'治愈援助'},
 {id:'roxy',actor:'roxy',name:'洛琪希',chapter:2,description:'耐心的魔术指导，无法使用念话。',passive:'draw',skill:{damage:20,weak:2},skillName:'冰霜牵制'},
 {id:'ruijerd',name:'瑞杰路德',chapter:3,description:'信任来自对被排斥者的保护。',passive:'block',skill:{damage:30,block:12},skillName:'可靠的前排',requiredFlag:'superdTrust'},
 {id:'ghislaine',name:'基列奴',chapter:2,description:'严谨的剑术指导和保护。',passive:'block',skill:{damage:32},skillName:'护卫剑击'},
 {id:'zanoba',name:'扎诺巴',chapter:4,description:'研究与手工训练带来稳固支援。',passive:'health',skill:{block:32},skillName:'坚实掩护'},
 {id:'cliff',name:'克里夫',chapter:4,description:'以研究和治疗应对异常。',passive:'health',skill:{heal:20,cleanse:true},skillName:'净化术'},
 {id:'elinalise',name:'艾莉娜丽丝',chapter:3,description:'熟悉旅途与迷宫的冒险者。',passive:'block',skill:{block:25,draw:1},skillName:'迷宫掩护'},
 {id:'orsted',name:'奥尔斯帝德',chapter:6,description:'知情盟约后的有限协助，不赋予循环能力。',passive:'damage',skill:{damage:38,weak:2},skillName:'战术指点',requiredFlag:'dragonPact'},
];
const equipmentNames = [ ['练习短剑','缝补练习服','观察手札'],['旅用长剑','护卫皮甲','导师徽章'],['商队兵刃','沙路斗篷','语言手册'],['魔术杖','迷宫护甲','研究笔记'],['破阵兵装','警戒外衣','核验印记'],['联盟佩剑','会谈护甲','外交印章'],['传承之刃','守望战衣','后继者信物'] ];
export const EQUIPMENT: Equipment[] = equipmentNames.flatMap((names,i)=>names.map((name,j)=>({id:`gear-${i+1}-${j}`,name,chapter:i+1,slot:(['weapon','armor','charm'] as const)[j],price:35+i*18,description:j===0?'提升出牌伤害。':j===1?'增加生命与格挡。':'增加开局抽牌及战术余地。',effect:j===0?{damage:2+i}:j===1?{health:12+i*5,block:1+Math.floor(i/2)}:{draw:1}})));
export const EQUIPMENT_BY_ID=Object.fromEntries(EQUIPMENT.map(e=>[e.id,e]));
