import { Volume2, VolumeX } from 'lucide-react';
import type { BattleSoundSettings } from '../../rpg/context';
import './battle-audio-controls.css';

export default function BattleAudioControls({ audio }: { audio: BattleSoundSettings }) {
  const { enabled, volume } = audio.preferences;
  const audible = enabled && volume > 0;
  const Icon = audible ? Volume2 : VolumeX;
  return <div className="battle-audio-controls" aria-label="战斗音效设置">
    <button type="button" role="switch" aria-label="战斗音效" aria-checked={enabled} onClick={() => audio.setEnabled(!enabled)}>
      <Icon size={17} aria-hidden="true" />音效{enabled ? '开启' : '关闭'}
    </button>
    <label>音量<input type="range" aria-label="战斗音效音量" min="0" max="100" step="5" value={Math.round(volume * 100)} disabled={!enabled} onChange={event => audio.setVolume(Number(event.target.value) / 100)} /><span>{Math.round(volume * 100)}%</span></label>
  </div>;
}
