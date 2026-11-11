use rusqlite::params;

use crate::GooseResult;

use super::GooseStore;

impl GooseStore {
    /// PIP-01: Insert one realtime BLE frame into `realtime_frames`.
    ///
    /// Uses INSERT OR IGNORE so re-inserting the same (device_uuid, captured_at, frame_hex)
    /// is a no-op — the UNIQUE index on (device_uuid, captured_at) provides deduplication.
    pub fn insert_realtime_frame(
        &self,
        device_uuid: &str,
        frame_hex: &str,
        captured_at: &str,
    ) -> GooseResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| crate::GooseError::message("store mutex poisoned"))?;
        conn.execute(
            "INSERT OR IGNORE INTO realtime_frames (device_uuid, frame_hex, captured_at) \
             VALUES (?1, ?2, ?3)",
            params![device_uuid, frame_hex, captured_at],
        )?;
        Ok(())
    }
}
