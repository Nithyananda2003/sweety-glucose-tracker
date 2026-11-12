export async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      ...options, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch { throw new Error('Unable to connect. Please check your connection and try again.'); }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Something went wrong. Please try again.');
    error.status = response.status;
    throw error;
  }
  return data;
}
