package com.apex.athlete.ui.exportdelete

import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.apex.athlete.core.data.export.DeletionOutcome
import com.apex.athlete.core.data.export.DeletionReport
import com.apex.athlete.core.data.export.DeletionStep
import com.apex.athlete.core.data.export.DemoStoreRefusedException
import com.apex.athlete.core.data.export.ExportCounts
import com.apex.athlete.core.data.export.ExportReport
import com.apex.athlete.core.data.export.ImportReport
import com.apex.athlete.core.data.export.ImportStatus
import com.apex.athlete.core.data.model.IngestCounts
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.flow.flowOf
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(AndroidJUnit4::class)
// A plain Application: the real one starts the encrypted store, which has no native library on the JVM.
@Config(sdk = [35], application = android.app.Application::class)
class ExportDeleteViewModelTest {
    private val dispatcher = UnconfinedTestDispatcher()
    private val uri: Uri = Uri.parse("content://test/apex-export.json")

    @Before fun setUp() { kotlinx.coroutines.Dispatchers.setMain(dispatcher) }
    @After fun tearDown() { kotlinx.coroutines.Dispatchers.resetMain() }

    private val counts = ExportCounts(daily = 3, heartRateMinutes = 10, workouts = 1)
    private fun importReport(status: ImportStatus = ImportStatus.COMPLETED) = ImportReport(
        status, 1, ExportCounts(), IngestCounts(dailyWritten = 3), emptyMap(), 2, null,
    )

    private fun vm(
        demo: Boolean = false,
        output: (Uri) -> OutputStream? = { ByteArrayOutputStream() },
        input: (Uri) -> InputStream? = { ByteArrayInputStream(ByteArray(0)) },
        json: suspend (OutputStream) -> ExportReport = { ExportReport(counts, ExportReport.Format.JSON) },
        csv: suspend (OutputStream) -> ExportReport = { ExportReport(counts, ExportReport.Format.CSV_ZIP) },
        importer: suspend (InputStream, (Long) -> Unit) -> ImportReport = { _, _ -> importReport() },
        delete: suspend () -> DeletionReport = { DeletionReport(emptyList()) },
        deleteScope: TestScope = TestScope(dispatcher),
        handle: SavedStateHandle = SavedStateHandle(),
    ) = ExportDeleteViewModel(handle, flowOf(demo), output, input, json, csv, importer, delete, deleteScope, dispatcher)

    @Test fun exportGoesIdleRunningDone() = runTest {
        val gate = CompletableDeferred<Unit>()
        val v = vm(json = { gate.await(); ExportReport(counts, ExportReport.Format.JSON) })
        assertEquals(OperationState.Idle, v.export.value)
        v.exportTo(uri, csvZip = false)
        assertIs<OperationState.Running>(v.export.value)
        gate.complete(Unit)
        val done = assertIs<OperationState.Done<ExportResult>>(v.export.value)
        assertEquals(ExportReport.Format.JSON, done.result.format)
        assertEquals(counts, done.result.counts)
        v.clearExport()
        assertEquals(OperationState.Idle, v.export.value)
    }

    @Test fun csvChoiceUsesTheZipWriter() = runTest {
        val v = vm()
        v.exportTo(uri, csvZip = true)
        assertEquals(ExportReport.Format.CSV_ZIP, assertIs<OperationState.Done<ExportResult>>(v.export.value).result.format)
    }

    @Test fun exportFailuresAreMappedWithoutMessages() = runTest {
        val noStream = vm(output = { null }); noStream.exportTo(uri, false)
        assertEquals(OperationState.Failed(OperationFailure.CANNOT_OPEN), noStream.export.value)

        val demoThrown = vm(json = { throw DemoStoreRefusedException() }); demoThrown.exportTo(uri, false)
        assertEquals(OperationState.Failed(OperationFailure.DEMO), demoThrown.export.value)

        val broken = vm(json = { throw IOException("/secret/path") }); broken.exportTo(uri, false)
        assertEquals(OperationState.Failed(OperationFailure.IO), broken.export.value)
    }

    @Test fun demoModeRefusesExportAndImportWithoutCallingTheEngines() = runTest {
        var called = false
        val v = vm(demo = true, json = { called = true; ExportReport(counts, ExportReport.Format.JSON) }, importer = { _, _ -> called = true; importReport() })
        v.exportTo(uri, false); v.importFrom(uri)
        assertEquals(OperationState.Failed(OperationFailure.DEMO), v.export.value)
        assertEquals(OperationState.Failed(OperationFailure.DEMO), v.importState.value)
        assertFalse(called)
    }

