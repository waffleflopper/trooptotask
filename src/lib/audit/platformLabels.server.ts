import type { SupabaseClient } from '$lib/server/database';
import type { AuditEvent } from './contracts';

const NAME_MAX_LENGTH = 200;

const clip = (value: unknown): string | null =>
	typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, NAME_MAX_LENGTH) : null;

function metadataText(metadata: unknown, key: string): string | null {
	const value = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>)[key] : null;
	return clip(value);
}

/** The account's rank and name from its saved profile, else sign-in metadata; null when no name was ever set. */
function personName(
	profile: { first_name?: unknown; last_name?: unknown; rank?: unknown } | null,
	metadata: unknown
): string | null {
	const name =
		clip([clip(profile?.first_name), clip(profile?.last_name)].filter(Boolean).join(' ')) ??
		metadataText(metadata, 'full_name') ??
		metadataText(metadata, 'name');
	if (!name) return null;
	const rank = [clip(profile?.rank), metadataText(metadata, 'rank')].find((value) => value && value !== 'CIV');
	return [rank, name].filter(Boolean).join(' ');
}

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
				const [{ data }, { data: profile }] = await Promise.all([
					admin.auth.admin.getUserById(resourceId),
					admin.from('user_profiles').select('first_name, last_name, rank').eq('user_id', resourceId).maybeSingle()
				]);
				return personName(profile, data.user?.user_metadata) ?? clip(data.user?.email);
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
