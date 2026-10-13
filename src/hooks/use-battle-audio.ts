import { useCallback, useEffect, useRef, useState } from 'react';
import { BattleAudioPlayer, readBattleAudioPreferences, writeBattleAudioPreferences } from '../rpg/battle-audio';
import type { BattleAudioPreferences } from '../rpg/battle-audio';
import type { CardPlayCue } from '../rpg/card-play-effects';
import type { BattleFeedbackCue } from '../rpg/battle-feedback';

export function useBattleAudio() {
  const [preferences, setPreferences] = useState(readBattleAudioPreferences);
  const current = useRef(preferences);
  const player = useRef<BattleAudioPlayer | null>(null);
  useEffect(() => () => {
    player.current?.dispose();
    player.current = null;
  }, []);

  function prepare() {
    if (!current.current.enabled || current.current.volume <= 0) return;
    try {
      player.current ??= new BattleAudioPlayer(current.current);
      player.current.prepare();
    } catch { /* Audio must never prevent a saved game action. */ }
  }
  function play(cue: CardPlayCue) {
    try { player.current?.play(cue); } catch { /* Keep visual feedback if audio is unavailable. */ }
  }
  function playFeedback(cue: BattleFeedbackCue) {
    try { player.current?.playFeedback(cue); } catch { /* Keep visual feedback if audio is unavailable. */ }
  }
  const cancel = useCallback(() => {
    try { player.current?.cancel(); } catch { /* State changes remain independent from device cleanup. */ }
  }, []);
  function update(next: Partial<BattleAudioPreferences>) {
    const value = { ...current.current, ...next };
    current.current = value;
    setPreferences(value);
    writeBattleAudioPreferences(value);
    try { player.current?.setPreferences(value); } catch { /* Preferences still work without audio support. */ }
  }
  function setEnabled(enabled: boolean) {
    update({ enabled });
    if (enabled) prepare();
  }
  function setVolume(volume: number) {
    update({ volume: Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : current.current.volume });
    prepare();
  }
  const inspect = () => player.current?.inspect() ?? { state: 'idle' as const, activeVoices: 0 };
  return { preferences, prepare, play, playFeedback, cancel, setEnabled, setVolume, inspect };
}
