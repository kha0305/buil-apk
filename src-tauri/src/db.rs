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
        .query_row(
            &format!("SELECT {COLS} FROM notes WHERE id = ?1 AND deleted_at IS NULL"),
            params![id],
            row_to_note,
        )
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

/// Dòng tag cha phải tồn tại trước khi ghi note_order.
/// Nhóm 0 là dòng sentinel, tạo lại nếu bản sao lưu đã xóa nó
/// (import xóa hết bảng tags nhưng chỉ mở lại DB mới chạy migrate).
pub fn ensure_order_parent(conn: &Connection, tag_id: i64) -> Result<(), String> {
    if tag_id == 0 {
        ensure_untagged_tag(conn).map_err(db_err)?;
    }
    Ok(())
}

/// Thêm dòng thứ tự cho note vào nhóm nếu chưa có (giữ vị trí cũ nếu đã có).
/// Vị trí mới = cuối nhóm (nhóm trống thì 0).
pub fn ensure_order_row(conn: &Connection, tag_id: i64, note_id: i64) -> Result<(), String> {
    ensure_order_parent(conn, tag_id)?;
    conn.execute(
        "INSERT OR IGNORE INTO note_order (tag_id, note_id, position)
         SELECT ?1, ?2, COALESCE(MAX(position), -1) + 1 FROM note_order WHERE tag_id = ?1",
        params![tag_id, note_id],
    )
    .map_err(db_err)?;
    Ok(())
}

/// Dòng tag id 0 cho nhóm "Chưa gắn tag": khóa ngoại của note_order (tag_id 0)
/// bắt buộc phải có dòng cha trong bảng tags, nên nhóm này là một dòng thật.
fn ensure_untagged_tag(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO tags (id, name, icon, colour)
         VALUES (0, 'Chưa gắn tag', 'none', 'cream')",
        [],
    )?;
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
    // Migration v4: thùng rác — thêm cột deleted_at (null = note còn dùng).
    if conn.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))? < 4 {
        conn.execute_batch(
            "ALTER TABLE notes ADD COLUMN deleted_at INTEGER;
             PRAGMA user_version = 4;",
        )?;
    }
    // Migration v5: nhắc hẹn — thêm cột remind_at (millis, null = không hẹn).
    if conn.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))? < 5 {
        conn.execute_batch(
            "ALTER TABLE notes ADD COLUMN remind_at INTEGER;
             PRAGMA user_version = 5;",
        )?;
    }
    // Migration v6: icon + màu cho tag; thứ tự note trong từng nhóm (bảng note_order).
    // tag_id 0 = nhóm "Chưa gắn tag". Backfill xếp theo updated_at tăng dần (cũ trước).
    if conn.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))? < 6 {
        conn.execute_batch(
            "ALTER TABLE tags ADD COLUMN icon TEXT NOT NULL DEFAULT 'tag';
             ALTER TABLE tags ADD COLUMN colour TEXT NOT NULL DEFAULT 'cream';
             CREATE TABLE IF NOT EXISTS note_order (
                tag_id   INTEGER NOT NULL DEFAULT 0,
                note_id  INTEGER NOT NULL,
                position INTEGER NOT NULL,
                UNIQUE (tag_id, note_id),
                FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE,
                FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE
             );
             CREATE INDEX IF NOT EXISTS idx_note_order_group ON note_order (tag_id, position);",
        )?;
        // Tag người dùng lỡ đặt tên "Chưa gắn tag" thì đổi tên, để dòng sentinel
        // id 0 chèn được (không thì backfill nhóm 0 lỗi khóa ngoại, app không mở được).
        conn.execute(
            "UPDATE tags SET name = 'Chưa gắn tag #' || id
             WHERE id != 0 AND name = 'Chưa gắn tag' COLLATE NOCASE",
            [],
        )?;
        ensure_untagged_tag(conn)?;
        conn.execute_batch(
            "INSERT OR IGNORE INTO note_order (tag_id, note_id, position)
             SELECT COALESCE(nt.tag_id, 0), n.id,
                    ROW_NUMBER() OVER (
                        PARTITION BY COALESCE(nt.tag_id, 0)
                        ORDER BY n.updated_at ASC, n.id ASC
                    ) - 1
             FROM notes n LEFT JOIN note_tags nt ON nt.note_id = n.id;
             PRAGMA user_version = 6;",
        )?;
    }
    // Tạo lại dòng sentinel id 0 nếu bản sao lưu đã xóa nó (import xóa hết bảng tags).
    ensure_untagged_tag(conn)?;
    Ok(())
}

pub const COLS: &str = "id, title, content, colour, pinned, updated_at, deleted_at, remind_at";

pub fn row_to_note(row: &Row) -> rusqlite::Result<Note> {
    Ok(Note {
        id: row.get(0)?,
        title: row.get(1)?,
        content: row.get(2)?,
        colour: row.get(3)?,
        pinned: row.get(4)?,
        updated_at: row.get(5)?,
        deleted_at: row.get(6)?,
        remind_at: row.get(7)?,
        tags: vec![],
    })
}
