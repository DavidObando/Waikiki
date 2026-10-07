package Waikiki.Core

import System
import System.IO

class AppPaths {
    shared {
        /// Per-user application data directory (`~/Library/Application Support/Waikiki`, `%APPDATA%\Waikiki`, `~/.config/Waikiki`).
        func AppData() string -> Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Waikiki")

        func SettingsFile(appData string) string -> Path.Combine(appData, "settings.json")

        func JobsDirectory(appData string) string -> Path.Combine(appData, "jobs")
    }
}
