import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const inputPath = resolve(process.argv[2] || 'data/transport/horarios.db');
const outputPath = resolve(process.argv[3] || 'src/data/transport-schedules.json');
const requiredTables = ['dias', 'estaciones', 'grilla_estaciones', 'grilla_formaciones', 'grillas', 'horarios', 'recorridos'];
const dayKeys = new Map([['Lunes a Viernes', 'weekday'], ['Sábado', 'saturday'], ['Domingo', 'sunday']]);
const slugify = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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

  const routes = routeRows.map((route) => ({
    id: `${route.tipo_norm}-${slugify(route.ramal || route.nombre)}-${route.id}`,
    type: route.tipo_norm === 'colectivo' ? 'bus' : 'train', name: route.nombre, branch: route.ramal,
    company: route.empresa, websiteUrl: route.website_url, sourceUrl: route.pdf_url,
    validFrom: route.vigencia_iso || null, schedules: schedulesByRoute.get(route.id) || [],
  }));
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
