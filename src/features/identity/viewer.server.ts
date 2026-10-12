import type { User } from '@supabase/supabase-js';
import type { AdmittedActor, IdentityViewer } from './contracts';

function readMetadataString(record: unknown, key: string): string | null {
	if (!record || typeof record !== 'object') return null;
	const value = (record as Record<string, unknown>)[key];
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readDisplayName(userMetadata: unknown): string | null {
	const fullName =
		readMetadataString(userMetadata, 'full_name') ??
		readMetadataString(userMetadata, 'name') ??
		[readMetadataString(userMetadata, 'first_name'), readMetadataString(userMetadata, 'last_name')]
			.filter((value): value is string => !!value)
			.join(' ');
	if (!fullName) return null;
	return [readMetadataString(userMetadata, 'rank'), fullName].filter(Boolean).join(' ');
}

export function getIdentityViewer(actor: AdmittedActor | null, user: User | null): IdentityViewer | null {
	if (!actor || user?.id !== actor.userId) return null;
	return { userId: actor.userId, displayName: readDisplayName(user.user_metadata) };
}
