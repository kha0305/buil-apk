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
  count: number;
};

export type NewNote = {
  title: string;
  content: string;
  colour: string;
  pinned: boolean;
};

export const COLOURS = [
  "yellow",
  "green",
  "blue",
  "pink",
  "purple",
  "orange",
  "red",
  "mint",
  "brown",
  "grey",
] as const;
