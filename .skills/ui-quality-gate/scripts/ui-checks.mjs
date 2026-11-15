// Browser checks that Lighthouse misses on this dashboard.
// Usage: node ui-checks.mjs <puppeteer-core dir> [url]
const [, , pptr, url = "http://localhost:4173"] = process.argv;
if (!pptr) {
  console.error("usage: node ui-checks.mjs <puppeteer-core dir> [url]");
  process.exit(2);
}
const { default: puppeteer } = await import(`${pptr}/lib/esm/puppeteer/puppeteer-core.js`);
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const settle = () => new Promise((r) => setTimeout(r, 2500));
const report = {};

// 1. Keyboard, names, headings, contrast (desktop).
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(url, { waitUntil: "networkidle0" });
  await settle();
  // Tab until focus leaves the page (back to <body>); each stop needs a name.
  report.tabStops = [];
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const name = el.getAttribute("aria-label")
        || el.querySelector?.(":scope > title")?.textContent
        || (el.tagName !== "svg" ? el.textContent?.trim().slice(0, 40) : "")
        || "";
      return `${el.tagName.toLowerCase()}${el.getAttribute("role") ? `[role=${el.getAttribute("role")}]` : ""}: "${name}"`;
    });
    if (stop === null) break;
    report.tabStops.push(stop);
  }
  const tree = await page.accessibility.snapshot({ interestingOnly: false });
  report.outline = [];
  (function walk(n) {
    if (!n) return;
    if (n.role === "heading") report.outline.push(`h${n.level} ${n.name}`);
    if (n.role === "table") report.outline.push(`table "${n.name}"`);
    (n.children ?? []).forEach(walk);
  })(tree);
  report.contrast = await page.evaluate(() => {
    const ctx = document.createElement("canvas").getContext("2d");
    const rgb = (c) => { ctx.fillStyle = "#000"; ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3); };
    const lum = (c) => { const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); const [r, g, b] = rgb(c); return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return +((x + 0.05) / (y + 0.05)).toFixed(2); };
    const card = getComputedStyle(document.querySelector("[data-slot=card]")).backgroundColor;
    const rows = [];
    for (const [label, sel, prop] of [
      ["KPI label", "[data-slot=card] span.uppercase", "color"],
      ["KPI helper", "[data-slot=card] p.text-xs", "color"],
      ["card description", "[data-slot=card-description]", "color"],
      ["chart tick (SVG)", ".recharts-text", "fill"],
    ]) {
      const el = document.querySelector(sel);
      if (el) rows.push({ label, size: getComputedStyle(el).fontSize, ratio: ratio(getComputedStyle(el)[prop], card) });
    }
    return rows;
  });
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.reload({ waitUntil: "domcontentloaded" });
  report.reducedMotionSkeleton = await page.evaluate(() => {
    const s = document.querySelector("[data-slot=skeleton]");
    return s ? getComputedStyle(s).animationName : "no skeleton on screen";
  });
  await page.close();
}

// 2. First paint without JavaScript.
{
  const page = await browser.newPage();
  await page.setJavaScriptEnabled(false);
  await page.goto(url, { waitUntil: "load" });
  report.firstPaintNoJs = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.close();
}

// 3. Layout shifts with their source nodes (core-web-vitals references/CLS.md).
report.layoutShifts = {};
for (const [w, h, mobile] of [[412, 823, true], [1280, 900, false]]) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, isMobile: mobile, deviceScaleFactor: mobile ? 1.75 : 1 });
  const cdp = await page.createCDPSession();
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 200_000, uploadThroughput: 94_000 });
  await page.evaluateOnNewDocument(() => {
    window.__shifts = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue;
        window.__shifts.push({
          value: +e.value.toFixed(4),
          sources: (e.sources ?? []).map((s) => `${s.node?.tagName?.toLowerCase() ?? "?"} y ${Math.round(s.previousRect.y)}→${Math.round(s.currentRect.y)} h ${Math.round(s.previousRect.height)}→${Math.round(s.currentRect.height)}`),
        });
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto(url, { waitUntil: "networkidle0" });
  await settle();
  const shifts = await page.evaluate(() => window.__shifts);
  report.layoutShifts[`${w}x${h}`] = { cls: +shifts.reduce((a, s) => a + s.value, 0).toFixed(4), shifts };
  await page.close();
}

console.log(JSON.stringify(report, null, 2));
await browser.close();
