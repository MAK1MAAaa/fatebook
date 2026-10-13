import type { CSSProperties } from "react";
import { CARD_PLAY_IMPACT_MS, type CardPlayCue } from "../../rpg/card-play-effects";
import "./card-play-effects.css";

const schoolNames: Record<CardPlayCue["school"], string> = {
  fire: "火魔术", water: "水魔术", earth: "土魔术", wind: "风魔术", healing: "治疗魔术",
  sword: "剑神流", waterSword: "水神流", northSword: "北神流", neutral: "通用技法", identity: "身份技法",
};
const MAX_VISIBLE_CUES = 3;
type Mechanism = "damage" | "absorbed" | "burn" | "weak" | "vulnerable" | "block" | "heal" | "cleanse" | "draw" | "energy";
interface Feedback { mechanism: Mechanism; text: string; unchanged?: boolean; }

function cueStyle(cue: CardPlayCue, order = 0): CSSProperties {
  const impactDelay = cue.durationMs <= 240 ? 0 : CARD_PLAY_IMPACT_MS;
  return { "--cast-color": cue.color, "--cast-duration": `${cue.durationMs}ms`, "--cast-impact-delay": `${impactDelay}ms`, "--cast-feedback-duration": `${cue.durationMs - impactDelay}ms`, "--cast-order": order } as CSSProperties;
}
function cueClass(cue: CardPlayCue): string {
  return `cast-school-${cue.school} cast-actor-${cue.actor ?? "alliance"}${cue.upgraded ? " cast-upgraded" : ""}`;
}

function Star({ x, y, size = 5 }: { x: number; y: number; size?: number }) {
  return <path d={`M${x} ${y - size} ${x + size * .3} ${y - size * .3} ${x + size} ${y} ${x + size * .3} ${y + size * .3} ${x} ${y + size} ${x - size * .3} ${y + size * .3} ${x - size} ${y} ${x - size * .3} ${y - size * .3}Z`} />;
}

function IdentitySigil({ actor }: { actor: CardPlayCue["actor"] }) {
  switch (actor) {
    case "rudeus": return <><path className="cast-core-fill" d="m60 29 28 16v30L60 91 32 75V45Z" /><path d="m60 29 0 31 28 15M60 60 32 75M60 60V91M32 45 60 60 88 45" /><circle cx="60" cy="60" r="43" strokeDasharray="12 5 3 5" /><path d="M10 60h10m80 0h10M60 10v10m0 80v10" /></>;
    case "eris": return <><path className="cast-cut cast-cut-first" d="M15 96 96 15 55 72Z" /><path className="cast-cut cast-cut-second" d="M29 109 109 29 69 82Z" /><path d="m51 65 14 14m-25-3 14 14m-22-6 8 8" /><path className="cast-core-fill" d="M24 55c-4-14 8-25 16-37-1 21 8 19 7 36" /></>;
    case "sylphie": return <><path className="cast-wind-line" d="M22 63C1 22 63 7 78 27c23 33-14 72-42 57-26-14 1-47 23-31 11 8 2 22-10 19" /><path className="cast-core-fill" d="M83 83c-20-9-10-35 16-41 2 22-2 35-16 41Z" /><path d="m68 97 27-42" /><Star x={27} y={34} size={7} /><Star x={91} y={25} /></>;
    case "roxy": return <><circle cx="60" cy="60" r="40" /><path d="M60 15v90M21 38l78 44M21 82l78-44M50 22l10 10 10-10M50 98l10-10 10 10M25 49l13-4-2-13M95 71l-13 4 2 13M25 71l13 4-2 13M95 49l-13-4 2-13" /><path className="cast-core-fill" d="m60 43 15 17-15 17-15-17Z" /></>;
    case "custom": return <><circle cx="60" cy="60" r="43" strokeDasharray="6 5" /><path d="m60 22 30 38-30 38-30-38Zm-28 10 56 56m0-56L32 88" /><path className="cast-core-fill" d="m60 42 18 18-18 18-18-18Z" /><Star x={17} y={60} /><Star x={103} y={60} /><Star x={60} y={17} /><Star x={60} y={103} /></>;
    default: return <><circle cx="60" cy="60" r="37" /><path d="M60 17 101 47 85 96H35L19 47ZM60 17 35 96 101 47H19l66 49Z" />{[[60, 17], [101, 47], [85, 96], [35, 96], [19, 47]].map(([cx, cy]) => <circle key={cx} className="cast-core-fill" cx={cx} cy={cy} r="5" />)}</>;
  }
}

