const NOAA_SIGMET_URL='https://aviationweather.gov/api/data/isigmet?format=geojson';
const CACHE_TTL_MS=5*60*1000;

const parseTime=value=>{
  if(value===null||value===undefined||value==='')return null;
  if(typeof value==='number'&&Number.isFinite(value))return value>1e12?value:value*1000;
  if(typeof value==='string'){
    const numeric=Number(value);
    if(Number.isFinite(numeric)&&value.trim()!=='')return numeric>1e12?numeric:numeric*1000;
    const parsed=Date.parse(value);
    return Number.isFinite(parsed)?parsed:null;
  }
  return null;
};

const validNow=(feature,now)=>{
  const p=feature?.properties||{};
  const from=parseTime(p.validTimeFrom??p.valid_time_from??p.validFrom);
  const to=parseTime(p.validTimeTo??p.valid_time_to??p.validTo);
  if(from!==null&&now<from)return false;
  if(to!==null&&now>to)return false;
  return true;
};

const finiteCoord=pair=>Array.isArray(pair)&&pair.length>=2&&Number.isFinite(Number(pair[0]))&&Number.isFinite(Number(pair[1]));

const cleanRing=ring=>{
  if(!Array.isArray(ring))return [];
  const points=ring.filter(finiteCoord).map(pair=>[Number(pair[0]),Number(pair[1])]);
  if(points.length<3)return [];
  const first=points[0],last=points.at(-1);
  if(first[0]!==last[0]||first[1]!==last[1])points.push([...first]);
  return points;
};

const cleanGeometry=geometry=>{
  if(!geometry||typeof geometry!=='object')return null;
  if(geometry.type==='Polygon'){
    const rings=(geometry.coordinates||[]).map(cleanRing).filter(r=>r.length>=4);
    return rings.length?{type:'Polygon',coordinates:rings}:null;
  }
  if(geometry.type==='MultiPolygon'){
    const polygons=(geometry.coordinates||[])
      .map(poly=>(poly||[]).map(cleanRing).filter(r=>r.length>=4))
      .filter(poly=>poly.length);
    return polygons.length?{type:'MultiPolygon',coordinates:polygons}:null;
  }
  return null;
};

const pickNumber=(p,...keys)=>{
  for(const key of keys){
    const value=Number(p?.[key]);
    if(Number.isFinite(value))return value;
  }
  return null;
};

const normalizeFeature=(feature,index)=>{
  const geometry=cleanGeometry(feature?.geometry);
  if(!geometry)return null;
  const p=feature?.properties||{};
  const from=parseTime(p.validTimeFrom??p.valid_time_from??p.validFrom);
  const to=parseTime(p.validTimeTo??p.valid_time_to??p.validTo);
  return {
    type:'Feature',
    id:String(feature?.id??p.seriesId??p.icaoId??index),
    properties:{
      icaoId:String(p.icaoId??''),
      firId:String(p.firId??''),
      firName:String(p.firName??''),
      seriesId:String(p.seriesId??p.alphaChar??''),
      hazard:String(p.hazard??p.phenomenon??p.data??'SIGMET'),
      qualifier:String(p.qualifier??p.severity??''),
      validTimeFrom:from===null?null:new Date(from).toISOString(),
      validTimeTo:to===null?null:new Date(to).toISOString(),
      altitudeLowFeet:pickNumber(p,'altitudeLow1','altitudeLow2','altitudeLow','base'),
      altitudeHighFeet:pickNumber(p,'altitudeHi1','altitudeHi2','altitudeHigh','top'),
      movementDir:pickNumber(p,'movementDir','movementDirection'),
      movementSpd:pickNumber(p,'movementSpd','movementSpeed'),
      rawText:String(p.rawSigmet??p.rawAirSigmet??p.rawText??p.raw??'').slice(0,2000),
    },
    geometry,
  };
};

export function createSigmetService({fetcher=fetch,now=Date.now,logger=console.log}={}){
  let cache=null;
  let expires=0;

  return async function getSigmets(){
    const current=now();
    if(cache&&current<expires)return {...cache,cached:true};

    let response;
    try{
      response=await fetcher(NOAA_SIGMET_URL,{
        headers:{
          Accept:'application/geo+json, application/json',
          'User-Agent':'SkyRoute/1.0 (+https://github.com/KickboxerJ0322/SkyRoute)',
        },
        signal:AbortSignal.timeout(12000),
      });
    }catch(error){
      if(cache)return {...cache,cached:true,stale:true,warning:'NOAA_SIGMET_TEMPORARILY_UNAVAILABLE'};
      throw Object.assign(new Error('NOAA_SIGMET_UNAVAILABLE'),{status:504,code:'NOAA_SIGMET_UNAVAILABLE'});
    }

    if(!response.ok){
      if(cache)return {...cache,cached:true,stale:true,warning:`NOAA_SIGMET_HTTP_${response.status}`};
      const status=response.status===429?429:502;
      throw Object.assign(new Error('NOAA_SIGMET_UNAVAILABLE'),{status,code:response.status===429?'NOAA_SIGMET_RATE_LIMIT':'NOAA_SIGMET_UNAVAILABLE'});
    }

    let geojson;
    try{geojson=await response.json();}
    catch{
      throw Object.assign(new Error('NOAA_SIGMET_INVALID_RESPONSE'),{status:502,code:'NOAA_SIGMET_INVALID_RESPONSE'});
    }

    const features=(Array.isArray(geojson?.features)?geojson.features:[])
      .filter(feature=>validNow(feature,current))
      .map(normalizeFeature)
      .filter(Boolean);

    cache={
      type:'FeatureCollection',
      features,
      fetchedAt:new Date(current).toISOString(),
      source:'NOAA Aviation Weather Center',
      stale:false,
    };
    expires=current+CACHE_TTL_MS;
    logger(JSON.stringify({endpoint:'sigmet',status:200,count:features.length}));
    return {...cache,cached:false};
  };
}
