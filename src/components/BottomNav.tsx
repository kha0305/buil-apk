// Thanh điều hướng dưới cùng v18: 3 mục, nút + nằm gọn trong thanh
// (không nhô lên trên mép). Mục đang mở có viên thuốc đỏ nhạt sau icon.
// Chế độ chọn thì thanh đổi thành menu chọn: Chọn tất cả / Hủy / Thùng rác.
// Icon vẽ bằng SVG (không dùng emoji).
import type { ReactNode } from "react";

export type NavView = "list" | "trash" | "backup";

type Props = {
  view: NavView;
  onSelect: (view: NavView) => void;
  onNew: () => void;
  selectMode?: boolean;
  allSelected?: boolean;
  onToggleSelectAll?: () => void;
  onCancelSelect?: () => void;
  onTrashSelected?: () => void;
};

const iconProps = {
  width: 26,
  height: 26,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const homeIcon = (
  <svg {...iconProps} aria-hidden="true">
    <path d="M4 11.5 12 4l8 7.5" />
    <path d="M6 10.5V20h12v-9.5" />
    <path d="M10 20v-5h4v5" />
  </svg>
);

const backupIcon = (
  <svg {...iconProps} aria-hidden="true">
    <path d="M7 18.5a4 4 0 0 1-.9-7.9 5.5 5.5 0 0 1 10.7 1.4A3.5 3.5 0 0 1 17.5 19H7z" />
    <path d="M12 12.5V20M8.8 15.7 12 12.5l3.2 3.2" />
  </svg>
);

const trashIconSmall = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" />
  </svg>
);

function Tab({ view, label, icon, current, onSelect }: {
  view: NavView;
  label: string;
  icon: ReactNode;
  current: NavView;
  onSelect: (view: NavView) => void;
}) {
  return (
    <button
      type="button"
      className={current === view ? "active" : undefined}
      aria-current={current === view ? "page" : undefined}
      onClick={() => onSelect(view)}
    >
      <span className="nav-indicator">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

export default function BottomNav({
  view,
  onSelect,
  onNew,
  selectMode,
  allSelected,
  onToggleSelectAll,
  onCancelSelect,
  onTrashSelected,
}: Props) {
  if (selectMode) {
    return (
      <nav className="bottom-nav select-nav" aria-label="Menu chọn nhiều">
        <button type="button" className="select-action" onClick={onToggleSelectAll}>
          {allSelected ? "Bỏ chọn hết" : "Chọn tất cả"}
        </button>
        <button
          type="button"
          className="nav-cancel"
          onClick={onCancelSelect}
          aria-label="Hủy chọn"
        >
          ✕
        </button>
        <button type="button" className="select-action" onClick={onTrashSelected}>
          {trashIconSmall}
          Thùng rác
        </button>
      </nav>
    );
  }
  return (
    <nav className="bottom-nav" aria-label="Menu chính">
      <Tab view="list" label="Ghi chú" icon={homeIcon} current={view} onSelect={onSelect} />
      <button type="button" className="nav-fab" onClick={onNew} aria-label="Thêm ghi chú">
        +
      </button>
      <Tab
        view="backup"
        label="Sao lưu"
        icon={backupIcon}
        current={view}
        onSelect={onSelect}
      />
    </nav>
  );
}
