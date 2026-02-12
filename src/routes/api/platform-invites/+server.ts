import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import crypto from 'crypto';

// Generate a readable invite code
function generateInviteCode(): string {
	// Generate a 8-character alphanumeric code that's easy to type
	const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars like 0/O, 1/I/L
	let code = '';
	const bytes = crypto.randomBytes(8);
	for (let i = 0; i < 8; i++) {
		code += chars[bytes[i] % chars.length];
	}
	return code;
}

export const POST: RequestHandler = async ({ request, locals, url }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	const body = await request.json();
	const { email, expiresInDays = 7 } = body;

	// Generate unique invite code
	const code = generateInviteCode();

	// Calculate expiration date
	const expiresAt = new Date();
	expiresAt.setDate(expiresAt.getDate() + expiresInDays);

	// Create the invite
	const { data, error: dbError } = await locals.supabase
		.from('registration_invites')
		.insert({
			code,
			email: email?.toLowerCase() || null,
			created_by: user.id,
			expires_at: expiresAt.toISOString()
		})
		.select()
		.single();

	if (dbError) {
		console.error('Failed to create invite:', dbError);
		throw error(500, 'Failed to create invite');
	}

	// Generate the registration URL using the current origin
	const baseUrl = url.origin;
	let registrationUrl = `${baseUrl}/auth/register?code=${code}`;
	if (email) {
		registrationUrl += `&email=${encodeURIComponent(email)}`;
	}

	return json({
		id: data.id,
		code: data.code,
		email: data.email,
		expiresAt: data.expires_at,
		registrationUrl
	});
};

export const GET: RequestHandler = async ({ locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	// Get invites created by this user
	const { data, error: dbError } = await locals.supabase
		.from('registration_invites')
		.select('id, code, email, created_at, expires_at, used_at, used_by')
		.eq('created_by', user.id)
		.order('created_at', { ascending: false })
		.limit(50);

	if (dbError) {
		throw error(500, 'Failed to fetch invites');
	}

	return json(data ?? []);
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	const body = await request.json();
	const { id } = body;

	if (!id) throw error(400, 'Missing invite ID');

	// Only allow deleting unused invites that the user created
	const { error: dbError } = await locals.supabase
		.from('registration_invites')
		.delete()
		.eq('id', id)
		.eq('created_by', user.id)
		.is('used_by', null);

	if (dbError) {
		throw error(500, 'Failed to delete invite');
	}

	return json({ success: true });
};
