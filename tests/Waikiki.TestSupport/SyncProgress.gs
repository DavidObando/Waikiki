package Waikiki.TestSupport

import System
import System.Collections.Concurrent
import System.Collections.Generic
import System.Linq

/// An IProgress that records reports synchronously and in order. System.Progress posts to the thread pool
/// when there is no synchronization context, so its callbacks can arrive late or out of order in tests.
class SyncProgress[T] : IProgress[T] {
    private let items ConcurrentQueue[T] = ConcurrentQueue[T]()

    func Report(value T) {
        items.Enqueue(value)
    }

    func ToList() List[T] -> items.ToList()
}
