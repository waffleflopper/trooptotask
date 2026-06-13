import type { SupabaseClient } from '@supabase/supabase-js';

type SupabaseResponse<T> = {
	data: T | null;
	error: unknown;
};

export interface AnnouncementDismissalsPort {
	dismiss(userId: string, announcementId: string): Promise<void>;
}

function formatSupabaseError(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === 'string') return error;
	if (error && typeof error === 'object') {
		const candidate = error as { message?: unknown; code?: unknown };
		const message = typeof candidate.message === 'string' ? candidate.message : JSON.stringify(error);
		return typeof candidate.code === 'string' ? `${message} (${candidate.code})` : message;
	}
	return String(error);
}

export function createSupabaseAnnouncementDismissals(config: { supabase: SupabaseClient }): AnnouncementDismissalsPort {
	return {
		async dismiss(userId: string, announcementId: string) {
			const response = (await config.supabase.from('announcement_dismissals').upsert({
				announcement_id: announcementId,
				user_id: userId
			})) as SupabaseResponse<unknown>;

			if (response.error) {
				throw new Error(`table announcement_dismissals upsert failed: ${formatSupabaseError(response.error)}`);
			}
		}
	};
}

export function createSupabaseAnnouncementDismissalsFromLocals(
	locals: Pick<App.Locals, 'supabase'>
): AnnouncementDismissalsPort {
	return createSupabaseAnnouncementDismissals({ supabase: locals.supabase });
}
