/**
 * 공유DB device ID 매핑 싱글톤
 * 
 * 로컬DB ID → 공유DB ID 매핑을 전역으로 관리합니다.
 * AutoBroadcaster/Index에서 resolve한 shared ID를
 * deviceApi, useDeviceStatus 등 모든 곳에서 참조합니다.
 */

const idMap = new Map<string, string>();

/** 로컬 ID에 대응하는 공유DB ID를 저장 */
export function setSharedDeviceId(localId: string, sharedId: string): void {
  if (idMap.get(localId) !== sharedId) {
    idMap.set(localId, sharedId);
    console.log(`[SharedIdMap] 🔗 ${localId} → ${sharedId}`);
  }
}

/** 로컬 ID에 대응하는 공유DB ID를 반환 (없으면 undefined) */
export function getSharedDeviceId(localId: string): string | undefined {
  return idMap.get(localId);
}

/** 매핑 제거 */
export function removeSharedDeviceId(localId: string): void {
  idMap.delete(localId);
}
