import { describe, expect, it } from 'vitest';
import { validateEnvironmentConfig } from './env';

const baseEnv = {
	PUBLIC_SUPABASE_URL: 'https://supabase.example',
	PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
	SUPABASE_SERVICE_ROLE_KEY: 'service-role-key'
};

describe('environment validation', () => {
	it('fails production startup when Account Setup session signing is not configured', () => {
		const result = validateEnvironmentConfig({
			mode: 'production',
			env: {
				...baseEnv,
				APP_PUBLIC_ORIGIN: 'https://app.trooptotask.org'
			}
		});

		expect(result.errors).toContain('ACCOUNT_SETUP_SESSION_SECRET is required in production');
		expect(result.errors.join(' ')).not.toContain('service-role-key');
	});

	it('requires an official public origin in production for auth email URL generation', () => {
		const result = validateEnvironmentConfig({
			mode: 'production',
			env: {
				...baseEnv,
				ACCOUNT_SETUP_SESSION_SECRET: 'setup-session-secret'
			}
		});

		expect(result.errors).toContain(
			'APP_PUBLIC_ORIGIN, PUBLIC_APP_ORIGIN, or PUBLIC_SITE_URL is required in production'
		);
	});

	it('accepts the existing public origin fallback names in production', () => {
		for (const originName of ['APP_PUBLIC_ORIGIN', 'PUBLIC_APP_ORIGIN', 'PUBLIC_SITE_URL'] as const) {
			const result = validateEnvironmentConfig({
				mode: 'production',
				env: {
					...baseEnv,
					ACCOUNT_SETUP_SESSION_SECRET: 'setup-session-secret',
					[originName]: 'https://app.trooptotask.org'
				}
			});

			expect(result.errors, originName).toEqual([]);
		}
	});

	it('keeps local defaults valid in development and test', () => {
		expect(
			validateEnvironmentConfig({
				mode: 'development',
				env: baseEnv
			}).errors
		).toEqual([]);
		expect(
			validateEnvironmentConfig({
				mode: 'test',
				env: baseEnv
			}).errors
		).toEqual([]);
	});

	it('allows IPv6 loopback HTTP origins for local development', () => {
		const result = validateEnvironmentConfig({
			mode: 'development',
			env: {
				...baseEnv,
				APP_PUBLIC_ORIGIN: 'http://[::1]:5173',
				APP_PUBLIC_ORIGIN_ALLOWLIST: 'http://[::1]:4173'
			}
		});

		expect(result.errors).not.toContain('APP_PUBLIC_ORIGIN must use HTTPS outside local development');
		expect(result.errors).not.toContain('APP_PUBLIC_ORIGIN_ALLOWLIST must use HTTPS outside local development');
		expect(result.errors).toHaveLength(0);
	});

	it('rejects non-HTTPS official public origins outside local development', () => {
		const result = validateEnvironmentConfig({
			mode: 'production',
			env: {
				...baseEnv,
				ACCOUNT_SETUP_SESSION_SECRET: 'setup-session-secret',
				APP_PUBLIC_ORIGIN: 'http://example.com'
			}
		});

		expect(result.errors).toContain('APP_PUBLIC_ORIGIN must use HTTPS outside local development');
	});

	it('rejects Stripe secret modes that do not match the app runtime mode', () => {
		expect(
			validateEnvironmentConfig({
				mode: 'production',
				env: {
					...baseEnv,
					ACCOUNT_SETUP_SESSION_SECRET: 'setup-session-secret',
					APP_PUBLIC_ORIGIN: 'https://app.trooptotask.org',
					STRIPE_SECRET_KEY: 'sk_test_123'
				}
			}).errors
		).toContain('STRIPE_SECRET_KEY must not use test mode in production');

		expect(
			validateEnvironmentConfig({
				mode: 'development',
				env: {
					...baseEnv,
					STRIPE_SECRET_KEY: 'sk_live_123'
				}
			}).errors
		).toContain('STRIPE_SECRET_KEY must not use live mode outside production');
	});

	it('requires Stripe Tax dashboard verification when automatic tax is enabled', () => {
		const result = validateEnvironmentConfig({
			mode: 'production',
			env: {
				...baseEnv,
				ACCOUNT_SETUP_SESSION_SECRET: 'setup-session-secret',
				APP_PUBLIC_ORIGIN: 'https://app.trooptotask.org',
				STRIPE_SECRET_KEY: 'sk_live_123',
				STRIPE_AUTOMATIC_TAX_ENABLED: 'true'
			}
		});

		expect(result.errors).toContain(
			'STRIPE_TAX_DASHBOARD_VERIFIED must be true when STRIPE_AUTOMATIC_TAX_ENABLED is true'
		);
	});

	it('rejects invalid boolean values for tax configuration flags', () => {
		expect(
			validateEnvironmentConfig({
				mode: 'development',
				env: {
					...baseEnv,
					STRIPE_AUTOMATIC_TAX_ENABLED: 'yes'
				}
			}).errors
		).toContain('STRIPE_AUTOMATIC_TAX_ENABLED must be true or false');

		expect(
			validateEnvironmentConfig({
				mode: 'development',
				env: {
					...baseEnv,
					STRIPE_TAX_DASHBOARD_VERIFIED: '1'
				}
			}).errors
		).toContain('STRIPE_TAX_DASHBOARD_VERIFIED must be true or false');
	});

	it('accepts tax disabled and verified tax-enabled configuration', () => {
		expect(
			validateEnvironmentConfig({
				mode: 'development',
				env: {
					...baseEnv,
					STRIPE_SECRET_KEY: 'sk_test_123',
					STRIPE_AUTOMATIC_TAX_ENABLED: 'false'
				}
			}).errors
		).toEqual([]);

		expect(
			validateEnvironmentConfig({
				mode: 'production',
				env: {
					...baseEnv,
					ACCOUNT_SETUP_SESSION_SECRET: 'setup-session-secret',
					APP_PUBLIC_ORIGIN: 'https://app.trooptotask.org',
					STRIPE_SECRET_KEY: 'sk_live_123',
					STRIPE_AUTOMATIC_TAX_ENABLED: 'true',
					STRIPE_TAX_DASHBOARD_VERIFIED: 'true'
				}
			}).errors
		).toEqual([]);
	});

	it('surfaces missing legacy Stripe price catalog variables as optional warnings', () => {
		const result = validateEnvironmentConfig({
			mode: 'development',
			env: baseEnv
		});

		expect(result.warnings).toContain('STRIPE_TEAM_LEGACY_PRICE_IDS is not configured; some features may not work');
		expect(result.warnings).toContain('STRIPE_UNIT_LEGACY_PRICE_IDS is not configured; some features may not work');
	});
});
