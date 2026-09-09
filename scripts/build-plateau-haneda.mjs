import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { createBuildingParser, buildingAttributes, buildingGeometry, geometryInBounds, parseCodeList } from './plateau-citygml.mjs';

const bbox = [139.75, 35.535, 139.805, 35.57];
const output = new URL('../public/data/plateau/', import.meta.url);
const cache = new URL('../.cache/plateau/', import.meta.url);
const catalogUrl = 'https://api.plateauview.mlit.go.jp/datacatalog/citygml/r:' + bbox.join(',') + '?types=bldg';
const MAX_BYTES = 200 * 1024 * 1024, MAX_BUILDINGS = 500;
const compiled = await build({stdin:{contents:"export { classifyBuilding } from './src/plateau/classifyBuilding'; export { HANEDA_AIRPORT } from './src/config';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node'});
const { classifyBuilding, HANEDA_AIRPORT } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
await mkdir(cache, { recursive:true });
let downloadedBytes = 0;
async function cachedFetch(url) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !['api.plateauview.mlit.go.jp', 'assets.cms.plateau.reearth.io'].includes(u.hostname)) throw new Error('Unexpected PLATEAU source host');
  const filename = new URL(createHash('sha256').update(url).digest('hex'), cache);
  if (!process.argv.includes('--refresh')) { try { await stat(filename); return filename; } catch {} }
  const r = await fetch(url, {signal:AbortSignal.timeout(120000)});
  if (!r.ok) throw new Error('PLATEAU HTTP ' + r.status + ': ' + url);
  const chunks = []; let size = 0;
  for await (const chunk of r.body) { size += chunk.length; if (size + downloadedBytes > MAX_BYTES) throw new Error('Download budget exceeded (200 MiB)'); chunks.push(chunk); }
  downloadedBytes += size;
  await writeFile(new URL(filename.href + '.part'), Buffer.concat(chunks));
  await rename(new URL(filename.href + '.part'), filename);
  return filename;
}
const catalogFile = await cachedFetch(catalogUrl);
const catalog = JSON.parse(await readFile(catalogFile, 'utf8'));
// Scope is explicitly Haneda/Ota. Do not fetch the adjacent Kawasaki municipality.
const cities = catalog.cities.filter(c => c.cityCode === '13111').sort((a,b) => b.year-a.year);
const city = cities[0];
if (!city || !city.files?.bldg?.length) throw new Error('No Ota/Haneda building data in catalog');
const files = [...new Map(city.files.bldg.map(f => [f.url,f])).values()];
if (files.length > 30 || files.reduce((sum,f) => sum+(f.fileSize||0),0) > MAX_BYTES) throw new Error('Catalog exceeds Haneda download budget');
const features = [], codeLists = new Map(), warnings = [], sourceFiles = [];
const stats = { parsed:0, outsideBounds:0, missingLod0:0, invalidGeometry:0, duplicateIds:0 };
const seen = new Set();
async function resolveCode(attribute, sourceUrl) {
  if (!attribute.value) return {label:null,code:null,codeSpace:null};
  if (!attribute.codeSpace) return {label:attribute.value,code:null,codeSpace:null};
  const url = new URL(attribute.codeSpace,sourceUrl).href;
  if (!codeLists.has(url)) {
    try { codeLists.set(url,parseCodeList(await readFile(await cachedFetch(url),'utf8'))); }
    catch (e) { warnings.push('Code list unavailable: '+url+' ('+e.message+')'); codeLists.set(url,new Map()); }
  }
  return {label:codeLists.get(url).get(attribute.value)||null,code:attribute.value,codeSpace:url};
}
for (const [index,file] of files.entries()) {
  console.log('CityGML '+(index+1)+'/'+files.length+': '+file.code);
  const path = await cachedFetch(file.url), records = [];
  const parser = createBuildingParser(node => {
    stats.parsed++;
    const attrs = buildingAttributes(node);
    if (!attrs.gmlId) { warnings.push('Building without gml:id in '+file.code); return; }
    let shape;
    try { shape = buildingGeometry(node); }
    catch (e) { if (/CRS|dimension/.test(e.message)) throw e; stats.invalidGeometry++; warnings.push(attrs.gmlId+': '+e.message); return; }
    if (!shape) { stats.missingLod0++; return; }
    if (!geometryInBounds(shape.geometry,bbox)) { stats.outsideBounds++; return; }
    if (seen.has(attrs.gmlId)) { stats.duplicateIds++; return; }
    seen.add(attrs.gmlId); records.push({attrs,...shape});
  });
  for await (const chunk of createReadStream(path,{encoding:'utf8'})) parser.write(chunk);
  parser.close();
  sourceFiles.push({url:file.url,meshCode:file.code,sha256:createHash('sha256').update(await readFile(path)).digest('hex'),bytes:(await stat(path)).size});
  for (const {attrs,geometry,geometrySource} of records) {
    const usage=await resolveCode(attrs.usage,file.url), major=await resolveCode(attrs.majorUsage,file.url);
    const properties={gmlId:attrs.gmlId,name:attrs.name,usage:usage.label,majorUsage:major.label,
      usageCode:usage.code,majorUsageCode:major.code,usageCodeSpace:usage.codeSpace,majorUsageCodeSpace:major.codeSpace,
      measuredHeight:attrs.measuredHeight,storeysAboveGround:attrs.storeysAboveGround,
      rawMeasuredHeight:attrs.rawMeasuredHeight,rawStoreysAboveGround:attrs.rawStoreysAboveGround,
      category:classifyBuilding({name:attrs.name,usage:usage.label,majorUsage:major.label}),city:city.cityName,dataYear:city.year,geometrySource,sourceMesh:file.code};
    features.push({type:'Feature',properties,geometry});
  }
}
function distance(f) {
  const ring = f.geometry.type==='Polygon'?f.geometry.coordinates[0]:f.geometry.coordinates[0][0];
  const lng=ring.reduce((n,p)=>n+p[0],0)/ring.length,lat=ring.reduce((n,p)=>n+p[1],0)/ring.length;
  return ((lng-HANEDA_AIRPORT.lng)*Math.cos(HANEDA_AIRPORT.lat*Math.PI/180))**2+(lat-HANEDA_AIRPORT.lat)**2;
}
features.sort((a,b)=>Number(a.properties.category==='OTHER')-Number(b.properties.category==='OTHER')||distance(a)-distance(b)||a.properties.gmlId.localeCompare(b.properties.gmlId));
const selected = features.slice(0,MAX_BUILDINGS);
if (!selected.length) throw new Error('No valid Haneda building geometries; existing output was not replaced');
const categoryCounts = Object.fromEntries(['PUBLIC_TRANSPORT','COMMERCIAL','MEDICAL','OTHER'].map(c=>[c,selected.filter(f=>f.properties.category===c).length]));
const missingAttributes = Object.fromEntries(['name','usage','majorUsage','measuredHeight','storeysAboveGround'].map(k=>[k,selected.filter(f=>f.properties[k]===null).length]));
const geojson=JSON.stringify({type:'FeatureCollection',bbox,features:selected});
const meta={source:'Project PLATEAU / MLIT',datasetType:'CityGML bldg LOD0 footprints / roof edges',city:city.cityName,cityCode:city.cityCode,year:city.year,
  generatedAt:new Date().toISOString(),catalogUrl,bbox,airport:{lat:HANEDA_AIRPORT.lat,lng:HANEDA_AIRPORT.lng},featureCount:selected.length,geojsonBytes:Buffer.byteLength(geojson),categoryCounts,missingAttributes,
  selection:{maximumBuildings:MAX_BUILDINGS,eligibleBuildings:features.length,omittedByLimit:Math.max(0,features.length-MAX_BUILDINGS),order:'Known display categories first, then distance to Haneda',boundaryRule:'Entire geometry inside bbox'},
  stats,warnings,sourceFiles,codeLists:[...codeLists.keys()],coordinateSystem:'EPSG:6697 -> GeoJSON longitude,latitude (height omitted)',
  attributionUrl:'https://www.mlit.go.jp/plateau/',datasetUrl:city.url,
  notes:['Display categories are SkyRoute keyword classifications, not official PLATEAU categories.','Missing, unresolved, or unknown-sentinel attributes are never inferred. Raw codes and numeric source strings are retained.','dataYear is the catalog dataset year, not the construction or individual survey year.','Conversion rounds coordinates to 7 decimals and preserves rings and holes. No LOD1+ geometry or textures are included.']};
await mkdir(output,{recursive:true});
await writeFile(new URL('haneda-buildings.geojson',output),geojson);
await writeFile(new URL('haneda-meta.json',output),JSON.stringify(meta,null,2));
console.log(JSON.stringify({buildings:selected.length,bytes:meta.geojsonBytes,categoryCounts,missingAttributes,stats,warnings: warnings.length},null,2));
