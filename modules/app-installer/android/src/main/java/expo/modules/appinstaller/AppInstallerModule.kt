package expo.modules.appinstaller

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Installs app updates the app downloaded itself: picks which APK the phone needs, checks and asks for the
 * "install unknown apps" permission, and hands the APK to the system package installer.
 */
class AppInstallerModule : Module() {
  private val context
    get() = appContext.reactContext?.applicationContext ?: throw CodedException("ERR_NO_CONTEXT", "App not ready", null)

  override fun definition() = ModuleDefinition {
    Name("AppInstaller")

    /** True when the phone runs 64-bit apps (gets the standard APK); false for 32-bit-only phones. */
    Constant("supports64Bit") { Build.SUPPORTED_64_BIT_ABIS.isNotEmpty() }

    /** Whether the user has allowed this app to install apps. Always true before Android 8. */
    Function("canInstall") {
      Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.packageManager.canRequestPackageInstalls()
    }

    /** Opens this app's "Install unknown apps" switch in system settings. */
    Function("openInstallSettings") {
      val ctx = context
      val intent =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${ctx.packageName}"))
        } else {
          Intent(Settings.ACTION_SECURITY_SETTINGS)
        }
      start(intent)
    }

    /** Opens the package installer for an APK in the app's files/updates/ folder (a file:// URI or path). */
    Function("install") { fileUri: String ->
      val ctx = context
      val file = File(Uri.parse(fileUri).path ?: fileUri)
      if (!file.exists()) throw CodedException("ERR_NO_FILE", "The downloaded update is missing", null)
      val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.appinstaller", file)
      val intent =
        Intent(Intent.ACTION_VIEW)
          .setDataAndType(uri, "application/vnd.android.package-archive")
          .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      start(intent)
    }
  }

  private fun start(intent: Intent) {
    val activity = appContext.currentActivity
    if (activity != null) {
      activity.startActivity(intent)
    } else {
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }
}
