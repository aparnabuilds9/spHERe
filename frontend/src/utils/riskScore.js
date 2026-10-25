/**
 * src/utils/riskScore.js
 * 
 * Transparent, deterministic risk scoring engine for physical safety intelligence.
 * Reused for:
 * 1. Segment-level route coloring (100-200m segments)
 * 2. Entire route 0-100 scoring & breakdown
 * 3. Continuous live tracking surroundings assessment
 * 
 * All formulas are fully visible and documented below.
 */

export const RISK_CONFIG = {
  SEARCH_RADIUS_ROUTE_METERS: 100, // Distance buffer around route segments
  SEARCH_RADIUS_TRACKING_METERS: 200, // Distance buffer around user live location
  NIGHT_START_HOUR: 20, // 8:00 PM
  NIGHT_END_HOUR: 5, // 5:00 AM
  NIGHT_MULTIPLIER: 1.3, // Night-time risk factor
  COLORS: {
    LOW: '#2e7d32', // Green
    MEDIUM: '#f57c00', // Yellow / Amber
    HIGH: '#d32f2f', // Red
  },
};

/**
 * Calculates Haversine distance in meters between two lat/lng coordinates.
 */
export function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Radius of Earth in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Checks if a given time string (HH:mm) or Date falls between 8 PM and 5 AM.
 */
export function isNightTime(timeInput) {
  let hour = 12;
  if (!timeInput) {
    hour = new Date().getHours();
  } else if (typeof timeInput === 'string') {
    const parts = timeInput.split(':');
    if (parts.length >= 1) {
      hour = parseInt(parts[0], 10);
    }
  } else if (timeInput instanceof Date) {
    hour = timeInput.getHours();
  }
  return hour >= RISK_CONFIG.NIGHT_START_HOUR || hour < RISK_CONFIG.NIGHT_END_HOUR;
}

/**
 * Checks if an incident happened at night (between 8 PM and 5 AM or labeled as night).
 */
export function isIncidentAtNight(incident) {
  if (!incident) return false;
  if (typeof incident.time_of_day === 'string') {
    if (incident.time_of_day.toLowerCase().includes('night')) return true;
    const match = incident.time_of_day.match(/(\d\d?):(\d\d?)/);
    if (match) {
      const hour = parseInt(match[1], 10);
      return hour >= RISK_CONFIG.NIGHT_START_HOUR || hour < RISK_CONFIG.NIGHT_END_HOUR;
    }
  }
  return false;
}

/**
 * Calculates severity weighting factor for an incident (1 to 5 scale).
 * Severity 1: 0.4
 * Severity 2: 0.7
 * Severity 3: 1.0
 * Severity 4: 1.4
 * Severity 5: 1.8
 */
export function getSeverityFactor(severity) {
  const s = Number(severity) || 3;
  if (s <= 1) return 0.4;
  if (s === 2) return 0.7;
  if (s === 3) return 1.0;
  if (s === 4) return 1.4;
  return 1.8;
}

/**
 * Calculates recency weighting factor based on days elapsed since the incident.
 * <= 30 days: 1.0
 * 31 - 90 days: 0.85
 * 91 - 180 days: 0.70
 * > 180 days: 0.50
 */
export function getRecencyFactor(dateString, referenceDate = new Date('2026-10-25')) {
  if (!dateString) return 0.7;
  const incidentDate = new Date(dateString);
  const diffTime = Math.abs(referenceDate - incidentDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= 30) return 1.0;
  if (diffDays <= 90) return 0.85;
  if (diffDays <= 180) return 0.7;
  return 0.5;
}

/**
 * Returns perpendicular/projected distance from point P to line segment AB in meters.
 */
export function distancePointToSegmentMeters(pLat, pLng, aLat, aLng, bLat, bLng) {
  // Approximate flat-earth projection for short distances (accurate within meters)
  const x = (pLng - aLng) * Math.cos(((aLat + bLat) * Math.PI) / 360);
  const y = pLat - aLat;
  const dx = (bLng - aLng) * Math.cos(((aLat + bLat) * Math.PI) / 360);
  const dy = bLat - aLat;

  const segLengthSq = dx * dx + dy * dy;
  if (segLengthSq === 0) {
    return haversineDistanceMeters(pLat, pLng, aLat, aLng);
  }

  const t = Math.max(0, Math.min(1, (x * dx + y * dy) / segLengthSq));
  const projLat = aLat + t * (bLat - aLat);
  const projLng = aLng + t * (bLng - aLng);

  return haversineDistanceMeters(pLat, pLng, projLat, projLng);
}

/**
 * Resamples a polyline into discrete sub-segments roughly targetLengthMeters long (default ~120m).
 * Input coordinates format: [[lat, lng], [lat, lng], ...]
 */
