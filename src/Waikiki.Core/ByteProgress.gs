package Waikiki.Core

import System

/// Reports cumulative bytes to a handler synchronously on the reporting thread. Unlike System.Progress it
/// never defers or reorders callbacks, so a value computed at report time cannot arrive after a later one.
/// (Non-generic on purpose: G# does not yet substitute T in a generic constructor's lambda parameter, gsharp#4838.)
class ByteProgress : IProgress[int64] {
    private let handler (int64) -> void

    init(handler (int64) -> void) {
        this.handler = handler
    }

    func Report(value int64) {
        handler(value)
    }
}
