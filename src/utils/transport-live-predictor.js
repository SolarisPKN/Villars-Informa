const METERS_PER_DEGREE = 111_320;
const MAX_GPS_DISTANCE_FROM_ROUTE_METERS = 1200;

export const normalizeLiveName = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function distance(a, b) {
  const latitude = ((a[1] + b[1]) / 2) * Math.PI / 180;
  return Math.hypot((a[0] - b[0]) * METERS_PER_DEGREE * Math.cos(latitude), (a[1] - b[1]) * METERS_PER_DEGREE);
}

function metrics(coordinates) {
  const cumulative = [0];
  for (let index = 1; index < coordinates.length; index += 1) cumulative.push(cumulative.at(-1) + distance(coordinates[index - 1], coordinates[index]));
  return { cumulative, total: cumulative.at(-1) || 0 };
}

export function pointAlongLine(coordinates, meters) {
  const line = metrics(coordinates);
  const target = Math.max(0, Math.min(line.total, meters));
  const index = line.cumulative.findIndex((value) => value >= target);
  if (index <= 0) return coordinates[0];
  const ratio = (target - line.cumulative[index - 1]) / (line.cumulative[index] - line.cumulative[index - 1] || 1);
  return [coordinates[index - 1][0] + (coordinates[index][0] - coordinates[index - 1][0]) * ratio, coordinates[index - 1][1] + (coordinates[index][1] - coordinates[index - 1][1]) * ratio];
}

export function projectPointToLine(point, coordinates) {
  const line = metrics(coordinates);
  let best = { distance: Infinity, along: 0, point: coordinates[0] };
  for (let index = 1; index < coordinates.length; index += 1) {
    const a = coordinates[index - 1]; const b = coordinates[index];
    const latitude = ((a[1] + b[1]) / 2) * Math.PI / 180;
    const sx = METERS_PER_DEGREE * Math.cos(latitude); const sy = METERS_PER_DEGREE;
    const ax = a[0] * sx; const ay = a[1] * sy; const bx = b[0] * sx; const by = b[1] * sy; const px = point[0] * sx; const py = point[1] * sy;
    const length2 = (bx - ax) ** 2 + (by - ay) ** 2;
    const ratio = length2 ? Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / length2)) : 0;
    const projected = [a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio];
    const candidate = distance(point, projected);
    if (candidate < best.distance) best = { distance: candidate, point: projected, along: line.cumulative[index - 1] + distance(a, projected) };
  }
  return best;
}

function argentinaClock(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const values = Object.fromEntries(parts.filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, value]));
  return { day: ['Sat', 'Sun'].includes(values.weekday) ? (values.weekday === 'Sat' ? 'saturday' : 'sunday') : 'weekday', minutes: Number(values.hour) * 60 + Number(values.minute) + date.getSeconds() / 60 };
}

export function routeFamilyForLive(vehicle) {
  if (vehicle?.lineKey) return String(vehicle.lineKey);
  const id = String(vehicle?.routeId || vehicle?.branchId || '');
  if (id.includes('catan-lozano') || ['67', 'sofse-67'].includes(id)) return 'belgrano-sur';
  if (id.includes('merlo-lobos') || ['53', 'sofse-53'].includes(id)) return 'sarmiento-merlo-lobos';
  if (id.includes('322-lujan') || ['135_1623', '135_1624'].includes(id)) return '322-lujan';
  if (id.includes('322-canuelas') || ['135_1625', '135_1626'].includes(id)) return '322-canuelas';
  if (id.includes('136-rapido') || id.startsWith('739_')) return '136-rapido';
  if (id.includes('136')) return '136-villars';
  return id;
}

export function snapshotVehicles(snapshot) {
  if (snapshot?.schemaVersion === 2) return [...(snapshot.trains?.vehicles || []), ...(snapshot.buses?.vehicles || [])];
  if (snapshot?.schemaVersion === 1) return (snapshot.vehicles || []).map((vehicle) => ({ ...vehicle, positionSource: vehicle.positionKind === 'observed' ? 'gps' : 'schedule-estimated', observedAt: vehicle.updatedAt }));
  return [];
}

const serviceNumber = (value) => String(value || '').match(/\b\d{3,6}\b/)?.[0] || String(value || '');

export function normalizedStationKey(family, name) {
  let key = normalizeLiveName(name)
    .replace(/^estacion /, '')
    .replace(/^terminal /, '')
    .replace(/ rp \d+.*$/, '')
    .replace(/ \bbelgrano\b$/, '');
  // Timetables and OSM feature labels differ for the same platforms.
  const aliases = {
    'a ferrari': 'agustin ferrari',
    'maquinista r cal': 'maquinista ricardo cal',
    'hornos': 'general hornos',
    'las heras': 'general las heras',
    'general hornos': 'general hornos',
    'general las heras': 'general las heras',
  };
  key = aliases[key] || key;
  return family + ':' + key;
}


