import React from "react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
export { Button, Card, Badge, SegmentedControl, SegmentedControlItem };
const paths = {
  numbers:
    "M5 3h14v18H5zM9 6h6M9 18h6M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01",
  connections:
    "M10 13a5 5 0 0 0 7 .3l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7-.3l-3 3a5 5 0 0 0 7 7l2-2",
  headphones: "M4 14v-3a8 8 0 0 1 16 0v3M4 12H2v8h5v-8H4M20 12h2v8h-5v-8h3",
  chevron: "m9 5 7 7-7 7",
  calls:
    "M5 3h4l1 5-2 2a14 14 0 0 0 6 6l2-2 5 1v4a2 2 0 0 1-2 2C10 20 4 14 3 5a2 2 0 0 1 2-2",
  memory: "M5 3h14v18H5zM8 8h8M8 12h8M8 16h5",
  transcript: "M5 3h14v18H5zM8 8h8M8 12h8M8 16h5",
  record:
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  join: "M9 21H3v-3a5 5 0 0 1 10 0M11 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M18 8v10M13 13h10",
  browser: "M3 4h18v16H3zM3 9h18M6 6.5h.01M9 6.5h.01",
  wave: "M3 10v4M7 6v12M11 3v18M15 7v10M19 5v14M23 10v4",
  overview: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  routes: "M5 19 19 5M5 5h14v14",
  connection:
    "M10 13a5 5 0 0 0 7 .3l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7-.3l-3 3a5 5 0 0 0 7 7l2-2",
  activity: "M3 12a9 9 0 1 0 3-6M3 3v6h6M12 7v5l3 2",
  settings:
    "M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  design: "M3 3h18v18H3zM3 9h18M9 9v12",
  arrow: "M5 12h14M13 6l6 6-6 6",
  diagonal: "M6 18 18 6M6 6h12v12",
  plus: "M12 5v14M5 12h14",
  close: "m6 6 12 12M6 18 18 6",
  menu: "M4 7h16M4 12h16M4 17h16",
  play: "m9 5 11 7-11 7z",
  pause: "M9 5v14M15 5v14",
  phone:
    "M5 3h4l1 5-2 2a14 14 0 0 0 6 6l2-2 5 1v4a2 2 0 0 1-2 2C10 20 4 14 3 5a2 2 0 0 1 2-2",
  mute: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8",
  muted:
    "M3 3l18 18M9 9v3a3 3 0 0 0 5 2M15 9V6a3 3 0 0 0-5-2M5 10v2a7 7 0 0 0 12 5M19 10v2M12 19v3M8 22h8",
  end: "M3 14v4h5v-4a10 10 0 0 1 8 0v4h5v-4C16 7 8 7 3 14z",
  collapse: "M4 4h16v16H4zM10 4v16M16 9l-3 3 3 3",
  expand: "M4 4h16v16H4zM10 4v16M14 9l3 3-3 3",
  moon: "M20 14a8 8 0 1 1-10-10 7 7 0 0 0 10 10",
  sun: "M12 2v2M12 20v2M2 12h2M20 12h2M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  shield: "M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6zM8 12l3 3 5-6",
  search: "M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16M16 16l6 6",
  check: "M5 12l4 4L19 6",
  copy: "M9 9h12v12H9zM15 5V2H2v13h3",
  download: "M12 3v12M7 10l5 5 5-5M4 16v5h16v-5",
  globe:
    "M3 12h18M12 3a16 16 0 0 1 0 18 16 16 0 0 1 0-18M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  key: "M15 3a6 6 0 1 1-4 10L3 21H1v-4l8-8a6 6 0 0 1 6-6zM16 7h.01",
  logout: "M9 5H4v14h5M10 12h11M17 8l4 4-4 4",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  spark: "m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4z",
};
export function Icon({ name, size = 18, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name] || paths.diagonal} />
    </svg>
  );
}
export function Mark({ className = "" }) {
  return (
    <svg
      className={"connection-mark " + className}
      width="30"
      height="30"
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M19 11a8 8 0 1 0 0 14l7-4a8 8 0 1 0-8-14l-8 5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="m13 21 10-6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
export function Pill({ children, tone = "muted", dot = false }) {
  return (
    <span className={"status-pill " + tone}>
      {dot && <i />}
      {children}
    </span>
  );
}
export function Btn({
  label,
  icon,
  end = "arrow",
  primary = false,
  className = "",
  ...props
}) {
  return (
    <Button
      label={label}
      variant={primary ? "primary" : "secondary"}
      icon={icon ? <Icon name={icon} size={16} /> : undefined}
      endContent={end ? <Icon name={end} size={15} /> : undefined}
      className={"ab-button " + (primary ? "button-primary " : "") + className}
      {...props}
    />
  );
}
export function IconBtn({ label, name, className = "", ...props }) {
  return (
    <Button
      label={label}
      icon={<Icon name={name} size={17} />}
      isIconOnly
      variant="ghost"
      className={"ab-icon-button " + className}
      {...props}
    />
  );
}
export function Wave({ muted = false, animated = false }) {
  return (
    <span
      className={
        "voice-wave " +
        (muted ? "is-muted " : "") +
        (animated ? "is-animated" : "")
      }
      aria-hidden="true"
    >
      {Array.from({ length: 21 }, (_, i) => (
        <i
          key={i}
          style={{
            "--wave-h": 4 + (Math.sin(i * 1.3) + 1) * 6 + "px",
            ...(animated
              ? {
                  "--wave-delay": (i % 7) * -0.16 + "s",
                  "--wave-duration": 1.1 + (i % 5) * 0.12 + "s",
                }
              : {}),
          }}
        />
      ))}
    </span>
  );
}
export function Loop({ variant = "hero", className = "" }) {
  const id = React.useId().replaceAll(":", "");
  return (
    <svg
      className={`connection-loop ${variant} ${className}`}
      viewBox="0 0 900 650"
      role="img"
      aria-label="Two continuous silver connection paths meeting in a flowing loop"
    >
      <defs>
        <linearGradient id={id + "metal"} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#343f42" />
          <stop offset=".22" stopColor="#d7e4e7" />
          <stop offset=".32" stopColor="#6b8189" />
          <stop offset=".5" stopColor="#243033" />
          <stop offset=".65" stopColor="#adc6cf" />
          <stop offset=".77" stopColor="#e3edef" />
          <stop offset="1" stopColor="#405258" />
        </linearGradient>
        <linearGradient id={id + "edge"} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#e2ecec" stopOpacity=".1" />
          <stop offset=".45" stopColor="#f3ffff" stopOpacity=".8" />
          <stop offset="1" stopColor="#88b3be" stopOpacity=".2" />
        </linearGradient>
        <filter id={id + "shadow"} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow
            dx="0"
            dy="13"
            stdDeviation="8"
            floodColor="#000"
            floodOpacity=".5"
          />
        </filter>
      </defs>
      <g fill="none" strokeLinecap="round" filter={`url(#${id}shadow)`}>
        <path
          d="M-90 90C190-30 300 42 264 189S148 453 169 512 388 411 445 274 469 90 556 130 656 370 626 503 736 637 987 475"
          stroke={`url(#${id}metal)`}
          strokeWidth="15"
        />
        <path
          d="M-90 86C190-34 300 38 260 189S144 449 166 510 384 407 442 273 465 86 554 127 652 368 623 502 733 633 987 471"
          stroke={`url(#${id}edge)`}
          strokeWidth="2"
        />
      </g>
    </svg>
  );
}
