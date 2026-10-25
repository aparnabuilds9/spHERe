/**
 * src/components/PhysicalSafety.jsx
 * 
 * MODULE 3: PHYSICAL SAFETY INTELLIGENCE
 * Integrates:
 * 1. Leaflet + OpenStreetMap Map (Kanpur default)
 * 2. Layer A: Street-level demo incidents (~30 points with honest "Demo data" labeling)
 * 3. Layer B: District-level real NCRB data from CSV (client-side parse, trend chart, raw counts)
 * 4. Segment-level risk coloring (Green / Yellow / Red) along route polylines
 * 5. Route-level 0-100 score with visible breakdown and night multiplier (8 PM - 5 AM)
 * 6. High-risk warning banner & alternative routes with trade-offs
 * 7. Live tracking with watchPosition, jitter smoothing, surroundings risk badge,
 *    and simulation presets (Inside red cluster, Near yellow area, Safe area, Tap map)
 * 8. Proximity alert & vibration before entering red stretches
 * 9. Emergency shortcut linking to /emergency
 */

import { useState, useEffect } from 'react';
import demoIncidents from '../data/incidents.json';
import { parseDistrictCrimeCsv, getDistrictStats } from '../utils/districtData';
import { reverseGeocode } from '../utils/geoService';

import PhysicalSafetyMap from './PhysicalSafetyMap';
import RoutePlanner from './RoutePlanner';
import LiveTracker from './LiveTracker';
import DistrictSafetyContext from './DistrictSafetyContext';
import './PhysicalSafety.css';

