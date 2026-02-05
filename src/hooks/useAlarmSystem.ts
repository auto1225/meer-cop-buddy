import { useState, useRef, useCallback, useEffect } from "react";
import { ALARM_SOUNDS, DEFAULT_ALARM_SOUND_ID, getAlarmSoundById, type AlarmSoundConfig } from "@/lib/alarmSounds";

interface UseAlarmSystemOptions {
  onAlarmStart?: () => void;
  onAlarmStop?: () => void;
}

export function useAlarmSystem({ onAlarmStart, onAlarmStop }: UseAlarmSystemOptions = {}) {
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

  // Play alarm with specific sound config
  const playAlarmSound = useCallback((config: AlarmSoundConfig) => {
    const ctx = getAudioContext();
    
    // Create oscillator for alarm tone
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    
    oscillator.type = config.oscillatorType;
    oscillator.frequency.value = config.baseFrequency;
    gain.gain.value = config.volume;
    
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    
    oscillatorRef.current = oscillator;
    gainRef.current = gain;
    frequencyRef.current = config.baseFrequency;
    
    oscillator.start();
    
    // Apply pattern based on config
    switch (config.pattern) {
      case 'siren':
        // Alternating between two frequencies
        let isHigh = true;
        alarmIntervalRef.current = setInterval(() => {
          if (oscillatorRef.current) {
            oscillatorRef.current.frequency.value = isHigh ? config.baseFrequency : config.altFrequency;
            isHigh = !isHigh;
          }
        }, config.interval);
        break;
        
      case 'beep':
        // On/off beeping
        let isOn = true;
        alarmIntervalRef.current = setInterval(() => {
          if (gainRef.current) {
            gainRef.current.gain.value = isOn ? config.volume : 0;
            isOn = !isOn;
          }
        }, config.interval);
        break;
        
      case 'pulse':
        // Smooth pulsing volume
        const pulseStep = () => {
          if (!gainRef.current || !audioContextRef.current) return;
          const time = audioContextRef.current.currentTime;
          gainRef.current.gain.value = (Math.sin(time * Math.PI * 2 / (config.interval / 1000)) + 1) * config.volume / 2;
          animationFrameRef.current = requestAnimationFrame(pulseStep);
        };
        pulseStep();
        break;
        
      case 'warble':
        // Rapid frequency wobble
        const warbleStep = () => {
          if (!oscillatorRef.current || !audioContextRef.current) return;
          const time = audioContextRef.current.currentTime;
          const freq = config.baseFrequency + Math.sin(time * Math.PI * 2 / (config.interval / 1000)) * (config.altFrequency - config.baseFrequency) / 2;
          oscillatorRef.current.frequency.value = freq;
          animationFrameRef.current = requestAnimationFrame(warbleStep);
        };
        warbleStep();
        break;
        
      case 'ascending':
        // Gradually ascending frequency
        const ascendStep = () => {
          if (!oscillatorRef.current || !audioContextRef.current) return;
          const time = audioContextRef.current.currentTime;
          const progress = (time * 1000 % config.interval) / config.interval;
          oscillatorRef.current.frequency.value = config.baseFrequency + (config.altFrequency - config.baseFrequency) * progress;
          animationFrameRef.current = requestAnimationFrame(ascendStep);
        };
        ascendStep();
        break;
        
      case 'descending':
        // Gradually descending frequency
        const descendStep = () => {
          if (!oscillatorRef.current || !audioContextRef.current) return;
          const time = audioContextRef.current.currentTime;
          const progress = (time * 1000 % config.interval) / config.interval;
          oscillatorRef.current.frequency.value = config.baseFrequency - (config.baseFrequency - config.altFrequency) * progress;
          animationFrameRef.current = requestAnimationFrame(descendStep);
        };
        descendStep();
        break;
    }
  }, [getAudioContext]);

  // Start alarm
  const startAlarm = useCallback(() => {
    if (!isAlarmEnabled) {
      // Even if sound is disabled, still show visual alarm
      setIsAlarming(true);
      onAlarmStart?.();
      return;
    }
    
    setIsAlarming(true);
    onAlarmStart?.();
    
    const soundConfig = getAlarmSoundById(selectedSoundId);
    playAlarmSound(soundConfig);
  }, [isAlarmEnabled, selectedSoundId, playAlarmSound, onAlarmStart]);

  // Stop alarm
  const stopAlarm = useCallback(() => {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    if (oscillatorRef.current) {
      try {
        oscillatorRef.current.stop();
      } catch (e) {
        // Already stopped
      }
      oscillatorRef.current = null;
    }
    
    gainRef.current = null;
    
    setIsAlarming(false);
    onAlarmStop?.();
  }, [onAlarmStop]);

  // Preview a sound (play for 2 seconds)
  const previewSound = useCallback((soundId: string) => {
    // Stop any existing sound first
    stopAlarm();
    
    const soundConfig = getAlarmSoundById(soundId);
    playAlarmSound(soundConfig);
    
    // Auto-stop after 2 seconds
    setTimeout(() => {
      if (oscillatorRef.current) {
        try {
          oscillatorRef.current.stop();
        } catch (e) {}
        oscillatorRef.current = null;
      }
      if (alarmIntervalRef.current) {
        clearInterval(alarmIntervalRef.current);
        alarmIntervalRef.current = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      gainRef.current = null;
    }, 2000);
  }, [playAlarmSound, stopAlarm]);

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
