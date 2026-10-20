// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import { afterEach, expect, it, vi } from 'vitest';
import type { PersonnelCriticalTaskReadiness } from '$features/critical-tasks/contracts';
import type { PersonnelTrainingReadiness } from '$features/training/contracts';
import { createClientAccess } from '$lib/access/clientAccess';
import ReadinessTabView from './ReadinessTabView.svelte';

const navigation = vi.hoisted(() => ({
	afterNavigate: [] as Array<(navigation: { to: { url: URL } | null }) => void>
}));

vi.mock('$features/app-shell', async (importOriginal) => ({
	...(await importOriginal<typeof import('$features/app-shell')>()),
	getAppShellContext: () => createClientAccess({ membershipRole: 'owner' })
}));
vi.mock('$app/state', () => ({ page: { state: {} } }));
vi.mock('$app/navigation', () => ({
	afterNavigate: (callback: (typeof navigation.afterNavigate)[number]) => navigation.afterNavigate.push(callback),
	goto: vi.fn(),
	invalidate: vi.fn(async () => {}),
	replaceState: vi.fn()
}));

afterEach(() => {
	cleanup();
	navigation.afterNavigate.length = 0;
});

const training: PersonnelTrainingReadiness = {
	personnelId: 'person-1',
	mos: '68W',
	items: [
		{
			typeId: 'cpr',
			name: 'CPR / BLS',
			status: 'expired',
			daysUntilExpiration: -12,
			cycleMonths: 24,
			expirationDateOnly: false,
			canBeExempted: true,
			applicability: { kind: 'all' },
			completion: {
				id: 'record-1',
				personnelId: 'person-1',
				trainingTypeId: 'cpr',
				completionDate: '2024-09-24',
				expirationDate: '2026-09-24',
				notes: null,
				certificateUrl: null
			},
			history: []
		}
	],
	notRequiredCount: 0,
	exemptCount: 0
};

const criticalTasks: PersonnelCriticalTaskReadiness = {
	personnelId: 'person-1',
	mos: '68W',
	items: [],
	expiringSoonWarningDays: 30
};

function readiness(overrides: Partial<Record<'training' | 'criticalTasks', Promise<unknown>>> = {}) {
	return {
		training: Promise.resolve(training),
		criticalTasks: Promise.resolve(criticalTasks),
		evaluation: Promise.resolve(null),
		loss: Promise.resolve({ windowDays: 180, ets: null, deros: null, inWindow: null }),
		onboarding: Promise.resolve({ state: 'none' as const }),
		...overrides
	} as ComponentProps<typeof ReadinessTabView>['readiness'];
}

const person = { id: 'person-1', rank: 'SGT', lastName: 'Okafor', groupId: null };

it('shows a failed source as unchecked while the others load', async () => {
	render(ReadinessTabView, {
		props: {
			orgId: 'org-1',
			person,
			asOf: '2026-10-06',
			readiness: readiness({ criticalTasks: Promise.reject(new Error('down')) })
		}
	});

	expect(await screen.findByText("Couldn't check critical tasks. Reload the page to try again.")).toBeTruthy();
	expect(screen.getByText('0 of 1 ready')).toBeTruthy();
	expect(screen.queryByText("Couldn't check training. Reload the page to try again.")).toBeNull();
});

it('keeps the loaded table while a refresh is pending', async () => {
	const view = render(ReadinessTabView, {
		props: { orgId: 'org-1', person, asOf: '2026-10-06', readiness: readiness() }
	});
	await screen.findByText('0 of 1 ready');

	await view.rerender({
		orgId: 'org-1',
		person,
		asOf: '2026-10-06',
		readiness: readiness({ training: new Promise(() => {}) })
	});

	expect(screen.getByText('0 of 1 ready')).toBeTruthy();
	expect(screen.queryByLabelText('Training', { selector: '[aria-busy="true"]' })).toBeNull();
});

it('opens the item an Add to record or attention link names', async () => {
	render(ReadinessTabView, {
		props: { orgId: 'org-1', person, asOf: '2026-10-06', readiness: readiness() }
	});
	await screen.findByText('0 of 1 ready');

	navigation.afterNavigate[0]({ to: { url: new URL('http://localhost/readiness?item=training%3Acpr') } });
	expect(await screen.findByRole('dialog', { name: 'CPR / BLS' })).toBeTruthy();
	expect(screen.getByText('Training · SGT Okafor')).toBeTruthy();

	await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
	await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

	navigation.afterNavigate[0]({ to: { url: new URL('http://localhost/readiness?item=training%3Agone') } });
	expect(await screen.findByLabelText('Training type')).toBeTruthy();
});

it('closes a linked drawer when Back drops its intent and keeps one the leader opened', async () => {
	render(ReadinessTabView, {
		props: { orgId: 'org-1', person, asOf: '2026-10-06', readiness: readiness() }
	});
	await screen.findByText('0 of 1 ready');
	const back = () => navigation.afterNavigate[0]({ to: { url: new URL('http://localhost/readiness') } });

	navigation.afterNavigate[0]({ to: { url: new URL('http://localhost/readiness?add=training') } });
	expect(await screen.findByLabelText('Training type')).toBeTruthy();
	back();
	await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

	await fireEvent.click(screen.getByRole('button', { name: 'Open CPR / BLS' }));
	expect(await screen.findByRole('dialog', { name: 'CPR / BLS' })).toBeTruthy();
	back();
	expect(screen.getByRole('dialog', { name: 'CPR / BLS' })).toBeTruthy();
});
