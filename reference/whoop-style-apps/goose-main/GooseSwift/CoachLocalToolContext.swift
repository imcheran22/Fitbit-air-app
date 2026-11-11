import Foundation

@MainActor
enum CoachLocalToolContext {
  static func build(
    healthStore: HealthDataStore,
    appModel: GooseAppModel,
    healthState: HealthState,
    mask: StealthMask = .none
  ) -> [String: Any] {
    let tools: [String: Any] = [
      "load_stats": loadStats(healthStore: healthStore, appModel: appModel, mask: mask),
      "get_activities": activities(appModel: appModel, healthState: healthState),
      "get_capture_sessions": captureSessions(appModel: appModel, healthState: healthState),
      "get_raw_session_data": rawSessionData(healthStore: healthStore, appModel: appModel, healthState: healthState),
    ]

    return [
      "generated_at": timestamp(Date()),
      "tool_count": tools.count,
      "tools": tools,
    ]
  }

  private static func loadStats(
    healthStore: HealthDataStore,
    appModel: GooseAppModel,
    mask: StealthMask
  ) -> [String: Any] {
    [
      "readiness": [
        "input": healthStore.metricInputReadinessSummary(),
        "next_action": healthStore.metricInputReadinessNextActionSummary(),
        "packet_feature_next_action": healthStore.packetDerivedFeatureNextActionSummary(),
        "packet_score_next_action": healthStore.packetDerivedScoreNextActionSummary(),
      ],
      "scores": [
        "sleep": mask.isHidden("sleep") ? "hidden_by_user" : healthStore.sleepFeatureScoreSummary(),
        "recovery": mask.isHidden("recovery") ? "hidden_by_user" : healthStore.recoveryFeatureScoreSummary(),
        "strain": mask.isHidden("strain") ? "hidden_by_user" : healthStore.strainFeatureScoreSummary(),
        "stress": mask.isHidden("stress") ? "hidden_by_user" : healthStore.stressFeatureScoreSummary(),
      ],
      "score_provenance": [
        "sleep": healthStore.packetScoreProvenanceSummary("sleep"),
        "recovery": healthStore.packetScoreProvenanceSummary("recovery"),
        "strain": healthStore.packetScoreProvenanceSummary("strain"),
        "stress": healthStore.packetScoreProvenanceSummary("stress"),
      ],
      "vitals": vitals(healthStore: healthStore, appModel: appModel, mask: mask),
      "status": [
        "packet_inputs": healthStore.packetInputStatus,
        "packet_scores": healthStore.packetScoreStatus,
        "band_sleep_import": healthStore.bandSleepImportStatus,
        "external_sleep_import": healthStore.externalSleepImportStatus,
      ],
    ]
  }

  private static func vitals(
    healthStore: HealthDataStore,
    appModel: GooseAppModel,
    mask: StealthMask
  ) -> [[String: Any]] {
    var rows = healthStore.healthMonitorSnapshots(
      restingHeartRateEstimateBPM: appModel.ble.restingHeartRateEstimateBPM,
      restingHeartRateEstimateSampleCount: appModel.ble.restingHeartRateEstimateSampleCount,
      restingHeartRateEstimateUpdatedAt: appModel.ble.restingHeartRateEstimateUpdatedAt,
      restingHeartRateEstimateSource: appModel.ble.restingHeartRateEstimateSource,
      allowLiveFallbacks: true
    ).map(snapshot)

    // Apply stealth masking before live-HR insert to avoid index drift (STEALTH-02)
    if mask.isHidden("hrv_rmssd"),
       let i = rows.firstIndex(where: { ($0["id"] as? String) == "health-monitor" }) {
      rows[i]["value"] = "hidden_by_user"
    }
    if mask.isHidden("resting_hr"),
       let i = rows.firstIndex(where: { ($0["id"] as? String) == "resting-hr" }) {
      rows[i]["value"] = "hidden_by_user"
    }

    rows.insert(
      [
        "id": "live-heart-rate",
        "title": "Live Heart Rate",
        "value": healthStore.latestHeartRateSummary(
          bpm: appModel.ble.liveHeartRateBPM,
          source: appModel.ble.liveHeartRateSource,
          updatedAt: appModel.ble.liveHeartRateUpdatedAt
        ),
        "status": appModel.ble.liveHeartRateBPM == nil ? "Unavailable" : "Trusted",
        "freshness": relativeText(appModel.ble.liveHeartRateUpdatedAt),
        "provenance": healthStore.latestHeartRateProvenanceSummary(source: appModel.ble.liveHeartRateSource),
      ],
      at: 0
    )

    return rows
  }

