const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();

if (!configuredApiUrl) {
  throw new Error('VITE_API_URL is not configured. Add it to the frontend .env file.');
}

export const API_URL = configuredApiUrl.replace(/\/+$/, '');
