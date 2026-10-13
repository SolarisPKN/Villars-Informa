const endpoint = new URL('https://services1.arcgis.com/gKFHG0iKXPnKkg1l/ArcGIS/rest/services/Transporte_Nacional/FeatureServer/0/query');
const params = {
  where: '1=1',
  geometry: '-58.76,-34.82,-58.68,-34.75',
  geometryType: 'esriGeometryEnvelope',
  inSR:'4326',outSR:'4326',
  spatialRel:'esriSpatialRelIntersects',
  outFields:'nam_1,gna_1,fdc_1',
  returnGeometry:'true',
  f:'geojson',
};
for(const [k,v] of Object.entries(params)) endpoint.searchParams.set(k,v);
const response=await fetch(endpoint,{signal:AbortSignal.timeout(30000)});
console.log('ArcGIS national rail HTTP',response.status);
const text=await response.text();console.log('Bytes',text.length,'sample',text.slice(0,350));
if(!response.ok) process.exit(1);
const json=JSON.parse(text);
console.log('GeoJSON count:',json.features?.length,'types:',json.features?.slice(0,12).map(f=>({type:f.geometry?.type,points:f.geometry?.coordinates?.length,name:f.properties?.nam_1})));
