import { describe, expect, it, vi, beforeEach } from 'vitest';

const {
	acceptDutyRosterTemplatePreviewMock,
	acceptAndApplyDutyRosterTemplatePreviewMock,
	applyAcceptedDutyRosterTemplateRunMock,
	applyDutyRosterTemplatePreviewManualSelectionMock,
	invalidateLatestDutyRosterTemplateRunMock,
	loadWithContextMock,
	loadDutyRosterTemplateSettingsMock,
	findDutyRosterTemplateBySlugMock,
	generateDutyRosterTemplatePreviewMock,
	listAcceptedDutyRosterTemplateRunsMock,
	listDutyRosterTemplatesMock,
	updateDutyRosterTemplateSettingsMock,
	isDutyRosterTemplateViewMock,
	mockCtx
} = vi.hoisted(() => ({
	acceptDutyRosterTemplatePreviewMock: vi.fn(),
	acceptAndApplyDutyRosterTemplatePreviewMock: vi.fn(),
	applyAcceptedDutyRosterTemplateRunMock: vi.fn(),
	applyDutyRosterTemplatePreviewManualSelectionMock: vi.fn(),
	invalidateLatestDutyRosterTemplateRunMock: vi.fn(),
	loadWithContextMock: vi.fn(),
	loadDutyRosterTemplateSettingsMock: vi.fn(),
	findDutyRosterTemplateBySlugMock: vi.fn(),
	generateDutyRosterTemplatePreviewMock: vi.fn(),
	listAcceptedDutyRosterTemplateRunsMock: vi.fn(),
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
	acceptDutyRosterTemplatePreview: acceptDutyRosterTemplatePreviewMock,
	acceptAndApplyDutyRosterTemplatePreview: acceptAndApplyDutyRosterTemplatePreviewMock,
	applyAcceptedDutyRosterTemplateRun: applyAcceptedDutyRosterTemplateRunMock,
	applyDutyRosterTemplatePreviewManualSelection: applyDutyRosterTemplatePreviewManualSelectionMock,
	findDutyRosterTemplateBySlug: findDutyRosterTemplateBySlugMock,
	generateDutyRosterTemplatePreview: generateDutyRosterTemplatePreviewMock,
	invalidateLatestDutyRosterTemplateRun: invalidateLatestDutyRosterTemplateRunMock,
	listAcceptedDutyRosterTemplateRuns: listAcceptedDutyRosterTemplateRunsMock,
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
		generateDutyRosterTemplatePreviewMock.mockResolvedValue(preview());
		applyDutyRosterTemplatePreviewManualSelectionMock.mockResolvedValue(preview({ manual: true }));
		acceptDutyRosterTemplatePreviewMock.mockResolvedValue(acceptedRun());
		acceptAndApplyDutyRosterTemplatePreviewMock.mockResolvedValue({ acceptedRun: acceptedRun(), insertedCount: 1 });
		applyAcceptedDutyRosterTemplateRunMock.mockResolvedValue({
			acceptedRun: acceptedRun({ applied: true }),
			insertedCount: 1
		});
		invalidateLatestDutyRosterTemplateRunMock.mockResolvedValue({
			invalidatedRun: acceptedRun({ invalidated: true }),
			removedCalendarAssignments: 1,
			calendarAssignmentsEdited: false
		});
		listAcceptedDutyRosterTemplateRunsMock.mockResolvedValue([]);
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

	it('loads History through the accepted runs service', async () => {
		listAcceptedDutyRosterTemplateRunsMock.mockResolvedValue([acceptedRun()]);

		const result = await load({
			params: { orgId: 'org-1', templateSlug: 'cq-nco', view: 'history' },
			locals: {},
			cookies: {},
			parent: async () => ({ orgName: 'Able Company' })
		} as never);

		expect(listAcceptedDutyRosterTemplateRunsMock).toHaveBeenCalledWith(mockCtx, 'template-1');
		expect(result).toMatchObject({
			acceptedRuns: [{ id: 'run-1', templateName: 'CQ NCO' }]
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

	it('generates a preview through the service layer without redirecting', async () => {
		const request = new Request('http://localhost', {
			method: 'POST',
			body: new URLSearchParams({
				templateId: 'template-1',
				startDate: '2026-06-01',
				endDate: '2026-06-03'
			})
		});

		const result = await actions.generatePreview({
			request,
			params: { orgId: 'org-1', templateSlug: 'cq-nco' }
		} as never);

		expect(generateDutyRosterTemplatePreviewMock).toHaveBeenCalledWith(mockCtx, {
			templateId: 'template-1',
			startDate: '2026-06-01',
			endDate: '2026-06-03'
		});
		expect(result).toMatchObject({
			generateValues: {
				startDate: '2026-06-01',
				endDate: '2026-06-03'
			},
			preview: {
				rosterRows: [{ date: '2026-06-01', assigneeId: 'person-1' }]
			}
		});
	});

	it('returns Generate-specific validation messages from the preview action', async () => {
		const error = Object.assign(new Error('End date must be on or after the start date'), { status: 400 });
		generateDutyRosterTemplatePreviewMock.mockRejectedValue(error);

		const request = new Request('http://localhost', {
			method: 'POST',
			body: new URLSearchParams({
				templateId: 'template-1',
				startDate: '2026-06-03',
				endDate: '2026-06-01'
			})
		});

		const result = await actions.generatePreview({
			request,
			params: { orgId: 'org-1', templateSlug: 'cq-nco' }
		} as never);

		expect(result).toMatchObject({
			status: 400,
			data: {
				generateError: 'End date must be on or after the start date',
				generateValues: {
					startDate: '2026-06-03',
					endDate: '2026-06-01'
				}
			}
		});
	});

	it('applies manual preview selections without redirecting', async () => {
		const currentPreview = preview();
		const request = new Request('http://localhost', {
			method: 'POST',
			body: new URLSearchParams({
				preview: JSON.stringify(currentPreview),
				date: '2026-06-01',
				assigneeId: 'person-2',
				reason: '',
				startDate: '2026-06-01',
				endDate: '2026-06-01'
			})
		});

		const result = await actions.manualPreviewSelection({
			request,
			params: { orgId: 'org-1', templateSlug: 'cq-nco' }
		} as never);

		expect(applyDutyRosterTemplatePreviewManualSelectionMock).toHaveBeenCalledWith(mockCtx, {
			preview: JSON.stringify(currentPreview),
			date: '2026-06-01',
			assigneeId: 'person-2',
			reason: ''
		});
		expect(result).toMatchObject({
			generateValues: {
				startDate: '2026-06-01',
				endDate: '2026-06-01'
			},
			preview: {
				manualSelections: [{ date: '2026-06-01', assigneeId: 'person-2' }]
			}
		});
	});

	it('accepts a preview through the service layer and redirects to History', async () => {
		const currentPreview = preview();
		const request = new Request('http://localhost', {
			method: 'POST',
			body: new URLSearchParams({
				preview: JSON.stringify(currentPreview)
			})
		});

		await expect(
			actions.acceptPreview({
				request,
				params: { orgId: 'org-1', templateSlug: 'cq-nco' }
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/org/org-1/duty-rosters/cq-nco/history'
		});

		expect(acceptDutyRosterTemplatePreviewMock).toHaveBeenCalledWith(mockCtx, {
			preview: JSON.stringify(currentPreview)
		});
	});

	it('accepts a preview for print without redirecting before the browser opens official output', async () => {
		const currentPreview = preview();
		const request = new Request('http://localhost', {
			method: 'POST',
			body: new URLSearchParams({
				preview: JSON.stringify(currentPreview),
				intent: 'print'
			})
		});

		const result = await actions.acceptPreview({
			request,
			params: { orgId: 'org-1', templateSlug: 'cq-nco' }
		} as never);

		expect(acceptDutyRosterTemplatePreviewMock).toHaveBeenCalledWith(mockCtx, {
			preview: JSON.stringify(currentPreview)
		});
		expect(result).toMatchObject({
			acceptedRun: { id: 'run-1', templateName: 'CQ NCO' },
			printAcceptedRun: true
		});
	});

	it('accepts and applies a preview to Calendar before redirecting to History', async () => {
		const currentPreview = preview();
		const request = new Request('http://localhost', {
			method: 'POST',
			body: new URLSearchParams({
				preview: JSON.stringify(currentPreview)
			})
		});

		await expect(
			actions.applyPreview({
				request,
				params: { orgId: 'org-1', templateSlug: 'cq-nco' }
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/org/org-1/duty-rosters/cq-nco/history'
		});

		expect(acceptAndApplyDutyRosterTemplatePreviewMock).toHaveBeenCalledWith(mockCtx, {
			preview: JSON.stringify(currentPreview)
		});
	});

	it('applies an accepted run to Calendar from History', async () => {
		const request = new Request('http://localhost', {
			method: 'POST',
			body: new URLSearchParams({
				runId: 'run-1'
			})
		});

		await expect(
			actions.applyAcceptedRun({
				request,
				params: { orgId: 'org-1', templateSlug: 'cq-nco' }
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/org/org-1/duty-rosters/cq-nco/history'
		});

		expect(applyAcceptedDutyRosterTemplateRunMock).toHaveBeenCalledWith(mockCtx, {
			runId: 'run-1'
		});
	});

	it('invalidates an accepted run from History', async () => {
		const request = new Request('http://localhost', {
			method: 'POST',
			body: new URLSearchParams({
				runId: 'run-1'
			})
		});

		await expect(
			actions.invalidateAcceptedRun({
				request,
				params: { orgId: 'org-1', templateSlug: 'cq-nco' }
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/org/org-1/duty-rosters/cq-nco/history'
		});

		expect(invalidateLatestDutyRosterTemplateRunMock).toHaveBeenCalledWith(mockCtx, {
			runId: 'run-1'
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
		assignmentTypeId: 'template-1',
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

function preview(options: { manual?: boolean } = {}) {
	const manualSelections = options.manual
		? [
				{
					date: '2026-06-01',
					originalAssigneeId: 'person-1',
					assigneeId: 'person-2',
					reason: null,
					warnings: []
				}
			]
		: [];

	return {
		generatedAt: '2026-05-04T00:00:00.000Z',
		assignmentType: { id: 'template-1', name: 'CQ NCO', shortName: 'CQ', color: '#8a5a22' },
		config: {
			startDate: '2026-06-01',
			endDate: '2026-06-01',
			dutyDuration: 'daily',
			excludedStatusIds: [],
			excludeWeekends: false,
			excludeHolidays: false,
			excludeOrgClosures: false,
			exemptPersonnelIds: [],
			numberingMode: 'single-sequence',
			misconductUnavailablePersonnelDates: {}
		},
		personnel: [
			{ id: 'person-1', rank: 'SGT', lastName: 'Able', firstName: 'Ann', groupId: 'alpha', groupName: 'Alpha' }
		],
		selectionPersonnel: [
			{
				id: 'person-1',
				rank: 'SGT',
				lastName: 'Able',
				firstName: 'Ann',
				groupId: 'alpha',
				groupName: 'Alpha',
				archivedAt: null
			},
			{
				id: 'person-2',
				rank: 'SGT',
				lastName: 'Baker',
				firstName: 'Ben',
				groupId: 'alpha',
				groupName: 'Alpha',
				archivedAt: null
			}
		],
		manualSelections,
		rosterRows: [{ date: '2026-06-01', assigneeId: 'person-1' }],
		da6: {
			numberingMode: 'single-sequence',
			columns: [
				{
					date: '2026-06-01',
					sequenceKind: 'weekday',
					sequenceKey: 'single',
					specialDayIds: [],
					chargeSequenceStart: 1,
					chargeableCount: 1
				}
			],
			rows: [
				{
					personnelId: 'person-1',
					display: {
						id: 'person-1',
						rank: 'SGT',
						lastName: 'Able',
						firstName: 'Ann',
						groupId: 'alpha',
						groupName: 'Alpha'
					},
					cells: [
						{
							date: '2026-06-01',
							personnelId: 'person-1',
							code: 'assigned',
							da6Code: null,
							chargeable: true,
							queuePosition: 1,
							sequenceNumber: 1,
							assigned: true,
							reason: null,
							reasonCode: null
						}
					]
				}
			]
		},
		exportModel: {},
		warnings: []
	};
}

function acceptedRun(options: { applied?: boolean; invalidated?: boolean } = {}) {
	return {
		id: 'run-1',
		templateId: 'template-1',
		templateName: 'CQ NCO',
		status: options.invalidated ? 'invalidated' : 'accepted',
		startDate: '2026-06-01',
		endDate: '2026-06-01',
		acceptedAt: '2026-06-01T00:00:00.000Z',
		acceptedByUserId: 'user-1',
		appliedAt: options.applied ? '2026-06-01T00:10:00.000Z' : null,
		appliedByUserId: options.applied ? 'user-1' : null,
		invalidatedAt: options.invalidated ? '2026-06-01T00:20:00.000Z' : null,
		invalidatedByUserId: options.invalidated ? 'user-1' : null,
		linkedCalendarAssignmentCount: options.applied ? 1 : 0,
		calendarAssignmentsEdited: false,
		snapshotPayload: {
			snapshotVersion: 1,
			template: { id: 'template-1', name: 'CQ NCO', shortCode: 'CQ' },
			generatedAt: '2026-05-04T00:00:00.000Z',
			acceptedAt: '2026-06-01T00:00:00.000Z',
			acceptedByUserId: 'user-1',
			config: {
				startDate: '2026-06-01',
				endDate: '2026-06-01',
				dutyDuration: 'daily',
				excludedStatusIds: [],
				excludeWeekends: false,
				excludeHolidays: false,
				excludeOrgClosures: false,
				exemptPersonnelIds: [],
				numberingMode: 'single-sequence',
				misconductUnavailablePersonnelDates: {}
			},
			resolvedPool: [],
			selectionPersonnel: [],
			generatedRows: [],
			finalRows: [],
			manualSelections: [],
			da6: { numberingMode: 'single-sequence', columns: [], rows: [] },
			exportModel: {},
			warnings: []
		},
		createdAt: '2026-06-01T00:00:00.000Z'
	};
}
