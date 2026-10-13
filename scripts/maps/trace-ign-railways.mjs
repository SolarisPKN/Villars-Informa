/**
 * Deterministic, station-validated railroad geometry from Argentina's national
 * railway GIS (IGN / Ministerio de Transporte). It does NOT fetch Ferromapas.
 * No invented straight lines between stations or disconnected railway segments.
 *
 * Usage: node scripts/maps/trace-ign-railways.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const FILE = resolve('src/data/transport-map.json');
const API_URL = 'https://services1.arcgis.com/gKFHG0iKXPnKkg1l/ArcGIS/rest/services/Transporte_Nacional/FeatureServer/0/query';
const GEOMETRIES = [
  {
    routeId:'belgrano-sur-gonzalez-catan-lozano',
    lineKey:'belgrano-sur',
    // F.C. Belgrano G from González Catán to Villars; G4 toward Lozano.
    ids:[305,292,288],
  },
  {
    routeId:'sarmiento-merlo-lobos',
    lineKey:'sarmiento-merlo-lobos',
    // FC Sarmiento S3 Merlo -> Marcos Paz -> Empalme Lobos; Roca R3
    // shared rail branch from Empalme Lobos to Lobos station.
    ids:[346,334,309,291,225,861],
  },
];
const radians = v => v*Math.PI/180;
function meters(a,b) {
 const dy=radians(a[1]-b[1]),dx=radians(a[0]-b[0]);
 const k=Math.sin(dy/2)**2+Math.cos(radians(a[1]))*Math.cos(radians(b[1]))*Math.sin(dx/2)**2;
 return 12742000*Math.atan2(Math.sqrt(k),Math.sqrt(Math.max(0,1-k)));
}
function length(line) {return line.slice(1).reduce((s,point,i)=>s+meters(line[i],point),0);}
async function query(ids) {
 const url = new URL(API_URL);
 const args={where:'OBJECTID IN ('+ids.join(',')+')',outFields:'OBJECTID,nam_1,fna_1,fdc_1',
  outSR:'4326',returnGeometry:'true',f:'geojson'};
 for(const [k,v] of Object.entries(args)) url.searchParams.set(k,v);
 const r=await fetch(url,{signal:AbortSignal.timeout(45_000),headers:{Accept:'application/json'}});
 if(!r.ok) throw Error('IGN railway source HTTP '+r.status);
 const j=await r.json();
 if(!Array.isArray(j.features)||j.features.length!==ids.length) throw Error('Missing official railway segments '+ids);
 return new Map(j.features.map(f=>[Number(f.properties?.OBJECTID??f.id),f]));
}
function orientedPath(parts,stops) {
 // Assemble each line by its closest endpoint; start near the first station.
 let path=[];
 let sources=[];
 for(const f of parts) {
  if(!f||f.geometry?.type!=='LineString'||f.geometry.coordinates.length<2) throw Error('Invalid official segment');
  let coords=f.geometry.coordinates;
  if (!path.length && parts.length > 1) {
    const next=parts[1].geometry.coordinates;
    const nearestToNext=(p)=>Math.min(meters(p,next[0]),meters(p,next.at(-1)));
    // First segment must END at the connection to segment two, even if
    // its other endpoint is far beyond the first station.
    if(nearestToNext(coords[0])<nearestToNext(coords.at(-1))) coords=[...coords].reverse();
  } else if(path.length && meters(path.at(-1),coords[0])>meters(path.at(-1),coords.at(-1))) {
    coords=[...coords].reverse();
  }
  if(path.length) {
    const gap=meters(path.at(-1),coords[0]);
    if(gap>120)throw Error('IGN rail not connected near '+f.properties.nam_1+': '+gap.toFixed(1)+'m');
    // Endpoint differences smaller than 120m are tolerated ONLY where both
    // are official rail geometry endpoints, not a shortcut between stations.
    if(gap>40) throw Error('IGN railway endpoints differ by '+gap.toFixed(1)+'m; needs review');
    if(gap<0.3) coords=coords.slice(1);
  }
  sources.push({objectId:f.properties.OBJECTID,name:f.properties.nam_1,credit:f.properties.fdc_1});
  path.push(...coords);
 }
 // Trim to nearest vertices of first/last listed stations; this uses only
 // existing official rail coordinates and adds NO station-to-track chord.
 const closest=(point)=>path.reduce((best,coord,i)=>{
  const d=meters(point,coord);return d<best.meters?{meters:d,index:i}:best;
 },{meters:Infinity,index:0});
 const first=closest(stops[0]),last=closest(stops.at(-1));
 console.log('IGN station endpoints',JSON.stringify({first,last,total:path.length}));
 if(first.meters>1500||last.meters>1500||first.index>=last.index)throw Error('Rail station endpoints not aligned with official track');
 path=path.slice(first.index,last.index+1);
 for(const [i,point] of stops.entries()) {
  const closestPoint=path.reduce((best,coord)=>{
    const d=meters(point,coord);return Math.min(best,d);
  },Infinity);
  console.log('Station',i,'track distance',closestPoint.toFixed(0),'m');
  if(closestPoint>1800)throw Error('Station '+i+' more than 1.8km from mapped rail: '+closestPoint.toFixed(0));
 }
 const maxJump=path.slice(1).reduce((max,point,i)=>Math.max(max,meters(path[i],point)),0);
 console.log('IGN rail path',path.length,'vertices',(length(path)/1000).toFixed(2),'km; longest interval',maxJump.toFixed(0),'m');
 if(maxJump>2100||path.length<50)throw Error('Official rail line too sparse/disconnected');
 return {path,sources};
}
const data=JSON.parse(await readFile(FILE,'utf8'));
const all=await query([...new Set(GEOMETRIES.flatMap(({ids})=>ids))]);
for(const {routeId,lineKey,ids} of GEOMETRIES) {
 const feature=data.routes.features.find(f=>f.properties.id===routeId);
 if(!feature)throw Error('Missing route '+routeId);
 const stations=data.stops.features.filter(f=>f.properties.lineKey===lineKey&&f.properties.mode==='train').map(f=>f.geometry.coordinates);
 if(stations.length<4)throw Error('Train stations missing '+lineKey);
 const {path,sources}=orientedPath(ids.map(id=>all.get(id)),stations);
 feature.geometry={type:'LineString',coordinates:path};
 Object.assign(feature.properties,{
  geometryKind:'ign-rail-network',
  geometrySource:'IGN / Ministerio de Transporte - Red ferrocarriles Nacional, official geodata',
  geometrySourceIds:ids,
  geometryCheckedAt:new Date().toISOString().slice(0,10),
 });
 console.log('Replaced',routeId,'with official railway segments:',sources.map(s=>s.name).join(' -> '));
}
data.sources.trainTrackGeometry='IGN / Ministerio de Transporte - Red ferrocarriles Nacional (ArcGIS; official rail polyline data)';
await writeFile(FILE,JSON.stringify(data,null,2)+'\n');
