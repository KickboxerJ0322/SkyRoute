import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { createBuildingParser, buildingGeometry, buildingAttributes, parseCodeList, normalizeRing, geometryInBounds } from '../scripts/plateau-citygml.mjs';
import { createApp } from '../server/index.mjs';
const compiled=await build({stdin:{contents:"export {classifyBuilding} from './src/plateau/classifyBuilding'; export {PlateauDataProvider,parseBuildingCollection} from './src/plateau/PlateauDataProvider';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
const {classifyBuilding,PlateauDataProvider,parseBuildingCollection}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const collection=JSON.parse(await readFile('public/data/plateau/haneda-buildings.geojson','utf8'));

test('categories use resolved text and do not invent meanings for codes or broad welfare classes',()=>{
  for(const [value,expected] of [[{name:'羽田空港旅客ターミナル'},'PUBLIC_TRANSPORT'],[{usage:'運輸倉庫施設'},'PUBLIC_TRANSPORT'],[{usage:'官公庁施設'},'PUBLIC_TRANSPORT'],[{name:'空港クリニック',usage:'文教厚生施設'},'MEDICAL'],[{usage:'商業系複合施設'},'COMMERCIAL'],[{usage:'宿泊施設'},'COMMERCIAL'],[{usage:'431'},'OTHER'],[{usage:'文教厚生施設'},'OTHER'],[{},'OTHER']]) assert.equal(classifyBuilding(value),expected);
});

test('actual generated data validates, includes airport transport outlines and preserves missing attributes',async()=>{
  assert.equal(parseBuildingCollection(collection).features.length,500);
  const meta=JSON.parse(await readFile('public/data/plateau/haneda-meta.json','utf8'));
  assert.equal(Buffer.byteLength(await readFile('public/data/plateau/haneda-buildings.geojson','utf8')),meta.geojsonBytes);
  const terminal=collection.features.find(f=>f.properties.gmlId==='bldg_1ef85eef-02b7-49ab-8a04-63074fdd7b36');
  assert.ok(terminal);assert.equal(terminal.properties.usage,'運輸倉庫施設');assert.equal(terminal.properties.usageCode,'431');assert.equal(terminal.properties.category,'PUBLIC_TRANSPORT');assert.equal(terminal.properties.measuredHeight,32.7);assert.equal(terminal.properties.name,null);
  assert.ok(collection.features.some(f=>f.geometry.type==='Polygon'&&f.geometry.coordinates.length>1));
  for(const f of collection.features){assert.equal(classifyBuilding(f.properties),f.properties.category);assert.ok(geometryInBounds(f.geometry,meta.bbox));assert.notEqual(f.properties.storeysAboveGround,9999);}
  assert.ok(collection.features.some(f=>f.properties.rawStoreysAboveGround==='9999'&&f.properties.storeysAboveGround===null));
});

test('provider lazy loading shares one request and caches; failures can retry',async()=>{
  let calls=0;const provider=new PlateauDataProvider(async()=>{calls++;return Response.json(collection);});
  assert.equal(calls,0);const [a,b]=await Promise.all([provider.load(),provider.load()]);assert.equal(a,b);assert.equal(calls,1);await provider.load();assert.equal(calls,1);
  let failed=true;const retry=new PlateauDataProvider(async()=>failed?new Response('',{status:404}):Response.json(collection));
  await assert.rejects(retry.load(),/unavailable/);failed=false;assert.equal((await retry.load()).length,500);
  const invalid=structuredClone(collection);invalid.features[0].geometry.coordinates=[];assert.throws(()=>parseBuildingCollection(invalid));
  const invalid2=structuredClone(collection);invalid2.features[0].properties.measuredHeight=9999;assert.throws(()=>parseBuildingCollection(invalid2));
});

const coords='35.54 139.77 0 35.54 139.771 0 35.541 139.771 0 35.54 139.77 0';
const poly=`<g:Polygon><g:exterior><g:LinearRing><g:posList>${coords}</g:posList></g:LinearRing></g:exterior></g:Polygon>`;
const doc=(body,crs='http://www.opengis.net/def/crs/EPSG/0/6697')=>`<c:CityModel xmlns:c="http://www.opengis.net/citygml/2.0" xmlns:g="http://www.opengis.net/gml" xmlns:b="http://www.opengis.net/citygml/building/2.0"><g:boundedBy><g:Envelope srsName="${crs}" srsDimension="3"/></g:boundedBy><b:Building g:id="synthetic-test"><b:measuredHeight uom="m">9999</b:measuredHeight><b:storeysAboveGround>9999</b:storeysAboveGround>${body}</b:Building></c:CityModel>`;
function parse(xml){const nodes=[];const parser=createBuildingParser(n=>nodes.push(n));for(let i=0;i<xml.length;i+=17)parser.write(xml.slice(i,i+17));parser.close();return nodes[0];}

test('CityGML namespace-independent parsing, CRS check, footprint priority, roof fallback and MultiPolygon',()=>{
  const source=doc(`<b:lod0FootPrint><g:MultiSurface>${poly}${poly}</g:MultiSurface></b:lod0FootPrint><b:lod0RoofEdge>${poly}</b:lod0RoofEdge>`);
  const node=parse(source),result=buildingGeometry(node);assert.equal(result.geometry.type,'MultiPolygon');assert.equal(result.geometrySource,'lod0FootPrint');assert.equal(result.geometry.coordinates.length,2);assert.deepEqual(result.geometry.coordinates[0][0][0],[139.77,35.54]);assert.equal(buildingAttributes(node).measuredHeight,null);assert.equal(buildingAttributes(node).storeysAboveGround,null);
  assert.equal(buildingGeometry(parse(doc(`<b:lod0RoofEdge>${poly}</b:lod0RoofEdge>`))).geometry.type,'Polygon');
  assert.throws(()=>buildingGeometry(parse(doc(`<b:lod0RoofEdge>${poly}</b:lod0RoofEdge>`,'EPSG:3857'))),/Unsupported CRS/);
  assert.equal(buildingGeometry(parse(doc('<b:lod1Solid/>'))),null);
  assert.deepEqual(normalizeRing([[1,1],[2,1],[2,2],[1,1],[1,1]]),[[1,1],[2,1],[2,2],[1,1]]);
  assert.throws(()=>parse('<!DOCTYPE bad><bad/>'),/DOCTYPE/);
});

test('code lists preserve literal codes including leading zeros and decode labels',()=>{
  const codes=parseCodeList('<g:Dictionary xmlns:g="http://www.opengis.net/gml"><g:dictionaryEntry><g:Definition><g:name>0431</g:name><g:description>運輸倉庫施設</g:description></g:Definition></g:dictionaryEntry></g:Dictionary>');assert.equal(codes.get('0431'),'運輸倉庫施設');assert.equal(codes.get('431'),undefined);
});

test('production server serves GeoJSON MIME without a PLATEAU proxy and keeps health working',async()=>{
  // Use the native Windows path rather than percent-encoded URL pathname.
  const {resolve}=await import('node:path');const server=createApp({api:{mode:'mock'},dist:resolve('public')});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{const base='http://127.0.0.1:'+server.address().port;const r=await fetch(base+'/data/plateau/haneda-buildings.geojson');assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/application\/geo\+json/);assert.equal((await r.json()).features.length,500);assert.equal((await fetch(base+'/data/plateau/missing.geojson')).status,404);assert.equal((await fetch(base+'/api/health')).status,200);}finally{await new Promise(r=>server.close(r));}
});