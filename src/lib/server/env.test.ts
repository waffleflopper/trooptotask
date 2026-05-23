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
});
