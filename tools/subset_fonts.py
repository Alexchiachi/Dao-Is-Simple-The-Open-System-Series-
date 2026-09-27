#!/usr/bin/env python3
"""
產生「只含這一頁用到的字」的中文字型子集，放進 fonts/。

為什麼：Google Fonts 把思源系列切成一百多段，瀏覽器依頁面上出現的字下載對應的段落。
這一頁五個字重（Noto Serif TC 400／600／700、Noto Sans TC 400／500）要抓 110 個檔、
約 7.9MB，光是字型的 CSS 就有 614KB。字型不擋畫面，但在手機網路上會把頻寬塞滿。
改成自己放子集：每個字重只含這一頁實際出現的字，五個字重總共兩三百 KB。

做法與 Alexchiachi/happy 的 tools/subset_fonts.py 相同（雲南好物 shop/ 與安寧 anning/ 用的那一支），
差別是這裡只有一頁、用 Chromium 直接跑，不需要 playwright：
  1. 無頭瀏覽器打開 index.html，逐個文字節點讀出它實際用的字族與字重。
  2. 依字重向 Google Fonts 要子集（css2 的 text= 參數，一次最多約 480 字，所以分段）。
  3. 下載 woff2，寫出 fonts/fonts.css（頁面等 load 之後才載入它）。

什麼時候要重跑：改了頁面文案之後。沒重跑也不會壞——子集裡沒有的字會用系統明體補上，
只是那幾個字字形略有不同。

用法（在專案根目錄）：
    python3 tools/subset_fonts.py

需要 Chromium；路徑可用環境變數 CHROME_PATH 指定。
字型授權：SIL Open Font License 1.1（fonts/OFL.txt），允許子集化與自行託管。
"""
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGE = ROOT / "index.html"
OUT = ROOT / "fonts"
# 這一頁 CSS 實際用到的字重。改了 CSS 裡的 font-weight 要一起改這裡。
FAMILIES = {"serif": ("Noto Serif TC", (400, 600, 700)), "sans": ("Noto Sans TC", (400, 500))}
# 標點與英數一律附上：它們在每個字重都會出現，量很小
BASE = "".join(chr(c) for c in range(0x20, 0x7F)) + "，。、：；！？「」『』（）〈〉《》…——～・％＋－×／⋯‹›"
CHUNK = 480
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0 Safari/537.36")

COLLECT_JS = r"""
(function () {
  var out = {};
  function push(kind, weight, s) {
    var k = kind + ':' + weight;
    out[k] = (out[k] || '') + s;
  }
  var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  var n;
  while ((n = walker.nextNode())) {
    var s = n.nodeValue;
    if (!s || !s.trim()) continue;
    var el = n.parentElement;
    if (!el || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
    var cs = getComputedStyle(el);
    var stack = cs.fontFamily;
    var first = stack.split(',')[0].replace(/["']/g, '').trim();
    var kind = first === 'Noto Serif TC' ? 'serif'
             : /Noto Sans TC/.test(stack) ? 'sans' : null;
    if (kind) push(kind, cs.fontWeight, s);
  }
  // placeholder、aria-label 這些畫面上讀得到但不是文字節點的字
  document.querySelectorAll('[placeholder],[aria-label],[alt]').forEach(function (el) {
    var cs = getComputedStyle(el);
    var stack = cs.fontFamily;
    var first = stack.split(',')[0].replace(/["']/g, '').trim();
    var kind = first === 'Noto Serif TC' ? 'serif'
             : /Noto Sans TC/.test(stack) ? 'sans' : null;
    if (!kind) return;
    ['placeholder', 'aria-label', 'alt'].forEach(function (a) {
      if (el.hasAttribute(a)) push(kind, cs.fontWeight, el.getAttribute(a));
    });
  });
  var pre = document.createElement('pre');
  pre.id = 'subset-out';
  pre.textContent = JSON.stringify(out);
  document.body.textContent = '';
  document.body.appendChild(pre);
})();
"""


def chromium():
    if os.environ.get("CHROME_PATH"):
        return os.environ["CHROME_PATH"]
    for c in ("/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
              shutil.which("chromium"), shutil.which("chromium-browser"),
              shutil.which("google-chrome")):
        if c and pathlib.Path(c).exists():
            return c
    sys.exit("找不到 Chromium，請設定 CHROME_PATH")


