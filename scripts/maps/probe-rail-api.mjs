const endpoint = new URL('https://services1.arcgis.com/gKFHG0iKXPnKkg1l/ArcGIS/rest/services/Transporte_Nacional/FeatureServer/0/query');
const params = {
  where: '1=1',
  geometry: '-59.20,-35.25,-58.59,-34.60',
  geometryType: 'esriGeometryEnvelope',
  inSR:'4326',outSR:'4326',spatialRel:'esriSpatialRelIntersects',
  outFields:'OBJECTID,nam_1,fna_1,gna_1,fdc_1',
  returnGeometry:'true',f:'geojson',
};
for(const [k,v] of Object.entries(params)) endpoint.searchParams.set(k,v);
const response=await fetch(endpoint,{signal:AbortSignal.timeout(30000)});
console.log('ArcGIS national rail HTTP',response.status);
const text=await response.text();console.log('Bytes',text.length,'sample',text.slice(0,200));
if(!response.ok) process.exit(1);
const json=JSON.parse(text);
console.log('GeoJSON count:',json.features?.length);
const meters=(a,b)=>Math.hypot((a[0]-b[0])*111.32*Math.cos(a[1]*Math.PI/180),(a[1]-b[1])*111.32);
for(const f of json.features||[]) {
 const list=f.geometry.type==='MultiLineString'?f.geometry.coordinates:[f.geometry.coordinates];
 console.log(JSON.stringify({id:f.id,properties:f.properties,parts:list.length,points:list.reduce((x,l)=>x+l.length,0),
 lines:list.map(l=>({points:l.length,first:l[0],last:l.at(-1),km:l.slice(1).reduce((sum,pt,i)=>sum+meters(l[i],pt),0).toFixed(2)})).slice(0,3)}));
}
