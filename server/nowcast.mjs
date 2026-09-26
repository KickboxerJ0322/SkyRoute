import { inflateSync } from 'node:zlib';
import { ApiError } from './cache.mjs';

const CURRENT_URL='https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N1.json';
const FORECAST_URL='https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N2.json';
const TILE_TEMPLATE='https://www.jma.go.jp/bosai/jmatile/data/nowc/{basetime}/none/{validtime}/surf/hrpns/{z}/{x}/{y}.png';
const TTL_MS=60*1000;
const ANALYSIS_RADIUS_KM=10;
const ZOOMS=[8,7,6];

// Current JMA precipitation display palette. Values are bucket lower bounds;
// the tiles encode categories rather than exact rainfall rates.
const RAIN_BUCKETS=[
  {min:80,max:null,rgb:[180,0,104],label:'猛烈な雨'},
  {min:50,max:80,rgb:[255,40,0],label:'非常に激しい雨'},
  {min:30,max:50,rgb:[255,153,0],label:'激しい雨'},
  {min:20,max:30,rgb:[250,245,0],label:'強い雨'},
  {min:10,max:20,rgb:[0,65,255],label:'やや強い雨'},
  {min:5,max:10,rgb:[33,140,255],label:'雨'},
  {min:1,max:5,rgb:[160,210,255],label:'弱い雨'},
  {min:.1,max:1,rgb:[242,242,242],label:'ごく弱い雨'},
];

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

const paeth=(a,b,c)=>{
  const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);
  return pa<=pb&&pa<=pc?a:pb<=pc?b:c;
};

const decodePng=bytes=>{
  const buffer=Buffer.from(bytes);
  if(buffer.length<33||buffer.readUInt32BE(0)!==0x89504e47)throw new Error('PNG_INVALID');
  let offset=8,width=0,height=0,bitDepth=0,colorType=0,interlace=0,palette=null,transparency=null;
  const idats=[];
  while(offset+12<=buffer.length){
    const length=buffer.readUInt32BE(offset);offset+=4;
    const type=buffer.toString('ascii',offset,offset+4);offset+=4;
    const data=buffer.subarray(offset,offset+length);offset+=length+4;
    if(type==='IHDR'){
      width=data.readUInt32BE(0);height=data.readUInt32BE(4);bitDepth=data[8];colorType=data[9];interlace=data[12];
    }else if(type==='PLTE')palette=Buffer.from(data);
    else if(type==='tRNS')transparency=Buffer.from(data);
    else if(type==='IDAT')idats.push(Buffer.from(data));
    else if(type==='IEND')break;
  }
  if(!width||!height||interlace!==0)throw new Error('PNG_UNSUPPORTED');
  const channels={0:1,2:3,3:1,4:2,6:4}[colorType];
  if(!channels)throw new Error('PNG_UNSUPPORTED');
  if(![1,2,4,8].includes(bitDepth)||colorType!==3&&bitDepth!==8)throw new Error('PNG_UNSUPPORTED');
  const bitsPerPixel=channels*bitDepth;
  const rowBytes=Math.ceil(width*bitsPerPixel/8);
  const bpp=Math.max(1,Math.ceil(bitsPerPixel/8));
  const raw=inflateSync(Buffer.concat(idats));
  const rows=[];
  let pos=0,previous=Buffer.alloc(rowBytes);
  for(let y=0;y<height;y++){
    const filter=raw[pos++];
    const row=Buffer.from(raw.subarray(pos,pos+rowBytes));pos+=rowBytes;
    for(let x=0;x<rowBytes;x++){
      const a=x>=bpp?row[x-bpp]:0;
      const b=previous[x]??0;
      const cc=x>=bpp?(previous[x-bpp]??0):0;
      if(filter===1)row[x]=(row[x]+a)&255;
      else if(filter===2)row[x]=(row[x]+b)&255;
      else if(filter===3)row[x]=(row[x]+Math.floor((a+b)/2))&255;
      else if(filter===4)row[x]=(row[x]+paeth(a,b,cc))&255;
      else if(filter!==0)throw new Error('PNG_FILTER_UNSUPPORTED');
    }
    rows.push(row);previous=row;
  }

  const packedIndex=(row,x)=>{
    if(bitDepth===8)return row[x];
    const perByte=8/bitDepth;
    const byte=row[Math.floor(x/perByte)];
    const slot=x%perByte;
    const shift=8-bitDepth*(slot+1);
    return (byte>>shift)&((1<<bitDepth)-1);
  };

  const pixel=(x,y)=>{
    const row=rows[Math.max(0,Math.min(height-1,y))];
    const px=Math.max(0,Math.min(width-1,x));
    if(colorType===6){
      const i=px*4;return [row[i],row[i+1],row[i+2],row[i+3]];
    }
    if(colorType===2){
      const i=px*3;return [row[i],row[i+1],row[i+2],255];
    }
    if(colorType===4){
      const i=px*2;return [row[i],row[i],row[i],row[i+1]];
    }
    if(colorType===0){
      const v=row[px];return [v,v,v,255];
    }
    const index=packedIndex(row,px);
    const i=index*3;
    if(!palette||i+2>=palette.length)return [0,0,0,0];
    return [palette[i],palette[i+1],palette[i+2],transparency?.[index]??255];
  };
  return {width,height,pixel};
};

