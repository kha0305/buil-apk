// Icon outline cho tag (21 lựa chọn, "none" đầu tiên = không hiện icon).
// Dùng chung cho: pill tên tag, chip lọc, bảng chọn icon trong đổi tên inline
// và trong sheet Tag của editor. Vẽ bằng SVG stroke, không dùng emoji.
// Kha chốt icon sổ ghi chú cho thông báo; icon tag là bộ riêng của tag.
import type { CSSProperties } from "react";

export const TAG_ICON_IDS = [
  "none",
  "tag",
  "star",
  "heart",
  "book",
  "briefcase",
  "home",
  "bulb",
  "music",
  "camera",
  "calendar",
  "gift",
  "plane",
  "car",
  "coffee",
  "gamepad",
  "activity",
  "money",
  "gradcap",
  "moon",
  "bell",
] as const;

export type TagIconId = (typeof TAG_ICON_IDS)[number];

const PATHS: Record<string, React.ReactNode> = {
  tag: (
    <>
      <path d="M4 4h7l9 9-7 7-9-9V4z" />
      <circle cx="8.5" cy="8.5" r="1.4" />
    </>
  ),
  star: (
    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5z" />
  ),
  heart: (
    <path d="M12 20s-7.5-4.6-9.3-9A5.2 5.2 0 0 1 12 6.4 5.2 5.2 0 0 1 21.3 11c-1.8 4.4-9.3 9-9.3 9z" />
  ),
  book: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5H6.5A2.5 2.5 0 0 0 4 21V5.5z" />
      <path d="M4 21a2.5 2.5 0 0 1 2.5-2.5H20" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3.5" y="7.5" width="17" height="12" rx="2" />
      <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3.5 12.5h17" />
    </>
  ),
  home: (
    <>
      <path d="M4 11l8-7 8 7" />
      <path d="M6 9.5V20h12V9.5" />
    </>
  ),
  bulb: (
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.3 2.2h4.6c.2-.9.6-1.6 1.3-2.2A6 6 0 0 0 12 3z" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V6l10-2v11" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="15" r="2" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  gift: (
    <>
      <rect x="4" y="10" width="16" height="10" rx="1.5" />
      <path d="M12 10v10M4 14h16" />
      <path d="M12 10s-4.5.3-4.5-2.3C7.5 5.5 10 5 12 10zm0 0s4.5.3 4.5-2.3C16.5 5.5 14 5 12 10z" />
    </>
  ),
  plane: (
    <path d="M21 3L3 10.5l7 2.5 2.5 7L21 3zM21 3L10 13" />
  ),
  car: (
    <>
      <path d="M4 15l1.5-4.5A2 2 0 0 1 7.4 9h9.2a2 2 0 0 1 1.9 1.5L20 15v4h-2.5" />
      <path d="M4 15v4h2.5" />
      <path d="M7 19h10" />
      <circle cx="7.5" cy="16.5" r="1.6" />
      <circle cx="16.5" cy="16.5" r="1.6" />
    </>
  ),
  coffee: (
    <>
      <path d="M5 9h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9z" />
      <path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M7 5.5c.8-.8.8-1.7 0-2.5M11 5.5c.8-.8.8-1.7 0-2.5" />
    </>
  ),
  gamepad: (
    <>
      <path d="M7 7h10a5 5 0 0 1 5 5v1a3 3 0 0 1-5.2 2L15 13.5H9L7.2 15A3 3 0 0 1 2 13v-1a5 5 0 0 1 5-5z" />
      <path d="M7.5 10v3M6 11.5h3" />
      <circle cx="16" cy="10.8" r=".9" />
      <circle cx="18" cy="12.8" r=".9" />
    </>
  ),
  activity: <path d="M3 12h4l3 7 4-14 3 7h4" />,
  money: (
    <>
      <rect x="3" y="6.5" width="18" height="11" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6.5 9.5h.01M17.5 14.5h.01" />
    </>
  ),
  gradcap: (
    <>
      <path d="M12 4L2.5 8.5 12 13l9.5-4.5L12 4z" />
      <path d="M6.5 11.5V16c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3v-4.5M20.5 9.5V15" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z" />,
  bell: (
    <>
      <path d="M6 9.5a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6z" />
      <path d="M10 19.5a2 2 0 0 0 4 0" />
    </>
  ),
};

interface TagIconProps {
  id?: string;
  size?: number;
  style?: CSSProperties;
}

/** Icon outline của tag. id "none" (hoặc không rõ) thì không vẽ gì. */
export default function TagIcon({ id = "none", size = 14, style }: TagIconProps) {
  if (id === "none" || !PATHS[id]) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      {PATHS[id]}
    </svg>
  );
}
