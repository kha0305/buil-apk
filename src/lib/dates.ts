// Đổi millis sang chuỗi "YYYY-MM-DDTHH:mm" theo giờ địa phương (cho input
// datetime-local) và ngược lại. Không dùng toISOString vì nó ra giờ UTC.
const pad = (n: number) => String(n).padStart(2, "0");

export const toLocalInput = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const fromLocalInput = (value: string): number | null => {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
};
