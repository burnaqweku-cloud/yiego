/**
 * Detect Ghana mobile network from phone number prefix.
 * Returns network name or null if unknown/incomplete.
 */

const PREFIX_MAP: Record<string, string> = {
  '024': 'MTN', '025': 'MTN', '053': 'MTN', '054': 'MTN', '055': 'MTN', '059': 'MTN',
  '020': 'Telecel', '050': 'Telecel',
  '026': 'AirtelTigo', '027': 'AirtelTigo', '056': 'AirtelTigo', '057': 'AirtelTigo',
};

export function normalizeGhanaPhoneLocal(phone: string): string {
  let p = phone.replace(/[\s\-\(\)]/g, '');
  if (p.startsWith('+233')) p = '0' + p.slice(4);
  else if (p.startsWith('233') && p.length >= 12) p = '0' + p.slice(3);
  return p;
}

export function detectGhanaNetwork(phone: string): string | null {
  const norm = normalizeGhanaPhoneLocal(phone);
  if (norm.length < 3) return null;
  const prefix = norm.substring(0, 3);
  return PREFIX_MAP[prefix] || null;
}

/**
 * Check if phone number matches the selected network.
 * Returns error message if mismatch, or empty string if OK / not enough digits.
 */
export function validateNetworkMatch(phone: string, selectedNetwork: string): string {
  const norm = normalizeGhanaPhoneLocal(phone);
  const digits = norm.replace(/^0+/, '').length + (norm.startsWith('0') ? 1 : 0);
  const detected = detectGhanaNetwork(phone);
  if (detected && detected !== selectedNetwork) {
    return 'This number does not match the selected network';
  }
  // If 10+ digits but prefix is unknown → invalid number
  if (norm.length >= 10 && !detected) {
    return 'Please enter a valid phone number';
  }
  return '';
}
