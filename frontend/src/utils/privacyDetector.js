/**
 * src/utils/privacyDetector.js
 *
 * Inspects text and metadata for personal and location-sensitive data:
 * - Phone numbers (Indian mobile, international E.164, standard landlines)
 * - Email addresses
 * - GPS coordinates (decimal degrees and degrees-minutes-seconds)
 * - Address indicators, Indian PIN codes, landmark keywords
 * - Live location sharing indicators
 *
 * Provides masking utilities so raw sensitive text is never fully exposed in the report UI.
 */

export function maskPhoneNumber(phone) {
  const cleaned = phone.trim();
  if (cleaned.length <= 4) return '••••';
  const prefix = cleaned.slice(0, Math.min(4, cleaned.length - 4));
  const suffix = cleaned.slice(-2);
  const middleLen = Math.max(3, cleaned.length - prefix.length - suffix.length);
  return `${prefix}${'•'.repeat(middleLen)}${suffix}`;
}

export function maskEmail(email) {
  const parts = email.trim().split('@');
  if (parts.length !== 2) return '••••@••••';
  const [user, domain] = parts;
  const maskedUser = user.length <= 2
    ? `${user[0] || ''}•••`
    : `${user.slice(0, 2)}${'•'.repeat(Math.max(3, user.length - 2))}`;
  return `${maskedUser}@${domain}`;
}

export function maskCoordinates(coordStr) {
  return coordStr.replace(/(\d+\.\d{2})\d+/g, '$1•••');
}

export function maskTextGeneral(text, keepStart = 3, keepEnd = 2) {
  const trimmed = text.trim();
  if (trimmed.length <= keepStart + keepEnd) return '••••••';
  return `${trimmed.slice(0, keepStart)}${'•'.repeat(Math.min(8, trimmed.length - keepStart - keepEnd))}${trimmed.slice(-keepEnd)}`;
}

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi;
const INDIAN_PHONE_REGEX = /(?<!\w)(?:\+?91[\s-]?)?[6-9]\d{9}(?!\w)/g;
const GENERAL_PHONE_REGEX = /(?<!\w)(?:\+?\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}(?!\w)/g;

