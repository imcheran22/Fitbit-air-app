use serde::Deserialize;

use super::{
    BridgeRequest, BridgeResponse, acquire_bridge_conn, bridge_error, bridge_ok, request_args,
};
use crate::GooseResult;

pub(crate) fn dispatch_realtime(request: &BridgeRequest) -> BridgeResponse {
    match request.method.as_str() {
        "realtime.insert_frame" => request_args::<RealtimeInsertFrameArgs>(request)
            .and_then(insert_frame_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        _ => unreachable!(
            "dispatch_realtime called with non-realtime method: {}",
            request.method
        ),
    }
}

#[derive(Debug, Deserialize)]
struct RealtimeInsertFrameArgs {
    database_path: String,
    device_uuid: String,
    frame_hex: String,
    captured_at: String,
}

fn insert_frame_bridge(args: RealtimeInsertFrameArgs) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    store.insert_realtime_frame(&args.device_uuid, &args.frame_hex, &args.captured_at)?;
    Ok(serde_json::json!({"ok": true, "inserted": 1}))
}
