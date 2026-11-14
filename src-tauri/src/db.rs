//! Mở database và helper dùng chung cho mọi lệnh ghi chú.
//! Không hard-code đường dẫn: app thật lấy qua `app_data_dir()`.

use crate::notes::Note;
use rusqlite::{params, Connection, Row};
use std::collections::HashMap;
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
    let mut note = conn
        .query_row(&format!("SELECT {COLS} FROM notes WHERE id = ?1"), params![id], row_to_note)
        .map_err(|_| "Note not found".to_string())?;
    note.tags = tags_of(conn, id)?;
    Ok(note)
}

/// Tên tag của một note, xếp theo tên.
pub fn tags_of(conn: &Connection, note_id: i64) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT t.name FROM tags t
             JOIN note_tags nt ON nt.tag_id = t.id
             WHERE nt.note_id = ?1 ORDER BY t.name",
        )
        .map_err(db_err)?;
    stmt.query_map(params![note_id], |r| r.get(0))
        .map_err(db_err)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(db_err)
}

/// Tag của mọi note trong một câu SQL: id note -> tên tag (để tránh N+1 khi liệt kê).
pub fn all_tags_map(conn: &Connection) -> Result<HashMap<i64, Vec<String>>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT nt.note_id, t.name FROM note_tags nt
             JOIN tags t ON t.id = nt.tag_id ORDER BY t.name",
        )
        .map_err(db_err)?;
    let mut map: HashMap<i64, Vec<String>> = HashMap::new();
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
        .map_err(db_err)?;
    for row in rows {
        let (id, name) = row.map_err(db_err)?;
        map.entry(id).or_default().push(name);
    }
    Ok(map)
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
    // Migration v2: tag do người dùng tự tạo, một note gắn được nhiều tag.
    // Chỉ thêm bảng mới, không sửa bảng notes cũ nên dữ liệu cũ còn nguyên.
    if conn.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))? < 2 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS tags (
                id   INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE COLLATE NOCASE
            );
            CREATE TABLE IF NOT EXISTS note_tags (
                note_id INTEGER NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
                tag_id  INTEGER NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
                PRIMARY KEY (note_id, tag_id)
            );
            CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags (tag_id);
            PRAGMA user_version = 2;",
        )?;
    }
    // Migration v3: cài đặt nhỏ dạng key/value (vd nhóm tag đang thu gọn).
    if conn.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))? < 3 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL DEFAULT ''
            );
            PRAGMA user_version = 3;",
        )?;
    }
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
        tags: vec![],
    })
}
