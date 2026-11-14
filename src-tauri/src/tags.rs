//! Tag do người dùng tự tạo — một note gắn được nhiều tag, không có tag sẵn.
//! Tên tag không phân biệt hoa thường (UNIQUE COLLATE NOCASE).

use crate::db::{db_err, get_note, lock, DbState};
use crate::notes::Note;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: i64,
    pub name: String,
    pub count: i64,
}

/// Mọi tag cùng số note đang mang tag đó, xếp theo tên.
/// Note trong thùng rác không tính vào số lượng.
pub fn list_tags(state: &DbState) -> Result<Vec<Tag>, String> {
    let conn = lock(state)?;
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.name, COUNT(n.id) FROM tags t
             LEFT JOIN note_tags nt ON nt.tag_id = t.id
             LEFT JOIN notes n ON n.id = nt.note_id AND n.deleted_at IS NULL
             GROUP BY t.id ORDER BY t.name",
        )
        .map_err(db_err)?;
    stmt.query_map([], |r| {
        Ok(Tag {
            id: r.get(0)?,
            name: r.get(1)?,
            count: r.get(2)?,
        })
    })
    .map_err(db_err)?
    .collect::<Result<Vec<_>, _>>()
    .map_err(db_err)
}

/// Một tag kèm số note đang mang nó (note trong thùng rác không tính).
pub fn get_tag(conn: &Connection, id: i64) -> Result<Tag, String> {
    conn.query_row(
        "SELECT t.id, t.name, COUNT(n.id) FROM tags t
         LEFT JOIN note_tags nt ON nt.tag_id = t.id
         LEFT JOIN notes n ON n.id = nt.note_id AND n.deleted_at IS NULL
         WHERE t.id = ?1 GROUP BY t.id",
        params![id],
        |r| {
            Ok(Tag {
                id: r.get(0)?,
                name: r.get(1)?,
                count: r.get(2)?,
            })
        },
    )
    .map_err(|_| "Tag not found".to_string())
}

/// Đổi tên một tag. Tên mới trùng tag khác (không phân biệt hoa thường) thì
/// gộp: chuyển hết note sang tag đó rồi xóa tag cũ, trả về tag bị gộp vào.
pub fn rename_tag(state: &DbState, id: i64, name: &str) -> Result<Tag, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Tên tag không được để trống".into());
    }
    let mut conn = lock(state)?;
    get_tag(&conn, id)?;
    let target = conn
        .query_row(
            "SELECT id FROM tags WHERE name = ?1 COLLATE NOCASE AND id != ?2",
            params![name, id],
            |r| r.get::<_, i64>(0),
        )
        .optional()
        .map_err(db_err)?;
    match target {
        Some(target_id) => merge_tag(&mut conn, id, target_id),
        None => {
            conn.execute("UPDATE tags SET name = ?1 WHERE id = ?2", params![name, id])
                .map_err(db_err)?;
            get_tag(&conn, id)
        }
    }
}

/// Chuyển hết note của tag cũ sang tag đích rồi xóa tag cũ, trong 1 transaction.
fn merge_tag(conn: &mut Connection, old_id: i64, target_id: i64) -> Result<Tag, String> {
    {
        let tx = conn.transaction().map_err(db_err)?;
        tx.execute(
            "INSERT OR IGNORE INTO note_tags (note_id, tag_id)
             SELECT note_id, ?1 FROM note_tags WHERE tag_id = ?2",
            params![target_id, old_id],
        )
        .map_err(db_err)?;
        tx.execute("DELETE FROM tags WHERE id = ?1", params![old_id])
            .map_err(db_err)?;
        tx.commit().map_err(db_err)?;
    }
    get_tag(conn, target_id)
}

/// Xóa một tag: các note vẫn còn, chỉ mất tag đó (note_tags xóa theo CASCADE).
pub fn delete_tag(state: &DbState, id: i64) -> Result<(), String> {
    let conn = lock(state)?;
    get_tag(&conn, id)?;
    conn.execute("DELETE FROM tags WHERE id = ?1", params![id])
        .map_err(db_err)?;
    Ok(())
}

