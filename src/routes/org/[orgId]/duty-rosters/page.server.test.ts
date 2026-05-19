import { describe, expect, it, vi, beforeEach } from 'vitest';

const {
	loadWithContextMock,
	archiveDutyRosterTemplateMock,
	createDutyRosterTemplateMock,
	listDutyRosterTemplatesMock,
	loadDutyRosterTemplateSetupOptionsMock,
	mockCtx
} = vi.hoisted(() => ({
	loadWithContextMock: vi.fn(),
	archiveDutyRosterTemplateMock: vi.fn(),
	createDutyRosterTemplateMock: vi.fn(),
	listDutyRosterTemplatesMock: vi.fn(),
	loadDutyRosterTemplateSetupOptionsMock: vi.fn(),
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
	archiveDutyRosterTemplate: archiveDutyRosterTemplateMock,
	createDutyRosterTemplate: createDutyRosterTemplateMock,
	listDutyRosterTemplates: listDutyRosterTemplatesMock,
	loadDutyRosterTemplateSetupOptions: loadDutyRosterTemplateSetupOptionsMock
}));

import { actions, load } from './+page.server';

describe('Duty Roster Templates route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		loadWithContextMock.mockImplementation(async (_locals, _cookies, _orgId, config) => config.fn(mockCtx));
		listDutyRosterTemplatesMock.mockResolvedValue([template()]);
		loadDutyRosterTemplateSetupOptionsMock.mockResolvedValue({ personnel: [] });
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
			expect.objectContaining({ permission: 'calendar', fn: expect.any(Function) })
		);
		expect(listDutyRosterTemplatesMock).toHaveBeenCalledWith(mockCtx);
		expect(loadDutyRosterTemplateSetupOptionsMock).toHaveBeenCalledWith(mockCtx);
		expect(result).toEqual({
			orgId: 'org-1',
			orgName: 'Able Company',
			templates: [template()],
			setupOptions: { personnel: [] },
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

	it('archives a template from the register and redirects back to the register', async () => {
		const request = new Request('http://localhost', {
			method: 'POST',
			body: new URLSearchParams({ templateId: 'template-1', archiveAssignmentType: 'true' })
		});

		await expect(
			actions.archiveTemplate({
				request,
				params: { orgId: 'org-1' }
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/org/org-1/duty-rosters'
		});

		expect(archiveDutyRosterTemplateMock).toHaveBeenCalledWith(mockCtx, {
			templateId: 'template-1',
			archiveAssignmentType: true
		});
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
