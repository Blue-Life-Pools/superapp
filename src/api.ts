const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();

if (!configuredApiUrl) {
  throw new Error('VITE_API_URL is not configured. Add it to the frontend .env file.');
}

const absoluteApiUrl = /^https?:\/\//i.test(configuredApiUrl)
  ? configuredApiUrl
  : `https://${configuredApiUrl}`;

let parsedApiUrl: URL;

try {
  parsedApiUrl = new URL(absoluteApiUrl);
} catch {
  throw new Error('VITE_API_URL must be a valid absolute backend URL.');
}

export const API_URL = parsedApiUrl.toString().replace(/\/+$/, '');
