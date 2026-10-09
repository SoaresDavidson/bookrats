// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: book;

const BASE = "https://bookrats.<domain>";
const TOKEN = "";

const COLORS = ["#2F6FEB", "#E8590C"];
const REFRESH_MIN = 15;
const CACHE_FILE = "bookrats.json";

// --- helpers start
function pct(p) {
  return p === null || p === undefined ? "sem dados" : Math.round(p * 100) + "%";
}

function sessionText(s) {
  return s ? Math.round(s.from * 100) + "% → " + Math.round(s.to * 100) + "%" : "";
}

function ago(iso, now) {
  if (!iso) return "sem dados";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "sem dados";
  const n = now || new Date();
  const min = Math.max(0, Math.floor((n.getTime() - t) / 60000));
  if (min < 60) return "há " + min + " min";
  const h = Math.floor(min / 60);
  if (h < 24) return "há " + h + " h";
  const d = Math.floor(h / 24);
  return d === 1 ? "há 1 dia" : "há " + d + " dias";
}
// --- helpers end

function cachePath() {
  const fm = FileManager.local();
  return fm.joinPath(fm.documentsDirectory(), CACHE_FILE);
}

function readCache() {
  try {
    const fm = FileManager.local();
    const p = cachePath();
    if (!fm.fileExists(p)) return null;
    return JSON.parse(fm.readString(p));
  } catch (e) {
    return null;
  }
}

function writeCache(data) {
  try {
    FileManager.local().writeString(cachePath(), JSON.stringify(data));
  } catch (e) {}
}

// Returns {summary, stale, error}; error is "auth" | "offline" | null
async function loadSummary() {
  try {
    const req = new Request(BASE + "/api/summary");
    req.headers = { Authorization: "Bearer " + TOKEN };
    req.timeoutInterval = 15;
    let json = null;
    try {
      json = await req.loadJSON();
    } catch (e) {
      if (req.response && req.response.statusCode === 401) return { summary: null, stale: false, error: "auth" };
      throw e;
    }
    const code = req.response ? req.response.statusCode : 0;
    if (code === 401) return { summary: null, stale: false, error: "auth" };
    if (code >= 200 && code < 300 && json && Array.isArray(json.readers)) {
      writeCache(json);
      return { summary: json, stale: false, error: null };
    }
  } catch (e) {}
  const cached = readCache();
  if (cached) return { summary: cached, stale: true, error: null };
  return { summary: null, stale: false, error: "offline" };
}

function urlHash(url) {
  let h = 5381;
  for (let i = 0; i < url.length; i++) h = ((h * 33) ^ url.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

// Returns an Image for the cover URL (cached on disk) or null on any failure.
async function loadCover(url) {
  if (!url) return null;
  try {
    const fm = FileManager.local();
    const path = fm.joinPath(fm.documentsDirectory(), "bookrats-cover-" + urlHash(url) + ".img");
    if (fm.fileExists(path)) return fm.readImage(path);
    const img = await new Request(url).loadImage();
    if (!img) return null;
    try {
      fm.writeImage(path, img);
    } catch (e) {}
    return img;
  } catch (e) {
    return null;
  }
}

function barImage(p, color, width, height) {
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const r = height / 2;
  const dark = Device.isUsingDarkAppearance();
  ctx.setFillColor(dark ? new Color("#FFFFFF", 0.18) : new Color("#000000", 0.12));
  const track = new Path();
  track.addRoundedRect(new Rect(0, 0, width, height), r, r);
  ctx.addPath(track);
  ctx.fillPath();
  if (p !== null && p !== undefined) {
    const w = Math.max(height, Math.min(1, Math.max(0, p)) * width);
    ctx.setFillColor(new Color(color));
    const fill = new Path();
    fill.addRoundedRect(new Rect(0, 0, w, height), r, r);
    ctx.addPath(fill);
    ctx.fillPath();
  }
  return ctx.getImage();
}

function message(widget, text) {
  const t = widget.addText(text);
  t.font = Font.semiboldSystemFont(14);
  t.textColor = Color.dynamic(new Color("#111111"), new Color("#EEEEEE"));
  t.minimumScaleFactor = 0.7;
}

function buildWidget(summary, stale, error, cover) {
  const widget = new ListWidget();
  widget.backgroundColor = Color.dynamic(new Color("#FFFFFF"), new Color("#1C1C1E"));
  widget.url = BASE + "/app/";
  widget.refreshAfterDate = new Date(Date.now() + REFRESH_MIN * 60 * 1000);
  widget.setPadding(12, 14, 12, 14);

  const family = config.widgetFamily || "medium";
  const small = family === "small";
  if (family.indexOf("accessory") === 0) { message(widget, "Use o widget pequeno ou médio"); return widget; }
  const textColor = Color.dynamic(new Color("#111111"), new Color("#F2F2F7"));
  const subColor = Color.dynamic(new Color("#6B6B70"), new Color("#9A9AA0"));

  if (error === "auth") { message(widget, "token inválido"); return widget; }
  if (error === "offline" || !summary) { message(widget, "Sem conexão"); return widget; }

  if (!summary.reading) {
    message(widget, "Nenhuma leitura ativa");
  } else {
    let body = widget;
    if (!small && cover) {
      const outer = widget.addStack();
      outer.layoutHorizontally();
      outer.centerAlignContent();
      const ci = outer.addImage(cover);
      ci.imageSize = new Size(60, 90);
      ci.cornerRadius = 6;
      outer.addSpacer(12);
      body = outer.addStack();
      body.layoutVertically();
    }
    const title = body.addText(summary.reading.title || "");
    title.font = Font.semiboldSystemFont(small ? 13 : 15);
    title.textColor = textColor;
    title.lineLimit = 1;
    body.addSpacer(6);

    const barW = small ? 120 : (cover ? 190 : 260);
    summary.readers.slice(0, 2).forEach(function (r, i) {
      const rc = r.color;
      const color = rc ? (Device.isUsingDarkAppearance() ? rc.dark : rc.light) : (COLORS[i] || COLORS[0]);
      const row = body.addStack();
      row.layoutVertically();
      const img = row.addImage(barImage(r.percentage, color, barW, 8));
      img.imageSize = new Size(barW, 8);
      img.resizable = true;
      row.addSpacer(2);
      let line = r.name + " " + pct(r.percentage);
      if (!small) {
        const parts = [];
        const s = sessionText(r.last_session);
        if (s) parts.push(s);
        if (r.updated_at) parts.push(ago(r.updated_at));
        if (parts.length) line += " · " + parts.join(" · ");
      }
      const t = row.addText(line);
      t.font = Font.systemFont(small ? 11 : 12);
      t.textColor = color;
      t.lineLimit = 1;
      t.minimumScaleFactor = 0.8;
      body.addSpacer(5);
    });
  }

  if (stale) {
    widget.addSpacer();
    const f = widget.addText("desatualizado");
    f.font = Font.italicSystemFont(10);
    f.textColor = subColor;
  }
  return widget;
}

async function main() {
  const res = await loadSummary();
  const family = config.widgetFamily || "medium";
  const cover = res.summary && res.summary.reading && family !== "small"
    ? await loadCover(res.summary.reading.cover_url) : null;
  const widget = buildWidget(res.summary, res.stale, res.error, cover);
  if (config.runsInWidget) {
    Script.setWidget(widget);
  } else {
    await widget.presentMedium();
  }
  Script.complete();
}

await main();
