// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import DutyRosterTemplateWorkspace from './DutyRosterTemplateWorkspace.svelte';
import type { DutyRosterTemplate } from '$features/duty-roster/templates/dutyRosterTemplates';

const template: DutyRosterTemplate = {
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
	createdAt: '2026-05-04T00:00:00Z',
	updatedAt: '2026-05-04T00:00:00Z'
};

afterEach(() => {
	cleanup();
});

describe('DutyRosterTemplateWorkspace', () => {
	it('renders a useful empty state and create form', () => {
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

		expect(screen.getByRole('heading', { name: 'Duty Rosters' })).toBeTruthy();
		expect(screen.getByText('No templates yet')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Create template' })).toBeTruthy();
		expect(screen.getByLabelText('Name')).toBeTruthy();
		expect(screen.getByLabelText('Short code')).toBeTruthy();
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

		const templateList = screen.getByRole('navigation', { name: 'Open Duty Roster Template' });
		expect(
			within(templateList)
				.getByRole('link', { name: /CQ NCO/ })
				.getAttribute('href')
		).toBe('/org/org-1/duty-rosters/cq-nco/generate');

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

	it('shows validation errors without dropping entered values', () => {
		render(DutyRosterTemplateWorkspace, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Able Company',
					templates: [],
					selectedTemplate: null,
					view: 'generate'
				},
				form: {
					error: 'Name is required',
					values: { name: ' ', shortCode: 'CQ' }
				}
			}
		});

		expect(screen.getByRole('alert').textContent).toBe('Name is required');
		expect(screen.getByLabelText<HTMLInputElement>('Short code').value).toBe('CQ');
	});

	it('renders scan-friendly settings for pool, exemptions, and baseline setup', () => {
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

		expect(screen.getByRole('heading', { name: 'Pool criteria' })).toBeTruthy();
		expect(screen.getByRole('table', { name: 'Resolved Duty Roster pool' })).toBeTruthy();
		expect(screen.getByDisplayValue('4')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Save settings' })).toBeTruthy();
	});
});
