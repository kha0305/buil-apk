//! Cài đặt nhỏ dạng key/value (vd nhóm tag đang thu gọn).

use crate::db::{db_err, lock, DbState};
use rusqlite::{params, OptionalExtension};

pub fn get_setting(state: &DbState, key: &str) -> Result<Option<String>, String> {
    lock(state)?
        .query_row("SELECT value FROM settings WHERE key = ?1", params![key], |r| r.get(0))
        .optional()
        .map_err(db_err)
}

pub fn set_setting(state: &DbState, key: &str, value: &str) -> Result<(), String> {
    lock(state)?
        .execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT (key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )
        .map_err(db_err)?;
    Ok(())
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

    #[test]
    fn missing_key_returns_none() {
        let (_tmp, db) = test_db();
        assert_eq!(get_setting(&db, "collapsed_groups").unwrap(), None);
    }

    #[test]
    fn round_trip() {
        let (_tmp, db) = test_db();
        set_setting(&db, "collapsed_groups", "[\"Học\",\"\"]").unwrap();
        assert_eq!(
            get_setting(&db, "collapsed_groups").unwrap(),
            Some("[\"Học\",\"\"]".to_string())
        );
    }

    #[test]
    fn overwrite_replaces_value() {
        let (_tmp, db) = test_db();
        set_setting(&db, "collapsed_groups", "[\"Học\"]").unwrap();
        set_setting(&db, "collapsed_groups", "[]").unwrap();
        assert_eq!(get_setting(&db, "collapsed_groups").unwrap(), Some("[]".to_string()));
    }
}