const COORD_DECIMAL_REGEX = /[-+]?(?:[1-8]?\d(?:\.\d{3,8})|90(?:\.0{3,8})?)[,\s]+[-+]?(?:180(?:\.0{3,8})?|(?:1[0-7]\d|[1-9]?\d)(?:\.\d{3,8}))/g;
const COORD_DMS_REGEX = /\b\d{1,2}°\s*\d{1,2}['′]\s*(?:\d{1,2}(?:\.\d+)?)?["″]?\s*[NnSs][,\s]+\d{1,3}°\s*\d{1,2}['′]\s*(?:\d{1,2}(?:\.\d+)?)?["″]?\s*[EeWw]\b/g;

const PIN_CODE_REGEX = /(?<!\w)(?:PIN|Pin\s*Code|Postal\s*Code|Pincode)?[\s:]*([1-9][0-9]{2}\s?[0-9]{3})(?!\w)/gi;

const ADDRESS_KEYWORDS = [
  'road', 'marg', 'street', 'nagar', 'colony', 'sector', 'block', 'phase',
  'chowk', 'lane', 'gali', 'vihar', 'enclave', 'society', 'apartment', 'apartments',
  'flat no', 'house no', 'plot no', 'near', 'opposite', 'behind', 'beside', 'floor'
];

const LOCATION_SHARING_KEYWORDS = [
  'sharing live location', 'live location', 'current location', 'dropped pin',
  'google maps', 'maps.google', 'directions to', 'eta', 'km away', 'mins away',
  'live until', 'navigating to'
];

export function analyzePrivacyText(text) {
  if (!text || typeof text !== 'string') {
    return {
      findings: [],
      summary: { total: 0, high: 0, medium: 0, low: 0 },
      hasExposures: false,
    };
  }

  const findings = [];
  const seenMatches = new Set();

  // 1. Emails
  const emailMatches = text.match(EMAIL_REGEX) || [];
  for (const match of emailMatches) {
    const raw = match.trim();
    if (seenMatches.has(raw.toLowerCase())) continue;
    seenMatches.add(raw.toLowerCase());
    findings.push({
      id: `email_${findings.length}`,
      category: 'Personal Identifier (Email)',
      raw,
      masked: maskEmail(raw),
      severity: 'Medium',
      explanation: 'Exposes your personal or institutional email address, creating risks of targeted phishing, credential stuffing, or doxxing.',
      suggestedAction: 'Censor the email handle or use the redaction tool to draw a black bar over it.',
    });
  }

  // 2. Phone Numbers (Indian & General)
  const phoneMatches = [
    ...(text.match(INDIAN_PHONE_REGEX) || []),
    ...(text.match(GENERAL_PHONE_REGEX) || []),
  ];
  for (const match of phoneMatches) {
    const raw = match.trim();
    const digitsOnly = raw.replace(/\D/g, '');
    if (digitsOnly.length < 7 || seenMatches.has(digitsOnly)) continue;
    seenMatches.add(digitsOnly);
    findings.push({
      id: `phone_${findings.length}`,
      category: 'Personal Identifier (Phone Number)',
      raw,
      masked: maskPhoneNumber(raw),
      severity: 'High',
      explanation: 'Phone numbers can be linked to identity registers, messaging platforms (WhatsApp/Telegram), and used for harassing calls or OTP spam.',
      suggestedAction: 'Redact the full number before distributing or uploading.',
    });
  }

  // 3. GPS Coordinates in text
  const coordMatches = [
    ...(text.match(COORD_DECIMAL_REGEX) || []),
    ...(text.match(COORD_DMS_REGEX) || []),
  ];
  for (const match of coordMatches) {
    const raw = match.trim();
    if (seenMatches.has(raw)) continue;
    seenMatches.add(raw);
    findings.push({
      id: `coord_${findings.length}`,
      category: 'Geographic Coordinates',
      raw,
      masked: maskCoordinates(raw),
      severity: 'High',
      explanation: 'Precision coordinates point directly to an exact building, house, or street corner, destroying location privacy.',
      suggestedAction: 'Permanently redact coordinates and avoid sharing map links.',
    });
  }

  // 4. Postal PIN Codes
  const pinMatches = text.match(PIN_CODE_REGEX) || [];
  for (const match of pinMatches) {
    const raw = match.trim();
    if (seenMatches.has(raw)) continue;
    seenMatches.add(raw);
    findings.push({
      id: `pin_${findings.length}`,
      category: 'Postal Location (PIN Code)',
      raw,
      masked: maskTextGeneral(raw, 2, 2),
      severity: 'Medium',
      explanation: 'A 6-digit postal code isolates your neighborhood or municipal delivery sector in India.',
      suggestedAction: 'Mask the PIN code to prevent neighborhood-level geolocation.',
    });
  }

  // 5. Address & Landmark Clues
  const lower = text.toLowerCase();
  for (const keyword of ADDRESS_KEYWORDS) {
    const regex = new RegExp(`(?:\\b[\\w\\s]{0,20})?\\b${keyword}\\b(?:[\\w\\s]{0,25})?`, 'i');
    const match = text.match(regex);
    if (match && !seenMatches.has(`addr_${keyword}`)) {
      seenMatches.add(`addr_${keyword}`);
      const raw = match[0].trim();
      findings.push({
        id: `addr_${findings.length}`,
        category: 'Address / Landmark Clue',
        raw,
        masked: maskTextGeneral(raw, 3, 3),
        severity: 'Medium',
        explanation: `Mentions address indicator "${keyword}", which could help an observer reconstruct your residential or transit route.`,
        suggestedAction: 'Carefully censor surrounding building, street, or colony names.',
      });
      break; // Avoid flooding with repetitive address alerts
    }
  }

  // 6. Live Location Sharing Indicators
  for (const keyword of LOCATION_SHARING_KEYWORDS) {
    if (lower.includes(keyword) && !seenMatches.has(`loc_${keyword}`)) {
      seenMatches.add(`loc_${keyword}`);
      findings.push({
        id: `loc_${findings.length}`,
        category: 'Active Location Sharing Clue',
        raw: keyword,
        masked: keyword,
        severity: 'High',
        explanation: `Detected active location indicator "${keyword}". Sharing live location tracks movement in real time.`,
        suggestedAction: 'Ensure live location sessions are stopped and not publicly screenshotted.',
      });
      break;
    }
  }

  const high = findings.filter(f => f.severity === 'High').length;
  const medium = findings.filter(f => f.severity === 'Medium').length;
  const low = findings.filter(f => f.severity === 'Low').length;

  return {
    findings,
    summary: { total: findings.length, high, medium, low },
    hasExposures: findings.length > 0,
  };
}
