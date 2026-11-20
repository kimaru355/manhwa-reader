import { NativeModule, requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

declare class AppInstallerModule extends NativeModule {
  readonly supports64Bit: boolean;
  canInstall(): boolean;
  openInstallSettings(): void;
  install(fileUri: string): void;
}

/**
 * The app's own native module (modules/app-installer). Missing in builds made before it was added (1.9.0) and
 * off Android; then updates are fetched from the website instead.
 */
export const appInstaller = Platform.OS === 'android' ? requireOptionalNativeModule<AppInstallerModule>('AppInstaller') : null;
