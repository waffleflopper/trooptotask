// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { tick, type ComponentProps } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LossCandidate } from '$features/personnel/contracts';
import type { GroupReadiness, PoliciesSettingsData } from '../policiesSettings';
import Page from './+page.svelte';

const feedback = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('$lib/stores/toast.svelte', () => ({ toastStore: feedback }));

const GROUPS: GroupReadiness[] = [
	{ name: '2nd PLT', ready: 81, applicable: 100, percent: 81 },
	{ name: 'Maint PLT', ready: 78, applicable: 100, percent: 78 },
	{ name: 'HQ PLT', ready: 95, applicable: 100, percent: 95 }
];

const PEOPLE: LossCandidate[] = [
	{ id: 'kim', rank: 'SGT', lastName: 'Kim', ets: '2026-11-20', deros: null, groupId: null },
	{ id: 'reed', rank: 'SPC', lastName: 'Reed', ets: null, deros: '2027-03-02', groupId: null },
	{ id: 'diaz', rank: 'PFC', lastName: 'Diaz', ets: '2027-03-31', deros: null, groupId: null }
];

function policies(overrides: Partial<PoliciesSettingsData> = {}): PoliciesSettingsData {
	return {
		lossWarningWindowDays: 180,
		trainingReadinessGoalPercent: 90,
		archiveRetentionMonths: 24,
		today: '2026-10-21',
		lossCandidates: Promise.resolve(PEOPLE),
		oldestArchivedAt: '2024-11-02T03:00:00.000Z',
		groupReadiness: Promise.resolve(GROUPS),
		...overrides
	};
}

function data(policiesSettings: PoliciesSettingsData, orgId = 'org-a') {
	return {
		orgId,
		orgUrlSegment: `slug-${orgId}`,
		orgName: 'C Co',
		policiesSettings
	} as unknown as ComponentProps<typeof Page>['data'];
}

function show(policiesSettings = policies()) {
	return render(Page, { data: data(policiesSettings), form: null, params: { orgId: 'slug-org-a' } });
}

async function showStreamed(policiesSettings = policies()) {
	const view = show(policiesSettings);
	await waitFor(() => expect(sentence('loss-warning-window')).toMatch(/flagged today/));
	return view;
}

function stubFetch(answer: () => Promise<Response> = async () => Response.json({ success: true })) {
	const request = vi.fn((_url: string, _init: RequestInit) => answer());
	vi.stubGlobal('fetch', request);
	return request;
}

function sentence(id: string) {
	return document.getElementById(`${id}-sentence`)?.textContent?.replace(/\s+/g, ' ').trim();
}

