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

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
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

		// Optional — only needed when billing is enabled
		{ name: 'STRIPE_SECRET_KEY', value: input.env.STRIPE_SECRET_KEY, required: false },
		{ name: 'STRIPE_WEBHOOK_SECRET', value: input.env.STRIPE_WEBHOOK_SECRET, required: false },
		{ name: 'STRIPE_TEAM_PRICE_ID', value: input.env.STRIPE_TEAM_PRICE_ID, required: false },
		{ name: 'STRIPE_UNIT_PRICE_ID', value: input.env.STRIPE_UNIT_PRICE_ID, required: false },
		{ name: 'STRIPE_TEAM_LEGACY_PRICE_IDS', value: input.env.STRIPE_TEAM_LEGACY_PRICE_IDS, required: false },
		{ name: 'STRIPE_UNIT_LEGACY_PRICE_IDS', value: input.env.STRIPE_UNIT_LEGACY_PRICE_IDS, required: false },
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
	errors.push(...validateStripeModeConfig(input));
	errors.push(...validateTaxConfig(input.env));

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

function parseBooleanEnv(
	name: string,
	value: string | undefined
): { ok: true; value: boolean | null } | { ok: false; error: string } {
	if (!isPresent(value)) return { ok: true, value: null };
	const normalized = value?.trim().toLowerCase();
	if (normalized === 'true') return { ok: true, value: true };
	if (normalized === 'false') return { ok: true, value: false };
	return { ok: false, error: `${name} must be true or false` };
}

function stripeSecretMode(value: string | undefined): 'test' | 'live' | 'unknown' | null {
	if (!isPresent(value)) return null;
	if (value?.startsWith('sk_test_') || value?.startsWith('rk_test_')) return 'test';
	if (value?.startsWith('sk_live_') || value?.startsWith('rk_live_')) return 'live';
	return 'unknown';
}

function validateStripeModeConfig(input: EnvironmentConfigInput): string[] {
	const errors: string[] = [];
	const secretMode = stripeSecretMode(input.env.STRIPE_SECRET_KEY);
	if (secretMode === 'unknown') {
		errors.push('STRIPE_SECRET_KEY mode must be test or live');
	}
	if (input.mode === 'production' && secretMode === 'test') {
		errors.push('STRIPE_SECRET_KEY must not use test mode in production');
	}
	if (input.mode !== 'production' && secretMode === 'live') {
		errors.push('STRIPE_SECRET_KEY must not use live mode outside production');
	}
	return errors;
}

function validateTaxConfig(env: Record<string, string | undefined>): string[] {
	const automaticTax = parseBooleanEnv('STRIPE_AUTOMATIC_TAX_ENABLED', env.STRIPE_AUTOMATIC_TAX_ENABLED);
	const taxVerified = parseBooleanEnv('STRIPE_TAX_DASHBOARD_VERIFIED', env.STRIPE_TAX_DASHBOARD_VERIFIED);
	const errors: string[] = [];
	if (!automaticTax.ok) errors.push(automaticTax.error);
	if (!taxVerified.ok) errors.push(taxVerified.error);
	if (automaticTax.ok && automaticTax.value === true && (!taxVerified.ok || taxVerified.value !== true)) {
		errors.push('STRIPE_TAX_DASHBOARD_VERIFIED must be true when STRIPE_AUTOMATIC_TAX_ENABLED is true');
	}
	return errors;
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
		STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY,
		STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET,
		STRIPE_TEAM_PRICE_ID: env.STRIPE_TEAM_PRICE_ID,
		STRIPE_UNIT_PRICE_ID: env.STRIPE_UNIT_PRICE_ID,
		STRIPE_TEAM_LEGACY_PRICE_IDS: env.STRIPE_TEAM_LEGACY_PRICE_IDS,
		STRIPE_UNIT_LEGACY_PRICE_IDS: env.STRIPE_UNIT_LEGACY_PRICE_IDS,
		STRIPE_AUTOMATIC_TAX_ENABLED: env.STRIPE_AUTOMATIC_TAX_ENABLED,
		STRIPE_TAX_DASHBOARD_VERIFIED: env.STRIPE_TAX_DASHBOARD_VERIFIED,
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
