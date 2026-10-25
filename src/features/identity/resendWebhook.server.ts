import { Webhook } from 'svix';
import { z } from 'zod';
import { env } from '$env/dynamic/private';
import { getAdminClient } from '$lib/server/supabase';

const bounce = z.object({
	type: z.literal('email.bounced'),
	created_at: z.iso.datetime({ offset: true }),
	data: z.object({
		email_id: z.string().min(1),
		bounce: z.object({ message: z.string().min(1) })
	})
});

export async function receiveResendWebhook(request: Request): Promise<Response> {
	const secret = env.RESEND_WEBHOOK_SECRET;
	if (!secret) return Response.json({ error: 'Webhook is not configured' }, { status: 503 });
	let event: unknown;
	try {
		const payload = await request.text();
		new Webhook(secret).verify(payload, {
			'svix-id': request.headers.get('svix-id') ?? '',
			'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
			'svix-signature': request.headers.get('svix-signature') ?? ''
		});
		event = JSON.parse(payload);
	} catch {
		return Response.json({ error: 'Invalid webhook signature' }, { status: 401 });
	}
	if (!event || typeof event !== 'object' || !('type' in event) || event.type !== 'email.bounced')
		return Response.json({ received: true });
	const parsed = bounce.safeParse(event);
	if (!parsed.success) return Response.json({ error: 'Invalid bounce event' }, { status: 400 });
	const { error } = await getAdminClient()
		.from('account_setup_links')
		.update({
			bounced_at: parsed.data.created_at,
			bounce_reason: parsed.data.data.bounce.message.slice(0, 2000)
		})
		.eq('resend_email_id', parsed.data.data.email_id)
		.is('bounced_at', null);
	if (error) return Response.json({ error: 'Unable to record bounce' }, { status: 500 });
	return Response.json({ received: true });
}