def collect():
    """開頁面，讀出每個字重實際用到的字。"""
    html = PAGE.read_text(encoding="utf-8")
    # 隱藏的元素（確認視窗、手機選單）也要算進去，所以先讓它們顯示
    html = html.replace("</head>", "<style>[hidden]{display:block!important}</style>\n</head>", 1)
    html = html.replace("</body>", "<script>" + COLLECT_JS + "</script>\n</body>", 1)
    with tempfile.TemporaryDirectory() as tmp:
        p = pathlib.Path(tmp) / "collect.html"
        p.write_text(html, encoding="utf-8")
        dom = subprocess.run(
            [chromium(), "--headless=new", "--no-sandbox", "--disable-gpu",
             "--virtual-time-budget=4000", "--dump-dom", p.as_uri()],
            capture_output=True, text=True, timeout=180).stdout
    m = re.search(r'<pre id="subset-out">(.*?)</pre>', dom, re.S)
    if not m:
        sys.exit("瀏覽器沒有回報用字，檢查 Chromium 是否跑得起來")
    import html as _html
    raw = json.loads(_html.unescape(m.group(1)))

    # 程式寫進頁面的字（送出中、已複製、錯誤訊息）不一定在畫面上，直接從原始碼補進去
    script = "".join(re.findall(r"<script>(.*?)</script>", PAGE.read_text(encoding="utf-8"), re.S))
    dynamic = "".join(re.findall(r"[　-〿一-鿿＀-￯]", script))

    buckets = {}
    for key, s in raw.items():
        kind, weight = key.split(":")
        weight = int(weight)
        avail = FAMILIES[kind][1]
        # 頁面用了 500、800 這種沒有子集的字重時，落到最接近的一個
        w = min(avail, key=lambda a: (abs(a - weight), a))
        buckets.setdefault((kind, w), set()).update(s)
    # CSS 的 content:"…"（尖角、勾）不是文字節點，瀏覽器那一步看不到，要從原始碼補
    css_src = "".join(re.findall(r"<style>(.*?)</style>", PAGE.read_text(encoding="utf-8"), re.S))
    generated = ""
    for lit in re.findall(r'content:\s*"([^"]*)"', css_src):
        generated += re.sub(r"\\([0-9a-fA-F]{1,6})\s?", lambda m: chr(int(m.group(1), 16)), lit)

    for kind in FAMILIES:
        for w in FAMILIES[kind][1]:
            buckets.setdefault((kind, w), set()).update(generated)
        buckets[(kind, FAMILIES[kind][1][0])].update(dynamic)
    for k in buckets:
        buckets[k].update(BASE)
        buckets[k] = {c for c in buckets[k] if c.strip() or c == " "}
    return buckets


def fetch_subset(family, weight, chars):
    """向 Google Fonts 要這一批字的子集，回傳 [(woff2 bytes, unicode-range), ...]。

    一次最多約 480 字，所以字多時會切成幾段；每一段各自帶回自己的 unicode-range，
    寫進 fonts.css 時一定要一起寫，否則後面的 @font-face 會整個蓋掉前面的。
    """
    text = "".join(sorted(chars))
    pieces = [text[i:i + CHUNK] for i in range(0, len(text), CHUNK)] or [""]
    out = []
    for piece in pieces:
        url = ("https://fonts.googleapis.com/css2?family="
               + urllib.parse.quote(family) + ":wght@" + str(weight)
               + "&text=" + urllib.parse.quote(piece) + "&display=swap")
        css = urllib.request.urlopen(
            urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60).read().decode()
        for block in re.findall(r"@font-face\s*{(.*?)}", css, re.S):
            src = re.search(r"src:\s*url\((\S+?)\)\s*format\('woff2'\)", block)
            rng = re.search(r"unicode-range:\s*([^;]+);", block)
            if not src:
                continue
            blob = urllib.request.urlopen(
                urllib.request.Request(src.group(1), headers={"User-Agent": UA}), timeout=60).read()
            out.append((blob, rng.group(1).strip() if rng else None))
    return out


def main():
    buckets = collect()
    OUT.mkdir(exist_ok=True)
    lines = ["/* 由 tools/subset_fonts.py 產生，不要手改。",
             "   只含 index.html 用到的字；授權見 OFL.txt。 */"]
    total = 0
    for kind, (family, weights) in FAMILIES.items():
        for weight in weights:
            chars = buckets.get((kind, weight))
            if not chars:
                continue
            parts = fetch_subset(family, weight, chars)
            size = 0
            for i, (blob, rng) in enumerate(parts):
                name = f"{kind}-{weight}{'' if i == 0 else '-' + str(i)}.woff2"
                (OUT / name).write_bytes(blob)
                size += len(blob)
                lines.append(
                    f"@font-face{{font-family:'{family}';font-style:normal;font-weight:{weight};"
                    f"font-display:swap;src:url('{name}') format('woff2');"
                    + (f"unicode-range:{rng};" if rng else "") + "}")
            total += size
            print(f"{family} {weight}: {len(chars)} 字 → {size / 1024:.0f} KB（{len(parts)} 檔）")
    (OUT / "fonts.css").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"合計 {total / 1024:.0f} KB，寫進 {OUT.relative_to(ROOT)}/")


if __name__ == "__main__":
    main()
