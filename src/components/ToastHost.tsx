// Host toast: pill tối nổi ở đầu trang, tự ẩn sau 3 giây. Gắn 1 lần ở App.tsx.
// Toast mới tới thì thay toast cũ ngay (không để hẹn giờ cũ xóa toast mới).
import { useEffect, useRef, useState } from "react";
import type { ToastKind } from "../lib/toast";

interface ToastMsg {
  message: string;
  kind: ToastKind;
}

export default function ToastHost() {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onToast = (e: Event) => {
      const d = (e as CustomEvent).detail as ToastMsg;
      if (timerRef.current) clearTimeout(timerRef.current);
      setMsg({ message: d.message, kind: d.kind ?? "info" });
      timerRef.current = setTimeout(() => setMsg(null), 3000);
    };
    window.addEventListener("app-toast", onToast);
    return () => {
      window.removeEventListener("app-toast", onToast);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!msg) return null;
  return (
    <div className={`toast${msg.kind === "error" ? " toast-error" : ""}`} role="status">
      {msg.message}
    </div>
  );
}