const tilePosition=(lat,lng,z)=>{
  const n=2**z;
  const clipped=Math.max(-85.05112878,Math.min(85.05112878,lat));
  const rad=clipped*Math.PI/180;
  const xf=(lng+180)/360*n;
  const yf=(1-Math.log(Math.tan(rad)+1/Math.cos(rad))/Math.PI)/2*n;
  return {
    x:Math.floor(xf),y:Math.floor(yf),
    px:Math.max(0,Math.min(255,Math.floor((xf-Math.floor(xf))*256))),
    py:Math.max(0,Math.min(255,Math.floor((yf-Math.floor(yf))*256))),
  };
};

const tileUrl=(time,z,x,y)=>TILE_TEMPLATE
  .replace('{basetime}',time.basetime)
  .replace('{validtime}',time.validtime)
  .replace('{z}',String(z)).replace('{x}',String(x)).replace('{y}',String(y));

const classify=rgba=>{
  const [r,g,b,a]=rgba;
  if(a===0&&r===255&&g===255&&b===255)return {status:'available',minMmPerHour:0,maxMmPerHour:.1,label:'降水域なし'};
  if(a===0)return {status:'unpainted',minMmPerHour:null,maxMmPerHour:null,label:'判定不能'};
  let best=null,bestDistance=Infinity;
  for(const bucket of RAIN_BUCKETS){
    const [br,bg,bb]=bucket.rgb;
    const distance=(r-br)**2+(g-bg)**2+(b-bb)**2;
    if(distance<bestDistance){bestDistance=distance;best=bucket;}
  }
  if(!best||bestDistance>75**2)return {status:'unknown-color',minMmPerHour:null,maxMmPerHour:null,label:'判定不能'};
  return {status:'available',minMmPerHour:best.min,maxMmPerHour:best.max,label:best.label};
};

const sampleLocations=(lat,lng)=>{
  const points=[];
  for(const dy of [-10,-5,0,5,10]){
    for(const dx of [-10,-5,0,5,10]){
      if(Math.hypot(dx,dy)>ANALYSIS_RADIUS_KM+.01)continue;
      points.push({
        lat:lat+dy/111,
        lng:lng+dx/(111*Math.max(.25,Math.cos(lat*Math.PI/180))),
        center:dx===0&&dy===0,
      });
    }
  }
  return points;
};

const severity=value=>value?.minMmPerHour??-1;

export function createNowcastService({fetcher=fetch,now=Date.now}={}){
  let cache=null,expires=0;
  const tileCache=new Map();

  const read=async url=>{
    const response=await fetcher(url,{
      headers:{Accept:'application/json','User-Agent':'SkyRoute/1.0 nowcast-client'},
      signal:AbortSignal.timeout(10000),
    });
    if(!response.ok)throw new ApiError(502,'JMA_NOWCAST_UNAVAILABLE');
    return response.json();
  };

  const getTimes=async()=>{
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
      tileTemplate:TILE_TEMPLATE,
    };
    expires=currentTime+TTL_MS;
    return {...cache,cached:false};
  };

  const getDecodedTile=async(time,z,x,y)=>{
    const url=tileUrl(time,z,x,y);
    if(tileCache.has(url))return tileCache.get(url);
    const promise=(async()=>{
      const response=await fetcher(url,{
        headers:{Accept:'image/png','User-Agent':'SkyRoute/1.0 nowcast-client'},
        signal:AbortSignal.timeout(10000),
      });
      if(!response.ok)return null;
      try{return decodePng(await response.arrayBuffer());}
      catch{return null;}
    })();
    tileCache.set(url,promise);
    if(tileCache.size>96)tileCache.delete(tileCache.keys().next().value);
    return promise;
  };

  const sampleAt=async(time,lat,lng)=>{
    for(const z of ZOOMS){
      const pos=tilePosition(lat,lng,z);
      const decoded=await getDecodedTile(time,z,pos.x,pos.y);
      if(!decoded)continue;
      const value=classify(decoded.pixel(pos.px,pos.py));
      if(value.status==='available')return {...value,zoom:z};
      if(value.status!=='unpainted')return {...value,zoom:z};
    }
    return {status:'unavailable',minMmPerHour:null,maxMmPerHour:null,label:'判定不能',zoom:null};
  };

  const analyzeFrame=async(time,lat,lng)=>{
    const points=sampleLocations(lat,lng);
    const samples=await Promise.all(points.map(point=>sampleAt(time,point.lat,point.lng)));
    const center=samples[points.findIndex(point=>point.center)]??samples[0];
    const available=samples.filter(value=>value.status==='available');
    const nearbyMax=available.length
      ?available.reduce((max,value)=>severity(value)>severity(max)?value:max,available[0])
      :{status:'unavailable',minMmPerHour:null,maxMmPerHour:null,label:'判定不能',zoom:null};
    return {
      basetime:time.basetime,
      validtime:time.validtime,
      radiusKm:ANALYSIS_RADIUS_KM,
      center,
      nearbyMax,
      availableSamples:available.length,
      totalSamples:samples.length,
    };
  };

  const analyzePoint=async(lat,lng)=>{
    if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<-90||lat>90||lng<-180||lng>180)
      throw new ApiError(400,'INVALID_COORDINATES');
    const times=await getTimes();
    const [current,forecast60]=await Promise.all([
      analyzeFrame(times.current,lat,lng),
      analyzeFrame(times.forecast60,lat,lng),
    ]);
    return {
      lat,lng,current,forecast60,
      fetchedAt:times.fetchedAt,
      source:times.source,
    };
  };

  const service=async()=>getTimes();
  service.analyzePoint=analyzePoint;
  return service;
}