export function resamplePolyline(coords, targetLengthMeters = 120) {
  if (!coords || coords.length < 2) return [];

  const segments = [];

  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const dist = haversineDistanceMeters(p1[0], p1[1], p2[0], p2[1]);

    if (dist <= targetLengthMeters * 1.5) {
      segments.push({
        start: p1,
        end: p2,
        length: dist,
        midpoint: [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2],
      });
    } else {
      const steps = Math.ceil(dist / targetLengthMeters);
      for (let s = 0; s < steps; s++) {
        const t1 = s / steps;
        const t2 = (s + 1) / steps;
        const subStart = [p1[0] + t1 * (p2[0] - p1[0]), p1[1] + t1 * (p2[1] - p1[1])];
        const subEnd = [p1[0] + t2 * (p2[0] - p1[0]), p1[1] + t2 * (p2[1] - p1[1])];
        segments.push({
          start: subStart,
          end: subEnd,
          length: dist / steps,
          midpoint: [(subStart[0] + subEnd[0]) / 2, (subStart[1] + subEnd[1]) / 2],
        });
      }
    }
  }

  return segments;
}

/**
 * Classifies weighted risk score into LOW (GREEN), MEDIUM (YELLOW), or HIGH (RED).
 */
export function classifyRisk(weightedScore, incidentCount, maxSeverity = 0) {
  if (incidentCount === 0) {
    return { level: 'Low', color: RISK_CONFIG.COLORS.LOW, code: 'GREEN' };
  }
  // If multiple incidents or very high severity
  if (weightedScore >= 3.2 || incidentCount >= 3 || (incidentCount >= 2 && maxSeverity >= 4)) {
    return { level: 'High', color: RISK_CONFIG.COLORS.HIGH, code: 'RED' };
  }
  if (weightedScore >= 1.0 || incidentCount >= 1) {
    return { level: 'Medium', color: RISK_CONFIG.COLORS.MEDIUM, code: 'YELLOW' };
  }
  return { level: 'Low', color: RISK_CONFIG.COLORS.LOW, code: 'GREEN' };
}

/**
 * Calculates risk for a single route segment (approx 100-200m).
 */
export function scoreSegment({ segment, incidents, isNightTravel }) {
  const nearbyIncidents = [];
  let weightedScore = 0;
  let maxSeverity = 0;

  for (const inc of incidents) {
    const d = distancePointToSegmentMeters(
      inc.lat,
      inc.lng,
      segment.start[0],
      segment.start[1],
      segment.end[0],
      segment.end[1]
    );

    if (d <= RISK_CONFIG.SEARCH_RADIUS_ROUTE_METERS) {
      nearbyIncidents.push(inc);
      const sev = getSeverityFactor(inc.severity);
      const rec = getRecencyFactor(inc.date);
      weightedScore += sev * rec;
      if (inc.severity > maxSeverity) {
        maxSeverity = inc.severity;
      }
    }
  }

  if (isNightTravel) {
    weightedScore *= RISK_CONFIG.NIGHT_MULTIPLIER;
  }

  const risk = classifyRisk(weightedScore, nearbyIncidents.length, maxSeverity);

  return {
    ...segment,
    incidents: nearbyIncidents,
    incidentCount: nearbyIncidents.length,
    weightedScore,
    level: risk.level,
    code: risk.code,
    color: risk.color,
  };
}

/**
 * Evaluates full route risk:
 * - Resamples and scores each segment
 * - Scores overall route (0 - 100)
 * - Produces visible plain-English breakdown
 */
export function evaluateRouteRisk({ coordinates, incidents, travelTime }) {
  const nightTrip = isNightTime(travelTime);
  const segments = resamplePolyline(coordinates, 130);

  const scoredSegments = segments.map((seg) =>
    scoreSegment({ segment: seg, incidents, isNightTravel: nightTrip })
  );

  // Find all distinct incidents within 100m of any segment of the route
  const routeIncidentsMap = new Map();
  let maxSegmentWeight = 0;
  let redSegmentCount = 0;
  let yellowSegmentCount = 0;

  for (const seg of scoredSegments) {
    if (seg.code === 'RED') redSegmentCount++;
    if (seg.code === 'YELLOW') yellowSegmentCount++;
    if (seg.weightedScore > maxSegmentWeight) maxSegmentWeight = seg.weightedScore;

    for (const inc of seg.incidents) {
      routeIncidentsMap.set(inc.id, inc);
    }
  }

  const distinctIncidents = Array.from(routeIncidentsMap.values());
  const incidentCount = distinctIncidents.length;

  let baseWeightTotal = 0;
  let nightIncidentsCount = 0;

  for (const inc of distinctIncidents) {
    const sev = getSeverityFactor(inc.severity);
    const rec = getRecencyFactor(inc.date);
    baseWeightTotal += sev * rec;
    if (isIncidentAtNight(inc)) {
      nightIncidentsCount++;
    }
  }

  let finalWeightedScore = baseWeightTotal;
  if (nightTrip) {
    finalWeightedScore *= RISK_CONFIG.NIGHT_MULTIPLIER;
  }

  // Scale smoothly to 0 - 100 range:
  // 0 incidents -> 0
  // 1 low incident -> ~15-20
  // 2-3 medium incidents -> ~35-60
  // 4+ incidents or dense cluster -> 70 - 100
  let score0to100 = 0;
  if (incidentCount > 0) {
    score0to100 = Math.min(100, Math.round(finalWeightedScore * 13 + (redSegmentCount > 0 ? 15 : 0)));
    score0to100 = Math.max(10, score0to100);
  }

  let overallLevel = 'Low';
  let overallColor = RISK_CONFIG.COLORS.LOW;
  let overallCode = 'GREEN';

  if (score0to100 >= 60 || redSegmentCount > 0) {
    overallLevel = 'High';
    overallColor = RISK_CONFIG.COLORS.HIGH;
    overallCode = 'RED';
  } else if (score0to100 >= 25 || yellowSegmentCount > 0) {
    overallLevel = 'Medium';
    overallColor = RISK_CONFIG.COLORS.MEDIUM;
    overallCode = 'YELLOW';
  }

  // Generate exact visible breakdown as required
  let breakdownText;
  if (incidentCount === 0) {
    breakdownText = 'No reported incidents within 100m of this route, score 0/100 (Low)';
  } else {
    const nightAddon = nightTrip ? ', night-time x1.3' : '';
    breakdownText = `${incidentCount} incident${incidentCount > 1 ? 's' : ''} within 100m of this route, ${nightIncidentsCount} at night${nightAddon}, score ${score0to100}/100 (${overallLevel})`;
  }

  return {
    score: score0to100,
    level: overallLevel,
    code: overallCode,
    color: overallColor,
    breakdownText,
    incidentCount,
    nightIncidentsCount,
    distinctIncidents,
    scoredSegments,
    hasRedSegments: redSegmentCount > 0,
    redSegmentCount,
    yellowSegmentCount,
    totalSegments: scoredSegments.length,
    isNightTrip: nightTrip,
  };
}

