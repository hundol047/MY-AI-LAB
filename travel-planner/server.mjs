// 정적 파일 서빙 + 자연어 요청 해석 API (Claude)
// AI는 사용자의 말을 "조건"으로만 바꾸고, 실제 장소 선택·시간 계산은 검증된 데이터 기반 엔진이 한다.
// 그래서 존재하지 않는 장소나 문 닫은 곳이 일정에 들어갈 수 없다.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, "public");
const PORT = Number(process.env.PORT || 8080);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};

const CATS = ["sea", "cafe", "food", "culture", "nature"];
const SCHEMA = {
  type: "object",
  properties: {
    prefer: { type: "array", items: { type: "string", enum: CATS } },
    avoid: { type: "array", items: { type: "string", enum: CATS } },
    indoor: { type: "boolean" },
    lessWalk: { type: "boolean" },
    pace: { type: "string", enum: ["relaxed", "normal", "packed"] },
    summary: { type: "string" },
  },
  required: ["prefer", "avoid", "indoor", "lessWalk", "pace", "summary"],
  additionalProperties: false,
};

const SYSTEM = `강릉 여행 일정 서비스의 요청 해석기다. 사용자가 일정에 대해 한 말을 조건으로 바꾼다.
카테고리: sea(바다·해변), cafe(카페), food(식사·시장), culture(역사·문화·전시), nature(자연·산책).
- prefer: 더 원하는 카테고리. avoid: 빼고 싶은 카테고리.
- indoor: 비·눈·추위·더위·미세먼지 등으로 실내 위주가 나을 때 true.
- lessWalk: 걷기 힘듦, 아이·어르신 체력, 피곤함 등이면 true.
- pace: 여유 있게=relaxed, 더 많이=packed, 언급 없으면 현재 값 유지.
- summary: 바뀐 점을 15자 안팎 한국어 한 문장으로.
현재 조건을 기준으로, 사용자가 언급하지 않은 항목은 현재 값을 유지한다.`;

let client = null;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

async function interpret(text, current) {
  const response = await getClient().beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 2000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{
      role: "user",
      content: `현재 조건: ${JSON.stringify(current)}\n사용자 요청: ${text}`,
    }],
  });
  if (response.stop_reason === "refusal") throw new Error("refused");
  const block = response.content.find((b) => b.type === "text");
  if (!block) throw new Error("empty");
  return JSON.parse(block.text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 10_000) req.destroy(); });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (req.method === "POST" && url.pathname === "/api/adjust") {
    try {
      const { text, current } = JSON.parse(await readBody(req));
      if (typeof text !== "string" || !text.trim() || text.length > 300) {
        res.writeHead(400).end();
        return;
      }
      const result = await interpret(text.trim(), current || {});
      res.writeHead(200, { "content-type": MIME[".json"] }).end(JSON.stringify(result));
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) console.error("Anthropic 인증 실패: ANTHROPIC_API_KEY를 확인하세요.");
      else if (err instanceof Anthropic.RateLimitError) console.error("요청 한도 초과");
      else if (err instanceof Anthropic.APIError) console.error(`API 오류 ${err.status}: ${err.message}`);
      else console.error(err.message);
      res.writeHead(503).end();
    }
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405).end(); return; }

  const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});

server.listen(PORT, () => console.log(`http://localhost:${PORT}`));
