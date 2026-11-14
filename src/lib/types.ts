export type Note = {
  id: number;
  title: string;
  content: string;
  colour: string;
  pinned: boolean;
  updatedAt: number;
};

export type NewNote = {
  title: string;
  content: string;
  colour: string;
  pinned: boolean;
};

export const COLOURS = ["yellow", "green", "blue", "pink", "purple"] as const;
