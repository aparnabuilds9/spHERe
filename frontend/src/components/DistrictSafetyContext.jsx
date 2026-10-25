/**
 * src/components/DistrictSafetyContext.jsx
 * 
 * Component for Layer B: Real NCRB District-Level Safety Context.
 * Parses and displays data from src/data/kanpur_crimes_women.csv.
 * Never hard-codes numbers; handles missing districts honestly without guessing.
 */


export default function DistrictSafetyContext({ districtStats, loading, locationName }) {
  if (loading) {
    return (
      <div className="district-card loading">
        <div className="spinner-small" />
        <p>Loading district safety context from NCRB records…</p>
      </div>
    );
  }

  if (!districtStats) {
    return (
      <div className="district-card fallback">
        <div className="district-header">
          <span className="district-tag">LAYER B · GOVERNMENT DATA</span>
          <h4>District Safety Context</h4>
        </div>
        <p className="no-district-message">
          <strong>No district data available for this area.</strong>
        </p>
        <p className="district-disclaimer">
          NCRB dataset is currently compiled for Kanpur districts. No district-level counts could be verified for {locationName || 'this location'}, and SPHERe will not guess.
        </p>
      </div>
    );
  }

  const { districtName, latestYear, totalReported, breakdown, trend } = districtStats;

  // Compute trend SVG dimensions
  const maxTrend = Math.max(...trend.map((t) => t.total), 1);
  const minTrend = Math.min(...trend.map((t) => t.total), 0);

  return (
    <div className="district-card">
      <div className="district-header">
        <div>
          <span className="district-tag">LAYER B · DISTRICT INTELLIGENCE</span>
          <h3 className="district-title">{districtName}</h3>
        </div>
        <div className="district-year-badge">Latest Year: {latestYear}</div>
      </div>

      <div className="district-summary-stat">
        <span className="stat-label">Total Reported Crimes Against Women ({latestYear})</span>
        <div className="stat-value">{totalReported.toLocaleString()}</div>
        <span className="stat-note">
          Raw counts shown. Population data is not present in this dataset, so per-capita crime rates cannot be calculated.
        </span>
      </div>

      {/* Category breakdown */}
      <div className="district-breakdown">
        <h4>Reported Crime Breakdown ({latestYear})</h4>
        <div className="breakdown-grid">
          {Object.entries(breakdown).map(([category, count]) => (
            <div key={category} className="breakdown-item">
              <span className="category-name">{category}</span>
              <span className="category-count">{count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Trend chart */}
      {trend && trend.length > 1 && (
        <div className="district-trend-section">
          <h4>Reported Crimes Trend ({trend[0].year} – {trend[trend.length - 1].year})</h4>
          <div className="trend-chart-wrapper">
            <svg
              className="trend-chart-svg"
              viewBox="0 0 320 90"
              preserveAspectRatio="none"
              aria-label={`Trend chart showing reported crimes against women in ${districtName} from ${trend[0].year} to ${trend[trend.length - 1].year}`}
            >
              {/* Grid lines */}
              <line x1="0" y1="20" x2="320" y2="20" stroke="#f0e9ed" strokeDasharray="3,3" />
              <line x1="0" y1="50" x2="320" y2="50" stroke="#f0e9ed" strokeDasharray="3,3" />
              <line x1="0" y1="80" x2="320" y2="80" stroke="#e0d5db" />

              {/* Area fill */}
              <polygon
                fill="rgba(123, 63, 94, 0.12)"
                points={`
                  0,80 
                  ${trend
                    .map((pt, i) => {
                      const x = (i / (trend.length - 1)) * 320;
                      const y = 80 - ((pt.total - minTrend) / (maxTrend - minTrend || 1)) * 65;
                      return `${x.toFixed(1)},${y.toFixed(1)}`;
                    })
                    .join(' ')} 
                  320,80
                `}
              />

              {/* Trend polyline */}
              <polyline
                fill="none"
                stroke="#7b3f5e"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={trend
                  .map((pt, i) => {
                    const x = (i / (trend.length - 1)) * 320;
                    const y = 80 - ((pt.total - minTrend) / (maxTrend - minTrend || 1)) * 65;
                    return `${x.toFixed(1)},${y.toFixed(1)}`;
                  })
                  .join(' ')}
              />

              {/* Points */}
              {trend.map((pt, i) => {
                const x = (i / (trend.length - 1)) * 320;
                const y = 80 - ((pt.total - minTrend) / (maxTrend - minTrend || 1)) * 65;
                return (
                  <circle
                    key={pt.year}
                    cx={x.toFixed(1)}
                    cy={y.toFixed(1)}
                    r="3.5"
                    fill="#7b3f5e"
                  >
                    <title>{`${pt.year}: ${pt.total} reported crimes`}</title>
                  </circle>
                );
              })}
            </svg>
            <div className="trend-labels">
              <span>{trend[0].year} ({trend[0].total})</span>
              <span>Mid ({trend[Math.floor(trend.length / 2)].year})</span>
              <span>{latestYear} ({totalReported})</span>
            </div>
          </div>
        </div>
      )}

      {/* Mandatory exact label */}
      <div className="exact-source-label">
        <span className="source-icon">ℹ</span>
        <p>
          Source: NCRB Crime in India data (compiled dataset), district level, latest year: {latestYear}. District-level counts cannot show risk on a specific street.
        </p>
      </div>
      <p className="district-separation-note">
        Note: District context is displayed for macro-level administrative transparency and is completely separate from street-level route risk calculations.
      </p>
    </div>
  );
}
