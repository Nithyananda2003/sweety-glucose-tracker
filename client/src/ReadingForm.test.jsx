import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi } from 'vitest';
import ReadingForm from './ReadingForm.jsx';

function setup(props = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <ReadingForm
      date="2026-10-15"
      today="2026-10-15"
      onSave={onSave}
      onClose={onClose}
      {...props}
    />,
  );
  return { user: userEvent.setup(), onSave, onClose };
}
describe('ReadingForm', () => {
  test('shows a required error without calling the API', async () => {
    const { user, onSave } = setup();
    await user.click(screen.getByRole('button', { name: 'Save reading' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Please enter a glucose value.');
    expect(onSave).not.toHaveBeenCalled();
  });
  test.each(['39', '601', '100.5'])('rejects invalid value %s', async (value) => {
    const { user, onSave } = setup();
    await user.type(screen.getByRole('spinbutton'), value);
    await user.click(screen.getByRole('button', { name: 'Save reading' }));
    expect(screen.getByRole('alert')).toHaveTextContent('whole number between 40 and 600');
    expect(onSave).not.toHaveBeenCalled();
  });
  test('submits a number with the selected date and slot', async () => {
    const { user, onSave } = setup();
    await user.selectOptions(screen.getByLabelText('Time slot'), 'after_lunch');
    await user.type(screen.getByRole('spinbutton'), '124');
    await user.click(screen.getByRole('button', { name: 'Save reading' }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ date: '2026-10-15', slot: 'after_lunch', value: 124 }),
    );
  });
  test('shows a server duplicate error and allows retrying', async () => {
    const onSave = vi
      .fn()
      .mockRejectedValue(new Error('You already have an After lunch reading for this date.'));
    const { user } = setup({ onSave });
    await user.type(screen.getByRole('spinbutton'), '120');
    await user.click(screen.getByRole('button', { name: 'Save reading' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already have an After lunch');
    expect(screen.getByRole('button', { name: 'Save reading' })).toBeEnabled();
  });
  test('prepopulates an edit and closes on Escape', async () => {
    const { user, onClose } = setup({
      reading: { id: 1, date: '2026-10-14', slot: 'after_dinner', value: 133 },
    });
    expect(screen.getByLabelText('Date')).toHaveValue('2026-10-14');
    expect(screen.getByRole('spinbutton')).toHaveValue(133);
    expect(screen.getByLabelText('Time slot')).toHaveValue('after_dinner');
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  test('rejects a future date even when native date validation is bypassed', async () => {
    const { user, onSave } = setup({ date: '2026-10-16' });
    await user.type(screen.getByRole('spinbutton'), '120');
    await user.click(screen.getByRole('button', { name: 'Save reading' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Date cannot be in the future.');
    expect(onSave).not.toHaveBeenCalled();
  });
});
