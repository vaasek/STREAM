package local.streamon

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class ScreenService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            (application as App).engine?.stopScreen()
            if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE) else @Suppress("DEPRECATION") stopForeground(true)
            stopSelf()
            return START_NOT_STICKY
        }
        startAsForeground()
        val result = intent?.getIntExtra(EXTRA_RESULT, 0) ?: 0
        val data = readData(intent)
        if (result != 0 && data != null) (application as App).engine?.startScreen(result, data)
        return START_NOT_STICKY
    }

    private fun startAsForeground() {
        val notification = notification()
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTE_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        } else {
            startForeground(NOTE_ID, notification)
        }
    }

    private fun notification(): Notification {
        if (Build.VERSION.SDK_INT >= 26) {
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL, getString(R.string.channel_name), NotificationManager.IMPORTANCE_LOW),
            )
        }
        val code = (application as App).engine?.roomCode.orEmpty()
        val open = PendingIntent.getActivity(
            this,
            1,
            Intent(this, WallActivity::class.java).putExtra(WallActivity.EXTRA_CODE, code),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val stop = PendingIntent.getService(
            this,
            2,
            Intent(this, ScreenService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_cast)
            .setContentTitle("Экран транслируется")
            .setContentText("Комната $code")
            .setContentIntent(open)
            .addAction(0, "Остановить", stop)
            .setOngoing(true)
            .build()
    }

    private fun readData(intent: Intent?): Intent? {
        if (intent == null) return null
        return if (Build.VERSION.SDK_INT >= 33) {
            intent.getParcelableExtra(EXTRA_DATA, Intent::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(EXTRA_DATA)
        }
    }

    companion object {
        const val EXTRA_RESULT = "result"
        const val EXTRA_DATA = "data"
        const val ACTION_STOP = "local.streamon.STOP"
        private const val CHANNEL = "screen"
        private const val NOTE_ID = 7
    }
}
