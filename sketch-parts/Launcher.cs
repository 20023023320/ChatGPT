using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

internal static class Launcher
{
    [STAThread]
    static void Main()
    {
        try
        {
            string root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "TuSuo");
            string app = Path.Combine(root, "app");
            string edge = null;
            foreach (var folder in new[] { Environment.SpecialFolder.ProgramFilesX86, Environment.SpecialFolder.ProgramFiles, Environment.SpecialFolder.LocalApplicationData })
            {
                string candidate = Path.Combine(Environment.GetFolderPath(folder), @"Microsoft\Edge\Application\msedge.exe");
                if (File.Exists(candidate)) { edge = candidate; break; }
            }
            if (edge == null) throw new InvalidOperationException("请先安装 Microsoft Edge。");
            using (var gate = new Mutex(false, @"Local\TuSuoExtract"))
            {
                try { gate.WaitOne(); } catch (AbandonedMutexException) { }
                try
                {
                    Directory.CreateDirectory(app);
                    var assembly = Assembly.GetExecutingAssembly();
                    string version = assembly.ManifestModule.ModuleVersionId.ToString();
                    string marker = Path.Combine(root, "version");
                    if (!File.Exists(marker) || File.ReadAllText(marker) != version)
                    {
                        using (var zip = new ZipArchive(assembly.GetManifestResourceStream("app.zip")))
                        foreach (var entry in zip.Entries)
                        {
                            string target = Path.Combine(app, entry.FullName);
                            Directory.CreateDirectory(Path.GetDirectoryName(target));
                            entry.ExtractToFile(target, true);
                        }
                        File.WriteAllText(marker, version);
                    }
                }
                finally { gate.ReleaseMutex(); }
            }
            Process.Start(edge, "--no-first-run --user-data-dir=\"" + Path.Combine(root,"profile") + "\" --app=\"" + new Uri(Path.Combine(app,"index.html")).AbsoluteUri + "\"");
        }
        catch (Exception error) { MessageBox.Show(error.Message, "图索"); }
    }
}
