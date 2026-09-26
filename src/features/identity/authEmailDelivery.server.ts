import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { getAdminClient } from '$lib/server/supabase';

type AuthEmailType = 'recovery' | 'invite';
type AuthEmailResult = 'sent' | 'user_not_found' | 'failed';

interface SendAuthEmailInput {
	supabase: SupabaseClient;
	type: AuthEmailType;
	email: string;
	redirectTo: string;
	expectedUserId?: string;
}

function isMissingUser(error: { code?: string } | null): boolean {
	return error?.code === 'user_not_found';
}

function escapeHtmlAttribute(value: string): string {
	return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** Generate a provider OTP, then deliver its app confirmation URL through the app's Resend account. */
export async function sendAuthEmail(
	input: SendAuthEmailInput,
	fetchImpl: typeof fetch = fetch
): Promise<AuthEmailResult> {
	const apiKey = env.RESEND_API_KEY ?? process.env.RESEND_API_KEY;
	const from = env.RESEND_FROM_EMAIL ?? process.env.RESEND_FROM_EMAIL;
	if (!apiKey || !from) {
		console.error('[auth-email] Resend delivery is not configured');
		return 'failed';
	}

	let result: Awaited<ReturnType<typeof input.supabase.auth.admin.generateLink>>;
	try {
		result = await input.supabase.auth.admin.generateLink({
			type: input.type,
			email: input.email,
			options: { redirectTo: input.redirectTo }
		});
	} catch {
		console.error('[auth-email] Supabase link generation failed');
		return 'failed';
	}
	const { data, error } = result;
	if (isMissingUser(error)) return 'user_not_found';
	if (error) {
		console.error('[auth-email] Supabase link generation failed');
		return 'failed';
	}

	const tokenHash = data?.properties?.hashed_token;
	if (
		!tokenHash ||
		data.properties.verification_type !== input.type ||
		data.user?.email?.toLowerCase() !== input.email.toLowerCase() ||
		(input.expectedUserId && data.user.id !== input.expectedUserId)
	) {
		console.error('[auth-email] Supabase returned an unexpected link identity or type');
		return 'failed';
	}

	const link = new URL(input.redirectTo);
	link.searchParams.set('token_hash', tokenHash);
	const url = link.toString();
	const recovery = input.type === 'recovery';
	const subject = recovery ? 'Reset your TroopToTask password' : 'Complete your TroopToTask invitation';
	const action = recovery ? 'Reset your password' : 'Set up your account';
	const text = `${recovery ? 'Use this link to reset your TroopToTask password.' : 'Use this link to complete your TroopToTask invitation.'}\n\n${url}\n\nIf you did not request this, you can ignore this email.`;
	const html = `<p>${recovery ? 'Use this link to reset your TroopToTask password.' : 'Use this link to complete your TroopToTask invitation.'}</p><p><a href="${escapeHtmlAttribute(url)}">${action}</a></p><p>If you did not request this, you can ignore this email.</p>`;

	try {
		const response = await fetchImpl('https://api.resend.com/emails', {
			method: 'POST',
			headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ from, to: [input.email], subject, text, html })
		});
		if (!response.ok) {
			console.error('[auth-email] Resend rejected email with status:', response.status);
			return 'failed';
		}
	} catch {
		console.error('[auth-email] Resend delivery failed');
		return 'failed';
	}

	return 'sent';
}

export function sendPublicRecoveryEmail(email: string, redirectTo: string): Promise<AuthEmailResult> {
	return sendAuthEmail({ supabase: getAdminClient(), type: 'recovery', email, redirectTo });
}

export function sendPlatformAuthEmail(input: {
	type: AuthEmailType;
	userId: string;
	email: string;
	redirectTo: string;
}): Promise<AuthEmailResult> {
	return sendAuthEmail({
		supabase: getAdminClient(),
		type: input.type,
		email: input.email,
		redirectTo: input.redirectTo,
		expectedUserId: input.userId
	});
}
