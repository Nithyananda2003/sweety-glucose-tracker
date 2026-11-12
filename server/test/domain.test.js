import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateReading,
  reportRanges,
  summarize,
  isDate,
  todayInZone,
} from '../../shared/domain.js';

const valid = { date: '2026-10-15', slot: 'morning', value: 100 };
test('reading validation handles required, decimal, range, invalid slot and future dates', () => {
  assert.equal(validateReading(valid, '2026-10-15'), null);
  for (const value of [undefined, null, ''])
    assert.match(validateReading({ ...valid, value }, '2026-10-15'), /Please enter/);
  for (const value of [39, 601, 99.5, '110', NaN, true])
    assert.match(validateReading({ ...valid, value }, '2026-10-15'), /whole number/);
  for (const value of [40, 600])
    assert.equal(validateReading({ ...valid, value }, '2026-10-15'), null);
  assert.match(validateReading({ ...valid, slot: 'bedtime' }, '2026-10-15'), /time slot/);
  assert.match(validateReading({ ...valid, date: '2026-10-16' }, '2026-10-15'), /future/);
});
test('calendar validation rejects rolled-over dates and non-ISO input', () => {
  for (const date of [
    '2026-02-29',
    '2024-02-30',
    '2026-13-01',
    '2026-1-01',
    '10/15/2026',
    null,
    '0099-01-01',
  ])
    assert.equal(isDate(date), false);
  assert.equal(isDate('2024-02-29'), true);
});
test('reports use selected date, month-to-date, and entire previous month', () => {
  assert.deepEqual(reportRanges('2026-10-15'), {
    daily: { from: '2026-10-15', to: '2026-10-15' },
    monthToDate: { from: '2026-10-01', to: '2026-10-15' },
    monthly: { from: '2026-09-01', to: '2026-09-30' },
  });
  assert.deepEqual(reportRanges('2026-01-01').monthly, { from: '2025-12-01', to: '2025-12-31' });
  assert.equal(reportRanges('2024-03-15').monthly.to, '2024-02-29');
});
test('empty statistics stay null and average rounds to one decimal', () => {
  assert.deepEqual(summarize([]), { count: 0, highest: null, lowest: null, average: null });
  assert.deepEqual(summarize([{ value: 100 }, { value: 101 }, { value: 103 }]), {
    count: 3,
    highest: 103,
    lowest: 100,
    average: 101.3,
  });
});
test('today follows application timezone across a UTC midnight boundary', () => {
  assert.equal(todayInZone('Asia/Kolkata', new Date('2026-10-14T20:00:00Z')), '2026-10-15');
  assert.equal(todayInZone('America/Los_Angeles', new Date('2026-10-15T02:00:00Z')), '2026-10-14');
});
