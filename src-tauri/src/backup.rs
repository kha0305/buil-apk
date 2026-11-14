//! Xuất/nhập sao lưu toàn bộ thư viện (note, tag, cài đặt) dạng JSON.
//! Nhập sẽ THAY THẾ toàn bộ dữ liệu hiện tại, nên giao diện phải hỏi
//! xác nhận trước khi gọi. Version 1 là định dạng duy nhất được chấp nhận.

use crate::db::{db_err, ensure_order_parent, lock, DbState};
use crate::notes::{list_all_notes, Note};
use crate::tags::{list_tags, normalize_colour, Tag, TAG_ICONS};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Một dòng thứ tự note trong một nhóm (tag_id 0 = nhóm chưa gắn tag).
/// Lưu trong sao lưu để nhập lại giữ đúng thứ tự người dùng đã xếp.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteOrderRow {
    pub tag_id: i64,
    pub note_id: i64,
    pub position: i64,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Backup {
    pub version: u32,
    pub notes: Vec<Note>,
    pub tags: Vec<Tag>,
    pub settings: HashMap<String, String>,
    /// Sao lưu cũ (v14) không có trường này thì mặc định rỗng — thứ tự
    /// rơi về dự phòng updated_at, không vỡ khi nhập.
    #[serde(default)]
    pub note_order: Vec<NoteOrderRow>,
}

/// Mọi dòng thứ tự note trong mọi nhóm, xếp theo nhóm rồi vị trí.
fn all_note_order(conn: &Connection) -> Result<Vec<NoteOrderRow>, String> {
    let mut stmt = conn
        .prepare("SELECT tag_id, note_id, position FROM note_order ORDER BY tag_id, position")
        .map_err(db_err)?;
    stmt.query_map([], |r| {
        Ok(NoteOrderRow { tag_id: r.get(0)?, note_id: r.get(1)?, position: r.get(2)? })
    })
    .map_err(db_err)?
    .collect::<Result<Vec<_>, _>>()
    .map_err(db_err)
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
    // Đọc settings + note_order trong một block riêng để nhả khóa trước khi
    // gọi list_all_notes/list_tags (hai hàm đó tự khóa lại, khóa lồng nhau
    // là chết).
    let (settings, note_order) = {
        let conn = lock(state)?;
        (all_settings(&conn)?, all_note_order(&conn)?)
    };
    let backup = Backup {
        version: 1,
        notes: list_all_notes(state)?,
        tags: list_tags(state)?,
        settings,
        note_order,
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
            // Giữ icon + màu tag (bản v14 chỉ chèn id + tên nên tag nhập lại
            // mất icon/màu đã đổi). Icon lạ thì về mặc định "tag", màu thì
            // chuẩn hóa về tên id (hex cũng chấp nhận).
            let icon = if TAG_ICONS.contains(&t.icon.as_str()) { t.icon.as_str() } else { "tag" };
            tx.execute(
                "INSERT INTO tags (id, name, icon, colour) VALUES (?1, ?2, ?3, ?4)",
                params![t.id, t.name, icon, normalize_colour(&t.colour)],
            )
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
        // Dựng lại thứ tự note trong từng nhóm (bản v14 không lưu nên sau
        // nhập thứ tự rơi về updated_at). Dòng cha nhóm 0 tạo lại nếu thiếu;
        // dòng nào trỏ tới note/tag không có trong bản sao lưu thì bỏ qua.
        ensure_order_parent(&tx, 0)?;
        for r in &backup.note_order {
            tx.execute(
                "INSERT OR IGNORE INTO note_order (tag_id, note_id, position) VALUES (?1, ?2, ?3)",
                params![r.tag_id, r.note_id, r.position],
            )
            .map_err(db_err)?;
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
    use crate::tags::{rename_tag, reorder_notes, set_note_tags};
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
    fn export_import_keeps_tag_icon_colour_and_note_order() {
        let (_tmp, db) = test_db();
        let a = create_note(&db, note("A")).unwrap();
        let b = create_note(&db, note("B")).unwrap();
        let c = create_note(&db, note("C")).unwrap();
        set_note_tags(&db, a.id, vec!["Học".into()]).unwrap();
        set_note_tags(&db, b.id, vec!["Học".into()]).unwrap();
        set_note_tags(&db, c.id, vec!["Học".into()]).unwrap();
        // Đổi icon + màu cho tag Học, xếp thứ tự C -> A -> B.
        let tag = list_tags(&db).unwrap().into_iter().find(|t| t.name == "Học").unwrap();
        rename_tag(&db, tag.id, "Học", "star", "red").unwrap();
        reorder_notes(&db, tag.id, vec![c.id, a.id, b.id]).unwrap();
        let json = export_backup(&db).unwrap();

        let (_tmp2, db2) = test_db();
        import_backup(&db2, &json).unwrap();
        let tags2 = list_tags(&db2).unwrap();
        let hoc = tags2.iter().find(|t| t.name == "Học").unwrap();
        assert_eq!(hoc.icon, "star", "icon tag giữ sau khi nhập");
        assert_eq!(hoc.colour, "red", "màu tag giữ sau khi nhập");
        assert_eq!(hoc.note_ids, vec![c.id, a.id, b.id], "thứ tự note trong nhóm giữ sau khi nhập");
        // Xuất lại phải giống y bản gốc (ổn định sau nhập).
        assert_eq!(export_backup(&db2).unwrap(), json, "xuất lại phải giống y bản gốc");
    }

    #[test]
    fn import_bad_json_errors() {
        let (_tmp, db) = test_db();
        assert!(import_backup(&db, "không phải json").is_err());
        assert!(import_backup(&db, "{}").is_err());
        assert!(import_backup(&db, r#"{"version":2,"notes":[],"tags":[],"settings":{}}"#).is_err());
    }
}
