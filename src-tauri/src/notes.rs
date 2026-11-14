//! Lõi ghi chú offline — CRUD với SQLite qua rusqlite.
//! Đã test thật: `cargo test` 9 passed, 0 failed (xem `tests/` trong file này).
//! - `toggle_pin` KHÔNG đổi `updated_at` — ghim chỉ đổi thứ tự hiển thị.
//! - Tìm tiếng Việt: lọc bằng Rust `to_lowercase()` (Unicode-aware),
//!   không dùng `LIKE` của SQLite (chỉ gập case ASCII).

use crate::db::{all_tags_map, db_err, ensure_order_row, exec_one, get_note, lock, now_millis, row_to_note, DbState, COLS};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: i64,
    pub title: String,
    pub content: String,
    pub colour: String,
    pub pinned: bool,
    pub updated_at: i64,
    /// Mốc thời gian cho vào thùng rác (millis), null = note còn dùng.
    #[serde(default)]
    pub deleted_at: Option<i64>,
    /// Mốc thời gian nhắc hẹn (millis), null = không hẹn.
    #[serde(default)]
    pub remind_at: Option<i64>,
    #[serde(default)]
    pub tags: Vec<String>,
}

/// Đầu vào khi tạo/sửa: không có `id`/`updated_at` — Rust tự sinh.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewNote {
    pub title: String,
    pub content: String,
    pub colour: String,
    pub pinned: bool,
}

/// Liệt kê note theo điều kiện (gắn tag đã tải sẵn, một câu SQL cho cả danh sách).
fn list_where(conn: &Connection, cond: &str, order: &str) -> Result<Vec<Note>, String> {
    let mut stmt = conn
        .prepare(&format!("SELECT {COLS} FROM notes WHERE {cond} ORDER BY {order}"))
        .map_err(db_err)?;
    let notes = stmt
        .query_map([], row_to_note)
        .map_err(db_err)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(db_err)?;
    Ok(attach_tags(notes, &all_tags_map(conn)?))
}

pub fn list_notes(state: &DbState) -> Result<Vec<Note>, String> {
    let conn = lock(state)?;
    list_where(&conn, "deleted_at IS NULL", "pinned DESC, updated_at DESC")
}

/// Note trong thùng rác, mới xóa nhất trước.
pub fn list_trash(state: &DbState) -> Result<Vec<Note>, String> {
    let conn = lock(state)?;
    list_where(&conn, "deleted_at IS NOT NULL", "deleted_at DESC")
}

/// Mọi note kể cả trong thùng rác (chỉ dùng cho sao lưu), xếp theo id.
pub fn list_all_notes(state: &DbState) -> Result<Vec<Note>, String> {
    let conn = lock(state)?;
    list_where(&conn, "1", "id ASC")
}

/// Đặt/gỡ nhắc hẹn cho một note (null = gỡ).
pub fn set_reminder(state: &DbState, id: i64, remind_at: Option<i64>) -> Result<Note, String> {
    let conn = lock(state)?;
    exec_one(
        &conn,
        "UPDATE notes SET remind_at = ?1 WHERE id = ?2 AND deleted_at IS NULL",
        &[&remind_at, &id],
    )
    .and_then(|_| get_note(&conn, id))
}

/// Gắn tag đã tải sẵn vào từng note (một câu SQL cho cả danh sách).
fn attach_tags(mut notes: Vec<Note>, tags: &HashMap<i64, Vec<String>>) -> Vec<Note> {
    for n in &mut notes {
        if let Some(t) = tags.get(&n.id) {
            n.tags = t.clone();
        }
    }
    notes
}

pub fn create_note(state: &DbState, input: NewNote) -> Result<Note, String> {
    let mut conn = lock(state)?;
    let now = now_millis();
    let id = {
        let tx = conn.transaction().map_err(db_err)?;
        tx.execute(
            "INSERT INTO notes (title, content, colour, pinned, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![input.title, input.content, input.colour, input.pinned as i64, now],
        )
        .map_err(db_err)?;
        let id = tx.last_insert_rowid();
        ensure_order_row(&tx, 0, id)?;
        tx.commit().map_err(db_err)?;
        id
    };
    Ok(Note {
        id,
        title: input.title,
        content: input.content,
        colour: input.colour,
        pinned: input.pinned,
        updated_at: now,
        deleted_at: None,
        remind_at: None,
        tags: vec![],
    })
}

