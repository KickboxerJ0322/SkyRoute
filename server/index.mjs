import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAeroApi } from './aeroApi.mjs';
import { ApiError } from './cache.mjs';
try { process.loadEnvFile('.env.local'); } catch(error) { if(error.code!=='ENOENT') throw error; }
export function createApp({api=createAeroApi(),dist=resolve('dist')}={}) {
  return createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    try {
      const url=new URL(req.url,'http://localhost');
      if(req.method!=='GET'&&req.method!=='HEAD') return json(405,{error:'METHOD_NOT_ALLOWED'});
      if(url.pathname==='/api/health') return json(200,{status:'ok',source:api.mode});
      if(url.pathname==='/api/flights/departures') return json(200,await api.departures());
      const match=url.pathname.match(/^\/api\/flights\/([^/]+)(?:\/(route|track|position))?$/);
      if(match) {
        const id=decodeURIComponent(match[1]);
        if(!/^[A-Za-z0-9_-]{1,180}$/.test(id)) throw new ApiError(400,'INVALID_FLIGHT_ID');
        return json(200,await api[match[2]||'detail'](id));
      }
      const airport=url.pathname.match(/^\/api\/airports\/([A-Za-z0-9]{3,4})$/);
      if(airport) return json(200,await api.airport(airport[1].toUpperCase()));
      if(url.pathname.startsWith('/api/')) return json(404,{error:'NOT_FOUND'});
      const pathname=decodeURIComponent(url.pathname);
      let target=resolve(dist,'.'+pathname);
      if(!target.startsWith(dist+sep)&&target!==dist) return json(403,{error:'FORBIDDEN'});
      if(pathname.split('/').some(part=>part.startsWith('.'))) return json(404,{error:'NOT_FOUND'});
      try { if(!(await stat(target)).isFile()) target=resolve(dist,'index.html'); }
      catch { if(extname(pathname)) return json(404,{error:'NOT_FOUND'}); target=resolve(dist,'index.html'); }
      const body=await readFile(target);
      const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.glb':'model/gltf-binary','.svg':'image/svg+xml','.geojson':'application/geo+json; charset=utf-8','.json':'application/json; charset=utf-8'};
      res.writeHead(200,{'Content-Type':types[extname(target)]||'application/octet-stream'});
      res.end(req.method==='HEAD'?undefined:body);
    } catch(error) { json(error.status||500,{error:error.code&&error instanceof ApiError?error.code:'SERVER_ERROR'}); }
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const port=Number(process.env.PORT||8787);
  createApp().listen(port,'0.0.0.0',()=>console.log(`SkyRoute backend listening on ${port} (${process.env.SKYROUTE_DATA_MODE||'mock'})`));
}
