// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DutyRosterTemplateWorkspace from './DutyRosterTemplateWorkspace.svelte';
import type { DutyRosterTemplate } from '$features/duty-roster/templates/dutyRosterTemplates';
import type { DutyRosterTemplatePreview } from '$features/duty-roster/templates/dutyRosterTemplatePreview';

const template: DutyRosterTemplate = {
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
	createdAt: '2026-05-04T00:00:00Z',
	updatedAt: '2026-05-04T00:00:00Z'
};

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('DutyRosterTemplateWorkspace', () => {
	it('renders a useful template register empty state and New Template link', () => {
		render(DutyRosterTemplateWorkspace, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Able Company',
					templates: [],
					selectedTemplate: null,
					view: 'generate'
				}
			}
		});

		expect(screen.getAllByRole('heading', { name: 'Duty Rosters' }).length).toBeGreaterThan(0);
		expect(screen.getByText('No templates yet')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'New Template' }).getAttribute('href')).toBe('/org/org-1/duty-rosters/new');
	});

	it('renders template links and durable Generate, History, and Settings URLs', () => {
		render(DutyRosterTemplateWorkspace, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Able Company',
					templates: [template],
					selectedTemplate: template,
					view: 'history'
				}
			}
		});

		expect(screen.getByRole('heading', { name: 'CQ NCO history' })).toBeTruthy();
		expect(screen.queryByText('Duty Roster Template')).toBeNull();
		expect(screen.queryByText('CQ /cq-nco')).toBeNull();
		expect(screen.queryByRole('link', { name: 'Back to Templates' })).toBeNull();
		expect(screen.queryByRole('navigation', { name: 'Open Duty Roster Template' })).toBeNull();

		const viewTabs = screen.getByRole('navigation', { name: 'Duty Roster Template views' });
		expect(
			within(viewTabs)
				.getByRole('link', { name: /Generate/ })
				.getAttribute('href')
		).toBe('/org/org-1/duty-rosters/cq-nco/generate');
		expect(
			within(viewTabs)
				.getByRole('link', { name: /History/ })
				.getAttribute('href')
		).toBe('/org/org-1/duty-rosters/cq-nco/history');
		expect(
			within(viewTabs)
				.getByRole('link', { name: /Settings/ })
				.getAttribute('href')
		).toBe('/org/org-1/duty-rosters/cq-nco/settings');
		expect(screen.getByRole('heading', { name: 'Accepted runs' })).toBeTruthy();
	});

	it('opens the shadcn archive confirmation from the register quick actions', async () => {
		render(DutyRosterTemplateWorkspace, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Able Company',
					templates: [template],
					selectedTemplate: null,
					view: 'generate',
					setupOptions: { personnel: [] }
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Archive CQ NCO' }));

		expect(screen.getByRole('alertdialog')).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'Archive template' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Archive Template' })).toBeTruthy();
		expect(document.querySelector('form[action="/org/org-1/duty-rosters?/archiveTemplate"]')).toBeTruthy();
		expect(document.querySelector('input[name="templateId"][value="template-1"]')).toBeTruthy();
	});

	it('shows New Template wizard validation errors without dropping entered values', () => {
		render(DutyRosterTemplateWorkspace, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Able Company',
					templates: [],
					selectedTemplate: null,
					view: 'new',
					setupOptions: { personnel: [] }
				},
				form: {
					settingsError: 'Name is required',
					values: { name: ' ', slug: 'cq-nco', shortCode: 'CQ' }
				}
			}
		});

		expect(screen.getByRole('alert').textContent).toContain('Name is required');
		expect(screen.getByLabelText<HTMLInputElement>('Route slug').value).toBe('cq-nco');
		expect(screen.getByLabelText<HTMLInputElement>('Short code').value).toBe('CQ');
	});

	it('submits New Template wizard values from the review step', async () => {
		const submitted: Record<string, FormDataEntryValue | null> = {};
		render(DutyRosterTemplateWorkspace, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Able Company',
					templates: [],
					selectedTemplate: null,
					view: 'new',
					setupOptions: {
						personnel: [
							{
								id: 'person-1',
								rank: 'SGT',
								lastName: 'Able',
								firstName: 'Ann',
								mos: '11B',
								dutyRole: 'Rifleman',
								groupId: 'alpha',
								groupName: 'Alpha'
							}
						]
					}
				}
			}
		});

		const form = document.querySelector<HTMLFormElement>('form.new-template-form');
		expect(form).toBeTruthy();
		form?.addEventListener('submit', (event) => {
			event.preventDefault();
			const formData = new FormData(form);
			submitted.name = formData.get('name');
			submitted.slug = formData.get('slug');
			submitted.shortCode = formData.get('shortCode');
			submitted.baseline = formData.get('baseline:person-1');
		});

		await fireEvent.input(screen.getByLabelText<HTMLInputElement>('Template name'), { target: { value: 'CQ NCO' } });
		await fireEvent.input(screen.getByLabelText<HTMLInputElement>('Route slug'), { target: { value: 'cq-nco' } });
		await fireEvent.input(screen.getByLabelText<HTMLInputElement>('Short code'), { target: { value: 'CQ' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
		await fireEvent.input(screen.getByLabelText<HTMLInputElement>('Starting count for SGT Able, Ann'), {
			target: { value: '4' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Save Template' }));

		expect(submitted.name).toBe('CQ NCO');
		expect(submitted.slug).toBe('cq-nco');
		expect(submitted.shortCode).toBe('CQ');
		expect(submitted.baseline).toBe('4');
	});

	it('bounds New Template large-pool exemption rows while keeping search access', async () => {
		render(DutyRosterTemplateWorkspace, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Able Company',
					templates: [],
					selectedTemplate: null,
					view: 'new',
					setupOptions: {
						personnel: largePersonnel(130)
					}
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

		expect(screen.getByText('Showing 100 of 130 matching Soldiers. Search to narrow large pools.')).toBeTruthy();
		expect(screen.queryByText('SGT Large130, Test')).toBeNull();

		await fireEvent.input(screen.getByLabelText<HTMLInputElement>('Search pool'), { target: { value: 'Large130' } });

		expect(screen.getByText('SGT Large130, Test')).toBeTruthy();
		expect(screen.getByText('Showing 1 of 1 matching Soldiers. Search to narrow large pools.')).toBeTruthy();
	});

	it('filters the New Template pool with the shared shadcn combobox multi-select', async () => {
		render(DutyRosterTemplateWorkspace, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Able Company',
					templates: [],
					selectedTemplate: null,
					view: 'new',
					setupOptions: {
						personnel: [
							{
								id: 'person-1',
								rank: 'SGT',
								lastName: 'Able',
								firstName: 'Ann',
								mos: '11B',
								dutyRole: 'Rifleman',
								groupId: 'alpha',
								groupName: 'Alpha'
							},
							{
								id: 'person-2',
								rank: 'SPC',
								lastName: 'Baker',
								firstName: 'Bea',
								mos: '42A',
								dutyRole: 'Clerk',
								groupId: 'bravo',
								groupName: 'Bravo'
							}
						]
					}
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

		expect(screen.getByText('Able, Ann')).toBeTruthy();
		expect(screen.getByText('Baker, Bea')).toBeTruthy();

		await fireEvent.focus(screen.getByRole('combobox', { name: 'New Template rank filters' }));
		await fireEvent.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'SGT' }));

		expect(screen.getByRole('button', { name: 'Remove SGT' })).toBeTruthy();
		expect(screen.getByText('Able, Ann')).toBeTruthy();
		expect(screen.queryByText('Baker, Bea')).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Remove SGT' }));

		await fireEvent.focus(screen.getByRole('combobox', { name: 'New Template Duty Role filters' }));
		await fireEvent.input(screen.getByRole('combobox', { name: 'New Template Duty Role filters' }), {
			target: { value: 'No match' }
		});

		expect(await screen.findByText('No duty role matches.')).toBeTruthy();
	});

	it('renders generated preview list and DA6 matrix without official actions', async () => {
		render(DutyRosterTemplateWorkspace, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Able Company',
					templates: [template],
					selectedTemplate: template,
					view: 'generate',
					countReadModel: countReadModel({ source: 'manual-da6-baseline' })
				},
				form: {
					preview: preview(),
					generateValues: {
						startDate: '2026-06-01',
						endDate: '2026-06-01'
					}
				}
			}
		});

		const list = screen.getByRole('table', { name: 'Generated Duty Roster preview' });
		expect(list).toBeTruthy();
		expect(screen.getAllByText('01-JUN to 01-JUN').length).toBeGreaterThan(0);
		expect(screen.getByText(/Accept Run writes official DA6 history/)).toBeTruthy();
		expect(within(list).getAllByText('SGT Able, Ann').length).toBeGreaterThan(0);
		await fireEvent.click(
			within(screen.getByRole('tablist', { name: 'Preview review mode' })).getByRole('tab', { name: 'DA6 Matrix' })
		);
		const matrix = screen.getByRole('table', { name: 'DA6 preview matrix' });
		expect(matrix).toBeTruthy();
		expect(within(matrix).getByText('X')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Print DA6 draft' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Print Draft' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Export Draft' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Accept + Apply to Calendar' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Accept Run' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Accept Run + Print' })).toBeTruthy();
	});

	it('renders manual preview selections with warnings while keeping MANUAL out of the DA6 matrix', async () => {
		render(DutyRosterTemplateWorkspace, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Able Company',
					templates: [template],
					selectedTemplate: template,
					view: 'generate'
				},
				form: {
					preview: preview({ manual: true }),
					generateValues: {
						startDate: '2026-06-01',
						endDate: '2026-06-01'
					}
				}
			}
		});

		const list = screen.getByRole('table', { name: 'Generated Duty Roster preview' });
		expect(within(list).getAllByText('Review').length).toBeGreaterThan(0);
		expect(within(list).getByText(/Generated SGT\s+Able, Ann/)).toBeTruthy();
		expect(within(list).getByText('Selected Soldier is outside this template pool.')).toBeTruthy();
		expect(within(list).queryByText('Commander approved outside-pool replacement.')).toBeNull();

		await fireEvent.click(
			within(list).getByRole('button', { name: 'Review warning and change assignment for MON JUN 01, 2026' })
		);
		expect(screen.getAllByText('Selected Soldier is outside this template pool.').length).toBeGreaterThan(1);
		expect(screen.getByText('Commander approved outside-pool replacement.')).toBeTruthy();

		await fireEvent.click(
			within(screen.getByRole('tablist', { name: 'Preview review mode' })).getByRole('tab', { name: 'DA6 Matrix' })
		);
		const matrix = screen.getByRole('table', { name: 'DA6 preview matrix' });
		expect(within(matrix).queryByText('MANUAL')).toBeNull();
	});

	it('renders manual preview errors without dropping the preview', () => {
		render(DutyRosterTemplateWorkspace, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Able Company',
					templates: [template],
					selectedTemplate: template,
					view: 'generate'
				},
				form: {
					manualError: 'A reason is required for this manual selection.',
					preview: preview(),
					generateValues: {
						startDate: '2026-06-01',
						endDate: '2026-06-01'
					}
				}
			}
		});

		expect(screen.getByRole('alert').textContent).toContain('A reason is required for this manual selection.');
		expect(screen.getByRole('table', { name: 'Generated Duty Roster preview' })).toBeTruthy();
	});

	it('renders accepted History as an official record ledger', () => {
		render(DutyRosterTemplateWorkspace, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Able Company',
					templates: [template],
					selectedTemplate: template,
					view: 'history',
					acceptedRuns: [acceptedRun()],
					countReadModel: countReadModel({ source: 'accepted-history', corrected: true })
				}
			}
		});

		expect(screen.getByText('Official')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'History' })).toBeTruthy();
		const recordLink = screen.getByRole('link', { name: /JUN 01, 2026 to JUN 01, 2026/ });
		expect(recordLink.getAttribute('href')).toBe('/org/org-1/duty-rosters/cq-nco/history/run-1');
		expect(screen.getByText('Not applied')).toBeTruthy();
		expect(screen.getByRole('link', { name: /JUN 01, 2026 to JUN 01, 2026/ })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Apply to Calendar' })).toBeNull();
		// Roster table is hidden in collapsed list view
		expect(screen.queryByRole('table', { name: 'Accepted Duty Roster list' })).toBeNull();
	});

	it('renders bounded History page navigation for older runs', () => {
		render(DutyRosterTemplateWorkspace, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Able Company',
					templates: [template],
					selectedTemplate: template,
					view: 'history',
					acceptedRuns: [acceptedRun()],
					historyPage: {
						page: 1,
						pageSize: 20,
						hasMore: true,
						nextPage: 2,
						previousPage: null,
						latestRunId: 'run-1'
					},
					countReadModel: countReadModel({ source: 'accepted-history', corrected: true })
				}
			}
		});

		expect(screen.getByText('Page 1. Showing 1 of 1 loaded runs.')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Older runs' }).getAttribute('href')).toBe(
			'/org/org-1/duty-rosters/cq-nco/history?page=2'
		);
		expect(screen.getByRole('button', { name: 'Newer runs' }).hasAttribute('disabled')).toBe(true);
	});

	it('renders correction history and an inline correction form for accepted rows', async () => {
		render(DutyRosterTemplateWorkspace, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Able Company',
					templates: [template],
					selectedTemplate: template,
					view: 'history',
					acceptedRuns: [acceptedRun({ corrected: true, correctionOverride: true })],
					historyDetailRunId: 'run-1',
					historyDetailMode: 'roster'
				}
			}
		});

		expect(screen.getByText('Corrected')).toBeTruthy();
		expect(screen.getByText('Actual: SGT Able, Ann')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Change Assignment' })).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Change Assignment' }));
		expect(screen.getByText(/performed duty for/)).toBeTruthy();
		expect(screen.getAllByText('Outside normal pool. Saved as an override.').length).toBeGreaterThan(0);
		const form = screen.getByRole('button', { name: 'Save' }).closest('form') as HTMLFormElement;
		expect(form.action).toContain('/org/org-1/duty-rosters/cq-nco/history?/recordCorrection');
		expect(within(form).getByRole('button', { name: 'Actual Soldier for 2026-06-01' })).toBeTruthy();
		expect(within(form).getByLabelText('Reason')).toBeTruthy();
	});

	it('renders an app-native invalidation confirmation before submitting', async () => {
		const confirm = vi.spyOn(window, 'confirm');
		render(DutyRosterTemplateWorkspace, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Able Company',
					templates: [template],
					selectedTemplate: template,
					view: 'history',
					acceptedRuns: [acceptedRun({ applied: true, calendarAssignmentsEdited: true })],
					historyDetailRunId: 'run-1',
					historyDetailMode: 'roster'
				}
			}
		});

		expect(screen.getByText(/Calendar assignments linked to this run changed after apply/)).toBeTruthy();
		const invalidateButton = screen.getByRole('button', { name: 'Invalidate run' });
		await fireEvent.click(invalidateButton);

		expect(screen.getByRole('heading', { name: 'Remove this official run from Calendar' })).toBeTruthy();
		expect(screen.getByText(/Run 2026-06-01 to 2026-06-01 will be marked invalidated/)).toBeTruthy();
		expect(screen.getByText(/This action is only available for the latest accepted run/)).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Confirm invalidation' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Keep run' })).toBeTruthy();
		expect(confirm).not.toHaveBeenCalled();
	});

	it('keeps invalidated History visible but locked from normal actions', () => {
		render(DutyRosterTemplateWorkspace, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Able Company',
					templates: [template],
					selectedTemplate: template,
					view: 'history',
					acceptedRuns: [acceptedRun({ invalidated: true, corrected: true })],
					historyDetailRunId: 'run-1',
					historyDetailMode: 'roster'
				}
			}
		});

		expect(screen.getByText('Invalidated')).toBeTruthy();
		expect(screen.getByText('Non-counting because this run is invalidated.')).toBeTruthy();
		expect(screen.getByRole('table', { name: 'Accepted Duty Roster list' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Print Roster' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Print DA6' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Apply to Calendar' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Invalidate run' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Change Assignment' })).toBeNull();
	});

	it('renders the settings ledger with pool, exemptions, baseline, and summary actions', async () => {
		render(DutyRosterTemplateWorkspace, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Able Company',
					templates: [
						{
							...template,
							poolCriteria: {
								rankValues: ['SGT'],
								groupIds: ['alpha'],
								mosValues: ['11B'],
								dutyRoleValues: ['Rifleman']
							},
							exemptPersonnelIds: ['person-1'],
							manualBaselineCounts: { 'person-2': 4 }
						}
					],
					selectedTemplate: {
						...template,
						poolCriteria: {
							rankValues: ['SGT'],
							groupIds: ['alpha'],
							mosValues: ['11B'],
							dutyRoleValues: ['Rifleman']
						},
						exemptPersonnelIds: ['person-1'],
						manualBaselineCounts: { 'person-2': 4 }
					},
					settings: {
						personnel: [
							{
								id: 'person-1',
								rank: 'SGT',
								firstName: 'Ann',
								lastName: 'Able',
								mos: '11B',
								dutyRole: 'Rifleman',
								groupId: 'alpha',
								groupName: 'Alpha'
							},
							{
								id: 'person-2',
								rank: 'CPL',
								firstName: 'Ben',
								lastName: 'Baker',
								mos: '11B',
								dutyRole: 'Rifleman',
								groupId: 'alpha',
								groupName: 'Alpha'
							}
						],
						resolvedPool: [
							{
								id: 'person-1',
								rank: 'SGT',
								firstName: 'Ann',
								lastName: 'Able',
								mos: '11B',
								dutyRole: 'Rifleman',
								groupId: 'alpha',
								groupName: 'Alpha'
							},
							{
								id: 'person-2',
								rank: 'CPL',
								firstName: 'Ben',
								lastName: 'Baker',
								mos: '11B',
								dutyRole: 'Rifleman',
								groupId: 'alpha',
								groupName: 'Alpha'
							}
						],
						baselineRows: [
							{
								personnel: {
									id: 'person-2',
									rank: 'CPL',
									firstName: 'Ben',
									lastName: 'Baker',
									mos: '11B',
									dutyRole: 'Rifleman',
									groupId: 'alpha',
									groupName: 'Alpha'
								},
								startingCount: 4
							}
						]
					},
					view: 'settings'
				}
			}
		});

		expect(screen.getByRole('heading', { name: 'Template Identity' })).toBeTruthy();
		expect(screen.getByLabelText('Template name')).toBeTruthy();
		expect(screen.getByLabelText(/Template slug/)).toBeTruthy();
		expect(screen.getAllByLabelText(/Short code/)).toHaveLength(1);
		expect(screen.getByRole('heading', { name: 'Eligibility Rules' })).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'Individual Exclusions' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Add Soldier exclusion' })).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'DA6 Continuity' })).toBeTruthy();
		expect(screen.getByLabelText('Settings save actions')).toBeTruthy();
		expect(screen.getByRole('complementary', { name: 'Template summary' })).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Open Generate' }).getAttribute('href')).toBe(
			'/org/org-1/duty-rosters/cq-nco/generate'
		);
		expect(screen.getByRole('link', { name: 'Open History' }).getAttribute('href')).toBe(
			'/org/org-1/duty-rosters/cq-nco/history'
		);
		expect(screen.getByText('SGT Able, Ann')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Remove SGT Able, Ann from exclusions' })).toBeTruthy();
		expect(screen.getByLabelText('Search baseline')).toBeTruthy();
		expect(screen.getByLabelText('Show counted only')).toBeTruthy();
		expect(screen.getByDisplayValue('4')).toBeTruthy();

		expect(document.querySelector('input[type="hidden"][name="exemptPersonnelIds"][value="person-1"]')).toBeTruthy();

		expect(screen.getByRole('button', { name: 'Save settings from sticky bar' })).toBeTruthy();
	});

	it('bounds large settings tables and preserves hidden selected values', async () => {
		const personnel = largePersonnel(130);
		const selectedLargeTemplate = {
			...template,
			exemptPersonnelIds: ['person-130'],
			manualBaselineCounts: { 'person-129': 7 }
		};
		render(DutyRosterTemplateWorkspace, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Able Company',
					templates: [selectedLargeTemplate],
					selectedTemplate: selectedLargeTemplate,
					settings: {
						personnel,
						resolvedPool: personnel,
						baselineRows: personnel.map((person) => ({
							personnel: person,
							startingCount: person.id === 'person-129' ? 7 : null
						}))
					},
					view: 'settings'
				}
			}
		});

		expect(screen.getByText('Showing 100 of 130 matching Soldiers')).toBeTruthy();
		expect(screen.getByText('SGT Large130, Test')).toBeTruthy();
		expect(document.querySelector('input[type="hidden"][name="exemptPersonnelIds"][value="person-130"]')).toBeTruthy();

		await fireEvent.input(screen.getByLabelText('Search baseline'), { target: { value: 'Large129' } });

		expect(screen.getByText('Large129, Test')).toBeTruthy();
		expect(screen.getByText('Showing 1 of 1 matching Soldiers')).toBeTruthy();
	});
});

