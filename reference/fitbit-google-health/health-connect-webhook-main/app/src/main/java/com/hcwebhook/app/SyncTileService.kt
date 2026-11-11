package com.hcwebhook.app

import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

/** Quick Settings tile that starts a sync. */
class SyncTileService : TileService() {

    override fun onStartListening() {
        super.onStartListening()
        render(SyncStatusText.lastSync(this))
    }

    override fun onClick() {
        super.onClick()
        val started = SyncTrigger.request(this, "tile")
        render(getString(if (started) R.string.trigger_sync_started else R.string.trigger_try_again))
    }

    private fun render(subtitle: String?) {
        val tile = qsTile ?: return
        tile.label = getString(R.string.trigger_tile_label)
        tile.state = Tile.STATE_INACTIVE
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) tile.subtitle = subtitle
        tile.updateTile()
    }
}
