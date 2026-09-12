import { argentinaNow, normalizeStationName, serviceDays } from './transport-services.js';
import { statusRecordForService } from './transport-live-predictor.js';

function activeBySchedule(service, minutes) {
  const times = (service?.stops || []).map(({ minutes: value }) => value).filter(Number.isFinite);
  return times.length >= 2 && minutes >= Math.min(...times) && minutes <= Math.max(...times);
}

export function operationalStatusForService(snapshot, route, dayKey, service, timezone, date = new Date(), rank = null) {
  const now = argentinaNow(timezone, date);
  const isToday = dayKey === serviceDays[now.weekday];
  const candidate = isToday ? statusRecordForService(snapshot, route, service) : null;
  const record = candidate && (!candidate.destination || normalizeStationName(candidate.destination) === normalizeStationName(service?.destination)) ? candidate : null;

  if (record?.status === 'cancelled') return { state: 'cancelled', label: 'Cancelado', record };
  if (record?.status === 'delayed') {
    const minutes = Number(record.delayMinutes ?? Number(record.delaySeconds) / 60);
    return {
      state: 'delayed',
      label: Number.isFinite(minutes) && minutes > 0 ? `Demorado +${minutes} min` : 'Demorado',
      record,
    };
  }
  if (record?.status === 'in_progress') return { state: 'in-progress', label: 'En curso', record };
  if (record?.status === 'early') return { state: 'early', label: 'Adelantado', record };
  if (record?.status === 'skipped_stop') return { state: 'skipped-stop', label: 'No para', record };
  if (record?.status === 'confirmed') return { state: 'confirmed', label: 'Confirmado', record };
  if (record?.status === 'completed') return { state: 'completed', label: 'Finalizado', record };
  if (isToday && activeBySchedule(service, now.minutes)) return { state: 'scheduled-active', label: 'En curso estimado', record };
  if (rank === 0) return { state: 'scheduled', label: 'Programado', record };
  return record?.status === 'scheduled' ? { state: 'scheduled', label: 'Programado', record } : null;
}
