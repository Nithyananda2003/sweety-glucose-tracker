import bcrypt from 'bcrypt';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

export async function createDoctor(db, { name, email, password }) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80)
    throw new Error('Doctor name must be 1–80 characters.');
  if (
    typeof email !== 'string' ||
    email.trim().length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  )
    throw new Error('A valid doctor email is required.');
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password) > 72)
    throw new Error('DOCTOR_PASSWORD must be at least 8 characters and at most 72 bytes.');
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await db.query(
    `INSERT INTO users (name,email,password_hash,role)
    VALUES ($1,$2,$3,'doctor') RETURNING id,name,email,role`,
    [name.trim(), email.trim().toLowerCase(), passwordHash],
  );
  return result.rows[0];
}

export async function assignPatient(db, doctorEmail, patientEmail, remove = false) {
  if (typeof doctorEmail !== 'string' || typeof patientEmail !== 'string')
    throw new Error('Both --doctor-email and --patient-email are required.');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'SELECT id,role,email FROM users WHERE email=ANY($1::text[]) FOR SHARE',
      [[doctorEmail.trim().toLowerCase(), patientEmail.trim().toLowerCase()]],
    );
    const doctor = result.rows.find(
      (user) => user.email === doctorEmail.trim().toLowerCase() && user.role === 'doctor',
    );
    const patient = result.rows.find(
      (user) => user.email === patientEmail.trim().toLowerCase() && user.role === 'patient',
    );
    if (!doctor || !patient)
      throw new Error('Choose an existing doctor and an existing patient account.');
    if (remove)
      await client.query('DELETE FROM doctor_patients WHERE doctor_id=$1 AND patient_id=$2', [
        doctor.id,
        patient.id,
      ]);
    else
      await client.query(
        'INSERT INTO doctor_patients (doctor_id,patient_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [doctor.id, patient.id],
      );
    await client.query('COMMIT');
    return { doctorId: doctor.id, patientId: patient.id };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { pool } = await import('./db.js');
  try {
    const { positionals, values } = parseArgs({
      allowPositionals: true,
      options: {
        name: { type: 'string' },
        email: { type: 'string' },
        'doctor-email': { type: 'string' },
        'patient-email': { type: 'string' },
      },
    });
    const command = positionals[0];
    if (command === 'create') {
      await createDoctor(pool, {
        name: values.name,
        email: values.email,
        password: process.env.DOCTOR_PASSWORD,
      });
      console.log('Doctor account created.');
    } else if (command === 'assign' || command === 'unassign') {
      await assignPatient(
        pool,
        values['doctor-email'],
        values['patient-email'],
        command === 'unassign',
      );
      console.log(
        command === 'assign' ? 'Patient assigned to doctor.' : 'Patient assignment removed.',
      );
    } else throw new Error('Choose create, assign, or unassign.');
  } catch (error) {
    console.error(error.code === '23505' ? 'This email already has an account.' : error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
