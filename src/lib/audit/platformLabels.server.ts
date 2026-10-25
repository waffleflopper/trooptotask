import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuditEvent } from './contracts';

const NAME_MAX_LENGTH = 200;

const clip = (value: unknown): string | null =>
	typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, NAME_MAX_LENGTH) : null;

/**
 * The name Activity shows for the record a platform event acted on, read when the event is written.
 * A missing record or a failed read leaves the label out; the audit write must never fail for it.
 */
export async function resolvePlatformTargetName(
	admin: SupabaseClient,
	event: Pick<AuditEvent, 'resourceType' | 'resourceId' | 'details'>
): Promise<string | null> {
	const { resourceType, resourceId } = event;
	if (!resourceId) return null;
	try {
		switch (resourceType) {
			case 'user': {
				const { data } = await admin.auth.admin.getUserById(resourceId);
				return clip(data.user?.email);
			}
			case 'organization': {
				const { data } = await admin.from('organizations').select('name').eq('id', resourceId).maybeSingle();
				return clip(data?.name);
			}
			case 'access_request': {
				const { data } = await admin.from('access_requests').select('name, email').eq('id', resourceId).maybeSingle();
				return clip(data?.name) ?? clip(data?.email);
			}
			case 'platform_announcement': {
				const { data } = await admin.from('platform_announcements').select('title').eq('id', resourceId).maybeSingle();
				return clip(data?.title);
			}
			case 'account_setup_link': {
				const requestId = event.details?.accessRequestId;
				if (typeof requestId !== 'string') return null;
				const { data } = await admin.from('access_requests').select('name, email').eq('id', requestId).maybeSingle();
				return clip(data?.name) ?? clip(data?.email);
			}
			default:
				return null;
		}
	} catch {
		return null;
	}
}
