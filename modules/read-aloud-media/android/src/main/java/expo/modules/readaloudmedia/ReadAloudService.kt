package expo.modules.readaloudmedia

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.media.AudioManager
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log

/**
 * A "media playback" foreground service: while it runs Android keeps the app alive with the screen off (and a
 * partial wake lock keeps the CPU awake between sentences while playing). It shows the media notification and
 * owns the media session, and reports every control press to JS through [ReadAloudMediaModule.emit].
 */
class ReadAloudService : Service() {
  private data class State(val visible: Boolean, val title: String, val text: String, val playing: Boolean)

  companion object {
    private const val TAG = "ReadAloudMedia"
    private const val CHANNEL = "read_aloud"
    private const val NOTIFICATION_ID = 7341
    private const val ACTION_PREV = "expo.modules.readaloudmedia.PREV"
    private const val ACTION_PLAY = "expo.modules.readaloudmedia.PLAY"
    private const val ACTION_PAUSE = "expo.modules.readaloudmedia.PAUSE"
    private const val ACTION_NEXT = "expo.modules.readaloudmedia.NEXT"
    private const val ACTION_STOP = "expo.modules.readaloudmedia.STOP"
    private const val WAKE_TIMEOUT_MS = 3L * 60 * 60 * 1000

    private val main = Handler(Looper.getMainLooper())

    /** What the notification should show; read by the service once it is running. Main thread only. */
    private var state = State(false, "", "", false)
    private var instance: ReadAloudService? = null

    fun show(context: Context, title: String, text: String, playing: Boolean) {
      main.post {
        state = State(true, title, text, playing)
        val running = instance
        if (running != null) {
          running.render()
          return@post
        }
        try {
          val intent = Intent(context, ReadAloudService::class.java)
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
        } catch (e: Exception) {
          // Android refuses to start it while the app is in the background; reading goes on without controls.
          Log.w(TAG, "Couldn't start the read aloud service", e)
        }
      }
    }

    fun hide() {
      main.post {
        state = state.copy(visible = false, playing = false)
        instance?.finish()
      }
    }
  }

  private var session: MediaSession? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var inForeground = false

  /** Headphones unplugged or Bluetooth disconnected: pause, as music players do. */
  private val noisy = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      if (intent?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY && state.playing) ReadAloudMediaModule.emit("pause")
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(CHANNEL, "Read aloud", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Controls for listening to a novel chapter"
        setShowBadge(false)
      }
      getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
    session = MediaSession(this, "ReadAloud").apply {
      setCallback(object : MediaSession.Callback() {
        override fun onPlay() = ReadAloudMediaModule.emit("play")
        override fun onPause() = ReadAloudMediaModule.emit("pause")
        override fun onSkipToNext() = ReadAloudMediaModule.emit("next")
        override fun onSkipToPrevious() = ReadAloudMediaModule.emit("prev")
        override fun onStop() = ReadAloudMediaModule.emit("stop")
      })
      isActive = true
    }
    wakeLock = (getSystemService(Context.POWER_SERVICE) as PowerManager)
      .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "manhwareader:readaloud")
      .apply { setReferenceCounted(false) }
    val filter = IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) registerReceiver(noisy, filter, Context.RECEIVER_NOT_EXPORTED)
    else registerReceiver(noisy, filter)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // A service started with startForegroundService must go to the foreground straight away.
    try {
      val notification = build()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
      inForeground = true
    } catch (e: Exception) {
      Log.w(TAG, "Couldn't show the read aloud controls", e)
      stopSelf()
      return START_NOT_STICKY
    }
    when (intent?.action) {
      ACTION_PREV -> ReadAloudMediaModule.emit("prev")
      ACTION_PLAY -> ReadAloudMediaModule.emit("play")
      ACTION_PAUSE -> ReadAloudMediaModule.emit("pause")
      ACTION_NEXT -> ReadAloudMediaModule.emit("next")
      ACTION_STOP -> ReadAloudMediaModule.emit("stop")
    }
    if (!state.visible) finish() else render()
    return START_NOT_STICKY
  }

  /** The app was swiped away from recent apps: stop reading rather than leave the controls behind. */
  override fun onTaskRemoved(rootIntent: Intent?) {
    ReadAloudMediaModule.emit("stop")
    state = state.copy(visible = false, playing = false)
    finish()
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    if (instance === this) instance = null
    releaseWakeLock()
    try {
      unregisterReceiver(noisy)
    } catch (_: Exception) {
    }
    session?.release()
    session = null
    super.onDestroy()
  }

  private fun finish() {
    releaseWakeLock()
    if (inForeground) {
      stopForeground(STOP_FOREGROUND_REMOVE)
      inForeground = false
    }
    stopSelf()
  }

  private fun releaseWakeLock() {
    wakeLock?.let { if (it.isHeld) it.release() }
  }

  /** Brings the media session, the wake lock and the notification in line with [state]. */
  fun render() {
    val s = state
    session?.setMetadata(
      MediaMetadata.Builder()
        .putString(MediaMetadata.METADATA_KEY_TITLE, s.title)
        .putString(MediaMetadata.METADATA_KEY_ARTIST, s.text)
        .build(),
    )
    session?.setPlaybackState(
      PlaybackState.Builder()
        .setActions(
          PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or PlaybackState.ACTION_PLAY_PAUSE or
            PlaybackState.ACTION_SKIP_TO_NEXT or PlaybackState.ACTION_SKIP_TO_PREVIOUS or PlaybackState.ACTION_STOP,
        )
        .setState(if (s.playing) PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1f)
        .build(),
    )
    if (s.playing) wakeLock?.acquire(WAKE_TIMEOUT_MS) else releaseWakeLock()
    if (inForeground) getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, build())
  }

  private fun actionIntent(action: String, code: Int): PendingIntent =
    PendingIntent.getService(
      this,
      code,
      Intent(this, ReadAloudService::class.java).setAction(action),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

  private fun action(icon: Int, label: String, action: String, code: Int) =
    Notification.Action.Builder(Icon.createWithResource(this, icon), label, actionIntent(action, code)).build()

  private fun build(): Notification {
    val s = state
    val open = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
    }
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CHANNEL) else Notification.Builder(this)
    builder
      .setSmallIcon(R.drawable.read_aloud_headphones)
      .setContentTitle(s.title.ifEmpty { "Read aloud" })
      .setContentText(s.text)
      .setShowWhen(false)
      .setOnlyAlertOnce(true)
      .setOngoing(s.playing)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setCategory(Notification.CATEGORY_TRANSPORT)
      .setDeleteIntent(actionIntent(ACTION_STOP, 5))
      .addAction(action(R.drawable.read_aloud_previous, "Previous", ACTION_PREV, 1))
      .addAction(
        if (s.playing) action(R.drawable.read_aloud_pause, "Pause", ACTION_PAUSE, 2)
        else action(R.drawable.read_aloud_play, "Play", ACTION_PLAY, 3),
      )
      .addAction(action(R.drawable.read_aloud_next, "Next", ACTION_NEXT, 4))
      .addAction(action(R.drawable.read_aloud_close, "Stop", ACTION_STOP, 5))
    if (open != null) {
      builder.setContentIntent(PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
    }
    session?.let {
      builder.setStyle(Notification.MediaStyle().setMediaSession(it.sessionToken).setShowActionsInCompactView(0, 1, 2))
    }
    return builder.build()
  }
}
