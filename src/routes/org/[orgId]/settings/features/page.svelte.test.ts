// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FeatureKey } from '$lib/access/featureSwitches';
import type { FeatureCounts } from '$features/organization/contracts';
import Page from './+page.svelte';

const feedback = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('$lib/stores/toast.svelte', () => ({ toastStore: feedback }));
const server = vi.hoisted(() => ({ refresh: async () => {} }));
vi.mock('$app/navigation', () => ({ invalidate: () => server.refresh() }));

const COUNTS: FeatureCounts = {
	activePersonnel: 22,
	statusTypes: 6,
	trainingTypes: 8,
	trainingRecords: 912,
	criticalTaskLists: 0,
	ratingSchemeEntries: 21,
	onboardingTemplates: 0
};

type Stored = { disabledFeatures: FeatureKey[]; strengthFloorPercent: number };

function data(stored: Stored, counts: Promise<FeatureCounts> = Promise.resolve(COUNTS)) {
	return {
		orgId: 'org-a',
		orgUrlSegment: 'c-co',
		orgName: 'C Co',
		featuresSettings: { ...stored, disabledFeatures: [...stored.disabledFeatures], lossWarningWindowDays: 180, counts }
	} as unknown as ComponentProps<typeof Page>['data'];
}

/** Applies each save to `stored` the way the settings endpoint does, after `gate` lets it through. */
function serve(stored: Stored, gate: (body: Record<string, unknown>) => Promise<Response | void> = async () => {}) {
	const request = vi.fn(async (_url: string, init: RequestInit) => {
		const body = JSON.parse(String(init.body));
		const answer = await gate(body);
		if (answer) return answer;
		const change = body.featureSwitch as { feature: FeatureKey; on: boolean } | undefined;
		if (change) {
			const rest = stored.disabledFeatures.filter((key) => key !== change.feature);
			stored.disabledFeatures = change.on ? rest : [...rest, change.feature];
		}
		if (typeof body.strengthFloorPercent === 'number') stored.strengthFloorPercent = body.strengthFloorPercent;
		return Response.json({ success: true });
	});
	vi.stubGlobal('fetch', request);
	const view = render(Page, { data: data(stored), form: null, params: { orgId: 'c-co' } });
	server.refresh = () => view.rerender({ data: data(stored) });
	return request;
}

function featureSwitch(name: string) {
	return screen.getByRole('switch', { name });
}

function row(name: string) {
	const label = screen.getAllByText(name).find((element) => element.closest('dt'));
	return within(label!.closest<HTMLElement>('[data-slot="fact-row"]')!);
}

