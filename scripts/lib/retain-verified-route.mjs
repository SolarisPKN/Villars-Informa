/**
 * Keep manually verified map geometry during timetable database updates.
 * Source is the previously audited static GeoJSON, never a guessed station line.
 */
export function retainVerifiedRoute(route, kinds, previousMap) {
  const allowed = new Set([].concat(kinds));
  const previous = previousMap?.routes?.features?.find(
    (feature) => feature.properties?.id === route.properties?.id,
  );
  const kind = previous?.properties?.geometryKind;
  if (!allowed.has(kind) || previous.geometry?.type !== 'LineString' ||
      !Array.isArray(previous.geometry.coordinates)) return route;

  // IGN national railway GIS is generalized (62 / 72 vertices), whereas
  // OSRM road routes typically have hundreds or thousands of nodes.
  const minimumVertices = kind === 'ign-rail-network' ? 40 : 100;
  if (previous.geometry.coordinates.length < minimumVertices) return route;
  if (!previous.geometry.coordinates.every(
    (coord) => Array.isArray(coord) && coord.length >= 2 &&
      Number.isFinite(coord[0]) && Number.isFinite(coord[1]),
  )) return route;

  return {
    ...route,
    properties: {
      ...route.properties,
      geometryKind: kind,
      geometrySource: previous.properties.geometrySource,
      geometrySourceIds: previous.properties.geometrySourceIds,
      geometryCheckedAt: previous.properties.geometryCheckedAt,
    },
    geometry: previous.geometry,
  };
}