function SchoolSigil({ cue, className = "" }: { cue: CardPlayCue; className?: string }) {
  return <svg className={`cast-school-sigil ${className}`} viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {cue.school === "fire" && <>{!!cue.effect.damage && <><circle className="cast-fire-orb" cx="60" cy="66" r="22" /><path className="cast-fire-trail" d="M16 83c15-6 22-3 38-19M16 70c12 1 19-2 27-8" /></>}<path className="cast-fire-flame cast-core-fill" d="M62 104C22 103 19 73 38 54c-2 14 9 15 12 6 4-13-7-22 13-46-2 25 21 32 24 53 4-5 8-11 7-20 19 28 8 55-32 57Z" /><path className="cast-fire-heart" d="M62 91c-18-2-22-13-13-24 3 8 9 3 10-5 1-7 1-15 7-24 0 16 18 23 13 40-3 8-8 12-17 13Z" />{[[29, 33], [91, 24], [15, 62], [108, 74]].map(([cx, cy]) => <circle className="cast-ember" key={cx} cx={cx} cy={cy} r="2" />)}</>}
    {cue.school === "water" && <><ellipse className="cast-water-ring" cx="60" cy="77" rx="48" ry="17" /><ellipse className="cast-water-ring cast-water-ring-inner" cx="60" cy="77" rx="33" ry="10" /><path className="cast-water-wave" d="M14 62C30 43 43 83 59 62S87 40 106 60M20 85c15-17 25 14 40-1s27-13 40 0" /><path className="cast-ice cast-core-fill" d="m49 20 17-11 12 38-15 21-13-22Zm-24 17 13-7 7 23-8 14-9-13Zm64-1 10 7-4 27-11-8Z" /></>}
    {cue.school === "earth" && <><ellipse cx="60" cy="91" rx="46" ry="12" strokeDasharray="17 7" /><path className="cast-earth-pillar cast-core-fill" d="m41 90 1-41 17-28 23 13 4 54-22 13Zm1-41 22 9 18-24M64 58v43" /><path className="cast-earth-shard cast-core-fill" d="m16 59 11-10 12 9-5 20-14-2Zm72 3 11-9 10 9-4 22-16 1Z" /><path className="cast-earth-crack" d="m16 98 23-7-7-9m48 19 16-10 15 4" /></>}
    {cue.school === "wind" && <><path className="cast-wind-line" d="M22 65C6 20 56 6 84 24c41 25 15 79-23 76-29-3-43-34-24-51 17-15 47-1 42 19-3 14-26 19-34 2" /><path className="cast-wind-line cast-wind-line-inner" d="M98 24c23 41-10 73-49 66M14 87c-19-32 2-58 27-66" /><path d="m14 40 13 3-5-12m78 49-13-1 6 10" /><Star x={91} y={42} /><Star x={37} y={102} /></>}
    {cue.school === "sword" && <><path className="cast-cut cast-cut-first" d="M11 100C46 77 68 43 107 15 88 55 57 83 11 100Z" /><path className="cast-cut cast-cut-second" d="M24 111C58 89 91 49 113 35" /><path className="cast-cut cast-cut-third" d="M7 72 79 9" /></>}
    {cue.school === "waterSword" && <><circle className="cast-water-ring" cx="60" cy="60" r="40" /><path className="cast-core-fill" d="M60 27 84 38v26c-2 15-13 22-24 29-11-7-22-14-24-29V38Z" /><path d="M44 65c14-18 26 18 35-6M43 50h34" /><path className="cast-counter-cut" d="M17 90C-5 33 67-7 106 28l-19-1m19 1-7-17M17 90c26 18 58 13 80-8" /></>}
    {cue.school === "northSword" && <><path className="cast-ambush-line" d="M7 34h60M14 48h76M8 65h42" strokeDasharray="13 7" /><path className="cast-cut cast-cut-first" d="m43 97 65-77-24 65Z" /><path className="cast-ambush-shadow" d="m25 94 65-77-24 65ZM8 91l65-77-24 65Z" /><path d="m79 80 15 12-12 15" /></>}
    {cue.school === "healing" && <><circle cx="60" cy="60" r="38" strokeDasharray="8 5" /><path className="cast-heal-cross cast-core-fill" d="M51 30h18v21h21v18H69v21H51V69H30V51h21Z" /><Star x={21} y={25} size={7} /><Star x={95} y={28} size={7} /><Star x={22} y={97} /><Star x={98} y={93} /></>}
    {cue.school === "identity" && <IdentitySigil actor={cue.actor} />}
    {cue.school === "neutral" && <><circle cx="60" cy="60" r="39" strokeDasharray="15 6" />{cue.effect.damage ? <path className="cast-cut cast-cut-first" d="m29 87 50-56 12-2-2 12-55 51Zm-1-13 20 19" /> : cue.effect.block ? <path className="cast-core-fill" d="M60 25 85 39v29c-4 16-17 22-25 28-8-6-21-12-25-28V39Z" /> : <><path className="cast-core-fill" d="M27 34c13-5 22-1 33 5 11-6 20-10 33-5v47c-14-5-23-1-33 5-10-6-19-10-33-5Z" /><path d="M60 39v47M37 47l13 5m-13 7 13 5m20-12 13-5m-13 17 13-5" /></>}</>}
  </svg>;
}

