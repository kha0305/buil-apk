export type Note = {
  id: number;
  title: string;
  content: string;
  colour: string;
  pinned: boolean;
  updatedAt: number;
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

export const COLOURS = ["yellow", "green", "blue", "pink", "purple"] as const;
