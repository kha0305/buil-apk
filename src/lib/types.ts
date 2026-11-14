export type Note = {
  id: number;
  title: string;
  content: string;
  colour: string;
  pinned: boolean;
  updatedAt: number;
  deletedAt: number | null;
  remindAt: number | null;
  tags: string[];
};

export type Tag = {
  id: number;
  name: string;
  icon: string;
  colour: string;
  count: number;
  noteIds: number[];
};

export type NewNote = {
  title: string;
  content: string;
  colour: string;
  pinned: boolean;
};

/** Bảng màu note: 15 màu pastel nhạt, xếp theo thứ tự cầu vồng. */
export const COLOURS = [
  "red",
  "orange",
  "peach",
  "yellow",
  "green",
  "sage",
  "mint",
  "sky",
  "blue",
  "purple",
  "lavender",
  "pink",
  "brown",
  "grey",
  "white",
] as const;

export type ColourId = (typeof COLOURS)[number];

export const COLOUR_HEX: Record<ColourId, string> = {
  red: "#f9c8c8",
  orange: "#fbdcb8",
  peach: "#fbd3ae",
  yellow: "#fdf0b8",
  green: "#cbf0c8",
  sage: "#dce6c8",
  mint: "#cbf0e6",
  sky: "#bfe0f2",
  blue: "#c9dcf8",
  purple: "#e0cdf8",
  lavender: "#e6dcf7",
  pink: "#fbdfea",
  brown: "#e8dac8",
  grey: "#e6e6e6",
  white: "#fffdf7",
};

/** Màu tag: kem mặc định đứng đầu, sau đó là 15 màu cầu vồng. */
export const TAG_COLOURS = ["cream", ...COLOURS] as const;

export type TagColourId = (typeof TAG_COLOURS)[number];

export const TAG_COLOUR_HEX: Record<TagColourId, string> = {
  cream: "#e8d3ae",
  ...COLOUR_HEX,
};

/** Trộn một màu hex về phía màu đích theo tỉ lệ ratio
 * (0 = giữ nguyên màu gốc, 1 = thành màu đích). */
export function blendHex(hex: string, targetHex: string, ratio: number): string {
  const parse = (h: string): [number, number, number] => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const a = parse(hex);
  const b = parse(targetHex);
  if (a.some(Number.isNaN) || b.some(Number.isNaN)) return hex;
  const mixed = a.map((v, i) => Math.round(v + (b[i] - v) * ratio));
  return `#${mixed.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
