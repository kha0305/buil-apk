import { invoke } from "@tauri-apps/api/core";
import type { NewNote, Note, Tag } from "../lib/types";

export const isTauri = () => "__TAURI_INTERNALS__" in window;

export const listNotes = () => invoke<Note[]>("list_notes");
export const searchNotes = (query: string) => invoke<Note[]>("search_notes", { query });
export const createNote = (input: NewNote) => invoke<Note>("create_note", { input });
export const updateNote = (id: number, input: NewNote) =>
  invoke<Note>("update_note", { id, input });
export const deleteNote = (id: number) => invoke<void>("delete_note", { id });
export const togglePin = (id: number) => invoke<Note>("toggle_pin", { id });
export const listTags = () => invoke<Tag[]>("list_tags");
export const setNoteTags = (id: number, tags: string[]) =>
  invoke<Note>("set_note_tags", { id, tags });
