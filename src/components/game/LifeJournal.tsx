import { useState } from "react";
import { CHAPTERS, STORY_BY_ID } from "../../content";
import { renderBody } from "../../game/engine";
import type { GameState } from "../../game/types";

export default function LifeJournal({ state }: { state: GameState }) {
  const [chapter, setChapter] = useState(0);
  const chapters = CHAPTERS.filter((item) =>
    state.history.some(
      (entry) => STORY_BY_ID[entry.nodeId]?.chapter === item.number,
    ),
  );
  const entries = state.history.filter(
    (entry) => chapter === 0 || STORY_BY_ID[entry.nodeId]?.chapter === chapter,
  );
  return (
    <section className="life-journal">
      <p className="notebook-intro">
        此生共 {state.step} 次抉择。这里保存已经发生的故事，可以重读，无法改写。
      </p>
      {chapters.length > 0 && (
        <div className="notebook-categories" role="group" aria-label="年表章节">
          {[{ number: 0, title: "全部" }, ...chapters].map((item) => (
            <button
              key={item.number}
              aria-pressed={chapter === item.number}
              onClick={() => setChapter(item.number)}
            >
              {item.title}
            </button>
          ))}
        </div>
      )}
      <div className="journal-entries">
        {entries.map((entry) => {
          const node = STORY_BY_ID[entry.nodeId];
          const body = node
            ? renderBody(node, { ...state, year: entry.year, age: entry.age })
            : "";
          return (
            <article key={entry.choiceId}>
              <span>
                甲龙历 {entry.year} · {entry.age}岁
              </span>
              <h3>{entry.title}</h3>
              <strong>{entry.choice}</strong>
              <p>{entry.feedback}</p>
              {body && (
                <details>
                  <summary>重读当时的故事</summary>
                  <div className="journal-prose">
                    {body.split(/\n+/).map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                  </div>
                </details>
              )}
            </article>
          );
        })}
        {entries.length === 0 && (
          <p className="notebook-intro">第一笔尚未落下，故事正在等待你。</p>
        )}
      </div>
    </section>
  );
}
