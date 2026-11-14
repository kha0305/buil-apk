import { invoke } from "@tauri-apps/api/core";
import type { NewNote, Note, Tag } from "../lib/types";

export const isTauri = () => "__TAURI_INTERNALS__" in window;

export const listNotes = () => invoke<Note[]>("list_notes");
export const searchNotes = (query: string) => invoke<Note[]>("search_notes", { query });
export const createNote = (input: NewNote) => invoke<Note>("create_note", { input });
export const updateNote = (id: number, input: NewNote) =>
  invoke<Note>("update_note", { id, input });
export const togglePin = (id: number) => invoke<Note>("toggle_pin", { id });
export const trashNote = (id: number) => invoke<void>("trash_note", { id });
export const restoreNote = (id: number) => invoke<Note>("restore_note", { id });
export const deleteNoteForever = (id: number) => invoke<void>("delete_forever", { id });
export const listTrash = () => invoke<Note[]>("list_trash");
export const emptyTrash = () => invoke<void>("empty_trash");
export const setReminder = (id: number, remindAt: number | null) =>
  invoke<Note>("set_reminder", { id, remindAt });
export const exportBackup = () => invoke<string>("export_backup");
export const importBackup = (json: string) => invoke<number>("import_backup", { json });
export const listTags = () => invoke<Tag[]>("list_tags");
export const setNoteTags = (id: number, tags: string[]) =>
  invoke<Note>("set_note_tags", { id, tags });
export const renameTag = (id: number, name: string) =>
  invoke<Tag>("rename_tag", { id, name });
export const deleteTag = (id: number) => invoke<void>("delete_tag", { id });
export const getSetting = (key: string) => invoke<string | null>("get_setting", { key });
export const setSetting = (key: string, value: string) =>
  invoke<void>("set_setting", { key, value });
