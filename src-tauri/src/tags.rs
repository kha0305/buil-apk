//! Tag do người dùng tự tạo — một note gắn được nhiều tag, không có tag sẵn.
//! Tên tag không phân biệt hoa thường (UNIQUE COLLATE NOCASE).
//! Mỗi tag có icon + màu; mỗi nhóm tag có thứ tự note riêng (bảng note_order).
//! Nhóm "Chưa gắn tag" là tag id 0 (dòng sentinel trong bảng tags).
//! Đổi tên trùng tag khác thì báo lỗi, không gộp (bản v14 gộp im lặng, v18 bỏ);
//! xóa tag đã bỏ hẳn ở v18 (tag rỗng tự ẩn khỏi danh sách).

use crate::db::{db_err, ensure_order_parent, ensure_order_row, get_note, lock, DbState};
use crate::notes::Note;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};

/// 21 icon tag, "none" = không hiện icon. Khớp `TAG_ICON_IDS` ở `TagIcon.tsx`.
pub const TAG_ICONS: [&str; 21] = [
    "none", "tag", "star", "heart", "book", "briefcase", "home", "bulb", "music",
    "camera", "calendar", "gift", "plane", "car", "coffee", "gamepad", "activity",
    "money", "gradcap", "moon", "bell",
];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: i64,
    pub name: String,
    /// Mặc định khi giải mã JSON sao lưu cũ (chưa có trường này).
    #[serde(default = "default_tag_icon")]
    pub icon: String,
    #[serde(default = "default_tag_colour")]
    pub colour: String,
    pub count: i64,
    /// Id các note trong nhóm, đúng thứ tự hiển thị (ghim trước, rồi position).
    #[serde(default)]
    pub note_ids: Vec<i64>,
}

fn default_tag_icon() -> String {
    "tag".into()
}

fn default_tag_colour() -> String {
    "cream".into()
}

/// Mọi tag đang có ít nhất một note ngoài thùng rác, xếp theo tên,
/// kèm nhóm "Chưa gắn tag" (id 0) ở cuối nếu có note chưa gắn tag.
/// Note trong thùng rác không tính vào số lượng.
pub fn list_tags(state: &DbState) -> Result<Vec<Tag>, String> {
    let conn = lock(state)?;
    let mut stmt = conn
        .prepare("SELECT id FROM tags WHERE id != 0 ORDER BY name")
        .map_err(db_err)?;
    let ids = stmt
        .query_map([], |r| r.get::<_, i64>(0))
        .map_err(db_err)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(db_err)?;
    drop(stmt);
    let mut out = Vec::new();
    for id in ids {
        let tag = get_tag(&conn, id)?;
        if tag.count > 0 {
            out.push(tag);
        }
    }
    let untagged = get_tag(&conn, 0)?;
    if untagged.count > 0 {
        out.push(untagged);
    }
    Ok(out)
}

