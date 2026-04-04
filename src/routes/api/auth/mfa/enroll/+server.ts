import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals }) => {
	const { data, error } = await locals.supabase.auth.mfa.enroll({
		factorType: 'totp'
	});

	if (error || !data) {
		return json(
			{
				error: error?.message ?? 'Failed to start MFA enrollment.'
			},
			{ status: 400 }
		);
	}

	return json({
		factorId: data.id,
		qrCode: data.totp.qr_code
	});
};
