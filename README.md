<div align="center">

# SkinCraft

**A 3D Minecraft skin editor for Windows.**
Paint right on the model, see every change live, and export a skin ready for Minecraft.

[**⬇ Download the latest version**](https://github.com/Steth22/SkinCraft/releases/latest)

![SkinCraft library](docs/library.png)

</div>

---

## Features

### Paint in 3D
- Paint **directly on the 3D model**, or on the flat 64×64 texture view beside it.
- Hover any pixel to see exactly where it lands (part, face and coordinates).
- **Mirror mode** paints the left and right sides at the same time.
- Classic (4px arms) and Slim (3px arms) models, switchable at any time.

### Tools
| Tool | What it does |
|------|--------------|
| **Pencil** | Paints pixels with brush sizes 1×1, 2×2 and 3×3 |
| **Eraser** | Makes pixels transparent |
| **Fill** | Four modes: **Area** (same-color pixels), **Face**, **Part** (a whole body part) and **All** (the whole layer), with a live preview before you click |
| **Color Picker** | Takes a color from the skin (Alt+Click works with any tool) |
| **Noise Brush** | Paints with random shading for a natural, textured look |
| **Shade** | Darkens pixels, or lightens them while holding Shift |

### Layers and parts
- Edit the **Base** layer, the **Overlay** (hat, jacket, sleeves), or **All**, which paints whichever pixel you see.
- Show or hide each layer, and click a body part on the mini figure to hide it and reach hidden spots.

### Library
- Every skin saves automatically. Pick any of them up again later.
- Create, rename, duplicate, export and delete skins (deleted skins go to the Recycle Bin).
- **Import PNG** skins, or just drag and drop them onto the window. Old 64×32 skins are converted automatically.
- **Get Player Skin** copies any Minecraft Java player's skin by username.
- New skins start as a clean gray template with dark edges.

### Made to feel alive
- Floating Minecraft blocks, pixel transitions, particles while you paint, and a landing animation.
- Pose previews: **Still, Idle, Walk, Wave, Zombie** and **Dance**.
- **Performance mode** (⚡ on the home screen) hides extra effects on slower PCs.

<div align="center">

![Editor](docs/editor.png)
![Dance pose](docs/dance.png)

</div>

---

## Download and install

1. Open [**Releases**](https://github.com/Steth22/SkinCraft/releases/latest) and download `SkinCraft.exe`.
2. Run it. Nothing else to install: it's a single standalone file.

**Requirements:** Windows 10 or 11 (64-bit).
SkinCraft uses Microsoft Edge WebView2, which is built into Windows 11 and almost every Windows 10 PC. If it's missing, the app shows a link to the official download.

> **Windows SmartScreen:** the app isn't code-signed, so Windows may warn you the first time. Click **More info → Run anyway**.

---

## How to use

### Mouse
| Action | Control |
|--------|---------|
| Paint | Left click / drag on the model or the texture view |
| Rotate camera | Right-drag (or left-drag on empty space) |
| Move camera | Shift + drag, or middle-drag |
| Zoom | Mouse wheel (zooms toward the cursor) |

### Keyboard shortcuts
These work with any keyboard language.

| Key | Action |
|-----|--------|
| `B` / `E` / `G` / `I` / `N` / `S` | Pencil / Eraser / Fill / Color Picker / Noise / Shade |
| `1` `2` `3` | Brush size |
| `M` | Mirror mode |
| `X` | Switch layer (Base → Overlay → All) |
| `L` | Pixel grid |
| `F` / `R` | Front view / Reset camera |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |
| `Ctrl+S` / `Ctrl+E` | Save / Export PNG |
| `Ctrl+N` | New skin (home screen) |
| `Esc` | Back to the library |

### Use your skin in Minecraft
1. Click **Export PNG** in the editor.
2. **Java Edition:** go to [minecraft.net](https://www.minecraft.net) → Profile → Skin, upload the PNG and pick the same model (Classic or Slim).
3. **Bedrock Edition:** Dressing Room → Classic Skins → Import, then choose the PNG.

### Where are my skins?
Each skin is a normal PNG named after the skin, in:

```
%APPDATA%\SkinCraft\skins
```

Click the 📁 button on the home screen to open it. Any 64×64 skin PNG you copy into this folder shows up in the library.

---

## Build from source

You need the [.NET 9 SDK](https://dotnet.microsoft.com/download/dotnet/9.0).

```bash
git clone https://github.com/Steth22/SkinCraft.git
cd SkinCraft
dotnet publish -c Release -o publish
```

The standalone app is written to `publish/SkinCraft.exe`.

### Project structure
```
SkinCraft/
├── MainForm.cs        # Window that hosts the WebView2 UI
├── Bridge.cs          # Messages between the UI and Windows (files, dialogs, player lookup)
├── SkinStore.cs       # Saves skins as named PNG files
└── wwwroot/           # The app UI, embedded into the exe
    ├── index.html
    ├── css/style.css
    └── js/
        ├── editor.js      # Painting, tools, camera, undo/redo
        ├── library.js     # Home screen and skin library
        ├── model.js       # 3D player model and poses
        ├── skin.js        # Minecraft skin layout (UV map, mirror map)
        ├── world.js       # Background scene and particles
        └── ...
```

---

## Credits

- [three.js](https://threejs.org) for 3D rendering (MIT License).
- [Monocraft](https://github.com/IdreesInc/Monocraft) font by Idrees Hassan (SIL Open Font License 1.1, included in `wwwroot/fonts`).

SkinCraft is a fan project. It isn't affiliated with or endorsed by Mojang or Microsoft. Minecraft is a trademark of Mojang Synergies AB.

---

<div align="center">

🤖 Made with AI. Built with [Claude Code](https://claude.com/claude-code).

</div>
