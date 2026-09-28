import { inflateSync } from 'node:zlib';
import { ApiError } from './cache.mjs';

const CURRENT_URL='https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N1.json';
const FORECAST_URL='https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N2.json';
const HAZARD_URL='https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N3.json';
const TILE_ROOT='https://www.jma.go.jp/bosai/jmatile/data/nowc';
const RAIN_ELEMENT='hrpns';
const THUNDER_ELEMENT='thns';
const TORNADO_ELEMENT='trns';
const RAIN_TILE_TEMPLATE=`${TILE_ROOT}/{basetime}/none/{validtime}/surf/hrpns/{z}/{x}/{y}.png`;
const TTL_MS=60*1000;
const ANALYSIS_RADIUS_KM=10;
const ZOOMS=[8,7,6];

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

const selectElementTimes=(list,element)=>{
  const relevant=list.filter(item=>item.elements.includes(element));
  if(!relevant.length)return {current:null,forecast60:null};
  const latestBase=[...new Set(relevant.map(item=>item.basetime))]
    .sort((a,b)=>parseUtc(b)-parseUtc(a))[0];
  const run=relevant.filter(item=>item.basetime===latestBase);
  const baseMs=parseUtc(latestBase);
  const current=[...run].sort((a,b)=>
    Math.abs(parseUtc(a.validtime)-baseMs)-Math.abs(parseUtc(b.validtime)-baseMs)
  )[0]??null;
  const targetMs=baseMs+60*60*1000;
  const forecast60=[...run].sort((a,b)=>
    Math.abs(parseUtc(a.validtime)-targetMs)-Math.abs(parseUtc(b.validtime)-targetMs)
  )[0]??current;
  return {current,forecast60};
};

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

const layerTileUrl=(time,element,z,x,y)=>
  `${TILE_ROOT}/${time.basetime}/none/${time.validtime}/surf/${element}/${z}/${x}/${y}.png`;

