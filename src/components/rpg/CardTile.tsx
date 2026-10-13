import { ArrowUp, Flame, Heart, Layers, Mountain, Shield, Sparkles, Swords, Waves, Wind, Zap } from "lucide-react";
import { cardFor } from "../../rpg/rulesets";
import { cardEffect, effectText } from "../../rpg/combat";
import { cardSchoolLabel } from "../../rpg/catalog";
import type { CardDefinition, CardEffect, OwnedCard, RpgState } from "../../rpg/types";

const icons = { fire: Flame, water: Waves, earth: Mountain, wind: Wind, healing: Heart, sword: Swords, waterSword: Shield, northSword: Swords, neutral: Shield, identity: Sparkles };

function CardEmblem({ card }: { card: CardDefinition }) {
  const SchoolIcon = icons[card.school];
  const MechanismIcon = card.effect.burn ? Flame : card.effect.heal ? Heart : card.effect.damage ? Swords : card.effect.block ? Shield : card.effect.draw ? Layers : Zap;
  const identity = card.school === "identity";
  return <div className={`card-illustration card-emblem school-${card.school}`} aria-hidden="true">
    <svg className="card-emblem-lines" viewBox="0 0 200 130" fill="none"><path d={identity ? "M100 7 144 35 163 79 137 112 100 123 63 112 37 79 56 35Z" : "M100 8 155 38 155 92 100 122 45 92 45 38Z"} /><circle cx="100" cy="65" r="41" /><circle cx="100" cy="65" r="33" strokeDasharray="3 7" /><path d="M0 65H41M159 65H200M100 0V21M100 109V130M18 12 58 35M182 12 142 35M18 118 58 95M182 118 142 95" /><path d="m22 65 9-5 9 5-9 5Zm138 0 9-5 9 5-9 5Z" /></svg>
    <SchoolIcon className="card-emblem-symbol" strokeWidth={1.3} />
    <span className="card-mechanism-seal"><MechanismIcon size={14} /></span>
  </div>;
}

function EffectLines({ effect }: { effect: CardEffect }) {
  return <span className="card-effects card-effect-lines">
    {!!effect.damage && <span><Swords />伤害 <b>{effect.damage}</b></span>}
    {!!effect.block && <span><Shield />格挡 <b>{effect.block}</b></span>}
    {!!effect.heal && <span><Heart />治疗 <b>{effect.heal}</b></span>}
    {!!effect.draw && <span><Layers />抽牌 <b>{effect.draw}</b></span>}
    {!!effect.energy && <span><Zap />行动力 <b>+{effect.energy}</b></span>}
    {!!effect.burn && <span><Flame />燃烧 <b>{effect.burn}</b></span>}
    {!!effect.weak && <span>虚弱 <b>{effect.weak}</b></span>}
    {!!effect.vulnerable && <span>易伤 <b>{effect.vulnerable}</b></span>}
    {effect.cleanse && <span><Sparkles />净化负面状态</span>}
  </span>;
}

export default function CardTile({ card, owned, state, selected, disabled, onClick, compact = false }: { card: CardDefinition; owned?: OwnedCard; state?: RpgState; selected?: boolean; disabled?: boolean; onClick?: () => void; compact?: boolean }) {
  card = cardFor(state, card.id);
  const effect = state ? cardEffect(state, owned ?? { uid: "preview", cardId: card.id, upgraded: false }) : card.effect;
  const keywords = [card.retain && "保留", card.exhaust && "消耗", effect.all && "全体"].filter(Boolean);
  const content = <>
    <span className="card-energy"><span className="sr-only">行动力</span>{card.cost}</span><span className="card-school">{cardSchoolLabel(card)}</span>
    <CardEmblem card={card} />
    <strong><span className="card-title-text">{card.name}</span>{owned?.upgraded && <ArrowUp className="card-upgrade-mark" aria-label="强化版" size={15} />}</strong>
    <EffectLines effect={effect} />
    <span className="card-keywords">{keywords.map(keyword => <span key={String(keyword)}>{keyword}</span>)}</span>
  </>;
  const props = { className: `rpg-card card-face ${compact ? "compact" : ""} ${selected ? "selected" : ""} ${owned?.upgraded ? "upgraded" : ""}`, style: { "--card-color": card.color } as React.CSSProperties };
  return onClick ? <button type="button" {...props} disabled={disabled} onClick={onClick} aria-pressed={selected} aria-label={`${card.name}${owned?.upgraded ? "强化" : ""}，${card.cost}行动力，${effectText(effect)}${keywords.length ? `，${keywords.join("、")}` : ""}`}>{content}</button> : <div {...props}>{content}</div>;
}

export function OwnedCardTile({ uid, state, ...props }: { uid: string; state: RpgState; selected?: boolean; disabled?: boolean; onClick?: () => void }) {
  const owned = state.collection.find(copy => copy.uid === uid);
  return owned ? <CardTile card={cardFor(state, owned.cardId)} owned={owned} state={state} {...props} /> : null;
}
