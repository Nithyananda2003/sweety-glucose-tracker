import { useState } from 'react';
import { Activity, LoaderCircle } from 'lucide-react';

const fmt = (date, options = {}) =>
  new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    ...options,
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));

export default function Chart({ trend, selectedDate, loading }) {
  const [hover, setHover] = useState(null);
  const width = 660;
  const height = 190;
  const left = 39;
  const right = 15;
  const top = 15;
  const bottom = 30;
  const values = trend.map((point) => point.average);
  const low = values.length ? Math.max(0, Math.floor((Math.min(...values) - 20) / 20) * 20) : 60;
  const high = values.length
    ? Math.max(low + 60, Math.ceil((Math.max(...values) + 20) / 20) * 20)
    : 180;
  const lastDay = Number(selectedDate.slice(-2));
  const plotHeight = height - top - bottom;
  const x = (day) => left + ((day - 1) / Math.max(1, lastDay - 1)) * (width - left - right);
  const y = (value) => top + ((high - value) / (high - low)) * plotHeight;
  const points = trend.map((point) => ({
    ...point,
    x: x(Number(point.date.slice(-2))),
    y: y(point.average),
  }));
  const line = points.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(' ');
  const area = points.length
    ? `${line} L${points.at(-1).x},${height - bottom} L${points[0].x},${height - bottom} Z`
    : '';
  const ticks = [
    ...new Set([
      1,
      Math.max(1, Math.round(lastDay / 3)),
      Math.max(1, Math.round((lastDay * 2) / 3)),
      lastDay,
    ]),
  ];
  return (
    <div className="chart-wrap">
      {loading ? (
        <div className="chart-empty">
          <LoaderCircle className="spin" size={23} />
          Loading your trend…
        </div>
      ) : !points.length ? (
        <div className="chart-empty">
          <Activity size={28} />
          <strong>Your story starts with one reading</strong>
          <span>Add a reading to see your monthly trend here.</span>
        </div>
      ) : (
        <>
          <svg
            className="trend-chart"
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={`Daily average glucose for ${fmt(selectedDate, { month: 'long', day: undefined })}, from ${low} to ${high} mg/dl`}
          >
            <defs>
              <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#5d9f87" stopOpacity=".2" />
                <stop offset="100%" stopColor="#5d9f87" stopOpacity=".01" />
              </linearGradient>
            </defs>
            {[0, 1, 2, 3].map((step) => {
              const value = Math.round(high - (step * (high - low)) / 3);
              return (
                <g key={step}>
                  <line
                    x1={left}
                    x2={width - right}
                    y1={y(value)}
                    y2={y(value)}
                    stroke="#e6ece7"
                    strokeDasharray="4 5"
                  />
                  <text x={left - 12} y={y(value) + 4} textAnchor="end">
                    {value}
                  </text>
                </g>
              );
            })}
            <path d={area} fill="url(#chart-fill)" />
            <path d={line} fill="none" stroke="#287763" strokeWidth="2.5" strokeLinejoin="round" />
            {points.map((point) => (
              <circle
                tabIndex="0"
                key={point.date}
                cx={point.x}
                cy={point.y}
                r={hover?.date === point.date ? 5 : 3.5}
                fill="#fff"
                stroke="#287763"
                strokeWidth="2"
                onMouseEnter={() => setHover(point)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(point)}
                onBlur={() => setHover(null)}
              >
                <title>
                  {fmt(point.date)}: {point.average.toFixed(1)} mg/dl ({point.count} readings)
                </title>
              </circle>
            ))}
            {ticks.map((day) => (
              <text key={day} x={x(day)} y={height - 6} textAnchor="middle">
                {String(day).padStart(2, '0')}{' '}
                {fmt(selectedDate, { day: undefined, month: 'short' })}
              </text>
            ))}
          </svg>
          <div className="chart-legend">
            <span className="legend-dot" />
            {hover
              ? `${fmt(hover.date)} · ${hover.average.toFixed(1)} mg/dl · ${hover.count} readings`
              : 'Daily average'}
            <span className="chart-unit">mg/dl</span>
          </div>
        </>
      )}
    </div>
  );
}
