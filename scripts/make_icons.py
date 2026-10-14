#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 PWA 图标：对 SVG 路径做 4x 超采样抗锯齿光栅化，纯标准库实现"""
import struct, zlib, os, math


def png_bytes(width, height, pixels):
    raw = b''
    for row in pixels:
        raw += b'\x00' + bytes(v for px in row for v in px)

    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9))
            + chunk(b'IEND', b''))


def rounded_rect_contains(x, y, size, r, inset=0.0):
    """点是否在圆角矩形内（inset 收缩）"""
    x0, y0 = inset, inset
    x1, y1 = size - inset, size - inset
    rr = max(r - inset * 0.5, 0)
    if not (x0 <= x <= x1 and y0 <= y <= y1):
        return False
    # 四个角的圆心
    cx = x0 + rr if x < x0 + rr else (x1 - rr if x > x1 - rr else x)
    cy = y0 + rr if y < y0 + rr else (y1 - rr if y > y1 - rr else y)
    return math.hypot(x - cx, y - cy) <= rr


def inside_open_book(x, y, size):
    """书签本图形：两侧翻开的书页 + 中缝"""
    s = size / 100.0
    px, py = x / s, y / s          # 归一化到 0-100 坐标

    # 书的整体范围
    left, right, top, bot = 20.0, 80.0, 30.0, 74.0
    if not (left <= px <= right and top <= py <= bot):
        return False

    # 中缝：x=50 附近的竖线（留白）
    if abs(px - 50.0) < 2.6:
        return False

    # 上边缘：V 形凹口，模拟书页翻开的折角
    # 中间高（y小），两侧低（y大）
    mid = 50.0
    if px < mid:
        ratio = (mid - px) / (mid - left)
    else:
        ratio = (px - mid) / (right - mid)
    notch = top + 8.0 * (1.0 - min(ratio, 1.0))
    if py < notch:
        return False

    # 下边缘：轻微弧形（书底）
    bottom_curve = bot - 3.0 * (1.0 - abs(px - mid) / 30.0)
    if py > bottom_curve:
        return False

    return True


def make_icon(size, ss=4):
    r = size * 0.22
    bg1 = (51, 133, 246)
    bg2 = (31, 104, 220)

    # 超采样
    big = size * ss
    r_big = r * ss

    # 预计算书本区域的包围盒，避免全图遍历
    rows = []
    for by in range(size):
        row = []
        for bx in range(size):
            cov_shape = 0
            cov_book = 0
            for sy in range(ss):
                for sx in range(ss):
                    x = bx * ss + sx + 0.5
                    y = by * ss + sy + 0.5
                    if rounded_rect_contains(x, y, big, r_big):
                        cov_shape += 1
                        if inside_open_book(x / ss, y / ss, size):
                            cov_book += 1
            n = ss * ss
            a_shape = cov_shape / n
            a_book = cov_book / n
            if a_shape == 0:
                row.append((0, 0, 0, 0))
                continue

            t = (bx / size * 0.4 + by / size * 0.6)
            col = tuple(int(bg1[i] * (1 - t) + bg2[i] * t) for i in range(3))

            # 书本覆盖度 -> 与白色混合
            if a_book > 0:
                k = min(a_book / a_shape, 1.0)
                col = tuple(int(col[i] * (1 - k) + 255 * k) for i in range(3))

            row.append((col[0], col[1], col[2], int(255 * a_shape)))
        rows.append(row)
    return png_bytes(size, size, rows)


def make_ico(sizes=(16, 24, 32, 48, 64, 128, 256)):
    """生成 Windows .ico：内嵌多个PNG 尺寸，electron-builder / NSIS 直接使用"""
    import io
    images = [make_icon(s) for s in sizes]

    header = struct.pack('<HHH', 0, 1, len(images))       # reserved, type=icon, count
    offset = 6 + 16 * len(images)
    entries, blobs = b'', b''
    for s, data in zip(sizes, images):
        entries += struct.pack('<BBBBHHII',
                               s if s < 256 else 0,       # width (0 = 256)
                               s if s < 256 else 0,       # height
                               0, 0, 1, 32, len(data), offset)
        blobs += data
        offset += len(data)
    return header + entries + blobs


def main():
    out = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    pub = os.path.join(out, 'public')
    for s in (192, 512):
        path = os.path.join(pub, f'icon-{s}.png')
        data = make_icon(s)
        with open(path, 'wb') as f:
            f.write(data)
        print('wrote', path, len(data), 'bytes')

    # Windows / Electron 图标
    ico = os.path.join(out, 'build', 'icon.ico')
    os.makedirs(os.path.dirname(ico), exist_ok=True)
    data = make_ico()
    with open(ico, 'wb') as f:
        f.write(data)
    print('wrote', ico, len(data), 'bytes')

    # Android 各密度图标（mipmap-*）
    android_res = os.path.join(out, 'android', 'app', 'src', 'main', 'res')
    for folder, px in [('mipmap-mdpi', 48), ('mipmap-hdpi', 72), ('mipmap-xhdpi', 96),
                       ('mipmap-xxhdpi', 144), ('mipmap-xxxhdpi', 192)]:
        d = os.path.join(android_res, folder)
        if not os.path.isdir(d):
            continue
        for name, size in [('ic_launcher.png', px), ('ic_launcher_round.png', px),
                           ('ic_launcher_foreground.png', int(px * 2.5))]:
            with open(os.path.join(d, name), 'wb') as f:
                f.write(make_icon(size))
        print('wrote', folder, f'{px}px')

    svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0%" stop-color="#3385f6"/>
      <stop offset="100%" stop-color="#1f68dc"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="22" fill="url(#g)"/>
  <g fill="#ffffff">
    <path d="M20 34 L47.4 30.2 L47.4 71 L20 74.6 Z"/>
    <path d="M80 34 L52.6 30.2 L52.6 71 L80 74.6 Z"/>
  </g>
  <rect x="48.6" y="29" width="2.8" height="44" rx="1.2" fill="#ffffff" opacity="0"/>
</svg>'''
    with open(os.path.join(pub, 'favicon.svg'), 'w', encoding='utf-8') as f:
        f.write(svg)
    print('wrote favicon.svg')


if __name__ == '__main__':
    main()