import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals }) => {
	try {
		const { data, error } = await locals.supabase.auth.mfa.enroll({ factorType: 'totp' });
		if (error) {
			return json({ error: error.message }, { status: 400 });
		}
		if (
			!data ||
			data.type !== 'totp' ||
			typeof data.id !== 'string' ||
			!data.id.trim() ||
			typeof data.totp?.qr_code !== 'string' ||
			!data.totp.qr_code.trim()
		) {
			return json({ error: 'Unable to start MFA enrollment. Try again.' }, { status: 503 });
		}
		return json({ factorId: data.id, qrCode: data.totp.qr_code });
	} catch {
		return json({ error: 'Unable to start MFA enrollment. Try again.' }, { status: 503 });
	}
};
