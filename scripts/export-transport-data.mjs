import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const inputPath = resolve(process.argv[2] || 'data/transport/horarios.db');
const outputPath = resolve(process.argv[3] || 'src/data/transport-schedules.json');
const requiredTables = ['dias', 'estaciones', 'grilla_estaciones', 'grilla_formaciones', 'grillas', 'horarios', 'recorridos'];
const dayKeys = new Map([
  ['Lunes a Viernes', 'weekday'],
  ['Sábado', 'saturday'],
  ['Domingo', 'sunday'],
  ['Feriados', 'holiday'],
  ['No Laboral', 'non-working-day'],
]);
const slugify = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const routeMetadata = {
  'Belgrano Sur': { lineKey: 'belgrano-sur', lineLabel: 'Belgrano Sur', referenceStation: 'Villars' },
  Sarmiento: {
    lineKey: 'sarmiento-merlo-lobos',
    lineLabel: 'Sarmiento · Merlo–Lobos',
    referenceStation: 'Marcos Paz',
    serviceNotice: 'El recorrido histórico llega a Lobos. Por obras, los horarios publicados actualmente corresponden al servicio Merlo–Las Heras.',
    stationContract: ['Merlo', 'Km 34,5', 'A. Ferrari', 'Mariano Acosta', 'Maquinista R. Cal', 'Marcos Paz', 'Zamudio', 'Hornos', 'Las Heras', 'Speratti', 'Zapiola', 'Empalme Lobos', 'Lobos'],
    publishedTerminus: 'Las Heras',
  },
  '136 Ramal A': { lineKey: '136-rapido', lineLabel: '136 Rápido · Primera Junta–Navarro', referenceStation: 'Marcos Paz' },
  '136 Villars': {
    lineKey: '136-villars',
    lineLabel: '136 Villars / Plomer · ramales E–I',
    referenceStation: 'Villars',
    serviceNotice: 'Las salidas y duraciones corresponden a horarios publicados. Cuando la fuente no ofrece la matriz completa, los pasos intermedios se muestran como estimaciones por recorrido.',
    stationContract: [
      { name: 'General Las Heras', matches: ['Terminal Las Heras', '25 De Mayo 1042'] },
      { name: 'General Hornos', matches: ['Rp 40 Y 2 De Abril'] },
      { name: 'Zamudio', matches: ['Ruta Provincial 6 Y Rivadavia', 'Rivadavia Y Ruta Provincial 6', 'Rp 40 Y Rp 6'] },
      { name: 'Villars', matches: ['Estacion Villars', 'Villars'], occurrence: 0 },
      { name: 'Plomer', matches: ['Estación Plomer', 'Cercanías A Est. Plomer', 'Plomer', 'Avenida Plomer Y Los Nogales'] },
      { name: 'Villars', matches: ['Estacion Villars', 'Villars'], occurrence: 1 },
      { name: 'Escuela N° 8 Manuel Belgrano', matches: ['Escuela N° 8 Manuel Belgrano'] },
      { name: 'El Moro', matches: ['Rp40 Y Los Eucaliptus (Country El Moro)', 'El Moro'] },
      { name: 'Marcos Paz', matches: ['Estación Marcos Paz', 'Marcos Paz'] },
      { name: 'Maquinista Ricardo Cal', matches: ['Maquinista Ricardo Cal'] },
      { name: 'Mariano Acosta', matches: ['Mariano Acosta'] },
    ],
  },
  '322 Luján': { lineKey: '322-lujan', lineLabel: '322 · Marcos Paz–Luján', referenceStation: 'Villars' },
  '322 Cañuelas': { lineKey: '322-canuelas', lineLabel: '322 · Marcos Paz–Cañuelas', referenceStation: 'General Las Heras' },
};
const databaseBytes = await readFile(inputPath);
const databaseSha256 = createHash('sha256').update(databaseBytes).digest('hex');
const database = new DatabaseSync(inputPath, { readOnly: true });

