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
  const alarmIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const customAudioRef = useRef<HTMLAudioElement | null>(null);

  // Save selected sound to localStorage
  useEffect(() => {
    localStorage.setItem('meercop-alarm-sound', selectedSoundId);
  }, [selectedSoundId]);

  // Get audio context (always create fresh since stopSound closes it)
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
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
    if (customAudioRef.current) {
      customAudioRef.current.pause();
      customAudioRef.current.currentTime = 0;
      customAudioRef.current = null;
    }
    // Close AudioContext to immediately stop all scheduled oscillators
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch {}
      audioContextRef.current = null;
    }
  }, []);

  // Play alarm with specific sound config (matching mobile app's playBuiltinSound)
  const playAlarmSound = useCallback((config: AlarmSoundConfig) => {
    stopSound();
    const ctx = getAudioContext();
    
    const volumeMultiplier = volumePercent / 100;
    const vol = config.volume * volumeMultiplier;

    // Play one cycle of the sound pattern
    const playCycle = () => {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') return;
      const currentCtx = audioContextRef.current;
      let t = 0;
      for (let i = 0; i < config.frequencies.length; i++) {
        const osc = currentCtx.createOscillator();
        const gain = currentCtx.createGain();
        osc.connect(gain);
        gain.connect(currentCtx.destination);
        osc.frequency.value = config.frequencies[i];
        osc.type = 'square';
        gain.gain.value = vol;
        osc.start(currentCtx.currentTime + t);
        osc.stop(currentCtx.currentTime + t + config.pattern[i]);
        t += config.pattern[i] + 0.05;
      }
    };

    // Play immediately then repeat
    playCycle();
    
    // Calculate cycle duration
    const cycleDuration = config.pattern.reduce((sum, p) => sum + p + 0.05, 0);
    const intervalMs = Math.max(cycleDuration * 1000, 200);
    
    alarmIntervalRef.current = setInterval(() => {
      playCycle();
    }, intervalMs);
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
    // Fallback to default if selected sound not found
    const configToPlay = soundConfig || getAlarmSoundById(DEFAULT_ALARM_SOUND_ID);
    if (configToPlay) playAlarmSound(configToPlay);
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
