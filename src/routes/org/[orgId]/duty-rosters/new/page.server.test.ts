import { describe, expect, it, vi, beforeEach } from 'vitest';

const {
	createDutyRosterTemplateMock,
	listDutyRosterTemplatesMock,
	loadDutyRosterTemplateSetupOptionsMock,
	loadWithContextMock,
	mockCtx,
	updateDutyRosterTemplateSettingsMock
} = vi.hoisted(() => ({
	createDutyRosterTemplateMock: vi.fn(),
	listDutyRosterTemplatesMock: vi.fn(),
	loadDutyRosterTemplateSetupOptionsMock: vi.fn(),
	loadWithContextMock: vi.fn(),
	mockCtx: {
		auth: {
			orgId: 'org-1'
		}
	},
	updateDutyRosterTemplateSettingsMock: vi.fn()
}));

vi.mock('$lib/server/adapters/httpAdapter', () => ({
	buildRouteContext: vi.fn(async () => mockCtx),
	loadWithContext: loadWithContextMock
}));

vi.mock('$lib/server/core/useCases/dutyRosterTemplates', () => ({
	createDutyRosterTemplate: createDutyRosterTemplateMock,
	listDutyRosterTemplates: listDutyRosterTemplatesMock,
	loadDutyRosterTemplateSetupOptions: loadDutyRosterTemplateSetupOptionsMock,
	updateDutyRosterTemplateSettings: updateDutyRosterTemplateSettingsMock
}));

import { actions, load } from './+page.server';

describe('New Duty Roster Template route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		loadWithContextMock.mockImplementation(async (_locals, _cookies, _orgId, config) => config.fn(mockCtx));
		listDutyRosterTemplatesMock.mockResolvedValue([template()]);
		loadDutyRosterTemplateSetupOptionsMock.mockResolvedValue({ personnel: [] });
		createDutyRosterTemplateMock.mockResolvedValue(template());
		updateDutyRosterTemplateSettingsMock.mockResolvedValue(template({ slug: 'cq-nco' }));
	});

	it('loads URL-addressable wizard setup without selecting an operational template', async () => {
		const result = await load({
			params: { orgId: 'org-1' },
			locals: {},
			cookies: {},
			parent: async () => ({ orgName: 'Able Company' })
		} as never);

		expect(result).toMatchObject({
			orgId: 'org-1',
			orgName: 'Able Company',
			selectedTemplate: null,
			setupOptions: { personnel: [] },
			view: 'new'
		});
	});

	it('creates the template only on final save and redirects to Generate', async () => {
		const form = new URLSearchParams();
		form.set('name', 'CQ NCO');
		form.set('slug', 'cq-nco');
		form.set('shortCode', 'CQ');
		form.append('rankValues', 'SGT');
		form.append('groupIds', 'alpha');
		form.append('exemptPersonnelIds', 'person-2');
		form.set('baseline:person-1', '3');

		const request = new Request('http://localhost', {
			method: 'POST',
			body: form
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

		expect(createDutyRosterTemplateMock).toHaveBeenCalledWith(mockCtx, { name: 'CQ NCO', shortCode: 'CQ' });
		expect(updateDutyRosterTemplateSettingsMock).toHaveBeenCalledWith(mockCtx, {
			templateId: 'template-1',
			name: 'CQ NCO',
			slug: 'cq-nco',
			shortCode: 'CQ',
			poolCriteria: {
				rankValues: ['SGT'],
				groupIds: ['alpha'],
				mosValues: [],
				dutyRoleValues: []
			},
			exemptPersonnelIds: ['person-2'],
			manualBaselineCounts: {
				'person-1': 3
			}
		});
	});
});

function template(input: Partial<{ id: string; slug: string }> = {}) {
	return {
		id: input.id ?? 'template-1',
		assignmentTypeId: input.id ?? 'template-1',
		name: 'CQ NCO',
		slug: input.slug ?? 'cq-nco',
		shortCode: 'CQ',
		status: 'active'
	};
}
