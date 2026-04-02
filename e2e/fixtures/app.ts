export const appBaseUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173';
export const appHost = new URL(appBaseUrl).hostname;
