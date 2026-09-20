/**
 * Environment variable validation.
 * Import this module early (e.g., in hooks.server.ts) to catch missing secrets at startup.
 */
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { env } from '$env/dynamic/private';

type AppMode = 'production' | 'development' | 'test';

interface EnvVar {
	name: string;
	value: string | undefined;
	required: boolean;
}

interface EnvironmentConfigInput {
	mode: AppMode;
	env: Record<string, string | undefined>;
}

export interface EnvironmentConfigValidationResult {
	errors: string[];
	warnings: string[];
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const OFFICIAL_PUBLIC_ORIGIN_NAMES = ['APP_PUBLIC_ORIGIN', 'PUBLIC_APP_ORIGIN', 'PUBLIC_SITE_URL'] as const;

function isPresent(value: string | undefined): boolean {
	return Boolean(value?.trim());
}

function validateOrigin(name: string, value: string | undefined): string | null {
	if (!isPresent(value)) return null;

	try {
		const url = new URL(value as string);
		const isLocalHttp = url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname);
		if (url.protocol !== 'https:' && !isLocalHttp) {
			return `${name} must use HTTPS outside local development`;
		}
		return null;
	} catch {
		return `${name} must be a valid URL origin`;
	}
}

function validateOriginList(name: string, value: string | undefined): string[] {
	if (!isPresent(value)) return [];
	return (value ?? '')
		.split(',')
		.map((origin) => validateOrigin(name, origin.trim()))
		.filter((error): error is string => Boolean(error));
}

export function validateEnvironmentConfig(input: EnvironmentConfigInput): EnvironmentConfigValidationResult {
	const vars: EnvVar[] = [
		// Static public (build would fail if completely absent, but could be empty)
		{ name: 'PUBLIC_SUPABASE_URL', value: input.env.PUBLIC_SUPABASE_URL, required: true },
		{ name: 'PUBLIC_SUPABASE_ANON_KEY', value: input.env.PUBLIC_SUPABASE_ANON_KEY, required: true },

		// Dynamic private
		{ name: 'SUPABASE_SERVICE_ROLE_KEY', value: input.env.SUPABASE_SERVICE_ROLE_KEY, required: true },

		// Optional — only needed for email invitations
		{ name: 'RESEND_API_KEY', value: input.env.RESEND_API_KEY, required: false },
		{ name: 'RESEND_FROM_EMAIL', value: input.env.RESEND_FROM_EMAIL, required: false }
	];

	const errors = vars.filter((v) => v.required && !isPresent(v.value)).map((v) => `${v.name} is required`);
	const warnings = vars
		.filter((v) => !v.required && !isPresent(v.value))
		.map((v) => `${v.name} is not configured; some features may not work`);

	for (const originName of OFFICIAL_PUBLIC_ORIGIN_NAMES) {
		const error = validateOrigin(originName, input.env[originName]);
		if (error) {
			errors.push(error);
		}
	}
	errors.push(...validateOriginList('APP_PUBLIC_ORIGIN_ALLOWLIST', input.env.APP_PUBLIC_ORIGIN_ALLOWLIST));

	if (input.mode === 'production') {
		if (!isPresent(input.env.ACCOUNT_SETUP_SESSION_SECRET)) {
			errors.push('ACCOUNT_SETUP_SESSION_SECRET is required in production');
		}

		const hasOfficialOrigin = OFFICIAL_PUBLIC_ORIGIN_NAMES.some((name) => isPresent(input.env[name]));
		if (!hasOfficialOrigin) {
			errors.push('APP_PUBLIC_ORIGIN, PUBLIC_APP_ORIGIN, or PUBLIC_SITE_URL is required in production');
		}
	}

	return { errors, warnings };
}

function currentMode(): AppMode {
	if (import.meta.env.MODE === 'test' || process.env.NODE_ENV === 'test') return 'test';
	if (import.meta.env.PROD || process.env.NODE_ENV === 'production') return 'production';
	return 'development';
}

function currentEnv(): Record<string, string | undefined> {
	return {
		PUBLIC_SUPABASE_URL,
		PUBLIC_SUPABASE_ANON_KEY,
		SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
		RESEND_API_KEY: env.RESEND_API_KEY,
		RESEND_FROM_EMAIL: env.RESEND_FROM_EMAIL,
		ACCOUNT_SETUP_SESSION_SECRET: env.ACCOUNT_SETUP_SESSION_SECRET,
		APP_PUBLIC_ORIGIN: env.APP_PUBLIC_ORIGIN ?? process.env.APP_PUBLIC_ORIGIN,
		PUBLIC_APP_ORIGIN: env.PUBLIC_APP_ORIGIN ?? process.env.PUBLIC_APP_ORIGIN,
		PUBLIC_SITE_URL: env.PUBLIC_SITE_URL ?? process.env.PUBLIC_SITE_URL,
		APP_PUBLIC_ORIGIN_ALLOWLIST: env.APP_PUBLIC_ORIGIN_ALLOWLIST ?? process.env.APP_PUBLIC_ORIGIN_ALLOWLIST
	};
}

function validateEnv(): void {
	const result = validateEnvironmentConfig({ mode: currentMode(), env: currentEnv() });
	const optionalNames = result.warnings.map((warning) => warning.split(' ')[0]);
	const missingNames = result.errors
		.flatMap((error) => error.match(/[A-Z][A-Z0-9_]+/g) ?? [])
		.filter((name, index, names) => names.indexOf(name) === index);

	if (result.errors.length > 0) {
		console.error(`[env] Invalid environment configuration: ${result.errors.join('; ')}`);
		if (currentMode() === 'production') {
			throw new Error(`[env] Invalid production environment configuration: ${missingNames.join(', ')}`);
		}
	}

	if (optionalNames.length > 0) {
		console.warn(
			`[env] Missing optional environment variables (some features may not work): ${optionalNames.join(', ')}`
		);
	}
}

validateEnv();
