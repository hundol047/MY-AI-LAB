// 개인정보 암호화 저장: 암호화·위조 거부·색인, 예약 신청의 이름·연락처가 데이터베이스 파일에 그대로 남지 않는지, 예전 자료 옮겨 담기, 키 파일
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { createPII } from "../pii.mjs";
import { createServices } from "../services.mjs";

const dir = mkdtempSync(path.join(tmpdir(), "pii-"));
try {
  const pii = createPII({ secret: "unit-test-secret-".repeat(3), quiet: true });
  const s = pii.seal("홍길동 010-1234-5678");
  assert.ok(s.startsWith("enc1:") && !s.includes("홍길동"));
  assert.notEqual(pii.seal("같은 값"), pii.seal("같은 값"), "값마다 새 IV");
  assert.equal(pii.open(s), "홍길동 010-1234-5678");
  assert.equal(pii.open("예전 평문"), "예전 평문", "예전 값은 그대로 읽음");
  assert.equal(pii.seal(""), ""); assert.equal(pii.seal(null), null);
  const bad = s.slice(0, -4) + (s.endsWith("AAAA") ? "BBBB" : "AAAA");
  assert.throws(() => pii.open(bad), "고친 암호문은 거부");
  assert.equal(pii.index("a@b.kr"), pii.index("a@b.kr")); assert.notEqual(pii.index("a@b.kr"), pii.index("a@b.kr "));
  const other = createPII({ secret: "another-secret-value-".repeat(2), quiet: true });
  assert.throws(() => other.open(s), "다른 키로는 못 엶"); assert.notEqual(other.index("a@b.kr"), pii.index("a@b.kr"));
  assert.throws(() => createPII({ secret: "short" }), /32자/);
  // 키 파일: 없으면 만들고(권한 600) 다음에도 같은 키
  const kf = path.join(dir, "keys", "data-key");
  const f1 = createPII({ secret: "", keyFile: kf, quiet: true });
  assert.ok(existsSync(kf)); assert.equal(statSync(kf).mode & 0o777, 0o600);
  const sealedF = f1.seal("x"); 
  assert.equal(createPII({ secret: "", keyFile: kf, quiet: true }).open(sealedF), "x");

  // 예약 신청: 데이터베이스 파일(과 WAL)에 이름·연락처 원문이 없다
  const file = path.join(dir, "app.sqlite");
  const store = createServices(file, { pii });
  const token = randomBytes(32).toString("base64url"), key = randomBytes(24).toString("base64url");
  const day = new Date(Date.now() + 9 * 3600e3 + 7 * 864e5).toISOString().slice(0, 10), next = new Date(Date.now() + 9 * 3600e3 + 8 * 864e5).toISOString().slice(0, 10);
  const b = store.create({ kind: "lodging", product: "경포 숙소", name: "김보폭", contact: "bopok.secret@example.com", date: day, endDate: next, people: 2, consent: true }, key, token);
  assert.equal(store.get(b.id, token).request.name, "김보폭", "본인 조회는 그대로");
  assert.equal(store.listBookings()[0].request.contact, "bopok.secret@example.com", "운영자 화면은 그대로");
  store.addPlaceReport({ place: "gyeongpo", kind: "other", note: "제 번호 010-9999-8888로 연락 주세요" });
  assert.match(store.placeReports()[0].note, /010-9999-8888/);
  store.close?.();
  const raw = ["", "-wal"].map((x) => { try { return readFileSync(file + x).toString("latin1"); } catch { return ""; } }).join("");
  for (const secret of ["김보폭", "bopok.secret@example.com", "010-9999-8888"]) assert.equal(raw.includes(Buffer.from(secret).toString("latin1")), false, `파일에 원문 없음: ${secret}`);

  // 예전 평문 자료는 열 때 암호화해 옮겨 담는다
  const old = path.join(dir, "old.sqlite");
  { const db = new DatabaseSync(old); db.exec("CREATE TABLE bookings(id TEXT PRIMARY KEY, token TEXT NOT NULL, requestKey TEXT UNIQUE NOT NULL, payload TEXT NOT NULL)"); db.prepare("INSERT INTO bookings VALUES(?,?,?,?)").run("b1", "t", "k", JSON.stringify({ id: "b1", request: { name: "옛사람" }, status: "received", history: [], createdAt: new Date().toISOString() })); db.close(); }
  const s2 = createServices(old, { pii });
  assert.equal(s2.listBookings()[0].request.name, "옛사람");
  const row = new DatabaseSync(old).prepare("SELECT payload FROM bookings").get();
  assert.ok(row.payload.startsWith("enc1:") && !row.payload.includes("옛사람"));
  console.log("ok - 개인정보 암호화 저장 (AES-256-GCM·위조 거부·HMAC 색인·키 파일 600, 예약 이름·연락처·제보 메모 파일에 원문 없음, 예전 자료 옮겨 담기)");
} finally { rmSync(dir, { recursive: true, force: true }); }
