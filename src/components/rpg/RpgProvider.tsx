import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { RpgContext } from '../../rpg/context';
import { createRpg, resolveAction } from '../../rpg/engine';
import { emptyEnvelope, loadRpgEnvelope, persistRpg, removeRpg, STORAGE_KEY } from '../../rpg/storage';
import { withSaveLock } from '../../game/save-lock';
import { buildCardPlayCue, MAX_CARD_PLAY_CUES, type CardPlayCue } from '../../rpg/card-play-effects';
import { useBattleAudio } from '../../hooks/use-battle-audio';
import type { CharacterConfig } from '../../game/types';
import type { GameAction, RpgState } from '../../rpg/types';
type Submission={state:RpgState;action:GameAction|null;expected:number;cue?:CardPlayCue|null};
const message=(e:unknown)=>e instanceof Error?e.message:'无法保存本地记录。';
export default function RpgProvider({children}:{children:ReactNode}){
 const navigate=useNavigate();const [initial]=useState(()=>{try{return{envelope:loadRpgEnvelope(),error:null};}catch(e){return{envelope:emptyEnvelope(),error:message(e)};}});const [envelope,setEnvelope]=useState(initial.envelope),[error,setError]=useState<string|null>(initial.error),[pending,setPending]=useState<RpgState|null>(null),[saving,setSaving]=useState(false);const busy=useRef(false),queued=useRef<Submission|null>(null);
 const [cardPlays,setCardPlays]=useState<CardPlayCue[]>([]);
 const audio=useBattleAudio();
 const effectTimers=useRef(new Set<ReturnType<typeof setTimeout>>());
 useEffect(()=>{const timers=effectTimers.current;return()=>{timers.forEach(clearTimeout);timers.clear();};},[]);
 function showCardPlay(cue:CardPlayCue){
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
  const effect={...cue,durationMs:reduced?240:cue.durationMs};
  setCardPlays(previous=>[...previous,effect].slice(-MAX_CARD_PLAY_CUES));
  audio.play(effect);
  const timer=setTimeout(()=>{effectTimers.current.delete(timer);setCardPlays(previous=>previous.filter(item=>item.id!==effect.id));},effect.durationMs);
  effectTimers.current.add(timer);
 }
 function refresh(){if(busy.current||queued.current)return;try{setEnvelope(loadRpgEnvelope());setError(null);}catch(e){setError(message(e));}}
 useEffect(()=>{const update=(e:StorageEvent)=>{if(e.key===STORAGE_KEY){try{setEnvelope(loadRpgEnvelope());if(!queued.current)setError('另一页面更新了记录，请确认进度后继续。');}catch(e){setError(message(e));}}};window.addEventListener('storage',update);return()=>window.removeEventListener('storage',update);},[]);
 useEffect(()=>{if(!pending&&!saving)return;const prevent=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',prevent);return()=>window.removeEventListener('beforeunload',prevent);},[pending,saving]);
 async function commit(submission:Submission){if(busy.current)return false;busy.current=true;if(submission.cue)audio.prepare();setSaving(true);try{const next=await withSaveLock(()=>persistRpg(submission.state,submission.action,submission.expected));setEnvelope(next);queued.current=null;setPending(null);setError(null);if(submission.cue)showCardPlay(submission.cue);navigate(`/story/${submission.state.id}`);return true;}catch(e){const reason=message(e);setError(reason);if(/保存失败|禁止访问|读取本地存档失败|无法使用本地存储|跨页面存档锁|写入已暂停/.test(reason)){queued.current=submission;setPending(submission.state);}else{queued.current=null;setPending(null);try{setEnvelope(loadRpgEnvelope());}catch{/* Damaged bytes remain untouched. */}}return false;}finally{busy.current=false;setSaving(false);}}
 async function start(character:CharacterConfig){if(busy.current||queued.current)return;try{await commit({state:createRpg(character),action:null,expected:0});}catch(e){setError(message(e));}}
 async function dispatch(state:RpgState,action:GameAction){if(busy.current||queued.current)return false;try{const next=resolveAction(state,action,state.revision);return await commit({state:next,action,expected:state.revision,cue:buildCardPlayCue(state,next,action)});}catch(e){setError(message(e));return false;}}
 async function remove(id:string){if(busy.current||queued.current)return false;busy.current=true;setSaving(true);try{setEnvelope(await withSaveLock(()=>removeRpg(id)));setError(null);return true;}catch(e){setError(message(e));return false;}finally{busy.current=false;setSaving(false);}}
 async function retry(){if(queued.current)await commit(queued.current);else refresh();}
 return <RpgContext.Provider value={{envelope,error,pending,saving,cardPlays,audio,start,dispatch,remove,retry,dismiss:()=>{if(!queued.current)setError(null);},refresh}}>{children}</RpgContext.Provider>;
}
