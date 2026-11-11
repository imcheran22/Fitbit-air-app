package org.openstrap.protocol.services

import org.openstrap.protocol.ByteWriter
import org.openstrap.protocol.bytesOf
import org.openstrap.protocol.u8

/**
 * FindDeviceModule 0x001A (Zepp `uhh`/`hhh`, 03 §3.16). The strap has no notification module, so OpenStrap uses
 * this to buzz it while a call rings: [BUZZ] … [STOP]. Notifications use [MotorVibrate] patterns, or [BUZZ] then
 * [STOP] on a strap without them. Tapping the strap did not stop a [BUZZ] on fw 3.25; [FOUND] is the strap's own "found" event (03 §3.16).
 */
object FindDevice {
    /** Starts buzzing; answered `04 01` (the strap adds a third byte, `01`). It doesn't stop by itself: send [STOP]. */
    val BUZZ: ByteArray = bytesOf(0x03)
    /** Zepp's continuous find. Not answered, and on fw 3.25 the strap doesn't vibrate for it (retested alone 2026-10-21); OpenStrap uses [BUZZ]. */
    val START: ByteArray = bytesOf(0x05, 0x01)
    val STOP: ByteArray = bytesOf(0x06)
    const val FOUND = 0x07
    /** How long a notification buzz lasts before [STOP]. */
    const val SHORT_BUZZ_MS = 1_500L
    /**
     * Find strap: how long a [BUZZ] runs before the app sends [STOP] itself. Zepp's find dialog waits 60 s for the user
     * to stop it, then closes (`ktt.java:970`).
     */
    const val FIND_TIMEOUT_MS = 60_000L

    fun isBuzzOk(reply: ByteArray): Boolean = reply.size >= 2 && reply.u8(0) == 0x04 && reply.u8(1) == 1
}

/**
 * MotorVibrateModule 0x0018 (Zepp `nau`/`i0l`, 03 §3.15): `03 scene custom test nPairs {u16 LE}*`, answered `04 01`.
 * The pattern alternates vibrate and pause milliseconds, zero-padded to an even count. With test set the strap plays
 * it at once; Zepp then sends it again with test clear to save it for the scene (`ypk.java:396-407`). OpenStrap only
 * plays, under a scene the strap never uses on its own, so a save, if the strap made one, changes nothing it does.
 */
object MotorVibrate {
    const val SET = 0x03
    /** Zepp's `VibrateType` ordinals. */
    const val SCENE_APP_NOTIFY = 0
    const val SCENE_INCOMING_CALL = 1

    fun play(pattern: List<Int>, scene: Int = SCENE_APP_NOTIFY): ByteArray {
        require(pattern.isNotEmpty() && pattern.all { it in 0..0xFFFF }) { "bad pattern $pattern" }
        val padded = if (pattern.size % 2 == 1) pattern + 0 else pattern
        val w = ByteWriter().u8(SET).u8(scene).u8(1).u8(1).u8(padded.size / 2)
        padded.forEach { w.u16(it) }
        return w.toByteArray()
    }

    fun isOk(reply: ByteArray): Boolean = reply.size >= 2 && reply.u8(0) == SET + 1 && reply.u8(1) == 1
}
