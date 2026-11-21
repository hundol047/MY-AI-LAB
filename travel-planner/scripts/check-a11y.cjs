// 접근성 자동 점검 (axe-core, WCAG 2.1 AA): 첫 안내·첫 화면·일정 결과·설정·계정 화면을 밝게/어둡게 열어 위반을 센다.
// 걸음이 불편한 분·어르신을 위한 앱이라 글자 대비·제목 순서·버튼 이름이 특히 중요하다.
// 실행: node scripts/check-a11y.cjs   (Playwright 필요, 위반이 있으면 종료 코드 1)
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const root = path.join(__dirname, "..", "public");
const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(new URL(q.url, "http://x").pathname)); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.writeHead(404).end(); r.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r); });
srv.listen(0, async () => {
  const B = `http://127.0.0.1:${srv.address().port}/`;
  const b = await chromium.launch();
  let total = 0;
  for (const scheme of ["light", "dark"]) {
    const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, locale: "ko-KR", serviceWorkers: "block", colorScheme: scheme })).newPage();
    const run = async (label) => {
      await p.addScriptTag({ content: axeSrc });
      const v = await p.evaluate(async () => (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] })).violations.map((x) => `${x.impact} ${x.id} ×${x.nodes.length}: ${x.help} (${x.nodes[0].target.join(" ")})`));
      total += v.length; console.log(`${v.length ? "✗" : "ok"} ${scheme} ${label}${v.length ? "\n  " + v.join("\n  ") : ""}`);
    };
    await p.goto(B + "index.html"); await p.waitForTimeout(2500); await run("첫 안내");
    await p.click("#welcomeGo"); await p.waitForTimeout(400); await run("첫 화면");
    await p.evaluate(() => { [...document.querySelectorAll("#form button")].find((x) => /걷기 힘들어요/.test(x.textContent))?.click(); document.querySelector("#form").requestSubmit(); });
    await p.waitForTimeout(6500); await p.evaluate(() => document.querySelector("#options:not([hidden]) button")?.click()); await p.waitForTimeout(3000); await run("일정 결과");
    await p.click("#settingsBtn"); await p.waitForTimeout(500); await run("설정");
    await p.goto(B + "account.html"); await p.waitForTimeout(1500); await run("계정");
  }
  await b.close(); srv.close();
  process.exit(total ? 1 : 0);
});
