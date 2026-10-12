import { STORY_NODES } from '../content';
import { CARDS } from './cards';
import type { EncounterDefinition, QuestDefinition, RpgEvent } from './types';
export const CONTENT_VERSION='2.0.0';
export const CHAPTER_INFO=[
 {title:'根源',region:'出生地',subtitle:'从木剑、纸页与第一张牌开始',places:['家中','练习场','初等课堂','林间小路']},
 {title:'学艺',region:'师承与离家',subtitle:'学会招式，也学会承担委托',places:['导师工坊','护卫练场','公会分部','旅途驿站']},
 {title:'断裂',region:'灾后旅途',subtitle:'失散之后，带着同伴寻找归路',places:['搜救营地','沙路商队','大森林','山道关口']},
 {title:'重建',region:'学园与迷宫',subtitle:'研究、协作与共同的家',places:['魔法学园','迷宫前哨','地下回廊','剑术练场']},
 {title:'真相',region:'警告与证据',subtitle:'每一条建议，都值得核验',places:['信使驿站','证人藏身处','研究书房','监视据点']},
 {title:'棋局',region:'王国与联盟',subtitle:'用可复制的战术维系合作',places:['王国会谈厅','城外演习场','商道关卡','联盟营地']},
 {title:'传承',region:'决战与后继者',subtitle:'为更长远的未来留下选择',places:['前线营地','仪式遗迹','后方据点','传承练场']},
];
const titles=[
 ['第一击的分寸','把空门关上','看懂石壁','基本功考官','课堂里的元素','护卫基本功考核','林口的撤离路线','童年护卫演习'],
 ['整理导师的工作台','冰霜课的第一题','在防守里寻找窗口','检查委托等级','货栈守望','保护迟来的信使','剑术流派的试招','同行者的约定','护卫队长的考核','山路上的营火','不追击的选择','驿站的交接','真正的水术课','剑神流的距离','北神流的地形课','独立完成的护卫','向老师说明战术','师承试炼'],
 ['转移后的第一处水源','护住搜救名单','散落帐篷之间','商队的账与刀','不明身份的求助者','护送孩子回营','用语言换来向导','大森林的误会','沙路伏击首领','确认下一个港口','风沙中的换班','没有收到的回信','不让同伴落单','会晤前的准备','山道警戒线','及时收起敌意','保持能够撤离的距离','山道上的龙神'],
 ['学园里的对练邀请','治疗课的协作','验证魔物笔记','寻找迷宫入口','搬运设备的护卫','研究现场的清理','不再生的伤口','掩护烧灼窗口','迷宫再生守护者','回廊里接回同伴','护送疲惫的研究者','安顿共同住处','重新学习剑术基本功','守势与追击的界线','导师的战术纠正','保护练场后排','向后继者解释招式','剑之圣地试炼'],
 ['核对警告中的地址','送信人为何迟到','护送第一名证人','留存原始记录','书房外的监视者','两条相矛盾的线索','不要独自赴约','可信的核验渠道','警告核验战','揭开仪式的用途','转移证人的住处','看见建议的代价','夜间交接','研究异常病兆','交出可验证的证据','前线信息核实','留住完整的证词','阴谋的执行者'],
 ['保护会谈的入口','使节之间的误会','不公开的护卫岗','打通物资路线','监督重建资金','公开的交接记录','后门的值守','护送参与会谈的人','宫廷刺杀指挥者','联盟训练的第一次换班','给友军看的战术表','确认分工界线','补上薄弱的防守','商道的第二次交接','防止仪式伪装','让号令能够复述','队伍协同的验收','联盟演习统领'],
 ['校验前线补给','保护撤离名单','第一次后方演习','让后继者接管信使','检查核心外墙','拆解伪装的仪式','给研究者争取窗口','不让队伍失去联系','决战仪式核心','归来的第一封信','清理最后的道路','兑现后方支援','重新整理教学笔记','留给下一代的练场','能重复的研究方案','保护交接中的家人','让新的队伍独立行动','后继者的最后试炼'],
];
const optionalTitles=[['村边的切磋','课堂挑战题','林间巡回','家门前的护卫'],['公会公开试招','旅途的双人护卫','工坊元素难题','剑术变招练习'],['营地夜间演习','兽族友善对练','沙路紧急突围','港口的误会'],['学园公开赛','迷宫支路测绘','再生反制实验','水神流对练'],['信使追踪演练','证据保全试验','书房中的干扰阵','研究者的净化课'],['城门公开演习','联盟阵型挑战','使节护卫考核','王国研究委托'],['传承公开对练','后方守望任务','前线合练','最终战术复盘']];
const descriptions:Record<EncounterDefinition['modifier'],string>={none:'在明确的行动预告中找到攻守窗口。',ambush:'敌方抢先布置了破绽，先保护自己再反击。',fog:'视线受阻，首回合少一张手牌，观察与抽牌更有价值。',supplies:'后方留下了补给，本场额外获得一次应急治疗。',fire:'环境有残留火源，第一回合先处理燃烧。',ward:'每回合开始获得少量格挡，敌方也有预先屏障。',duel:'正式对练，不能使用应急药剂，但战败仍可重试。',reinforce:'敌方互相掩护，需要选择先压制的目标。'};
export const TUTORIAL_HINTS=['先点手牌，再点敌人；本回合敌人准备防御，可先安排输出。','看上方意图预告，重击前用格挡吸收伤害。','抽牌堆用完会重新洗入弃牌；保留和消耗牌有不同去向。','关键对手半血后会换招；战败可以免费重试。','燃烧可以绕过格挡，虚弱适合应对连击。','援助不消耗行动力，每次使用后冷却3回合；在同伴界面查看解锁条件。','撤离目标只需撑过规定回合，不必击败所有敌人。','在下一章之前试试组牌、强化和导师训练，首胜奖励不需要刷取。'];
const modifiers:EncounterDefinition['modifier'][]=['none','ward','fog','duel','ambush','supplies','reinforce','fire'];
const enemyBands=[[1,3,4,5,6,7,8],[3,5,6,9,10,15,16,17,18],[7,9,10,11,12,13,14,15,16],[17,18,19,20,21,22,28],[21,23,24,25,26,27,28],[23,24,25,26,27,29,30],[19,22,26,28,29,30,31,32]];
export const ENCOUNTERS:EncounterDefinition[]=[];
export const QUESTS:QuestDefinition[]=[];
const tacticalSignatures=new Set<string>();
for(let c=1;c<=7;c++) {
 const count=titles[c-1].length, groupSize=c===1?2:3, bands=enemyBands[c-1];
 for(let i=0;i<count+4;i++) {
  const optional=i>=count, n=optional?i-count:i, boss=!optional&&(i===Math.floor(count/2)-1||i===count-1);
  const id=`c${c}-${optional?'side':'main'}-${n+1}`;
  const questId=`q${c}-${optional?'side-'+(n+1):Math.floor(i/groupSize)+1}`;
  let modifier=boss?'none':modifiers[(i+c-1)%modifiers.length];
  const goal:EncounterDefinition['goal']=!optional&&((c===3&&i===12)||(c===4&&i===9)||(c===5&&i===2)||(c===7&&i===3))?'rescue':c===3&&i===count-1?'survive':boss&&c===7&&i===Math.floor(count/2)-1?'ritual':!boss&&i%7===5?'escort':!boss&&i%9===6?'survive':'defeat';
  const bossNumber=(c-1)*2+(i===count-1?2:1);
  let enemies=boss?[`boss-${bossNumber}`]:[`enemy-${bands[i%bands.length]}`];
  if(c===1&&optional&&n===0)enemies=['enemy-2'];
  if(!boss&&c>=2&&((i+c)%3!==0||modifier==='reinforce')) enemies.push(`enemy-${bands[(i+2)%bands.length]}`);
  if(!boss&&c>=5&&i%4===0) enemies=[...enemies,`enemy-${bands[(i+4)%bands.length]}`].slice(0,3);
  // Give every encounter a distinct enemy formation, field condition or objective.
  const signature=()=>JSON.stringify([enemies,modifier,goal,boss?7:goal==='rescue'?10:6]);
  if(tacticalSignatures.has(signature()))for(const field of modifiers){modifier=field;if(!tacticalSignatures.has(signature()))break;}
  tacticalSignatures.add(signature());
  const goalText=goal==='rescue'?'10回合内击退阻截者并完成救援':goal==='survive'?`撑过${boss?7:6}回合，保持撤离窗口` : goal==='escort'?'保护护送目标撑过6回合，或先击退全部敌人':goal==='ritual'?'将仪式压至0并撑过3回合，或击破核心；失控值为8':'击退全部对手';
  const rewardCards=CARDS.filter(card=>card.school==='neutral'||(card.school!=='identity'&&card.rank<=Math.min(4,c))).slice((i*3+c)%25,(i*3+c)%25+3).map(card=>card.id);
  ENCOUNTERS.push({id,chapter:c,index:n+1,title:optional?optionalTitles[c-1][n]:titles[c-1][i],location:CHAPTER_INFO[c-1].places[optional?n%4:Math.floor((n/count)*4)%4],summary:`${optional?'这是一项额外委托。':'这是当前任务的一环。'}${descriptions[modifier]}${boss?'对手会在生命低于一半时改变战术。':''}失败可以免费重新配装和挑战。`,objectiveText:goalText,goal,rounds:boss?7:goal==='rescue'?10:6,enemies,modifier,optional,questId,requires:optional||i%groupSize===0?[]:[`c${c}-main-${i}`],boss,reward:22+c*9+(boss?35:0),cardRewards:rewardCards,rewardEffects:boss?{relations:{companions:2,guild:2},stats:{vitality:1,insight:1}}:undefined});
 }
 const groups=[...new Set(ENCOUNTERS.filter(e=>e.chapter===c).map(e=>e.questId))];
 for(const id of groups) {const es=ENCOUNTERS.filter(e=>e.questId===id); QUESTS.push({id,chapter:c,title:es[0].title,description:es.length===1?'独立挑战，可在本章随时尝试。':`完成这条任务链中的${es.length}次遭遇，先研究敌方意图再安排牌组。`,location:es[0].location,encounters:es.map(e=>e.id),optional:es[0].optional});}
}
export const ENCOUNTER_BY_ID=Object.fromEntries(ENCOUNTERS.map(e=>[e.id,e]));
export const QUEST_BY_ID=Object.fromEntries(QUESTS.map(q=>[q.id,q]));
const event=(id:string,chapter:number,title:string,summary:string,choices:RpgEvent['choices'],requires?:string[]):RpgEvent=>({id,chapter,title,summary,choices,requires});
export const EVENTS:RpgEvent[]=[
 event('rpg-language',1,'饭桌上的语言','旅人把三种问候写在纸上。学语言无法代替出牌，却能在未来的营地、森林和商队找到帮助。选择一种最想先学的沟通方式。',[{id:'demon',label:'学习魔神语',detail:'灾后交涉与商店价格更顺利。',effects:{flags:['languageDemon'],stats:{insight:1}}},{id:'beast',label:'学习兽神语',detail:'森林援助与护卫更可靠。',effects:{flags:['languageBeast'],stats:{charisma:1}}},{id:'home',label:'先记住家人与地址',detail:'增加家庭牵挂，建立通信基础。',effects:{flags:['familyBond','correspondence'],relations:{family:3}}}]),
 event('rpg-learning',1,'第一位导师','木剑和纸页都需要有人教你使用。今天只从一个基础流派开始；以后仍可向其他导师学习。高属性不会自动带来技艺。',[{id:'magic',label:'从水魔术开始',detail:'学会初级水魔术，获得水弹与水幕。',effects:{skills:{water:1},flags:['firstLesson']}},{id:'blade',label:'从剑神流开始',detail:'学会初级剑神流，获得直斩与收剑。',effects:{skills:{sword:1},flags:['firstLesson']}},{id:'support',label:'从治疗魔术开始',detail:'学会初级治疗魔术，获得治疗与缓痛。',effects:{skills:{healing:1},flags:['firstLesson']}}]),
 event('rpg-letter',2,'离家前的约定','信使正在等待你的决定。能找到可靠地址，就能在灾后确认同伴的消息；留下接应计划，也会让家人不必一直猜测。',[{id:'write',label:'约定定期通信',detail:'家人关系与后期警告核验。',effects:{flags:['correspondence','familyBond'],relations:{family:3}}},{id:'notes',label:'记录魔物与委托',detail:'开始迷宫研究，获得导师信任。',effects:{flags:['monsterNotes'],relations:{mentor:3}}},{id:'people',label:'与队伍练习协作',detail:'护送目标生命增加。',effects:{flags:['teamwork'],relations:{companions:3}}}]),
 event('rpg-career',2,'想把技艺用在哪里','同一套牌可以保护家人，也能指导学徒。选择目前最想投入的方向，后面的地区仍会给你修正与扩展目标的机会。',[{id:'teacher',label:'教学与研究',detail:'打开教育者与研究者方向。',effects:{flags:['careerTeacher','careerResearch','monsterNotes'],stats:{insight:2}}},{id:'blade',label:'剑术与护卫',detail:'打开剑道传承与故乡守望方向。',effects:{flags:['careerSword','careerRebuild'],stats:{strength:2}}},{id:'travel',label:'旅行与交涉',detail:'打开旅人和调停方向。',effects:{flags:['careerTraveler','careerPolitics'],stats:{charisma:2}}}]),
 event('rpg-outcast',3,'营地里的陌生人','大家害怕陌生人的额饰，也有人迟迟没有收到家书。选择怎样安排有限的信任，会改变接下来能同行的人和取得的线索。',[{id:'trust',label:'为被排斥者作证',detail:'瑞杰路德的援助与后期联盟情报。',effects:{flags:['superdTrust'],relations:{allies:4}}},{id:'guide',label:'请向导核对道路',detail:'获得安全旅行记录与语言练习。',effects:{flags:['travelLog','languageDemon'],supplies:3}},{id:'letters',label:'寻找通信接应点',detail:'通信约定与后期警告核验。',effects:{flags:['correspondence'],relations:{family:4}}}]),
 event('rpg-research',4,'再生守护者的记录','守护者能恢复伤口。魔物笔记说明普通输出并不够，队伍需要在制造伤口时烧灼，还必须为前排留出掩护。准备会在战斗里产生实际效果。',[{id:'study',label:'研究反再生与协作',detail:'守护者再生减半；护送生命增加。',effects:{flags:['monsterNotes','hydraCounterKnown','teamwork'],skills:{fire:1}}},{id:'home',label:'安顿家人与研究者',detail:'建立共同住所，额外补给。',effects:{flags:['sharedHome','relationshipRepaired','familyBond'],supplies:3,relations:{family:5}}},{id:'course',label:'把记录整理成课程',detail:'教学与研究方向，提升治疗技艺。',effects:{flags:['careerTeacher','careerResearch','curriculum'],skills:{healing:1}}}]),
 event('rpg-warning',5,'核验梦中的建议','有人声称已经知道你的未来。你手中仍有来信、证人和自己的记录。先选择核验渠道，再决定要不要进入更大的棋局。',[{id:'pact',label:'知情后与龙神合作',detail:'盟约、证据与后期援助。',effects:{flags:['dragonPact','warningVerified','conspiracyExposed'],relations:{dragon:5}}},{id:'letter',label:'通过通信独立核验',detail:'保护家人、留下证据；通信越早越有用。',effects:{flags:['warningVerified','conspiracyExposed','relationshipRepaired'],relations:{family:3}}},{id:'research',label:'先保护研究证据',detail:'研究方向与验证资料。',effects:{flags:['careerResearch','prototype','independentVerified'],stats:{insight:2}}}]),
 event('rpg-alliance',6,'公开的分工','护卫、资金与前线号令都需要有人复核。战斗只是其中一部分；愿意履行的条款才决定人们能否继续合作。',[{id:'people',label:'优先居民和重建',detail:'安置居民、公开资金与商道。',effects:{flags:['careerRebuild','residentsSettled','rebuildFund','tradeRoutes','civilianProtection'],relations:{refugees:5}}},{id:'talk',label:'负责交接与和平条款',detail:'调停者方向、盟友信任。',effects:{flags:['careerPolitics','stableSuccession','peaceTerms','civilianProtection','tradeRoutes'],stats:{charisma:2}}},{id:'team',label:'完善协作与研究',detail:'联盟与研究成果。',effects:{flags:['teamwork','prototype','independentVerified','tradeRoutes'],relations:{allies:4}}}]),
 event('rpg-legacy',7,'把未来交给谁','最后一轮演习之前，后继者希望知道的不只是你赢过多少场战斗。你可以把战术教给学生，也可以先把回家的地址写清楚。',[{id:'home',label:'守望家人与故乡',detail:'完成家庭关系修复与共同住所。',effects:{flags:['sharedHome','relationshipRepaired','familyBond','residentsSettled','rebuildFund','tradeRoutes'],relations:{family:6}}},{id:'teach',label:'教会能够独立行动的人',detail:'课程、毕业者、师承与后继者。',effects:{flags:['curriculum','independentGraduates','heirTrained','swordTrial'],stats:{insight:2,strength:2}}},{id:'future',label:'保存研究与旅行记录',detail:'验证原型、旅行记录并保护后继者。',effects:{flags:['prototype','independentVerified','travelLog','tradeRoutes','heirProtected'],stats:{insight:2}}}]),
];
// Preserve all eight exclusive memories per identity without forcing their old graph routes.
for(const old of STORY_NODES.filter(n=>n.actors?.length===1&&n.kind!=='ending')) {
 const actor=old.actors![0];
 const choices=old.choices.filter(c=>c.risk!=='fatal').slice(0,3).map(c=>({id:c.id,label:c.label,detail:c.detail,effects:c.effects??{}}));
 if(choices.length) EVENTS.push({id:`memory-${old.id}`,chapter:old.chapter,title:old.title,actor,summary:old.body.split('\n')[0].slice(0,110),detail:old.body,choices});
}
export const EVENT_BY_ID=Object.fromEntries(EVENTS.map(e=>[e.id,e]));
export const DEATH_CHAPTER:Record<string,number>={'dead-childhood':1,'dead-quest':2,'dead-journey':3,'dead-dragon':3,'dead-labyrinth':4,'dead-illness':5,'dead-assassin':6,'dead-battle':7};
