import { defineConfig } from '@playwright/test';

function resolveBaseURL(rawBaseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:4273') {
	const parsedBaseURL = new URL(rawBaseURL);
	if (!parsedBaseURL.port) {
		parsedBaseURL.port = '4273';
	}
	return parsedBaseURL.toString().replace(/\/$/, '');
}

const baseURL = resolveBaseURL();
const port = Number(new URL(baseURL).port);
const stripeWebhookSecret = 'whsec_e2e_placeholder';
const stripeSecretKey = 'sk_test_dummy';

process.env.E2E_BILLING_WEBHOOK = 'true';
process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || stripeWebhookSecret;
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || stripeSecretKey;

export default defineConfig({
	testDir: './specs',
	testMatch: 'billing-webhook.spec.ts',
	fullyParallel: false,
	workers: 1,
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? 'github' : 'html',
	globalSetup: './global-setup.ts',
	globalTeardown: './global-teardown.ts',
	use: {
		baseURL,
		trace: 'on-first-retry',
		screenshot: 'only-on-failure'
	},
	projects: [
		{
			name: 'chromium',
			use: { browserName: 'chromium' }
		}
	],
	webServer: {
		command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
		port,
		reuseExistingServer: false,
		env: {
			APP_PUBLIC_ORIGIN: baseURL,
			E2E_BILLING_WEBHOOK: 'true',
			E2E_TESTING: 'true',
			MAILPIT_URL: process.env.MAILPIT_URL || 'http://127.0.0.1:56324',
			STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
			STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET
		}
	}
});
