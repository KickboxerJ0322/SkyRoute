// Local airport master used to avoid paid AeroAPI airport lookups.
// Coordinates/elevations are static reference data for visualization only.
// Unknown airports are left unresolved by the caller.
const feet=value=>Math.round(value*0.3048);

const rows=[
  ['RJTT','HND','東京国際空港（羽田）',35.5494,139.7798,21],
  ['RJAA','NRT','成田国際空港',35.7719,140.3929,141],
  ['RJBB','KIX','関西国際空港',34.4347,135.2440,26],
  ['RJOO','ITM','大阪国際空港（伊丹）',34.7855,135.4382,39],
  ['RJCC','CTS','新千歳空港',42.7752,141.6923,82],
  ['RJFF','FUK','福岡空港',33.5859,130.4507,32],
  ['ROAH','OKA','那覇空港',26.1958,127.6459,12],
  ['RJSK','AXT','秋田空港',39.6156,140.2186,313],
  ['RJSA','AOJ','青森空港',40.7347,140.6908,664],
  ['RJCH','HKD','函館空港',41.7700,140.8219,151],
  ['RJSC','GAJ','山形空港',38.4119,140.3713,353],
  ['RJSS','SDJ','仙台空港',38.1397,140.9169,15],
  ['RJSF','FKS','福島空港',37.2274,140.4307,1221],
  ['RJAH','IBR','茨城空港',36.1811,140.4154,107],
  ['RJSN','KIJ','新潟空港',37.9559,139.1207,29],
  ['RJNT','TOY','富山空港',36.6483,137.1875,95],
  ['RJNK','KMQ','小松空港',36.3946,136.4065,36],
  ['RJNA','NKM','県営名古屋空港',35.2550,136.9246,52],
  ['RJGG','NGO','中部国際空港',34.8584,136.8054,15],
  ['RJNS','FSZ','富士山静岡空港',34.7960,138.1894,433],
  ['RJBE','UKB','神戸空港',34.6328,135.2239,22],
  ['RJBD','SHM','南紀白浜空港',33.6622,135.3644,298],
  ['RJOB','OKJ','岡山空港',34.7569,133.8553,806],
  ['RJOA','HIJ','広島空港',34.4361,132.9194,1088],
  ['RJOT','TAK','高松空港',34.2142,134.0156,607],
  ['RJOS','TKS','徳島阿波おどり空港',34.1328,134.6067,26],
  ['RJOM','MYJ','松山空港',33.8272,132.6997,25],
  ['RJOK','KCZ','高知龍馬空港',33.5461,133.6694,42],
  ['RJDC','UBJ','山口宇部空港',33.9300,131.2786,23],
  ['RJOW','IWJ','石見空港',34.6764,131.7903,184],
  ['RJOH','YGJ','米子鬼太郎空港',35.4922,133.2364,20],
  ['RJOR','TTJ','鳥取砂丘コナン空港',35.5301,134.1666,65],
  ['RJOC','IZO','出雲縁結び空港',35.4136,132.8900,15],
  ['RJFR','KKJ','北九州空港',33.8459,131.0350,21],
  ['RJFO','OIT','大分空港',33.4794,131.7372,19],
  ['RJFT','KMJ','熊本空港',32.8373,130.8551,642],
  ['RJFU','NGS','長崎空港',32.9169,129.9136,15],
  ['RJFM','KMI','宮崎空港',31.8772,131.4486,20],
  ['RJFK','KOJ','鹿児島空港',31.8034,130.7194,892],
  ['RJKA','ASJ','奄美空港',28.4306,129.7125,27],
  ['ROIG','ISG','新石垣空港',24.3964,124.2450,102],
  ['ROMY','MMY','宮古空港',24.7828,125.2951,150],
  ['RORS','SHI','下地島空港',24.8267,125.1447,26],
  ['RJFS','HSG','佐賀空港',33.1497,130.3022,6],
  ['RJFE','FUJ','福江空港',32.6663,128.8328,251],
  ['RJDB','IKI','壱岐空港',33.7490,129.7854,41],
  ['RJDT','TSJ','対馬空港',34.2849,129.3306,213],
  ['RJDO','OKI','隠岐世界ジオパーク空港',36.1811,133.3248,311],
];

const airports=new Map(rows.map(([icao,iata,name,latitude,longitude,elevationFt])=>[
  icao,
  {
    icao,
    iata,
    name,
    latitude,
    longitude,
    altitudeMeters:feet(elevationFt),
  },
]));

export function localAirport(id){
  return airports.get(String(id||'').toUpperCase())||null;
}

export function mergeLocalAirport(value={}){
  const local=localAirport(value.icao||value.code_icao||value.code);
  if(!local)return value;
  return {
    ...local,
    ...value,
    icao:value.icao||local.icao,
    iata:value.iata||local.iata,
    name:value.name||local.name,
    latitude:value.latitude??local.latitude,
    longitude:value.longitude??local.longitude,
    altitudeMeters:value.altitudeMeters??local.altitudeMeters,
  };
}
