/**
 * ICE Server configuration with TURN fallback via Metered.ca
 * 
 * STUN-only로는 Symmetric NAT(일부 Wi-Fi) 환경에서 연결 실패.
 * TURN 서버를 통해 릴레이하여 모든 네트워크에서 연결 가능.
 */

const STUN_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

const FALLBACK_CONFIG: RTCConfiguration = {
  iceServers: [
    ...STUN_SERVERS,
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
  ],
  iceCandidatePoolSize: 10,
};

let cachedConfig: RTCConfiguration | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10분

/**
 * Metered.ca에서 TURN credential을 가져와 ICE 서버 설정을 반환.
 * 실패 시 STUN-only fallback.
 */
export async function getIceServers(): Promise<RTCConfiguration> {
  const now = Date.now();
  if (cachedConfig && now < cacheExpiry) {
    return cachedConfig;
  }

  try {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    const res = await fetch(
      `https://${projectId}.supabase.co/functions/v1/get-turn-credentials`,
      {
        headers: {
          apikey: anonKey,
          "Content-Type": "application/json",
        },
      }
    );

    if (!res.ok) {
      console.warn("[ICE] TURN credential fetch failed:", res.status);
      return FALLBACK_CONFIG;
    }

    const turnServers: RTCIceServer[] = await res.json();
    
    if (!Array.isArray(turnServers) || turnServers.length === 0) {
      console.warn("[ICE] Empty TURN credentials, using fallback");
      return FALLBACK_CONFIG;
    }

    console.log(`[ICE] ✅ Got ${turnServers.length} TURN servers from Metered`);

    cachedConfig = {
      iceServers: [...STUN_SERVERS, ...turnServers],
      iceCandidatePoolSize: 10,
    };
    cacheExpiry = now + CACHE_TTL_MS;

    return cachedConfig;
  } catch (err) {
    console.warn("[ICE] Failed to fetch TURN credentials:", err);
    return FALLBACK_CONFIG;
  }
}
