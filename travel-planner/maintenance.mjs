import {readdir,unlink} from 'node:fs/promises';
import path from 'node:path';
export async function maintain(store,dir,now=Date.now()) {
  const purged=store.purge(now,180);
  const name=`backup-${new Date(now).toISOString().slice(0,10)}.sqlite`;
  await store.backup(path.join(dir,name));
  for(const f of await readdir(dir)) {
    const m=f.match(/^backup-(\d{4}-\d{2}-\d{2})\.sqlite$/);
    if(m && now-new Date(m[1]).getTime()>7*86400000)await unlink(path.join(dir,f));
  }
  return purged;
}
export function scheduleMaintenance(store,dir) {
  let running=false;
  const run=async()=>{if(running)return;running=true;try{await maintain(store,dir);}catch{console.error('예약 데이터 백업 실패: 저장소 경로·용량을 확인하세요.');}finally{running=false;}};
  run();const timer=setInterval(run,86400000);timer.unref();return ()=>clearInterval(timer);
}
