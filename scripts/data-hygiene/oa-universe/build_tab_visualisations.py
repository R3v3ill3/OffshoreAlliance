#!/usr/bin/env python3
"""Build the OA Universe tab visualisations.

Reads every CSV in docs/data-architecture/reference/oa-universe-tabs/ and writes a
self-contained HTML page per tab into viz/, plus an index.html cover page that links
to them. Pages are static, single-file (CSS and JS inlined) and open from the file
system - no server, no build tooling, no network.

    python3 scripts/data-hygiene/oa-universe/build_tab_visualisations.py

Re-run it after any CSV changes; the output is deterministic and diff-able.
"""

from __future__ import annotations

import csv
import html
import json
import re
from collections import Counter, OrderedDict, defaultdict
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SRC = REPO / "docs/data-architecture/reference/oa-universe-tabs"
OUT = SRC / "viz"

CONF_ORDER = ["H", "M", "L", "?"]
CONF_LABEL = {"H": "High", "M": "Medium", "L": "Low", "?": "Unrated"}


# --------------------------------------------------------------------------- read

def is_note_row(cells: list[str]) -> bool:
    """A legend / footnote row: text parked in the first column, rest empty."""
    filled = [c for c in cells if c.strip()]
    if len(filled) != 1 or not cells[0].strip():
        return False
    head = cells[0].strip()
    if head.upper().startswith("LEGEND") or head.startswith("See also"):
        return True
    # All-caps single words are company names (TMT, UPS, AOS), not headings.
    return len(head) > 34 or (head.isupper() and " " in head)


def read_tab(path: Path) -> tuple[list[str], list[list[str]], list[str]]:
    with path.open(encoding="utf-8-sig", newline="") as fh:
        raw = [r for r in csv.reader(fh)]
    header = [c.strip() for c in raw[0]]
    width = len(header)
    rows, notes = [], []
    for cells in raw[1:]:
        cells = (cells + [""] * width)[:width]
        cells = [c.strip() for c in cells]
        if not any(cells):
            continue
        if is_note_row(cells):
            notes.append(re.sub(r"\s+", " ", cells[0]).strip())
        else:
            rows.append(cells)
    # Trailing colour-key rows (a single label parked in column A after the data) are
    # legend, not data - lift them out from the bottom up.
    keys = []
    while rows and width > 2:
        last = rows[-1]
        if len([c for c in last if c]) == 1 and last[0]:
            keys.append(rows.pop()[0])
        else:
            break
    if keys:
        notes.append("Colour key on the tab: " + " \u00b7 ".join(reversed(keys)))
    return header, rows, notes


# ------------------------------------------------------------------- cell parsing

PAREN = re.compile(r"\(([^()]*)\)\s*$")


def companies(cell: str) -> list[dict]:
    """Split a 'Cyan (H); Legeneering (H) [WB]; MEA (M)' cell into company records."""
    out = []
    for part in re.split(r";|·", cell or ""):
        part = part.strip().strip(",")
        if not part or part in {"-", "—", "None found", "n/a"}:
            continue
        wb = "[WB]" in part
        part = part.replace("[WB]", "").strip()
        conf = "?"
        m = PAREN.search(part)
        if m:
            inner = m.group(1).strip()
            token = inner.split(",")[-1].split("—")[0].strip().upper()
            if token in {"H", "M", "L"}:
                conf = token
                part = part[: m.start()].strip()
            elif inner.upper() in {"H", "M", "L"}:
                conf = inner.upper()
                part = part[: m.start()].strip()
        name = part.strip(" —-,")
        if not name or name.lower().startswith(("none found", "not ")):
            continue
        out.append({"name": name, "conf": conf, "wb": wb})
    return out


def lead_word(value: str) -> str:
    return re.split(r"[(/;—,]", value or "", 1)[0].strip().lower()


def status_bucket(value: str) -> str:
    v = lead_word(value)
    if v.startswith("operating"):
        return "Operating"
    if v.startswith(("commissioning", "under construction")):
        return "Under construction / commissioning"
    if v.startswith("planned"):
        return "Planned / pre-FID"
    if v.startswith(("ceased", "off-station", "shut")):
        return "Ceased / shut-in"
    if v.startswith("decommission"):
        return "Decommissioning / decommissioned"
    return "Other"


def asset_type_bucket(value: str) -> str:
    v = (value or "").lower()
    if "on-island" in v:
        return "On-island processing"
    if "flng" in v:
        return "FLNG"
    if "fpso" in v or "fpu" in v or "floating production" in v:
        return "FPSO / floating production"
    if "platform" in v or "control station" in v or "processing facility" in v:
        return "Platform / fixed facility"
    if "subsea" in v:
        return "Subsea only (no surface facility)"
    return "Other"


def confidence_bucket(value: str) -> str:
    v = lead_word(value)
    if v.startswith("medium-high"):
        return "Medium-High"
    if v.startswith("low-medium"):
        return "Low-Medium"
    if v.startswith("high"):
        return "High"
    if v.startswith("medium"):
        return "Medium"
    if v.startswith("low"):
        return "Low"
    if v.startswith("none"):
        return "None found"
    return value or "Unrated"


def presence_bucket(value: str) -> str:
    v = (value or "").lower()
    if v.startswith("current"):
        return "Current"
    if v.startswith("recent"):
        return "Recent"
    if v.startswith(("likely", "upcoming", "planned", "expected")):
        return "Likely / upcoming"
    if v.startswith("historical") or "historic" in v:
        return "Historical"
    return value or "Unstated"


def base_bucket(value: str) -> str:
    v = (value or "").lower()
    if v.startswith("transient"):
        return "Transient (mobilised per campaign)"
    if "perth" in v:
        return "Perth"
    if "dampier" in v or "karratha" in v:
        return "Dampier / Karratha"
    if "darwin" in v:
        return "Darwin"
    if "broome" in v:
        return "Broome"
    if v in {"", "n/a", "—", "-"}:
        return "Not stated"
    return value


def scopes_of(cell: str) -> list[str]:
    """Scope cell from the linkages tab, minus its parenthetical annotations."""
    cell = re.sub(r"\([^)]*\)", "", cell or "")
    parts = []
    for part in cell.split(";"):
        part = part.strip(" —-")
        if part:
            parts.append(part)
    return parts


# ------------------------------------------------------------------------- styles