  private static func activities(appModel: GooseAppModel, healthState: HealthState) -> [String: Any] {
    let session = appModel.activitySession
    return [
      "active_session": [
        "status": session.statusText,
        "activity": session.selectedActivity.title,
        "is_active": session.isActive,
        "is_paused": session.isPaused,
        "started_at": session.startedAt.map(timestamp) ?? NSNull(),
        "elapsed_seconds": Int(session.elapsed.rounded()),
        "average_hr": session.averageHeartRate ?? NSNull(),
        "max_hr": session.maxHeartRate ?? NSNull(),
      ],
      "timeline_status": healthState.homeActivityTimelineStatus,
      "timeline": healthState.homeActivityTimelineItems.prefix(8).map(activityTimelineItem),
      "persistence_status": healthState.activityPersistenceStatus,
      "detection_status": healthState.activityDetectionStatus,
      "movement_packet_status": appModel.movementPacketStatus,
      "movement_validation_status": healthState.movementPacketValidationStatus,
    ]
  }

  private static func captureSessions(appModel: GooseAppModel, healthState: HealthState) -> [String: Any] {
    [
      "packet_import_status": healthState.packetImportStatus,
      "last_parsed_frame": appModel.lastParsedFrameSummary,
      "health_packet_capture": [
        "status": healthState.healthPacketCaptureStatus,
        "session_id": healthState.healthPacketCaptureSessionID ?? NSNull(),
        "started_at": healthState.healthPacketCaptureStartedAt.map(timestamp) ?? NSNull(),
        "frame_count": healthState.healthPacketCaptureFrameCount,
        "target_summary": healthState.healthPacketCaptureTargetSummary,
        "last_packet": healthState.healthPacketCaptureLastPacketSummary,
        "families": healthState.healthPacketCaptureFamilyRows.prefix(12).map(captureFamily),
      ],
      "device_signals": [
        "summary": appModel.liveDeviceDataSummary,
        "recent": appModel.recentDeviceSignalPoints.prefix(8).map(deviceSignal),
      ],
      "ble": [
        "device": appModel.ble.activeDeviceName,
        "connection_state": appModel.ble.connectionState,
        "historical_sync": appModel.ble.historicalSyncStatus,
        "physiology_capture": appModel.ble.physiologyCaptureStatus,
        "last_physiology_command": appModel.ble.lastPhysiologyCommandSummary,
      ],
    ]
  }

  private static func rawSessionData(
    healthStore: HealthDataStore,
    appModel: GooseAppModel,
    healthState: HealthState
  ) -> [String: Any] {
    [
      "packet_inputs_status": healthStore.packetInputStatus,
      "packet_scores_status": healthStore.packetScoreStatus,
      "capture_status": captureSessions(appModel: appModel, healthState: healthState),
      "activity_status": activities(appModel: appModel, healthState: healthState),
    ]
  }

  private static func snapshot(_ snapshot: HealthMetricSnapshot) -> [String: Any] {
    [
      "id": snapshot.id,
      "title": snapshot.title,
      "value": snapshot.displayValue,
      "status": snapshot.status,
      "freshness": snapshot.freshness,
      "provenance": snapshot.provenance,
      "source": snapshot.source.detail,
    ]
  }

  private static func activityTimelineItem(_ item: ActivityTimelineItem) -> [String: Any] {
    [
      "id": item.id,
      "started_at": timestamp(item.startedAt),
      "title": item.title,
      "activity_type": item.activityType,
      "sync_status": item.syncStatus,
      "duration_seconds": Int(item.durationSeconds.rounded()),
      "distance_meters": item.distanceMeters ?? NSNull(),
      "average_hr": item.averageHeartRate ?? NSNull(),
    ]
  }

  private static func captureFamily(_ family: HealthPacketCaptureFamily) -> [String: Any] {
    [
      "id": family.id,
      "title": family.title,
      "count": family.count,
      "last_seen": timestamp(family.lastSeen),
      "status": family.status.rawValue,
      "detail": family.detail,
    ]
  }

  private static func deviceSignal(_ point: DeviceSignalPoint) -> [String: Any] {
    [
      "id": point.id.uuidString,
      "family": point.family,
      "value": point.value,
      "captured_at": timestamp(point.capturedAt),
      "detail": point.detail,
    ]
  }

  private static func relativeText(_ date: Date?) -> String {
    guard let date else {
      return "Unavailable"
    }
    return HealthDataStore.relativeText(for: date) ?? timestamp(date)
  }

  private static func timestamp(_ date: Date) -> String {
    ISO8601DateFormatter().string(from: date)
  }
}
