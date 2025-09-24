import React from "react";

type Props = {
  value: number;          // 0..100
  size?: number;          // px
  stroke?: number;        // px
  label?: string;
};

export default function Gauge({ value, size = 140, stroke = 12, label = "Confianza" }: Props) {
  const clamped = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const dash = (clamped / 100) * C;
  const rest = C - dash;
  const gradId = "g-" + Math.round(size + stroke);

  return (
    <div className="inline-flex flex-col items-center">
      <svg width={size} height={size} className="drop-shadow">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgba(255,255,255,.12)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={`url(#${gradId})`}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${rest}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x="50%" y="54%" textAnchor="middle" className="fill-white" style={{ font: "600 20px Inter, sans-serif" }}>
          {Math.round(clamped)}%
        </text>
      </svg>
      <div className="mt-1 text-xs opacity-70">{label}</div>
    </div>
  );
}