function largePersonnel(count: number) {
	return Array.from({ length: count }, (_, index) => {
		const personNumber = index + 1;
		return {
			id: `person-${personNumber}`,
			rank: 'SGT',
			firstName: 'Test',
			lastName: `Large${personNumber}`,
			mos: '11B',
			dutyRole: 'Rifleman',
			groupId: 'alpha',
			groupName: 'Alpha'
		};
	});
}

function preview(options: { manual?: boolean } = {}): DutyRosterTemplatePreview {
	const da6 = {
		numberingMode: 'single-sequence' as const,
		columns: [
			{
				date: '2026-06-01',
				sequenceKind: 'weekday' as const,
				sequenceKey: 'single' as const,
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
						code: 'assigned' as const,
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
	};

	const manualSelections = options.manual
		? [
				{
					date: '2026-06-01',
					originalAssigneeId: 'person-1',
					assigneeId: 'person-2',
					reason: 'Commander approved outside-pool replacement.',
					warnings: [
						{
							code: 'outside-pool' as const,
							message: 'Selected Soldier is outside this template pool.'
						}
					]
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
			pattern: 'daily',
			selectedWeekdays: [],
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
				groupId: 'bravo',
				groupName: 'Bravo',
				archivedAt: null
			}
		],
		manualSelections,
		rosterRows: [{ date: '2026-06-01', assigneeId: 'person-1' }],
		da6,
		exportModel: {
			assignmentType: { id: 'template-1', name: 'CQ NCO', shortName: 'CQ', color: '#8a5a22' },
			startDate: '2026-06-01',
			endDate: '2026-06-01',
			numberingMode: 'single-sequence',
			rosterRows: [{ date: '2026-06-01', assigneeId: 'person-1' }],
			da6,
			sequencePeriods: []
		},
		warnings: []
	};
}

function countReadModel(options: { source: 'manual-da6-baseline' | 'accepted-history'; corrected?: boolean }) {
	return {
		templateId: 'template-1',
		source: options.source,
		sourceLabel: options.source === 'accepted-history' ? 'Accepted history' : 'Manual DA6 Baseline',
		sourceDescription:
			options.source === 'accepted-history'
				? 'Future previews use accepted, non-invalidated Duty Roster history. Manual accepted selections are treated as the final selection. Latest counting corrections use the Soldier who actually served.'
				: 'Future previews use Manual DA6 Baseline until this template has its first accepted Duty Roster Run.',
		rows: [
			{
				personnelId: 'person-1',
				display: {
					id: 'person-1',
					rank: 'SGT',
					lastName: 'Able',
					firstName: 'Ann',
					groupName: 'Alpha'
				},
				count: options.source === 'manual-da6-baseline' ? 1 : 0,
				lastDutyDate: null
			},
			{
				personnelId: 'person-2',
				display: {
					id: 'person-2',
					rank: 'SGT',
					lastName: 'Baker',
					firstName: 'Ben',
					groupName: 'Bravo'
				},
				count: options.source === 'accepted-history' ? 1 : 0,
				lastDutyDate: options.source === 'accepted-history' ? '2026-06-01' : null
			}
		],
		acceptedRunCount: options.source === 'accepted-history' ? 1 : 0,
		invalidatedRunCount: 0,
		countingCorrectionCount: options.corrected ? 1 : 0,
		nonCountingCorrectionCount: 0
	};
}

function acceptedRun(
	options: {
		applied?: boolean;
		invalidated?: boolean;
		calendarAssignmentsEdited?: boolean;
		corrected?: boolean;
		correctionOverride?: boolean;
	} = {}
) {
	return {
		id: 'run-1',
		templateId: 'template-1',
		templateName: 'CQ NCO',
		status: options.invalidated ? ('invalidated' as const) : ('accepted' as const),
		startDate: '2026-06-01',
		endDate: '2026-06-01',
		acceptedAt: '2026-06-01T00:00:00.000Z',
		acceptedByUserId: 'user-1',
		appliedAt: options.applied ? '2026-06-01T00:10:00.000Z' : null,
		appliedByUserId: options.applied ? 'user-1' : null,
		invalidatedAt: options.invalidated ? '2026-06-01T00:20:00.000Z' : null,
		invalidatedByUserId: options.invalidated ? 'user-1' : null,
		linkedCalendarAssignmentCount: options.applied ? 1 : 0,
		calendarAssignmentsEdited: Boolean(options.calendarAssignmentsEdited),
		corrections: options.corrected
			? [
					{
						id: 'correction-1',
						runId: 'run-1',
						runRowDate: '2026-06-01',
						originalAssigneeId: 'person-2',
						originalDisplay: {
							id: 'person-2',
							rank: 'SGT',
							lastName: 'Baker',
							firstName: 'Ben',
							groupName: 'Bravo'
						},
						replacementAssigneeId: 'person-1',
						replacementDisplay: {
							id: 'person-1',
							rank: 'SGT',
							lastName: 'Able',
							firstName: 'Ann',
							groupName: 'Alpha'
						},
						reason: 'Emergency leave swap.',
						correctedByUserId: 'user-1',
						correctedAt: '2026-06-01T12:00:00.000Z',
						countsTowardFuture: !options.invalidated,
						poolOverride: Boolean(options.correctionOverride),
						poolOverrideReasons: options.correctionOverride ? ['outside-pool' as const] : []
					}
				]
			: [],
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
				pattern: 'daily',
				selectedWeekdays: [],
				excludedStatusIds: [],
				excludeWeekends: false,
				excludeHolidays: false,
				excludeOrgClosures: false,
				exemptPersonnelIds: [],
				numberingMode: 'single-sequence',
				misconductUnavailablePersonnelDates: {}
			},
			resolvedPool: [
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
					groupId: 'bravo',
					groupName: 'Bravo',
					archivedAt: null
				}
			],
			generatedRows: [{ date: '2026-06-01', assigneeId: 'person-1' }],
			finalRows: [
				{
					date: '2026-06-01',
					generatedAssigneeId: 'person-1',
					finalAssigneeId: 'person-2',
					assignmentSource: 'manual',
					generatedDisplay: {
						id: 'person-1',
						rank: 'SGT',
						lastName: 'Able',
						firstName: 'Ann',
						groupId: 'alpha',
						groupName: 'Alpha',
						archivedAt: null
					},
					finalDisplay: {
						id: 'person-2',
						rank: 'SGT',
						lastName: 'Baker',
						firstName: 'Ben',
						groupId: 'bravo',
						groupName: 'Bravo',
						archivedAt: null
					},
					reason: 'Commander approved outside-pool replacement.',
					warnings: [
						{
							code: 'outside-pool',
							message: 'Selected Soldier is outside this template pool.'
						}
					]
				}
			],
			manualSelections: [],
			da6: preview().da6,
			exportModel: preview().exportModel,
			warnings: []
		},
		createdAt: '2026-06-01T00:00:00.000Z'
	};
}
