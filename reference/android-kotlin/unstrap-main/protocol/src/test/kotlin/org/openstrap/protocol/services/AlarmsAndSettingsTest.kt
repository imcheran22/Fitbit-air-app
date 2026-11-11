package org.openstrap.protocol.services

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.openstrap.protocol.hexToBytes

/** Replies captured from a Helio Strap (fw 3.25.0.3) on 2026-10-16. */
class AlarmsAndSettingsTest {

    @Test
    fun alarmVersion() {
        val caps = AlarmCodec.parseVersion("02030a000000".hexToBytes())!!
        assertEquals(AlarmCapabilities(version = 3, maxCount = 10, titles = false, smartSupported = false), caps)
    }

    @Test
    fun alarmList() {
        val alarm = AlarmCodec.parseList("0a010004072d000000000100".hexToBytes(), titles = false)!!.single()
        assertEquals(Alarm(index = 4, hour = 7, minute = 45, days = 0, enabled = false, smart = false, flags = 0, source = 1), alarm)
    }

    @Test
    fun alarmWrites() {
        val a = Alarm(index = 1, hour = 7, minute = 30, days = Alarm.WEEKDAYS, enabled = true)
        assertArrayEquals("03010401071e1f0000000100".hexToBytes(), AlarmCodec.add(a, titles = false))
        assertArrayEquals("07010001071e1f0000000100".hexToBytes(), AlarmCodec.modify(a.copy(enabled = false), titles = false))
        assertArrayEquals("050101".hexToBytes(), AlarmCodec.delete(1))
        val req = AlarmCodec.add(a, titles = false)
        assertTrue(AlarmCodec.isSuccess(req, "0401".hexToBytes()))
        assertFalse(AlarmCodec.isSuccess(req, "0402".hexToBytes()))
    }

    @Test
    fun alarmWorkdaysAndClearAll() {
        // A strap whose alarm version reports workday support keeps 128 ("workdays").
        assertTrue(AlarmCodec.parseVersion("02030a000100".hexToBytes())!!.workdaysSupported)
        val listed = AlarmCodec.parseList("0a010404072d800000000100".hexToBytes(), titles = false)!!.single()
        assertEquals(Alarm.WORKDAYS, listed.days)
        assertArrayEquals("0701040407 2d80000000 0100".hexToBytes(), AlarmCodec.modify(listed, titles = false, workdays = true))
        // Without support Zepp writes Mon-Fri instead.
        assertArrayEquals("0701040407 2d1f000000 0100".hexToBytes(), AlarmCodec.modify(listed, titles = false, workdays = false))
        assertArrayEquals("0b".hexToBytes(), AlarmCodec.clearAllRequest)
        assertTrue(AlarmCodec.isSuccess(AlarmCodec.clearAllRequest, "0c01".hexToBytes()))
    }

    private val health = ("04010803011d0110fe0600fe01050a1e0210000700646e78828c960310000400282d32040b00830b01110b01120b01130b01" +
        "140b01160b00181000060001050a0f1e310b0132105a040050555a410b014230080043301500440b0145300c0046300e00510b0152" +
        "0310270000d00700003075000053012c01c800b80b5403b036000058020000a08c00005501e0010000a00556010c00060010005701" +
        "1e0005005a00711000020001210b00220b00").hexToBytes()

    @Test
    fun healthGroup() {
        val g = SettingsCodec.parse(health)!!
        assertEquals(8, g.group); assertEquals(3, g.version); assertEquals(29, g.settings.size)
        val interval = g[SettingsCodec.KEY_HR_INTERVAL]!!
        assertEquals(0xFEL, interval.number); assertEquals(listOf(0, 0xFE, 1, 5, 10, 30), interval.choices)
        assertEquals(listOf(0, 100, 110, 120, 130, 140, 150), g[SettingsCodec.KEY_HIGH_HR_ALERT]!!.choices)
        assertEquals(0L, g[SettingsCodec.KEY_HIGH_HR_ALERT]!!.number)
        assertEquals(listOf(0, 40, 45, 50), g[SettingsCodec.KEY_LOW_HR_ALERT]!!.choices)
        assertEquals(false, g[SettingsCodec.KEY_ACTIVITY_HR]!!.bool)
        assertEquals(true, g[SettingsCodec.KEY_STRESS]!!.bool)
        assertEquals(90L, g[SettingsCodec.KEY_LOW_SPO2_ALERT]!!.number)
        assertEquals(8 * 60L, g[0x42]!!.number) // stand reminder from 08:00
        assertEquals(10_000L, g[0x52]!!.number) // step goal
    }