/// Một tag kèm số note và id note đang mang nó (note trong thùng rác không tính).
/// Id 0 là nhóm "Chưa gắn tag" (dòng sentinel trong bảng tags).
/// Dòng sentinel lỡ bị xóa (vd sau khi nhập sao lưu, khi DB chưa mở lại)
/// thì vẫn trả về nhóm tổng hợp, không lỗi.
pub fn get_tag(conn: &Connection, id: i64) -> Result<Tag, String> {
    let row = conn
        .query_row(
            "SELECT id, name, icon, colour FROM tags WHERE id = ?1",
            params![id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .optional()
        .map_err(db_err)?;
    let (id, name, icon, colour) = match row {
        Some(row) => row,
        None if id == 0 => (
            0,
            "Chưa gắn tag".to_string(),
            "none".to_string(),
            "cream".to_string(),
        ),
        None => return Err("Tag not found".into()),
    };
    let note_ids = note_ids_of(conn, id)?;
    Ok(Tag {
        id,
        name,
        icon,
        colour,
        count: note_ids.len() as i64,
        note_ids,
    })
}

/// Id note trong nhóm, đúng thứ tự hiển thị: ghim trước, rồi position,
/// cuối cùng mới theo updated_at (phòng dòng note_order bị thiếu).
fn note_ids_of(conn: &Connection, tag_id: i64) -> Result<Vec<i64>, String> {
    let sql = if tag_id == 0 {
        "SELECT n.id FROM notes n
         LEFT JOIN note_order no ON no.tag_id = ?1 AND no.note_id = n.id
         WHERE n.deleted_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM note_tags nt WHERE nt.note_id = n.id)
         ORDER BY n.pinned DESC, COALESCE(no.position, 9223372036854775807) ASC, n.updated_at DESC"
    } else {
        "SELECT n.id FROM notes n
         JOIN note_tags nt ON nt.note_id = n.id AND nt.tag_id = ?1
         LEFT JOIN note_order no ON no.tag_id = ?1 AND no.note_id = n.id
         WHERE n.deleted_at IS NULL
         ORDER BY n.pinned DESC, COALESCE(no.position, 9223372036854775807) ASC, n.updated_at DESC"
    };
    let mut stmt = conn.prepare(sql).map_err(db_err)?;
    stmt.query_map(params![tag_id], |r| r.get(0))
        .map_err(db_err)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(db_err)
}

/// Đổi tên + icon + màu một tag. Tên mới trùng tag khác (không phân biệt
/// hoa thường) thì báo lỗi, không gộp. Nhóm "Chưa gắn tag" (id 0) không đổi được.
pub fn rename_tag(state: &DbState, id: i64, name: &str, icon: &str, colour: &str) -> Result<Tag, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Tên tag không được để trống.".into());
    }
    if id == 0 {
        return Err("Không đổi được nhóm này.".into());
    }
    let icon = normalize_icon(icon)?;
    let colour = normalize_colour(colour);
    let conn = lock(state)?;
    get_tag(&conn, id)?;
    let dup = conn
        .query_row(
            "SELECT id FROM tags WHERE name = ?1 COLLATE NOCASE AND id != ?2",
            params![name, id],
            |r| r.get::<_, i64>(0),
        )
        .optional()
        .map_err(db_err)?;
    if dup.is_some() {
        return Err("Tên tag này đã có rồi.".into());
    }
    conn.execute(
        "UPDATE tags SET name = ?1, icon = ?2, colour = ?3 WHERE id = ?4",
        params![name, icon, colour, id],
    )
    .map_err(db_err)?;
    get_tag(&conn, id)
}

fn normalize_icon(icon: &str) -> Result<String, String> {
    let icon = icon.trim();
    if icon.is_empty() {
        return Ok("tag".into());
    }
    if TAG_ICONS.contains(&icon) {
        Ok(icon.to_string())
    } else {
        Err("Icon tag không hợp lệ.".into())
    }
}

/// Hex -> tên id màu tag (16 màu, khớp `COLOURS` ở `lib/types.ts`).
/// Backend chỉ lưu tên id: editor gửi hex, home gửi tên id, đọc lại luôn là tên id.
const TAG_COLOUR_HEX: [(&str, &str); 16] = [
    ("#e8d3ae", "cream"),
    ("#f9c8c8", "red"),
    ("#fbdcb8", "orange"),
    ("#fbd3ae", "peach"),
    ("#fdf0b8", "yellow"),
    ("#cbf0c8", "green"),
    ("#dce6c8", "sage"),
    ("#cbf0e6", "mint"),
    ("#bfe0f2", "sky"),
    ("#c9dcf8", "blue"),
    ("#e0cdf8", "purple"),
    ("#e6dcf7", "lavender"),
    ("#fbdfea", "pink"),
    ("#e8dac8", "brown"),
    ("#e6e6e6", "grey"),
    ("#fffdf7", "white"),
];

