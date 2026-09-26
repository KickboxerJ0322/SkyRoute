import { ApiError } from './cache.mjs';

const CURRENT_URL='https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N1.json';
const FORECAST_URL='https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N2.json';
const TTL_MS=60*1000;

const parseUtc=value=>{
  if(!/^\d{14}$/.test(String(value||'')))return null;
  const s=String(value);
  return Date.UTC(
    Number(s.slice(0,4)),Number(s.slice(4,6))-1,Number(s.slice(6,8)),
    Number(s.slice(8,10)),Number(s.slice(10,12)),Number(s.slice(12,14)),
  );
};

const normalize=list=>(Array.isArray(list)?list:[])
  .filter(item=>parseUtc(item?.basetime)!==null&&parseUtc(item?.validtime)!==null)
  .map(item=>({
    basetime:String(item.basetime),
    validtime:String(item.validtime),
    elements:Array.isArray(item.elements)?item.elements.map(String):[],
  }));

export function createNowcastService({fetcher=fetch,now=Date.now}={}){
  let cache=null,expires=0;

  const read=async url=>{
    const response=await fetcher(url,{
      headers:{Accept:'application/json','User-Agent':'SkyRoute/1.0 nowcast-client'},
      signal:AbortSignal.timeout(10000),
    });
    if(!response.ok)throw new ApiError(502,'JMA_NOWCAST_UNAVAILABLE');
    return response.json();
  };

  return async function getNowcastTimes(){
    const currentTime=now();
    if(cache&&currentTime<expires)return {...cache,cached:true};

    const [currentRaw,forecastRaw]=await Promise.all([read(CURRENT_URL),read(FORECAST_URL)]);
    const currentList=normalize(currentRaw);
    const forecastList=normalize(forecastRaw);
    if(!currentList.length)throw new ApiError(502,'JMA_NOWCAST_UNAVAILABLE');

    const current=[...currentList].sort((a,b)=>parseUtc(b.validtime)-parseUtc(a.validtime))[0];
    const sameBase=forecastList.filter(item=>item.basetime===current.basetime);
    const candidates=(sameBase.length?sameBase:forecastList)
      .filter(item=>parseUtc(item.validtime)>=parseUtc(current.validtime));
    const targetMs=parseUtc(current.validtime)+60*60*1000;
    const forecast60=[...candidates].sort((a,b)=>
      Math.abs(parseUtc(a.validtime)-targetMs)-Math.abs(parseUtc(b.validtime)-targetMs)
    )[0]??current;

    cache={
      current,
      forecast60,
      fetchedAt:new Date(currentTime).toISOString(),
      source:'Japan Meteorological Agency High-resolution Precipitation Nowcast',
      tileTemplate:'https://www.jma.go.jp/bosai/jmatile/data/nowc/{basetime}/none/{validtime}/surf/hrpns/{z}/{x}/{y}.png',
    };
    expires=currentTime+TTL_MS;
    return {...cache,cached:false};
  };
}