    @Test
    fun calorieTarget() {
        val g = SettingsCodec.parse(health)!!
        assertEquals(300L, g[SettingsCodec.KEY_CALORIE_TARGET]!!.number)
        // An i16 as reported: 05 group version 00 n key type value.
        assertArrayEquals("0508030001530 1c201".replace(" ", "").hexToBytes(), SettingsCodec.calorieTargetFor(g, 450))
        // Already set, or a group without the key: nothing to send.
        assertEquals(null, SettingsCodec.calorieTargetFor(g, 300))
        assertEquals(null, SettingsCodec.calorieTargetFor(SettingsGroup(8, 3, emptyMap()), 450))
        assertArrayEquals("e8030000".hexToBytes(), SettingsCodec.intSetting(0x52, SettingsCodec.TYPE_I32, 1000)!!.raw)
        assertEquals(null, SettingsCodec.intSetting(0x52, SettingsCodec.TYPE_BOOL, 1))
    }

    @Test
    fun settingsWrite() {
        val req = SettingsCodec.write(8, 3, listOf(SettingsCodec.enumSetting(SettingsCodec.KEY_HIGH_HR_ALERT, 120)))
        assertArrayEquals("05080300010210 78".replace(" ", "").hexToBytes(), req)
        assertTrue(SettingsCodec.isWriteSuccess("0601".hexToBytes()))
        assertFalse(SettingsCodec.isWriteSuccess("0604".hexToBytes()))
        assertArrayEquals("030108020203".hexToBytes(), SettingsCodec.query(8, listOf(2, 3)))
    }

    @Test
    fun restartWrite() {
        // Codemap 03 §5.5: GENERAL v2 as read, one entry, key 0x2D bool true.
        assertArrayEquals("050a0200012d0b01".hexToBytes(), SettingsCodec.restart(2))
        // A keyed GENERAL read tells whether the strap offers it, and the version the write echoes.
        val g = SettingsCodec.parse("04010a0200012d0b00".hexToBytes())!!
        assertEquals(2, g.version)
        assertEquals(false, g[SettingsCodec.KEY_RESTART]!!.bool)
        assertArrayEquals(SettingsCodec.restart(2), SettingsCodec.restartFor(g))
        // A strap that doesn't report key 45 is never asked.
        assertNull(SettingsCodec.restartFor(SettingsCodec.parse("04010a0200012c0b01".hexToBytes())!!))
    }

    @Test
    fun wearStatusPush() {
        // A DEVICE_INFORMATION push carrying only key 16 (bool): off-body, then back on. Layout per 03 §3.6.1 table C;
        // the strap's own push has not been captured yet.
        val off = SettingsCodec.parse("040100010001100b00".hexToBytes())!!
        assertEquals(false, SettingsCodec.wearStatus(off))
        assertEquals(true, SettingsCodec.wearStatus(SettingsCodec.parse("040100010001100b01".hexToBytes())!!))
        // Key 16 in another group isn't the wear state, and a push without it says nothing.
        assertNull(SettingsCodec.wearStatus(SettingsCodec.parse("040108010001100b00".hexToBytes())!!))
        assertNull(SettingsCodec.wearStatus(SettingsCodec.parse("04010001000102500000000a".hexToBytes())!!))
        // Turning the strap's wear reminder on: GENERAL key 44, bool true.
        assertArrayEquals("050a0200012c0b01".hexToBytes(), SettingsCodec.write(SettingsCodec.GROUP_GENERAL, 2, listOf(SettingsCodec.boolSetting(SettingsCodec.KEY_WEAR_STATUS_ALERT, true))))
    }