function indexes(mapData) {
  const stations = new Map();
  for (const feature of mapData.stops.features || []) {
    const family = feature.properties?.lineKey; const name = feature.properties?.name;
    if (family && name && feature.geometry?.type === 'Point') stations.set(normalizedStationKey(family, name), feature.geometry.coordinates);
  }
  return stations;
}

function selectShape(mapData, family, service, stations) {
  const candidates = (mapData.routes.features || []).filter((feature) => feature.properties?.lineKey === family && feature.geometry?.type === 'LineString');
  if (!service.stops?.length && candidates.length === 1) {
    return { feature: candidates[0], coordinates: candidates[0].geometry.coordinates, score: 0 };
  }
  const first = stations.get(normalizedStationKey(family, service.stops?.[0]?.station));
  const last = stations.get(normalizedStationKey(family, service.stops?.at(-1)?.station));
  let best = null;
  for (const feature of candidates) {
    // Ignore a deliberately unverified stop-to-stop corridor. A route used
    // for vehicle placement must contain road/rail geometry, not chords.
    if (feature.properties?.geometryKind === 'unverified-reference') continue;
    let coordinates = feature.geometry.coordinates;
    let score = 0;
    if (first || last) {
      const direct = (first ? distance(first, coordinates[0]) : 0)
        + (last ? distance(last, coordinates.at(-1)) : 0);
      const reverse = (first ? distance(first, coordinates.at(-1)) : 0)
        + (last ? distance(last, coordinates[0]) : 0);
      if (reverse < direct) coordinates = [...coordinates].reverse();
      score = Math.min(direct, reverse);
    } else {
      // An unmatched service cannot be assigned a random 136 branch.
      continue;
    }
    if (!best || score < best.score) best = { feature, coordinates, score };
  }
  return best;
}

function scheduledPosition(service, shape, stations, nowMinutes, delayMinutes) {
  const stops = (service.stops || []).filter((stop) => Number.isFinite(stop.minutes));
  const adjusted = nowMinutes - delayMinutes;
  if (stops.length < 2 || adjusted < stops[0].minutes || adjusted > stops.at(-1).minutes) return null;
  let index = stops.findIndex((stop, stopIndex) => stopIndex < stops.length - 1 && adjusted >= stop.minutes && adjusted <= stops[stopIndex + 1].minutes);
  if (index < 0) index = stops.length - 2;
  const from = stops[index]; const to = stops[index + 1]; const full = metrics(shape.coordinates);
  const fromPoint = stations.get(normalizedStationKey(shape.feature.properties.lineKey, from.station));
  const toPoint = stations.get(normalizedStationKey(shape.feature.properties.lineKey, to.station));
  const fromAlong = fromPoint ? projectPointToLine(fromPoint, shape.coordinates).along : full.total * index / (stops.length - 1);
  const toAlong = toPoint ? projectPointToLine(toPoint, shape.coordinates).along : full.total * (index + 1) / (stops.length - 1);
  const ratio = (adjusted - from.minutes) / (to.minutes - from.minutes || 1);
  const along = fromAlong + (toAlong - fromAlong) * ratio;
  return { coordinates: pointAlongLine(shape.coordinates, along), along, fromStop: from.station, toStop: to.station };
}

export class ObservationHistory {
  constructor(limit = 4) { this.limit = limit; this.items = new Map(); }
  push(identity, value) {
    const values = this.items.get(identity) || [];
    if (!values.some((item) => item.at === value.at && item.along === value.along)) values.push(value);
    this.items.set(identity, values.sort((a, b) => a.at - b.at).slice(-this.limit));
  }
  metersPerSecond(identity) {
    const values = this.items.get(identity) || [];
    if (values.length < 2) return null;
    const elapsed = (values.at(-1).at - values[0].at) / 1000;
    return elapsed > 0 ? (values.at(-1).along - values[0].along) / elapsed : null;
  }
}

const feature = (properties, coordinates) => ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates } });


const MAX_GPS_AGE_MS = 10 * 60_000;
const MAX_FUTURE_GPS_MS = 90_000;
const TERMINAL_STATES = new Set(['completed', 'cancelled']);

function validRecentTime(value, date, maxAge = MAX_GPS_AGE_MS) {
  const stamp = new Date(value).getTime();
  if (!value || !Number.isFinite(stamp)) return null;
  const age = date.getTime() - stamp;
  return age >= -MAX_FUTURE_GPS_MS && age <= maxAge ? { stamp, age: Math.max(0, age) } : null;
}

