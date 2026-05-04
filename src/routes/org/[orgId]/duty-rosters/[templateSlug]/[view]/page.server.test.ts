import { describe, expect, it, vi, beforeEach } from 'vitest';

const {
	loadWithContextMock,
	findDutyRosterTemplateBySlugMock,
	listDutyRosterTemplatesMock,
	isDutyRosterTemplateViewMock,
	mockCtx
} = vi.hoisted(() => ({
	loadWithContextMock: vi.fn(),
	findDutyRosterTemplateBySlugMock: vi.fn(),
	listDutyRosterTemplatesMock: vi.fn(),
	isDutyRosterTemplateViewMock: vi.fn(),
	mockCtx: {
		auth: {
			orgId: 'org-1'
		}
	}
}));

vi.mock('$lib/server/adapters/httpAdapter', () => ({
	loadWithContext: loadWithContextMock
}));

vi.mock('$lib/server/core/useCases/dutyRosterTemplates', () => ({
	findDutyRosterTemplateBySlug: findDutyRosterTemplateBySlugMock,
	listDutyRosterTemplates: listDutyRosterTemplatesMock
}));

vi.mock('$features/duty-roster/templates/dutyRosterTemplates', () => ({
	isDutyRosterTemplateView: isDutyRosterTemplateViewMock
}));

import { load } from './+page.server';

describe('Duty Roster Template view route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		isDutyRosterTemplateViewMock.mockReturnValue(true);
		loadWithContextMock.mockImplementation(async (_locals, _cookies, _orgId, config) => config.fn(mockCtx));
		listDutyRosterTemplatesMock.mockResolvedValue([
			{ id: 'template-1', name: 'CQ NCO', slug: 'cq-nco', shortCode: 'CQ', status: 'active' }
		]);
		findDutyRosterTemplateBySlugMock.mockResolvedValue({
			id: 'template-1',
			name: 'CQ NCO',
			slug: 'cq-nco',
			shortCode: 'CQ',
			status: 'active'
		});
	});

	it('loads direct History and Settings links through the selected template slug', async () => {
		const result = await load({
			params: { orgId: 'org-1', templateSlug: 'cq-nco', view: 'history' },
			locals: {},
			cookies: {},
			parent: async () => ({ orgName: 'Able Company' })
		} as never);

		expect(findDutyRosterTemplateBySlugMock).toHaveBeenCalledWith(mockCtx, 'cq-nco');
		expect(result).toMatchObject({
			orgId: 'org-1',
			orgName: 'Able Company',
			selectedTemplate: { id: 'template-1', slug: 'cq-nco' },
			view: 'history'
		});
	});

	it('redirects unknown view segments back to Generate', async () => {
		isDutyRosterTemplateViewMock.mockReturnValue(false);

		await expect(
			load({
				params: { orgId: 'org-1', templateSlug: 'cq-nco', view: 'unknown' },
				locals: {},
				cookies: {},
				parent: async () => ({ orgName: 'Able Company' })
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/org/org-1/duty-rosters/cq-nco/generate'
		});
	});
});
