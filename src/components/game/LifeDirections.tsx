import type { MouseEventHandler } from "react";
import { Check, ChevronDown, Circle, Sprout } from "lucide-react";
import { getLifeDirections } from "../../game/insights";
import type { GameState } from "../../game/types";

export default function LifeDirections({
  state,
  compact = false,
  onExpand,
}: {
  state: GameState;
  compact?: boolean;
  onExpand?: MouseEventHandler<HTMLButtonElement>;
}) {
  const directions = getLifeDirections(state);
  const visible = compact
    ? directions
        .filter((item) => item.total > 0)
        .sort((a, b) => b.met / b.total - a.met / a.total)
        .slice(0, 3)
    : directions;
  return (
    <section
      className={`life-directions ${compact ? "compact-directions" : ""}`}
    >
      {compact ? (
        <h3>
          <Sprout size={15} />
          正在生长的可能
        </h3>
      ) : (
        <p className="notebook-intro">
          这些方向来自你此生的经历。条件备齐后，可在终章选择收束；当前条件尚不代表必然抵达。
        </p>
      )}
      {visible.map(({ ending, requirements, met, total, ready }) => (
        <details
          className={`direction-card ${ready ? "direction-ready" : ""}`}
          key={ending.id}
        >
          <summary>
            <span>
              <strong>{ending.title}</strong>
              <small>
                {total === 0
                  ? "幸存到终章即可"
                  : `${met} / ${total} 项条件已满足`}
              </small>
            </span>
            {ready ? <Check size={16} /> : <ChevronDown size={16} />}
            <span className="direction-meter" aria-hidden="true">
              <i style={{ width: `${total ? (met / total) * 100 : 100}%` }} />
            </span>
          </summary>
          <div className="direction-detail">
            <p>{ending.subtitle}</p>
            {requirements.length ? (
              <ul>
                {requirements.map((item, index) => (
                  <li key={index} className={item.met ? "met" : "unmet"}>
                    {item.met ? <Check size={13} /> : <Circle size={11} />}
                    <span>{item.label}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>为这一生留下一条平静的退路。</p>
            )}
            {ready && total > 0 && (
              <p className="direction-ready-note">
                已具备当前所需条件，终章可选择此方向。
              </p>
            )}
          </div>
        </details>
      ))}
      {compact && (
        <button className="text-button direction-expand" onClick={onExpand}>
          查看全部人生方向 <span>10</span>
        </button>
      )}
    </section>
  );
}
