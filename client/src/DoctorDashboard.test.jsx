import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import DoctorDashboard from './DoctorDashboard.jsx';
import { api } from './api.js';

vi.mock('./api.js', () => ({ api: vi.fn() }));
const patients = [
  { id: 7, name: 'Alex Morgan', email: 'alex@example.com' },
  { id: 8, name: 'Sam Lee', email: 'sam@example.com' },
];
const date = '2026-11-12';
const report = {
  daily: {
    from: date,
    to: date,
    count: 2,
    average: 120,
    highest: 140,
    lowest: 100,
    readings: [
      { id: 1, date, slot: 'morning', value: 100 },
      { id: 2, date, slot: 'after_lunch', value: 140 },
    ],
  },
  monthToDate: {
    from: '2026-11-01',
    to: date,
    count: 20,
    average: 125.1,
    highest: 170,
    lowest: 90,
  },
  monthly: {
    from: '2026-10-01',
    to: '2026-10-31',
    count: 100,
    average: 130.2,
    highest: 180,
    lowest: 80,
  },
  trend: [],
};
const props = {
  user: { name: 'Dr. Jamie Chen' },
  today: date,
  timezone: 'Asia/Kolkata',
  onLogout: vi.fn(),
};
beforeEach(() => {
  api.mockReset();
  api.mockImplementation(async (path) => (path === '/doctor/patients' ? { patients } : report));
});

test('doctor sees assigned patient reports with daily slots and no editing controls', async () => {
  render(<DoctorDashboard {...props} />);
  expect(await screen.findByText('120.0', { exact: true })).toBeInTheDocument();
  expect(screen.getByText('Morning (fasting)', { exact: true })).toBeInTheDocument();
  expect(screen.getByText('After lunch', { exact: true })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add reading' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Edit.*reading/ })).not.toBeInTheDocument();
  expect(api).toHaveBeenCalledWith('/doctor/patients/7/reports?date=2026-11-12');
});
test('doctor can switch patient and report period using the protected report endpoint', async () => {
  const user = userEvent.setup();
  render(<DoctorDashboard {...props} />);
  await screen.findByText('120.0', { exact: true });
  await user.selectOptions(screen.getByLabelText('Assigned patient'), '8');
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith('/doctor/patients/8/reports?date=2026-11-12'),
  );
  await screen.findByText('120.0', { exact: true });
  await user.click(screen.getByRole('button', { name: 'Previous month', exact: true }));
  expect(await screen.findByText('130.2', { exact: true })).toBeInTheDocument();
});
test('a doctor without assigned patients sees a friendly empty state', async () => {
  api.mockResolvedValue({ patients: [] });
  render(<DoctorDashboard {...props} />);
  expect(
    await screen.findByRole('heading', { name: 'No patients assigned yet' }),
  ).toBeInTheDocument();
  expect(api).toHaveBeenCalledTimes(1);
});
test('a revoked assignment shows the API error and no patient reading values', async () => {
  api.mockImplementation(async (path) => {
    if (path === '/doctor/patients') return { patients };
    throw new Error('Patient not found.');
  });
  render(<DoctorDashboard {...props} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Patient not found.');
  expect(screen.queryByText('120.0', { exact: true })).not.toBeInTheDocument();
});
