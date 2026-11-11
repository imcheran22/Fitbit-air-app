import Foundation

// HAP-04: Wake-Window Engine
//
// Delegates alarm arming to BLETransport.setWhoopAlarm(at:), which assembles
// the SET_ALARM_TIME (0x42) frame and writes to CMD_TO_STRAP.
// Connected-state guard is enforced by writeAlarmCommand inside the transport layer.
actor GooseWakeWindowManager {
  private weak var ble: (any BLETransport)?

  init(ble: any BLETransport) {
    self.ble = ble
  }

  func armAlarm(target: Date) {
    ble?.setWhoopAlarm(at: target)
  }
}