    @Test
    fun settingsVersion() {
        assertArrayEquals("01".hexToBytes(), SettingsCodec.versionRequest)
        assertEquals(SettingsProtocol(3, emptyList()), SettingsCodec.parseVersion("0203".hexToBytes()))
        // v4+ appends one flag per group after the group ids.
        assertEquals(SettingsProtocol(4, listOf(8, 10)), SettingsCodec.parseVersion("020402080a0100".hexToBytes()))
        assertNull(SettingsCodec.parseVersion("0402".hexToBytes()))
        assertEquals(listOf(0, 0, 0, 1, 2, 3, 3), listOf(null, 2, 3, 4, 5, 6, 9).map(SettingsCodec::flagBytes))
    }

    @Test
    fun flagBytesFromProtocol4() {
        // HR interval enum 10 with choices [0, 10] and flag 0; stress bool on with flag 1 (disabled).
        val v4 = "04010803010201100a02000a00130b0101".hexToBytes()
        val g = SettingsCodec.parse(v4, protocolVersion = 4)!!
        assertEquals(10L, g[SettingsCodec.KEY_HR_INTERVAL]!!.number)
        assertEquals(listOf(0, 10), g[SettingsCodec.KEY_HR_INTERVAL]!!.choices)
        assertEquals(listOf(0), g[SettingsCodec.KEY_HR_INTERVAL]!!.flags)
        assertEquals(true, g[SettingsCodec.KEY_STRESS]!!.bool)
        assertEquals(listOf(1), g[SettingsCodec.KEY_STRESS]!!.flags)
        // Read as v1-3, the flag byte is taken for the next key and the second entry is lost.
        assertNull(SettingsCodec.parse(v4)?.get(SettingsCodec.KEY_STRESS))

        // v6: three flag bytes per value, also without options.
        val v6 = "040108030002010b01000001130b00010000".hexToBytes()
        val g6 = SettingsCodec.parse(v6, protocolVersion = 6)!!
        assertEquals(listOf(0, 0, 1), g6[1]!!.flags)
        assertEquals(false, g6[SettingsCodec.KEY_STRESS]!!.bool)
        assertEquals(listOf(1, 0, 0), g6[SettingsCodec.KEY_STRESS]!!.flags)
        // Writes never carry flags.
        assertArrayEquals("050803000113 0b01".replace(" ", "").hexToBytes(), SettingsCodec.write(8, 3, listOf(g6[SettingsCodec.KEY_STRESS]!!.copy(raw = byteArrayOf(1)))))
    }

    @Test
    fun failedQuery() {
        assertNull(SettingsCodec.parse("0403".hexToBytes()))
        assertEquals(3, SettingsCodec.replyCode("0403".hexToBytes()))
    }

    @Test
    fun repliesMatchTheAskedGroup() {
        assertEquals(8, SettingsCodec.replyGroup(health))
        assertTrue(SettingsCodec.isReplyTo(SettingsCodec.GROUP_HEALTH, health))
        // A GENERAL push (key 47 off) arriving during a HEALTH query isn't its reply.
        val general = "04010a0200012f0b00".hexToBytes()
        assertFalse(SettingsCodec.isReplyTo(SettingsCodec.GROUP_HEALTH, general))
        assertTrue(SettingsCodec.isReplyTo(SettingsCodec.GROUP_GENERAL, general))
        // A failure carries no group, so it answers whatever was asked.
        assertTrue(SettingsCodec.isReplyTo(SettingsCodec.GROUP_HEALTH, "0403".hexToBytes()))
        assertNull(SettingsCodec.replyGroup("0403".hexToBytes()))
        // Other opcodes never match.
        assertFalse(SettingsCodec.isReplyTo(SettingsCodec.GROUP_HEALTH, "0601".hexToBytes()))
        assertNull(SettingsCodec.replyGroup("0601".hexToBytes()))
    }

