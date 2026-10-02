import struct, zlib, os

P = {
    'K': (40, 40, 46), 'D': (74, 74, 80), 'G': (154, 154, 160), 'L': (190, 190, 196),
    'W': (245, 245, 245), 'B': (60, 140, 230), 'M': (60, 60, 66),
    'r': (230, 70, 70), 'o': (245, 150, 50), 'y': (250, 220, 70), 'g': (110, 200, 80), 'c': (70, 190, 220), 'p': (160, 100, 230),
    '.': None,
}
ART = [
    "................",
    ".KKKKKKKKKKKKKK.",
    ".KrroooyyygggcK.",
    ".KrroooyyygggcK.",
    ".KDLLLLLLLLLLDK.",
    ".KDGGGGGGGGGGDK.",
    ".KDGGGGGGGGGGDK.",
    ".KDGWBGGGGWBGDK.",
    ".KDGWBGGGGWBGDK.",
    ".KDGGGGDDGGGGDK.",
    ".KDGGGMMMMGGGDK.",
    ".KDGGGMGGMGGGDK.",
    ".KDGGGGGGGGGGDK.",
    ".KDDDDDDDDDDDDK.",
    ".KKKKKKKKKKKKKK.",
    "................",
]

def png(size):
    s = size // 16
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            c = P[ART[y // s][x // s]]
            row += bytes((*c, 255)) if c else bytes((0, 0, 0, 0))
        rows.append(bytes(row))
    raw = zlib.compress(b''.join(rows), 9)
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', raw) + chunk(b'IEND', b'')

sizes = [16, 32, 48, 64, 128, 256]
imgs = [png(s) for s in sizes]
out = struct.pack('<HHH', 0, 1, len(sizes))
offset = 6 + 16 * len(sizes)
for s, data in zip(sizes, imgs):
    out += struct.pack('<BBBBHHII', s % 256, s % 256, 0, 0, 1, 32, len(data), offset)
    offset += len(data)
out += b''.join(imgs)
root = os.path.join(os.path.dirname(__file__), '..')
open(os.path.join(root, 'app.ico'), 'wb').write(out)
open(os.path.join(root, 'wwwroot', 'icon.png'), 'wb').write(imgs[3])
print('ok', len(out))
for size in (192, 512):
    open(os.path.join(root, 'wwwroot', f'icon-{size}.png'), 'wb').write(png(size))
print('pwa icons ok')