CSS = r"""
:root {
  color-scheme: light;
  --plane: #f9f9f7;
  --surface: #fcfcfb;
  --ink: #0b0b0b;
  --ink-2: #52514e;
  --muted: #898781;
  --grid: #e1e0d9;
  --axis: #c3c2b7;
  --border: rgba(11, 11, 11, 0.10);
  --shadow: 0 1px 2px rgba(11, 11, 11, 0.05);
  --track: #f0efec;
  --seq-1: #104281;
  --seq-2: #1c5cab;
  --seq-3: #2a78d6;
  --seq-4: #5598e7;
  --seq-5: #86b6ef;
  --seq-0: #cde2fb;
  --cat-1: #2a78d6;
  --cat-2: #eb6834;
  --cat-3: #1baf7a;
  --cat-4: #eda100;
  --cat-5: #e87ba4;
  --cat-6: #008300;
  --good: #0ca30c;
  --warning: #fab219;
  --serious: #ec835a;
  --critical: #d03b3b;
  --neutral: #c3c2b7;
}
@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme="light"])) {
    color-scheme: dark;
    --plane: #0d0d0d;
    --surface: #1a1a19;
    --ink: #ffffff;
    --ink-2: #c3c2b7;
    --muted: #898781;
    --grid: #2c2c2a;
    --axis: #383835;
    --border: rgba(255, 255, 255, 0.10);
    --shadow: none;
    --track: #232322;
    --seq-1: #9ec5f4;
    --seq-2: #6da7ec;
    --seq-3: #3987e5;
    --seq-4: #256abf;
    --seq-5: #184f95;
    --seq-0: #12345f;
    --cat-1: #3987e5;
    --cat-2: #d95926;
    --cat-3: #199e70;
    --cat-4: #c98500;
    --cat-5: #d55181;
    --cat-6: #008300;
    --neutral: #383835;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --plane: #0d0d0d;
  --surface: #1a1a19;
  --ink: #ffffff;
  --ink-2: #c3c2b7;
  --muted: #898781;
  --grid: #2c2c2a;
  --axis: #383835;
  --border: rgba(255, 255, 255, 0.10);
  --shadow: none;
  --track: #232322;
  --seq-1: #9ec5f4;
  --seq-2: #6da7ec;
  --seq-3: #3987e5;
  --seq-4: #256abf;
  --seq-5: #184f95;
  --seq-0: #12345f;
  --cat-1: #3987e5;
  --cat-2: #d95926;
  --cat-3: #199e70;
  --cat-4: #c98500;
  --cat-5: #d55181;
  --cat-6: #008300;
  --neutral: #383835;
}

* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--plane);
  color: var(--ink);
  font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
}
a { color: inherit; }
.wrap { max-width: 1180px; margin: 0 auto; padding: 0 16px 72px; }

/* ---- masthead ---- */
.masthead { border-bottom: 1px solid var(--border); background: var(--surface); }
.masthead-in {
  max-width: 1180px; margin: 0 auto; padding: 14px 16px;
  display: flex; gap: 16px; align-items: center; flex-wrap: wrap;
}
.brand { font-weight: 640; letter-spacing: -0.01em; text-decoration: none; }
.brand span { color: var(--muted); font-weight: 400; }
.masthead nav { margin-left: auto; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.masthead nav a {
  text-decoration: none; color: var(--ink-2); font-size: 13px;
  padding: 4px 9px; border-radius: 999px; border: 1px solid transparent;
}
.masthead nav a:hover { background: var(--track); }
.masthead nav a[aria-current="page"] { border-color: var(--border); color: var(--ink); font-weight: 560; }
.theme-toggle {
  font: inherit; font-size: 13px; cursor: pointer; color: var(--ink-2);
  background: var(--surface); border: 1px solid var(--border); border-radius: 999px; padding: 4px 11px;
}
.theme-toggle:hover { background: var(--track); }

/* ---- page head ---- */
header.page { padding: 34px 0 10px; }
header.page h1 { font-size: 30px; line-height: 1.15; letter-spacing: -0.02em; margin: 0 0 8px; }
header.page .blurb { margin: 0; color: var(--ink-2); max-width: 74ch; }
.crumbs { font-size: 13px; color: var(--muted); margin: 0 0 10px; }
.crumbs a { color: var(--ink-2); }
.srcline { margin: 14px 0 0; font-size: 13px; color: var(--muted); }
.srcline code { font-size: 12px; background: var(--track); padding: 2px 6px; border-radius: 4px; }

/* ---- stat tiles ---- */
.stats { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(168px, 1fr)); margin: 26px 0 8px; }
.stat {
  background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
  padding: 14px 16px; box-shadow: var(--shadow);
}
.stat .v { font-size: 30px; line-height: 1.05; letter-spacing: -0.02em; font-weight: 600; }
.stat .k { font-size: 13px; color: var(--ink-2); margin-top: 6px; }
.stat .h { font-size: 12px; color: var(--muted); margin-top: 3px; }

/* ---- sections & charts ---- */
section { margin-top: 34px; }
section > h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); margin: 0 0 12px; font-weight: 620; }
.chart-grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(330px, 1fr)); }
.chart-grid.one { grid-template-columns: 1fr; }
.chart-grid.one .bar-row { grid-template-columns: minmax(84px, 230px) 1fr auto; }
.card {
  background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
  padding: 16px 18px 18px; box-shadow: var(--shadow); min-width: 0;
}
.card h3 { font-size: 15px; margin: 0 0 3px; letter-spacing: -0.01em; }
.card .sub { font-size: 13px; color: var(--muted); margin: 0 0 14px; }

.legend { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 0 0 12px; font-size: 12px; color: var(--ink-2); }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.legend i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }

.bars { display: flex; flex-direction: column; gap: 9px; }
.bar-row { display: grid; grid-template-columns: minmax(84px, 38%) 1fr auto; gap: 10px; align-items: center; }
.bar-label { font-size: 13px; color: var(--ink-2); overflow-wrap: anywhere; }
.bar-track { height: 14px; background: var(--track); border-radius: 0 4px 4px 0; display: flex; }
.bar-fill { background: var(--seq-3); border-radius: 0 4px 4px 0; min-width: 2px; height: 100%; }
.bar-track .seg { height: 100%; min-width: 2px; margin-right: 2px; border-radius: 0; }
.bar-track .seg:last-child { margin-right: 0; border-radius: 0 4px 4px 0; }
.bar-value { font-size: 13px; color: var(--ink); font-variant-numeric: tabular-nums; min-width: 2.2em; text-align: right; }
.bar-row:hover .bar-label, .bar-row:hover .bar-value { color: var(--ink); }

/* ---- heatmap ---- */
.heat-tools { display: flex; gap: 10px; align-items: center; margin: 0 0 12px; flex-wrap: wrap; }
.heat-scroll { overflow: auto; max-height: 620px; border: 1px solid var(--border); border-radius: 8px; }
.heat { display: grid; gap: 2px; padding: 2px; background: var(--surface); }
.heat .hh, .heat .rh {
  position: sticky; background: var(--surface); z-index: 2; font-size: 11.5px; color: var(--ink-2);
}
.heat .hh { top: 0; padding: 6px 4px; text-align: center; line-height: 1.25; align-self: stretch; border-bottom: 1px solid var(--grid); overflow-wrap: break-word; hyphens: none; }
.heat .rh { left: 0; z-index: 1; padding: 4px 8px 4px 6px; display: flex; align-items: center; border-right: 1px solid var(--grid); overflow-wrap: break-word; }
.heat .corner { position: sticky; top: 0; left: 0; z-index: 3; background: var(--surface); border-bottom: 1px solid var(--grid); border-right: 1px solid var(--grid); }
.heat .cell { min-height: 22px; border-radius: 3px; background: var(--track); display: flex; align-items: center; justify-content: center; font-size: 11px; color: #fff; font-variant-numeric: tabular-nums; }
.heat .cell.empty { background: transparent; box-shadow: inset 0 0 0 1px var(--grid); }
.heat .cell:hover { outline: 2px solid var(--ink); outline-offset: -2px; }
.heat.dim .row-off { display: none; }

/* ---- table ---- */
.table-tools { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 0 0 12px; }
input[type="search"], input[type="text"] {
  font: inherit; font-size: 13px; padding: 6px 10px; min-width: 220px;
  border: 1px solid var(--border); border-radius: 7px; background: var(--surface); color: var(--ink);
}
.toolbtn {
  font: inherit; font-size: 13px; cursor: pointer; padding: 6px 11px;
  border: 1px solid var(--border); border-radius: 7px; background: var(--surface); color: var(--ink-2);
}
.toolbtn:hover { background: var(--track); }
.toolnote { font-size: 13px; color: var(--muted); }
.table-scroll { overflow: auto; max-height: 720px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); }
table { border-collapse: separate; border-spacing: 0; width: 100%; font-size: 13px; }
thead th {
  position: sticky; top: 0; z-index: 1; background: var(--surface); text-align: left; font-weight: 600;
  padding: 9px 12px; border-bottom: 1px solid var(--axis); white-space: nowrap; cursor: pointer; color: var(--ink-2);
}
thead th:hover { color: var(--ink); }
thead th .ind { color: var(--muted); font-weight: 400; }
tbody td { padding: 8px 12px; border-bottom: 1px solid var(--grid); vertical-align: top; color: var(--ink-2); }
tbody td:first-child { color: var(--ink); font-weight: 560; }
tbody tr:hover td { background: var(--track); }
tbody td.num { font-variant-numeric: tabular-nums; text-align: right; }

.chip { display: inline-block; font-size: 11px; font-weight: 640; line-height: 1.6; padding: 0 6px; border-radius: 4px; color: #fff; vertical-align: 1px; }
.chip-h { background: var(--seq-2); }
.chip-m { background: var(--seq-3); }
.chip-l { background: var(--seq-5); color: #0b0b0b; }
:root[data-theme="dark"] .chip-l, :root:where(:not([data-theme="light"])) .chip-l { color: #0b0b0b; }
.tag { display: inline-block; font-size: 10.5px; letter-spacing: 0.04em; padding: 0 5px; border-radius: 4px; border: 1px solid var(--border); color: var(--muted); }
.status { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.status i { width: 9px; height: 9px; border-radius: 50%; display: inline-block; flex: none; }

/* ---- notes ---- */
.notes { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 8px 20px 14px; }
.notes li { margin: 8px 0; color: var(--ink-2); font-size: 13.5px; }

/* ---- index cards ---- */
.cards { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
.tabcard {
  display: flex; flex-direction: column; gap: 10px; text-decoration: none;
  background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
  padding: 18px 20px 20px; box-shadow: var(--shadow);
}
.tabcard:hover { border-color: var(--axis); }
.tabcard h3 { margin: 0; font-size: 17px; letter-spacing: -0.01em; }
.tabcard p { margin: 0; font-size: 13.5px; color: var(--ink-2); }
.tabcard .meta { margin-top: auto; padding-top: 6px; font-size: 12px; color: var(--muted); display: flex; gap: 12px; flex-wrap: wrap; font-variant-numeric: tabular-nums; }
.tabcard .go { font-size: 13px; color: var(--seq-3); font-weight: 560; }

/* ---- tooltip ---- */
#tip {
  position: fixed; z-index: 50; pointer-events: none; opacity: 0; transition: opacity .09s;
  max-width: 320px; background: var(--ink); color: var(--plane); font-size: 12.5px; line-height: 1.45;
  padding: 7px 10px; border-radius: 7px; white-space: pre-line;
}
#tip.on { opacity: 1; }

footer.page { margin-top: 44px; padding-top: 16px; border-top: 1px solid var(--border); font-size: 12.5px; color: var(--muted); }
footer.page code { background: var(--track); padding: 2px 6px; border-radius: 4px; }

@media (max-width: 640px) {
  header.page h1 { font-size: 24px; }
  .bar-row { grid-template-columns: minmax(70px, 44%) 1fr auto; }
}
@media print {
  .masthead nav, .theme-toggle, .table-tools, .heat-tools { display: none; }
  .table-scroll, .heat-scroll { max-height: none; }
  .card, .stat { break-inside: avoid; }
}
"""


