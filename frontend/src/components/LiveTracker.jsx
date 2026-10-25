/**
 * src/components/LiveTracker.jsx
 * 
 * Live surroundings tracking engine:
 * - Uses navigator.geolocation.watchPosition with GPS jitter smoothing (accuracy < 100m, throttled <= 3s)
 * - Continuously scores surroundings using calculateLocationRisk from riskScore.js
 * - Interactive simulation presets: "Inside red cluster", "Near yellow area", "Safe area", or tap on map
 * - Dynamic color status badge (Green / Yellow / Red) with plain-language guidance
 * - Red segment proximity detector (triggers alert + vibration when within 200m of red segment ahead)
 * - Strict device-only privacy ("Your location stays on your device")
 */

import { useState, useEffect, useRef } from 'react';
import { calculateLocationRisk, checkApproachingRedSegment } from '../utils/riskScore';

// Simulation presets in Kanpur
const SIMULATION_PRESETS = [
  {
    name: 'Inside red cluster (Jarib Chowki)',
    lat: 26.4595,
    lng: 80.3275,
    expected: 'RED',
    description: 'High-density incident area on GT Road corridor',
  },
  {
    name: 'Near yellow area (Sisamau)',
    lat: 26.4715,
    lng: 80.3155,
    expected: 'YELLOW',
    description: 'Moderate caution area with 2 nearby incidents',
  },
  {
    name: 'Safe area (VIP Road / Civil Lines)',
    lat: 26.478,
    lng: 80.338,
    expected: 'GREEN',
    description: 'Well-lit central area with 0 reported incidents',
  },
];

