export const HND = { icao: 'RJTT', iata: 'HND', name: 'Tokyo Haneda Airport', latitude: 35.5494, longitude: 139.7798, altitudeMeters: 6 };
export const finite = value => typeof value === 'number' && Number.isFinite(value);
export const feetToMeters = feet => finite(feet) ? feet * 0.3048 : null;
export const validCoordinate = p => p && finite(p.latitude) && finite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180;
const text = value => typeof value === 'string' && value ? value : null;
const date = value => text(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
export function airport(raw = {}) {
  raw ||= {};
  return { icao: text(raw.code_icao) || text(raw.code) || text(raw.airport_code) || '', iata: text(raw.code_iata), name: text(raw.name),
    latitude: validCoordinate(raw) ? raw.latitude : null, longitude: validCoordinate(raw) ? raw.longitude : null,
    altitudeMeters: feetToMeters(raw.elevation) };
}
export function status(raw) {
  if (raw.cancelled) return 'CANCELLED';
  if (raw.actual_in || raw.actual_on) return 'ARRIVED';
  if (raw.actual_off) return 'ENROUTE';
  if (raw.actual_out) return 'DEPARTED';
  if (/boarding/i.test(raw.status || '')) return 'BOARDING';
  if (raw.scheduled_out || raw.scheduled_off) return 'SCHEDULED';
  return 'UNKNOWN';
}
export function flight(raw) {
  if (!raw || !text(raw.fa_flight_id)) return null;
  return { id: raw.fa_flight_id, ident: text(raw.ident_icao) || text(raw.ident) || '--', callsign: text(raw.ident),
    operator: text(raw.operator_icao) || text(raw.operator), flightNumber: text(raw.flight_number),
    origin: airport(raw.origin), destination: airport(raw.destination), aircraftType: text(raw.aircraft_type), status: status(raw),
    scheduledDeparture: date(raw.scheduled_out || raw.scheduled_off), estimatedDeparture: date(raw.estimated_out || raw.estimated_off), actualDeparture: date(raw.actual_out || raw.actual_off),
    scheduledArrival: date(raw.scheduled_in || raw.scheduled_on), estimatedArrival: date(raw.estimated_in || raw.estimated_on), actualArrival: date(raw.actual_in || raw.actual_on) };
}
export function position(raw) {
  if (!validCoordinate(raw) || !date(raw.timestamp)) return null;
  // AeroAPI v4 altitude is in HUNDREDS of feet; groundspeed is in knots.
  const altitudeMeters = finite(raw.altitude) ? feetToMeters(raw.altitude * 100) : null;
  if (altitudeMeters !== null && (altitudeMeters < -500 || altitudeMeters > 22000)) return null;
  if (finite(raw.groundspeed) && (raw.groundspeed < 0 || raw.groundspeed > 1200)) return null;
  return { latitude: raw.latitude, longitude: raw.longitude, altitudeMeters,
    groundSpeedKmh: finite(raw.groundspeed) ? raw.groundspeed * 1.852 : null,
    heading: finite(raw.heading) ? (raw.heading % 360 + 360) % 360 : null,
    timestamp: date(raw.timestamp), altitudeEstimated: false };
}
export function distance(a, b) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.latitude-a.latitude)*rad/2)**2 + Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin((b.longitude-a.longitude)*rad/2)**2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function track(raw) {
  const sorted = (raw.positions || []).map(position).filter(Boolean).sort((a,b) => Date.parse(a.timestamp)-Date.parse(b.timestamp));
  const clean = [];
  for (const point of sorted) {
    const prev = clean.at(-1);
    if (prev) {
      const seconds = (Date.parse(point.timestamp)-Date.parse(prev.timestamp))/1000;
      if (seconds <= 0 || distance(prev, point) > seconds * 420 + 2000) continue;
      if (prev.latitude === point.latitude && prev.longitude === point.longitude && prev.altitudeMeters === point.altitudeMeters) continue;
    }
    clean.push(point);
  }
  // Fill only missing heights from measured neighbours; never invent a full track altitude.
  clean.forEach((point, i) => {
    if (point.altitudeMeters !== null) return;
    const before = clean.slice(0,i).reverse().find(p => p.altitudeMeters !== null && !p.altitudeEstimated);
    const after = clean.slice(i+1).find(p => p.altitudeMeters !== null && !p.altitudeEstimated);
    if (before || after) {
      const fraction = before && after ? (Date.parse(point.timestamp)-Date.parse(before.timestamp))/(Date.parse(after.timestamp)-Date.parse(before.timestamp)) : 0;
      point.altitudeMeters = before && after ? before.altitudeMeters+(after.altitudeMeters-before.altitudeMeters)*fraction : (before || after).altitudeMeters;
      point.altitudeEstimated = true;
    }
  });
  return clean;
}
export function filedRoute(raw) {
  const fixes = (raw.fixes || []).filter(validCoordinate);
  if(fixes.length<2)return {type:'FILED',altitudeEstimated:true,waypoints:[]};
  const points=[];
  for(let i=0;i<fixes.length-1;i++) {
    const a=fixes[i],b=fixes[i+1];
    const steps=Math.max(1,Math.ceil(64/(fixes.length-1)));
    for(let j=0;j<steps;j++) {
      const t=j/steps;
      // Densify each short filed leg; take the short longitude arc at the dateline.
      const delta=((b.longitude-a.longitude+540)%360)-180;
      points.push({latitude:a.latitude+(b.latitude-a.latitude)*t,longitude:((a.longitude+delta*t+540)%360)-180});
    }
  }
  points.push(fixes.at(-1));
  return {type:'FILED',altitudeEstimated:true,waypoints:points.map((p,i)=>({latitude:p.latitude,longitude:p.longitude,
    altitudeMeters:Math.min(1,i/(points.length-1)*5,(1-i/(points.length-1))*5)*10000+10,altitudeEstimated:true}))};
}
