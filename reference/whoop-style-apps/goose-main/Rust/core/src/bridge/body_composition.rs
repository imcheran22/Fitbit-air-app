use serde::Deserialize;

use super::{
    BridgeRequest, BridgeResponse, acquire_bridge_conn, bridge_error, bridge_ok, request_args,
};
use crate::GooseResult;

pub(crate) fn dispatch_body_composition(request: &BridgeRequest) -> BridgeResponse {
    match request.method.as_str() {
        "body_composition.upsert" => request_args::<BodyCompositionUpsertArgs>(request)
            .and_then(upsert_body_composition_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "body_composition.history_between" => {
            request_args::<BodyCompositionHistoryBetweenArgs>(request)
                .and_then(body_composition_history_between_bridge)
                .map(|value| bridge_ok(&request.request_id, value))
                .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error))
        }
        _ => unreachable!(
            "dispatch_body_composition called with non-body_composition method: {}",
            request.method
        ),
    }
}

#[derive(Debug, Deserialize)]
struct BodyCompositionUpsertArgs {
    database_path: String,
    date: String,
    source: String,
    weight_kg: Option<f64>,
    bmi: Option<f64>,
    body_fat_pct: Option<f64>,
    muscle_mass_kg: Option<f64>,
    water_pct: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct BodyCompositionHistoryBetweenArgs {
    database_path: String,
    start_date: String,
    end_date: String,
}

fn upsert_body_composition_bridge(
    args: BodyCompositionUpsertArgs,
) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    store.upsert_body_composition(
        &args.date,
        &args.source,
        args.weight_kg,
        args.bmi,
        args.body_fat_pct,
        args.muscle_mass_kg,
        args.water_pct,
    )?;
    Ok(serde_json::json!({"ok": true}))
}

fn body_composition_history_between_bridge(
    args: BodyCompositionHistoryBetweenArgs,
) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let rows = store.body_composition_history_between(&args.start_date, &args.end_date)?;
    let result = rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "date": r.date,
                "source": r.source,
                "weight_kg": r.weight_kg,
                "bmi": r.bmi,
                "body_fat_pct": r.body_fat_pct,
                "muscle_mass_kg": r.muscle_mass_kg,
                "water_pct": r.water_pct,
            })
        })
        .collect::<Vec<_>>();
    Ok(serde_json::json!(result))
}