function snapshotGroupFresh(snapshot, mode, date) {
  const group = mode === 'train' ? snapshot?.trains : snapshot?.buses;
  const checkedAt = group?.checkedAt || snapshot?.updatedAt;
  // A new bus poll does not make an old rail observation current.
  return Boolean(validRecentTime(checkedAt, date, 15 * 60_000));
}

function reportLocation(report, snapshot, date) {
  if (!Number.isFinite(report?.lon) || !Number.isFinite(report?.lat)) return null;
  if (report.stale || TERMINAL_STATES.has(report.status)) return null;
  if (!snapshotGroupFresh(snapshot, report.mode, date)) return null;
  if (report.positionSource !== 'gps' && report.positionSource !== 'provider-estimated') return null;
  const time = validRecentTime(report.observedAt || report.sourceTimestamp, date);
  return time ? { ...time, kind: report.positionSource } : null;
}

export function usableLiveReports(snapshot, date = new Date()) {
  // A SOFSE vehicle is physical, not one per timetable service. A single
  // formation can be reported under several trip IDs around a turnaround.
  const reported = snapshotVehicles(snapshot);
  const unique = new Map();
  for (const item of reported) {
    if (TERMINAL_STATES.has(item.status) || item.stale) continue;
    const reading = reportLocation(item, snapshot, date);
    if (!reading) continue;
    const family = routeFamilyForLive(item);
    const identity = item.vehicleId
      ? 'vehicle:' + String(item.vehicleId)
      : item.tripId ? 'trip:' + String(item.tripId)
      : item.serviceNumber ? 'service:' + serviceNumber(item.serviceNumber) : null;
    if (!identity) continue;
    const key = family + ':' + identity;
    const previous = unique.get(key);
    if (!previous || reading.stamp > previous.reading.stamp ||
        (reading.stamp === previous.reading.stamp && reading.kind === 'gps' && previous.reading.kind !== 'gps')) {
      unique.set(key, { item, reading });
    }
  }
  // Two reports for one timetable service can carry different identities.
  const byService = new Map();
  for (const entry of unique.values()) {
    const service = entry.item.serviceNumber;
    const key = service ? routeFamilyForLive(entry.item) + ':' + serviceNumber(service) : null;
    if (!key) continue;
    const previous = byService.get(key);
    if (!previous || entry.reading.stamp > previous.reading.stamp) byService.set(key, entry);
  }
  return [...unique.values()].filter((entry) => {
    const key = entry.item.serviceNumber
      ? routeFamilyForLive(entry.item) + ':' + serviceNumber(entry.item.serviceNumber) : null;
    return !key || byService.get(key) === entry;
  }).map(({ item }) => item);
}

function deduplicateTrainPins(features) {
  // Suppress coincident pins on the same track, but never enforce an arbitrary
  // one-train maximum: separated and independently identifiable trains survive.
  const result = [];
  const quality = (properties) => properties.positionKind === 'gps' ? 3
    : properties.positionKind === 'gps-corrected' ? 2 : 1;
  for (const feature of features) {
    if (feature.properties.mode !== 'train') { result.push(feature); continue; }
    const index = result.findIndex((previous) =>
      previous.properties.mode === 'train' &&
      previous.properties.lineKey === feature.properties.lineKey &&
      distance(previous.geometry.coordinates, feature.geometry.coordinates) < 80
    );
    if (index < 0) result.push(feature);
    else if (quality(feature.properties) > quality(result[index].properties)) result[index] = feature;
  }
  return result;
}

