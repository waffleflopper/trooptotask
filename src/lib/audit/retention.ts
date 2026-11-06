/** Entries that keep for 90 days instead of 3 years. Mirrors `audit_private.short_retention_actions()`. */
export const SHORT_RETENTION_AUDIT_ACTIONS = [
	'auth.login_success',
	'auth.login_failure',
	'auth.mfa_verify',
	'security.rate_limit_violation',
	'security.rate_limit_exceeded',
	'member.invite_rate_limited',
	'member.invite_resend_rate_limited',
	'auth.forgot_password_rate_limited',
	'auth.password_update_rate_limited',
	'account_setup.completion_rate_limited',
	'account_setup.renewal_rate_limited',
	'access_request.account_setup_approval_rate_limited',
	'access_request.account_setup_resend_rate_limited'
];