CSS += r"""
.cell.s1 { background: #104281; color: #fff; }
.cell.s2 { background: #1c5cab; color: #fff; }
.cell.s3 { background: #2a78d6; color: #fff; }
.cell.s4 { background: #5598e7; color: #0b0b0b; }
.cell.s5 { background: #86b6ef; color: #0b0b0b; }
@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme="light"])) .cell.s1 { background: #9ec5f4; color: #0b0b0b; }
  :root:where(:not([data-theme="light"])) .cell.s2 { background: #6da7ec; color: #0b0b0b; }
  :root:where(:not([data-theme="light"])) .cell.s3 { background: #3987e5; color: #0b0b0b; }
  :root:where(:not([data-theme="light"])) .cell.s4 { background: #256abf; color: #fff; }
  :root:where(:not([data-theme="light"])) .cell.s5 { background: #184f95; color: #fff; }
}
:root[data-theme="dark"] .cell.s1 { background: #9ec5f4; color: #0b0b0b; }
:root[data-theme="dark"] .cell.s2 { background: #6da7ec; color: #0b0b0b; }
:root[data-theme="dark"] .cell.s3 { background: #3987e5; color: #0b0b0b; }
:root[data-theme="dark"] .cell.s4 { background: #256abf; color: #fff; }
:root[data-theme="dark"] .cell.s5 { background: #184f95; color: #fff; }
"""


# --------------------------------------------------------------------------- script

JS = r"""
(function () {
  var root = document.documentElement;
  var saved = null;
  try { saved = localStorage.getItem('oa-viz-theme'); } catch (e) {}
  if (saved === 'dark' || saved === 'light') root.setAttribute('data-theme', saved);

  function themeLabel() {
    var t = root.getAttribute('data-theme');
    return t === 'dark' ? 'Dark' : (t === 'light' ? 'Light' : 'Auto');
  }
  var btn = document.getElementById('theme');
  if (btn) {
    btn.textContent = themeLabel();
    btn.addEventListener('click', function () {
      var t = root.getAttribute('data-theme');
      var next = t === 'dark' ? 'light' : (t === 'light' ? null : 'dark');
      if (next) { root.setAttribute('data-theme', next); } else { root.removeAttribute('data-theme'); }
      try { next ? localStorage.setItem('oa-viz-theme', next) : localStorage.removeItem('oa-viz-theme'); } catch (e) {}
      btn.textContent = themeLabel();
    });
  }

  // ---- tooltip layer -------------------------------------------------------
  var tip = document.createElement('div');
  tip.id = 'tip';
  document.body.appendChild(tip);
  function showTip(text, x, y) {
    tip.textContent = text;
    tip.classList.add('on');
    var r = tip.getBoundingClientRect();
    var left = Math.min(Math.max(8, x + 14), window.innerWidth - r.width - 8);
    var top = y - r.height - 12;
    if (top < 8) top = y + 18;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }
  document.addEventListener('mousemove', function (e) {
    var el = e.target.closest ? e.target.closest('[data-tip]') : null;
    if (!el) { tip.classList.remove('on'); return; }
    showTip(el.getAttribute('data-tip'), e.clientX, e.clientY);
  });
  document.addEventListener('mouseleave', function () { tip.classList.remove('on'); });

  var PAGE = window.OA_PAGE;
  if (!PAGE) return;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function fmt(n) { return (typeof n === 'number' ? n : 0).toLocaleString('en-AU'); }

  // ---- charts --------------------------------------------------------------
  function barChart(c) {
    var card = el('div', 'card');
    card.appendChild(el('h3', null, c.title));
    if (c.sub) card.appendChild(el('p', 'sub', c.sub));
    var max = c.max || Math.max.apply(null, c.items.map(function (i) { return i.value; }).concat([1]));
    var bars = el('div', 'bars');
    c.items.forEach(function (item) {
      var row = el('div', 'bar-row');
      if (item.tip) row.setAttribute('data-tip', item.tip);
      row.appendChild(el('div', 'bar-label', item.label));
      var track = el('div', 'bar-track');
      var fill = el('div', 'bar-fill');
      fill.style.width = (max ? (item.value / max) * 100 : 0) + '%';
      if (c.color) fill.style.background = 'var(--' + c.color + ')';
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(el('div', 'bar-value', fmt(item.value)));
      bars.appendChild(row);
    });
    card.appendChild(bars);
    if (c.foot) card.appendChild(el('p', 'sub', c.foot)).style.margin = '14px 0 0';
    return card;
  }

  function stackChart(c) {
    var card = el('div', 'card');
    card.appendChild(el('h3', null, c.title));
    if (c.sub) card.appendChild(el('p', 'sub', c.sub));
    var legend = el('div', 'legend');
    c.series.forEach(function (s) {
      var span = el('span');
      var sw = el('i');
      sw.style.background = 'var(--' + s.color + ')';
      span.appendChild(sw);
      span.appendChild(document.createTextNode(s.name));
      legend.appendChild(span);
    });
    card.appendChild(legend);
    var max = Math.max.apply(null, c.items.map(function (i) { return i.total; }).concat([1]));
    var bars = el('div', 'bars');
    c.items.forEach(function (item) {
      var row = el('div', 'bar-row');
      if (item.tip) row.setAttribute('data-tip', item.tip);
      row.appendChild(el('div', 'bar-label', item.label));
      var track = el('div', 'bar-track');
      item.values.forEach(function (v, i) {
        if (!v) return;
        var seg = el('div', 'seg');
        seg.style.width = 'calc(' + (v / max) * 100 + '% - 2px)';
        seg.style.background = 'var(--' + c.series[i].color + ')';
        track.appendChild(seg);
      });
      row.appendChild(track);
      row.appendChild(el('div', 'bar-value', fmt(item.total)));
      bars.appendChild(row);
    });
    card.appendChild(bars);
    return card;
  }

  function heatChart(c) {
    var card = el('div', 'card');
    card.appendChild(el('h3', null, c.title));
    if (c.sub) card.appendChild(el('p', 'sub', c.sub));
    var tools = el('div', 'heat-tools');
    var search = document.createElement('input');
    search.type = 'search';
    search.placeholder = c.filter || 'Filter rows…';
    tools.appendChild(search);
    var count = el('span', 'toolnote', '');
    tools.appendChild(count);
    card.appendChild(tools);

    var legend = el('div', 'legend');
    c.legend.forEach(function (l) {
      var span = el('span');
      var sw = el('i');
      if (l.cls) { sw.className = 'cell ' + l.cls; sw.style.borderRadius = '3px'; }
      else { sw.style.boxShadow = 'inset 0 0 0 1px var(--grid)'; }
      span.appendChild(sw);
      span.appendChild(document.createTextNode(l.label));
      legend.appendChild(span);
    });
    card.appendChild(legend);

    var scroll = el('div', 'heat-scroll');
    var grid = el('div', 'heat');
    grid.style.gridTemplateColumns = 'minmax(128px, 210px) repeat(' + c.cols.length + ', minmax(' + (c.cols.length > 12 ? 58 : 66) + 'px, 1fr))';
    grid.appendChild(el('div', 'corner'));
    c.cols.forEach(function (col) {
      var h = el('div', 'hh', col.label);
      if (col.tip) h.setAttribute('data-tip', col.tip);
      grid.appendChild(h);
    });
    var rowNodes = [];
    c.rows.forEach(function (r) {
      var nodes = [];
      var rh = el('div', 'rh', r.label);
      if (r.tip) rh.setAttribute('data-tip', r.tip);
      nodes.push(rh);
      r.cells.forEach(function (cell, i) {
        var cn = el('div', 'cell' + (cell.c ? ' ' + cell.c : ' empty'), cell.t || '');
        cn.setAttribute('data-tip', (cell.tip || (r.label + ' × ' + c.cols[i].label + '\nno linkage recorded')));
        nodes.push(cn);
      });
      nodes.forEach(function (n) { grid.appendChild(n); });
      rowNodes.push({ text: (r.label + ' ' + (r.search || '')).toLowerCase(), nodes: nodes });
    });
    scroll.appendChild(grid);
    card.appendChild(scroll);

    function apply() {
      var q = search.value.trim().toLowerCase();
      var shown = 0;
      rowNodes.forEach(function (r) {
        var hit = !q || r.text.indexOf(q) !== -1;
        if (hit) shown++;
        r.nodes.forEach(function (n) { n.style.display = hit ? '' : 'none'; });
      });
      count.textContent = shown + ' of ' + rowNodes.length + ' rows';
    }
    search.addEventListener('input', apply);
    apply();
    return card;
  }

  function renderChart(c) {
    if (c.type === 'stack') return stackChart(c);
    if (c.type === 'heat') return heatChart(c);
    return barChart(c);
  }

  // ---- page assembly -------------------------------------------------------
  var statsHost = document.getElementById('stats');
  if (statsHost && PAGE.stats) {
    PAGE.stats.forEach(function (s) {
      var n = el('div', 'stat');
      n.appendChild(el('div', 'v', s.v));
      n.appendChild(el('div', 'k', s.k));
      if (s.h) n.appendChild(el('div', 'h', s.h));
      statsHost.appendChild(n);
    });
  }

  var chartHost = document.getElementById('sections');
  if (chartHost && PAGE.sections) {
    PAGE.sections.forEach(function (sec) {
      var s = el('section');
      s.appendChild(el('h2', null, sec.title));
      var grid = el('div', 'chart-grid' + (sec.wide ? ' one' : ''));
      sec.charts.forEach(function (c) { grid.appendChild(renderChart(c)); });
      s.appendChild(grid);
      chartHost.appendChild(s);
    });
  }

  // ---- table ---------------------------------------------------------------
  var T = PAGE.table;
  var tableHost = document.getElementById('table-host');
  if (T && tableHost) {
    var escapeHTML = function (s) {
      return String(s).replace(/[&<>"]/g, function (ch) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
      });
    };
    var chipFor = function (letter) {
      var map = { H: ['chip-h', 'High'], M: ['chip-m', 'Medium'], L: ['chip-l', 'Low'] };
      var m = map[letter];
      return '<span class="chip ' + m[0] + '" title="' + m[1] + ' confidence">' + letter + '</span>';
    };
    var decorate = function (raw) {
      var t = escapeHTML(raw);
      if (/^[HML]$/.test(raw)) return chipFor(raw);
      t = t.replace(/\((H|M|L)\)/g, function (_, l) { return chipFor(l); });
      t = t.replace(/\[WB\]/g, '<span class="tag" title="From the colleague’s whiteboard">WB</span>');
      return t;
    };

    var showAll = false;
    var tools = el('div', 'table-tools');
    var search = document.createElement('input');
    search.type = 'search';
    search.placeholder = 'Search all columns…';
    tools.appendChild(search);
    var note = el('span', 'toolnote', '');
    var toggle = null;
    if (T.emptyColumns && T.emptyColumns.length) {
      toggle = el('button', 'toolbtn', 'Show ' + T.emptyColumns.length + ' empty column' + (T.emptyColumns.length > 1 ? 's' : ''));
      toggle.setAttribute('data-tip', 'Columns with no values in any row:\n' + T.emptyColumns.join(', '));
      tools.appendChild(toggle);
    }
    tools.appendChild(note);
    tableHost.appendChild(tools);

    var scroll = el('div', 'table-scroll');
    var table = document.createElement('table');
    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    thead.appendChild(headRow);
    var tbody = document.createElement('tbody');
    table.appendChild(thead);
    table.appendChild(tbody);
    scroll.appendChild(table);
    tableHost.appendChild(scroll);

    var sortCol = -1, sortDir = 1, query = '';

    function visibleCols() {
      return T.columns.map(function (c, i) { return i; }).filter(function (i) {
        return showAll || T.emptyIdx.indexOf(i) === -1;
      });
    }
    function draw() {
      var cols = visibleCols();
      headRow.innerHTML = '';
      cols.forEach(function (i) {
        var th = el('th', null, T.columns[i] || '—');
        if (sortCol === i) {
          var ind = el('span', 'ind', sortDir > 0 ? ' ↑' : ' ↓');
          th.appendChild(ind);
        }
        th.addEventListener('click', function () {
          if (sortCol === i) { sortDir = -sortDir; } else { sortCol = i; sortDir = 1; }
          draw();
        });
        headRow.appendChild(th);
      });
      var terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      var rows = T.rows.filter(function (r) {
        if (!terms.length) return true;
        var hay = r.join(' ').toLowerCase();
        return terms.every(function (t) { return hay.indexOf(t) !== -1; });
      });
      if (sortCol >= 0) {
        rows = rows.slice().sort(function (a, b) {
          var x = a[sortCol] || '', y = b[sortCol] || '';
          var nx = parseFloat(x), ny = parseFloat(y);
          var numeric = !isNaN(nx) && !isNaN(ny) && /^[\d.,\s]+$/.test(x) && /^[\d.,\s]+$/.test(y);
          if (numeric) return (nx - ny) * sortDir;
          if (!x) return 1;
          if (!y) return -1;
          return x.localeCompare(y) * sortDir;
        });
      }
      tbody.innerHTML = rows.map(function (r) {
        return '<tr>' + cols.map(function (i) {
          var v = r[i] || '';
          var cls = /^[\d.]+$/.test(v) ? ' class="num"' : '';
          return '<td' + cls + '>' + decorate(v) + '</td>';
        }).join('') + '</tr>';
      }).join('');
      note.textContent = rows.length === T.rows.length
        ? fmt(T.rows.length) + ' rows · ' + cols.length + ' of ' + T.columns.length + ' columns'
        : fmt(rows.length) + ' of ' + fmt(T.rows.length) + ' rows';
    }
    search.addEventListener('input', function () { query = search.value; draw(); });
    if (toggle) {
      toggle.addEventListener('click', function () {
        showAll = !showAll;
        toggle.textContent = (showAll ? 'Hide ' : 'Show ') + T.emptyColumns.length + ' empty column' + (T.emptyColumns.length > 1 ? 's' : '');
        draw();
      });
    }
    draw();
  }
})();
"""


