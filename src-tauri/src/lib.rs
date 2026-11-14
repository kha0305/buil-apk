//! App ghi chú offline — Tauri 2.12 + React + SQLite (rusqlite).
//! Rust chỉ làm CRUD, giao diện làm bằng React trong WebView.

mod db;
mod notes;
mod tags;

use db::{open_db, DbState};
use notes::{NewNote, Note};
use tauri::{Manager, State};

#[tauri::command]
fn list_notes(state: State<DbState>) -> Result<Vec<Note>, String> {
    notes::list_notes(&state)
}

#[tauri::command]
fn create_note(state: State<DbState>, input: NewNote) -> Result<Note, String> {
    notes::create_note(&state, input)
}

#[tauri::command]
fn update_note(state: State<DbState>, id: i64, input: NewNote) -> Result<Note, String> {
    notes::update_note(&state, id, input)
}

#[tauri::command]
fn delete_note(state: State<DbState>, id: i64) -> Result<(), String> {
    notes::delete_note(&state, id)
}

#[tauri::command]
fn toggle_pin(state: State<DbState>, id: i64) -> Result<Note, String> {
    notes::toggle_pin(&state, id)
}

#[tauri::command]
fn search_notes(state: State<DbState>, query: String) -> Result<Vec<Note>, String> {
    notes::search_notes(&state, &query)
}

#[tauri::command]
fn list_tags(state: State<DbState>) -> Result<Vec<tags::Tag>, String> {
    tags::list_tags(&state)
}

#[tauri::command]
fn set_note_tags(state: State<DbState>, id: i64, tags: Vec<String>) -> Result<Note, String> {
    tags::set_note_tags(&state, id, tags)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let r = tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            let conn = open_db(&dir)?;
            app.manage(DbState { db: std::sync::Mutex::new(conn) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_notes,
            create_note,
            update_note,
            delete_note,
            toggle_pin,
            search_notes,
            list_tags,
            set_note_tags
        ])
        .run(tauri::generate_context!());
    if let Err(e) = r {
        eprintln!("Lỗi chạy app ghi chú: {e}");
        std::process::exit(1);
    }
}
