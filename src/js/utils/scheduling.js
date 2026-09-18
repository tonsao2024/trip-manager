/**
 * Smart Scheduling - core algorithm
 */
import { dayjs } from './date.js';

export function recalculateSchedule(items, changedItemId, options = {}) {
  // items sorted by order
  // changedItemId: id of item that changed
  // options: { newStartAt, newDuration, newTravel }
  // Returns new items array with updated startAt/endAt

  const sorted = [...items].sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
  const idx = sorted.findIndex(i => i.id === changedItemId);
  if (idx === -1 && changedItemId) throw new Error('Item not found');

  // Clone
  const result = sorted.map(i => ({ ...i }));

  // Apply change to target item if provided
  if (changedItemId && options.newStartAt) {
    result[idx].startAt = options.newStartAt;
  }
  if (changedItemId && options.newDuration != null) {
    result[idx].durationMinutes = options.newDuration;
  }
  if (changedItemId && options.newTravel != null) {
    result[idx].travelToNextMinutes = options.newTravel;
  }

  // Determine start index for recalculation
  let startIdx = 0;
  if (changedItemId) {
    // If start time changed, recalc from this item onward
    // If duration/travel changed, also from this item onward
    startIdx = idx;
  }

  // Ensure startAt exists for first item
  for (let i = startIdx; i < result.length; i++) {
    const curr = result[i];
    if (i === 0) {
      if (!curr.startAt) throw new Error('First item must have startAt');
    } else {
      const prev = result[i-1];
      const prevEnd = dayjs(prev.startAt).add(prev.durationMinutes || 0, 'minute');
      const travel = prev.travelToNextMinutes || 0;
      curr.startAt = prevEnd.add(travel, 'minute').toDate();
    }
    // Calculate endAt
    curr.endAt = dayjs(curr.startAt).add(curr.durationMinutes || 0, 'minute').toDate();
  }

  return result;
}

export function detectOverlaps(items) {
  const overlaps = [];
  const sorted = [...items].sort((a,b) => dayjs(a.startAt).valueOf() - dayjs(b.startAt).valueOf());
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i-1];
    const curr = sorted[i];
    if (dayjs(curr.startAt).isBefore(dayjs(prev.endAt))) {
      overlaps.push({ prev: prev.id, curr: curr.id });
    }
  }
  return overlaps;
}

export function calculateEndAt(startAt, durationMinutes) {
  return dayjs(startAt).add(durationMinutes, 'minute').toDate();
}

export function calculateNextStart(endAt, travelMinutes) {
  return dayjs(endAt).add(travelMinutes, 'minute').toDate();
}

export function validateItineraryItem(item) {
  const errors = [];
  if (!item.title || !item.title.trim()) errors.push('Title required');
  if (!item.date) errors.push('Date required');
  if (!item.startAt) errors.push('Start time required');
  if (item.durationMinutes < 0) errors.push('Duration cannot be negative');
  if (item.travelToNextMinutes < 0) errors.push('Travel time cannot be negative');
  if (item.coordinates) {
    const parts = item.coordinates.split(',').map(s => s.trim());
    if (parts.length !== 2) errors.push('Coordinates must be lat,lng');
    else {
      const lat = Number(parts[0]), lng = Number(parts[1]);
      if (isNaN(lat) || lat < -90 || lat > 90) errors.push('Invalid latitude');
      if (isNaN(lng) || lng < -180 || lng > 180) errors.push('Invalid longitude');
    }
  }
  return { valid: errors.length === 0, errors };
}