# ------------------------------------------------------------------ chart helpers

CONF_COLOR = {"H": "seq-2", "M": "seq-3", "L": "seq-5", "?": "neutral"}
CONF_CELL = {"H": "s2", "M": "s3", "L": "s5"}
COUNT_CELL = ["s5", "s4", "s3", "s2", "s1"]


def bar(title, sub, pairs, top=None, color="seq-3", tip=None, foot=None):
    items = list(pairs)
    if top:
        items = items[:top]
    return {
        "type": "bar",
        "title": title,
        "sub": sub,
        "color": color,
        "foot": foot,
        "items": [
            {"label": k, "value": v, "tip": (tip(k, v) if tip else f"{k}\n{v}")}
            for k, v in items
        ],
    }


def conf_stack(title, sub, buckets, top=None, tip=None, unit="linkages"):
    """buckets: OrderedDict[label] -> Counter of H/M/L/?."""
    items = []
    for label, counter in buckets.items():
        total = sum(counter.values())
        values = [counter.get(c, 0) for c in CONF_ORDER]
        detail = ", ".join(
            f"{counter[c]} {CONF_LABEL[c].lower()}" for c in CONF_ORDER if counter.get(c)
        )
        items.append(
            {
                "label": label,
                "values": values,
                "total": total,
                "tip": tip(label, counter) if tip else f"{label}\n{total} {unit}\n{detail}",
            }
        )
    items.sort(key=lambda i: (-i["total"], i["label"]))
    if top:
        items = items[:top]
    used = [i for i, c in enumerate(CONF_ORDER) if any(it["values"][i] for it in items)]
    for it in items:
        it["values"] = [it["values"][i] for i in used]
    return {
        "type": "stack",
        "title": title,
        "sub": sub,
        "series": [{"name": CONF_LABEL[CONF_ORDER[i]], "color": CONF_COLOR[CONF_ORDER[i]]} for i in used],
        "items": items,
    }


def sorted_counts(counter: Counter, top=None):
    pairs = sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))
    return pairs[:top] if top else pairs


def count_cell(n: int) -> str:
    """One shade per company count, 1 to 5+; darkest (or lightest, in dark mode) is 5+."""
    if n <= 0:
        return ""
    return COUNT_CELL[min(n, len(COUNT_CELL)) - 1]


# --------------------------------------------------------------------- templating

def esc(value: str) -> str:
    return html.escape(value, quote=True)


SHELL = r"""<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__</title>
<meta name="description" content="__DESC__">
<style>__CSS__</style>
</head>
<body>
<div class="masthead"><div class="masthead-in">
  <a class="brand" href="index.html">OA Universe <span>&middot; tab visualisations</span></a>
  <nav>__NAV__<button class="theme-toggle" id="theme" type="button" title="Light / dark / follow the system">Auto</button></nav>
</div></div>
<div class="wrap">
__BODY__
<footer class="page">
  Generated from <code>__SOURCE__</code> on __DATE__ by
  <code>scripts/data-hygiene/oa-universe/build_tab_visualisations.py</code>.
  The CSVs are the source of truth &mdash; edit those and re-run the script.
</footer>
</div>
<script>window.OA_PAGE = __DATA__;</script>
<script>__JS__</script>
</body>
</html>
"""


