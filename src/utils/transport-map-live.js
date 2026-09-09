export function routeFamily(feature) {
  if (feature?.properties?.lineKey) return feature.properties.lineKey;
  const identifier = String(feature?.properties?.routeId || feature?.properties?.id || '');
  if (identifier === 'sofse-67') return 'belgrano-sur';
  if (identifier === 'sofse-53') return 'sarmiento-merlo-lobos';
  if (identifier === '135_1623' || identifier === '135_1624' || identifier.includes('322-lujan')) return '322-lujan';
  if (identifier === '135_1625' || identifier === '135_1626' || identifier.includes('322-canuelas')) return '322-canuelas';
  if (identifier.startsWith('739_') || identifier.includes('136-rapido')) return '136-rapido';
  if (identifier.includes('136')) return '136-villars';
  if (feature?.properties?.mode === 'train') return 'belgrano-sur';
  return 'bus';
}

function normalizedDirection(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const directionByRouteId = new Map([
  ['135_1623', 'Luján'],
  ['135_1624', 'Marcos Paz'],
  ['135_1625', 'Cañuelas'],
  ['135_1626', 'Marcos Paz'],
  ['739_670', 'Navarro'],
  ['739_671', 'Primera Junta'],
]);

const directionGroups = {
  'belgrano-sur': {
    blue: ['gonzalez catan'],
    orange: ['lozano', '20 de junio', 'villars', 'marcos paz'],
  },
  'sarmiento-merlo-lobos': {
    blue: ['las heras', 'marcos paz', 'lobos'],
    orange: ['merlo'],
  },
  '322-lujan': {
    blue: ['lujan'],
    orange: ['marcos paz'],
  },
  '322-canuelas': {
    blue: ['canuelas'],
    orange: ['marcos paz'],
  },
  '136-rapido': {
    blue: ['navarro'],
    orange: ['primera junta'],
  },
};

const local136Variant = new Map([
  ['136-e-villars', 'orange'],
  ['136-e-marcos-paz', 'blue'],
  ['136-f-plomer', 'orange'],
  ['136-f-marcos-paz', 'blue'],
  ['136-h-las-heras', 'blue'],
  ['136-h-villars', 'orange'],
  ['136-i-las-heras', 'blue'],
  ['136-i-plomer', 'orange'],
  ['136-g-marcos-paz-las-heras', 'blue'],
]);

export function vehicleDirection(feature) {
  const properties = feature?.properties || {};
  const explicit = properties.direction || properties.destination;
  if (explicit) return String(explicit);
  const routeDirection = directionByRouteId.get(String(properties.routeId || ''));
  if (routeDirection) return routeDirection;
  const label = String(properties.label || '');
  const directedLabel = label.match(/(?:hacia|→)\s*(.+)$/i)?.[1]?.trim();
  if (directedLabel) return directedLabel;
  if (properties.mode === 'train') {
    const destination = label.split('·').at(-1)?.trim();
    if (destination && destination !== label) return destination;
  }
  return null;
}

export function vehicleDirectionVariant(feature) {
  const properties = feature?.properties || {};
  if (properties.directionVariant === 'blue' || properties.directionVariant === 'orange') {
    return properties.directionVariant;
  }
  const localPattern = String(properties.tripId || properties.routeId || '').split(':')[0];
  if (routeFamily(feature) === '136-villars' && local136Variant.has(localPattern)) {
    return local136Variant.get(localPattern);
  }
  const direction = normalizedDirection(vehicleDirection(feature));
  const groups = directionGroups[routeFamily(feature)];
  if (!direction || !groups) return 'unknown';
  if (groups.blue.some((candidate) => direction.includes(candidate))) return 'blue';
  if (groups.orange.some((candidate) => direction.includes(candidate))) return 'orange';
  return 'unknown';
}

export function filtersForSelection(selection, layers = []) {
  return {
    modes: new Set(selection?.mode ? [selection.mode] : []),
    routes: new Set(selection?.lineKey ? [selection.lineKey] : []),
    layers: new Set(layers),
  };
}

export function featureIsVisible(feature, filters) {
  return filters.modes.has(feature?.properties?.mode) && filters.routes.has(routeFamily(feature));
}
