import { useRpg } from "../../rpg/context";

export default function SavePauseNotice() {
  const { pending, saving, error, retry } = useRpg();
  if (!pending && !error) return null;
  return <div className="save-pause-notice" role="alert"><div><strong>{pending ? "保存未完成，操作已暂停" : "记录提示"}</strong>{error && <p>{error}</p>}</div><button type="button" disabled={saving} onClick={() => void retry()}>{saving ? "正在保存…" : pending ? "重试保存" : "重新读取"}</button></div>;
}
