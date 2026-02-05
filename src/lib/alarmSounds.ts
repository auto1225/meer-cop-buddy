// 10가지 경보음 정의
export interface AlarmSoundConfig {
  id: string;
  name: string;
  nameKo: string;
  oscillatorType: OscillatorType;
  baseFrequency: number;
  altFrequency: number;
  interval: number;
  volume: number;
  pattern?: 'siren' | 'beep' | 'pulse' | 'warble' | 'ascending' | 'descending';
}

export const ALARM_SOUNDS: AlarmSoundConfig[] = [
  {
    id: 'classic-siren',
    name: 'Classic Siren',
    nameKo: '클래식 사이렌',
    oscillatorType: 'square',
    baseFrequency: 800,
    altFrequency: 600,
    interval: 500,
    volume: 0.3,
    pattern: 'siren',
  },
  {
    id: 'urgent-beep',
    name: 'Urgent Beep',
    nameKo: '긴급 비프',
    oscillatorType: 'square',
    baseFrequency: 1000,
    altFrequency: 0,
    interval: 200,
    volume: 0.25,
    pattern: 'beep',
  },
  {
    id: 'soft-pulse',
    name: 'Soft Pulse',
    nameKo: '부드러운 펄스',
    oscillatorType: 'sine',
    baseFrequency: 440,
    altFrequency: 880,
    interval: 800,
    volume: 0.2,
    pattern: 'pulse',
  },
  {
    id: 'warble',
    name: 'Warble',
    nameKo: '워블',
    oscillatorType: 'triangle',
    baseFrequency: 600,
    altFrequency: 900,
    interval: 100,
    volume: 0.25,
    pattern: 'warble',
  },
  {
    id: 'ascending',
    name: 'Ascending Alarm',
    nameKo: '상승 알람',
    oscillatorType: 'sawtooth',
    baseFrequency: 300,
    altFrequency: 1200,
    interval: 1500,
    volume: 0.2,
    pattern: 'ascending',
  },
  {
    id: 'descending',
    name: 'Descending Alarm',
    nameKo: '하강 알람',
    oscillatorType: 'sawtooth',
    baseFrequency: 1200,
    altFrequency: 300,
    interval: 1500,
    volume: 0.2,
    pattern: 'descending',
  },
  {
    id: 'rapid-fire',
    name: 'Rapid Fire',
    nameKo: '급속 연사',
    oscillatorType: 'square',
    baseFrequency: 1200,
    altFrequency: 0,
    interval: 100,
    volume: 0.2,
    pattern: 'beep',
  },
  {
    id: 'deep-alert',
    name: 'Deep Alert',
    nameKo: '저음 경보',
    oscillatorType: 'sine',
    baseFrequency: 200,
    altFrequency: 300,
    interval: 600,
    volume: 0.35,
    pattern: 'siren',
  },
  {
    id: 'high-pitch',
    name: 'High Pitch',
    nameKo: '고음 경고',
    oscillatorType: 'triangle',
    baseFrequency: 1500,
    altFrequency: 1800,
    interval: 300,
    volume: 0.2,
    pattern: 'siren',
  },
  {
    id: 'retro-game',
    name: 'Retro Game',
    nameKo: '레트로 게임',
    oscillatorType: 'square',
    baseFrequency: 523,
    altFrequency: 659,
    interval: 150,
    volume: 0.15,
    pattern: 'warble',
  },
];

export const DEFAULT_ALARM_SOUND_ID = 'classic-siren';

export function getAlarmSoundById(id: string): AlarmSoundConfig {
  return ALARM_SOUNDS.find(s => s.id === id) || ALARM_SOUNDS[0];
}