export default function LiveTracker({
  incidents = [],
  travelTime = null,
  selectedRoute = null,
  onUserLocationChange,
  onTrackingStatusChange,
  onSelectSaferRoute,
  onEnableSimulateTap,
  isSimulateTapActive,
}) {
  const [isTracking, setIsTracking] = useState(false);
  const [isSimulated, setIsSimulated] = useState(false);
  const [currentCoords, setCurrentCoords] = useState(null);
  const [currentRisk, setCurrentRisk] = useState(null);
  const [gpsError, setGpsError] = useState('');
  const [redAlert, setRedAlert] = useState(null);

  const watchIdRef = useRef(null);
  const lastUpdateTimeRef = useRef(0);
  const hasVibratedRef = useRef(false);
  const onTrackingStatusChangeRef = useRef(onTrackingStatusChange);

  useEffect(() => {
    onTrackingStatusChangeRef.current = onTrackingStatusChange;
  });

  // Update surroundings risk whenever coordinates, incidents, or travel time change
  const processLocationUpdate = (lat, lng, isManual = false) => {
    const coords = { lat, lng };
    setCurrentCoords(coords);
    if (onUserLocationChange) {
      onUserLocationChange(coords);
    }

    // Re-score surroundings using unified risk scoring
    const risk = calculateLocationRisk({
      lat,
      lng,
      radius: 200,
      incidents,
      travelTime,
    });
    setCurrentRisk(risk);

    if (onTrackingStatusChange) {
      onTrackingStatusChange({
        isTracking: true,
        coords,
        risk,
        isSimulated: isManual,
      });
    }

    // Check if user is within 200m of a dangerous RED stretch on the selected route
    if (selectedRoute?.riskAssessment?.scoredSegments) {
      const redProximity = checkApproachingRedSegment(
        lat,
        lng,
        selectedRoute.riskAssessment.scoredSegments,
        200
      );

      if (redProximity) {
        setRedAlert(redProximity);
        // Trigger vibration if device supports it and haven't vibrated recently
        if (!hasVibratedRef.current && typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate([250, 100, 250]);
          } catch {
            // Safe fallback if permission restricted
          }
          hasVibratedRef.current = true;
        }
      } else {
        setRedAlert(null);
        hasVibratedRef.current = false;
      }
    } else {
      setRedAlert(null);
    }
  };

  // Start real GPS tracking
  const startGpsTracking = () => {
    setGpsError('');
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      return;
    }

    setIsSimulated(false);
    setIsTracking(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        // 1. Smooth out GPS jitter: ignore location updates with accuracy worse than 100m
        if (position.coords.accuracy > 100) {
          return;
        }

        // 2. Throttle updates: at most once every 3 seconds
        const now = Date.now();
        if (now - lastUpdateTimeRef.current < 3000) {
          return;
        }
        lastUpdateTimeRef.current = now;

        processLocationUpdate(position.coords.latitude, position.coords.longitude, false);
      },
      (err) => {
        if (err.code === 1) {
          setGpsError('Location permission was denied. You can use Simulate Location to test.');
        } else {
          setGpsError('GPS signal is currently unavailable. Try simulating your position below.');
        }
        stopTracking();
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 3000,
      }
    );
  };

  // Stop tracking
  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
    setIsSimulated(false);
    setRedAlert(null);
    if (onTrackingStatusChange) {
      onTrackingStatusChange({ isTracking: false, coords: null, risk: null });
    }
  };

  // Simulate location preset
  const applyPreset = (preset) => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setGpsError('');
    setIsTracking(true);
    setIsSimulated(true);
    processLocationUpdate(preset.lat, preset.lng, true);
  };

  // Stop tracking when user navigates away or component unmounts
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (onTrackingStatusChangeRef.current) {
        onTrackingStatusChangeRef.current({ isTracking: false, coords: null, risk: null });
      }
    };
  }, []);

  return (
    <div className="live-tracker-card">
      {/* Real-time Status Badge (Always prominent when tracking is on) */}
      {isTracking && currentRisk ? (
        <div className={`live-status-badge ${currentRisk.code.toLowerCase()}`} role="status">
          <div className="badge-indicator">
            <span className="pulse-dot" />
            <span className="badge-level">{currentRisk.level} Risk Surroundings</span>
          </div>
          <p className="badge-message">{currentRisk.message}</p>
          <div className="badge-sub-info">
            <span>Score: {currentRisk.score}/100</span>
            <span>•</span>
            <span>{currentRisk.incidentCount} incidents within 200m</span>
            {currentRisk.isNight && (
              <>
                <span>•</span>
                <span>Night multiplier active</span>
              </>
            )}
            {isSimulated && (
              <>
                <span>•</span>
                <span className="sim-tag">Simulated</span>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="live-status-badge off" role="status">
          <div className="badge-indicator">
            <span className="off-dot" />
            <span className="badge-level">Tracking is off</span>
          </div>
          <p className="badge-message">
            Turn on live tracking or choose a simulation preset to monitor your surroundings in real time.
          </p>
        </div>
      )}

      {/* Proximity Warning Banner before reaching RED stretch */}
      {redAlert && (
        <div className="approaching-red-banner" role="alert">
          <div className="alert-top">
            <span className="alert-siren">⚠️</span>
            <div>
              <strong>Caution: Approaching High-Risk Stretch</strong>
              <p>
                You are {redAlert.distanceMeters}m from a dangerous red segment ahead on your route (
                {redAlert.segment.incidentCount} incident
                {redAlert.segment.incidentCount === 1 ? '' : 's'} reported nearby).
              </p>
            </div>
          </div>
          {onSelectSaferRoute && (
            <button
              type="button"
              className="safer-route-btn white"
              onClick={onSelectSaferRoute}
            >
              Switch to safer route <span>➔</span>
            </button>
          )}
        </div>
      )}

      {/* Tracking Controls */}
      <div className="tracker-controls-row">
        {!isTracking ? (
          <button
            type="button"
            className="primary-button tracking-toggle-btn"
            onClick={startGpsTracking}
          >
            <span className="gps-icon">⌖</span> Start live tracking
          </button>
        ) : (
          <button
            type="button"
            className="secondary-button tracking-toggle-btn stop"
            onClick={stopTracking}
          >
            Stop tracking
          </button>
        )}

        <div className="device-privacy-tag">
          <span className="shield-icon">🔒</span>
          <span>Your location stays on your device.</span>
        </div>
      </div>

      {gpsError && (
        <div className="gps-error-notice" role="alert">
          <span>⚠️ {gpsError}</span>
        </div>
      )}

      {/* Simulate Location Controls (Demo without walking) */}
      <div className="simulation-panel">
        <div className="sim-header">
          <div>
            <strong>Simulate Location</strong>
            <span className="sim-helper">
              Demo the Green / Yellow / Red transitions without walking:
            </span>
          </div>
          <button
            type="button"
            className={`tap-map-toggle ${isSimulateTapActive ? 'active' : ''}`}
            onClick={onEnableSimulateTap}
          >
            {isSimulateTapActive ? '✓ Click map enabled' : 'Tap on map to set'}
          </button>
        </div>

        <div className="preset-buttons-grid">
          {SIMULATION_PRESETS.map((p, idx) => (
            <button
              key={idx}
              type="button"
              className={`preset-sim-btn ${p.expected.toLowerCase()} ${
                isSimulated && currentCoords?.lat === p.lat ? 'selected' : ''
              }`}
              onClick={() => applyPreset(p)}
            >
              <div className="preset-btn-top">
                <span className={`status-pill ${p.expected.toLowerCase()}`}>
                  {p.expected}
                </span>
                <span className="preset-title">{p.name}</span>
              </div>
              <span className="preset-desc">{p.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
