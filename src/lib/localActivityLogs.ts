// 로컬 저장소 기반 활동 로그 시스템
// 서버 부하를 줄이기 위해 모든 활동 로그를 localStorage에 저장

const STORAGE_KEY = "meercop_activity_logs";
const MAX_LOGS = 200; // 최대 보관 로그 수

export interface LocalActivityLog {
  id: string;
  device_id: string;
  event_type: string;
  event_data: Record<string, unknown> | null;
  created_at: string;
  device_name?: string;
}

// 고유 ID 생성
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// 모든 로그 가져오기
export function getActivityLogs(deviceId?: string, limit = 50): LocalActivityLog[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    
    let logs: LocalActivityLog[] = JSON.parse(stored);
    
    // 디바이스 필터링
    if (deviceId) {
      logs = logs.filter(log => log.device_id === deviceId);
    }
    
    // 최신순 정렬 및 제한
    return logs
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);
  } catch (error) {
    console.error("Error reading activity logs from localStorage:", error);
    return [];
  }
}

// 로그 추가
export function addActivityLog(
  deviceId: string,
  eventType: string,
  eventData?: Record<string, unknown>,
  deviceName?: string
): LocalActivityLog {
  const newLog: LocalActivityLog = {
    id: generateId(),
    device_id: deviceId,
    event_type: eventType,
    event_data: eventData || null,
    created_at: new Date().toISOString(),
    device_name: deviceName,
  };

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    let logs: LocalActivityLog[] = stored ? JSON.parse(stored) : [];
    
    // 새 로그를 맨 앞에 추가
    logs.unshift(newLog);
    
    // 최대 개수 제한
    if (logs.length > MAX_LOGS) {
      logs = logs.slice(0, MAX_LOGS);
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
    
    // 커스텀 이벤트 발생 (다른 컴포넌트에서 구독 가능)
    window.dispatchEvent(new CustomEvent("activity-log-added", { detail: newLog }));
    
    console.log(`[LocalActivityLogs] Added: ${eventType}`, eventData);
  } catch (error) {
    console.error("Error saving activity log to localStorage:", error);
  }

  return newLog;
}

// 특정 타입의 로그만 가져오기
export function getAlertLogs(deviceId: string, limit = 50): LocalActivityLog[] {
  const alertTypes = ["alert_shock", "alert_mouse", "alert_keyboard", "alert_movement"];
  return getActivityLogs(deviceId, MAX_LOGS)
    .filter(log => alertTypes.includes(log.event_type))
    .slice(0, limit);
}

// 로그 삭제 (디바이스별)
export function clearActivityLogs(deviceId?: string): void {
  try {
    if (deviceId) {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const logs: LocalActivityLog[] = JSON.parse(stored);
        const filtered = logs.filter(log => log.device_id !== deviceId);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      }
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    console.log("[LocalActivityLogs] Cleared logs");
  } catch (error) {
    console.error("Error clearing activity logs:", error);
  }
}

// 로그 내보내기 (JSON)
export function exportActivityLogs(deviceId?: string): string {
  const logs = getActivityLogs(deviceId, MAX_LOGS);
  return JSON.stringify(logs, null, 2);
}
