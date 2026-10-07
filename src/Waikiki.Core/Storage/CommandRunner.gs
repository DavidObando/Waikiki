package Waikiki.Core.Storage

import System
import System.Diagnostics
import System.Text
import System.Threading
import System.Threading.Tasks

data class CommandResult {
    init(exitCode int32, stdout string, stderr string) {
        ExitCode = exitCode
        Stdout = stdout
        Stderr = stderr
    }

    prop ExitCode int32 {
        get;
        init;
    }

    prop Stdout string {
        get;
        init;
    }

    prop Stderr string {
        get;
        init;
    }
}

/// Runs a command-line tool. Secrets are passed on stdin so they never appear in the process list.
interface ICommandRunner {
    func RunAsync(fileName string, args []string, stdin string?, cancellationToken CancellationToken) Task[CommandResult];
}

class ProcessCommandRunner : ICommandRunner {
    async func RunAsync(fileName string, args []string, stdin string?, cancellationToken CancellationToken) CommandResult {
        let info = ProcessStartInfo{
            FileName: fileName,
            RedirectStandardInput: stdin != nil,
            RedirectStandardOutput: true,
            RedirectStandardError: true,
            UseShellExecute: false,
            CreateNoWindow: true
        }
        for a in args {
            info.ArgumentList.Add(a)
        }
        using let process = Process()
        process.StartInfo = info
        process.Start()
        let outTask = process.StandardOutput.ReadToEndAsync(cancellationToken)
        let errTask = process.StandardError.ReadToEndAsync(cancellationToken)
        if let input = stdin {
            await process.StandardInput.WriteAsync(input)
            process.StandardInput.Close()
        }
        await process.WaitForExitAsync(cancellationToken)
        return CommandResult(process.ExitCode, await outTask, await errTask)
    }
}