export function buildPredictedLiveFeatures({ schedules, mapData, snapshot, date = new Date(), history = new ObservationHistory() }) {
  const clock = argentinaClock(date, schedules.timezone || 'America/Argentina/Buenos_Aires');
  const stations = indexes(mapData);
  const realtime = usableLiveReports(snapshot, date);
  const matched = new Set();
  const features = [];
  const byService = new Map(realtime.filter((item) => item.serviceNumber)
    .map((item) => [routeFamilyForLive(item) + ':' + serviceNumber(item.serviceNumber), item]));
  const terminal = new Set(snapshotVehicles(snapshot)
    .filter((item) => TERMINAL_STATES.has(item.status) && !item.stale &&
      snapshotGroupFresh(snapshot, item.mode, date) && item.serviceNumber)
    .map((item) => routeFamilyForLive(item) + ':' + serviceNumber(item.serviceNumber)));
  const seenScheduled = new Set();

  for (const route of schedules.routes || []) {
    for (const grid of (route.schedules || []).filter((item) => item.day?.key === clock.day)) {
      for (const service of grid.services || []) {
        const serviceKey = route.lineKey + ':' + serviceNumber(service.name);
        if (terminal.has(serviceKey) || seenScheduled.has(route.id + ':' + serviceKey)) continue;
        seenScheduled.add(route.id + ':' + serviceKey);
        const shape = selectShape(mapData, route.lineKey, service, stations);
        if (!shape) continue;
        const live = byService.get(serviceKey);
        const delaySeconds = Number(live?.delaySeconds || live?.scheduleDeviation || 0);
        const planned = scheduledPosition(service, shape, stations, clock.minutes, delaySeconds / 60);
        if (!planned && !live) continue;
        let coordinates = planned?.coordinates;
        let positionKind = 'schedule-estimated';
        let positionSource = 'schedule-estimated';
        let speedKmh = live?.speedKmh;
        if (live) {
          const observed = reportLocation(live, snapshot, date);
          const projected = observed && projectPointToLine([live.lon, live.lat], shape.coordinates);
          if (projected && projected.distance <= MAX_GPS_DISTANCE_FROM_ROUTE_METERS) {
            const identity = live.vehicleId || live.tripId || service.name;
            history.push(identity, { at: observed.stamp, along: projected.along });
            const calculated = history.metersPerSecond(identity);
            const velocity = Number.isFinite(Number(speedKmh)) ? Number(speedKmh) / 3.6 : calculated;
            // Never extrapolate an old report over several kilometers.
            const driftSeconds = Math.min(120, observed.age / 1000);
            coordinates = pointAlongLine(shape.coordinates,
              projected.along + (Number.isFinite(velocity) ? velocity * driftSeconds : 0));
            positionKind = observed.kind === 'gps'
              ? (observed.age < 15_000 ? 'gps' : 'gps-corrected') : 'provider-estimated';
            positionSource = observed.kind;
            if (!Number.isFinite(Number(speedKmh)) && Number.isFinite(calculated)) speedKmh = Math.abs(calculated * 3.6);
            matched.add(live);
          }
        }
        if (!coordinates) continue;
        features.push(feature({
          id: live?.vehicleId || 'schedule:' + route.id + ':' + grid.id + ':' + service.id,
          mode: route.type, routeId: live?.routeId || route.id, lineKey: route.lineKey,
          tripId: live?.tripId || route.id + ':' + grid.id + ':' + service.id,
          serviceNumber: serviceNumber(service.name),
          label: (route.type === 'train' ? 'Tren ' : 'Colectivo ') + service.name + ' · ' + service.destination,
          direction: service.destination, positionKind, positionSource,
          fromStop: live?.previousStop || planned?.fromStop,
          toStop: live?.nextStop || planned?.toStop,
          status: live?.status || 'scheduled', delaySeconds, speedKmh,
          stale: false, cancelled: false,
          updatedAt: live?.observedAt || live?.checkedAt || date.toISOString(),
        }, coordinates));
      }
    }
  }
  for (const live of realtime.filter((item) => !matched.has(item))) {
    const family = routeFamilyForLive(live);
    const shape = selectShape(mapData, family, { stops: [] }, stations);
    if (!shape) continue;
    const projected = projectPointToLine([live.lon, live.lat], shape.coordinates);
    if (projected.distance > MAX_GPS_DISTANCE_FROM_ROUTE_METERS) continue;
    const reading = reportLocation(live, snapshot, date);
    if (!reading) continue;
    features.push(feature({
      id: live.vehicleId || live.tripId, mode: live.mode, routeId: live.routeId,
      lineKey: family, tripId: live.tripId, serviceNumber: live.serviceNumber,
      label: live.destination || live.routeId, direction: live.destination,
      positionKind: reading.kind === 'gps'
        ? (reading.age < 15_000 ? 'gps' : 'gps-corrected') : 'provider-estimated',
      positionSource: reading.kind,
      status: live.status, delaySeconds: live.delaySeconds,
      stale: false, cancelled: false,
      updatedAt: live.observedAt || live.checkedAt || live.sourceTimestamp,
    }, projected.point));
  }
  return deduplicateTrainPins(features);
}

export function statusRecordForService(snapshot, route, service) {
  const wanted = serviceNumber(service?.name); const candidates = snapshot?.schemaVersion === 2 ? (route?.type === 'train' ? snapshot.trains?.vehicles : snapshot.buses?.vehicles) : snapshot?.services;
  return (candidates || []).find((item) => routeFamilyForLive(item) === route?.lineKey && serviceNumber(item.serviceNumber) === wanted);
}
