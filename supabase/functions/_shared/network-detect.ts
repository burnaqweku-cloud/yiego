/**
 * Backend network detection from Ghana phone prefix.
 */

const PREFIX_MAP: Record<string, string> = {
  '024': 'MTN', '025': 'MTN', '053': 'MTN', '054': 'MTN', '055': 'MTN', '059': 'MTN',
  '020': 'Telecel', '050': 'Telecel',
  '026': 'AirtelTigo', '027': 'AirtelTigo', '056': 'AirtelTigo', '057': 'AirtelTigo',
};

export function normalizeGhanaPhone(phone: string): string {
  let p = phone.replace(/[\s\-\(\)]/g, '');
  if (p.startsWith('+233')) p = '0' + p.slice(4);
  else if (p.startsWith('233') && p.length >= 12) p = '0' + p.slice(3);
  return p;
}

export function detectGhanaNetwork(phone: string): string | null {
  const norm = normalizeGhanaPhone(phone);
  if (norm.length < 3) return null;
  return PREFIX_MAP[norm.substring(0, 3)] || null;
}

/**
 * Validate that phone matches the requested network.
 * Returns error string if mismatch, null if OK or unknown.
 */
export function validateNetworkMatch(phone: string, network: string): string | null {
  const detected = detectGhanaNetwork(phone);
  if (!detected) return null; // unknown prefix, let it through
  if (detected !== network) {
    return `The phone number does not match the selected network`;
  }
  return null;
}