    @Test
    fun pushUpdatesOnlyItsKeys() {
        val read = SettingsCodec.parse(health)!!
        // The strap pushes high-HR alert 120 without options, in group version 4.
        val push = SettingsCodec.parse("040108040001021078".hexToBytes())!!
        val merged = read.updatedWith(push)!!
        assertEquals(4, merged.version)
        assertEquals(120L, merged[SettingsCodec.KEY_HIGH_HR_ALERT]!!.number)
        assertEquals(29, merged.settings.size)
        // Untouched keys keep their value and choices.
        assertEquals(read[SettingsCodec.KEY_HR_INTERVAL], merged[SettingsCodec.KEY_HR_INTERVAL])
        // A push for another group leaves this one alone.
        assertNull(read.updatedWith(SettingsCodec.parse("04010a0200012f0b00".hexToBytes())!!))
    }
    @Test
    fun deviceInformationVersions() {
        assertArrayEquals("03000000".hexToBytes(), SettingsCodec.query(SettingsCodec.GROUP_DEVICE_INFORMATION, withOptions = false))
        // Key 2 int 15; keys 3-6 "3,1", "12,65", "bad", "2,3,9" (schematic: the strap's real values are still unseen).
        val reply = ("0401000100 05" + "02500f000000" + "0320332c3100" + "042031322c363500" + "052062616400" + "0620322c332c3900")
            .replace(" ", "").hexToBytes()
        assertTrue(SettingsCodec.isReplyTo(SettingsCodec.GROUP_DEVICE_INFORMATION, reply))
        val g = SettingsCodec.parse(reply)!!
        assertEquals(15L, g[SettingsCodec.KEY_LANGUAGE_FAMILY]!!.number)
        assertEquals("12,65", g[SettingsCodec.KEY_RESOURCE_VERSION]!!.text)
        assertEquals(3 to 1, SettingsCodec.versionFlag(g[SettingsCodec.KEY_BASE_RESOURCE_VERSION]))
        assertEquals(12 to 65, SettingsCodec.versionFlag(g[SettingsCodec.KEY_RESOURCE_VERSION]))
        assertNull(SettingsCodec.versionFlag(g[SettingsCodec.KEY_FONT_VERSION]))
        // Like Zepp, only the first two parts count.
        assertEquals(2 to 3, SettingsCodec.versionFlag(g[SettingsCodec.KEY_EXT_RESOURCE_VERSION]))
        assertNull(SettingsCodec.versionFlag(null))
        assertNull(g[SettingsCodec.KEY_LANGUAGE_FAMILY]!!.text)
    }
}

class ReadinessCodecTest {
    @Test
    fun scoreFromStrap() {
        val reply = "090001c030d16aa893d16a10043e420104035bffff59645664ffffffffff7fff000080bf0000001fffffffffffffff".hexToBytes()
        val r = ReadinessCodec.parseScores(reply)!!.single()
        assertEquals(1_792_094_400L, r.day)
        assertEquals(91, r.score)
        assertEquals(89, r.hrvScore); assertEquals(86, r.restingHrScore); assertEquals(100, r.skinTemperatureScore); assertEquals(100, r.breathingScore)
        assertNull(r.physicalScore); assertNull(r.mentalScore)
        assertEquals(62, r.sleepHrv); assertEquals(66, r.sleepRestingHr)
        assertEquals("4.3", r.algorithmVersion)
    }

    @Test
    fun recordsAre44BytesApart() {
        val record = "c030d16aa893d16a10043e420104035bffff59645664ffffffffff7fff000080bf0000001fffffffffffffff".hexToBytes()
        assertEquals(44, record.size)
        val second = record.copyOf().also { it[0] = 0x40; it[15] = 77 } // another day, score 77
        val scores = ReadinessCodec.parseScores("090002".hexToBytes() + record + second)!!
        assertEquals(listOf(91, 77), scores.map { it.score })
        assertEquals(listOf(1_792_094_400L, 1_792_094_272L), scores.map { it.day })
    }

    @Test
    fun noData() {
        assertEquals(emptyList<StrapReadiness>(), ReadinessCodec.parseScores("0902".hexToBytes() + byteArrayOf(0)))
        assertNull(ReadinessCodec.parseScores("0d0000".hexToBytes()))
        assertArrayEquals("0846d9aa6a".hexToBytes(), ReadinessCodec.scoreRequest(0x6aaad946))
    }
}