pub(crate) fn normalize_colour(colour: &str) -> String {
    let colour = colour.trim();
    if colour.is_empty() {
        return "cream".into();
    }
    let key: String = colour
        .to_lowercase()
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect();
    for (hex, id) in TAG_COLOUR_HEX {
        if key == hex {
            return id.to_string();
        }
    }
    colour.to_string()
}

/// Xếp lại thứ tự note trong một nhóm (id 0 = nhóm chưa gắn tag).
/// Ghi đè position theo đúng thứ tự ordered_ids, trong 1 transaction;
/// không chạm tới dòng của nhóm khác. Gọi lại với cùng thứ tự thì kết quả y hệt.
pub fn reorder_notes(state: &DbState, tag_id: i64, ordered_ids: Vec<i64>) -> Result<(), String> {
    let mut conn = lock(state)?;
    get_tag(&conn, tag_id)?;
    ensure_order_parent(&conn, tag_id)?;
    let tx = conn.transaction().map_err(db_err)?;
    for (i, id) in ordered_ids.iter().enumerate() {
        tx.execute(
            "INSERT INTO note_order (tag_id, note_id, position) VALUES (?1, ?2, ?3)
             ON CONFLICT (tag_id, note_id) DO UPDATE SET position = excluded.position",
            params![tag_id, id, i as i64],
        )
        .map_err(db_err)?;
    }
    tx.commit().map_err(db_err)?;
    Ok(())
}

/// Gắn lại toàn bộ tag của một note: tên nào chưa có thì tạo mới,
/// tên trùng (không phân biệt hoa thường, kể cả thừa khoảng trắng) gộp thành một.
/// Đồng bộ luôn note_order (xem `sync_note_order`).
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
        sync_note_order(&tx, note_id)?;
        tx.commit().map_err(db_err)?;
    }
    get_note(&conn, note_id)
}