function floorSentence() {
	return document.getElementById('strength-floor-sentence')?.textContent?.replace(/\s+/g, ' ').trim();
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe('Features settings page', () => {
	it('lists every feature with its switch on first paint and streams what each holds', async () => {
		let release!: (counts: FeatureCounts) => void;
		vi.stubGlobal('fetch', vi.fn());
		render(Page, {
			data: data(
				{ disabledFeatures: ['criticalTasks'], strengthFloorPercent: 80 },
				new Promise((resolve) => (release = resolve))
			),
			form: null,
			params: { orgId: 'c-co' }
		});

		expect(screen.getAllByRole('term').map((term) => term.textContent?.trim().split(/\s{2,}|\n/)[0])).toEqual([
			'Availability and calendar',
			'Training',
			'Critical tasks',
			'Evaluations',
			'Onboarding',
			'Losses and awards'
		]);
		const switches = ['Training', 'Critical tasks', 'Evaluations', 'Onboarding', 'Losses and awards'];
		expect(screen.getAllByRole('switch')).toEqual(switches.map(featureSwitch));
		expect(switches.map((name) => featureSwitch(name).getAttribute('aria-checked'))).toEqual([
			'true',
			'false',
			'true',
			'true',
			'true'
		]);
		expect(row('Onboarding').getByText('Loading counts')).toBeTruthy();
		expect(row('Losses and awards').getByText('Window 180 days')).toBeTruthy();

		release(COUNTS);
		await waitFor(() => expect(screen.queryByText('Loading counts')).toBeNull());
		expect(row('Onboarding').getByText('Not set up · no templates')).toBeTruthy();
		expect(row('Critical tasks').getByText('No task lists')).toBeTruthy();
		expect(row('Training').getByText('8 types · 912 records')).toBeTruthy();
	});

	it('puts a switch back and says which feature failed and why', async () => {
		const stored: Stored = { disabledFeatures: [], strengthFloorPercent: 80 };
		serve(stored, async () => Response.json({ message: 'Organization settings update failed' }, { status: 500 }));

		await fireEvent.click(featureSwitch('Training'));

		await waitFor(() => expect(feedback.error).toHaveBeenCalledTimes(1));
		const [message] = feedback.error.mock.calls[0];
		expect(message).toContain('Training');
		expect(message).toContain('Organization settings update failed');
		expect(featureSwitch('Training').getAttribute('aria-checked')).toBe('true');
		expect(stored.disabledFeatures).toEqual([]);
	});

	it('keeps every switch the user changed while earlier saves were still in flight', async () => {
		const stored: Stored = { disabledFeatures: ['onboarding'], strengthFloorPercent: 80 };
		const gates: (() => void)[] = [];
		serve(stored, () => new Promise<void>((pass) => gates.push(pass)));

		await fireEvent.click(featureSwitch('Training'));
		await fireEvent.click(featureSwitch('Onboarding'));
		await fireEvent.click(featureSwitch('Training'));
		expect(featureSwitch('Training').getAttribute('aria-checked')).toBe('false');
		expect(featureSwitch('Onboarding').getAttribute('aria-checked')).toBe('true');

		await waitFor(() => expect(gates).toHaveLength(1));
		gates[0]();
		await waitFor(() => expect(gates).toHaveLength(2));
		gates[1]();

		await waitFor(() => expect(feedback.success).toHaveBeenCalledTimes(2));
		expect(stored.disabledFeatures).toEqual(['training']);
		expect(featureSwitch('Training').getAttribute('aria-checked')).toBe('false');
		expect(featureSwitch('Onboarding').getAttribute('aria-checked')).toBe('true');
		expect(row('Onboarding').getByText('Not set up · no templates')).toBeTruthy();
	});

	it('restates the strength floor from the draft and saves it after showing the server field error', async () => {
		const stored: Stored = { disabledFeatures: [], strengthFloorPercent: 80 };
		const sent: unknown[] = [];
		serve(stored, async (body) => {
			sent.push(body.strengthFloorPercent);
			return typeof body.strengthFloorPercent === 'number' && body.strengthFloorPercent >= 1
				? undefined
				: Response.json({ message: 'Strength floor must be a whole number between 1 and 100' }, { status: 400 });
		});
		const floor = screen.getByLabelText('Strength floor') as HTMLInputElement;
		await waitFor(() => expect(floorSentence()).toContain('80% of 22 is 17.6, so 17 or fewer available is flagged.'));

		await fireEvent.input(floor, { target: { value: '' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save strength floor' }));
		await waitFor(() =>
			expect(screen.getByText('Strength floor must be a whole number between 1 and 100')).toBeTruthy()
		);
		expect(sent).toEqual([null]);
		expect(floor.getAttribute('aria-invalid')).toBe('true');
		expect(stored.strengthFloorPercent).toBe(80);

		await fireEvent.input(floor, { target: { value: '75' } });
		expect(floorSentence()).toContain('75% of 22 is 16.5, so 16 or fewer available is flagged.');
		await fireEvent.click(screen.getByRole('button', { name: 'Save strength floor' }));

		await waitFor(() => expect(stored.strengthFloorPercent).toBe(75));
		await waitFor(() => expect(screen.queryByRole('button', { name: 'Save strength floor' })).toBeNull());
		expect(floor.value).toBe('75');
		expect(floor.getAttribute('aria-invalid')).toBeNull();
	});

	it('keeps a floor typed while an earlier floor save was in flight', async () => {
		const stored: Stored = { disabledFeatures: [], strengthFloorPercent: 80 };
		const gates: (() => void)[] = [];
		serve(stored, () => new Promise<void>((pass) => gates.push(pass)));
		const floor = screen.getByLabelText('Strength floor') as HTMLInputElement;

		await fireEvent.input(floor, { target: { value: '75' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save strength floor' }));
		await waitFor(() => expect(gates).toHaveLength(1));
		await fireEvent.input(floor, { target: { value: '90' } });
		gates[0]();

		await waitFor(() => expect(stored.strengthFloorPercent).toBe(75));
		await waitFor(() => expect(screen.getByText('Unsaved · was 75%')).toBeTruthy());
		expect(floor.value).toBe('90');
		expect(screen.getByRole('button', { name: 'Save strength floor' })).toBeTruthy();
	});

	it('undoes an unsaved floor back to the saved value', async () => {
		serve({ disabledFeatures: [], strengthFloorPercent: 80 });
		const floor = screen.getByLabelText('Strength floor') as HTMLInputElement;

		await fireEvent.input(floor, { target: { value: '60' } });
		expect(screen.getByText('Unsaved · was 80%')).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Undo strength floor change' }));

		expect(floor.value).toBe('80');
		expect(screen.queryByText(/Unsaved/)).toBeNull();
	});
});
