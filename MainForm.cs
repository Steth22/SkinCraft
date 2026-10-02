using System.Reflection;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace SkinCraft;

public sealed class MainForm : Form
{
    const string Origin = "https://skincraft.app/";

    readonly WebView2 web = new() { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.FromArgb(10, 11, 20) };
    readonly SkinStore store = new();
    readonly Bridge bridge;
    readonly Dictionary<string, string> resources;
    bool closing;

    public MainForm()
    {
        Text = "SkinCraft";
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        BackColor = Color.FromArgb(10, 11, 20);
        StartPosition = FormStartPosition.CenterScreen;
        var area = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1600, 900);
        ClientSize = new Size(Math.Min(1500, (int)(area.Width * 0.9)), Math.Min(920, (int)(area.Height * 0.9)));
        MinimumSize = new Size(1100, 720);
        Controls.Add(web);

        bridge = new Bridge(this, store);
        resources = Assembly.GetExecutingAssembly().GetManifestResourceNames()
            .Where(n => n.StartsWith("www/"))
            .ToDictionary(n => n[4..].Replace('\\', '/'), n => n, StringComparer.OrdinalIgnoreCase);

        Load += async (_, _) => await InitAsync();
        // WebView2 doesn't take keyboard focus back on its own when the window is re-activated.
        Activated += (_, _) => { if (web.CoreWebView2 != null) web.Focus(); };
    }

    async Task InitAsync()
    {
        try
        {
            CoreWebView2Environment.GetAvailableBrowserVersionString();
        }
        catch (WebView2RuntimeNotFoundException)
        {
            const string url = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";
            var answer = MessageBox.Show(this,
                "SkinCraft needs Microsoft Edge WebView2, which is missing on this PC.\n\nOpen the official Microsoft download page now? Install it, then start SkinCraft again.",
                "SkinCraft", MessageBoxButtons.YesNo, MessageBoxIcon.Information);
            if (answer == DialogResult.Yes)
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(url) { UseShellExecute = true });
            Close();
            return;
        }

        var dataDir = Path.Combine(store.Root, "WebView2");
#if DEBUG
        dataDir = Environment.GetEnvironmentVariable("SKINCRAFT_WEBVIEW_DIR") ?? dataDir;
#endif
        var env = await CoreWebView2Environment.CreateAsync(null, dataDir);
        await web.EnsureCoreWebView2Async(env);
        var core = web.CoreWebView2;
        core.Settings.AreDefaultContextMenusEnabled = false;
        core.Settings.IsZoomControlEnabled = false;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.IsPinchZoomEnabled = false;
#if !DEBUG
        core.Settings.AreDevToolsEnabled = false;
        core.Settings.AreBrowserAcceleratorKeysEnabled = false;
#endif
        core.AddWebResourceRequestedFilter(Origin + "*", CoreWebView2WebResourceContext.All);
        core.WebResourceRequested += OnResourceRequested;
        core.NewWindowRequested += (_, e) => e.Handled = true;
        core.WebMessageReceived += async (_, e) =>
        {
            var reply = await bridge.HandleAsync(e.TryGetWebMessageAsString());
            core.PostWebMessageAsString(reply);
        };
        core.Navigate(Origin + "index.html");
    }

    void OnResourceRequested(object? sender, CoreWebView2WebResourceRequestedEventArgs e)
    {
        var env = web.CoreWebView2.Environment;
        var path = Uri.UnescapeDataString(new Uri(e.Request.Uri).AbsolutePath.TrimStart('/'));
        if (path.Length == 0) path = "index.html";
        if (!resources.TryGetValue(path, out var name))
        {
            e.Response = env.CreateWebResourceResponse(null, 404, "Not Found", "");
            return;
        }
        var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(name)!;
        e.Response = env.CreateWebResourceResponse(stream, 200, "OK", $"Content-Type: {Mime(path)}\r\nCache-Control: no-cache");
    }

    static string Mime(string path) => Path.GetExtension(path).ToLowerInvariant() switch
    {
        ".html" => "text/html; charset=utf-8",
        ".js" => "text/javascript; charset=utf-8",
        ".css" => "text/css; charset=utf-8",
        ".woff2" => "font/woff2",
        ".ttf" => "font/ttf",
        ".txt" => "text/plain; charset=utf-8",
        ".png" => "image/png",
        ".svg" => "image/svg+xml",
        ".json" => "application/json",
        _ => "application/octet-stream",
    };

    protected override async void OnFormClosing(FormClosingEventArgs e)
    {
        if (closing || web.CoreWebView2 == null) { base.OnFormClosing(e); return; }
        e.Cancel = true;
        closing = true;
        try
        {
            await web.CoreWebView2.ExecuteScriptAsync("window.__flush && window.__flush()");
            await Task.Delay(350);
        }
        catch { }
        Close();
    }
}
