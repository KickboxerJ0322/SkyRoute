import { Cache, ApiError } from './cache.mjs';

const METAR_TTL=5*60*1000;
const TAF_TTL=10*60*1000;
const ROOT='https://aviationweather.gov/api/data';

export function createAviationWeatherService({fetcher=fetch,now=Date.now}={}){
  const cache=new Cache(now);

  const request=async(product,icao)=>{
    const id=String(icao||'').toUpperCase();
    if(!/^[A-Z0-9]{4}$/.test(id))throw new ApiError(400,'INVALID_AIRPORT');
    const url=`${ROOT}/${product}?${new URLSearchParams({ids:id,format:'json'})}`;
    let response;
    try{
      response=await fetcher(url,{
        headers:{
          Accept:'application/json',
          'User-Agent':'SkyRoute/1.0 aviation-weather-client',
        },
        signal:AbortSignal.timeout(10000),
      });
    }catch{
      throw new ApiError(504,'AVIATION_WEATHER_UNAVAILABLE');
    }
    if(response.status===204)return null;
    if(!response.ok){
      throw new ApiError(
        response.status===429?429:502,
        response.status===429?'AVIATION_WEATHER_RATE_LIMIT':'AVIATION_WEATHER_UNAVAILABLE',
      );
    }
    let body;
    try{body=await response.json();}
    catch{throw new ApiError(502,'AVIATION_WEATHER_INVALID_RESPONSE');}
    if(!Array.isArray(body))throw new ApiError(502,'AVIATION_WEATHER_INVALID_RESPONSE');
    return body[0]??null;
  };

  const wrap=async(key,ttl,loader,airport)=>{
    const result=await cache.get(key,ttl,loader);
    return {
      ...result,
      data:{airport,raw:result.data},
      source:'live',
    };
  };

  return {
    weather:icao=>wrap(
      `awc:metar:${String(icao).toUpperCase()}`,
      METAR_TTL,
      ()=>request('metar',icao),
      String(icao).toUpperCase(),
    ),
    forecast:icao=>wrap(
      `awc:taf:${String(icao).toUpperCase()}`,
      TAF_TTL,
      ()=>request('taf',icao),
      String(icao).toUpperCase(),
    ),
  };
}
