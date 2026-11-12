export const SLOTS = [
  { key: 'morning', label: 'Morning', detail: 'Fasting', time: 'Before breakfast' },
  { key: 'after_breakfast', label: 'After breakfast', detail: 'Post-meal', time: 'After your breakfast' },
  { key: 'after_lunch', label: 'After lunch', detail: 'Post-meal', time: 'After your lunch' },
  { key: 'after_dinner', label: 'After dinner', detail: 'Post-meal', time: 'After your dinner' },
];

export function todayInZone(timezone = 'Asia/Kolkata', now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01') return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateReading({ date, slot, value }, today) {
  if (!isDate(date)) return 'Please select a valid date.';
  if (date > today) return 'Date cannot be in the future.';
  if (!SLOTS.some((item) => item.key === slot)) return 'Please select a valid time slot.';
  if (value === undefined || value === null || value === '') return 'Please enter a glucose value.';
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 40 || value > 600) {
    return 'Value must be a whole number between 40 and 600 mg/dl.';
  }
  return null;
}

export function reportRanges(date) {
  const current = new Date(`${date}T00:00:00Z`);
  const year = current.getUTCFullYear();
  const month = current.getUTCMonth();
  const iso = (day) => day.toISOString().slice(0, 10);
  return {
    daily: { from: date, to: date },
    monthToDate: { from: iso(new Date(Date.UTC(year, month, 1))), to: date },
    monthly: { from: iso(new Date(Date.UTC(year, month - 1, 1))), to: iso(new Date(Date.UTC(year, month, 0))) },
  };
}

export function summarize(readings) {
  if (!readings.length) return { count: 0, highest: null, lowest: null, average: null };
  const values = readings.map((reading) => reading.value);
  return {
    count: values.length,
    highest: Math.max(...values),
    lowest: Math.min(...values),
    average: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)),
  };
}
