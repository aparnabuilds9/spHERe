/**
 * src/components/PhysicalSafetyMap.jsx
 * 
 * Interactive Leaflet Map for Physical Safety Intelligence.
 * Renders:
 * - Layer A demo incidents with honest "Demo data" labeling
 * - Multi-colored segmented route polylines (Green / Yellow / Red)
 * - Live user tracking pulsing marker + 150m translucent dynamic risk circle
 * - Click-to-simulate location handler
 * - Re-centre button
 */

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Default center: Kanpur, Uttar Pradesh
const KANPUR_CENTER = [26.4499, 80.3319];
const DEFAULT_ZOOM = 13;

export default function PhysicalSafetyMap({
  incidents = [],
  routes = [],
  selectedRouteIndex = 0,
  onSelectRoute,
  userLocation = null,
  trackingActive = false,
  trackingRisk = null,
  isSimulating = false,
  onMapClickToSimulate,
  startLocation = null,
  endLocation = null,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);

  const onMapClickToSimulateRef = useRef(onMapClickToSimulate);
  const onSelectRouteRef = useRef(onSelectRoute);

  useEffect(() => {
    onMapClickToSimulateRef.current = onMapClickToSimulate;
    onSelectRouteRef.current = onSelectRoute;
  });

  // Layer groups for clean updates without re-instantiating the map
  const incidentsLayerRef = useRef(null);
  const routesLayerRef = useRef(null);
  const userMarkerLayerRef = useRef(null);
  const endpointsLayerRef = useRef(null);

  // 1. Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: KANPUR_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
    });

    // OpenStreetMap standard tile layer (no API key required)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    // Initialize layer groups
    routesLayerRef.current = L.layerGroup().addTo(map);
    incidentsLayerRef.current = L.layerGroup().addTo(map);
    endpointsLayerRef.current = L.layerGroup().addTo(map);
    userMarkerLayerRef.current = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;

    // Handle map click for location simulation
    map.on('click', (e) => {
      if (onMapClickToSimulateRef.current) {
        onMapClickToSimulateRef.current(e.latlng.lat, e.latlng.lng);
      }
    });

    // Ensure map container renders properly after mount
    setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // 2. Render Layer A Demo Incidents
  useEffect(() => {
    const layer = incidentsLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    incidents.forEach((inc) => {
      // Determine marker color by severity
      let markerColor = '#e53935'; // Severity 4-5
      if (inc.severity === 3) markerColor = '#f57c00';
      if (inc.severity <= 2) markerColor = '#2e7d32';

      const customIcon = L.divIcon({
        className: 'custom-incident-pin',
        html: `
          <div style="
            background-color: ${markerColor};
            width: 22px;
            height: 22px;
            border-radius: 50%;
            border: 2px solid #ffffff;
            box-shadow: 0 2px 6px rgba(0,0,0,0.35);
            display: flex;
            align-items: center;
            justify-content: center;
            color: #ffffff;
            font-size: 11px;
            font-weight: bold;
          ">
            ${inc.severity}
          </div>
        `,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      const marker = L.marker([inc.lat, inc.lng], { icon: customIcon });

      // Honest labeling: Every marker explicitly displays "Demo data"
      const popupHtml = `
        <div style="font-family: inherit; font-size: 13px; line-height: 1.4; min-width: 180px;">
          <div style="display: inline-block; background: #fee2e2; color: #991b1b; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; margin-bottom: 6px; text-transform: uppercase;">
            Demo data (Unverified)
          </div>
          <div style="font-weight: 600; color: #1f2937; margin-bottom: 4px;">${inc.type}</div>
          <div style="color: #4b5563; font-size: 12px;"><strong>Severity:</strong> ${inc.severity}/5</div>
          <div style="color: #4b5563; font-size: 12px;"><strong>Time:</strong> ${inc.time_of_day} (${inc.date})</div>
          <div style="color: #6b7280; font-size: 11px; margin-top: 6px; border-top: 1px solid #f3f4f6; padding-top: 4px;">
            Source: ${inc.source}
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml);
      layer.addLayer(marker);
    });
  }, [incidents]);

  // 3. Render Route Endpoints (Start / Destination)
  useEffect(() => {
    const layer = endpointsLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (startLocation) {
      const startIcon = L.divIcon({
        className: 'endpoint-start-icon',
        html: `
          <div style="
            background: #2e7d32;
            color: #ffffff;
            padding: 4px 8px;
            border-radius: 12px;
            border: 2px solid #ffffff;
            font-size: 11px;
            font-weight: 700;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            white-space: nowrap;
          ">
            ● Start
          </div>
        `,
        iconSize: [60, 24],
        iconAnchor: [30, 24],
      });
      L.marker([startLocation.lat, startLocation.lng], { icon: startIcon }).addTo(layer);
    }

    if (endLocation) {
      const endIcon = L.divIcon({
        className: 'endpoint-dest-icon',
        html: `
          <div style="
            background: #7b3f5e;
            color: #ffffff;
            padding: 4px 8px;
            border-radius: 12px;
            border: 2px solid #ffffff;
            font-size: 11px;
            font-weight: 700;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            white-space: nowrap;
          ">
            ★ Destination
          </div>
        `,
        iconSize: [85, 24],
        iconAnchor: [42, 24],
      });
      L.marker([endLocation.lat, endLocation.lng], { icon: endIcon }).addTo(layer);
    }
  }, [startLocation, endLocation]);

  // 4. Render Segmented Multi-Colored Routes
  useEffect(() => {
    const layer = routesLayerRef.current;
    const map = mapInstanceRef.current;
    if (!layer || !map) return;
    layer.clearLayers();

    if (!routes || routes.length === 0) return;

    const bounds = L.latLngBounds([]);

    routes.forEach((route, rIndex) => {
      const isSelected = rIndex === selectedRouteIndex;

      // If route has pre-scored segments, draw each with its risk color
      if (route.riskAssessment && route.riskAssessment.scoredSegments) {
        route.riskAssessment.scoredSegments.forEach((seg) => {
          const latLngs = [seg.start, seg.end];
          latLngs.forEach((pt) => bounds.extend(pt));

          const polyline = L.polyline(latLngs, {
            color: isSelected ? seg.color : '#9ca3af',
            weight: isSelected ? 7 : 4,
            opacity: isSelected ? 0.95 : 0.4,
            lineCap: 'round',
            lineJoin: 'round',
          });

          // Allow clicking any segment to select this route
          polyline.on('click', () => {
            if (onSelectRouteRef.current) onSelectRouteRef.current(rIndex);
          });

          polyline.bindTooltip(
            `Route: ${route.name}<br>Segment Risk: <strong>${seg.level}</strong> (${seg.incidentCount} incident${seg.incidentCount === 1 ? '' : 's'})`,
            { sticky: true }
          );

          layer.addLayer(polyline);
        });
      } else if (route.coordinates) {
        // Fallback simple polyline if no segments yet
        route.coordinates.forEach((pt) => bounds.extend(pt));
        const polyline = L.polyline(route.coordinates, {
          color: isSelected ? '#7b3f5e' : '#9ca3af',
          weight: isSelected ? 6 : 4,
          opacity: isSelected ? 0.9 : 0.4,
        });
        polyline.on('click', () => {
          if (onSelectRouteRef.current) onSelectRouteRef.current(rIndex);
        });
        layer.addLayer(polyline);
      }
    });

    // Auto-fit map to show route
    if (bounds.isValid() && !trackingActive) {
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [routes, selectedRouteIndex, trackingActive]);

  // 5. Render User Live Position & Surroundings Risk Circle
  useEffect(() => {
    const layer = userMarkerLayerRef.current;
    const map = mapInstanceRef.current;
    if (!layer || !map) return;
    layer.clearLayers();

    if (!userLocation) return;

    const { lat, lng } = userLocation;
    const statusColor = trackingRisk?.color || '#2e7d32';

    // 150m translucent dynamic risk circle
    const riskCircle = L.circle([lat, lng], {
      radius: 150,
      color: statusColor,
      fillColor: statusColor,
      fillOpacity: 0.18,
      weight: 2,
      dashArray: '4, 4',
    });
    layer.addLayer(riskCircle);

    // Live pulsing user marker
    const userMarkerIcon = L.divIcon({
      className: 'live-user-marker',
      html: `
        <div style="position: relative; width: 28px; height: 28px;">
          <div style="
            position: absolute;
            top: 0; left: 0; width: 28px; height: 28px;
            border-radius: 50%;
            background: ${statusColor};
            opacity: 0.35;
            animation: pulse-ring 1.8s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
          "></div>
          <div style="
            position: absolute;
            top: 4px; left: 4px; width: 20px; height: 20px;
            border-radius: 50%;
            background: #ffffff;
            border: 3px solid ${statusColor};
            box-shadow: 0 2px 6px rgba(0,0,0,0.4);
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <div style="width: 8px; height: 8px; border-radius: 50%; background: ${statusColor};"></div>
          </div>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    const userMarker = L.marker([lat, lng], {
      icon: userMarkerIcon,
      zIndexOffset: 1000,
    });

    userMarker.bindTooltip(
      `<strong>${isSimulating ? 'Simulated Position' : 'Your Live Location'}</strong><br>Status: ${trackingRisk?.level || 'Low Risk'}`,
      { permanent: false, direction: 'top' }
    );

    layer.addLayer(userMarker);

    // Re-center map smoothly if tracking is active
    if (trackingActive) {
      map.setView([lat, lng], Math.max(map.getZoom(), 15), { animate: true });
    }
  }, [userLocation, trackingActive, trackingRisk, isSimulating]);

  const handleRecenter = () => {
    if (mapInstanceRef.current && userLocation) {
      mapInstanceRef.current.setView([userLocation.lat, userLocation.lng], 16, { animate: true });
    }
  };

  return (
    <div className="map-wrapper-card">
      {/* Persistent Banner as required by Layer A */}
      <div className="demo-data-banner" role="note">
        <span className="demo-badge">DEMO DATA</span>
        <span>
          Street-level points are demo data, not real reports. Colours are based on demo data and limited reports. This is guidance, not a guarantee of safety.
        </span>
      </div>

      <div className="map-container-relative">
        <div ref={mapContainerRef} className="leaflet-map-element" />

        {/* Floating Re-center button */}
        {userLocation && (
          <button
            type="button"
            className="recenter-button"
            onClick={handleRecenter}
            aria-label="Re-center map on your location"
          >
            <span className="recenter-icon">⌖</span>
            <span>Re-centre</span>
          </button>
        )}

        {/* Map Legend */}
        <div className="map-legend">
          <div className="legend-title">Segment Safety</div>
          <div className="legend-item">
            <span className="legend-swatch green" /> Safe stretch (Low)
          </div>
          <div className="legend-item">
            <span className="legend-swatch yellow" /> Caution stretch (Medium)
          </div>
          <div className="legend-item">
            <span className="legend-swatch red" /> Dangerous stretch (High)
          </div>
        </div>
      </div>
    </div>
  );
}
