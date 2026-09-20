import axios from 'axios';

const apiBaseURL =
  process.env.NEXT_PUBLIC_API_URL ?? '/api';

// Auth is disabled during development, so every request runs as this
// default business until authentication is re-introduced.
const DEFAULT_BUSINESS_ID =
  process.env.NEXT_PUBLIC_BUSINESS_ID ?? 'joypub';

const api = axios.create({
  baseURL: apiBaseURL, // local backend during development
});

api.interceptors.request.use((config) => {
  // An explicit per-request value wins, so screens that let the owner switch
  // business (branch endpoints are keyed off this header, not a query param)
  // can target the selected business instead of the development default.
  if (!config.headers['x-business-id']) {
    config.headers['x-business-id'] = DEFAULT_BUSINESS_ID;
  }
  return config;
});

export default api;
