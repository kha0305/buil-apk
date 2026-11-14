//! Xuất/nhập sao lưu toàn bộ thư viện (note, tag, cài đặt) dạng JSON.
//! Nhập sẽ THAY THẾ toàn bộ dữ liệu hiện tại, nên giao diện phải hỏi
//! xác nhận trước khi gọi. Version 1 là định dạng duy nhất được chấp nhận.

use crate::db::{db_err, lock, DbState};
use crate::notes::{list_all_notes, Note};
use crate::tags::{list_tags, Tag};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Backup {
    pub version: u32,
    pub notes: Vec<Note>,
    pub tags: Vec<Tag>,
    pub settings: HashMap<String, String>,
}

/// Mọi cài đặt (key/value) trong bảng settings.
fn all_settings(conn: &Connection) -> Result<HashMap<String, String>, String> {
    let mut stmt = conn.prepare("SELECT key, value FROM settings").map_err(db_err)?;
    stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(db_err)?
        .collect::<Result<HashMap<_, _>, _>>()
        .map_err(db_err)
}

pub fn export_backup(state: &DbState) -> Result<String, String> {
    // Đọc settings trong một block riêng để nhả khóa trước khi gọi
    // list_all_notes/list_tags (hai hàm đó tự khóa lại, khóa lồng nhau là chết).
    let settings = {
        let conn = lock(state)?;
        all_settings(&conn)?
    };
    let backup = Backup {
        version: 1,
        notes: list_all_notes(state)?,
        tags: list_tags(state)?,
        settings,
    };
    serde_json::to_string(&backup).map_err(|e| e.to_string())
}

pub fn import_backup(state: &DbState, json: &str) -> Result<usize, String> {
    let backup: Backup = serde_json::from_str(json).map_err(|_| "File sao lưu không đúng dạng".to_string())?;
    if backup.version != 1 {
        return Err("File sao lưu không đúng phiên bản (cần version 1)".into());
    }
    let mut conn = lock(state)?;
    let count = backup.notes.len();
    {
        let tx = conn.transaction().map_err(db_err)?;
        tx.execute_batch("DELETE FROM note_tags; DELETE FROM notes; DELETE FROM tags; DELETE FROM settings;")
            .map_err(db_err)?;
        for n in &backup.notes {
            tx.execute(
                "INSERT INTO notes (id, title, content, colour, pinned, updated_at, deleted_at, remind_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![n.id, n.title, n.content, n.colour, n.pinned as i64, n.updated_at, n.deleted_at, n.remind_at],
            )
            .map_err(db_err)?;
        }
        for t in &backup.tags {
            tx.execute("INSERT INTO tags (id, name) VALUES (?1, ?2)", params![t.id, t.name])
                .map_err(db_err)?;
        }
        for n in &backup.notes {
            for t in &n.tags {
                tx.execute(
                    "INSERT INTO note_tags (note_id, tag_id)
                     SELECT ?1, id FROM tags WHERE name = ?2 COLLATE NOCASE",
                    params![n.id, t],
                )
                .map_err(db_err)?;
            }
        }
        for (k, v) in &backup.settings {
            tx.execute("INSERT INTO settings (key, value) VALUES (?1, ?2)", params![k, v])
                .map_err(db_err)?;
        }
        tx.commit().map_err(db_err)?;
    }
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_db;
    use crate::notes::{create_note, list_notes, list_trash, set_reminder, trash_note, NewNote};
    use crate::settings::{get_setting, set_setting};
    use crate::tags::set_note_tags;
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
    fn export_import_round_trip_restores_everything() {
        let (_tmp, db) = test_db();
        let a = create_note(&db, note("A")).unwrap();
        let b = create_note(&db, note("B")).unwrap();
        set_note_tags(&db, a.id, vec!["Học".into(), "Thi".into()]).unwrap();
        set_reminder(&db, a.id, Some(1_792_100_000_000)).unwrap();
        trash_note(&db, b.id).unwrap();
        set_setting(&db, "collapsed_groups", "[\"Học\"]").unwrap();
        let json = export_backup(&db).unwrap();

        // DB đích đã có dữ liệu lạ: nhập xong thì dữ liệu lạ biến mất.
        let (_tmp2, db2) = test_db();
        create_note(&db2, note("Lạ")).unwrap();
        let count = import_backup(&db2, &json).unwrap();
        assert_eq!(count, 2, "đếm note đã nhập, kể cả note trong thùng rác");
        assert_eq!(export_backup(&db2).unwrap(), json, "xuất lại phải giống y bản gốc");
        // Note id 1 trùng nhau ở hai DB nên kiểm tra bằng tiêu đề, không kiểm id.
        assert!(list_all_notes(&db2).unwrap().iter().all(|n| n.title != "Lạ")); 
        assert_eq!(list_notes(&db2).unwrap().len(), 1);
        assert_eq!(list_trash(&db2).unwrap().len(), 1);
        assert_eq!(list_tags(&db2).unwrap().len(), 2);
        assert_eq!(
            get_setting(&db2, "collapsed_groups").unwrap(),
            Some("[\"Học\"]".to_string())
        );
    }

    #[test]
    fn import_bad_json_errors() {
        let (_tmp, db) = test_db();
        assert!(import_backup(&db, "không phải json").is_err());
        assert!(import_backup(&db, "{}").is_err());
        assert!(import_backup(&db, r#"{"version":2,"notes":[],"tags":[],"settings":{}}"#).is_err());
    }
}
