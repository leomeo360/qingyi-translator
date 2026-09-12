"""Generate small original geometric extension icons using only Python's standard library."""
from pathlib import Path
import math
import struct
import zlib

root = Path(__file__).resolve().parent.parent / 'extension' / 'icons'
root.mkdir(exist_ok=True)
def segment(x, y, a, b, width):
    dx, dy = b[0] - a[0], b[1] - a[1]
    t = max(0, min(1, ((x-a[0])*dx + (y-a[1])*dy) / (dx*dx + dy*dy)))
    return math.hypot(x-a[0]-t*dx, y-a[1]-t*dy) < width

# Two interlocking translation glyphs, hand drawn rather than font dependent.
lines = [((.22,.3),(.59,.3)), ((.405,.22),(.405,.31)), ((.30,.35),(.53,.57)), ((.50,.33),(.25,.59)), ((.53,.73),(.67,.40)), ((.67,.40),(.81,.73)), ((.59,.61),(.75,.61))]
for size in [16, 32, 48, 128]:
    raw = bytearray()
    for py in range(size):
        raw.append(0)
        for px in range(size):
            sums = [0, 0, 0, 0]
            for sy in range(4):
                for sx in range(4):
                    x, y = (px+(sx+.5)/4)/size, (py+(sy+.5)/4)/size
                    inside = math.hypot(max(abs(x-.5)-.28, 0), max(abs(y-.5)-.28, 0)) < .20
                    white = any(segment(x,y,a,b,.025) for a,b in lines)
                    color = (255,255,255,255) if white else (84,106,230,255) if inside else (0,0,0,0)
                    for c in range(4): sums[c] += color[c]
            raw.extend(round(v/16) for v in sums)
    def chunk(kind, data): return struct.pack('!I',len(data)) + kind + data + struct.pack('!I',zlib.crc32(kind+data))
    image = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR',struct.pack('!IIBBBBB',size,size,8,6,0,0,0)) + chunk(b'IDAT',zlib.compress(raw)) + chunk(b'IEND',b'')
    (root / f'{size}.png').write_bytes(image)
print('已生成 4 个尺寸的扩展图标')