function MechanismGlyph({ mechanism }: { mechanism: Mechanism }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {(mechanism === "block" || mechanism === "absorbed") && <path d="m12 3 8 4v6c-1 4-4 6-8 8-4-2-7-4-8-8V7Zm-4 9 3 3 5-6" />}
    {mechanism === "heal" && <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z" />}
    {mechanism === "draw" && <><path d="M8 5h12v16H8Z" /><path d="M5 18H3V2h12v1M12 10h4m-4 4h4" /></>}
    {mechanism === "energy" && <path d="m14 2-9 12h6l-1 8 9-12h-6Z" />}
    {mechanism === "cleanse" && <><path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" /><path d="M4 3v3m-1-1h3m13 15h3m-1-2v3" /></>}
    {mechanism === "burn" && <path d="M12 22c-8-1-10-7-6-12 0 5 4 4 4 0-1-3 0-5 4-8-1 5 5 8 5 13 0 4-3 7-7 7Z" />}
    {mechanism === "weak" && <><path d="m4 5 6 6-4 3 4 5m10-14-6 6 4 3-4 5" /><path d="M12 3v3m0 12v3" /></>}
    {mechanism === "vulnerable" && <><path d="m12 3 8 4v6c-1 4-4 6-8 8-4-2-7-4-8-8V7Z" /><path d="m14 5-4 6 4 3-5 6" /></>}
    {mechanism === "damage" && <path d="m5 20 13-15 3-2-1 5L7 22Zm-2-5 6 5" />}
  </svg>;
}

function heroFeedback(cue: CardPlayCue): Feedback[] {
  const effects: Feedback[] = [];
  if (cue.effect.block) effects.push({ mechanism: "block", text: cue.hero.block ? `格挡 +${cue.hero.block}` : "格挡 · 无有效变化", unchanged: !cue.hero.block });
  if (cue.effect.heal) effects.push({ mechanism: "heal", text: cue.hero.heal ? `治疗 +${cue.hero.heal}` : "治疗 · 无有效变化", unchanged: !cue.hero.heal });
  if (cue.effect.cleanse) effects.push({ mechanism: "cleanse", text: cue.hero.cleanse ? `净化 ${cue.hero.cleanse}` : "净化 · 无负面状态", unchanged: !cue.hero.cleanse });
  if (cue.effect.draw) effects.push({ mechanism: "draw", text: cue.hero.draw ? `抽牌 +${cue.hero.draw}` : "抽牌 · 无有效变化", unchanged: !cue.hero.draw });
  if (cue.effect.energy) effects.push({ mechanism: "energy", text: cue.hero.energy ? `回能 +${cue.hero.energy}` : "回能 · 无有效变化", unchanged: !cue.hero.energy });
  return effects;
}
function targetFeedback(cue: CardPlayCue, uid: string): Feedback[] {
  const target = cue.targets.find(item => item.uid === uid);
  if (!target) return [];
  const effects: Feedback[] = [];
  // A fully absorbed attack is a shield impact, not a health-damage hit.
  if (cue.effect.damage && (target.damage || !target.absorbed)) effects.push({ mechanism: "damage", text: `伤害 ${target.damage}`, unchanged: !target.damage });
  if (target.absorbed) effects.push({ mechanism: "absorbed", text: `格挡吸收 ${target.absorbed}` });
  if (cue.effect.burn) effects.push({ mechanism: "burn", text: target.burn ? `燃烧 +${target.burn}` : "燃烧 · 无有效变化", unchanged: !target.burn });
  if (cue.effect.weak) effects.push({ mechanism: "weak", text: target.weak ? `虚弱 +${target.weak}` : "虚弱 · 无有效变化", unchanged: !target.weak });
  if (cue.effect.vulnerable) effects.push({ mechanism: "vulnerable", text: target.vulnerable ? `易伤 +${target.vulnerable}` : "易伤 · 无有效变化", unchanged: !target.vulnerable });
  return effects;
}

function CastAnnouncement({ cue }: { cue: CardPlayCue }) {
  return <div className="card-cast-announcement"><span>{schoolNames[cue.school]}{cue.upgraded ? " · 强化" : ""}{cue.all ? " · 全体" : ""}</span><strong>{cue.cardName}</strong><SchoolSigil cue={cue} className="cast-announcement-sigil" /></div>;
}

export function CardCastAnnouncements({ cues }: { cues: readonly CardPlayCue[] }) {
  return <div className="card-cast-announcements" aria-hidden="true">{cues.slice(-1).map(cue => <div key={cue.id} className={`card-cast-announcement-event ${cueClass(cue)}`} style={cueStyle(cue)}><CastAnnouncement cue={cue} /></div>)}</div>;
}

export function BattleCastEffects({ cues, showAnnouncement = true }: { cues: readonly CardPlayCue[]; showAnnouncement?: boolean }) {
  return <div className="card-cast-stage" aria-hidden="true">{cues.slice(-MAX_VISIBLE_CUES).map(cue => <div key={cue.id} className={`card-cast-event ${cueClass(cue)}`} style={cueStyle(cue)}>
    <div className="card-cast-launch"><span className="cast-launch-rune" /><SchoolSigil cue={cue} /><span className="cast-launch-trail" /></div>
    <svg className="card-cast-circle" viewBox="0 0 240 140" fill="none" stroke="currentColor" aria-hidden="true"><ellipse cx="120" cy="70" rx="96" ry="49" /><ellipse cx="120" cy="70" rx="78" ry="37" strokeDasharray="9 5" /><path d="m120 21 70 74H50Zm0 98L50 45h140ZM24 70h18m156 0h18M120 9v12m0 98v12" />{[[45, 37], [195, 37], [24, 70], [216, 70], [45, 103], [195, 103]].map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3" />)}</svg>
    {cue.all && <><span className="card-cast-wide-wave" /><span className="card-cast-wide-wave cast-wave-second" /></>}
    {showAnnouncement && cue === cues.at(-1) && <CastAnnouncement cue={cue} />}
  </div>)}</div>;
}

export function UnitCardEffects({ cues, targetId }: { cues: readonly CardPlayCue[]; targetId: "hero" | string }) {
  const relevant = cues.map(cue => ({ cue, target: cue.targets.find(target => target.uid === targetId), feedback: targetId === "hero" ? heroFeedback(cue) : targetFeedback(cue, targetId) })).filter(item => item.feedback.length > 0);
  const latest = relevant.at(-1)?.cue;
  return <div className={`unit-card-effects ${targetId === "hero" ? "unit-effects-hero" : "unit-effects-enemy"}`} aria-hidden="true">{relevant.slice(-MAX_VISIBLE_CUES).map(({ cue, target, feedback }, order) => <div key={cue.id} className={`unit-cast-event ${cueClass(cue)}${target?.damage ? " cast-hit" : target?.absorbed ? " cast-blocked" : target ? " cast-status-only" : " cast-self-buff"}${target?.defeated ? " cast-defeating" : ""}`} style={cueStyle(cue, order)}>
    {!!target?.damage && <><span className="cast-impact-ring" /><svg className="cast-impact-burst" viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="m60 8 4 36 25-25-20 32 43 9-43 8 20 29-25-22-4 37-5-37-26 22 21-29L8 60l42-9-20-32 25 25Z" /><circle cx="60" cy="60" r="18" /></svg></>}
    {!!target?.absorbed && <svg className={`cast-absorb-shield${target.damage ? " cast-absorb-partial" : ""}`} viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M60 15 97 34v32c-4 23-24 36-37 43-13-7-33-20-37-43V34Z" /><path d="m43 60 12 13 25-27M11 47l12 4m-9 24 12-3m70-21 13-4m-15 25 12 3" /></svg>}
    {target?.defeated && <span className="cast-defeat-mark">击破</span>}
    <SchoolSigil cue={cue} />
    {cue === latest && <div className="cast-mechanism-orbit">{feedback.map(item => <span key={item.mechanism} className={`cast-mechanism-seal mechanism-${item.mechanism}${item.unchanged ? " cast-unchanged" : ""}`}><MechanismGlyph mechanism={item.mechanism} /></span>)}</div>}
    {targetId === "hero" && <div className="cast-hero-auras">{feedback.map(item => <span key={item.mechanism} className={`cast-hero-aura mechanism-${item.mechanism}${item.unchanged ? " cast-unchanged" : ""}`} />)}</div>}
    {cue === latest && <div className="cast-feedback-list">{feedback.map((item, index) => <span key={item.mechanism} className={`cast-feedback mechanism-${item.mechanism}${item.unchanged ? " cast-unchanged" : ""}`} style={{ "--feedback-index": index } as CSSProperties}><MechanismGlyph mechanism={item.mechanism} /><strong>{item.text}</strong></span>)}</div>}
  </div>)}</div>;
}