/**
 * REUSED FUNCTION FOR LIVE TRACKING
 * Continuously calculates the risk level of user's CURRENT surroundings.
 * Incidents within 100-200m (default 200m), weighted by severity and recency,
 * night multiplier after 8 PM.
 * 
 * Returns:
 * {
 *   level: 'Low' | 'Medium' | 'High',
 *   code: 'GREEN' | 'YELLOW' | 'RED',
 *   color: string,
 *   score: number (0-100),
 *   incidentCount: number,
 *   nightCount: number,
 *   nearbyIncidents: Array,
 *   message: string,
 * }
 */
export function calculateLocationRisk({
  lat,
  lng,
  radius = RISK_CONFIG.SEARCH_RADIUS_TRACKING_METERS,
  incidents = [],
  travelTime = null,
}) {
  const nightTrip = isNightTime(travelTime);
  const nearbyIncidents = [];
  let baseWeightTotal = 0;
  let nightCount = 0;
  let maxSeverity = 0;

  for (const inc of incidents) {
    const dist = haversineDistanceMeters(lat, lng, inc.lat, inc.lng);
    if (dist <= radius) {
      nearbyIncidents.push({ ...inc, distanceMeters: Math.round(dist) });
      const sev = getSeverityFactor(inc.severity);
      const rec = getRecencyFactor(inc.date);
      baseWeightTotal += sev * rec;
      if (inc.severity > maxSeverity) {
        maxSeverity = inc.severity;
      }
      if (isIncidentAtNight(inc)) {
        nightCount++;
      }
    }
  }

  let finalWeighted = baseWeightTotal;
  if (nightTrip) {
    finalWeighted *= RISK_CONFIG.NIGHT_MULTIPLIER;
  }

  const count = nearbyIncidents.length;
  const classification = classifyRisk(finalWeighted, count, maxSeverity);

  // Scaled 0-100 score
  let score = 0;
  if (count > 0) {
    score = Math.min(100, Math.round(finalWeighted * 14));
  }

  // Plain-language messages conforming strictly to requirements
  let message;
  if (classification.code === 'GREEN') {
    message = 'No reported incidents near you.';
  } else if (classification.code === 'YELLOW') {
    message = `Caution: ${count} reported incident${count > 1 ? 's' : ''} within ${radius}m.`;
  } else {
    // Red status message
    message = `High-risk area: ${count} incidents nearby, ${nightCount} at night. Consider moving to a busier road or take the safer route.`;
  }

  return {
    level: classification.level,
    code: classification.code,
    color: classification.color,
    score,
    incidentCount: count,
    nightCount,
    nearbyIncidents,
    message,
    isNight: nightTrip,
    radius,
  };
}

/**
 * Checks if the current user location is within thresholdMeters (default 200m)
 * of any RED segment along a route polyline.
 */
export function checkApproachingRedSegment(userLat, userLng, scoredSegments, thresholdMeters = 200) {
  if (!scoredSegments || scoredSegments.length === 0) return null;

  for (let i = 0; i < scoredSegments.length; i++) {
    const seg = scoredSegments[i];
    if (seg.code === 'RED') {
      const dist = distancePointToSegmentMeters(
        userLat,
        userLng,
        seg.start[0],
        seg.start[1],
        seg.end[0],
        seg.end[1]
      );
      if (dist <= thresholdMeters) {
        return {
          segmentIndex: i,
          distanceMeters: Math.round(dist),
          segment: seg,
        };
      }
    }
  }

  return null;
}
