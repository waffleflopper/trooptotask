import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './specs',
	fullyParallel: false,
	workers: 1,
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? 'github' : 'html',
	globalSetup: './global-setup.ts',
	globalTeardown: './global-teardown.ts',
	use: {
		baseURL: 'http://localhost:5173',
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
		command: 'npm run dev',
		port: 5173,
		reuseExistingServer: true,
		env: {
			E2E_TESTING: 'true'
		}
	}
});