const classifyRain=rgba=>{
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

const emptyThreat=(kind,status='available')=>({
  status,level:0,
  label:kind==='thunder'?'雷活動なし':'竜巻発生確度なし',
  zoom:null,
});

const classifyThreat=(rgba,kind)=>{
  const [r,g,b,a]=rgba;
  if(a<20)return emptyThreat(kind);
  const max=Math.max(r,g,b),min=Math.min(r,g,b);
  if(max-min<28&&max>180)return emptyThreat(kind);
  if(kind==='thunder'){
    if((b>150&&r>100&&b>g*1.35)||(r>160&&b>130&&g<120))
      return {status:'available',level:4,label:'活動度4 · 激しい雷',zoom:null};
    if(r>185&&g<105&&b<140)
      return {status:'available',level:3,label:'活動度3 · やや激しい雷',zoom:null};
    if(r>185&&g>=80&&g<200&&b<130)
      return {status:'available',level:2,label:'活動度2 · 雷あり',zoom:null};
    if(r>170&&g>160&&b<150)
      return {status:'available',level:1,label:'活動度1 · 雷可能性あり',zoom:null};
  }else{
    if(r>180&&g<150&&b<170)
      return {status:'available',level:2,label:'発生確度2 · 激しい突風に注意',zoom:null};
    if(r>170&&g>150&&b<160)
      return {status:'available',level:1,label:'発生確度1 · 激しい突風の可能性',zoom:null};
  }
  return {status:'unknown-color',level:null,label:'判定不能',zoom:null};
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

const rainSeverity=value=>value?.minMmPerHour??-1;
const threatSeverity=value=>value?.level??-1;

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

  const readOptional=async url=>{
    try{return await read(url);}
    catch{return [];}
  };

  const getTimes=async()=>{
    const currentTime=now();
    if(cache&&currentTime<expires)return {...cache,cached:true};

    const [currentRaw,forecastRaw,hazardRaw]=await Promise.all([
      read(CURRENT_URL),read(FORECAST_URL),readOptional(HAZARD_URL),
    ]);
    const currentList=normalize(currentRaw);
    const forecastList=normalize(forecastRaw);
    const hazardList=normalize(hazardRaw);
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
      thunder:selectElementTimes(hazardList,THUNDER_ELEMENT),
      tornado:selectElementTimes(hazardList,TORNADO_ELEMENT),
      fetchedAt:new Date(currentTime).toISOString(),
      source:'Japan Meteorological Agency Nowcast',
      tileTemplate:RAIN_TILE_TEMPLATE,
    };
    expires=currentTime+TTL_MS;
    return {...cache,cached:false};
  };

  const getDecodedTile=async(time,element,z,x,y)=>{
    if(!time)return null;
    const url=layerTileUrl(time,element,z,x,y);
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
    if(tileCache.size>160)tileCache.delete(tileCache.keys().next().value);
    return promise;
  };

  const sampleRainAt=async(time,lat,lng)=>{
    for(const z of ZOOMS){
      const pos=tilePosition(lat,lng,z);
      const decoded=await getDecodedTile(time,RAIN_ELEMENT,z,pos.x,pos.y);
      if(!decoded)continue;
      const value=classifyRain(decoded.pixel(pos.px,pos.py));
      if(value.status==='available')return {...value,zoom:z};
      if(value.status!=='unpainted')return {...value,zoom:z};
    }
    return {status:'unavailable',minMmPerHour:null,maxMmPerHour:null,label:'判定不能',zoom:null};
  };

  const sampleThreatAt=async(time,element,kind,lat,lng)=>{
    if(!time)return {...emptyThreat(kind,'unavailable'),level:null,label:'データなし'};
    for(const z of ZOOMS){
      const pos=tilePosition(lat,lng,z);
      const decoded=await getDecodedTile(time,element,z,pos.x,pos.y);
      if(!decoded)continue;
      const value=classifyThreat(decoded.pixel(pos.px,pos.py),kind);
      if(value.status==='available')return {...value,zoom:z};
      if(value.status!=='unpainted')return {...value,zoom:z};
    }
    return {...emptyThreat(kind,'unavailable'),level:null,label:'判定不能'};
  };

  const analyzeRainFrame=async(time,lat,lng)=>{
    const points=sampleLocations(lat,lng);
    const samples=await Promise.all(points.map(point=>sampleRainAt(time,point.lat,point.lng)));
    const center=samples[points.findIndex(point=>point.center)]??samples[0];
    const available=samples.filter(value=>value.status==='available');
    const nearbyMax=available.length
      ?available.reduce((max,value)=>rainSeverity(value)>rainSeverity(max)?value:max,available[0])
      :{status:'unavailable',minMmPerHour:null,maxMmPerHour:null,label:'判定不能',zoom:null};
    return {
      basetime:time.basetime,validtime:time.validtime,radiusKm:ANALYSIS_RADIUS_KM,
      center,nearbyMax,availableSamples:available.length,totalSamples:samples.length,
    };
  };

  const analyzeThreatFrame=async(time,element,kind,lat,lng)=>{
    if(!time)return {
      basetime:null,validtime:null,radiusKm:ANALYSIS_RADIUS_KM,
      center:{...emptyThreat(kind,'unavailable'),level:null,label:'データなし'},
      nearbyMax:{...emptyThreat(kind,'unavailable'),level:null,label:'データなし'},
      availableSamples:0,totalSamples:0,
    };
    const points=sampleLocations(lat,lng);
    const samples=await Promise.all(points.map(point=>sampleThreatAt(time,element,kind,point.lat,point.lng)));
    const center=samples[points.findIndex(point=>point.center)]??samples[0];
    const available=samples.filter(value=>value.status==='available');
    const nearbyMax=available.length
      ?available.reduce((max,value)=>threatSeverity(value)>threatSeverity(max)?value:max,available[0])
      :{...emptyThreat(kind,'unavailable'),level:null,label:'判定不能'};
    return {
      basetime:time.basetime,validtime:time.validtime,radiusKm:ANALYSIS_RADIUS_KM,
      center,nearbyMax,availableSamples:available.length,totalSamples:samples.length,
    };
  };

  const analyzePoint=async(lat,lng)=>{
    if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<-90||lat>90||lng<-180||lng>180)
      throw new ApiError(400,'INVALID_COORDINATES');
    const times=await getTimes();
    const [current,forecast60,thCurrent,th60,trCurrent,tr60]=await Promise.all([
      analyzeRainFrame(times.current,lat,lng),
      analyzeRainFrame(times.forecast60,lat,lng),
      analyzeThreatFrame(times.thunder.current,THUNDER_ELEMENT,'thunder',lat,lng),
      analyzeThreatFrame(times.thunder.forecast60,THUNDER_ELEMENT,'thunder',lat,lng),
      analyzeThreatFrame(times.tornado.current,TORNADO_ELEMENT,'tornado',lat,lng),
      analyzeThreatFrame(times.tornado.forecast60,TORNADO_ELEMENT,'tornado',lat,lng),
    ]);
    return {
      lat,lng,current,forecast60,
      thunder:{current:thCurrent,forecast60:th60},
      tornado:{current:trCurrent,forecast60:tr60},
      fetchedAt:times.fetchedAt,
      source:times.source,
    };
  };

  const service=async()=>getTimes();
  service.analyzePoint=analyzePoint;
  return service;
}
