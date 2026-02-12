/**
 * IndexedDB 기반 로컬 사진 저장소
 * 
 * 서버 부하를 피하기 위해 감지 사진을 로컬(IndexedDB)에 저장합니다.
 * localStorage는 5MB 제한이 있어 base64 이미지에 부적합하므로
 * IndexedDB를 사용합니다.
 */

const DB_NAME = "meercop_photos";
const DB_VERSION = 1;
const STORE_NAME = "alert_photos";
const MAX_ALERTS = 50; // 최대 보관 알림 수

export interface StoredAlertPhotos {
  id: string; // alert ID
  device_id: string;
  event_type: string;
  photos: string[]; // base64 data URLs
  created_at: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("device_id", "device_id", { unique: false });
        store.createIndex("created_at", "created_at", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** 알림 사진 저장 */
export async function saveAlertPhotos(alert: StoredAlertPhotos): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    store.put(alert);

    // 오래된 항목 정리
    const countReq = store.count();
    countReq.onsuccess = () => {
      if (countReq.result > MAX_ALERTS) {
        const idx = store.index("created_at");
        const cursor = idx.openCursor();
        let deleteCount = countReq.result - MAX_ALERTS;

        cursor.onsuccess = () => {
          if (cursor.result && deleteCount > 0) {
            cursor.result.delete();
            deleteCount--;
            cursor.result.continue();
          }
        };
      }
    };

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    db.close();
    console.log("[PhotoStorage] Saved alert photos:", alert.id);
  } catch (error) {
    console.error("[PhotoStorage] Failed to save:", error);
  }
}

/** 특정 알림의 사진 조회 */
export async function getAlertPhotos(alertId: string): Promise<StoredAlertPhotos | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const req = store.get(alertId);
      req.onsuccess = () => {
        db.close();
        resolve(req.result || null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch (error) {
    console.error("[PhotoStorage] Failed to get:", error);
    return null;
  }
}

/** 디바이스별 최근 알림 사진 목록 */
export async function getRecentAlertPhotos(
  deviceId: string,
  limit = 10
): Promise<StoredAlertPhotos[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const idx = store.index("device_id");

    return new Promise((resolve, reject) => {
      const results: StoredAlertPhotos[] = [];
      const req = idx.openCursor(IDBKeyRange.only(deviceId), "prev");

      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          db.close();
          resolve(results);
        }
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch (error) {
    console.error("[PhotoStorage] Failed to list:", error);
    return [];
  }
}
