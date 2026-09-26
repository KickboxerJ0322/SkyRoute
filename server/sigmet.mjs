import { ApiError } from './cache.mjs';

const NOAA_ENDPOINT='https://aviationweather.gov/api/data/isigmet';
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

const validAt=(properties,now)=>{
  const from=parseTime(properties?.validTimeFrom??properties?.valid_time_from??properties?.validFrom);
  const to=parseTime(properties?.validTimeTo??properties?.valid_time_to??properties?.validTo);
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
    const coordinates=geometry.coordinates;
    // Normal GeoJSON is rings[], but tolerate a single ring from upstream.
    const rings=Array.isArray(coordinates?.[0]?.[0])
      ?coordinates.map(cleanRing).filter(r=>r.length>=4)
      :[cleanRing(coordinates)].filter(r=>r.length>=4);
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

const coordsGeometry=record=>{
  if(!Array.isArray(record?.coords))return null;
  const ring=cleanRing(record.coords.map(point=>[
    Number(point?.lon??point?.lng??point?.longitude),
    Number(point?.lat??point?.latitude),
  ]));
  if(ring.length<4)return null;
  return {type:'Polygon',coordinates:[ring]};
};

const pickNumber=(p,...keys)=>{
  for(const key of keys){
    const value=Number(p?.[key]);
    if(Number.isFinite(value))return value;
  }
  return null;
};

const normalizedProperties=p=>{
  const from=parseTime(p?.validTimeFrom??p?.valid_time_from??p?.validFrom);
  const to=parseTime(p?.validTimeTo??p?.valid_time_to??p?.validTo);
  return {
    icaoId:String(p?.icaoId??''),
    firId:String(p?.firId??''),
    firName:String(p?.firName??''),
    seriesId:String(p?.seriesId??p?.alphaChar??''),
    hazard:String(p?.hazard??p?.phenomenon??p?.data??'SIGMET'),
    qualifier:String(p?.qualifier??p?.severity??''),
    validTimeFrom:from===null?null:new Date(from).toISOString(),
    validTimeTo:to===null?null:new Date(to).toISOString(),
    // International SIGMET v4 uses base/top, while older/domestic shapes use
    // altitudeLo*/altitudeHi*. Accept both so the client contract stays stable.
    altitudeLowFeet:pickNumber(p,'base','altitudeLo1','altitudeLo2','altitudeLow1','altitudeLow2','altitudeLow'),
    altitudeHighFeet:pickNumber(p,'top','altitudeHi1','altitudeHi2','altitudeHigh'),
    movementDir:pickNumber(p,'movementDir','movementDirection','dir'),
    movementSpd:pickNumber(p,'movementSpd','movementSpeed','spd'),
    rawText:String(p?.rawSigmet??p?.rawAirSigmet??p?.rawText??p?.raw??'').slice(0,2000),
  };
};

const normalizeGeoFeature=(feature,index)=>{
  const geometry=cleanGeometry(feature?.geometry);
  if(!geometry)return null;
  const p=feature?.properties||{};
  return {
    type:'Feature',
    id:String(feature?.id??p.seriesId??p.icaoId??index),
    properties:normalizedProperties(p),
    geometry,
  };
};

const normalizeJsonRecord=(record,index)=>{
  const geometry=coordsGeometry(record);
  if(!geometry)return null;
  return {
    type:'Feature',
    id:String(record?.seriesId??record?.icaoId??index),
    properties:normalizedProperties(record),
    geometry,
  };
};

const requestNoaa=async(fetcher,format)=>{
  const response=await fetcher(`${NOAA_ENDPOINT}?format=${format}`,{
    headers:{
      Accept:format==='geojson'?'application/geo+json':'application/json',
      'User-Agent':'SkyRoute/1.0 aviation-weather-client',
    },
    signal:AbortSignal.timeout(12000),
  });
  if(response.status===204)return {ok:true,features:[],status:204,format};
  if(!response.ok)return {ok:false,features:[],status:response.status,format};
  try{
    const body=await response.json();
    if(format==='geojson'&&Array.isArray(body?.features)){
      return {ok:true,features:body.features.map(normalizeGeoFeature).filter(Boolean),status:response.status,format};
    }
    if(format==='json'&&Array.isArray(body)){
      return {ok:true,features:body.map(normalizeJsonRecord).filter(Boolean),status:response.status,format};
    }
    return {ok:false,features:[],status:502,format};
  }catch{
    return {ok:false,features:[],status:502,format};
  }
};

export function createSigmetService({fetcher=fetch,now=Date.now,logger=console.log}={}){
  let cache=null;
  let expires=0;

  return async function getSigmets(){
    const current=now();
    if(cache&&current<expires)return {...cache,cached:true};

    const attempts=[];
    for(const format of ['geojson','json']){
      try{
        const result=await requestNoaa(fetcher,format);
        attempts.push({format,status:result.status});
        if(!result.ok)continue;

        const features=result.features.filter(feature=>validAt(feature.properties,current));
        cache={
          type:'FeatureCollection',
          features,
          fetchedAt:new Date(current).toISOString(),
          source:'NOAA Aviation Weather Center',
          sourceFormat:format,
          stale:false,
        };
        expires=current+CACHE_TTL_MS;
        logger(JSON.stringify({endpoint:'sigmet',status:200,format,count:features.length}));
        return {...cache,cached:false};
      }catch(error){
        attempts.push({format,status:'NETWORK_ERROR'});
      }
    }

    logger(JSON.stringify({endpoint:'sigmet',status:502,attempts}));
    if(cache)return {...cache,cached:true,stale:true,warning:'NOAA_SIGMET_TEMPORARILY_UNAVAILABLE'};

    const rateLimited=attempts.some(item=>item.status===429);
    throw new ApiError(rateLimited?429:502,rateLimited?'NOAA_SIGMET_RATE_LIMIT':'NOAA_SIGMET_UNAVAILABLE');
  };
}
