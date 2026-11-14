//! Mở database và helper dùng chung cho mọi lệnh ghi chú.
//! Không hard-code đường dẫn: app thật lấy qua `app_data_dir()`.

use crate::notes::Note;
use rusqlite::{params, Connection, Row};
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Một connection SQLite duy nhất, bọc trong `std::sync::Mutex`.
/// (App Tauri thật: đăng ký bằng `.manage()` — Tauri tự bọc thêm `Arc`, đừng tự thêm `Arc`.)
pub struct DbState {
    pub db: Mutex<Connection>,
}

pub fn db_err(e: rusqlite::Error) -> String {
    e.to_string()
}

pub fn lock(state: &DbState) -> Result<std::sync::MutexGuard<'_, Connection>, String> {
    state.db.lock().map_err(|e| e.to_string())
}

pub fn get_note(conn: &Connection, id: i64) -> Result<Note, String> {
    conn.query_row(
        &format!("SELECT {COLS} FROM notes WHERE id = ?1"),
        params![id],
        row_to_note,
    )
    .map_err(|_| "Note not found".to_string())
}

pub fn exec_one(conn: &Connection, sql: &str, p: &[&dyn rusqlite::types::ToSql]) -> Result<(), String> {
    if conn.execute(sql, p).map_err(db_err)? == 0 {
        return Err("Note not found".into());
    }
    Ok(())
}

pub fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Mở (hoặc tạo) `notes.db` trong thư mục cho trước, bật WAL + busy_timeout, chạy migration.
pub fn open_db(dir: &Path) -> Result<Connection, rusqlite::Error> {
    std::fs::create_dir_all(dir).map_err(|_| rusqlite::Error::InvalidPath(dir.into()))?;
    let db_path = dir.join("notes.db");
    let conn = Connection::open(&db_path)?;
    conn.busy_timeout(Duration::from_millis(5000))?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA foreign_keys = ON;",
    )?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS notes (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT NOT NULL DEFAULT '',
            content     TEXT NOT NULL DEFAULT '',
            colour      TEXT NOT NULL DEFAULT 'yellow',
            pinned      INTEGER NOT NULL DEFAULT 0,
            updated_at  INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_notes_sort
            ON notes (pinned DESC, updated_at DESC);",
    )?;
    Ok(())
}

pub const COLS: &str = "id, title, content, colour, pinned, updated_at";

pub fn row_to_note(row: &Row) -> rusqlite::Result<Note> {
    Ok(Note {
        id: row.get(0)?,
        title: row.get(1)?,
        content: row.get(2)?,
        colour: row.get(3)?,
        pinned: row.get(4)?,
        updated_at: row.get(5)?,
    })
}
