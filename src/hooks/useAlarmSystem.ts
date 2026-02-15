import { useState, useRef, useCallback, useEffect } from "react";
import { ALARM_SOUNDS, DEFAULT_ALARM_SOUND_ID, getAlarmSoundById, isCustomSound, getCustomSounds, type AlarmSoundConfig } from "@/lib/alarmSounds";

interface UseAlarmSystemOptions {
  onAlarmStart?: () => void;
  onAlarmStop?: () => void;
  volumePercent?: number;
}

export function useAlarmSystem({ onAlarmStart, onAlarmStop, volumePercent = 50 }: UseAlarmSystemOptions = {}) {
  const [isAlarmEnabled, setIsAlarmEnabled] = useState(true);
  const [isAlarming, setIsAlarming] = useState(false);
  const [selectedSoundId, setSelectedSoundId] = useState<string>(() => {
    // Load from localStorage if available
    if (typeof window !== 'undefined') {
      return localStorage.getItem('meercop-alarm-sound') || DEFAULT_ALARM_SOUND_ID;
    }
    return DEFAULT_ALARM_SOUND_ID;
  });
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const alarmIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const frequencyRef = useRef<number>(0);
  const customAudioRef = useRef<HTMLAudioElement | null>(null);

  // Save selected sound to localStorage
  useEffect(() => {
    localStorage.setItem('meercop-alarm-sound', selectedSoundId);
  }, [selectedSoundId]);

  // Get audio context
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  // Stop any currently playing sound
  const stopSound = useCallback(() => {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (oscillatorRef.current) {
      try { oscillatorRef.current.stop(); } catch (e) {}
      oscillatorRef.current = null;
    }
    if (customAudioRef.current) {
      customAudioRef.current.pause();
      customAudioRef.current.currentTime = 0;
      customAudioRef.current = null;
    }
    gainRef.current = null;
  }, []);

  // Play alarm with specific sound config
  const playAlarmSound = useCallback((config: AlarmSoundConfig) => {
    // Always stop previous sound first to prevent orphaned oscillators
    stopSound();
    const ctx = getAudioContext();
    
    // Apply volume multiplier from settings
    const volumeMultiplier = volumePercent / 100;
    
    // Create oscillator for alarm tone
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    
    oscillator.type = config.oscillatorType;
    oscillator.frequency.value = config.baseFrequency;
    gain.gain.value = config.volume * volumeMultiplier;
    
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    
    oscillatorRef.current = oscillator;
    gainRef.current = gain;
    frequencyRef.current = config.baseFrequency;
    
    oscillator.start();
    
    // Apply pattern based on config - 강력한 보안 경보 패턴
    switch (config.pattern) {
      case 'police':
        // 경찰 사이렌 - 부드럽게 오르내리는 주파수
        const policeStep = () => {
          if (!oscillatorRef.current || !audioContextRef.current) return;
          const time = audioContextRef.current.currentTime;
          const freq = config.baseFrequency + 
            Math.sin(time * Math.PI * 2 / (config.interval / 1000)) * 
            (config.altFrequency - config.baseFrequency) / 2;
          oscillatorRef.current.frequency.value = freq;
          animationFrameRef.current = requestAnimationFrame(policeStep);
        };
        policeStep();
        break;

      case 'klaxon':
        // 클랙슨 - 강한 on/off 비프
        let klaxonOn = true;
        alarmIntervalRef.current = setInterval(() => {
          if (gainRef.current) {
            gainRef.current.gain.value = klaxonOn ? config.volume : 0;
            klaxonOn = !klaxonOn;
          }
        }, config.interval);
        break;

      case 'air-raid':
        // 공습 사이렌 - 천천히 상승 후 하강
        const airRaidStep = () => {
          if (!oscillatorRef.current || !audioContextRef.current) return;
          const time = audioContextRef.current.currentTime;
          const cycle = (time * 1000 % config.interval) / config.interval;
          // 0->0.5: 상승, 0.5->1: 하강
          const freq = cycle < 0.5 
            ? config.baseFrequency + (config.altFrequency - config.baseFrequency) * (cycle * 2)
            : config.altFrequency - (config.altFrequency - config.baseFrequency) * ((cycle - 0.5) * 2);
          oscillatorRef.current.frequency.value = freq;
          animationFrameRef.current = requestAnimationFrame(airRaidStep);
        };
        airRaidStep();
        break;

      case 'intruder':
        // 침입자 경보 - 빠르게 교대하는 주파수
        let intruderHigh = true;
        alarmIntervalRef.current = setInterval(() => {
          if (oscillatorRef.current) {
            oscillatorRef.current.frequency.value = intruderHigh ? config.baseFrequency : config.altFrequency;
            intruderHigh = !intruderHigh;
          }
        }, config.interval);
        break;

      case 'panic':
        // 비상 경보 - 매우 빠른 교대 + 볼륨 펄스
        let panicState = 0;
        alarmIntervalRef.current = setInterval(() => {
          if (oscillatorRef.current && gainRef.current) {
            panicState = (panicState + 1) % 4;
            oscillatorRef.current.frequency.value = panicState < 2 ? config.baseFrequency : config.altFrequency;
            gainRef.current.gain.value = (panicState % 2 === 0) ? config.volume : config.volume * 0.7;
          }
        }, config.interval);
        break;

      case 'siren':
      default:
        // 기본 사이렌 - 두 주파수 교대
        let sirenHigh = true;
        alarmIntervalRef.current = setInterval(() => {
          if (oscillatorRef.current) {
            oscillatorRef.current.frequency.value = sirenHigh ? config.baseFrequency : config.altFrequency;
            sirenHigh = !sirenHigh;
          }
        }, config.interval);
        break;
    }
  }, [getAudioContext, stopSound, volumePercent]);

  // Play custom audio file
  const playCustomAudio = useCallback((dataUrl: string, loop: boolean = true) => {
    stopSound();
    const audio = new Audio(dataUrl);
    audio.loop = loop;
    audio.volume = volumePercent / 100;
    audio.play().catch(console.error);
    customAudioRef.current = audio;
  }, [stopSound, volumePercent]);

  // Start alarm
  const startAlarm = useCallback(() => {
    if (!isAlarmEnabled) {
      setIsAlarming(true);
      onAlarmStart?.();
      return;
    }

    if (isAlarming) return;
    
    setIsAlarming(true);
    onAlarmStart?.();
    
    if (isCustomSound(selectedSoundId)) {
      const custom = getCustomSounds().find(s => s.id === selectedSoundId);
      if (custom) {
        playCustomAudio(custom.audioDataUrl);
        return;
      }
    }
    
    const soundConfig = getAlarmSoundById(selectedSoundId);
    if (soundConfig) playAlarmSound(soundConfig);
  }, [isAlarmEnabled, isAlarming, selectedSoundId, playAlarmSound, playCustomAudio, onAlarmStart]);

  // Stop alarm
  const stopAlarm = useCallback(() => {
    stopSound();
    setIsAlarming(false);
    onAlarmStop?.();
  }, [stopSound, onAlarmStop]);

  // Preview a sound (play for 2 seconds)
  const previewSound = useCallback((soundId: string) => {
    if (isCustomSound(soundId)) {
      const custom = getCustomSounds().find(s => s.id === soundId);
      if (custom) {
        playCustomAudio(custom.audioDataUrl, false);
        setTimeout(() => stopSound(), 2000);
        return;
      }
    }
    const soundConfig = getAlarmSoundById(soundId);
    if (soundConfig) playAlarmSound(soundConfig);
    
    setTimeout(() => {
      stopSound();
    }, 2000);
  }, [playAlarmSound, playCustomAudio, stopSound]);

  // Toggle alarm enabled
  const toggleAlarmEnabled = useCallback(() => {
    setIsAlarmEnabled(prev => !prev);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAlarm();
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, [stopAlarm]);

  return {
    isAlarmEnabled,
    isAlarming,
    selectedSoundId,
    availableSounds: ALARM_SOUNDS,
    setAlarmEnabled: setIsAlarmEnabled,
    toggleAlarmEnabled,
    setSelectedSoundId,
    startAlarm,
    stopAlarm,
    previewSound,
  };
}