def render_shell(title, desc, nav_html, body, source, data) -> str:
    out = SHELL
    for token, value in (
        ("__TITLE__", esc(title)),
        ("__DESC__", esc(desc)),
        ("__NAV__", nav_html),
        ("__BODY__", body),
        ("__SOURCE__", esc(source)),
        ("__DATE__", date.today().strftime("%-d %B %Y")),
    ):
        out = out.replace(token, value)
    out = out.replace("__CSS__", CSS)
    out = out.replace("__DATA__", json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    out = out.replace("__JS__", JS)
    return out


def nav_for(pages, active_slug) -> str:
    bits = ['<a href="index.html"%s>Index</a>' % ("" if active_slug else ' aria-current="page"')]
    for page in pages:
        current = ' aria-current="page"' if page["slug"] == active_slug else ""
        bits.append(f'<a href="{page["slug"]}.html"{current}>{esc(page["nav"])}</a>')
    return "".join(bits)


def body_for(page, notes) -> str:
    notes_html = ""
    if notes:
        items = "".join(f"<li>{esc(n)}</li>" for n in notes)
        notes_html = (
            '<section><h2>Legend &amp; method notes (from the tab itself)</h2>'
            f'<div class="notes"><ul>{items}</ul></div></section>'
        )
    return f"""
<header class="page">
  <p class="crumbs"><a href="index.html">OA Universe tabs</a> &rsaquo; {esc(page["nav"])}</p>
  <h1>{esc(page["title"])}</h1>
  <p class="blurb">{page["blurb"]}</p>
  <p class="srcline">Source: <code>{esc(page["csv"])}</code> &middot;
     <a href="../{esc(page["csv"])}">open the CSV</a></p>
</header>
<div class="stats" id="stats"></div>
<div id="sections"></div>
<section><h2>Every row</h2><div id="table-host"></div></section>
{notes_html}
"""


CAT_COLORS = ["cat-1", "cat-2", "cat-3", "cat-4", "cat-5", "cat-6"]


def cat_stack(title, sub, buckets, series, top=None, unit="rows"):
    """buckets: OrderedDict[label] -> Counter of series names."""
    items = []
    for label, counter in buckets.items():
        total = sum(counter.values())
        detail = ", ".join(f"{counter[s]} {s.lower()}" for s in series if counter.get(s))
        items.append(
            {
                "label": label,
                "values": [counter.get(s, 0) for s in series],
                "total": total,
                "tip": f"{label}\n{total} {unit}\n{detail}",
            }
        )
    items.sort(key=lambda i: (-i["total"], i["label"]))
    if top:
        items = items[:top]
    used = [i for i in range(len(series)) if any(it["values"][i] for it in items)]
    for it in items:
        it["values"] = [it["values"][i] for i in used]
    return {
        "type": "stack",
        "title": title,
        "sub": sub,
        "series": [{"name": series[i], "color": CAT_COLORS[n % len(CAT_COLORS)]} for n, i in enumerate(used)],
        "items": items,
    }


def heat(title, sub, cols, rows, legend, filter_hint):
    return {
        "type": "heat",
        "title": title,
        "sub": sub,
        "filter": filter_hint,
        "cols": cols,
        "rows": rows,
        "legend": legend,
    }


SHORT_LABEL = {
    "Catering / FM": "Catering",
    "Maintenance / brownfield": "Maint.",
    "HUC / commissioning": "HUC",
    "Inspection / integrity": "Integrity",
    "Cranes / lifting": "Cranes",
    "Helicopters": "Heli.",
    "Marine supply / vessels": "Marine",
    "Crewing / labour hire": "Crewing",
    "ROV / subsea / IMR / diving": "ROV",
    "Construction / EPC / pipelay": "Constr.",
    "Decommissioning": "Decom.",
    "Survey / positioning": "Survey",
    "Other (chemist / emergency / medical)": "Other",
    "Esso (Bass Strait \u2192 Woodside)": "Esso",
    "Aus Govt (N. Endeavour)": "Aus Govt",
}


def head_col(name: str) -> dict:
    """A heatmap column header: abbreviated on screen, full text on hover."""
    return {"label": SHORT_LABEL.get(name, name), "tip": name}


CONF_LEGEND = [
    {"label": "High — documented contract or EA", "cls": "s2"},
    {"label": "Medium — company or industry evidence", "cls": "s3"},
    {"label": "Low — inferred or historic only", "cls": "s5"},
    {"label": "No linkage recorded", "cls": ""},
]


def count_legend(unit="companies"):
    return [
        {"label": "1 " + (unit[:-3] + "y" if unit.endswith("ies") else unit.rstrip("s")), "cls": "s5"},
        {"label": "2", "cls": "s4"},
        {"label": "3", "cls": "s3"},
        {"label": "4", "cls": "s2"},
        {"label": f"5 or more {unit}", "cls": "s1"},
        {"label": "none recorded", "cls": ""},
    ]


# ---------------------------------------------------------------- page builders

def build_key_assets(header, rows):
    by_op, by_sub, by_status, by_type = Counter(), Counter(), Counter(), Counter()
    op_assets = defaultdict(list)
    for r in rows:
        by_op[r[0] or "Unassigned"] += 1
        op_assets[r[0] or "Unassigned"].append(r[2])
        by_sub[r[5] or "Unstated"] += 1
        by_status[status_bucket(r[6])] += 1
        by_type[asset_type_bucket(r[4])] += 1
    operating = by_status.get("Operating", 0)
    winding = by_status.get("Decommissioning / decommissioned", 0) + by_status.get("Ceased / shut-in", 0)

    def op_tip(k, v):
        names = op_assets[k]
        shown = "\n".join("· " + n for n in names[:8])
        more = f"\n… and {len(names) - 8} more" if len(names) > 8 else ""
        return f"{k}\n{v} assets\n{shown}{more}"

    return {
        "stats": [
            {"v": len(rows), "k": "Assets and facilities", "h": "one row per asset"},
            {"v": len(by_op), "k": "Tier-1 operators"},
            {"v": operating, "k": "Operating now", "h": f"{round(operating / len(rows) * 100)}% of the universe"},
            {"v": winding, "k": "Ceased, shut-in or decommissioning"},
        ],
        "sections": [
            {
                "title": "Who holds the assets",
                "charts": [
                    bar("Assets by Tier-1 operator", "Operator of record on the tab", sorted_counts(by_op), tip=op_tip),
                    bar("Assets by sub-sector", "As recorded in the sub-sector column", sorted_counts(by_sub)),
                ],
            },
            {
                "title": "Lifecycle and facility type",
                "charts": [
                    bar("Assets by lifecycle status", "Status text bucketed by its leading term", sorted_counts(by_status)),
                    bar("Assets by facility type", "Asset-type text bucketed by facility class", sorted_counts(by_type)),
                ],
            },
        ],
    }


def build_asset_contractors(header, rows):
    per_asset, per_operator, per_company = OrderedDict(), defaultdict(Counter), defaultdict(Counter)
    company_assets = defaultdict(list)
    total_links = 0
    no_link = 0
    for r in rows:
        asset, operator = r[1], r[0] or "Unassigned"
        found = companies(r[4]) + companies(r[5]) + companies(r[6])
        if not found:
            no_link += 1
        counter = Counter(c["conf"] for c in found)
        per_asset[asset or "—"] = counter
        per_operator[operator].update(counter)
        total_links += len(found)
        for c in found:
            per_company[c["name"]][c["conf"]] += 1
            company_assets[c["name"]].append(asset)

    def company_tip(name, counter):
        assets = company_assets[name]
        shown = "\n".join("· " + a for a in assets[:8])
        more = f"\n… and {len(assets) - 8} more" if len(assets) > 8 else ""
        return f"{name}\n{sum(counter.values())} assets\n{shown}{more}"

    return {
        "stats": [
            {"v": len(rows), "k": "Assets profiled"},
            {"v": total_links, "k": "Asset × employer linkages"},
            {"v": len(per_company), "k": "Distinct employers named"},
            {"v": no_link, "k": "Assets with no employer found", "h": "usually unmanned or pre-FID"},
        ],
        "sections": [
            {
                "title": "Where the employers concentrate",
                "wide": True,
                "charts": [
                    conf_stack(
                        "Employers per asset",
                        "Marine key clients, offshore contractors and added employers combined, split by confidence",
                        per_asset,
                        top=20,
                        unit="employers",
                    ),
                ],
            },
            {
                "title": "Employer and operator reach",
                "charts": [
                    conf_stack(
                        "Assets per employer",
                        "Top 18 employers by number of assets they appear on",
                        per_company,
                        top=18,
                        tip=company_tip,
                        unit="assets",
                    ),
                    conf_stack(
                        "Linkages per Tier-1 operator",
                        "Every asset-level employer linkage, grouped by operator",
                        per_operator,
                        unit="linkages",
                    ),
                ],
            },
        ],
    }


def build_contractor_linkages(header, rows):
    conf, scope_counts = Counter(), Counter()
    added = 0
    with_offshore = 0
    with_onshore = 0
    for r in rows:
        conf[confidence_bucket(r[8])] += 1
        if "ADDED" in (r[2] or ""):
            added += 1
        for s in scopes_of(r[2]):
            scope_counts[s] += 1
        linked = (r[5] or "").strip().lower()
        if linked and not linked.startswith("none found"):
            with_offshore += 1
        if (r[4] or "—") not in {"—", "-", ""}:
            with_onshore += 1
    order = ["High", "Medium-High", "Medium", "Low-Medium", "Low", "None found"]
    ordered = [(k, conf[k]) for k in order if conf.get(k)] + [
        (k, v) for k, v in sorted_counts(conf) if k not in order
    ]
    return {
        "stats": [
            {"v": len(rows), "k": "Contractors researched"},
            {"v": added, "k": "Added from research", "h": "not on the original contractors tab"},
            {"v": with_offshore, "k": "With an offshore asset linked"},
            {"v": with_onshore, "k": "Also on an onshore facility"},
        ],
        "sections": [
            {
                "title": "How solid the linkages are",
                "charts": [
                    bar(
                        "Contractors by confidence",
                        "Leading confidence term on each row",
                        ordered,
                    ),
                    bar(
                        "Scopes claimed across the contractor list",
                        "A contractor holding several scopes counts once per scope",
                        sorted_counts(scope_counts),
                        top=14,
                    ),
                ],
            },
        ],
    }


def build_contractor_x_tier1(header, rows):
    operators = header[1:]
    per_op = OrderedDict((op, Counter()) for op in operators)
    per_contractor = OrderedDict()
    heat_rows = []
    total = 0
    unlinked = 0
    for r in rows:
        name = r[0]
        if not name:
            continue
        counter = Counter()
        cells = []
        links = []
        for i, op in enumerate(operators, start=1):
            v = (r[i] or "").strip().upper()
            if v in CONF_CELL:
                counter[v] += 1
                per_op[op][v] += 1
                total += 1
                links.append(f"{op} ({CONF_LABEL[v]})")
                cells.append(
                    {
                        "t": v,
                        "c": CONF_CELL[v],
                        "tip": f"{name} × {op}\n{CONF_LABEL[v]} confidence",
                    }
                )
            else:
                cells.append({"t": "", "c": "", "tip": f"{name} × {op}\nno linkage recorded"})
        if not counter:
            unlinked += 1
        per_contractor[name] = counter
        heat_rows.append(
            {
                "label": name,
                "tip": f"{name}\n{sum(counter.values())} operator linkages"
                + ("\n" + "\n".join("· " + l for l in links) if links else ""),
                "search": " ".join(links),
                "cells": cells,
            }
        )
    high = sum(c["H"] for c in per_contractor.values())
    return {
        "stats": [
            {"v": len(heat_rows), "k": "Contractors"},
            {"v": len(operators), "k": "Tier-1 operators"},
            {"v": total, "k": "Contractor × operator linkages"},
            {"v": unlinked, "k": "Contractors with no operator link", "h": "no offshore linkage found yet"},
        ],
        "sections": [
            {
                "title": "The matrix",
                "wide": True,
                "charts": [
                    heat(
                        "Contractor × Tier-1 operator",
                        "Every recorded linkage, shaded by confidence. Hover a cell for the detail; filter to a contractor or an operator name.",
                        [head_col(op) for op in operators],
                        heat_rows,
                        CONF_LEGEND,
                        "Filter contractors or operators…",
                    )
                ],
            },
            {
                "title": "Reach on each side of the matrix",
                "charts": [
                    conf_stack(
                        "Contractors per operator",
                        "How wide each Tier-1 operator's contractor base is",
                        per_op,
                        unit="contractors",
                    ),
                    conf_stack(
                        "Operators per contractor",
                        "Top 18 contractors by number of Tier-1 operators they work for",
                        per_contractor,
                        top=18,
                        unit="operators",
                    ),
                ],
            },
        ],
    }


def build_contractors(header, rows):
    scope, pairs = None, []
    for r in rows:
        if r[0]:
            scope = r[0]
        name = r[1].strip()
        if scope and name:
            pairs.append((scope, name))
    scopes = list(OrderedDict.fromkeys(s for s, _ in pairs))
    names = sorted({n for _, n in pairs}, key=str.lower)
    by_scope = Counter(s for s, _ in pairs)
    by_name = Counter(n for _, n in pairs)
    members = defaultdict(list)
    for s, n in pairs:
        members[s].append(n)
    lookup = {(s, n) for s, n in pairs}
    heat_rows = [
        {
            "label": n,
            "tip": f"{n}\n{by_name[n]} scope"
            + ("s" if by_name[n] != 1 else "")
            + "\n"
            + "\n".join("· " + s for s in scopes if (s, n) in lookup),
            "search": " ".join(s for s in scopes if (s, n) in lookup),
            "cells": [
                {"t": "●" if (s, n) in lookup else "", "c": "s3" if (s, n) in lookup else "", "tip": f"{n}\n{s}" if (s, n) in lookup else f"{n}\nnot listed under {s}"}
                for s in scopes
            ],
        }
        for n in names
    ]
    multi = sum(1 for n in names if by_name[n] > 1)
    return {
        "stats": [
            {"v": len(scopes), "k": "Scopes of work"},
            {"v": len(names), "k": "Distinct contractors"},
            {"v": len(pairs), "k": "Scope × contractor entries"},
            {"v": multi, "k": "Contractors in more than one scope"},
        ],
        "sections": [
            {
                "title": "The scope list",
                "charts": [
                    bar(
                        "Contractors per scope",
                        "As listed on the tab",
                        sorted_counts(by_scope),
                        tip=lambda k, v: f"{k}\n{v} contractors\n" + "\n".join("· " + m for m in members[k]),
                    ),
                    bar(
                        "Scopes per contractor",
                        "Contractors listed under more than one scope of work",
                        [(n, c) for n, c in sorted_counts(by_name) if c > 1],
                        tip=lambda k, v: f"{k}\n{v} scopes\n"
                        + "\n".join("· " + s for s in scopes if (s, k) in lookup),
                    ),
                ],
            },
            {
                "title": "Contractor × scope",
                "wide": True,
                "charts": [
                    heat(
                        "Which contractor is listed under which scope",
                        "A filled cell means the contractor appears under that scope on the tab",
                        [{"label": s, "tip": s} for s in scopes],
                        heat_rows,
                        [{"label": "Listed under this scope", "cls": "s3"}, {"label": "Not listed", "cls": ""}],
                        "Filter contractors or scopes…",
                    )
                ],
            },
        ],
    }


def build_facility_x_scope(header, rows):
    scope_cols = list(range(4, len(header)))
    scope_names = [header[i] for i in scope_cols]
    per_scope_conf = OrderedDict((header[i], Counter()) for i in scope_cols)
    per_scope_cells = Counter()
    per_facility_scopes = Counter()
    mentions = 0
    heat_rows = []
    for r in rows:
        facility = r[2] or r[0] or "—"
        cells, filled = [], 0
        for i in scope_cols:
            found = companies(r[i])
            if found:
                filled += 1
                mentions += len(found)
                per_scope_cells[header[i]] += 1
                for c in found:
                    per_scope_conf[header[i]][c["conf"]] += 1
            cells.append((found, header[i]))
        per_facility_scopes[facility] = filled
        heat_cells = []
        for found, scope_name in cells:
            if found:
                names = "\n".join(
                    "· " + c["name"] + (f" ({CONF_LABEL[c['conf']]})" if c["conf"] != "?" else "")
                    for c in found
                )
                heat_cells.append(
                    {
                        "t": str(len(found)),
                        "c": count_cell(len(found)),
                        "tip": f"{facility}\n{scope_name}\n{names}",
                    }
                )
            else:
                heat_cells.append({"t": "", "c": "", "tip": f"{facility}\n{scope_name}\nno company recorded"})
        heat_rows.append(
            {
                "label": facility,
                "tip": f"{facility}\n{r[0] or '—'} · {r[3] or 'status not stated'}\n{filled} of {len(scope_cols)} scopes filled",
                "search": " ".join(r),
                "cells": heat_cells,
            }
        )
    covered = sum(1 for v in per_facility_scopes.values() if v)
    return {
        "stats": [
            {"v": len(rows), "k": "Facilities"},
            {"v": len(scope_cols), "k": "Scopes of work"},
            {"v": mentions, "k": "Facility × scope × company entries"},
            {"v": covered, "k": "Facilities with at least one scope filled", "h": f"of {len(rows)}"},
        ],
        "sections": [
            {
                "title": "Who holds each scope at each facility",
                "wide": True,
                "charts": [
                    heat(
                        "Facility × scope",
                        "The number in each cell is how many companies hold that scope at that facility — hover for the names",
                        [head_col(s) for s in scope_names],
                        heat_rows,
                        count_legend("companies"),
                        "Filter facilities, operators or status…",
                    )
                ],
            },
            {
                "title": "Scope coverage",
                "charts": [
                    conf_stack(
                        "Company entries per scope",
                        "Every company named against a scope, split by confidence",
                        per_scope_conf,
                        unit="entries",
                    ),
                    bar(
                        "Scopes filled per facility",
                        "Facilities with the most complete scope picture",
                        sorted_counts(per_facility_scopes, top=18),
                        foot="A facility with no scopes filled is normally unmanned, pre-FID or ceased.",
                    ),
                ],
            },
        ],
    }


def build_key_clients(header, rows):
    by_contractor = Counter()
    by_presence, by_base, by_client = Counter(), Counter(), Counter()
    vessels = defaultdict(list)
    for r in rows:
        name = r[0] or "—"
        by_contractor[name] += 1
        vessels[name].append(r[1] or r[3] or "—")
        by_presence[presence_bucket(r[5])] += 1
        by_base[base_bucket(r[12])] += 1
        project = r[2] or ""
        client = project.split("—")[-1].strip() if "—" in project else "Not stated"
        by_client[client or "Not stated"] += 1
    current = by_presence.get("Current", 0)
    return {
        "stats": [
            {"v": len(by_contractor), "k": "Marine key clients"},
            {"v": len(rows), "k": "Vessel and facility rows"},
            {"v": current, "k": "Current in the North West", "h": "presence column reads 'current'"},
            {"v": by_base.get("Transient (mobilised per campaign)", 0), "k": "Transient (no standing base)"},
        ],
        "sections": [
            {
                "title": "The marine fleet",
                "charts": [
                    bar(
                        "Vessels and facilities per client",
                        "Rows on the tab, one per vessel or shore facility",
                        sorted_counts(by_contractor),
                        tip=lambda k, v: f"{k}\n{v} rows\n" + "\n".join("· " + x for x in vessels[k][:10]),
                    ),
                    bar("Presence in the region", "Presence text bucketed by its leading term", sorted_counts(by_presence)),
                ],
            },
            {
                "title": "Where the work and the people sit",
                "charts": [
                    bar("Tier-1 client behind the work", "Parsed from the project column", sorted_counts(by_client)),
                    bar(
                        "Australian base",
                        "Transient means mobilised per campaign — no standing local workforce",
                        sorted_counts(by_base),
                    ),
                ],
            },
        ],
    }


def build_operator_companies(header, rows):
    by_operator_cat = OrderedDict()
    by_operator_conf = OrderedDict()
    by_scope = Counter()
    by_company = Counter()
    companies_seen = set()
    categories = []
    for r in rows:
        operator = r[1] or "Unassigned"
        category = r[3] or "Other"
        if category not in categories:
            categories.append(category)
        by_operator_cat.setdefault(operator, Counter())[category] += 1
        conf = (r[8] or "").strip().upper()
        conf = conf if conf in CONF_CELL else "?"
        by_operator_conf.setdefault(operator, Counter())[conf] += 1
        for scope in scopes_of(r[4]) or ["Not stated"]:
            by_scope[scope] += 1
        by_company[r[2] or "—"] += 1
        companies_seen.add(r[2])
    categories = sorted(categories, key=lambda c: -sum(v.get(c, 0) for v in by_operator_cat.values()))
    high = sum(c.get("H", 0) for c in by_operator_conf.values())
    return {
        "stats": [
            {"v": len(rows), "k": "Operator × company pairs"},
            {"v": len(by_operator_cat), "k": "Operators"},
            {"v": len(companies_seen), "k": "Distinct companies"},
            {"v": high, "k": "High-confidence pairs", "h": f"{round(high / len(rows) * 100)}% of all pairs"},
        ],
        "sections": [
            {
                "title": "Each operator's company base",
                "charts": [
                    cat_stack(
                        "Companies per operator, by category",
                        "How each operator's base splits across the universe's company categories",
                        by_operator_cat,
                        categories,
                        unit="companies",
                    ),
                    conf_stack(
                        "Companies per operator, by confidence",
                        "The same pairs, shaded by how well evidenced they are",
                        by_operator_conf,
                        unit="companies",
                    ),
                ],
            },
            {
                "title": "Scopes and the companies working most operators",
                "charts": [
                    bar(
                        "Pairs per scope of work",
                        "A pair carrying several scopes counts once under each",
                        sorted_counts(by_scope, top=16),
                    ),
                    bar(
                        "Companies working the most operators",
                        "Count of operator pairs each company holds",
                        sorted_counts(by_company, top=16),
                    ),
                ],
            },
        ],
    }


VERDICT_STATUS = {
    "Consistent": "good",
    "New info — adopted": "good",
    "Our extra": "warning",
    "Their gap — we fill": "warning",
    "INCONSISTENT": "critical",
}


def build_reconciliation(header, rows):
    by_verdict, by_area, by_basis = Counter(), Counter(), Counter()
    decided = 0
    for r in rows:
        by_verdict[r[5] or "Not stated"] += 1
        by_area[r[1] or "Not stated"] += 1
        by_basis[r[7] or "Not stated"] += 1
        if (r[8] or "").strip():
            decided += 1
    return {
        "stats": [
            {"v": len(rows), "k": "Items reconciled"},
            {"v": by_verdict.get("Consistent", 0), "k": "Consistent with the colleague's matrix"},
            {"v": by_verdict.get("INCONSISTENT", 0), "k": "Inconsistent — needs a decision"},
            {"v": decided, "k": "Decisions recorded", "h": "Troy, 22 Sep 2026"},
        ],
        "sections": [
            {
                "title": "How the two maps compare",
                "charts": [
                    bar("Items by verdict", "One row per reconciled item", sorted_counts(by_verdict)),
                    bar("Items by area", "Where the differences cluster", sorted_counts(by_area)),
                ],
            },
            {
                "title": "What the verdicts rest on",
                "wide": True,
                "charts": [
                    bar("Items by evidentiary basis", "'Both' means the two maps agree on the source", sorted_counts(by_basis)),
                ],
            },
        ],
    }


def build_onshore(header, rows):
    by_location, by_facility, by_company = Counter(), Counter(), Counter()
    loc_companies = defaultdict(set)
    locations = []
    pairs = set()
    for r in rows:
        location, facility, company = r[0] or "—", r[1] or "—", r[2]
        if location not in locations:
            locations.append(location)
        by_location[location] += 1
        by_facility[facility] += 1
        if company:
            by_company[company] += 1
            loc_companies[location].add(company)
            pairs.add((company, location))
    names = sorted(by_company, key=str.lower)
    heat_rows = [
        {
            "label": n,
            "tip": f"{n}\n" + "\n".join("· " + l for l in locations if (n, l) in pairs),
            "search": " ".join(l for l in locations if (n, l) in pairs),
            "cells": [
                {
                    "t": "●" if (n, l) in pairs else "",
                    "c": "s3" if (n, l) in pairs else "",
                    "tip": f"{n}\n{l}" if (n, l) in pairs else f"{n}\nnot recorded at {l}",
                }
                for l in locations
            ],
        }
        for n in names
    ]
    return {
        "stats": [
            {"v": len(rows), "k": "Rows on the tab"},
            {"v": len(locations), "k": "Locations"},
            {"v": len(set(f for f in by_facility)), "k": "Facilities"},
            {"v": len(by_company), "k": "Companies"},
        ],
        "sections": [
            {
                "title": "The onshore footprint",
                "charts": [
                    bar(
                        "Companies per location",
                        "Distinct companies recorded at each location",
                        sorted_counts(Counter({l: len(loc_companies[l]) for l in locations})),
                        tip=lambda k, v: f"{k}\n{v} companies\n" + "\n".join("· " + c for c in sorted(loc_companies[k])),
                    ),
                    bar("Rows per facility", "One row per company at a facility", sorted_counts(by_facility)),
                ],
            },
            {
                "title": "Company × location",
                "wide": True,
                "charts": [
                    heat(
                        "Which company appears at which location",
                        "Companies working more than one onshore location are the ones worth a single canonical employer record",
                        [{"label": l, "tip": l} for l in locations],
                        heat_rows,
                        [{"label": "Recorded at this location", "cls": "s3"}, {"label": "Not recorded", "cls": ""}],
                        "Filter companies or locations…",
                    )
                ],
            },
        ],
    }


# ------------------------------------------------------------------------- pages

PAGES = [
    {
        "csv": "Offshore_Key_Assets.csv",
        "slug": "key-assets",
        "nav": "Key assets",
        "title": "Offshore key assets",
        "card": "The asset spine of the universe: every offshore facility, who operates it, what it produces and where it sits in its life.",
        "blurb": "One row per offshore facility in the North West and Bass Strait — operator, field, facility type, sub-sector and lifecycle status as at September 2026. Everything else in the workbook hangs off this list.",
        "build": build_key_assets,
    },
    {
        "csv": "Offshore_asset_contractors.csv",
        "slug": "asset-contractors",
        "nav": "Asset → contractors",
        "title": "Asset → contractors",
        "card": "The inverse view: for each asset, every employer with people on it, split by how well the linkage is evidenced.",
        "blurb": "For each offshore asset, the marine key clients, offshore contractors and newly added employers linked to it — with the confidence of each linkage in brackets. Assets with nothing linked are normally unmanned, planned or ceased.",
        "build": build_asset_contractors,
    },
    {
        "csv": "Offshore_contractor_linkages.csv",
        "slug": "contractor-linkages",
        "nav": "Contractor linkages",
        "title": "Contractor linkages",
        "card": "The research file behind every contractor: identified legal entity, scopes, assets, clients, evidence and sources.",
        "blurb": "The evidence base. One row per contractor with the entity actually identified, the scopes it holds, the assets and clients it links to, a confidence rating and the sources behind it.",
        "build": build_contractor_linkages,
    },
    {
        "csv": "Offshore_contractor_x_Tier_1.csv",
        "slug": "contractor-x-tier-1",
        "nav": "Contractor × Tier-1",
        "title": "Contractor × Tier-1 operator",
        "card": "The headline matrix — which contractor works which operator, shaded H / M / L by confidence.",
        "blurb": "The contractor-by-operator matrix, shaded by confidence. Read across a row for a contractor's client spread, down a column for an operator's contractor base.",
        "build": build_contractor_x_tier1,
    },
    {
        "csv": "Offshore_contractors.csv",
        "slug": "contractors",
        "nav": "Contractors by scope",
        "title": "Contractors by scope of work",
        "card": "The original scope list: which contractors sit under marine, drilling, catering, maintenance, ROV and the rest.",
        "blurb": "The starting contractor list, grouped by scope of work. Contractors appearing under several scopes — Programmed, OSM, AOS — are the labour-hire and multi-scope employers that need one canonical record, not one per scope.",
        "build": build_contractors,
    },
    {
        "csv": "Offshore_facility_x_scope.csv",
        "slug": "facility-x-scope",
        "nav": "Facility × scope",
        "title": "Facility × scope",
        "card": "Who holds each scope at each facility — catering, maintenance, helicopters, marine, drilling and the rest.",
        "blurb": "The scope-holder matrix: for every facility, which companies hold catering, maintenance, inspection, helicopters, marine supply, crewing, ROV, drilling, construction and decommissioning. Hover a cell for the companies behind the count.",
        "build": build_facility_x_scope,
    },
    {
        "csv": "Offshore_key_clients.csv",
        "slug": "key-clients",
        "nav": "Marine key clients",
        "title": "Marine key clients",
        "card": "The marine and subsea fleet: vessels, shore bases, service lines and whether the work is current, recent or historical.",
        "blurb": "One row per vessel or shore facility for the marine key clients — the pipelay, subsea and survey contractors that mobilise into the North West per campaign rather than holding a standing local workforce.",
        "build": build_key_clients,
    },
    {
        "csv": "Offshore_operator_companies.csv",
        "slug": "operator-companies",
        "nav": "Operator → companies",
        "title": "Operator → companies",
        "card": "One row per operator-company pair, tiered and categorised — the long table the whole universe reduces to.",
        "blurb": "The long form of the universe: one row per operator and company, with tier, category, scope, the basis of the link, the assets behind it and a confidence rating. This is the shape the database should hold.",
        "build": build_operator_companies,
    },
    {
        "csv": "Offshore_reconciliation.csv",
        "slug": "reconciliation",
        "nav": "Reconciliation",
        "title": "Reconciliation against the colleague's matrix",
        "card": "Item-by-item comparison with the whiteboard matrix: consistent, inconsistent, our extra, their gap — and what was decided.",
        "blurb": "Every point of difference between this universe and the colleague's September 2026 whiteboard matrix, with a verdict, the action taken and the decisions recorded on 22 September 2026.",
        "build": build_reconciliation,
    },
    {
        "csv": "onshore.csv",
        "slug": "onshore",
        "nav": "Onshore",
        "title": "Onshore facilities",
        "card": "The onshore counterpart: Barrow, Karratha, Onslow, Varanus and Darwin, and the companies on each.",
        "blurb": "The onshore facility list — location, facility, company and role. Companies appearing both here and offshore are the ones that need a single canonical employer record spanning both. Near-duplicate spellings on this tab (Ertech / ERTECH, Powertech / powertech, Co2 / C2O) come through as separate companies — they are the cleaning candidates.",
        "build": build_onshore,
    },
]


def table_payload(header, rows):
    columns = [h if h else "—" for h in header]
    empty_idx = [i for i in range(len(columns)) if not any((r[i] or "").strip() for r in rows)]
    return {
        "columns": columns,
        "rows": rows,
        "emptyColumns": [columns[i] for i in empty_idx],
        "emptyIdx": empty_idx,
    }


def build_index(meta) -> str:
    totals = {
        "rows": sum(m["rows"] for m in meta),
        "tabs": len(meta),
    }
    by_slug = {m["slug"]: m for m in meta}
    cards = []
    for page in PAGES:
        m = by_slug[page["slug"]]
        cards.append(
            f"""<a class="tabcard" href="{page['slug']}.html">
  <h3>{esc(page['title'])}</h3>
  <p>{esc(page['card'])}</p>
  <div class="meta"><span>{m['rows']} rows</span><span>{m['cols']} columns</span><span>{esc(page['csv'])}</span></div>
  <div class="go">Open &rarr;</div>
</a>"""
        )
    body = f"""
<header class="page">
  <h1>OA Universe — the September 2026 sector map</h1>
  <p class="blurb">Ten worksheet tabs describing the offshore oil and gas universe off Australia&rsquo;s North West and
  in Bass Strait: the assets, the operators, the contractors on them, and how well each linkage is evidenced.
  Each page below charts one tab and carries its full table, searchable and sortable.</p>
  <p class="srcline">Source: <code>docs/data-architecture/reference/oa-universe-tabs/*.csv</code>, one CSV per workbook tab.</p>
</header>
<div class="stats" id="stats"></div>
<section><h2>The tabs</h2><div class="cards">{''.join(cards)}</div></section>
<div id="sections"></div>
<section><h2>How to read these pages</h2><div class="notes"><ul>
  <li>Confidence follows the workbook&rsquo;s own scale, shown as a chip on every page:
      <span class="chip chip-h">H</span> high &mdash; a documented contract or enterprise agreement;
      <span class="chip chip-m">M</span> medium &mdash; company or industry evidence, with the facility or currency unconfirmed;
      <span class="chip chip-l">L</span> low &mdash; inferred or historic only.</li>
  <li>A <span class="tag">WB</span> tag marks a fact that came from the colleague&rsquo;s whiteboard matrix rather than desk research.</li>
  <li>An empty matrix cell means <em>no linkage recorded</em> &mdash; not that none exists. The reconciliation tab tracks the known gaps.</li>
  <li>Charts bucket the free-text status, confidence and presence columns by their leading term, so
      &ldquo;Operating (first gas Feb 2025)&rdquo; counts as Operating. The full text is always in the table underneath.</li>
  <li>Every page has a searchable table of the underlying rows; columns with no values on a tab are hidden behind a toggle.</li>
  <li>These pages are generated. Edit the CSVs, then re-run
      <code>python3 scripts/data-hygiene/oa-universe/build_tab_visualisations.py</code>.</li>
</ul></div></section>
"""
    data = {
        "stats": [
            {"v": totals["tabs"], "k": "Workbook tabs"},
            {"v": totals["rows"], "k": "Data rows across the universe"},
            {"v": by_slug["key-assets"]["rows"], "k": "Offshore assets"},
            {"v": by_slug["contractor-linkages"]["rows"], "k": "Contractors researched"},
        ],
        "sections": [
            {
                "title": "Size of each tab",
                "wide": True,
                "charts": [
                    bar(
                        "Data rows per tab",
                        "Legend and method rows excluded — they are reproduced at the foot of each page",
                        [(m["nav"], m["rows"]) for m in sorted(meta, key=lambda m: -m["rows"])],
                        tip=lambda k, v: f"{k}\n{v} rows",
                    )
                ],
            }
        ],
    }
    return render_shell(
        "OA Universe — tab visualisations",
        "Charts and searchable tables for each tab of the September 2026 OA Universe sector map.",
        nav_for(PAGES, None),
        body,
        "docs/data-architecture/reference/oa-universe-tabs/*.csv",
        data,
    )


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    meta = []
    for page in PAGES:
        header, rows, notes = read_tab(SRC / page["csv"])
        built = page["build"](header, rows)
        data = {
            "stats": built["stats"],
            "sections": built["sections"],
            "table": table_payload(header, rows),
        }
        html_out = render_shell(
            f"{page['title']} — OA Universe",
            page["card"],
            nav_for(PAGES, page["slug"]),
            body_for(page, notes),
            page["csv"],
            data,
        )
        (OUT / f"{page['slug']}.html").write_text(html_out, encoding="utf-8")
        meta.append({"slug": page["slug"], "nav": page["nav"], "rows": len(rows), "cols": len(header)})
        print(f"  {page['slug']+'.html':<28} {len(rows):>4} rows  {len(header):>2} cols")
    (OUT / "index.html").write_text(build_index(meta), encoding="utf-8")
    print(f"  {'index.html':<28} {len(meta):>4} tabs")
    print(f"\nWrote {len(meta) + 1} pages to {OUT.relative_to(REPO)}/")


if __name__ == "__main__":
    main()