try {
  const quickCheck = database.prepare('PRAGMA quick_check').get();
  if (quickCheck?.quick_check !== 'ok') throw new Error(`SQLite quick_check falló: ${JSON.stringify(quickCheck)}`);
  const foreignKeys = database.prepare('PRAGMA foreign_key_check').all();
  if (foreignKeys.length) throw new Error(`SQLite contiene ${foreignKeys.length} referencias inválidas`);
  const available = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(({ name }) => name));
  const missing = requiredTables.filter((table) => !available.has(table));
  if (missing.length) throw new Error(`Faltan tablas requeridas: ${missing.join(', ')}`);

  const routeRows = database.prepare('SELECT * FROM recorridos ORDER BY tipo_norm, nombre_norm, ramal_norm, id').all();
  const gridRows = database.prepare(`
    SELECT g.id, g.recorrido_id, d.nombre AS day_label, destination.nombre AS direction,
           g.metodo_actualizacion AS update_method, g.actualizado_en AS updated_at
    FROM grillas g
    JOIN dias d ON d.id = g.dia_id
    JOIN estaciones destination ON destination.id = g.sentido_estacion_id
    ORDER BY g.recorrido_id, g.id
  `).all();
  const stationQuery = database.prepare(`
    SELECT e.nombre, e.nombre_norm, ge.orden, h.minutos
    FROM grilla_estaciones ge
    JOIN estaciones e ON e.id = ge.estacion_id
    LEFT JOIN horarios h ON h.grilla_estacion_id = ge.id
    WHERE ge.grilla_id = ?
    ORDER BY ge.orden, h.minutos
  `);
  const serviceQuery = database.prepare(`
    SELECT gf.id AS service_id, gf.nombre AS service_name, gf.orden AS service_order,
           e.nombre AS station_name, e.nombre_norm AS station_norm,
           ge.orden AS station_order, h.minutos
    FROM grilla_formaciones gf
    JOIN grilla_estaciones ge ON ge.grilla_id = gf.grilla_id
    JOIN estaciones e ON e.id = ge.estacion_id
    LEFT JOIN horarios h
      ON h.grilla_formacion_id = gf.id
     AND h.grilla_estacion_id = ge.id
    WHERE gf.grilla_id = ?
    ORDER BY gf.orden, ge.orden
  `);

  const schedulesByRoute = new Map();
  let scheduleCount = 0;
  let timeCount = 0;
  let latestUpdate = '';
  for (const grid of gridRows) {
    const stations = new Map();
    for (const row of stationQuery.all(grid.id)) {
      const key = `${row.orden}:${row.nombre_norm}`;
      if (!stations.has(key)) stations.set(key, { name: row.nombre, normalizedName: row.nombre_norm, order: Number(row.orden), times: [] });
      if (row.minutos !== null) { stations.get(key).times.push(Number(row.minutos)); timeCount += 1; }
    }
    const services = new Map();
    for (const row of serviceQuery.all(grid.id)) {
      const serviceId = Number(row.service_id);
      if (!services.has(serviceId)) {
        services.set(serviceId, {
          id: serviceId,
          name: row.service_name,
          order: Number(row.service_order),
          stops: [],
        });
      }
      if (row.minutos !== null) {
        services.get(serviceId).stops.push({
          station: row.station_name,
          normalizedStation: row.station_norm,
          order: Number(row.station_order),
          minutes: Number(row.minutos),
        });
      }
    }
    const normalizedServices = [...services.values()]
      .filter((service) => service.stops.length > 0)
      .map((service) => ({
        ...service,
        origin: service.stops[0].station,
        destination: service.stops.at(-1).station,
      }));
    const dayKey = dayKeys.get(grid.day_label);
    if (!dayKey) throw new Error(`Día no reconocido en la grilla ${grid.id}: ${grid.day_label}`);
    const schedule = {
      id: Number(grid.id), day: { key: dayKey, label: grid.day_label }, direction: grid.direction,
      updateMethod: grid.update_method, updatedAt: grid.updated_at ? `${grid.updated_at.replace(' ', 'T')}Z` : null,
      services: normalizedServices,
      stations: [...stations.values()].map((station) => ({ ...station, times: [...new Set(station.times)] })),
    };
    if (!schedulesByRoute.has(grid.recorrido_id)) schedulesByRoute.set(grid.recorrido_id, []);
    schedulesByRoute.get(grid.recorrido_id).push(schedule);
    scheduleCount += 1;
    if (grid.updated_at && grid.updated_at > latestUpdate) latestUpdate = grid.updated_at;
  }

  const expandedRoutes = routeRows.map((route) => {
    const metadata = routeMetadata[route.ramal] || {};
    return {
      id: `${route.tipo_norm}-${slugify(route.ramal || route.nombre)}-${route.id}`,
      type: route.tipo_norm === 'colectivo' ? 'bus' : 'train', name: route.nombre, branch: route.ramal,
      company: route.empresa, websiteUrl: route.website_url, sourceUrl: route.pdf_url,
      validFrom: route.vigencia_iso || null, schedules: schedulesByRoute.get(route.id) || [],
      ...metadata,
    };
  });
  const local136 = expandedRoutes.filter(({ lineKey }) => lineKey === '136-villars');
  const routes = expandedRoutes.filter(({ lineKey }) => lineKey !== '136-villars');
  if (local136.length) {
    const metadata = routeMetadata['136 Villars'];
    const schedules = local136.flatMap((route) => route.schedules.map((schedule) => ({
      ...schedule,
      direction: /mariano acosta/i.test(schedule.direction) ? 'Mariano Acosta'
        : /marcos paz/i.test(schedule.direction) ? 'Marcos Paz'
          : /plomer/i.test(schedule.direction) ? 'Plomer'
            : /(las heras|25 de mayo 1042)/i.test(schedule.direction) ? 'General Las Heras'
              : /villars/i.test(schedule.direction) ? 'Villars'
                : schedule.direction,
    })));
    routes.push({
      id: 'colectivo-136-villars', type: 'bus', name: '136 Villars / Plomer', branch: '136 Villars',
      company: local136[0].company, websiteUrl: local136[0].websiteUrl,
      sourceUrl: local136.find((route) => route.sourceUrl)?.sourceUrl || null,
      validFrom: local136.map((route) => route.validFrom).filter(Boolean).sort().at(-1) || null,
      schedules,
      variants: local136.map((route) => ({ id: route.id, name: route.name })),
      ...metadata,
    });
  }
  const payload = {
    schemaVersion: 2, timezone: 'America/Argentina/Buenos_Aires',
    source: { repository: 'https://github.com/SolarisPKN/SolarisPKN-Transport', databasePath: 'horarios.db', databaseSha256, updatedAt: latestUpdate ? `${latestUpdate.replace(' ', 'T')}Z` : null },
    stats: { routes: routes.length, schedules: scheduleCount, times: timeCount }, routes,
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Exportados ${routes.length} recorridos, ${scheduleCount} grillas y ${timeCount} horarios.`);
  console.log(`SQLite SHA-256: ${databaseSha256}`);
} finally { database.close(); }