/// Gắn lại toàn bộ tag của một note: tên nào chưa có thì tạo mới,
/// tên trùng (không phân biệt hoa thường, kể cả thừa khoảng trắng) gộp thành một.
pub fn set_note_tags(state: &DbState, note_id: i64, tags: Vec<String>) -> Result<Note, String> {
    let mut conn = lock(state)?;
    get_note(&conn, note_id)?;
    let names = normalize_tags(tags);
    {
        let tx = conn.transaction().map_err(db_err)?;
        tx.execute("DELETE FROM note_tags WHERE note_id = ?1", params![note_id])
            .map_err(db_err)?;
        for name in &names {
            tx.execute("INSERT OR IGNORE INTO tags (name) VALUES (?1)", params![name])
                .map_err(db_err)?;
            tx.execute(
                "INSERT INTO note_tags (note_id, tag_id)
                 SELECT ?1, id FROM tags WHERE name = ?2 COLLATE NOCASE",
                params![note_id, name],
            )
            .map_err(db_err)?;
        }
        tx.commit().map_err(db_err)?;
    }
    get_note(&conn, note_id)
}

/// Cắt khoảng trắng, bỏ tên rỗng, gộp trùng không phân biệt hoa thường,
/// giữ cách viết hoa của lần xuất hiện đầu tiên.
fn normalize_tags(tags: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    tags.into_iter()
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .filter(|t| seen.insert(t.to_lowercase()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_db;
    use crate::notes::{create_note, list_notes, trash_note, NewNote};
    use rusqlite::Connection;
    use std::sync::Mutex;
    use tempfile::TempDir;

    fn test_db() -> (TempDir, DbState) {
        let dir = TempDir::new().unwrap();
        let conn = open_db(dir.path()).unwrap();
        (dir, DbState { db: Mutex::new(conn) })
    }

    fn note(title: &str) -> NewNote {
        NewNote {
            title: title.into(),
            content: String::new(),
            colour: "yellow".into(),
            pinned: false,
        }
    }

    #[test]
    fn set_tags_creates_tags_and_returns_them() {
        let (_tmp, db) = test_db();
        let n = create_note(&db, note("Ôn thi")).unwrap();
        let saved = set_note_tags(&db, n.id, vec!["Học".into(), "Thi".into()]).unwrap();
        assert_eq!(saved.tags, vec!["Học".to_string(), "Thi".to_string()]);
        assert_eq!(list_notes(&db).unwrap()[0].tags, saved.tags);
    }

    #[test]
    fn note_appears_under_two_tags() {
        let (_tmp, db) = test_db();
        let a = create_note(&db, note("A")).unwrap();
        let b = create_note(&db, note("B")).unwrap();
        set_note_tags(&db, a.id, vec!["Học".into(), "Thi".into()]).unwrap();
        set_note_tags(&db, b.id, vec!["Học".into()]).unwrap();

        let tags = list_tags(&db).unwrap();
        assert_eq!(tags.len(), 2);
        let hoc = tags.iter().find(|t| t.name == "Học").unwrap();
        let thi = tags.iter().find(|t| t.name == "Thi").unwrap();
        assert_eq!(hoc.count, 2, "note A và B đều mang tag Học");
        assert_eq!(thi.count, 1, "chỉ note A mang tag Thi");
    }

    #[test]
    fn removing_all_tags_clears_note_tags_but_keeps_tag_names() {
        let (_tmp, db) = test_db();
        let n = create_note(&db, note("A")).unwrap();
        set_note_tags(&db, n.id, vec!["Học".into()]).unwrap();
        let saved = set_note_tags(&db, n.id, vec![]).unwrap();
        assert!(saved.tags.is_empty());
        let tags = list_tags(&db).unwrap();
        assert_eq!(tags.len(), 1, "tag đã tạo vẫn còn để tái dùng");
        assert_eq!(tags[0].count, 0);
    }

    #[test]
    fn duplicate_names_collapse_case_insensitively() {
        let (_tmp, db) = test_db();
        let n = create_note(&db, note("A")).unwrap();
        let saved = set_note_tags(
            &db,
            n.id,
            vec!["học".into(), "HỌC".into(), " Học ".into(), "  ".into(), "thi".into()],
        )
        .unwrap();
        assert_eq!(saved.tags, vec!["học".to_string(), "thi".to_string()]);
        assert_eq!(list_tags(&db).unwrap().len(), 2);
    }

    #[test]
    fn set_tags_on_missing_note_errors() {
        let (_tmp, db) = test_db();
        assert!(set_note_tags(&db, 999, vec!["Học".into()]).is_err());
    }

    #[test]
    fn trashed_note_not_counted_in_tag_counts() {
        let (_tmp, db) = test_db();
        let a = create_note(&db, note("A")).unwrap();
        let b = create_note(&db, note("B")).unwrap();
        set_note_tags(&db, a.id, vec!["Học".into()]).unwrap();
        set_note_tags(&db, b.id, vec!["Học".into()]).unwrap();
        trash_note(&db, a.id).unwrap();
        let tags = list_tags(&db).unwrap();
        assert_eq!(tags.len(), 1);
        assert_eq!(tags[0].count, 1, "note trong thùng rác không tính vào số lượng tag");
    }

    #[test]
    fn rename_tag_updates_notes() {
        let (_tmp, db) = test_db();
        let n = create_note(&db, note("A")).unwrap();
        set_note_tags(&db, n.id, vec!["Học".into()]).unwrap();
        let renamed = rename_tag(&db, 1, "  Toán  ").unwrap();
        assert_eq!(renamed.name, "Toán");
        assert_eq!(list_notes(&db).unwrap()[0].tags, vec!["Toán".to_string()]);
        assert_eq!(list_tags(&db).unwrap().len(), 1);
    }

    #[test]
    fn rename_to_existing_tag_merges_notes() {
        let (_tmp, db) = test_db();
        let a = create_note(&db, note("A")).unwrap();
        let b = create_note(&db, note("B")).unwrap();
        set_note_tags(&db, a.id, vec!["Học".into()]).unwrap();
        set_note_tags(&db, b.id, vec!["Toán".into()]).unwrap();
        let merged = rename_tag(&db, 1, "toán").unwrap();
        assert_eq!(merged.name, "Toán");
        assert_eq!(merged.count, 2, "cả hai note đều mang tag Toán sau khi gộp");
        assert_eq!(list_tags(&db).unwrap().len(), 1, "tag cũ biến mất sau khi gộp");
        assert_eq!(list_notes(&db).unwrap()[0].tags, vec!["Toán".to_string()]);
    }

    #[test]
    fn rename_empty_name_errors() {
        let (_tmp, db) = test_db();
        let n = create_note(&db, note("A")).unwrap();
        set_note_tags(&db, n.id, vec!["Học".into()]).unwrap();
        assert!(rename_tag(&db, 1, "   ").is_err());
    }

    #[test]
    fn rename_missing_tag_errors() {
        let (_tmp, db) = test_db();
        assert!(rename_tag(&db, 999, "Toán").is_err());
    }

    #[test]
    fn delete_tag_keeps_notes() {
        let (_tmp, db) = test_db();
        let n = create_note(&db, note("A")).unwrap();
        set_note_tags(&db, n.id, vec!["Học".into()]).unwrap();
        delete_tag(&db, 1).unwrap();
        assert_eq!(list_notes(&db).unwrap().len(), 1, "note vẫn còn sau khi xóa tag");
        assert!(list_notes(&db).unwrap()[0].tags.is_empty());
        assert!(list_tags(&db).unwrap().is_empty());
    }

    #[test]
    fn delete_missing_tag_errors() {
        let (_tmp, db) = test_db();
        assert!(delete_tag(&db, 999).is_err());
    }

    #[test]
    fn migration_keeps_old_notes() {
        // Giả lập database cũ (chưa có bảng tags): tạo tay bảng notes kiểu v1.
        let dir = TempDir::new().unwrap();
        {
            let conn = Connection::open(dir.path().join("notes.db")).unwrap();
            conn.execute_batch(
                "CREATE TABLE notes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL DEFAULT '',
                    content TEXT NOT NULL DEFAULT '',
                    colour TEXT NOT NULL DEFAULT 'yellow',
                    pinned INTEGER NOT NULL DEFAULT 0,
                    updated_at INTEGER NOT NULL
                );",
            )
            .unwrap();
            conn.execute(
                "INSERT INTO notes (title, content, colour, pinned, updated_at)
                 VALUES ('Cũ', 'còn đây', 'yellow', 0, 1000)",
                [],
            )
            .unwrap();
        }
        let conn = open_db(dir.path()).unwrap();
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(version, 5, "migration phải nâng user_version lên bản mới nhất (5)");
        let state = DbState { db: Mutex::new(conn) };
        let all = list_notes(&state).unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].title, "Cũ");
        assert!(all[0].tags.is_empty());
    }
}
