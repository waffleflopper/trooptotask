import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryPlatformAnnouncementsStore } from '$lib/server/adapters/inMemoryPlatformAnnouncements';
import { createPlatformAnnouncements, type PlatformAnnouncementsAuditEvent } from './platformAnnouncements';

const FIRST_ID = '11111111-1111-1111-1111-111111111111';
const SECOND_ID = '22222222-2222-2222-2222-222222222222';
const MISSING_ID = '33333333-3333-3333-3333-333333333333';

function makeAnnouncements() {
	const audit = vi.fn<(event: PlatformAnnouncementsAuditEvent) => void>();
	const store = createInMemoryPlatformAnnouncementsStore({
		announcements: [
			{
				id: FIRST_ID,
				title: 'Older message',
				message: 'Readiness update',
				type: 'info',
				isActive: true,
				createdAt: '2026-06-01T10:00:00.000Z',
				expiresAt: null
			},
			{
				id: SECOND_ID,
				title: 'Maintenance',
				message: 'Planned outage',
				type: 'maintenance',
				isActive: false,
				createdAt: '2026-06-02T10:00:00.000Z',
				expiresAt: '2026-06-05T10:00:00.000Z'
			}
		],
		idFactory: () => '44444444-4444-4444-4444-444444444444',
		now: () => new Date('2026-06-03T10:00:00.000Z')
	});

	return {
		audit,
		store,
		announcements: createPlatformAnnouncements({
			store,
			actorUserId: 'admin-1',
			audit
		})
	};
}

describe('PlatformAnnouncements', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('lists announcements newest first through the public interface', async () => {
		const { announcements } = makeAnnouncements();

		const result = await announcements.list();

		expect(result.map((announcement) => announcement.id)).toEqual([SECOND_ID, FIRST_ID]);
		expect(result[0]).toMatchObject({
			title: 'Maintenance',
			type: 'maintenance',
			isActive: false,
			expiresAt: '2026-06-05T10:00:00.000Z'
		});
	});

	it('creates an active announcement and audits only after the store succeeds', async () => {
		const { announcements, audit } = makeAnnouncements();

		const created = await announcements.create({
			title: ' Platform notice ',
			message: ' Brief all leaders ',
			type: 'warning',
			expiresAt: null
		});

		expect(created).toMatchObject({
			id: '44444444-4444-4444-4444-444444444444',
			title: ' Platform notice ',
			message: ' Brief all leaders ',
			type: 'warning',
			isActive: true,
			createdAt: '2026-06-03T10:00:00.000Z',
			expiresAt: null
		});
		expect(audit).toHaveBeenCalledWith({
			action: 'announcement_create',
			resourceType: 'platform_announcement',
			resourceId: created.id,
			details: { title: ' Platform notice ', type: 'warning' },
			severity: 'info'
		});
	});

	it('toggles active state and audits the resulting action', async () => {
		const { announcements, audit } = makeAnnouncements();

		const result = await announcements.toggleActive(FIRST_ID);

		expect(result).toEqual({ status: 'updated', id: FIRST_ID, isActive: false });
		expect(audit).toHaveBeenCalledWith({
			action: 'announcement_deactivate',
			resourceType: 'platform_announcement',
			resourceId: FIRST_ID,
			details: { is_active: false },
			severity: 'info'
		});
		await expect(announcements.list()).resolves.toEqual(
			expect.arrayContaining([expect.objectContaining({ id: FIRST_ID, isActive: false })])
		);
	});

	it('deletes an announcement and records the delete audit event', async () => {
		const { announcements, audit } = makeAnnouncements();

		await expect(announcements.delete(SECOND_ID)).resolves.toEqual({ success: true });

		expect(audit).toHaveBeenCalledWith({
			action: 'announcement_delete',
			resourceType: 'platform_announcement',
			resourceId: SECOND_ID,
			severity: 'warning'
		});
		await expect(announcements.list()).resolves.not.toEqual(
			expect.arrayContaining([expect.objectContaining({ id: SECOND_ID })])
		);
	});

	it('returns not-found without auditing when an announcement cannot be toggled', async () => {
		const { announcements, audit } = makeAnnouncements();

		await expect(announcements.toggleActive(MISSING_ID)).resolves.toEqual({ status: 'not_found' });

		expect(audit).not.toHaveBeenCalled();
	});

	it('does not audit failed create operations', async () => {
		const audit = vi.fn<(event: PlatformAnnouncementsAuditEvent) => void>();
		const store = createInMemoryPlatformAnnouncementsStore({
			announcements: [],
			createError: new Error('insert failed')
		});
		const announcements = createPlatformAnnouncements({ store, actorUserId: 'admin-1', audit });

		await expect(
			announcements.create({
				title: 'Failure',
				message: 'Do not audit',
				type: 'info',
				expiresAt: null
			})
		).rejects.toThrow('insert failed');

		expect(audit).not.toHaveBeenCalled();
	});
});
