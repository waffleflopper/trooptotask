import { describe, expect, it, vi, beforeEach } from 'vitest';

const { loadWithContextMock, createDutyRosterTemplateMock, listDutyRosterTemplatesMock, mockCtx } = vi.hoisted(() => ({
	loadWithContextMock: vi.fn(),
	createDutyRosterTemplateMock: vi.fn(),
	listDutyRosterTemplatesMock: vi.fn(),
	mockCtx: {
		auth: {
			orgId: 'org-1'
		}
	}
}));

vi.mock('$lib/server/adapters/httpAdapter', () => ({
	buildRouteContext: vi.fn(async () => mockCtx),
	loadWithContext: loadWithContextMock
}));

vi.mock('$lib/server/core/useCases/dutyRosterTemplates', () => ({
	createDutyRosterTemplate: createDutyRosterTemplateMock,
	listDutyRosterTemplates: listDutyRosterTemplatesMock
}));

import { actions, load } from './+page.server';

describe('Duty Roster Templates route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		loadWithContextMock.mockImplementation(async (_locals, _cookies, _orgId, config) => config.fn(mockCtx));
		listDutyRosterTemplatesMock.mockResolvedValue([template()]);
		createDutyRosterTemplateMock.mockResolvedValue({ slug: 'cq-nco' });
	});

	it('loads the template-first workspace through the Calendar boundary', async () => {
		const result = await load({
			params: { orgId: 'org-1' },
			locals: {},
			cookies: {},
			parent: async () => ({ orgName: 'Able Company' })
		} as never);

		expect(loadWithContextMock).toHaveBeenCalledWith(
			{},
			{},
			'org-1',
			expect.objectContaining({ permission: 'calendar', fn: listDutyRosterTemplatesMock })
		);
		expect(result).toEqual({
			orgId: 'org-1',
			orgName: 'Able Company',
			templates: [template()],
			selectedTemplate: null,
			view: 'generate'
		});
	});

	it('creates a template through the service layer and redirects to Generate', async () => {
		const request = new Request('http://localhost', {
			method: 'POST',
			body: new URLSearchParams({ name: 'CQ NCO', shortCode: 'cq' })
		});

		await expect(
			actions.createTemplate({
				request,
				params: { orgId: 'org-1' }
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/org/org-1/duty-rosters/cq-nco/generate'
		});

		expect(createDutyRosterTemplateMock).toHaveBeenCalledWith(mockCtx, { name: 'CQ NCO', shortCode: 'cq' });
	});
});

function template() {
	return {
		id: 'template-1',
		assignmentTypeId: 'template-1',
		name: 'CQ NCO',
		slug: 'cq-nco',
		shortCode: 'CQ',
		status: 'active'
	};
}
