export type DevicePlatform = 'ios' | 'android' | 'desktop';

export function getDevicePlatform(): DevicePlatform {
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return 'ios';
  }
  if (/Android/i.test(ua)) {
    return 'android';
  }
  return 'desktop';
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

/**
 * Detect if the current browser is Safari on iOS.
 * Returns false for Chrome, Firefox, in-app browsers (Instagram, Facebook, Telegram, WhatsApp, etc.)
 */
export function isIOSSafari(): boolean {
  const ua = navigator.userAgent || '';
  const platform = getDevicePlatform();
  if (platform !== 'ios') return false;

  // In-app browsers often include specific identifiers
  const isInAppBrowser = /FBAN|FBAV|Instagram|Telegram|WhatsApp|Line|Snapchat|Twitter|LinkedIn/i.test(ua);
  if (isInAppBrowser) return false;

  // Chrome on iOS includes "CriOS"
  // Firefox on iOS includes "FxiOS"
  // Edge on iOS includes "EdgiOS"
  // Opera on iOS includes "OPiOS"
  const isNonSafariBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\//i.test(ua);
  if (isNonSafariBrowser) return false;

  // If we're on iOS and none of the above matched, it's Safari
  return true;
}