/// Đồng bộ note_order với note_tags vừa ghi: giữ vị trí cũ của tag còn giữ,
/// thêm dòng cuối nhóm cho tag mới gắn, xóa dòng của tag đã gỡ.
/// Note không còn tag nào thì về nhóm 0 (giữ vị trí cũ nếu đã ở đó).
fn sync_note_order(tx: &Transaction, note_id: i64) -> Result<(), String> {
    let mut stmt = tx
        .prepare("SELECT tag_id FROM note_tags WHERE note_id = ?1")
        .map_err(db_err)?;
    let tag_ids = stmt
        .query_map(params![note_id], |r| r.get::<_, i64>(0))
        .map_err(db_err)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(db_err)?;
    drop(stmt);
    if tag_ids.is_empty() {
        tx.execute("DELETE FROM note_order WHERE note_id = ?1 AND tag_id != 0", params![note_id])
            .map_err(db_err)?;
        ensure_order_row(tx, 0, note_id)?;
    } else {
        tx.execute("DELETE FROM note_order WHERE note_id = ?1 AND tag_id = 0", params![note_id])
            .map_err(db_err)?;
        tx.execute(
            "DELETE FROM note_order WHERE note_id = ?1
             AND tag_id NOT IN (SELECT tag_id FROM note_tags WHERE note_id = ?1)",
            params![note_id],
        )
        .map_err(db_err)?;
        for tag_id in tag_ids {
            ensure_order_row(tx, tag_id, note_id)?;
        }
    }
    Ok(())
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
    use crate::notes::{create_note, list_notes, toggle_pin, trash_note, NewNote};
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

    /// (note_id, position) của một nhóm, xếp theo position.
    fn order_rows(state: &DbState, tag_id: i64) -> Vec<(i64, i64)> {
        let conn = state.db.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT note_id, position FROM note_order WHERE tag_id = ?1 ORDER BY position")
            .unwrap();
        stmt.query_map(params![tag_id], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap()
            .map(|r| r.unwrap())
            .collect()
    }

    /// Nhóm tag theo tên (kèm cả nhóm chưa gắn tag).
    fn group<'a>(tags: &'a [Tag], name: &str) -> &'a Tag {
        tags.iter().find(|t| t.name == name).unwrap()
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
    fn removing_all_tags_moves_note_to_untagged_group() {
        let (_tmp, db) = test_db();
        let n = create_note(&db, note("A")).unwrap();
        set_note_tags(&db, n.id, vec!["Học".into()]).unwrap();
        let saved = set_note_tags(&db, n.id, vec![]).unwrap();
        assert!(saved.tags.is_empty());
        let tags = list_tags(&db).unwrap();
        assert_eq!(tags.len(), 1, "tag rỗng bị ẩn, chỉ còn nhóm chưa gắn tag");
        assert_eq!(tags[0].id, 0);
        assert_eq!(tags[0].name, "Chưa gắn tag");
        assert_eq!(tags[0].icon, "none");
        assert_eq!(tags[0].count, 1);
        assert_eq!(tags[0].note_ids, vec![n.id]);
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
        assert_eq!(tags.len(), 1, "note trong thùng rác không tính, nhóm chưa gắn tag rỗng nên ẩn");
        assert_eq!(tags[0].count, 1, "note trong thùng rác không tính vào số lượng tag");
    }

    #[test]
    fn rename_tag_updates_notes() {
        let (_tmp, db) = test_db();
        let n = create_note(&db, note("A")).unwrap();
        set_note_tags(&db, n.id, vec!["Học".into()]).unwrap();
        let renamed = rename_tag(&db, 1, "  Toán  ", "star", "pink").unwrap();
        assert_eq!(renamed.name, "Toán");
        assert_eq!(renamed.icon, "star");
        assert_eq!(renamed.colour, "pink");
        assert_eq!(list_notes(&db).unwrap()[0].tags, vec!["Toán".to_string()]);
        assert_eq!(list_tags(&db).unwrap().len(), 1);
    }

    #[test]
    fn rename_to_existing_name_errors() {
        let (_tmp, db) = test_db();
        let a = create_note(&db, note("A")).unwrap();
        let b = create_note(&db, note("B")).unwrap();
        set_note_tags(&db, a.id, vec!["Học".into()]).unwrap();
        set_note_tags(&db, b.id, vec!["Toán".into()]).unwrap();
        let err = rename_tag(&db, 1, "toán", "tag", "cream").unwrap_err();
        assert_eq!(err, "Tên tag này đã có rồi.");
        assert_eq!(list_tags(&db).unwrap().len(), 2, "không tag nào bị gộp hay mất");
        let notes = list_notes(&db).unwrap();
        assert_eq!(
            notes.iter().find(|n| n.id == a.id).unwrap().tags,
            vec!["Học".to_string()],
            "note của tag cũ không đổi"
        );
    }

    #[test]
    fn rename_to_same_name_with_other_case_ok() {
        let (_tmp, db) = test_db();
        let n = create_note(&db, note("A")).unwrap();
        set_note_tags(&db, n.id, vec!["Học".into()]).unwrap();
        let renamed = rename_tag(&db, 1, "HỌC", "book", "blue").unwrap();
        assert_eq!(renamed.name, "HỌC");
        assert_eq!(renamed.icon, "book");
    }

    #[test]
    fn rename_empty_name_errors() {
        let (_tmp, db) = test_db();
        let n = create_note(&db, note("A")).unwrap();
        set_note_tags(&db, n.id, vec!["Học".into()]).unwrap();
        let err = rename_tag(&db, 1, "   ", "tag", "cream").unwrap_err();
        assert_eq!(err, "Tên tag không được để trống.");
    }

    #[test]
    fn rename_missing_tag_errors() {
        let (_tmp, db) = test_db();
        assert!(rename_tag(&db, 999, "Toán", "tag", "cream").is_err());
    }

    #[test]
    fn rename_invalid_icon_errors() {
        let (_tmp, db) = test_db();
        let n = create_note(&db, note("A")).unwrap();
        set_note_tags(&db, n.id, vec!["Học".into()]).unwrap();
        assert!(rename_tag(&db, 1, "Học", "không-có-icon-này", "cream").is_err());
    }

    #[test]
    fn rename_tag_normalizes_hex_colour_to_id() {
        let (_tmp, db) = test_db();
        let n = create_note(&db, note("A")).unwrap();
        set_note_tags(&db, n.id, vec!["Học".into()]).unwrap();
        let renamed = rename_tag(&db, 1, "Học", "tag", "#f9c8c8").unwrap();
        assert_eq!(renamed.colour, "red", "hex #f9c8c8 phải lưu thành tên id red");
        let renamed = rename_tag(&db, 1, "Học", "tag", "  #F9C8C8 ").unwrap();
        assert_eq!(renamed.colour, "red", "hex hoa + khoảng trắng cũng về red");
        let renamed = rename_tag(&db, 1, "Học", "tag", "blue").unwrap();
        assert_eq!(renamed.colour, "blue", "tên id giữ nguyên");
        let renamed = rename_tag(&db, 1, "Học", "tag", "#123456").unwrap();
        assert_eq!(renamed.colour, "#123456", "hex lạ giữ nguyên, không vỡ");
        assert_eq!(
            list_tags(&db).unwrap()[0].colour,
            "#123456",
            "đọc lại từ DB vẫn là giá trị đã lưu"
        );
    }

    #[test]
    fn rename_untagged_group_errors() {
        let (_tmp, db) = test_db();
        assert!(rename_tag(&db, 0, "Khác", "tag", "cream").is_err());
    }

    #[test]
    fn list_tags_excludes_empty_tags_and_returns_note_ids_in_display_order() {
        let (_tmp, db) = test_db();
        let a = create_note(&db, note("A")).unwrap();
        let b = create_note(&db, note("B")).unwrap();
        let c = create_note(&db, note("C")).unwrap();
        let d = create_note(&db, note("D")).unwrap();
        for n in [a.id, b.id, c.id] {
            set_note_tags(&db, n, vec!["Học".into()]).unwrap();
        }
        set_note_tags(&db, d.id, vec!["Thi".into()]).unwrap();
        set_note_tags(&db, d.id, vec![]).unwrap();
        toggle_pin(&db, b.id).unwrap();
        let hoc_id = list_tags(&db).unwrap().iter().find(|t| t.name == "Học").unwrap().id;
        reorder_notes(&db, hoc_id, vec![c.id, a.id, b.id]).unwrap();
        let tags = list_tags(&db).unwrap();
        assert!(!tags.iter().any(|t| t.name == "Thi"), "tag rỗng không hiện");
        let hoc = group(&tags, "Học");
        assert_eq!(hoc.count, 3);
        assert_eq!(hoc.note_ids, vec![b.id, c.id, a.id], "ghim lên trước, rồi theo position");
        assert_eq!(group(&tags, "Chưa gắn tag").note_ids, vec![d.id]);
    }

    #[test]
    fn pinned_note_stays_first_despite_position() {
        let (_tmp, db) = test_db();
        let a = create_note(&db, note("A")).unwrap();
        let b = create_note(&db, note("B")).unwrap();
        set_note_tags(&db, a.id, vec!["Học".into()]).unwrap();
        set_note_tags(&db, b.id, vec!["Học".into()]).unwrap();
        let hoc_id = list_tags(&db).unwrap().iter().find(|t| t.name == "Học").unwrap().id;
        reorder_notes(&db, hoc_id, vec![b.id, a.id]).unwrap();
        assert_eq!(group(&list_tags(&db).unwrap(), "Học").note_ids, vec![b.id, a.id]);
        toggle_pin(&db, a.id).unwrap();
        assert_eq!(
            group(&list_tags(&db).unwrap(), "Học").note_ids,
            vec![a.id, b.id],
            "note ghim lên trước dù position lớn hơn"
        );
    }

    #[test]
    fn reorder_notes_is_idempotent() {
        let (_tmp, db) = test_db();
        let a = create_note(&db, note("A")).unwrap();
        let b = create_note(&db, note("B")).unwrap();
        let c = create_note(&db, note("C")).unwrap();
        for n in [a.id, b.id, c.id] {
            set_note_tags(&db, n, vec!["Học".into()]).unwrap();
        }
        let hoc_id = list_tags(&db).unwrap().iter().find(|t| t.name == "Học").unwrap().id;
        reorder_notes(&db, hoc_id, vec![c.id, a.id, b.id]).unwrap();
        let first = group(&list_tags(&db).unwrap(), "Học").note_ids.clone();
        reorder_notes(&db, hoc_id, vec![c.id, a.id, b.id]).unwrap();
        assert_eq!(group(&list_tags(&db).unwrap(), "Học").note_ids, first);
        assert_eq!(order_rows(&db, hoc_id), vec![(c.id, 0), (a.id, 1), (b.id, 2)]);
    }

    #[test]
    fn reorder_notes_does_not_disturb_other_group() {
        let (_tmp, db) = test_db();
        let a = create_note(&db, note("A")).unwrap();
        let b = create_note(&db, note("B")).unwrap();
        let c = create_note(&db, note("C")).unwrap();
        let d = create_note(&db, note("D")).unwrap();
        set_note_tags(&db, a.id, vec!["Học".into()]).unwrap();
        set_note_tags(&db, b.id, vec!["Học".into()]).unwrap();
        set_note_tags(&db, c.id, vec!["Toán".into()]).unwrap();
        set_note_tags(&db, d.id, vec!["Toán".into()]).unwrap();
        let tags = list_tags(&db).unwrap();
        let hoc_id = group(&tags, "Học").id;
        let toan_id = group(&tags, "Toán").id;
        let toan_before = order_rows(&db, toan_id);
        reorder_notes(&db, hoc_id, vec![b.id, a.id]).unwrap();
        assert_eq!(group(&list_tags(&db).unwrap(), "Học").note_ids, vec![b.id, a.id]);
        assert_eq!(order_rows(&db, toan_id), toan_before, "nhóm Toán không đổi");
        assert_eq!(group(&list_tags(&db).unwrap(), "Toán").note_ids, vec![c.id, d.id]);
    }

    #[test]
    fn reorder_notes_persists_across_reopen() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().to_path_buf();
        let (a_id, b_id, c_id, hoc_id);
        {
            let conn = open_db(&path).unwrap();
            let db = DbState { db: Mutex::new(conn) };
            let a = create_note(&db, note("A")).unwrap();
            let b = create_note(&db, note("B")).unwrap();
            let c = create_note(&db, note("C")).unwrap();
            for n in [a.id, b.id, c.id] {
                set_note_tags(&db, n, vec!["Học".into()]).unwrap();
            }
            hoc_id = list_tags(&db).unwrap().iter().find(|t| t.name == "Học").unwrap().id;
            reorder_notes(&db, hoc_id, vec![c.id, a.id, b.id]).unwrap();
            (a_id, b_id, c_id) = (a.id, b.id, c.id);
        }
        {
            let conn = open_db(&path).unwrap();
            let db = DbState { db: Mutex::new(conn) };
            let tags = list_tags(&db).unwrap();
            assert_eq!(tags.len(), 1);
            assert_eq!(tags[0].id, hoc_id);
            assert_eq!(
                tags[0].note_ids,
                vec![c_id, a_id, b_id],
                "thứ tự kéo tay còn nguyên sau khi mở lại DB"
            );
        }
    }

    #[test]
    fn set_tags_syncs_note_order() {
        let (_tmp, db) = test_db();
        let n = create_note(&db, note("A")).unwrap();
        assert_eq!(order_rows(&db, 0), vec![(n.id, 0)], "note mới tạo ở nhóm chưa gắn tag");
        set_note_tags(&db, n.id, vec!["Học".into()]).unwrap();
        assert!(order_rows(&db, 0).is_empty(), "gắn tag thì rời nhóm 0");
        let hoc_id = list_tags(&db).unwrap().iter().find(|t| t.name == "Học").unwrap().id;
        assert_eq!(order_rows(&db, hoc_id), vec![(n.id, 0)]);
        set_note_tags(&db, n.id, vec!["Học".into(), "Toán".into()]).unwrap();
        assert_eq!(order_rows(&db, hoc_id), vec![(n.id, 0)], "vị trí cũ ở nhóm Học giữ nguyên");
        let toan_id = list_tags(&db).unwrap().iter().find(|t| t.name == "Toán").unwrap().id;
        assert_eq!(order_rows(&db, toan_id), vec![(n.id, 0)]);
        set_note_tags(&db, n.id, vec!["Toán".into()]).unwrap();
        assert!(order_rows(&db, hoc_id).is_empty(), "gỡ tag thì dòng nhóm đó mất");
        assert_eq!(order_rows(&db, toan_id), vec![(n.id, 0)]);
        set_note_tags(&db, n.id, vec![]).unwrap();
        assert!(order_rows(&db, toan_id).is_empty());
        assert_eq!(order_rows(&db, 0), vec![(n.id, 0)], "gỡ hết tag thì về nhóm 0");
    }

    #[test]
    fn reassigning_tag_goes_to_end_of_group() {
        let (_tmp, db) = test_db();
        let a = create_note(&db, note("A")).unwrap();
        let b = create_note(&db, note("B")).unwrap();
        set_note_tags(&db, a.id, vec!["Học".into()]).unwrap();
        set_note_tags(&db, b.id, vec!["Học".into()]).unwrap();
        let hoc_id = list_tags(&db).unwrap().iter().find(|t| t.name == "Học").unwrap().id;
        assert_eq!(order_rows(&db, hoc_id), vec![(a.id, 0), (b.id, 1)]);
        set_note_tags(&db, a.id, vec![]).unwrap();
        set_note_tags(&db, a.id, vec!["Học".into()]).unwrap();
        assert_eq!(
            order_rows(&db, hoc_id),
            vec![(b.id, 1), (a.id, 2)],
            "gắn lại tag thì xuống cuối nhóm, không lấy lại vị trí cũ"
        );
    }

    #[test]
    fn restore_keeps_note_order_position() {
        let (_tmp, db) = test_db();
        let a = create_note(&db, note("A")).unwrap();
        let b = create_note(&db, note("B")).unwrap();
        set_note_tags(&db, a.id, vec!["Học".into()]).unwrap();
        set_note_tags(&db, b.id, vec!["Học".into()]).unwrap();
        let hoc_id = list_tags(&db).unwrap().iter().find(|t| t.name == "Học").unwrap().id;
        reorder_notes(&db, hoc_id, vec![b.id, a.id]).unwrap();
        trash_note(&db, a.id).unwrap();
        assert_eq!(group(&list_tags(&db).unwrap(), "Học").note_ids, vec![b.id]);
        crate::notes::restore_note(&db, a.id).unwrap();
        assert_eq!(order_rows(&db, hoc_id), vec![(b.id, 0), (a.id, 1)]);
        assert_eq!(group(&list_tags(&db).unwrap(), "Học").note_ids, vec![b.id, a.id]);
    }

    #[test]
    fn untagged_group_survives_sentinel_deletion() {
        // Mô phỏng nhập sao lưu: import xóa hết bảng tags (kể cả sentinel id 0)
        // nhưng app chưa mở lại DB. Đọc danh sách, tạo note, kéo đổi thứ tự
        // trong nhóm chưa gắn tag vẫn phải chạy, không lỗi "Tag not found".
        let (_tmp, db) = test_db();
        let n = create_note(&db, note("A")).unwrap();
        db.db.lock().unwrap().execute("DELETE FROM tags WHERE id = 0", []).unwrap();
        let tags = list_tags(&db).unwrap();
        assert_eq!(tags.len(), 1);
        assert_eq!(tags[0].id, 0);
        assert_eq!(tags[0].note_ids, vec![n.id]);
        // Xóa sentinel kéo theo CASCADE xóa luôn dòng note_order nhóm 0
        // (vị trí cũ mất, nhưng note vẫn hiện nhờ thứ tự dự phòng updated_at).
        let m = create_note(&db, note("B")).unwrap();
        assert_eq!(order_rows(&db, 0), vec![(m.id, 0)]);
        reorder_notes(&db, 0, vec![m.id, n.id]).unwrap();
        assert_eq!(order_rows(&db, 0), vec![(m.id, 0), (n.id, 1)]);
        assert_eq!(
            group(&list_tags(&db).unwrap(), "Chưa gắn tag").note_ids,
            vec![m.id, n.id]
        );
    }

    #[test]
    fn migration_v6_backfills_icon_colour_and_note_order() {
        // Giả lập database v5: tags kiểu cũ (chưa có icon/colour), chưa có note_order.
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
                    updated_at INTEGER NOT NULL,
                    deleted_at INTEGER,
                    remind_at INTEGER
                );
                CREATE TABLE tags (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE COLLATE NOCASE
                );
                CREATE TABLE note_tags (
                    note_id INTEGER NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
                    tag_id INTEGER NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
                    PRIMARY KEY (note_id, tag_id)
                );
                CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '');
                INSERT INTO notes (id, title, content, colour, pinned, updated_at) VALUES
                    (1, 'Cũ nhất', '', 'yellow', 0, 1000),
                    (2, 'Mới nhất', '', 'yellow', 0, 3000),
                    (3, 'Giữa', '', 'yellow', 0, 2000),
                    (4, 'Không tag', '', 'yellow', 0, 1500);
                INSERT INTO tags (id, name) VALUES (1, 'Học');
                INSERT INTO note_tags (note_id, tag_id) VALUES (1, 1), (2, 1), (3, 1);
                PRAGMA user_version = 5;",
            )
            .unwrap();
        }
        let conn = open_db(dir.path()).unwrap();
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(version, 6, "migration phải nâng user_version lên 6");
        let (icon, colour): (String, String) = conn
            .query_row("SELECT icon, colour FROM tags WHERE id = 1", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .unwrap();
        assert_eq!(icon, "tag", "tag cũ lấy icon mặc định");
        assert_eq!(colour, "cream", "tag cũ lấy màu mặc định");
        let state = DbState { db: Mutex::new(conn) };
        assert_eq!(order_rows(&state, 1), vec![(1, 0), (3, 1), (2, 2)], "backfill xếp theo updated_at tăng dần");
        assert_eq!(order_rows(&state, 0), vec![(4, 0)], "note không tag về nhóm 0");
        let tags = list_tags(&state).unwrap();
        assert_eq!(group(&tags, "Học").note_ids, vec![1, 3, 2]);
        assert_eq!(group(&tags, "Chưa gắn tag").note_ids, vec![4]);
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
        assert_eq!(version, 6, "migration phải nâng user_version lên bản mới nhất (6)");
        let state = DbState { db: Mutex::new(conn) };
        let all = list_notes(&state).unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].title, "Cũ");
        assert!(all[0].tags.is_empty());
        assert_eq!(order_rows(&state, 0), vec![(all[0].id, 0)], "note cũ về nhóm chưa gắn tag");
    }
}
