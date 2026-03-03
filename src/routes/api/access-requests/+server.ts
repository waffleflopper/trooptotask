import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAdminClient } from '$lib/server/supabase';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { email, name, reason } = body;

	if (!email || !name) {
		throw error(400, 'Email and name are required');
	}

	// Basic email format check
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		throw error(400, 'Invalid email format');
	}

	const adminClient = getAdminClient();

	// Check for existing pending request
	const { data: existing } = await adminClient
		.from('access_requests')
		.select('id')
		.eq('status', 'pending')
		.ilike('email', email)
		.maybeSingle();

	if (existing) {
		throw error(409, 'A request for this email is already pending');
	}

	const { error: insertError } = await adminClient
		.from('access_requests')
		.insert({
			email: email.toLowerCase(),
			name: name.trim(),
			reason: reason?.trim() || null
		});

	if (insertError) {
		console.error('Failed to create access request:', insertError);
		throw error(500, 'Failed to submit request');
	}

	return json({ success: true });
};
