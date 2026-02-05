import { useState, useRef, useCallback, useEffect } from "react";

interface UseAlarmSystemOptions {
  onAlarmStart?: () => void;
  onAlarmStop?: () => void;
}

export function useAlarmSystem({ onAlarmStart, onAlarmStop }: UseAlarmSystemOptions = {}) {
  const [isAlarmEnabled, setIsAlarmEnabled] = useState(true);
  const [isAlarming, setIsAlarming] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const alarmIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Create alarm sound using Web Audio API
  const createAlarmSound = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    const ctx = audioContextRef.current;
    
    // Create oscillator for alarm tone
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    
    oscillator.type = "square";
    oscillator.frequency.value = 800;
    gain.gain.value = 0.3;
    
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    
    oscillatorRef.current = oscillator;
    gainRef.current = gain;
    
    return { oscillator, gain, ctx };
  }, []);

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
    
    const { oscillator, gain, ctx } = createAlarmSound();
    oscillator.start();
    
    // Create siren effect by alternating frequency
    let isHigh = true;
    alarmIntervalRef.current = setInterval(() => {
      if (oscillatorRef.current) {
        oscillatorRef.current.frequency.value = isHigh ? 800 : 600;
        isHigh = !isHigh;
      }
    }, 500);
  }, [isAlarmEnabled, createAlarmSound, onAlarmStart]);

  // Stop alarm
  const stopAlarm = useCallback(() => {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
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
    setAlarmEnabled: setIsAlarmEnabled,
    toggleAlarmEnabled,
    startAlarm,
    stopAlarm,
  };
}
