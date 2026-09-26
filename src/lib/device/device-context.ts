export type DevicePlatform = "mobile" | "desktop" | "tv";

export interface DeviceEnvironment {
  platform: DevicePlatform;
  isTV: boolean;
  isElectron: boolean;
  isLowMemory: boolean;
  supportsFullscreen: boolean;
}

const TV_USER_AGENT = /android\s*tv|googletv|smart[- ]?tv|hbbtv|aft\w+|netcast|webos|bravia|viera|tizen/i;
const MOBILE_USER_AGENT = /android|iphone|ipad|ipod|mobile/i;

export function detectDeviceEnvironment(): DeviceEnvironment {
  if (typeof navigator === "undefined") {
    return { platform: "desktop", isTV: false, isElectron: false, isLowMemory: true, supportsFullscreen: false };
  }

  const userAgent = navigator.userAgent || "";
  const viewportWidth = typeof window === "undefined" ? 0 : window.innerWidth;
  const hasFinePointer = typeof window !== "undefined" && window.matchMedia?.("(hover: hover) and (pointer: fine)").matches === true;
  const hasTouch = navigator.maxTouchPoints > 0 || MOBILE_USER_AGENT.test(userAgent);
  const isElectron = /electron/i.test(userAgent) || Boolean((window as Window & { process?: { type?: string } }).process?.type === "renderer");
  const isTV = TV_USER_AGENT.test(userAgent) || (viewportWidth >= 1280 && !hasFinePointer && !hasTouch);
  const isMobile = !isTV && (MOBILE_USER_AGENT.test(userAgent) || (viewportWidth < 1024 && hasTouch));
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const platform: DevicePlatform = isTV ? "tv" : isMobile ? "mobile" : "desktop";

  return {
    platform,
    isTV,
    isElectron,
    isLowMemory: isTV || isMobile || (typeof memory === "number" && memory <= 2),
    supportsFullscreen: typeof document !== "undefined" && Boolean(document.documentElement.requestFullscreen),
  };
}

export function isRemoteBackKey(event: KeyboardEvent) {
  return event.key === "Escape" || event.key === "BrowserBack" || event.key === "GoBack" || event.keyCode === 4;
}

export async function requestAppFullscreen(target: HTMLElement | HTMLVideoElement | null) {
  if (!target || typeof document === "undefined" || document.fullscreenElement) return false;
  try {
    if (target.requestFullscreen) {
      await target.requestFullscreen();
      return true;
    }
  } catch {
    // Browsers may require a user gesture; playback continues normally when rejected.
  }
  return false;
}
