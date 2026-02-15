// 모바일 앱과 동기화된 경보음 목록
export interface AlarmSoundConfig {
  id: string;
  name: string;
  nameKo: string;
  frequencies: number[];
  pattern: number[]; // duration per frequency step (seconds)
  volume: number;
}

// 모바일 앱(Settings.tsx)의 ALARM_SOUNDS와 동일한 목록
export const ALARM_SOUNDS: AlarmSoundConfig[] = [
  {
    id: 'whistle',
    name: 'Whistle',
    nameKo: '🎵 호루라기',
    frequencies: [2200, 1800],
    pattern: [0.15, 0.1],
    volume: 0.5,
  },
  {
    id: 'siren',
    name: 'Siren',
    nameKo: '🚨 사이렌',
    frequencies: [660, 880],
    pattern: [0.3, 0.3],
    volume: 0.5,
  },
  {
    id: 'bird',
    name: 'Bird',
    nameKo: '🐦 새소리',
    frequencies: [1400, 1800, 2200],
    pattern: [0.1, 0.08, 0.12],
    volume: 0.5,
  },
  {
    id: 'police',
    name: 'Police Siren',
    nameKo: '🚔 경찰 사이렌',
    frequencies: [600, 1200],
    pattern: [0.5, 0.5],
    volume: 0.5,
  },
  {
    id: 'radio',
    name: 'Radio',
    nameKo: '📻 전파음',
    frequencies: [440, 520, 600],
    pattern: [0.2, 0.15, 0.2],
    volume: 0.5,
  },
  {
    id: 'quiet',
    name: 'Quiet Siren',
    nameKo: '🔕 조용한 사이렌',
    frequencies: [400, 500],
    pattern: [0.4, 0.4],
    volume: 0.3,
  },
];

export const DEFAULT_ALARM_SOUND_ID = 'whistle';

// Custom sound stored in localStorage
const CUSTOM_SOUND_STORAGE_KEY = 'meercop-custom-alarm-sounds';

export interface CustomAlarmSound {
  id: string;
  nameKo: string;
  audioDataUrl: string; // base64 data URL
}

export function getCustomSounds(): CustomAlarmSound[] {
  try {
    const stored = localStorage.getItem(CUSTOM_SOUND_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function saveCustomSound(sound: CustomAlarmSound): void {
  const existing = getCustomSounds();
  const updated = [...existing.filter(s => s.id !== sound.id), sound];
  localStorage.setItem(CUSTOM_SOUND_STORAGE_KEY, JSON.stringify(updated));
}

export function deleteCustomSound(id: string): void {
  const existing = getCustomSounds();
  localStorage.setItem(CUSTOM_SOUND_STORAGE_KEY, JSON.stringify(existing.filter(s => s.id !== id)));
}

export function isCustomSound(id: string): boolean {
  return id.startsWith('custom-');
}

export function getAlarmSoundById(id: string): AlarmSoundConfig | null {
  return ALARM_SOUNDS.find(s => s.id === id) || null;
}

export function getSelectedSoundName(id: string): string {
  const built = ALARM_SOUNDS.find(s => s.id === id);
  if (built) return built.nameKo;
  const custom = getCustomSounds().find(s => s.id === id);
  if (custom) return custom.nameKo;
  return ALARM_SOUNDS[0].nameKo;
}
