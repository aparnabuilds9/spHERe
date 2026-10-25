/**
 * src/components/RoutePlanner.jsx
 * 
 * Route input, geocoding search, Kanpur presets, travel time selector,
 * route evaluation, high-risk warning banners, and alternative comparison.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { searchAddress, KANPUR_PRESETS, fetchOsrmRoutes } from '../utils/geoService';
import { evaluateRouteRisk } from '../utils/riskScore';

export default function RoutePlanner({
  incidents = [],
  onRoutesCalculated,
  selectedRouteIndex,
  onSelectRoute,
  routes = [],
  travelTime,
  onTravelTimeChange,
  isTravelTimeCustom,
  onToggleTravelTimeCustom,
  onLocationsChange,
}) {
  // Default: Kanpur Central to Rawatpur (crosses the demo red cluster at Jarib Chowki)
  const [startQuery, setStartQuery] = useState('Kanpur Central Railway Station');
  const [endQuery, setEndQuery] = useState('Rawatpur (via GT Road / Jarib Chowki)');

  const [startCoord, setStartCoord] = useState(KANPUR_PRESETS[0]);
  const [endCoord, setEndCoord] = useState(KANPUR_PRESETS[1]);

  const [startSuggestions, setStartSuggestions] = useState([]);
  const [endSuggestions, setEndSuggestions] = useState([]);

  const [isSearchingStart, setIsSearchingStart] = useState(false);
  const [isSearchingEnd, setIsSearchingEnd] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const debounceTimerRef = useRef(null);
  const onLocationsChangeRef = useRef(onLocationsChange);
  const onRoutesCalculatedRef = useRef(onRoutesCalculated);
  const routesRef = useRef(routes);

  useEffect(() => {
    onLocationsChangeRef.current = onLocationsChange;
    onRoutesCalculatedRef.current = onRoutesCalculated;
    routesRef.current = routes;
  });

  const initialCalculatedRef = useRef(false);

  // Notify parent of initial coordinates
  useEffect(() => {
    if (onLocationsChangeRef.current) {
      onLocationsChangeRef.current(startCoord, endCoord);
    }
  }, [startCoord, endCoord]);

  // Debounced search for Start input
  const handleStartInputChange = (val) => {
    setStartQuery(val);
    setErrorMsg('');
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    if (val.trim().length < 2) {
      setStartSuggestions([]);
      return;
    }

    debounceTimerRef.current = setTimeout(async () => {
      setIsSearchingStart(true);
      const results = await searchAddress(val);
      setStartSuggestions(results);
      setIsSearchingStart(false);
    }, 600);
  };

  // Debounced search for End input
  const handleEndInputChange = (val) => {
    setEndQuery(val);
    setErrorMsg('');
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    if (val.trim().length < 2) {
      setEndSuggestions([]);
      return;
    }

    debounceTimerRef.current = setTimeout(async () => {
      setIsSearchingEnd(true);
      const results = await searchAddress(val);
      setEndSuggestions(results);
      setIsSearchingEnd(false);
    }, 600);
  };

  // Plan Route calculation
  const handleCalculateRoutes = useCallback(async () => {
    if (!startCoord || !endCoord) {
      setErrorMsg('Please select valid start and destination locations.');
      return;
    }

    setErrorMsg('');
    setIsCalculating(true);

    try {
      const rawRoutes = await fetchOsrmRoutes(startCoord, endCoord);
      if (!rawRoutes || rawRoutes.length === 0) {
        throw new Error('Unable to find a valid route between these locations.');
      }

      // Evaluate risk for each route with the scoring engine
      const evaluatedRoutes = rawRoutes.map((route) => {
        const risk = evaluateRouteRisk({
          coordinates: route.coordinates,
          incidents,
          travelTime,
        });
        return {
          ...route,
          riskAssessment: risk,
        };
      });

      // Find the lowest risk route to mark as "Recommended"
      let lowestRiskIndex = 0;
      let minScore = evaluatedRoutes[0].riskAssessment.score;

      evaluatedRoutes.forEach((r, idx) => {
        if (r.riskAssessment.score < minScore) {
          minScore = r.riskAssessment.score;
          lowestRiskIndex = idx;
        }
      });

      // Mark the recommended route
      evaluatedRoutes[lowestRiskIndex].isRecommended = true;

      // Identify fastest route for trade-off computation
      const fastestDuration = Math.min(...evaluatedRoutes.map((r) => r.durationSeconds));
      const fastestDistance = evaluatedRoutes.find((r) => r.durationSeconds === fastestDuration)?.distanceMeters || 0;

      evaluatedRoutes.forEach((r) => {
        const extraSecs = r.durationSeconds - fastestDuration;
        const extraMeters = r.distanceMeters - fastestDistance;
        const extraMins = Math.round(extraSecs / 60);
        const extraKm = (extraMeters / 1000).toFixed(1);

        if (extraSecs <= 30 && Math.abs(extraMeters) < 200) {
          r.tradeoffText = 'Fastest route';
        } else {
          const minText = extraMins > 0 ? `+${extraMins} min${extraMins === 1 ? '' : 's'}` : 'Same time';
          const kmText = extraMeters > 0 ? `+${extraKm} km` : '';
          r.tradeoffText = `${minText}${kmText ? ` (${kmText})` : ''} vs fastest`;
        }
      });

      if (onRoutesCalculatedRef.current) {
        onRoutesCalculatedRef.current(evaluatedRoutes);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Routing failed. Please try again.');
    } finally {
      setIsCalculating(false);
    }
  }, [startCoord, endCoord, incidents, travelTime]);

  // Run initial calculation once on mount so Kanpur Central -> Rawatpur displays right away
  useEffect(() => {
    if (!initialCalculatedRef.current && incidents.length > 0) {
      initialCalculatedRef.current = true;
      const timer = setTimeout(() => {
        handleCalculateRoutes();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [incidents, handleCalculateRoutes]);

  // Re-evaluate routes when travel time changes
  useEffect(() => {
    if (routesRef.current.length > 0) {
      const updated = routesRef.current.map((route) => {
        const risk = evaluateRouteRisk({
          coordinates: route.coordinates,
          incidents,
          travelTime,
        });
        return {
          ...route,
          riskAssessment: risk,
        };
      });
      if (onRoutesCalculatedRef.current) {
        onRoutesCalculatedRef.current(updated);
      }
    }
  }, [travelTime, incidents]);

  const selectedRoute = routes[selectedRouteIndex];
  const hasSaferRoute =
    selectedRoute &&
    selectedRoute.riskAssessment?.code === 'RED' &&
    routes.some((r) => r.riskAssessment?.code !== 'RED');

  const saferRouteIndex = routes.findIndex((r) => r.isRecommended);

  return (
    <div className="route-planner-card">
      <div className="planner-header">
        <span className="card-kicker">03 / ROUTE RISK INTELLIGENCE</span>
        <h3>Plan a Safer Route</h3>
        <p className="card-description">
          Calculates segment-by-segment risk from street-level incidents and factors in night travel.
        </p>
      </div>

      {/* Preset fast selector for Kanpur */}
      <div className="preset-strip">
        <span className="preset-label">Kanpur Presets:</span>
        <button
          type="button"
          className="preset-btn"
          onClick={() => {
            setStartCoord(KANPUR_PRESETS[0]);
            setStartQuery(KANPUR_PRESETS[0].name);
            setEndCoord(KANPUR_PRESETS[1]);
            setEndQuery(KANPUR_PRESETS[1].name);
          }}
        >
          Central ➔ Rawatpur (Direct)
        </button>
        <button
          type="button"
          className="preset-btn"
          onClick={() => {
            setStartCoord(KANPUR_PRESETS[0]);
            setStartQuery(KANPUR_PRESETS[0].name);
            setEndCoord(KANPUR_PRESETS[3]);
            setEndQuery(KANPUR_PRESETS[3].name);
          }}
        >
          Central ➔ IIT Kanpur
        </button>
        <button
          type="button"
          className="preset-btn"
          onClick={() => {
            setStartCoord(KANPUR_PRESETS[4]);
            setStartQuery(KANPUR_PRESETS[4].name);
            setEndCoord(KANPUR_PRESETS[2]);
            setEndQuery(KANPUR_PRESETS[2].name);
          }}
        >
          Civil Lines ➔ Kakadeo
        </button>
      </div>

      <div className="route-inputs-grid">
        {/* Start Input */}
        <div className="input-group">
          <label htmlFor="start-location">Start Location</label>
          <div className="autocomplete-wrapper">
            <input
              id="start-location"
              type="text"
              value={startQuery}
              onChange={(e) => handleStartInputChange(e.target.value)}
              placeholder="Enter start location or landmark…"
            />
            {isSearchingStart && <span className="input-indicator">Searching…</span>}
          </div>
          {startSuggestions.length > 0 && (
            <ul className="suggestions-list" role="listbox">
              {startSuggestions.map((item, idx) => (
                <li
                  key={idx}
                  role="option"
                  aria-selected={false}
                  onClick={() => {
                    setStartCoord({ lat: item.lat, lng: item.lng, district: item.district });
                    setStartQuery(item.displayName);
                    setStartSuggestions([]);
                  }}
                >
                  <span className="sugg-name">{item.displayName}</span>
                  {item.district && <span className="sugg-district">({item.district})</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Destination Input */}
        <div className="input-group">
          <label htmlFor="end-location">Destination</label>
          <div className="autocomplete-wrapper">
            <input
              id="end-location"
              type="text"
              value={endQuery}
              onChange={(e) => handleEndInputChange(e.target.value)}
              placeholder="Enter destination or landmark…"
            />
            {isSearchingEnd && <span className="input-indicator">Searching…</span>}
          </div>
          {endSuggestions.length > 0 && (
            <ul className="suggestions-list" role="listbox">
              {endSuggestions.map((item, idx) => (
                <li
                  key={idx}
                  role="option"
                  aria-selected={false}
                  onClick={() => {
                    setEndCoord({ lat: item.lat, lng: item.lng, district: item.district });
                    setEndQuery(item.displayName);
                    setEndSuggestions([]);
                  }}
                >
                  <span className="sugg-name">{item.displayName}</span>
                  {item.district && <span className="sugg-district">({item.district})</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Travel Time Selector (Now vs Custom) */}
      <div className="time-selector-row">
        <div className="time-toggle-group">
          <span className="time-label">Travel Time:</span>
          <button
            type="button"
            className={`time-toggle-btn ${!isTravelTimeCustom ? 'active' : ''}`}
            onClick={() => onToggleTravelTimeCustom(false)}
          >
            Now
          </button>
          <button
            type="button"
            className={`time-toggle-btn ${isTravelTimeCustom ? 'active' : ''}`}
            onClick={() => onToggleTravelTimeCustom(true)}
          >
            Custom Time
          </button>
        </div>

        {isTravelTimeCustom && (
          <div className="custom-time-picker">
            <input
              type="time"
              value={travelTime}
              onChange={(e) => onTravelTimeChange(e.target.value)}
              aria-label="Select custom travel time"
            />
            <span className="night-info-note">
              {(() => {
                const hour = parseInt(travelTime.split(':')[0], 10);
                return hour >= 20 || hour < 5
                  ? '🌙 Night-time multiplier (x1.3) active'
                  : '☀️ Daytime hours (standard rate)';
              })()}
            </span>
          </div>
        )}

        <button
          type="button"
          className="primary-button plan-btn"
          onClick={handleCalculateRoutes}
          disabled={isCalculating}
        >
          {isCalculating ? 'Calculating…' : 'Find Safe Routes'} <span>➔</span>
        </button>
      </div>

      {errorMsg && (
        <div className="error-banner" role="alert">
          {errorMsg}
        </div>
      )}

      {/* High Risk Warning Banner */}
      {selectedRoute && selectedRoute.riskAssessment?.code === 'RED' && (
        <div className="warning-banner-high-risk" role="alert">
          <div className="warning-content">
            <span className="warning-icon">⚠️</span>
            <div>
              <strong>High-Risk Route Warning</strong>
              <p>
                This route crosses {selectedRoute.riskAssessment.redSegmentCount} dangerous segment
                {selectedRoute.riskAssessment.redSegmentCount === 1 ? '' : 's'} with{' '}
                {selectedRoute.riskAssessment.incidentCount} incident
                {selectedRoute.riskAssessment.incidentCount === 1 ? '' : 's'} within 100m (
                {selectedRoute.riskAssessment.nightIncidentsCount} at night). The stretch around GT Road / Jarib Chowki
                has high reported incident activity.
              </p>
            </div>
          </div>
          {hasSaferRoute && (
            <button
              type="button"
              className="safer-route-btn"
              onClick={() => onSelectRoute(saferRouteIndex)}
            >
              Show safer route <span>➔</span>
            </button>
          )}
        </div>
      )}

      {/* Alternatives List */}
      {routes.length > 0 && (
        <div className="route-alternatives-section">
          <h4>Alternative Routes ({routes.length})</h4>
          <div className="alternatives-grid">
            {routes.map((route, idx) => {
              const isSelected = idx === selectedRouteIndex;
              const { score, level, code, breakdownText, incidentCount } =
                route.riskAssessment || {};

              return (
                <div
                  key={route.id}
                  className={`route-card ${isSelected ? 'selected' : ''} ${code?.toLowerCase() || ''}`}
                  onClick={() => onSelectRoute(idx)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') onSelectRoute(idx);
                  }}
                  aria-pressed={isSelected}
                >
                  <div className="route-card-top">
                    <div className="route-title-wrap">
                      <span className="route-name">{route.name}</span>
                      {route.isRecommended && (
                        <span className="recommended-badge">✓ Recommended</span>
                      )}
                    </div>
                    <span className={`risk-pill ${code?.toLowerCase() || ''}`}>
                      {level || 'Low'} Risk ({score}/100)
                    </span>
                  </div>

                  <div className="route-metrics">
                    <div className="metric">
                      <span className="metric-label">Distance</span>
                      <span className="metric-value">{(route.distanceMeters / 1000).toFixed(1)} km</span>
                    </div>
                    <div className="metric">
                      <span className="metric-label">Duration</span>
                      <span className="metric-value">{Math.round(route.durationSeconds / 60)} mins</span>
                    </div>
                    <div className="metric">
                      <span className="metric-label">Incidents (100m)</span>
                      <span className="metric-value">{incidentCount || 0}</span>
                    </div>
                  </div>

                  {/* Trade-off vs Fastest Route */}
                  {route.tradeoffText && (
                    <div className="route-tradeoff">
                      <span className="tradeoff-icon">⚖</span>
                      <span>{route.tradeoffText}</span>
                    </div>
                  )}

                  {/* Visible Score Breakdown as required */}
                  <div className="route-breakdown-note">
                    <span className="breakdown-tag">Breakdown:</span> {breakdownText}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
