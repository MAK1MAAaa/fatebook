import { useState } from 'react';
import { portraitDefinition } from '../../rpg/portraits';

interface PortraitProps {
  name: string;
  portraitKey?: string;
  color?: string;
  enemy?: boolean;
  boss?: boolean;
  className?: string;
  sizes?: string;
  eager?: boolean;
}

export function Portrait({ name, portraitKey, color = '#aa8660', enemy = false, boss = false, className = '', sizes = '(max-width: 600px) 126px, 180px', eager = false }: PortraitProps) {
  const portrait = portraitDefinition(portraitKey);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const beast = enemy && /兽|蛇|犬|翼/.test(name);
  const construct = enemy && /傀儡|巨像|核心|残影|触须|守护者/.test(name);
  return <span className={`rpg-portrait rpg-art-portrait ${className}`} role="img" aria-label={`${name}立绘`}>
    {portrait && failedSource !== portrait.full ? <img
      src={portrait.thumb}
      srcSet={`${portrait.thumb} 160w, ${portrait.full} 640w`}
      sizes={sizes}
      alt=""
      width="640"
      height="960"
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      style={{ objectPosition: portrait.objectPosition }}
      onError={() => setFailedSource(portrait.full)}
    /> : <svg viewBox="0 0 160 130" aria-hidden="true"><path d="M15 114 42 56 61 68 86 24 130 88 145 114Z" fill={color} opacity=".1"/><circle cx="81" cy="64" r="47" fill={color} opacity=".08"/><path d="M46 125 56 91 80 83 104 91 115 125" fill={color} opacity=".55"/><path d={construct?'M56 38 81 24 108 38 108 77 82 94 56 76Z':beast?'M60 51 55 23 73 38 91 36 111 21 104 55 105 76 81 94 57 73Z':'M58 53 63 32 85 24 103 43 107 66 97 84 77 91 60 76Z'} fill={color}/><path d="M68 58 76 60M89 60 98 57" stroke="#f9e7c0" strokeWidth="4" strokeLinecap="round"/><path d="M38 124 30 84 38 75 48 111M114 122 133 47 137 49 127 124" fill={color} opacity=".7"/>{boss&&<path d="m51 28 8-19 16 12 14-18 15 18 15-8-9 23Z" fill="#d4b578"/>}<path d="M10 126h140" stroke={color} opacity=".3"/><text x="80" y="115" textAnchor="middle" fontSize="14" fill="#fff0cd">{name.slice(0,2)}</text></svg>}
  </span>;
}
export function RegionArtwork({chapter,places,onPlace,selected}:{chapter:number;places:string[];onPlace:(place:string)=>void;selected:string}){return <svg className="rpg-region-art" viewBox="0 0 620 250" role="group" aria-label="当前地区地点"><defs><pattern id="rpg-grid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="#9f875e" strokeWidth=".3" opacity=".15"/></pattern></defs><rect width="620" height="250" fill="url(#rpg-grid)"/><path d="m0 215 68-104 37 40 75-109 107 128 50-56 64 53 80-127 139 175" fill="#6b897d" opacity=".14"/><path d="M0 203Q140 95 242 178T620 140" fill="none" stroke="#879b9b" strokeWidth="16" opacity=".17"/><path d="m109 156 120-73 147 91 134-79" fill="none" stroke="#a48b5d" strokeDasharray="5 7" opacity=".6"/>{places.map((name,i)=>{const x=[109,229,376,510][i],y=[156,83,174,95][i];return <g key={name} tabIndex={0} role="button" aria-label={`查看${name}任务`} onClick={()=>onPlace(name)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onPlace(name);}}} className="map-place"><rect x={x-54} y={y-40} width="108" height="108" rx="12" fill="transparent"/><circle cx={x} cy={y} r="23" fill={selected===name?'#977849':'#ede4ce'} stroke="#b0996c"/><path d={`m${x-10} ${y+7}v-13l10-8 10 8v13Z`} fill={selected===name?'#f9e9c9':'#947850'}/><text x={x} y={y+45} textAnchor="middle" fill="#695638" fontSize="14">{name}</text></g>;})}<text x="20" y="28" fontSize="12" fill="#9d8967" letterSpacing="3">第 {chapter} 章 · 地区行动图</text></svg>;}
