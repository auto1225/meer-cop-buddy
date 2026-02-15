// 10가지 보안 경보음 정의 - 도둑 경고 및 주변 알림용
export interface AlarmSoundConfig {
  id: string;
  name: string;
  nameKo: string;
  oscillatorType: OscillatorType;
  baseFrequency: number;
  altFrequency: number;
  interval: number;
  volume: number;
  pattern: 'police' | 'klaxon' | 'air-raid' | 'intruder' | 'panic' | 'siren';
}

export const ALARM_SOUNDS: AlarmSoundConfig[] = [
  {
    id: 'police-siren',
    name: 'Police Siren',
    nameKo: '🚨 경찰 사이렌',
    oscillatorType: 'sawtooth',
    baseFrequency: 700,
    altFrequency: 1100,
    interval: 600,
    volume: 0.5,
    pattern: 'police',
  },
  {
    id: 'security-alarm',
    name: 'Security Alarm',
    nameKo: '🔔 보안 경보',
    oscillatorType: 'square',
    baseFrequency: 880,
    altFrequency: 0,
    interval: 150,
    volume: 0.5,
    pattern: 'klaxon',
  },
  {
    id: 'air-raid',
    name: 'Air Raid Siren',
    nameKo: '⚠️ 공습 사이렌',
    oscillatorType: 'sawtooth',
    baseFrequency: 400,
    altFrequency: 800,
    interval: 3000,
    volume: 0.45,
    pattern: 'air-raid',
  },
  {
    id: 'intruder-alert',
    name: 'Intruder Alert',
    nameKo: '🚷 침입자 경보',
    oscillatorType: 'square',
    baseFrequency: 1000,
    altFrequency: 500,
    interval: 250,
    volume: 0.5,
    pattern: 'intruder',
  },
  {
    id: 'panic-alarm',
    name: 'Panic Alarm',
    nameKo: '🆘 비상 경보',
    oscillatorType: 'square',
    baseFrequency: 1200,
    altFrequency: 800,
    interval: 100,
    volume: 0.5,
    pattern: 'panic',
  },
  {
    id: 'car-alarm',
    name: 'Car Alarm',
    nameKo: '🚗 차량 경보',
    oscillatorType: 'square',
    baseFrequency: 900,
    altFrequency: 700,
    interval: 300,
    volume: 0.5,
    pattern: 'siren',
  },
  {
    id: 'emergency-horn',
    name: 'Emergency Horn',
    nameKo: '📢 긴급 경적',
    oscillatorType: 'sawtooth',
    baseFrequency: 500,
    altFrequency: 0,
    interval: 400,
    volume: 0.55,
    pattern: 'klaxon',
  },
  {
    id: 'theft-deterrent',
    name: 'Theft Deterrent',
    nameKo: '🛡️ 도난 방지음',
    oscillatorType: 'square',
    baseFrequency: 1500,
    altFrequency: 600,
    interval: 200,
    volume: 0.5,
    pattern: 'intruder',
  },
  {
    id: 'loud-klaxon',
    name: 'Loud Klaxon',
    nameKo: '📣 대형 클랙슨',
    oscillatorType: 'sawtooth',
    baseFrequency: 350,
    altFrequency: 450,
    interval: 500,
    volume: 0.6,
    pattern: 'klaxon',
  },
  {
    id: 'triple-threat',
    name: 'Triple Threat',
    nameKo: '⚡ 트리플 경보',
    oscillatorType: 'square',
    baseFrequency: 1100,
    altFrequency: 550,
    interval: 180,
    volume: 0.5,
    pattern: 'panic',
  },
];

export const DEFAULT_ALARM_SOUND_ID = 'police-siren';

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
