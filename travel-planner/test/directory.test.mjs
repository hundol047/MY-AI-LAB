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
  const before = await readFile(target, 'utf8');
  await writeFile(join(root, 'empty.mjs'), `globalThis.fetch=async()=>new Response(JSON.stringify({response:{header:{resultCode:'0000'},body:{items:{item:[]}}}}));`);
  r = spawnSync(process.execPath, ['--import','./empty.mjs','scripts/sync-directory.mjs'], {cwd:root,env:{...env,TOUR_API_KEY:'test-fixture'}});
  assert.notEqual(r.status, 0); assert.equal(await readFile(target,'utf8'), before);
  console.log('ok - 공식 목록 수집, 운영 원문, 키 누락·빈 응답 시 기존 데이터 보존');
} finally { await rm(root, { recursive:true, force:true }); }
