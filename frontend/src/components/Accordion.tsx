// src/components/Accordion.tsx
import { useState, PropsWithChildren } from "react";

type Props = {
  title: string;
  defaultOpen?: boolean;
};

export default function Accordion({ title, defaultOpen = false, children }: PropsWithChildren<Props>) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, background: "rgba(255,255,255,.03)" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "14px 16px",
          border: "none",
          outline: "none",
          background: "transparent",
          color: "#e5e7eb",
          fontWeight: 800,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          cursor: "pointer",
        }}
      >
        <span>{title}</span>
        <span
          style={{
            display: "inline-block",
            transition: "transform .25s",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            opacity: .85
          }}
        >
          ▼
        </span>
      </button>

      <div
        style={{
          overflow: "hidden",
          transition: "grid-template-rows .28s ease",
          display: "grid",
          gridTemplateRows: open ? "1fr" : "0fr",
        }}
      >
        <div style={{ minHeight: 0 }}>
          <div style={{ padding: "12px 16px 16px" }}>{children}</div>
        </div>
      </div>
    </div>
  );
}
