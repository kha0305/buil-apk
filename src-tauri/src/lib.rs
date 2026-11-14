//! App ghi chú offline — Tauri 2.12 + React + SQLite (rusqlite).
//! Rust chỉ làm CRUD, giao diện làm bằng React trong WebView.

mod backup;
mod db;
mod notes;
mod notify;
mod settings;
mod tags;

use db::{open_db, DbState};
use notes::{NewNote, Note};
use notify::{
    cancel_reminder_notification, schedule_reminder_notification, snooze_reminder_notification,
    take_pending_open_note,
};
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

#[tauri::command]
fn rename_tag(state: State<DbState>, id: i64, name: String, icon: String, colour: String) -> Result<tags::Tag, String> {
    tags::rename_tag(&state, id, &name, &icon, &colour)
}

#[tauri::command]
fn reorder_notes(state: State<DbState>, tag_id: i64, ordered_ids: Vec<i64>) -> Result<(), String> {
    tags::reorder_notes(&state, tag_id, ordered_ids)
}

#[tauri::command]
fn get_setting(state: State<DbState>, key: String) -> Result<Option<String>, String> {
    settings::get_setting(&state, &key)
}

#[tauri::command]
fn set_setting(state: State<DbState>, key: String, value: String) -> Result<(), String> {
    settings::set_setting(&state, &key, &value)
}

#[tauri::command]
fn trash_note(state: State<DbState>, id: i64) -> Result<(), String> {
    notes::trash_note(&state, id)
}

#[tauri::command]
fn restore_note(state: State<DbState>, id: i64) -> Result<Note, String> {
    notes::restore_note(&state, id)
}

#[tauri::command]
fn delete_forever(state: State<DbState>, id: i64) -> Result<(), String> {
    notes::delete_forever(&state, id)
}

#[tauri::command]
fn list_trash(state: State<DbState>) -> Result<Vec<Note>, String> {
    notes::list_trash(&state)
}

#[tauri::command]
fn empty_trash(state: State<DbState>) -> Result<(), String> {
    notes::empty_trash(&state)
}

#[tauri::command]
fn set_reminder(state: State<DbState>, id: i64, remind_at: Option<i64>) -> Result<Note, String> {
    notes::set_reminder(&state, id, remind_at)
}

#[tauri::command]
fn export_backup(state: State<DbState>) -> Result<String, String> {
    backup::export_backup(&state)
}

#[tauri::command]
fn import_backup(state: State<DbState>, json: String) -> Result<usize, String> {
    backup::import_backup(&state, &json)
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
            set_note_tags,
            rename_tag,
            reorder_notes,
            get_setting,
            set_setting,
            trash_note,
            restore_note,
            delete_forever,
            list_trash,
            empty_trash,
            set_reminder,
            schedule_reminder_notification,
            cancel_reminder_notification,
            snooze_reminder_notification,
            take_pending_open_note,
            export_backup,
            import_backup
        ])
        .run(tauri::generate_context!());
    if let Err(e) = r {
        eprintln!("Lỗi chạy app ghi chú: {e}");
        std::process::exit(1);
    }
}
