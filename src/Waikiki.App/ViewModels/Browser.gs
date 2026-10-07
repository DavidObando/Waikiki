package Waikiki.App.ViewModels

import System.Diagnostics

class Browser {
    shared {
        /// Opens a URL in the default browser.
        func Open(url string) {
            Process.Start(ProcessStartInfo{FileName: url, UseShellExecute: true})
        }
    }
}
