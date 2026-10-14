/**
 * Capacitor 配置：把构建产物打包成安卓 / iOS 应用
 *
 * 本项目是纯前端 + PWA，Capacitor 能把它变成原生可安装应用：
 *   - Android：生成 Gradle 工程，产出 APK
 *   - iOS：生成 Xcode 工程，产出 IPA（需 macOS）
 *
 * 使用方式见 README「打包成手机 App」章节。
 */
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.notbemoji.app',
  appName: '不背单词 Lite',
  webDir: 'dist',
  // 词库分片通过相对路径加载，Capacitor 的本地服务器需要允许
  server: {
    androidScheme: 'https',
  },
  android: {
    // 中文界面
    allowMixedContent: false,
  },
  ios: {
    contentInset: 'always',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#3385f6',
    },
  },
}

export default config