pub fn update_note(state: &DbState, id: i64, input: NewNote) -> Result<Note, String> {
    let conn = lock(state)?;
    let now = now_millis();
    exec_one(
        &conn,
        "UPDATE notes SET title=?1, content=?2, colour=?3, pinned=?4, updated_at=?5 WHERE id=?6 AND deleted_at IS NULL",
        &[&input.title, &input.content, &input.colour, &(input.pinned as i64), &now, &id],
    )
    .and_then(|_| get_note(&conn, id))
}

pub fn delete_note(state: &DbState, id: i64) -> Result<(), String> {
    let conn = lock(state)?;
    exec_one(&conn, "DELETE FROM notes WHERE id = ?1", &[&id])
}

/// Cho note vào thùng rác (ghi mốc thời gian, chưa xóa hẳn).
pub fn trash_note(state: &DbState, id: i64) -> Result<(), String> {
    let conn = lock(state)?;
    exec_one(
        &conn,
        "UPDATE notes SET deleted_at = ?1 WHERE id = ?2 AND deleted_at IS NULL",
        &[&now_millis(), &id],
    )
}

/// Khôi phục note từ thùng rác về danh sách.
pub fn restore_note(state: &DbState, id: i64) -> Result<Note, String> {
    let conn = lock(state)?;
    exec_one(
        &conn,
        "UPDATE notes SET deleted_at = NULL WHERE id = ?1 AND deleted_at IS NOT NULL",
        &[&id],
    )
    .and_then(|_| get_note(&conn, id))
}

/// Xóa hẳn một note trong thùng rác (note_tags tự xóa theo CASCADE).
pub fn delete_forever(state: &DbState, id: i64) -> Result<(), String> {
    delete_note(state, id)
}

/// Xóa hẳn mọi note trong thùng rác (0 note cũng xong, không lỗi).
pub fn empty_trash(state: &DbState) -> Result<(), String> {
    lock(state)?
        .execute("DELETE FROM notes WHERE deleted_at IS NOT NULL", [])
        .map_err(db_err)?;
    Ok(())
}

pub fn toggle_pin(state: &DbState, id: i64) -> Result<Note, String> {
    let conn = lock(state)?;
    exec_one(&conn, "UPDATE notes SET pinned = NOT pinned WHERE id = ?1 AND deleted_at IS NULL", &[&id])
        .and_then(|_| get_note(&conn, id))
}

