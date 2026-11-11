use serde::Deserialize;

use super::{
    BridgeRequest, BridgeResponse, acquire_bridge_conn, bridge_error, bridge_ok, request_args,
};
use crate::GooseResult;

pub(crate) fn dispatch_capabilities(request: &BridgeRequest) -> BridgeResponse {
    match request.method.as_str() {
        "capabilities.get_feature_flags" => request_args::<GetFeatureFlagsArgs>(request)
            .and_then(get_feature_flags_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "capabilities.upsert_feature_flags" => request_args::<UpsertFeatureFlagsArgs>(request)
            .and_then(upsert_feature_flags_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        _ => unreachable!(
            "dispatch_capabilities called with non-capabilities method: {}",
            request.method
        ),
    }
}

#[derive(Debug, Deserialize)]
struct GetFeatureFlagsArgs {
    database_path: String,
    device_id: String,
}

#[derive(Debug, Deserialize)]
struct FlagEntry {
    index: i64,
    value: i64,
}

#[derive(Debug, Deserialize)]
struct UpsertFeatureFlagsArgs {
    database_path: String,
    device_id: String,
    flags: Vec<FlagEntry>,
}

fn get_feature_flags_bridge(args: GetFeatureFlagsArgs) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let rows = store.get_feature_flags(&args.device_id)?;
    let result = rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "flag_index": r.flag_index,
                "flag_value": r.flag_value,
                "discovered_at": r.discovered_at,
            })
        })
        .collect::<Vec<_>>();
    Ok(serde_json::json!(result))
}

fn upsert_feature_flags_bridge(args: UpsertFeatureFlagsArgs) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let flags: Vec<(i64, i64)> = args.flags.iter().map(|f| (f.index, f.value)).collect();
    let upserted = store.upsert_feature_flags(&args.device_id, &flags)?;
    Ok(serde_json::json!({"upserted": upserted}))
}
