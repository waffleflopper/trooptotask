import { describe, expect, it, vi, beforeEach } from 'vitest';

const {
	loadWithContextMock,
	loadDutyRosterTemplateSettingsMock,
	findDutyRosterTemplateBySlugMock,
	listDutyRosterTemplatesMock,
	updateDutyRosterTemplateSettingsMock,
	isDutyRosterTemplateViewMock,
	mockCtx
} = vi.hoisted(() => ({
	loadWithContextMock: vi.fn(),
	loadDutyRosterTemplateSettingsMock: vi.fn(),
	findDutyRosterTemplateBySlugMock: vi.fn(),
	listDutyRosterTemplatesMock: vi.fn(),
	updateDutyRosterTemplateSettingsMock: vi.fn(),
	isDutyRosterTemplateViewMock: vi.fn(),
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
	findDutyRosterTemplateBySlug: findDutyRosterTemplateBySlugMock,
	listDutyRosterTemplates: listDutyRosterTemplatesMock,
	loadDutyRosterTemplateSettings: loadDutyRosterTemplateSettingsMock,
	updateDutyRosterTemplateSettings: updateDutyRosterTemplateSettingsMock
}));

vi.mock('$features/duty-roster/templates/dutyRosterTemplates', () => ({
	isDutyRosterTemplateView: isDutyRosterTemplateViewMock
}));

import { actions, load } from './+page.server';

describe('Duty Roster Template view route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		isDutyRosterTemplateViewMock.mockReturnValue(true);
		loadWithContextMock.mockImplementation(async (_locals, _cookies, _orgId, config) => config.fn(mockCtx));
		listDutyRosterTemplatesMock.mockResolvedValue([
			template({ id: 'template-1', name: 'CQ NCO', slug: 'cq-nco', shortCode: 'CQ', status: 'active' })
		]);
		findDutyRosterTemplateBySlugMock.mockResolvedValue(
			template({ id: 'template-1', name: 'CQ NCO', slug: 'cq-nco', shortCode: 'CQ', status: 'active' })
		);
		loadDutyRosterTemplateSettingsMock.mockResolvedValue({ personnel: [], resolvedPool: [], baselineRows: [] });
		updateDutyRosterTemplateSettingsMock.mockResolvedValue(template({ id: 'template-1', slug: 'cq-nco' }));
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

	it('loads Settings through the selected template and settings service', async () => {
		const settings = {
			personnel: [{ id: 'p1', rank: 'SGT', lastName: 'Able', firstName: 'Alpha' }],
			resolvedPool: [{ id: 'p1', rank: 'SGT', lastName: 'Able', firstName: 'Alpha' }],
			baselineRows: []
		};
		loadDutyRosterTemplateSettingsMock.mockResolvedValue(settings);

		const result = await load({
			params: { orgId: 'org-1', templateSlug: 'cq-nco', view: 'settings' },
			locals: {},
			cookies: {},
			parent: async () => ({ orgName: 'Able Company' })
		} as never);

		expect(loadDutyRosterTemplateSettingsMock).toHaveBeenCalledWith(
			mockCtx,
			expect.objectContaining({ id: 'template-1' })
		);
		expect(result).toMatchObject({
			orgId: 'org-1',
			selectedTemplate: { id: 'template-1', slug: 'cq-nco' },
			settings,
			view: 'settings'
		});
	});

	it('updates Settings through the service layer and redirects back to Settings', async () => {
		const form = new URLSearchParams();
		form.set('templateId', 'template-1');
		form.append('rankValues', 'SGT');
		form.append('rankValues', 'CPL');
		form.append('groupIds', 'group-1');
		form.append('mosValues', '11B');
		form.append('dutyRoleValues', 'Runner');
		form.append('exemptPersonnelIds', 'person-2');
		form.set('baseline:person-1', '4');
		form.set('baseline:person-2', '');

		const request = new Request('http://localhost', {
			method: 'POST',
			body: form
		});

		await expect(
			actions.updateSettings({
				request,
				params: { orgId: 'org-1', templateSlug: 'cq-nco' }
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/org/org-1/duty-rosters/cq-nco/settings'
		});

		expect(updateDutyRosterTemplateSettingsMock).toHaveBeenCalledWith(mockCtx, {
			templateId: 'template-1',
			poolCriteria: {
				rankValues: ['SGT', 'CPL'],
				groupIds: ['group-1'],
				mosValues: ['11B'],
				dutyRoleValues: ['Runner']
			},
			exemptPersonnelIds: ['person-2'],
			manualBaselineCounts: {
				'person-1': 4,
				'person-2': null
			}
		});
	});

	it('returns Settings-specific validation messages from the update action', async () => {
		const error = Object.assign(new Error('Duty exemptions must come from the resolved pool.'), { status: 400 });
		updateDutyRosterTemplateSettingsMock.mockRejectedValue(error);

		const request = new Request('http://localhost', {
			method: 'POST',
			body: new URLSearchParams({ templateId: 'template-1', exemptPersonnelIds: 'missing-person' })
		});

		const result = await actions.updateSettings({
			request,
			params: { orgId: 'org-1', templateSlug: 'cq-nco' }
		} as never);

		expect(result).toMatchObject({
			status: 400,
			data: {
				settingsError: 'Duty exemptions must come from the resolved pool.'
			}
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

function template(overrides: Record<string, unknown> = {}) {
	return {
		id: 'template-1',
		name: 'CQ NCO',
		slug: 'cq-nco',
		shortCode: 'CQ',
		status: 'active',
		poolCriteria: {
			rankValues: [],
			groupIds: [],
			mosValues: [],
			dutyRoleValues: []
		},
		exemptPersonnelIds: [],
		manualBaselineCounts: {},
		createdAt: '2026-05-04T00:00:00.000Z',
		updatedAt: '2026-05-04T00:00:00.000Z',
		...overrides
	};
}
