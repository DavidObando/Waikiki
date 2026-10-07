package Waikiki.App

import Avalonia
import System
import System.IO
import Waikiki.Core
import Waikiki.Core.Storage

internal class Program {
    shared {
        @STAThread
        func Main(args[]string) int32 {
            if Array.IndexOf(args, "--smoke-test") >= 0 {
                return RunSmokeTest()
            }
            return BuildAvaloniaApp().StartWithClassicDesktopLifetime(args)
        }

        func BuildAvaloniaApp() AppBuilder -> AppBuilder
            .Configure[App]()
            .UsePlatformDetect()
            .WithInterFont()!!.LogToTrace()

        /// Exercises the non-UI startup path (settings, token store selection) in a throwaway directory.
        private func RunSmokeTest() int32 {
            let directory = Path.Combine(Path.GetTempPath(), "waikiki-app-smoke-" + Guid.NewGuid().ToString("N"))
            try {
                let settings = AppSettingsStore(AppPaths.SettingsFile(directory)).LoadAsync().GetAwaiter().GetResult()
                let choice = TokenStoreFactory.CreateAsync(directory, ProcessCommandRunner()).GetAwaiter().GetResult()
                Console.WriteLine("store: ${choice.Description}")
                return if settings.ClientId == nil { 0 } else { 1 }
            } finally {
                if Directory.Exists(directory) {
                    Directory.Delete(directory, true)
                }
            }
        }
    }
}
