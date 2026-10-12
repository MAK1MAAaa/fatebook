import { useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { WORLD_ENTRIES } from "../../content/world";

export default function WorldNotebook() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const entries = WORLD_ENTRIES.filter(
    (entry) =>
      (category === "全部" || entry.category === category) &&
      `${entry.title}${entry.body}`.includes(query.trim()),
  );
  return (
    <div className="world-notebook">
      <p className="notebook-intro">
        随时查阅设定，关闭手册即可回到当前段落。资料含原作后期剧透。
      </p>
      <label className="notebook-search">
        <Search size={17} />
        <input
          aria-label="在随身手册中搜索"
          placeholder="搜索语言、流派、人物…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="notebook-categories" role="group" aria-label="手册分类">
        {["全部", "地理", "力量", "种族", "社会", "历史", "规则"].map(
          (name) => (
            <button
              key={name}
              aria-pressed={name === category}
              onClick={() => setCategory(name)}
            >
              {name}
            </button>
          ),
        )}
      </div>
      <p className="notebook-result-count" aria-live="polite">
        {entries.length} 条资料
      </p>
      {entries.map((entry) => (
        <details
          key={entry.id}
          className="notebook-entry"
          open={query.trim() ? true : undefined}
        >
          <summary>
            <span>{entry.category}</span>
            <strong>{entry.title}</strong>
          </summary>
          <div>
            <p className="notebook-source-kind">
              {entry.kind} · {entry.spoiler}
            </p>
            <p>{entry.body}</p>
            <a href={entry.source} target="_blank" rel="noopener noreferrer">
              查看资料来源 <ExternalLink size={12} />
            </a>
          </div>
        </details>
      ))}
      {entries.length === 0 && (
        <p className="notebook-intro">
          未找到相关资料，请尝试其他关键词或分类。
        </p>
      )}
    </div>
  );
}
