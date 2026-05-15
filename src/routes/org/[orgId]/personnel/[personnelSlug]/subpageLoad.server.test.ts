import { describe, expect, it, vi } from 'vitest';
import { load as documentsLoad } from './documents/+page.server';
import { load as followUpsLoad } from './follow-ups/+page.server';

function makeEvent() {
	return {
		parent: vi.fn(async () => ({
			personnelDetailHeader: {
				person: { id: 'person-1' }
			}
		})),
		depends: vi.fn()
	};
}

describe('personnel detail subpage server loads', () => {
	it('loads follow-ups as an isolated personnel detail sub-page', async () => {
		const event = makeEvent();

		const result = await followUpsLoad(event as never);

		expect(result).toMatchObject({
			personnelId: 'person-1',
			section: 'follow-ups',
			title: 'Follow-ups'
		});
		expect(event.depends).toHaveBeenCalledWith('app:personnel-detail-follow-ups');
	});

	it('loads documents as an isolated personnel detail sub-page', async () => {
		const event = makeEvent();

		const result = await documentsLoad(event as never);

		expect(result).toMatchObject({
			personnelId: 'person-1',
			section: 'documents',
			title: 'Documents'
		});
		expect(event.depends).toHaveBeenCalledWith('app:personnel-detail-documents');
	});
});
