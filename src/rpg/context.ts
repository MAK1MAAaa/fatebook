import { createContext, useContext } from 'react';
import type { CharacterConfig, SaveEnvelope } from '../game/types';
import type { GameAction, RpgState } from './types';
export interface RpgStore {envelope:SaveEnvelope;error:string|null;pending:RpgState|null;saving:boolean;start:(c:CharacterConfig)=>Promise<void>;dispatch:(state:RpgState,action:GameAction)=>Promise<boolean>;remove:(id:string)=>Promise<boolean>;retry:()=>Promise<void>;dismiss:()=>void;refresh:()=>void;}
export const RpgContext=createContext<RpgStore|null>(null);
export function useRpg(){const store=useContext(RpgContext);if(!store)throw new Error('卡牌版未初始化。');return store;}