function row(label: string) {
	return within(screen.getByLabelText(label).closest('[data-slot="fact-row"]') as HTMLElement);
}

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-10-21T12:00:00.000Z'));
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe('Policies settings page', () => {
	it('renders every row saved on first paint and fills the loss and readiness sentences as they stream', async () => {
		let releasePeople!: (people: LossCandidate[]) => void;
		let releaseGroups!: (groups: GroupReadiness[]) => void;
		stubFetch();
		show(
			policies({
				lossCandidates: new Promise((resolve) => (releasePeople = resolve)),
				groupReadiness: new Promise((resolve) => (releaseGroups = resolve))
			})
		);

		expect(['Loss warning window', 'Training readiness goal', 'Archive retention'].map((l) => field(l).value)).toEqual([
			'180',
			'90',
			'24'
		]);
		expect(screen.getAllByText('Saved')).toHaveLength(3);
		expect(screen.queryByRole('button', { name: /Save|Undo/ })).toBeNull();
		expect(sentence('loss-warning-window')).toBe('At 180 days, Loading the people flagged');
		expect(sentence('training-readiness-goal')).toBe('Groups under 90% current show amber. Loading group readiness');
		expect(sentence('archive-retention')).toBe(
			'Archived people are deleted 24 months after archiving. The next one goes on 2 Nov 2026.'
		);
		expect(screen.getByText('Ranges · window 1–365 days · goal 1–100% · retention 1–120 months')).toBeTruthy();

		releasePeople(PEOPLE);
		releaseGroups(GROUPS);
		await waitFor(() => expect(sentence('loss-warning-window')).toBe('At 180 days, 3 people are flagged today.'));
		await waitFor(() =>
			expect(sentence('training-readiness-goal')).toBe(
				"Groups under 90% current show amber. Today that's 2nd PLT (81%) and Maint PLT (78%)."
			)
		);
	});

	it('says the loss dates could not load and keeps the other rows working', async () => {
		const request = stubFetch();
		show(policies({ lossCandidates: Promise.reject(new Error('down')) }));

		await waitFor(() => expect(sentence('loss-warning-window')).toBe("Loss dates couldn't load."));
		await fireEvent.input(field('Archive retention'), { target: { value: '48' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save archive retention' }));
		await waitFor(() => expect(feedback.success).toHaveBeenCalledWith('Retention policy saved'));
		expect(JSON.parse(String(request.mock.calls[0][1].body))).toEqual({ archiveRetentionMonths: 48 });
	});

	it('says the group readiness could not load when the briefing read fails', async () => {
		stubFetch();
		show(policies({ groupReadiness: Promise.reject(new Error('down')) }));

		await waitFor(() =>
			expect(sentence('training-readiness-goal')).toBe(
				"Groups under 90% current show amber. Group readiness couldn't load."
			)
		);
	});

	it('recomputes each sentence from the draft and marks the row unsaved', async () => {
		stubFetch();
		await showStreamed();
		await waitFor(() => expect(sentence('training-readiness-goal')).toContain("Today that's"));

		await fireEvent.input(field('Loss warning window'), { target: { value: '140' } });
		expect(sentence('loss-warning-window')).toBe(
			"At 140 days, 2 people are flagged today (was 3 at 180). PFC Diaz's ETS on 31 Mar 2027 would drop off."
		);
		expect(row('Loss warning window').getByText('Unsaved · was 180')).toBeTruthy();
		expect(row('Loss warning window').getByRole('button', { name: 'Save loss warning window' })).toBeTruthy();

		await fireEvent.input(field('Training readiness goal'), { target: { value: '80' } });
		expect(sentence('training-readiness-goal')).toBe(
			"Groups under 80% current show amber. Today that's Maint PLT (78%)."
		);
		expect(row('Training readiness goal').getByText('Unsaved · was 90%')).toBeTruthy();

		await fireEvent.input(field('Archive retention'), { target: { value: '12' } });
		expect(sentence('archive-retention')).toBe(
			'Archived people are deleted 12 months after archiving. The next one goes on 22 Oct 2026.'
		);
	});

	it('undoes a draft without saving it and keeps focus in the field', async () => {
		const request = stubFetch();
		await showStreamed();

		await fireEvent.input(field('Loss warning window'), { target: { value: '140' } });
		const undo = screen.getByRole('button', { name: 'Undo loss warning window change' });
		undo.focus();
		await fireEvent.click(undo);

		expect(field('Loss warning window').value).toBe('180');
		expect(sentence('loss-warning-window')).toBe('At 180 days, 3 people are flagged today.');
		expect(screen.getAllByText('Saved')).toHaveLength(3);
		await waitFor(() => expect(document.activeElement).toBe(field('Loss warning window')));
		expect(request).not.toHaveBeenCalled();
	});

	it('saves one row through the settings endpoint and compares later drafts with the new value', async () => {
		const request = stubFetch();
		await showStreamed();

		await fireEvent.input(field('Loss warning window'), { target: { value: '140' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save loss warning window' }));

		await waitFor(() => expect(feedback.success).toHaveBeenCalledWith('Warning window saved'));
		expect(request).toHaveBeenCalledOnce();
		expect(request.mock.calls[0][0]).toBe('/org/slug-org-a/api/organization/settings');
		expect(JSON.parse(String(request.mock.calls[0][1].body))).toEqual({ lossWarningWindowDays: 140 });
		expect(row('Loss warning window').getByText('Saved')).toBeTruthy();
		expect(sentence('loss-warning-window')).toBe('At 140 days, 2 people are flagged today.');

		await fireEvent.input(field('Loss warning window'), { target: { value: '180' } });
		expect(sentence('loss-warning-window')).toBe(
			"At 180 days, 3 people are flagged today (was 2 at 140). PFC Diaz's ETS on 31 Mar 2027 would join."
		);
	});

	it('mutes the rows of features that are off, says why and still saves them', async () => {
		const request = stubFetch();
		show(policies({ lossCandidates: null, groupReadiness: null }));

		expect(sentence('loss-warning-window')).toBe(
			"Losses and awards is off for C Co, so no one is flagged. The window applies again when it's back on."
		);
		expect(sentence('training-readiness-goal')).toBe(
			'Training is off for C Co, so no group is graded against the goal. It applies again when Training is back on.'
		);

		await fireEvent.input(field('Training readiness goal'), { target: { value: '85' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save training readiness goal' }));
		await waitFor(() => expect(feedback.success).toHaveBeenCalledWith('Training readiness goal saved'));
		expect(JSON.parse(String(request.mock.calls[0][1].body))).toEqual({ trainingReadinessGoalPercent: 85 });
	});

	it.each(['', '0', '101', '90.5'])(
		'states the range for the invalid draft %j and refuses to save it with an error on the field',
		async (value) => {
			const request = stubFetch();
			show();
			const input = field('Training readiness goal');

			await fireEvent.input(input, { target: { value } });
			expect(sentence('training-readiness-goal')).toBe('Enter a whole percent from 1 to 100.');
			await fireEvent.click(screen.getByRole('button', { name: 'Save training readiness goal' }));

			await waitFor(() => expect(input.getAttribute('aria-invalid')).toBe('true'));
			const error = document.getElementById('training-readiness-goal-error');
			expect(error?.textContent?.trim()).toBe('The training readiness goal must be a whole number from 1 to 100.');
			expect(input.getAttribute('aria-describedby')?.split(' ')).toContain('training-readiness-goal-error');
			expect(request).not.toHaveBeenCalled();
		}
	);

	it('keeps a refused draft unsaved with the server reason on the field', async () => {
		stubFetch(async () => Response.json({ message: 'Retention months must be between 1 and 120' }, { status: 400 }));
		show();

		await fireEvent.input(field('Archive retention'), { target: { value: '48' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save archive retention' }));

		await waitFor(() =>
			expect(document.getElementById('archive-retention-error')?.textContent?.trim()).toBe(
				'Retention months must be between 1 and 120'
			)
		);
		expect(field('Archive retention').value).toBe('48');
		expect(row('Archive retention').getByText('Unsaved · was 24')).toBeTruthy();
		expect(feedback.success).not.toHaveBeenCalled();
	});

	it('drops a pending save confirmation after switching to another unit', async () => {
		let answer!: (response: Response) => void;
		stubFetch(() => new Promise((resolve) => (answer = resolve)));
		const view = show();

		await fireEvent.input(field('Archive retention'), { target: { value: '48' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save archive retention' }));
		await view.rerender({ data: data(policies(), 'org-b') });
		expect(field('Archive retention').value).toBe('24');

		answer(Response.json({ success: true }));
		await tick();
		await tick();
		expect(feedback.success).not.toHaveBeenCalled();
	});
});
