package Waikiki.Yoto

import System
import System.IO
import System.Threading.Tasks

/// Persists the current token set between runs.
interface ITokenStore {
    func LoadAsync() Task[TokenSet?];

    func SaveAsync(tokens TokenSet) Task;

    func ClearAsync() Task;
}
