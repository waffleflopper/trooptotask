import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminContext } from './adminAdapter';
import {
	createPlatformAnnouncements,
	type PlatformAnnouncement
} from '$lib/server/core/useCases/platformAnnouncements';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination';
import type {
	PlatformAnnouncementStoreCreateInput,
	PlatformAnnouncementToggleInput,
	PlatformAnnouncementToggleUpdate,
	PlatformAnnouncements,
	PlatformAnnouncementsStore
} from '$lib/server/core/useCases/platformAnnouncements';

interface AnnouncementRow {
	id: string;
	title: string;
	message: string;
	type: string;
	is_active: boolean;
	created_at: string;
	expires_at: string | null;
}

type SupabaseResponse<T> = {
	data: T | null;
	error: unknown;
};

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

function assertSupabaseSuccess<T>(operation: string, response: SupabaseResponse<T>): void {
	if (response.error) {
		throw new Error(`${operation} failed: ${formatSupabaseError(response.error)}`);
	}
}

function mapAnnouncement(row: AnnouncementRow): PlatformAnnouncement {
	return {
		id: row.id,
		title: row.title,
		message: row.message,
		type: row.type,
		isActive: row.is_active,
		createdAt: row.created_at,
		expiresAt: row.expires_at
	};
}

export function createSupabasePlatformAnnouncementsStore(supabase: SupabaseClient): PlatformAnnouncementsStore {
	return {
		async listAnnouncements() {
			const { data, error } = await selectAllSupabaseRows<AnnouncementRow>(
				(from, to) =>
					supabase
						.from('platform_announcements')
						.select('*')
						.order('created_at', { ascending: false })
						.range(from, to) as unknown as Promise<SupabaseResponse<AnnouncementRow[]>>
			);
			if (error) throw new Error(`table platform_announcements list failed: ${formatSupabaseError(error)}`);
			return (data ?? []).map(mapAnnouncement);
		},

		async createAnnouncement(input: PlatformAnnouncementStoreCreateInput) {
			const response = (await supabase
				.from('platform_announcements')
				.insert({
					title: input.title,
					message: input.message,
					type: input.type,
					is_active: input.isActive,
					expires_at: input.expiresAt ?? null,
					created_by: input.createdBy
				})
				.select()
				.single()) as SupabaseResponse<AnnouncementRow>;
			assertSupabaseSuccess('table platform_announcements insert', response);
			if (!response.data) throw new Error('table platform_announcements insert failed: missing row');
			return mapAnnouncement(response.data);
		},

		async toggleAnnouncementActive(
			input: PlatformAnnouncementToggleInput
		): Promise<PlatformAnnouncementToggleUpdate | null> {
			const existingResponse = (await supabase
				.from('platform_announcements')
				.select('id, is_active')
				.eq('id', input.id)
				.maybeSingle()) as SupabaseResponse<{ id: string; is_active: boolean }>;
			assertSupabaseSuccess('table platform_announcements toggle fetch', existingResponse);
			if (!existingResponse.data) return null;

			const nextActive = !existingResponse.data.is_active;
			const updateResponse = (await supabase
				.from('platform_announcements')
				.update({ is_active: nextActive, updated_by: input.updatedBy })
				.eq('id', input.id)) as SupabaseResponse<unknown>;
			assertSupabaseSuccess('table platform_announcements toggle update', updateResponse);
			return { id: input.id, isActive: nextActive };
		},

		async deleteAnnouncement(id: string) {
			const response = (await supabase
				.from('platform_announcements')
				.delete()
				.eq('id', id)) as SupabaseResponse<unknown>;
			assertSupabaseSuccess('table platform_announcements delete', response);
		}
	};
}

export function createSupabasePlatformAnnouncements(ctx: AdminContext): PlatformAnnouncements {
	return createPlatformAnnouncements({
		store: createSupabasePlatformAnnouncementsStore(ctx.adminClient),
		actorUserId: ctx.adminUser.id,
		audit: (event) => ctx.audit(event)
	});
}
