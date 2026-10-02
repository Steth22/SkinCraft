using System.Diagnostics;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace SkinCraft;

public sealed partial class Bridge(Form owner, SkinStore store)
{
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    static readonly HttpClient Http = CreateHttp();

    static HttpClient CreateHttp()
    {
        var http = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
        http.DefaultRequestHeaders.UserAgent.ParseAdd("SkinCraft/1.0");
        return http;
    }

    [GeneratedRegex("^[A-Za-z0-9_]{1,16}$")]
    private static partial Regex UsernameRegex();

    public async Task<string> HandleAsync(string message)
    {
        int id = 0;
        try
        {
            using var doc = JsonDocument.Parse(message);
            var root = doc.RootElement;
            id = root.GetProperty("id").GetInt32();
            var method = root.GetProperty("method").GetString();
            var p = root.TryGetProperty("params", out var pp) ? pp : default;

            object? result = method switch
            {
                "list" => store.List(),
                "save" => store.Save(Str(p, "id"), Str(p, "name"), Str(p, "model"), Str(p, "png")),
                "rename" => store.Rename(Str(p, "id"), Str(p, "name")),
                "delete" => store.Delete(Str(p, "id")),
                "duplicate" => store.Duplicate(Str(p, "id")),
                "importFile" => ImportFile(),
                "exportFile" => ExportFile(Str(p, "name"), Str(p, "png")),
                "fetchPlayer" => await FetchPlayerAsync(Str(p, "name")),
                "openFolder" => OpenFolder(),
                _ => throw new InvalidOperationException("Unknown method: " + method),
            };
            return JsonSerializer.Serialize(new { id, ok = true, result }, Json);
        }
        catch (Exception ex)
        {
            return JsonSerializer.Serialize(new { id, ok = false, error = ex.Message }, Json);
        }
    }

    static string? Str(JsonElement p, string name) =>
        p.ValueKind == JsonValueKind.Object && p.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String
            ? v.GetString()
            : null;

    List<object> ImportFile()
    {
        using var dlg = new OpenFileDialog
        {
            Title = "Import Minecraft skins",
            Filter = "PNG skin (*.png)|*.png",
            Multiselect = true,
        };
        var list = new List<object>();
        if (dlg.ShowDialog(owner) != DialogResult.OK) return list;
        foreach (var file in dlg.FileNames)
        {
            var bytes = File.ReadAllBytes(file);
            if (bytes.Length > 2_000_000) continue;
            list.Add(new { name = Path.GetFileNameWithoutExtension(file), png = Convert.ToBase64String(bytes) });
        }
        return list;
    }

    bool ExportFile(string? name, string? png)
    {
        var bytes = SkinStore.DecodePng(png, true);
        var safe = string.Concat((name ?? "skin").Split(Path.GetInvalidFileNameChars())).Trim();
        using var dlg = new SaveFileDialog
        {
            Title = "Export skin",
            Filter = "PNG skin (*.png)|*.png",
            FileName = (safe.Length == 0 ? "skin" : safe) + ".png",
            InitialDirectory = Environment.GetFolderPath(Environment.SpecialFolder.Desktop),
        };
        if (dlg.ShowDialog(owner) != DialogResult.OK) return false;
        File.WriteAllBytes(dlg.FileName, bytes);
        return true;
    }

    bool OpenFolder()
    {
        Process.Start(new ProcessStartInfo("explorer.exe", $"\"{store.SkinsDir}\"") { UseShellExecute = true });
        return true;
    }

    static async Task<object> FetchPlayerAsync(string? name)
    {
        name = name?.Trim() ?? "";
        if (!UsernameRegex().IsMatch(name)) throw new ArgumentException("That is not a valid Minecraft username");

        var (uuid, realName) = await LookupUuidAsync(name);

        using var profileDoc = JsonDocument.Parse(await Http.GetStringAsync($"https://sessionserver.mojang.com/session/minecraft/profile/{uuid}"));
        string? texturesB64 = null;
        foreach (var prop in profileDoc.RootElement.GetProperty("properties").EnumerateArray())
            if (prop.GetProperty("name").GetString() == "textures")
                texturesB64 = prop.GetProperty("value").GetString();
        if (texturesB64 == null) throw new InvalidDataException("This player has no skin data");

        using var texDoc = JsonDocument.Parse(Encoding.UTF8.GetString(Convert.FromBase64String(texturesB64)));
        if (!texDoc.RootElement.GetProperty("textures").TryGetProperty("SKIN", out var skin))
            throw new InvalidDataException("This player uses a default skin");

        var url = skin.GetProperty("url").GetString()!.Replace("http://", "https://");
        if (!new Uri(url).Host.EndsWith("minecraft.net", StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("Unexpected skin host");
        var slim = skin.TryGetProperty("metadata", out var md) && md.TryGetProperty("model", out var m) && m.GetString() == "slim";
        var bytes = await Http.GetByteArrayAsync(url);
        SkinStore.DecodePng(Convert.ToBase64String(bytes), false);

        return new { name = realName, model = slim ? "slim" : "classic", png = Convert.ToBase64String(bytes) };
    }

    static async Task<(string uuid, string name)> LookupUuidAsync(string name)
    {
        string[] endpoints =
        [
            $"https://api.mojang.com/users/profiles/minecraft/{name}",
            $"https://api.minecraftservices.com/minecraft/profile/lookup/name/{name}",
        ];
        Exception? last = null;
        foreach (var url in endpoints)
        {
            try
            {
                using var res = await Http.GetAsync(url);
                if (res.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.NoContent)
                    throw new KeyNotFoundException($"No player named \"{name}\"");
                res.EnsureSuccessStatusCode();
                using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
                return (doc.RootElement.GetProperty("id").GetString()!, doc.RootElement.GetProperty("name").GetString()!);
            }
            catch (KeyNotFoundException) { throw; }
            catch (Exception ex) { last = ex; }
        }
        throw new HttpRequestException("Could not reach Minecraft servers. Check your internet connection.", last);
    }
}
