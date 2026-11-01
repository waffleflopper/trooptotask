import { defineEnvVars } from '@sveltejs/kit/env';

const optional = { schema: (value: string | undefined) => value };

function required(value: string | undefined): string {
	if (value === undefined) throw new Error('is required');
	return value;
}

export const variables = defineEnvVars({
	PUBLIC_SUPABASE_URL: { public: true, static: true, schema: required },
	PUBLIC_SUPABASE_ANON_KEY: { public: true, static: true, schema: required },
	SUPABASE_SERVICE_ROLE_KEY: optional,
	ACCOUNT_SETUP_SESSION_SECRET: optional,
	APP_PUBLIC_ORIGIN: optional,
	APP_PUBLIC_ORIGIN_ALLOWLIST: optional,
	PUBLIC_APP_ORIGIN: optional,
	PUBLIC_SITE_URL: optional,
	RESEND_API_KEY: optional,
	RESEND_FROM_EMAIL: optional,
	RESEND_WEBHOOK_SECRET: optional,
	CLEANUP_SECRET: optional,
	CRON_SECRET: optional,
	GITHUB_FEEDBACK_TOKEN: optional
});
