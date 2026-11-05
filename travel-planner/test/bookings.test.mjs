import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { receiveBooking, validateBooking } from '../bookings.mjs';
const valid = {kind:'lodging', product:'테스트 숙소', name:'테스트', contact:'test@example.com', date:'2099-01-01',endDate:'2099-01-02',people:2,consent:true};
for (const change of [{date:'2099-02-30'},{date:'2000-01-01'},{endDate:'2099-01-01'},{people:0},{people:1.5},{contact:'bad'},{consent:false},{kind:'other'}]) assert.throws(()=>validateBooking({...valid,...change}));
const root = await mkdtemp(`${tmpdir()}/booking-test-`);
try {
 const receipt = await receiveBooking(valid, pathToFileURL(`${root}/`));
 assert.equal(receipt.status,'received'); assert.equal(receipt.contact,undefined);
 const stored = JSON.parse(await readFile(`${root}/${receipt.id}.json`));
 assert.equal(stored.contact, valid.contact); assert.equal(stored.status,'received');
} finally { await rm(root,{recursive:true,force:true}); }
console.log('ok - 예약 신청 검증, 저장, 접수 응답 개인정보 제외');
