package Waikiki.Yoto

import System
import System.Threading.Tasks

class MemoryTokenStore : ITokenStore {
    private var current TokenSet? = nil

    func LoadAsync() Task[TokenSet?] -> Task.FromResult[TokenSet?](current)

    func SaveAsync(tokens TokenSet) Task {
        current = tokens
        return Task.CompletedTask
    }

    func ClearAsync() Task {
        current = nil
        return Task.CompletedTask
    }
}
