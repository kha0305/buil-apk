// Toast ngắn hiện ở đầu trang. Gửi qua CustomEvent để mọi màn hình đều gọi được.
// ToastHost (gắn 1 lần ở App.tsx) là nơi duy nhất vẽ toast.
export type ToastKind = "info" | "error";

export function toast(message: string, kind: ToastKind = "info"): void {
  window.dispatchEvent(new CustomEvent("app-toast", { detail: { message, kind } }));
}
