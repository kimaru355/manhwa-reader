package expo.modules.readaloudmedia

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference

/**
 * Media controls for the novel reader's read aloud: a notification (also shown on the lock screen) with
 * previous / play-pause / next, backed by a media session so headset buttons work too. The speech itself is
 * done in JS with expo-speech; this keeps the app running with the screen off and reports button presses.
 */
class ReadAloudMediaModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ReadAloudMedia")

    /** `{ action: "play" | "pause" | "next" | "prev" | "stop" }` */
    Events("onAction")

    OnCreate {
      current = WeakReference(this@ReadAloudMediaModule)
    }

    OnDestroy {
      if (current?.get() === this@ReadAloudMediaModule) current = null
    }

    /** Shows the notification, or updates it if it is already showing. */
    Function("show") { title: String, text: String, playing: Boolean ->
      val context = appContext.reactContext?.applicationContext ?: return@Function
      ReadAloudService.show(context, title, text, playing)
    }

    /** Removes the notification and lets the app sleep again. */
    Function("hide") {
      ReadAloudService.hide()
    }
  }

  companion object {
    private var current: WeakReference<ReadAloudMediaModule>? = null

    /** Passes a button press to JS. */
    fun emit(action: String) {
      current?.get()?.sendEvent("onAction", mapOf("action" to action))
    }
  }
}
