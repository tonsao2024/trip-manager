import dayjs from 'https://esm.sh/dayjs@1.11.13';
import utc from 'https://esm.sh/dayjs@1.11.13/plugin/utc';
import timezone from 'https://esm.sh/dayjs@1.11.13/plugin/timezone';
import relativeTime from 'https://esm.sh/dayjs@1.11.13/plugin/relativeTime';
import customParse from 'https://esm.sh/dayjs@1.11.13/plugin/customParseFormat';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);
dayjs.extend(customParse);

export { dayjs };

export function formatDate(date, locale = 'en', tz = 'Asia/Bangkok') {
  if (!date) return '-';
  const d = dayjs(date).tz(tz);
  if (locale === 'th') {
    return d.locale('th').format('dddd, D MMM YYYY');
  }
  return d.format('dddd, D MMM YYYY');
}

export function formatTime(date, tz = 'Asia/Bangkok', is24h = true) {
  if (!date) return '-';
  const d = dayjs(date).tz(tz);
  return is24h ? d.format('HH:mm') : d.format('hh:mm A');
}

export function formatDateTime(date, tz = 'Asia/Bangkok', is24h = true) {
  if (!date) return '-';
  const d = dayjs(date).tz(tz);
  return `${d.format('DD MMM YYYY')} ${is24h ? d.format('HH:mm') : d.format('hh:mm A')}`;
}

export function getCurrentTimes() {
  const now = dayjs();
  return {
    bangkok: now.tz('Asia/Bangkok'),
    tokyo: now.tz('Asia/Tokyo'),
    local: now
  };
}

export function parseDurationInput(value, unit = 'minutes') {
  // unit: minutes, hours, hour_min
  if (unit === 'hours') return Math.round(Number(value) * 60);
  if (unit === 'hour_min') {
    const [h, m] = String(value).split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }
  return Math.round(Number(value) || 0);
}

export function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return '0 นาที';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} ชม. ${m} นาที`;
  if (h) return `${h} ชม.`;
  return `${m} นาที`;
}

export function getTripDays(startDate, endDate) {
  const start = dayjs(startDate).startOf('day');
  const end = dayjs(endDate).startOf('day');
  const days = [];
  let cur = start;
  while (cur.isBefore(end) || cur.isSame(end, 'day')) {
    days.push(cur.toDate());
    cur = cur.add(1, 'day');
  }
  return days;
}

export function determineUpNextDay(tripDays, itineraryItems) {
  const today = dayjs().startOf('day');
  // Find today with items
  const todayStr = today.format('YYYY-MM-DD');
  const hasToday = tripDays.find(d => dayjs(d).format('YYYY-MM-DD') === todayStr);
  if (hasToday) return todayStr;

  // Find nearest future day with items
  const future = tripDays
    .map(d => dayjs(d))
    .filter(d => d.isAfter(today))
    .sort((a,b) => a.valueOf() - b.valueOf());
  if (future.length) return future[0].format('YYYY-MM-DD');

  // Fallback first or last
  if (tripDays.length) {
    if (today.isBefore(dayjs(tripDays[0]))) return dayjs(tripDays[0]).format('YYYY-MM-DD');
    return dayjs(tripDays[tripDays.length -1]).format('YYYY-MM-DD');
  }
  return null;
}

export function isOverlapping(startA, endA, startB, endB) {
  return dayjs(startA).isBefore(endB) && dayjs(startB).isBefore(endA);
}