export default function PhysicalSafety({ goTo }) {
  // Layer A: Street-level demo incidents
  const [incidents] = useState(demoIncidents);

  // Layer B: Parsed NCRB district crime records
  const [districtDataState, setDistrictDataState] = useState(null);
  const [isDistrictLoading, setIsDistrictLoading] = useState(true);
  const [districtStats, setDistrictStats] = useState(null);
  const [detectedDistrictName, setDetectedDistrictName] = useState('Kanpur Nagar');

  // Travel time state: Now vs Custom
  const [isTravelTimeCustom, setIsTravelTimeCustom] = useState(false);
  const [travelTime, setTravelTime] = useState(() => {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  });

  // Routing state
  const [routes, setRoutes] = useState([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [startLocation, setStartLocation] = useState(null);
  const [endLocation, setEndLocation] = useState(null);

  // Live tracking & user position state
  const [userLocation, setUserLocation] = useState(null);
  const [trackingActive, setTrackingActive] = useState(false);
  const [trackingRisk, setTrackingRisk] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isSimulateTapActive, setIsSimulateTapActive] = useState(false);

  // 1. Load Layer B: Parse NCRB District CSV client-side
  useEffect(() => {
    let isMounted = true;

    parseDistrictCrimeCsv()
      .then((parsed) => {
        if (!isMounted) return;
        setDistrictDataState(parsed);
        // Default to Kanpur Nagar initially
        const initialStats = getDistrictStats(parsed, 'Kanpur Nagar');
        setDistrictStats(initialStats);
        setIsDistrictLoading(false);
      })
      .catch((err) => {
        console.warn('Error parsing district CSV:', err);
        if (isMounted) {
          setIsDistrictLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Reverse-geocode to detect district whenever start or end location changes
  useEffect(() => {
    if (!startLocation && !endLocation) return;
    const targetLoc = startLocation || endLocation;

    let isMounted = true;
    reverseGeocode(targetLoc.lat, targetLoc.lng).then((res) => {
      if (!isMounted) return;
      if (res && res.district) {
        setDetectedDistrictName(res.district);
        if (districtDataState) {
          const stats = getDistrictStats(districtDataState, res.district);
          setDistrictStats(stats);
        }
      } else {
        setDetectedDistrictName('Unknown area');
        setDistrictStats(null);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [startLocation, endLocation, districtDataState]);

  // Handle map click when tap-to-simulate is active
  const handleMapClickToSimulate = (lat, lng) => {
    if (!isSimulateTapActive) return;
    setUserLocation({ lat, lng });
    setTrackingActive(true);
    setIsSimulating(true);
  };

  // Switch to safer route handler
  const handleSelectSaferRoute = () => {
    const safeIdx = routes.findIndex((r) => r.isRecommended);
    if (safeIdx !== -1) {
      setSelectedRouteIndex(safeIdx);
    }
  };

  return (
    <div className="physical-safety-module">
      {/* Top Action Bar with prominent Emergency link */}
      <div className="module-top-bar">
        <div className="module-breadcrumbs">
          <span className="module-number">03</span>
          <span className="module-title">PHYSICAL SAFETY INTELLIGENCE</span>
        </div>
        <div className="module-actions">
          <a
            href="/emergency"
            className="emergency-shortcut-btn"
            onClick={(e) => {
              e.preventDefault();
              if (goTo) goTo('emergency');
            }}
            aria-label="Immediate Emergency Assistance"
          >
            <span className="emergency-icon">✳</span>
            <span>Emergency (112)</span>
          </a>
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="physical-dashboard-grid">
        {/* Left Column: Live Tracker + Map + Disclaimers */}
        <div className="map-and-tracking-column">
          {/* Live surroundings status badge & controls */}
          <LiveTracker
            incidents={incidents}
            travelTime={isTravelTimeCustom ? travelTime : null}
            selectedRoute={routes[selectedRouteIndex] || null}
            onUserLocationChange={(coords) => setUserLocation(coords)}
            onTrackingStatusChange={(status) => {
              setTrackingActive(status.isTracking);
              setTrackingRisk(status.risk);
              setIsSimulating(status.isSimulated || false);
            }}
            onSelectSaferRoute={handleSelectSaferRoute}
            onEnableSimulateTap={() => setIsSimulateTapActive(!isSimulateTapActive)}
            isSimulateTapActive={isSimulateTapActive}
          />

          {/* Interactive Leaflet Map */}
          <PhysicalSafetyMap
            incidents={incidents}
            routes={routes}
            selectedRouteIndex={selectedRouteIndex}
            onSelectRoute={(idx) => setSelectedRouteIndex(idx)}
            userLocation={userLocation}
            trackingActive={trackingActive}
            trackingRisk={trackingRisk}
            isSimulating={isSimulating}
            onMapClickToSimulate={handleMapClickToSimulate}
            startLocation={startLocation}
            endLocation={endLocation}
          />

          {/* Honest Disclaimers Strip */}
          <div className="safety-guarantee-note">
            <span className="guarantee-icon">ℹ</span>
            <p>
              <strong>Honest Guidance Disclaimer:</strong> Colours are based on demo data and limited reports. This is guidance, not a guarantee of safety. Always trust your personal instincts and situational awareness.
            </p>
          </div>
        </div>

        {/* Right Column: Route Planner + District Context */}
        <div className="planner-and-district-column">
          {/* Route Planning & Alternatives */}
          <RoutePlanner
            incidents={incidents}
            onRoutesCalculated={(calcRoutes) => {
              setRoutes(calcRoutes);
              // If current index is out of bounds, reset to 0
              if (selectedRouteIndex >= calcRoutes.length) {
                setSelectedRouteIndex(0);
              }
            }}
            selectedRouteIndex={selectedRouteIndex}
            onSelectRoute={(idx) => setSelectedRouteIndex(idx)}
            routes={routes}
            travelTime={travelTime}
            onTravelTimeChange={(newTime) => setTravelTime(newTime)}
            isTravelTimeCustom={isTravelTimeCustom}
            onToggleTravelTimeCustom={(isCustom) => setIsTravelTimeCustom(isCustom)}
            onLocationsChange={(start, end) => {
              setStartLocation(start);
              setEndLocation(end);
            }}
          />

          {/* Layer B: District Safety Context Card */}
          <DistrictSafetyContext
            districtStats={districtStats}
            loading={isDistrictLoading}
            locationName={detectedDistrictName}
          />
        </div>
      </div>
    </div>
  );
}