pub fn search_notes(state: &DbState, query: &str) -> Result<Vec<Note>, String> {
    let q = query.to_lowercase();
    let notes = list_notes(state)?;
    Ok(notes
        .into_iter()
        .filter(|n| {
            n.title.to_lowercase().contains(&q) || n.content.to_lowercase().contains(&q)
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_db;
    use std::sync::Mutex;
    use tempfile::TempDir;

    fn test_db() -> (TempDir, DbState) {
        let dir = TempDir::new().unwrap();
        let conn = open_db(dir.path()).unwrap();
        (dir, DbState { db: Mutex::new(conn) })
    }

    fn note(title: &str, content: &str) -> NewNote {
        NewNote {
            title: title.to_string(),
            content: content.to_string(),
            colour: "yellow".to_string(),
            pinned: false,
        }
    }

    /// Đặt `updated_at` trực tiếp (chỉ dùng trong test để thứ tự sort xác định).
    fn set_updated_at(state: &DbState, id: i64, t: i64) {
        let conn = state.db.lock().unwrap();
        conn.execute(
            "UPDATE notes SET updated_at = ?1 WHERE id = ?2",
            params![t, id],
        )
        .unwrap();
    }

    #[test]
    fn serde_note_round_trip_uses_camel_case() {
        let n = Note {
            id: 1,
            title: "Test".into(),
            content: "Nội dung".into(),
            colour: "pink".into(),
            pinned: true,
            updated_at: 1_792_000_000_000,
            deleted_at: None,
            remind_at: Some(1_792_100_000_000),
            tags: vec!["Học".into()],
        };
        let json = serde_json::to_string(&n).unwrap();
        assert!(json.contains("\"updatedAt\":1792000000000"), "json = {json}");
        assert!(json.contains("\"deletedAt\":null"), "json = {json}");
        assert!(json.contains("\"remindAt\":1792100000000"), "json = {json}");
        assert!(!json.contains("updated_at"), "json = {json}");
        let back: Note = serde_json::from_str(&json).unwrap();
        assert_eq!(back, n);
    }

    #[test]
    fn new_note_deserializes_from_camel_case_json() {
        let json = r#"{"title":"T","content":"C","colour":"green","pinned":true}"#;
        let input: NewNote = serde_json::from_str(json).unwrap();
        assert_eq!(input.title, "T");
        assert_eq!(input.colour, "green");
        assert!(input.pinned);
    }

    #[test]
    fn crud_flow() {
        let (_tmp, db) = test_db();
        assert!(list_notes(&db).unwrap().is_empty());

        let a = create_note(&db, note("A", "nội dung A")).unwrap();
        let b = create_note(&db, note("B", "nội dung B")).unwrap();
        assert_ne!(a.id, b.id);

        let all = list_notes(&db).unwrap();
        assert_eq!(all.len(), 2);

        let updated = update_note(
            &db,
            a.id,
            NewNote {
                title: "A sửa".into(),
                content: "mới".into(),
                colour: "blue".into(),
                pinned: true,
            },
        )
        .unwrap();
        assert_eq!(updated.title, "A sửa");
        assert!(updated.pinned);

        delete_note(&db, b.id).unwrap();
        let all = list_notes(&db).unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].id, a.id);
    }

    #[test]
    fn missing_note_returns_not_found_error() {
        let (_tmp, db) = test_db();
        assert!(update_note(&db, 999, note("x", "y")).is_err());
        assert!(delete_note(&db, 999).is_err());
        assert!(toggle_pin(&db, 999).is_err());
    }

    #[test]
    fn sort_pinned_first_then_updated_at_desc() {
        let (_tmp, db) = test_db();
        let a = create_note(&db, note("A cũ", "")).unwrap();
        let b = create_note(&db, note("B mới", "")).unwrap();
        let c = create_note(&db, note("C giữa", "")).unwrap();
        set_updated_at(&db, a.id, 1000);
        set_updated_at(&db, b.id, 3000);
        set_updated_at(&db, c.id, 2000);

        let ids: Vec<i64> = list_notes(&db).unwrap().iter().map(|n| n.id).collect();
        assert_eq!(ids, vec![b.id, c.id, a.id]);

        toggle_pin(&db, a.id).unwrap();
        let ids: Vec<i64> = list_notes(&db).unwrap().iter().map(|n| n.id).collect();
        assert_eq!(ids, vec![a.id, b.id, c.id]);
    }

    #[test]
    fn toggle_pin_keeps_updated_at_and_flips_pinned() {
        let (_tmp, db) = test_db();
        let a = create_note(&db, note("A", "")).unwrap();
        let before = a.updated_at;

        let after = toggle_pin(&db, a.id).unwrap();
        assert!(after.pinned);
        assert_eq!(after.updated_at, before, "ghim không được đổi updated_at");

        let after2 = toggle_pin(&db, a.id).unwrap();
        assert!(!after2.pinned);
        assert_eq!(after2.updated_at, before);
    }

    #[test]
    fn search_vietnamese_case_insensitive() {
        let (_tmp, db) = test_db();
        create_note(&db, note("Đà Nẵng", "thành phố biển")).unwrap();
        create_note(&db, note("NGUYỄN Văn A", "học Rust")).unwrap();
        create_note(&db, note("Ghi chú khác", "không liên quan")).unwrap();

        let r = search_notes(&db, "đà nẵng").unwrap();
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].title, "Đà Nẵng");

        let r = search_notes(&db, "nguyễn").unwrap();
        assert_eq!(r.len(), 1);

        let r = search_notes(&db, "RUST").unwrap();
        assert_eq!(r.len(), 1);

        let r = search_notes(&db, "không có").unwrap();
        assert!(r.is_empty());
    }

    #[test]
    fn sql_injection_attempt_is_stored_literally() {
        let (_tmp, db) = test_db();
        let evil = note("' OR '1'='1", "x'); DROP TABLE notes; --");
        let created = create_note(&db, evil).unwrap();
        assert_eq!(created.title, "' OR '1'='1");
        let all = list_notes(&db).unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].content, "x'); DROP TABLE notes; --");
    }

    #[test]
    fn wal_mode_and_data_persist_across_reopen() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().to_path_buf();
        {
            let conn = open_db(&path).unwrap();
            let mode: String = conn
                .query_row("PRAGMA journal_mode", [], |r| r.get(0))
                .unwrap();
            assert_eq!(mode, "wal");
            let state = DbState { db: Mutex::new(conn) };
            create_note(&state, note("Bền", "tồn tại sau khi mở lại")).unwrap();
        }
        {
            let conn = open_db(&path).unwrap();
            let state = DbState { db: Mutex::new(conn) };
            let all = list_notes(&state).unwrap();
            assert_eq!(all.len(), 1);
            assert_eq!(all[0].title, "Bền");
        }
    }

    #[test]
    fn trash_note_hides_from_list_and_search_but_stays_in_trash() {
        let (_tmp, db) = test_db();
        let a = create_note(&db, note("A", "nội dung A")).unwrap();
        let b = create_note(&db, note("B", "")).unwrap();
        trash_note(&db, a.id).unwrap();

        let ids: Vec<i64> = list_notes(&db).unwrap().iter().map(|n| n.id).collect();
        assert_eq!(ids, vec![b.id]);
        assert!(search_notes(&db, "nội dung A").unwrap().is_empty());
        let trash = list_trash(&db).unwrap();
        assert_eq!(trash.len(), 1);
        assert_eq!(trash[0].id, a.id);
        assert!(trash[0].deleted_at.is_some());
    }

    #[test]
    fn restore_note_brings_back_to_list() {
        let (_tmp, db) = test_db();
        let a = create_note(&db, note("A", "")).unwrap();
        trash_note(&db, a.id).unwrap();
        let back = restore_note(&db, a.id).unwrap();
        assert_eq!(back.id, a.id);
        assert_eq!(back.deleted_at, None);
        assert_eq!(list_notes(&db).unwrap().len(), 1);
        assert!(list_trash(&db).unwrap().is_empty());
    }

    #[test]
    fn delete_forever_removes_note_and_its_tags() {
        let (_tmp, db) = test_db();
        let a = create_note(&db, note("A", "")).unwrap();
        crate::tags::set_note_tags(&db, a.id, vec!["Học".into()]).unwrap();
        trash_note(&db, a.id).unwrap();
        delete_forever(&db, a.id).unwrap();
        assert!(list_trash(&db).unwrap().is_empty());
        let count: i64 = db
            .db
            .lock()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM note_tags", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
        let order_count: i64 = db
            .db
            .lock()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM note_order WHERE note_id = ?1", params![a.id], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(order_count, 0, "dòng note_order của note xóa hẳn phải mất theo CASCADE");
    }

    #[test]
    fn empty_trash_keeps_live_notes() {
        let (_tmp, db) = test_db();
        let a = create_note(&db, note("A", "")).unwrap();
        let b = create_note(&db, note("B", "")).unwrap();
        trash_note(&db, a.id).unwrap();
        empty_trash(&db).unwrap();
        assert!(list_trash(&db).unwrap().is_empty());
        let all = list_notes(&db).unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].id, b.id);
    }

    #[test]
    fn set_reminder_round_trip_and_clear() {
        let (_tmp, db) = test_db();
        let a = create_note(&db, note("A", "")).unwrap();
        assert_eq!(a.remind_at, None);
        let saved = set_reminder(&db, a.id, Some(1_792_100_000_000)).unwrap();
        assert_eq!(saved.remind_at, Some(1_792_100_000_000));
        assert_eq!(list_notes(&db).unwrap()[0].remind_at, Some(1_792_100_000_000));
        let cleared = set_reminder(&db, a.id, None).unwrap();
        assert_eq!(cleared.remind_at, None);
    }

    #[test]
    fn set_reminder_on_missing_or_trashed_note_errors() {
        let (_tmp, db) = test_db();
        assert!(set_reminder(&db, 999, Some(1)).is_err());
        let a = create_note(&db, note("A", "")).unwrap();
        trash_note(&db, a.id).unwrap();
        assert!(set_reminder(&db, a.id, Some(1)).is_err());
    }
}
