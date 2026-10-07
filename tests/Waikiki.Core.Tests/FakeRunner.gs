package Waikiki.Core.Tests

import System
import System.Collections.Generic
import System.Threading
import System.Threading.Tasks
import Waikiki.Core.Storage

data class RunnerCall {
    init(fileName string, args []string, stdin string?) {
        FileName = fileName
        Args = args
        Stdin = stdin
    }

    prop FileName string {
        get;
        init;
    }

    prop Args []string {
        get;
        init;
    }

    prop Stdin string? {
        get;
        init;
    }
}

class FakeRunner : ICommandRunner {
    private let results Queue[CommandResult] = Queue[CommandResult]()

    prop Calls List[RunnerCall] {
        get;
        init;
    }

    init() {
        Calls = List[RunnerCall]()
    }

    func Enqueue(exitCode int32, stdout string, stderr string) {
        results.Enqueue(CommandResult(exitCode, stdout, stderr))
    }

    func RunAsync(fileName string, args []string, stdin string?, cancellationToken CancellationToken) Task[CommandResult] {
        Calls.Add(RunnerCall(fileName, args, stdin))
        if results.Count == 0 {
            return Task.FromResult(CommandResult(0, "", ""))
        }
        return Task.FromResult(results.Dequeue())
    }
}
