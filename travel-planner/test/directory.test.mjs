import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = await mkdtemp(join(tmpdir(), 'directory-test-'));
try {
  await mkdir(join(root, 'scripts')); await mkdir(join(root, 'public'));
  for (const name of ['sync-directory.mjs', 'tour-api.mjs']) await copyFile(new URL(`../scripts/${name}`, import.meta.url), join(root, 'scripts', name));
  const target = join(root, 'public/directory.json');
  await writeFile(target, '{"old":true}');
  const env = { ...process.env }; delete env.TOUR_API_KEY;
  let r = spawnSync(process.execPath, ['scripts/sync-directory.mjs'], { cwd: root, env });
  assert.notEqual(r.status, 0); assert.equal(await readFile(target, 'utf8'), '{"old":true}');
  await writeFile(join(root, 'mock.mjs'), `globalThis.fetch = async (url) => {
    const u = new URL(url), detail = u.pathname.endsWith('detailIntro2');
    const item = detail ? {usetime:'09:00–18:00',restdate:'월요일'} : [{contentid:u.searchParams.get('contentTypeId'),title:'공식 장소',mapy:'37.5',mapx:'128.5',addr1:'강원'}];
    return new Response(JSON.stringify({response:{header:{resultCode:'0000'},body:{items:{item}}}}));
  };`);
  r = spawnSync(process.execPath, ['--import', './mock.mjs', 'scripts/sync-directory.mjs'], { cwd: root, env: {...env, TOUR_API_KEY:'test-fixture'} });
  assert.equal(r.status, 0, r.stderr.toString());
  const data = JSON.parse(await readFile(target, 'utf8'));
  assert.equal(data.places.length, 6); assert.equal(data.places[0].closed, '월요일'); assert.ok(data.fetchedAt);
  // 나눠 받기: 수정일이 같으면 상세를 다시 부르지 않고, 한 번에 부르는 수를 제한하고, 한도 초과(22)면 멈추고 저장한다
  await writeFile(join(root, 'counted.mjs'), `
    import { appendFileSync } from 'node:fs';
    const mode = process.env.MOCK_MODE, n = Number(process.env.MOCK_N || 6);
    globalThis.fetch = async (url) => {
      const u = new URL(url), detail = u.pathname.endsWith('detailIntro2');
      if (detail) {
        appendFileSync('calls.log', 'd');
        if (mode === 'quota') return new Response(JSON.stringify({OpenAPI_ServiceResponse:{cmmMsgHeader:{returnReasonCode:'22'}}}));
        return new Response(JSON.stringify({response:{header:{resultCode:'0000'},body:{items:{item:{usetime:'10:00', restdate:'화요일'}}}}}));
      }
      const t = u.searchParams.get('contentTypeId');
      const item = Array.from({length: t === '12' ? n : 0}, (_, i) => ({contentid: 'k' + i, title: '장소' + i, mapy: '37.5', mapx: '128.5', modifiedtime: process.env.MOCK_MOD || '1'}));
      return new Response(JSON.stringify({response:{header:{resultCode:'0000'},body:{items:{item}}}}));
    };`);
  const target2 = join(root, 'public/directory.json');
  await writeFile(target2, JSON.stringify({ places: [{ id: 'app-only', name: '앱 장소', source: '앱 검토 자료', plannerId: 'app-only' }] }));
  const run = (extra) => { const out = spawnSync(process.execPath, ['--import', './counted.mjs', 'scripts/sync-directory.mjs'], { cwd: root, env: { ...env, TOUR_API_KEY: 'test-fixture', ...extra } }); assert.equal(out.status, 0, out.stderr.toString()); };
  const calls = async () => { try { const s = await readFile(join(root, 'calls.log'), 'utf8'); await writeFile(join(root, 'calls.log'), ''); return s.length; } catch { return 0; } };
  run({ DIRECTORY_MAX_DETAIL: '4' });
  let d2 = JSON.parse(await readFile(target2, 'utf8'));
  assert.equal(await calls(), 4); assert.equal(d2.places.filter((p) => p.detailPending).length, 2);
  assert.ok(d2.places.some((p) => p.id === 'app-only'), '앱 검토 항목 유지');
  run({ DIRECTORY_MAX_DETAIL: '4' });
  d2 = JSON.parse(await readFile(target2, 'utf8'));
  assert.equal(await calls(), 2, '남은 2곳만 이어 받음'); assert.equal(d2.places.filter((p) => p.detailPending).length, 0);
  run({});
  assert.equal(await calls(), 0, '수정일이 같으면 다시 부르지 않음');
  run({ MOCK_MOD: '2', MOCK_MODE: 'quota' });
  d2 = JSON.parse(await readFile(target2, 'utf8'));
  assert.equal(await calls(), 1, '한도 초과면 바로 멈춤');
  assert.equal(d2.places.find((p) => p.id === 'k0').hours, '10:00', '못 받은 곳은 이전 값 유지');
  assert.equal(d2.places.filter((p) => p.detailPending).length, 6);
  await writeFile(target, JSON.stringify(data));
  const before = await readFile(target, 'utf8');
  await writeFile(join(root, 'empty.mjs'), `globalThis.fetch=async()=>new Response(JSON.stringify({response:{header:{resultCode:'0000'},body:{items:{item:[]}}}}));`);
  r = spawnSync(process.execPath, ['--import','./empty.mjs','scripts/sync-directory.mjs'], {cwd:root,env:{...env,TOUR_API_KEY:'test-fixture'}});
  assert.notEqual(r.status, 0); assert.equal(await readFile(target,'utf8'), before);
  console.log('ok - 공식 목록 수집, 운영 원문, 키 누락·빈 응답 시 기존 데이터 보존');
} finally { await rm(root, { recursive:true, force:true }); }
