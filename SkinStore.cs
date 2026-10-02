using System.Text.Json;
using Microsoft.VisualBasic.FileIO;

namespace SkinCraft;

public sealed class SkinMeta
{
    public string Id { get; set; } = "";
    public string File { get; set; } = "";
    public string Name { get; set; } = "";
    public string Model { get; set; } = "classic";
    public long Created { get; set; }
    public long Modified { get; set; }
}

// Skins are stored as "<skin name>.png" so the folder is readable; ids and metadata live in a hidden library.json.
public sealed class SkinStore
{
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    static readonly string[] Reserved = ["CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"];

    public string Root { get; }
    public string SkinsDir { get; }
    string IndexPath => Path.Combine(SkinsDir, "library.json");
    readonly Dictionary<string, SkinMeta> index = new();

    public SkinStore()
    {
        Root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "SkinCraft");
        SkinsDir = Path.Combine(Root, "skins");
        Directory.CreateDirectory(SkinsDir);
        LoadIndex();
        MigrateLegacy();
    }

    static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    string PngPath(SkinMeta m) => Path.Combine(SkinsDir, m.File);

    SkinMeta Get(string? id) =>
        id != null && index.TryGetValue(id, out var m) ? m : throw new KeyNotFoundException("Skin not found");

    static string CleanName(string? name)
    {
        var n = (name ?? "").Trim();
        if (n.Length == 0) n = "Untitled";
        return n.Length > 40 ? n[..40] : n;
    }

    static string CleanModel(string? model) => model == "slim" ? "slim" : "classic";

    public static byte[] DecodePng(string? b64, bool require64x64)
    {
        var bytes = Convert.FromBase64String(b64 ?? "");
        if (!IsPng(bytes)) throw new InvalidDataException("Not a PNG image");
        if (require64x64 && PngSize(bytes) != (64, 64)) throw new InvalidDataException("Skin must be 64x64");
        return bytes;
    }

    static bool IsPng(byte[] b) => b.Length >= 24 && b.Length <= 2_000_000 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47;

    static (int w, int h) PngSize(byte[] b) =>
        ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19], (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]);

    static void WriteAtomic(string path, byte[] data)
    {
        var tmp = path + ".tmp";
        File.WriteAllBytes(tmp, data);
        File.Move(tmp, path, true);
    }

    void LoadIndex()
    {
        if (!File.Exists(IndexPath)) return;
        try
        {
            foreach (var m in JsonSerializer.Deserialize<List<SkinMeta>>(File.ReadAllText(IndexPath), Json) ?? [])
                if (m.Id.Length > 0 && m.File.Length > 0) index[m.Id] = m;
        }
        catch { }
    }

    void SaveIndex()
    {
        if (File.Exists(IndexPath)) File.SetAttributes(IndexPath, FileAttributes.Normal);
        WriteAtomic(IndexPath, JsonSerializer.SerializeToUtf8Bytes(index.Values.OrderBy(m => m.Created).ToList(), Json));
        File.SetAttributes(IndexPath, FileAttributes.Hidden);
    }

    // Earlier versions saved "<guid>.png" + "<guid>.json"; rename those to readable names.
    void MigrateLegacy()
    {
        var changed = false;
        foreach (var json in Directory.EnumerateFiles(SkinsDir, "*.json").ToList())
        {
            var id = Path.GetFileNameWithoutExtension(json);
            if (!Guid.TryParseExact(id, "N", out _)) continue;
            try
            {
                var old = JsonSerializer.Deserialize<SkinMeta>(File.ReadAllText(json), Json);
                var png = Path.Combine(SkinsDir, id + ".png");
                if (old != null && File.Exists(png) && !index.ContainsKey(id))
                {
                    old.Id = id;
                    old.File = UniqueFile(old.Name, null);
                    File.Move(png, PngPath(old));
                    index[id] = old;
                }
                File.Delete(json);
                changed = true;
            }
            catch { }
        }
        if (changed) SaveIndex();
    }

    string UniqueFile(string name, string? ownerId)
    {
        var safe = string.Concat(name.Split(Path.GetInvalidFileNameChars())).Trim().TrimEnd('.', ' ');
        if (safe.Length == 0 || safe.Equals("library", StringComparison.OrdinalIgnoreCase)) safe = "Skin";
        if (Reserved.Contains(safe.ToUpperInvariant())) safe = "_" + safe;
        for (var n = 1; ; n++)
        {
            var file = (n == 1 ? safe : $"{safe} ({n})") + ".png";
            var owner = index.Values.FirstOrDefault(m => m.File.Equals(file, StringComparison.OrdinalIgnoreCase));
            if (owner == null ? !File.Exists(Path.Combine(SkinsDir, file)) : owner.Id == ownerId) return file;
        }
    }

    void ApplyName(SkinMeta m, string name)
    {
        m.Name = name;
        var file = UniqueFile(name, m.Id);
        if (file.Equals(m.File, StringComparison.Ordinal)) return;
        var from = PngPath(m);
        m.File = file;
        if (File.Exists(from)) File.Move(from, PngPath(m), true);
    }

    // Keeps the index in step with the folder: forgets deleted PNGs and adopts PNG skins dropped in by hand.
    void Sync()
    {
        var changed = false;
        foreach (var m in index.Values.Where(m => !File.Exists(PngPath(m))).ToList())
        {
            index.Remove(m.Id);
            changed = true;
        }
        var known = new HashSet<string>(index.Values.Select(m => m.File), StringComparer.OrdinalIgnoreCase);
        foreach (var path in Directory.EnumerateFiles(SkinsDir, "*.png"))
        {
            var file = Path.GetFileName(path);
            if (known.Contains(file)) continue;
            try
            {
                var bytes = File.ReadAllBytes(path);
                if (!IsPng(bytes) || PngSize(bytes) is not ((64, 64) or (64, 32))) continue;
                var t = new DateTimeOffset(File.GetLastWriteTimeUtc(path)).ToUnixTimeMilliseconds();
                var m = new SkinMeta { Id = Guid.NewGuid().ToString("N"), File = file, Name = CleanName(Path.GetFileNameWithoutExtension(file)), Created = t, Modified = t };
                index[m.Id] = m;
                changed = true;
            }
            catch { }
        }
        if (changed) SaveIndex();
    }

    static object Dto(SkinMeta m, byte[]? png) => new
    {
        m.Id, m.Name, m.Model, m.Created, m.Modified,
        png = png == null ? null : Convert.ToBase64String(png),
    };

    public List<object> List()
    {
        Sync();
        var list = new List<object>();
        foreach (var m in index.Values)
        {
            try { list.Add(Dto(m, File.ReadAllBytes(PngPath(m)))); } catch { }
        }
        return list;
    }

    public object Save(string? id, string? name, string? model, string? png)
    {
        var bytes = DecodePng(png, true);
        SkinMeta m;
        if (string.IsNullOrEmpty(id) || !index.TryGetValue(id, out m!))
        {
            var newId = id != null && Guid.TryParseExact(id, "N", out _) ? id : Guid.NewGuid().ToString("N");
            m = new SkinMeta { Id = newId, Created = Now() };
            m.Name = CleanName(name);
            m.File = UniqueFile(m.Name, m.Id);
            index[m.Id] = m;
        }
        else
        {
            ApplyName(m, CleanName(name));
        }
        m.Model = CleanModel(model);
        m.Modified = Now();
        WriteAtomic(PngPath(m), bytes);
        SaveIndex();
        return Dto(m, null);
    }

    public object Rename(string? id, string? name)
    {
        var m = Get(id);
        ApplyName(m, CleanName(name));
        m.Modified = Now();
        SaveIndex();
        return Dto(m, null);
    }

    public object Duplicate(string? id)
    {
        var src = Get(id);
        var copy = new SkinMeta { Id = Guid.NewGuid().ToString("N"), Name = CleanName(src.Name + " copy"), Model = src.Model, Created = Now(), Modified = Now() };
        copy.File = UniqueFile(copy.Name, copy.Id);
        File.Copy(PngPath(src), PngPath(copy));
        index[copy.Id] = copy;
        SaveIndex();
        return Dto(copy, File.ReadAllBytes(PngPath(copy)));
    }

    public bool Delete(string? id)
    {
        var m = Get(id);
        if (File.Exists(PngPath(m)))
            FileSystem.DeleteFile(PngPath(m), UIOption.OnlyErrorDialogs, RecycleOption.SendToRecycleBin);
        index.Remove(m.Id);
        SaveIndex();
        return true;
    }
}
