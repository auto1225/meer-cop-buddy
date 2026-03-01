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
    if (typeof window !== 'undefined') {
      return localStorage.getItem('meercop-alarm-sound') || DEFAULT_ALARM_SOUND_ID;
    }
    return DEFAULT_ALARM_SOUND_ID;
  });
  const pendingAlarmRef = useRef(false); // 자동재생 차단 시 대기 플래그
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const alarmIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const customAudioRef = useRef<HTMLAudioElement | null>(null);

  // Save selected sound to localStorage
  useEffect(() => {
    localStorage.setItem('meercop-alarm-sound', selectedSoundId);
  }, [selectedSoundId]);

  // Get audio context
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
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
    stopSound();
    const ctx = getAudioContext();
    
    const volumeMultiplier = volumePercent / 100;
    
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    
    oscillator.type = config.oscillatorType;
    oscillator.frequency.value = config.baseFrequency;
    gain.gain.value = config.volume * volumeMultiplier;
    
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    
    oscillatorRef.current = oscillator;
    gainRef.current = gain;
    
    oscillator.start();
    
    switch (config.pattern) {
      case 'police': {
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
      }

      case 'klaxon': {
        let klaxonOn = true;
        alarmIntervalRef.current = setInterval(() => {
          if (gainRef.current) {
            gainRef.current.gain.value = klaxonOn ? config.volume * volumeMultiplier : 0;
            klaxonOn = !klaxonOn;
          }
        }, config.interval);
        break;
      }

      case 'air-raid': {
        const airRaidStep = () => {
          if (!oscillatorRef.current || !audioContextRef.current) return;
          const time = audioContextRef.current.currentTime;
          const cycle = (time * 1000 % config.interval) / config.interval;
          const freq = cycle < 0.5 
            ? config.baseFrequency + (config.altFrequency - config.baseFrequency) * (cycle * 2)
            : config.altFrequency - (config.altFrequency - config.baseFrequency) * ((cycle - 0.5) * 2);
          oscillatorRef.current.frequency.value = freq;
          animationFrameRef.current = requestAnimationFrame(airRaidStep);
        };
        airRaidStep();
        break;
      }

      case 'intruder': {
        let intruderHigh = true;
        alarmIntervalRef.current = setInterval(() => {
          if (oscillatorRef.current) {
            oscillatorRef.current.frequency.value = intruderHigh ? config.baseFrequency : config.altFrequency;
            intruderHigh = !intruderHigh;
          }
        }, config.interval);
        break;
      }

      case 'panic': {
        let panicState = 0;
        alarmIntervalRef.current = setInterval(() => {
          if (oscillatorRef.current && gainRef.current) {
            panicState = (panicState + 1) % 4;
            oscillatorRef.current.frequency.value = panicState < 2 ? config.baseFrequency : config.altFrequency;
            gainRef.current.gain.value = (panicState % 2 === 0) ? config.volume * volumeMultiplier : config.volume * 0.7 * volumeMultiplier;
          }
        }, config.interval);
        break;
      }

      case 'siren':
      default: {
        let sirenHigh = true;
        alarmIntervalRef.current = setInterval(() => {
          if (oscillatorRef.current) {
            oscillatorRef.current.frequency.value = sirenHigh ? config.baseFrequency : config.altFrequency;
            sirenHigh = !sirenHigh;
          }
        }, config.interval);
        break;
      }
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
    
    const tryPlay = () => {
      if (isCustomSound(selectedSoundId)) {
        const custom = getCustomSounds().find(s => s.id === selectedSoundId);
        if (custom) {
          playCustomAudio(custom.audioDataUrl);
          return true;
        }
      }
      
      const soundConfig = getAlarmSoundById(selectedSoundId);
      const configToPlay = soundConfig || getAlarmSoundById(DEFAULT_ALARM_SOUND_ID);
      if (configToPlay) {
        try {
          playAlarmSound(configToPlay);
          return true;
        } catch {
          return false;
        }
      }
      return false;
    };

    // 즉시 재생 시도
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') {
      // 자동재생 차단됨 — 사용자 상호작용 대기
      ctx.close();
      pendingAlarmRef.current = true;
      console.log("[AlarmSystem] ⏳ Autoplay blocked — waiting for user interaction to play sound");
      
      const resumeOnInteraction = () => {
        if (pendingAlarmRef.current) {
          pendingAlarmRef.current = false;
          console.log("[AlarmSystem] 🔊 User interacted — playing pending alarm sound");
          tryPlay();
        }
        document.removeEventListener('click', resumeOnInteraction);
        document.removeEventListener('touchstart', resumeOnInteraction);
        document.removeEventListener('keydown', resumeOnInteraction);
      };
      
      document.addEventListener('click', resumeOnInteraction, { once: false });
      document.addEventListener('touchstart', resumeOnInteraction, { once: false });
      document.addEventListener('keydown', resumeOnInteraction, { once: false });
    } else {
      ctx.close();
      tryPlay();
    }
  }, [isAlarmEnabled, isAlarming, selectedSoundId, playAlarmSound, playCustomAudio, onAlarmStart]);

  // Stop alarm
  const stopAlarm = useCallback(() => {
    stopSound();
    pendingAlarmRef.current = false;
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

  // Update volume in real-time when volumePercent changes during playback
  useEffect(() => {
    const volumeMultiplier = volumePercent / 100;
    if (gainRef.current) {
      const soundConfig = getAlarmSoundById(selectedSoundId);
      const baseVolume = soundConfig?.volume ?? 0.5;
      gainRef.current.gain.value = baseVolume * volumeMultiplier;
    }
    if (customAudioRef.current) {
      customAudioRef.current.volume = volumeMultiplier;
    }
  }, [volumePercent, selectedSoundId]);

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