    @Test fun importReportsProgressThenResult() = runTest {
        val gate = CompletableDeferred<Unit>()
        val v = vm(importer = { _, progress -> progress(5_000); gate.await(); importReport(ImportStatus.PARTIAL) })
        v.importFrom(uri)
        assertEquals(OperationState.Running(5_000), v.importState.value)
        gate.complete(Unit)
        assertEquals(ImportStatus.PARTIAL, assertIs<OperationState.Done<ImportReport>>(v.importState.value).result.status)
    }

    @Test fun secondImportWhileRunningIsIgnored() = runTest {
        val gate = CompletableDeferred<Unit>()
        var calls = 0
        val v = vm(importer = { _, _ -> calls++; gate.await(); importReport() })
        v.importFrom(uri); v.importFrom(uri)
        assertEquals(1, calls)
        gate.complete(Unit)
    }

    @Test fun deleteNeedsTwoStepsAndTheTypedWord() = runTest {
        var ran = 0
        val v = vm(delete = { ran++; DeletionReport(emptyList()) })
        assertFalse(v.confirmDelete()) // idle
        v.startDelete()
        assertEquals(DeleteState.ConfirmFirst, v.delete.value)
        assertFalse(v.confirmDelete()) // step 1 cannot delete
        v.continueDelete()
        assertEquals(DeleteState.ConfirmTyped(""), v.delete.value)
        v.typeDeleteWord("delete")
        assertFalse(v.confirmDelete())
        v.typeDeleteWord("DELET")
        assertFalse(v.confirmDelete())
        assertEquals(0, ran)
        v.typeDeleteWord("DELETE")
        assertTrue(v.confirmDelete())
        assertEquals(1, ran)
    }

    @Test fun cancelReturnsToIdleFromEitherStep() = runTest {
        val v = vm()
        v.startDelete(); v.cancelDelete()
        assertEquals(DeleteState.Idle, v.delete.value)
        v.startDelete(); v.continueDelete(); v.typeDeleteWord("DELETE"); v.cancelDelete()
        assertEquals(DeleteState.Idle, v.delete.value)
        v.startDelete(); v.continueDelete()
        assertEquals(DeleteState.ConfirmTyped(""), v.delete.value) // typed text was reset
    }

    @Test fun deleteRunsInTheGivenScopeAndReportsFailedStepsOnly() = runTest {
        val scope = TestScope(StandardTestDispatcher())
        val report = DeletionReport(listOf(
            DeletionOutcome(DeletionStep.CANCEL_BACKGROUND_WORK, true),
            DeletionOutcome(DeletionStep.REVOKE_GOOGLE_ACCESS, false, "IOException"),
        ))
        val v = vm(delete = { report }, deleteScope = scope)
        v.startDelete(); v.continueDelete(); v.typeDeleteWord("  DELETE ")
        assertTrue(v.confirmDelete())
        assertEquals(DeleteState.Running, v.delete.value)
        scope.testScheduler.advanceUntilIdle()
        assertEquals(DeleteState.Done(listOf(DeletionStep.REVOKE_GOOGLE_ACCESS)), v.delete.value)
        v.dismissDeleteReport()
        assertEquals(DeleteState.Idle, v.delete.value)
    }

    @Test fun confirmationStepSurvivesProcessDeath() = runTest {
        val handle = SavedStateHandle()
        val first = vm(handle = handle)
        first.startDelete(); first.continueDelete(); first.typeDeleteWord("DEL")
        val restored = vm(handle = handle)
        assertEquals(DeleteState.ConfirmTyped("DEL"), restored.delete.value)
    }

    @Test fun confirmWordRule() {
        assertTrue(isDeleteConfirmed("DELETE"))
        assertTrue(isDeleteConfirmed(" DELETE\n"))
        assertFalse(isDeleteConfirmed("delete"))
        assertFalse(isDeleteConfirmed(""))
        assertFalse(isDeleteConfirmed("DELETE ALL"))
    }

    @Test fun everyImportStatusHasItsOwnCopy() {
        val copies = ImportStatus.entries.map { importStatusCopy(it) }
        assertEquals(ImportStatus.entries.size, copies.map { it.title }.toSet().size)
        assertEquals(ImportStatus.entries.size, copies.map { it.body }.toSet().size)
        assertTrue(importStatusCopy(ImportStatus.COMPLETED).imported)
        assertTrue(importStatusCopy(ImportStatus.PARTIAL).imported)
        assertFalse(importStatusCopy(ImportStatus.NOT_AN_EXPORT).imported)
        assertFalse(importStatusCopy(ImportStatus.NEWER_VERSION).imported)
    }

    @Test fun everyDeletionStepHasAName() {
        assertEquals(DeletionStep.entries.size, DeletionStep.entries.map { stepName(it) }.toSet().size)
    }

    @Test fun importSummaryTakesTheReportFigures() {
        val s = importReport().summary()
        assertEquals(ImportSummary(ingested = 3, quarantined = 0, computedSkipped = 0, replayedDays = 2), s)
    }
}
