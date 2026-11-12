import { useEffect, useRef, useState } from 'react';
import { X, Droplet, Info, LoaderCircle } from 'lucide-react';
import { SLOTS, validateReading } from '../../shared/domain.js';

export default function ReadingForm({ reading, date, today, onSave, onClose }) {
  const [form, setForm] = useState({ date: reading?.date || date, slot: reading?.slot || 'morning', value: reading?.value ?? '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const dialog = useRef(null);
  const first = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    first.current?.focus();
    const keydown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); if (!saving) onClose(); }
      if (event.key === 'Tab') {
        const elements = dialog.current.querySelectorAll('button:not(:disabled), input, select');
        const start = elements[0];
        const end = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === start) { event.preventDefault(); end.focus(); }
        else if (!event.shiftKey && document.activeElement === end) { event.preventDefault(); start.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [onClose, saving]);
  const change = (event) => { setForm({ ...form, [event.target.name]: event.target.value }); setError(''); };
  async function submit(event) {
    event.preventDefault();
    const body = { ...form, value: form.value === '' ? '' : Number(form.value) };
    const validation = validateReading(body, today);
    if (validation) { setError(validation); return; }
    setSaving(true);
    try { await onSave(body); }
    catch (error) { setError(error.message); setSaving(false); }
  }
  return <div className="modal-backdrop">
    <section ref={dialog} className="modal" role="dialog" aria-modal="true" aria-labelledby="reading-title">
      <div className="modal-head"><span className="icon-box green"><Droplet size={23} /></span><button className="icon-button" onClick={onClose} disabled={saving} aria-label="Close reading form"><X size={21} /></button></div>
      <h2 id="reading-title">{reading?.id ? 'Edit your reading' : 'A little check-in'}</h2>
      <p className="muted">Every reading helps you see the bigger picture.</p>
      <form onSubmit={submit} noValidate>
        <label>Date<input ref={first} type="date" name="date" value={form.date} max={today} min="1900-01-01" onChange={change} required /></label>
        <label>Time slot<select name="slot" value={form.slot} onChange={change}>{SLOTS.map((slot) => <option key={slot.key} value={slot.key}>{slot.label}{slot.key === 'morning' ? ' (fasting)' : ''}</option>)}</select></label>
        <label>Blood glucose<div className="unit-input"><input type="number" name="value" placeholder="e.g. 110" value={form.value} min="40" max="600" step="1" inputMode="numeric" onChange={change} aria-describedby="value-help" /><span>mg/dl</span></div></label>
        <p className="field-help" id="value-help">Enter a whole number between 40 and 600.</p>
        {error && <div role="alert" className="error"><Info size={17} />{error}</div>}
        <div className="form-actions"><button type="button" className="button secondary" onClick={onClose} disabled={saving}>Cancel</button><button className="button primary" disabled={saving}>{saving ? <LoaderCircle size={18} className="spin" /> : <Droplet size={17} />}{saving ? 'Saving…' : 'Save reading'}</button></div>
      </form>
    </section>
  </div>;
}
