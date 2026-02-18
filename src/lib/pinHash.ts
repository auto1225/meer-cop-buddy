/**
 * PIN 해시 유틸리티 (§2-1)
 * 
 * SHA-256 + device_id salt를 사용한 PIN 해싱.
 * 스마트폰 앱과 동일한 알고리즘을 사용합니다.
 */

export async function hashPin(pin: string, deviceId: string): Promise<string> {
  const data = new TextEncoder().encode(pin + deviceId);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * PIN 검증 (alarm_pin_hash 우선, alarm_pin 폴백)
 */
export async function verifyPin(
  inputPin: string,
  deviceId: string,
  metadata: { alarm_pin_hash?: string; alarm_pin?: string } | null,
  localPin?: string
): Promise<boolean> {
  if (!metadata) return inputPin === (localPin || "1234");

  // 1순위: 해시 비교
  if (metadata.alarm_pin_hash) {
    const inputHash = await hashPin(inputPin, deviceId);
    return inputHash === metadata.alarm_pin_hash;
  }

  // 2순위: 평문 폴백 (스마트폰이 해시 저장 시작 전 호환)
  if (metadata.alarm_pin) {
    return inputPin === metadata.alarm_pin;
  }

  // 3순위: localStorage에 저장된 PIN (settings_updated 브로드캐스트로 수신)
  if (localPin) {
    return inputPin === localPin;
  }

  // 기본 PIN
  return inputPin === "1234";
}
