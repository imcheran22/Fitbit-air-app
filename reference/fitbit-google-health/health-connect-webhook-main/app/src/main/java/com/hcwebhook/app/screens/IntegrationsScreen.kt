package com.hcwebhook.app.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Lan
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.hcwebhook.app.PreferencesManager
import com.hcwebhook.app.R
import com.hcwebhook.app.ui.Group
import com.hcwebhook.app.ui.Notice
import com.hcwebhook.app.ui.SettingRow
import com.hcwebhook.app.ui.SupportingText
import com.hcwebhook.app.ui.SwitchRow

/** Every way out of the app other than webhooks: the local HTTP server and the MCP server. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IntegrationsScreen(onBack: () -> Unit, onOpenLocalHttpSettings: () -> Unit) {
    val context = LocalContext.current
    val prefs = remember { PreferencesManager(context) }
    val serverOn = remember { prefs.isLocalTcpEnabled() }
    val port = remember { prefs.getLocalTcpPort() }
    var mcpOn by remember { mutableStateOf(prefs.isMcpEnabled()) }
    var mcpSync by remember { mutableStateOf(prefs.isMcpSyncAllowed()) }
    val mcpUrl = remember { "http://${getLocalIpAddress(context)}:$port/mcp" }

    // MainActivity already pads the system bars, so this screen adds no insets of its own.
    Scaffold(
        contentWindowInsets = WindowInsets(0.dp),
        topBar = {
            TopAppBar(
                windowInsets = WindowInsets(0.dp),
                title = { Text(stringResource(R.string.integrations_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.action_back))
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp)
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            Group(title = stringResource(R.string.about_local_http_title)) {
                item {
                    SettingRow(
                        icon = Icons.Filled.Lan,
                        title = stringResource(R.string.about_local_http_title),
                        summary = if (serverOn) stringResource(R.string.settings_local_http_on, port) else stringResource(R.string.settings_local_http_off),
                        chevron = true,
                        onClick = onOpenLocalHttpSettings,
                    )
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Group(title = stringResource(R.string.mcp_title)) {
                    item {
                        SwitchRow(
                            icon = Icons.Filled.Psychology,
                            title = stringResource(R.string.mcp_title),
                            summary = stringResource(R.string.mcp_desc),
                            checked = mcpOn,
                            onChange = {
                                mcpOn = it
                                prefs.setMcpEnabled(it)
                            },
                        )
                    }
                    if (mcpOn) {
                        item {
                            SettingRow(
                                title = stringResource(R.string.mcp_address),
                                summary = mcpUrl,
                                trailing = { Icon(Icons.Filled.ContentCopy, null) },
                                onClick = { copy(context, mcpUrl) },
                            )
                        }
                        item {
                            SettingRow(
                                title = stringResource(R.string.mcp_copy_setup),
                                summary = stringResource(R.string.mcp_copy_setup_desc),
                                trailing = { Icon(Icons.Filled.ContentCopy, null) },
                                onClick = { copy(context, setupJson(mcpUrl, prefs.getLocalHttpToken())) },
                            )
                        }
                        item {
                            SwitchRow(
                                icon = Icons.Filled.Sync,
                                title = stringResource(R.string.mcp_allow_sync_title),
                                summary = stringResource(R.string.mcp_allow_sync_desc),
                                checked = mcpSync,
                                onChange = {
                                    mcpSync = it
                                    prefs.setMcpSyncAllowed(it)
                                },
                            )
                        }
                    }
                }
                if (mcpOn && !serverOn) {
                    Notice(
                        icon = Icons.Filled.Lan,
                        title = stringResource(R.string.mcp_needs_server),
                        action = stringResource(R.string.mcp_open_server),
                        onAction = onOpenLocalHttpSettings,
                    )
                }
                if (mcpOn) SupportingText(stringResource(R.string.mcp_token_note))
            }
        }
    }
}

/** The client config for Claude, Cursor and other MCP clients that connect over HTTP. */
private fun setupJson(url: String, token: String) = """
{
  "mcpServers": {
    "hc-webhook": {
      "type": "http",
      "url": "$url",
      "headers": { "Authorization": "Bearer $token" }
    }
  }
}
""".trimIndent()

private fun copy(context: Context, text: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData.newPlainText("HC Webhook", text))
    Toast.makeText(context, R.string.mcp_copied, Toast.LENGTH_SHORT).show()
}
