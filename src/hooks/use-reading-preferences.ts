import { useState } from "react";

interface ReadingPreferences {
  size: 17 | 19 | 21;
  font: "serif" | "sans";
  focus: boolean;
}

const STORAGE_KEY = "six-faced-world:reading:v1";
const defaults: ReadingPreferences = { size: 17, font: "serif", focus: false };

function readPreferences(): ReadingPreferences {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!saved || typeof saved !== "object") return defaults;
    return {
      size: [17, 19, 21].includes(saved.size) ? saved.size : defaults.size,
      font: saved.font === "sans" ? "sans" : "serif",
      focus: saved.focus === true,
    };
  } catch {
    return defaults;
  }
}

export function useReadingPreferences() {
  const [preferences, setPreferences] = useState(readPreferences);
  const [remembered, setRemembered] = useState(true);
  function update(next: Partial<ReadingPreferences>) {
    const value = { ...preferences, ...next };
    setPreferences(value);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      setRemembered(true);
    } catch {
      setRemembered(false);
    }
  }
  return { preferences, update, remembered };
}
