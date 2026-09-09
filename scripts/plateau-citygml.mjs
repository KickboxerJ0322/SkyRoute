import { SaxesParser } from 'saxes';

const GML = 'http://www.opengis.net/gml';
const isBuilding = node => node.local === 'Building' && /\/citygml\/building\//.test(node.uri);
const descendants = (node, local) => node.children.flatMap(child => [...(child.local === local ? [child] : []), ...descendants(child, local)]);
const first = (node, local) => descendants(node, local)[0];
const child = (node, local) => node.children.find(n => n.local === local);
const text = node => node?.text.trim() || null;

// Parse only one Building at a time. Appearance/texture and LOD1+ geometry are
// skipped; there is no DOM of the entire municipality and no external entity fetch.
export function createBuildingParser(onBuilding) {
  const parser = new SaxesParser({ xmlns: true });
  const stack = [];
  let building = null, nodes = [], skipped = 0, envelope = null;
  parser.on('doctype', () => { throw new Error('DOCTYPE is not supported'); });
  parser.on('opentag', tag => {
    const attrs = Object.fromEntries(Object.values(tag.attributes).map(a => [a.local, a.value]));
    const parent = stack.at(-1);
    const context = { srsName: attrs.srsName || parent?.srsName || envelope?.srsName,
      dimension: attrs.srsDimension || parent?.dimension || envelope?.dimension };
    if (tag.local === 'Envelope' && tag.uri === GML && !building) envelope = context;
    stack.push(context);
    if (skipped) { skipped++; return; }
    if (building && (/^lod[1-4]/.test(tag.local) || ['boundedBy', 'appearance', 'appearanceMember', 'consistsOfBuildingPart'].includes(tag.local))) { skipped = 1; return; }
    if (isBuilding(tag) && !building) building = { local: tag.local, uri: tag.uri, attrs, ...context, children: [], text: '' };
    else if (building) {
      const node = { local: tag.local, uri: tag.uri, attrs, ...context, children: [], text: '' };
      nodes.at(-1).children.push(node); nodes.push(node); return;
    } else return;
    nodes = [building];
  });
  parser.on('text', value => { if (building && !skipped) nodes.at(-1).text += value; });
  parser.on('cdata', value => { if (building && !skipped) nodes.at(-1).text += value; });
  parser.on('closetag', () => {
    stack.pop();
    if (skipped) { skipped--; return; }
    if (!building) return;
    nodes.pop();
    if (!nodes.length) { onBuilding(building); building = null; }
  });
  return parser;
}

export function parseCodeList(xml) {
  const parser = new SaxesParser({ xmlns: true }); const result = new Map();
  let definition = null, active = null;
  parser.on('doctype', () => { throw new Error('DOCTYPE is not supported'); });
  parser.on('opentag', tag => {
    if (tag.local === 'Definition') definition = {};
    if (definition && ['name', 'description'].includes(tag.local)) { active = tag.local; definition[active] = ''; }
  });
  parser.on('text', value => { if (definition && active) definition[active] += value; });
  parser.on('closetag', tag => {
    if (tag.local === active) active = null;
    if (tag.local === 'Definition') {
      if (definition?.name?.trim() && definition?.description?.trim()) result.set(definition.name.trim(), definition.description.trim());
      definition = null;
    }
  });
  parser.write(xml).close(); return result;
}

export function normalizeRing(points, exterior = true) {
  const ring = points.filter((p, i) => !i || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]);
  while (ring.length > 1 && ring.at(-1)[0] === ring[0][0] && ring.at(-1)[1] === ring[0][1]) ring.pop();
  if (new Set(ring.map(p => p.join(','))).size < 3) throw new Error('Degenerate polygon ring');
  const area = ring.reduce((a, p, i) => { const q = ring[(i + 1) % ring.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0);
  if (Math.abs(area) < 1e-14) throw new Error('Zero-area polygon ring');
  if ((area > 0) !== exterior) ring.reverse();
  return [...ring, [...ring[0]]];
}

function ringCoordinates(node, exterior) {
  const lists = descendants(node, 'posList');
  const positions = lists.length ? lists : descendants(node, 'pos');
  if (!positions.length) throw new Error('Ring has no positions (unresolved xlink or unsupported geometry)');
  const points = [];
  for (const p of positions) {
    // EPSG:6697 is JGD2011 latitude/longitude + height. No guessing from filename.
    if (!/^(?:https?:\/\/www\.opengis\.net\/def\/crs\/EPSG\/0\/6697|urn:ogc:def:crs:EPSG::6697|EPSG:6697)$/.test(p.srsName || '')) throw new Error(`Unsupported CRS: ${p.srsName || 'missing'}`);
    const dim = p.dimension ? Number(p.dimension) : 3; // EPSG:6697 explicitly defines three axes.
    if (dim !== 3) throw new Error(`Unsupported EPSG:6697 dimension: ${dim}`);
    const values = p.text.trim().split(/\s+/).map(Number);
    if (!values.length || values.length % dim || values.some(v => !Number.isFinite(v))) throw new Error('Invalid posList');
    for (let i = 0; i < values.length; i += dim) {
      const [lat, lng] = values.slice(i, i + 2);
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error('Coordinates outside longitude/latitude bounds');
      points.push([Number(lng.toFixed(7)), Number(lat.toFixed(7))]);
    }
  }
  return normalizeRing(points, exterior);
}

export function buildingGeometry(node) {
  const source = child(node, 'lod0FootPrint') || child(node, 'lod0RoofEdge');
  if (!source) return null;
  const polygons = descendants(source, 'Polygon').map(p => {
    const outer = child(p, 'exterior'); if (!outer) throw new Error('Missing polygon exterior');
    return [ringCoordinates(outer, true), ...p.children.filter(n => n.local === 'interior').map(n => ringCoordinates(n, false))];
  });
  if (!polygons.length) throw new Error('LOD0 contains no inline Polygon');
  return { geometry: polygons.length === 1 ? { type: 'Polygon', coordinates: polygons[0] } : { type: 'MultiPolygon', coordinates: polygons }, geometrySource: source.local };
}

export function buildingAttributes(node) {
  const coded = local => { const n = local === 'usage' ? child(node, local) : first(node, local); return { value: text(n), codeSpace: n?.attrs.codeSpace || null }; };
  const height = child(node, 'measuredHeight'), floors = child(node, 'storeysAboveGround');
  const numeric = (n, integer = false) => {
    const raw = text(n); if (raw === null || n?.attrs.nil === 'true') return null;
    const v = Number(raw);
    // Documented source null sentinel; never turn 9999 into a real height/floor count.
    return Number.isFinite(v) && v >= 0 && v !== 9999 && (!integer || Number.isInteger(v)) ? v : null;
  };
  return { gmlId: node.attrs.id || null, name: text(child(node, 'name')), usage: coded('usage'), majorUsage: coded('majorUsage'),
    measuredHeight: height?.attrs.uom === 'm' ? numeric(height) : null,
    storeysAboveGround: numeric(floors, true), rawMeasuredHeight: text(height), rawStoreysAboveGround: text(floors) };
}

export function geometryInBounds(geometry, bbox) {
  // Keep entire building outlines only when their geometry bounds are within the
  // requested rectangle; do not invent clipped buildings or lose holes.
  const rings = geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat();
  return rings.flat().every(([lng, lat]) => lng >= bbox[0] && lng <= bbox[2] && lat >= bbox[1] && lat <= bbox[3]);
}
