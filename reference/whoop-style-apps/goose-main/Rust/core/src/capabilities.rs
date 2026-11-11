use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DeviceKind {
    Whoop4,
    Whoop5,
    HrMonitor,
    // WHOOP MG (Maverick hardware codename) — candidate_MG_capabilities_unverified; identical to Whoop5 per APK Gen5 protocol analysis; pending hardware BLE capture.
    WhoopMg,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DeviceCapabilities {
    pub wire_protocol: String,
    pub historical_sync: String,
    pub battery_via_r22: bool,
    pub battery_via_event48: bool,
    pub battery_via_cmd26: bool,
    pub r22_realtime: bool,
}

impl DeviceCapabilities {
    pub fn for_kind(kind: DeviceKind) -> Self {
        match kind {
            DeviceKind::Whoop4 => Self {
                wire_protocol: "gen4".to_string(),
                historical_sync: "page_sequence".to_string(),
                battery_via_r22: false,
                battery_via_event48: true,
                battery_via_cmd26: true,
                r22_realtime: false,
            },
            DeviceKind::Whoop5 => Self {
                wire_protocol: "gen5".to_string(),
                historical_sync: "stream".to_string(),
                battery_via_r22: true,
                battery_via_event48: true,
                battery_via_cmd26: true,
                r22_realtime: true,
            },
            DeviceKind::HrMonitor => Self {
                wire_protocol: "gen5".to_string(),
                historical_sync: "stream".to_string(),
                battery_via_r22: false,
                battery_via_event48: false,
                battery_via_cmd26: false,
                r22_realtime: false,
            },
            DeviceKind::WhoopMg => Self {
                wire_protocol: "gen5".to_string(),
                historical_sync: "stream".to_string(),
                battery_via_r22: true,
                battery_via_event48: true,
                battery_via_cmd26: true,
                r22_realtime: true,
            },
        }
    }
}

#[cfg(test)]
mod capabilities_tests {
    use super::*;

    #[test]
    fn whoop4_capabilities() {
        let caps = DeviceCapabilities::for_kind(DeviceKind::Whoop4);
        assert_eq!(caps.wire_protocol, "gen4");
        assert_eq!(caps.historical_sync, "page_sequence");
        assert!(!caps.battery_via_r22);
        assert!(caps.battery_via_event48);
        assert!(caps.battery_via_cmd26);
        assert!(!caps.r22_realtime);
    }

    #[test]
    fn whoop5_capabilities() {
        let caps = DeviceCapabilities::for_kind(DeviceKind::Whoop5);
        assert_eq!(caps.wire_protocol, "gen5");
        assert_eq!(caps.historical_sync, "stream");
        assert!(caps.battery_via_r22);
        assert!(caps.battery_via_event48);
        assert!(caps.battery_via_cmd26);
        assert!(caps.r22_realtime);
    }

    #[test]
    fn hr_monitor_capabilities() {
        let caps = DeviceCapabilities::for_kind(DeviceKind::HrMonitor);
        assert_eq!(caps.wire_protocol, "gen5");
        assert_eq!(caps.historical_sync, "stream");
        assert!(!caps.battery_via_r22);
        assert!(!caps.battery_via_event48);
        assert!(!caps.battery_via_cmd26);
        assert!(!caps.r22_realtime);
    }

    #[test]
    fn device_kind_screaming_snake_case_serde() {
        // DeviceKind serialises/deserialises with SCREAMING_SNAKE_CASE
        let json = serde_json::to_string(&DeviceKind::Whoop4)
            .expect("DeviceKind::Whoop4 should serialise to JSON");
        assert_eq!(json, r#""WHOOP4""#);
        let json = serde_json::to_string(&DeviceKind::Whoop5)
            .expect("DeviceKind::Whoop5 should serialise to JSON");
        assert_eq!(json, r#""WHOOP5""#);
        let json = serde_json::to_string(&DeviceKind::HrMonitor)
            .expect("DeviceKind::HrMonitor should serialise to JSON");
        assert_eq!(json, r#""HR_MONITOR""#);
    }

    #[test]
    fn device_kind_deserialise_from_screaming_snake_case() {
        let kind: DeviceKind = serde_json::from_str(r#""WHOOP4""#)
            .expect("WHOOP4 JSON string should deserialise to DeviceKind::Whoop4");
        assert_eq!(kind, DeviceKind::Whoop4);
        let kind: DeviceKind = serde_json::from_str(r#""WHOOP5""#)
            .expect("WHOOP5 JSON string should deserialise to DeviceKind::Whoop5");
        assert_eq!(kind, DeviceKind::Whoop5);
        let kind: DeviceKind = serde_json::from_str(r#""HR_MONITOR""#)
            .expect("HR_MONITOR JSON string should deserialise to DeviceKind::HrMonitor");
        assert_eq!(kind, DeviceKind::HrMonitor);
    }

    #[test]
    fn device_kind_unknown_variant_rejected() {
        let result: Result<DeviceKind, _> = serde_json::from_str(r#""UNKNOWN""#);
        assert!(result.is_err(), "unknown DeviceKind should be rejected");
    }

    #[test]
    fn device_capabilities_serde_roundtrip() {
        let caps = DeviceCapabilities::for_kind(DeviceKind::Whoop5);
        let json = serde_json::to_string(&caps)
            .expect("DeviceCapabilities should serialise to JSON for roundtrip");
        let decoded: DeviceCapabilities = serde_json::from_str(&json)
            .expect("serialised DeviceCapabilities JSON should deserialise back cleanly");
        assert_eq!(caps, decoded);
    }

    #[test]
    fn whoop_mg_capabilities() {
        let caps = DeviceCapabilities::for_kind(DeviceKind::WhoopMg);
        assert_eq!(caps.wire_protocol, "gen5");
        assert_eq!(caps.historical_sync, "stream");
        assert!(caps.battery_via_r22);
        assert!(caps.battery_via_event48);
        assert!(caps.battery_via_cmd26);
        assert!(caps.r22_realtime);
    }

    #[test]
    fn device_kind_whoop_mg_serde() {
        let json = serde_json::to_string(&DeviceKind::WhoopMg)
            .expect("DeviceKind::WhoopMg should serialise to JSON");
        assert_eq!(json, r#""WHOOP_MG""#);
        let kind: DeviceKind = serde_json::from_str(r#""WHOOP_MG""#)
            .expect("WHOOP_MG JSON string should deserialise to DeviceKind::WhoopMg");
        assert_eq!(kind, DeviceKind::WhoopMg);
    }
}
