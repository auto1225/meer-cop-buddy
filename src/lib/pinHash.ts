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

  // 1순위: 해시 비교 (같은 device_id로 해싱된 경우)
  if (metadata.alarm_pin_hash) {
    const inputHash = await hashPin(inputPin, deviceId);
    if (inputHash === metadata.alarm_pin_hash) return true;
    // 해시 불일치 → 다른 기기(스마트폰)에서 생성된 해시일 수 있음 → 폴백 진행
  }

  // 2순위: 평문 비교 (스마트폰에서 settings_updated로 전송된 PIN)
  if (metadata.alarm_pin) {
    if (inputPin === metadata.alarm_pin) return true;
  }

  // 3순위: localStorage에 저장된 PIN (settings_updated 브로드캐스트로 수신)
  if (localPin && inputPin === localPin) {
    return true;
  }

  // 기본 PIN
  return inputPin === "1234";
}
