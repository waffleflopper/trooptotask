/**
 * Environment variable validation.
 * Import this module early (e.g., in hooks.server.ts) to catch missing secrets at startup.
 */
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { env } from '$env/dynamic/private';

interface EnvVar {
	name: string;
	value: string | undefined;
	required: boolean;
}

function validateEnv(): void {
	const vars: EnvVar[] = [
		// Static public (build would fail if completely absent, but could be empty)
		{ name: 'PUBLIC_SUPABASE_URL', value: PUBLIC_SUPABASE_URL, required: true },
		{ name: 'PUBLIC_SUPABASE_ANON_KEY', value: PUBLIC_SUPABASE_ANON_KEY, required: true },

		// Dynamic private
		{ name: 'SUPABASE_SERVICE_ROLE_KEY', value: env.SUPABASE_SERVICE_ROLE_KEY, required: true },

		// Optional — only needed when billing is enabled
		{ name: 'STRIPE_SECRET_KEY', value: env.STRIPE_SECRET_KEY, required: false },
		{ name: 'STRIPE_WEBHOOK_SECRET', value: env.STRIPE_WEBHOOK_SECRET, required: false },
		{ name: 'STRIPE_TEAM_PRICE_ID', value: env.STRIPE_TEAM_PRICE_ID, required: false },
		{ name: 'STRIPE_UNIT_PRICE_ID', value: env.STRIPE_UNIT_PRICE_ID, required: false },

		// Optional — only needed for email invitations
		{ name: 'RESEND_API_KEY', value: env.RESEND_API_KEY, required: false },
		{ name: 'RESEND_FROM_EMAIL', value: env.RESEND_FROM_EMAIL, required: false }
	];

	const missing = vars.filter((v) => v.required && !v.value);
	const optional = vars.filter((v) => !v.required && !v.value);

	if (missing.length > 0) {
		console.error(`[env] Missing required environment variables: ${missing.map((v) => v.name).join(', ')}`);
	}

	if (optional.length > 0) {
		console.warn(
			`[env] Missing optional environment variables (some features may not work): ${optional.map((v) => v.name).join(', ')}`
		);
	}
}

validateEnv();
