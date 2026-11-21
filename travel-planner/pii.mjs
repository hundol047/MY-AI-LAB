// 개인정보 암호화 저장 (서버): 이메일·이름·연락처·자유 입력 글을 데이터베이스에 그대로 두지 않는다.
// - 암호화: AES-256-GCM (값마다 새 IV, 위조하면 풀리지 않음). 저장 모양 "enc1:<base64(iv|암호문|태그)>"
// - 찾기용 색인: 이메일처럼 "같은 값이 있는지" 찾아야 하는 것은 HMAC-SHA256 값으로만 찾는다(원래 값을 거꾸로 알 수 없음)
// - 키: 환경변수 DATA_ENCRYPTION_KEY(32자 이상, 운영 권장 — 데이터베이스·백업과 다른 곳에 보관됨)
//        없으면 DATA_KEY_FILE 또는 데이터 폴더의 data-key 파일(무작위 32바이트, 권한 600)을 만들어 쓴다
//   → 데이터베이스 파일이나 백업만 빼 가서는 개인정보를 읽을 수 없다. 키를 잃으면 운영자도 못 읽으므로 키를 따로 보관한다.
import { createCipheriv, createDecipheriv, createHmac, randomBytes, hkdfSync } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PREFIX = "enc1:";
const here = path.dirname(fileURLToPath(import.meta.url));
export const defaultKeyFile = () => process.env.DATA_KEY_FILE || path.join(path.dirname(process.env.APP_DB_PATH || path.join(here, ".local", "app.sqlite")), "data-key");

function masterKey({ secret = process.env.DATA_ENCRYPTION_KEY, keyFile = defaultKeyFile() } = {}) {
  if (secret) {
    if (String(secret).length < 32) throw new Error("DATA_ENCRYPTION_KEY는 32자 이상이어야 합니다");
    return { key: Buffer.from(String(secret)), source: "env" };
  }
  if (existsSync(keyFile)) {
    const k = Buffer.from(readFileSync(keyFile, "utf8").trim(), "base64");
    if (k.length !== 32) throw new Error(`암호화 키 파일이 올바르지 않습니다: ${keyFile}`);
    return { key: k, source: "file" };
  }
  mkdirSync(path.dirname(keyFile), { recursive: true, mode: 0o700 });
  const k = randomBytes(32);
  writeFileSync(keyFile, k.toString("base64") + "\n", { mode: 0o600, flag: "wx" });
  chmodSync(keyFile, 0o600);
  return { key: k, source: "new-file" };
}

const cache = new Map();
/** 같은 키 설정이면 같은 객체를 돌려준다 (백업에서 되살릴 때도 같은 키) */
export function createPII(opts = {}) {
  const id = JSON.stringify([opts.secret ?? process.env.DATA_ENCRYPTION_KEY ?? null, opts.keyFile ?? defaultKeyFile()]);
  if (cache.has(id)) return cache.get(id);
  const { key, source } = masterKey(opts);
  if (source === "new-file" && !opts.quiet) console.warn("개인정보 암호화 키를 새로 만들었습니다. 운영에서는 DATA_ENCRYPTION_KEY 환경변수를 쓰고 키를 따로 보관하세요.");
  const encKey = Buffer.from(hkdfSync("sha256", key, Buffer.alloc(32), "bopok-pii-enc-v1", 32));
  const idxKey = Buffer.from(hkdfSync("sha256", key, Buffer.alloc(32), "bopok-pii-index-v1", 32));
  const api = {
    source,
    isSealed: (v) => typeof v === "string" && v.startsWith(PREFIX),
    /** 문자열 → 암호문. null·빈 값은 그대로 */
    seal(v) {
      if (v == null || v === "") return v;
      const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", encKey, iv);
      const ct = Buffer.concat([c.update(String(v), "utf8"), c.final()]);
      return PREFIX + Buffer.concat([iv, ct, c.getAuthTag()]).toString("base64");
    },
    /** 암호문 → 문자열. 예전에 그대로 저장된 값은 그대로 돌려준다(옮겨 담는 중) */
    open(v) {
      if (!api.isSealed(v)) return v;
      const b = Buffer.from(v.slice(PREFIX.length), "base64");
      const d = createDecipheriv("aes-256-gcm", encKey, b.subarray(0, 12));
      d.setAuthTag(b.subarray(b.length - 16));
      return Buffer.concat([d.update(b.subarray(12, b.length - 16)), d.final()]).toString("utf8");
    },
    sealJSON: (o) => api.seal(JSON.stringify(o)),
    openJSON: (v) => JSON.parse(api.open(v)),
    /** 찾기용 색인 (HMAC-SHA256, hex) */
    index: (v) => createHmac("sha256", idxKey).update(String(v)).digest("hex"),
  };
  cache.set(id, api);
  return api;
}
