using System;
using System.Diagnostics;

internal static class NgtTestPreviewLauncher
{
    [STAThread]
    private static void Main()
    {
        Process.Start(new ProcessStartInfo
        {
            FileName = "http://127.0.0.1:3236/",
            UseShellExecute = true,
        });
    }
}
