import { ApiError } from './cache.mjs';
﻿import { readFileSync } from 'node:fs';
export function loadRecordedFixture(file) {
  if(!file)return null;
  const records=JSON.parse(readFileSync(file,'utf8').replace(/^\uFEFF/,''));
  return async path=>{
    const key=path.split('?')[0];
    if(!(key in records.responses)) { throw new ApiError(404,'DATA_UNAVAILABLE'); }
    return records.responses[key];
  };
}
