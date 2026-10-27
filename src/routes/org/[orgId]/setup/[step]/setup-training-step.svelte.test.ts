// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, expect, it, vi } from 'vitest';
import type { SetupFacts, OrganizationSetup } from '$features/organization/contracts';
import { trainingTypesStore } from '$features/training';
import SetupStepTestHarness from './SetupStepTestHarness.svelte';

const invalidate = vi.hoisted(() => vi.fn(async (_dependency: string) => {}));
vi.mock('$app/navigation', () => ({ invalidate, goto: vi.fn() }));
vi.mock('$features/app-shell', async () => {
	const { createClientAccess } = await import('$lib/access/clientAccess');
	const access = createClientAccess({ membershipRole: 'owner' });
	return { getAppShellContext: () => ({ ...access, orgId: 'org-1', orgUrlSegment: 'alpha' }) };
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	invalidate.mockClear();
	trainingTypesStore.load([], 'org-test-reset');
});

const ready = (value: number) => ({ status: 'ready', value }) as const;
const facts: SetupFacts = {
	branch: 'army',
	groups: ready(3),
	activeRanks: ready(28),
	activePeople: ready(1),
	statusTypes: ready(7),
	assignmentTypes: ready(2),
	trainingTypes: ready(1),
	criticalTasks: ready(0),
	evaluations: ready(0),
	onboardingTemplates: ready(0),
	events: ready(0),
	taskings: ready(0),
	members: ready(1),
	pendingInvitations: ready(0),
	lossWarningWindowDays: ready(90)
};
const state: OrganizationSetup = { branch: 'army', answers: {}, finishedAt: null, prompts: {} };

const savedType = (id: string, name: string, sortOrder: number) => ({
	id,
	name,
	description: null,
	expirationMonths: 12,
	warningDaysYellow: 60,
	warningDaysOrange: 30,
	appliesToRoles: [],
	appliesToMos: [],
	appliesToRanks: [],
	excludedRoles: [],
	excludedMos: [],
	excludedRanks: [],
	color: '#4a6a9a',
	sortOrder,
	expirationDateOnly: false,
	canBeExempted: false,
	exemptPersonnelIds: [],
	isOptional: false
});
const person = { id: 'p-1', rank: 'SGT', lastName: 'Smith', firstName: 'Jane', mos: '68W', clinicRole: 'Medic' };

function stubServer() {
	const catalog = [savedType('sharp-type', 'SHARP', 0)];
	const writes: { method: string; url: string; body: Record<string, unknown> }[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string, init?: RequestInit) => {
			const method = init?.method ?? 'GET';
			if (method === 'GET' && url === '/org/org-1/api/training-types/editor') {
				return Response.json({ trainingTypes: catalog, personnel: [person], rankCatalog: [] });
			}
			const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
			writes.push({ method, url, body });
			if (method === 'POST' && url === '/org/org-1/api/training-types') {
				const created = { ...savedType('range-type', String(body.name), catalog.length), ...body, id: 'range-type' };
				catalog.push(created);
				return Response.json(created);
			}
			if (method === 'POST' && url === '/org/alpha/api/training-types/suggestions') {
				return Response.json({ failed: [], trainingTypes: catalog });
			}
			throw new Error(`Unexpected request ${method} ${url}`);
		})
	);
	return writes;
}

it('creates a type in the Training step’s own editor and keeps the owner’s picks', async () => {
	const writes = stubServer();
	const navigate = vi.fn(async (_href: string) => {});
	render(SetupStepTestHarness, {
		props: {
			source: () => ({
				orgUrlSegment: 'alpha',
				disabledFeatures: [],
				setupState: state,
				setupFacts: Promise.resolve(facts),
				stepKey: 'training',
				navigating: false
			}),
			navigate
		}
	});

	await waitFor(() => expect(screen.getByRole('checkbox', { name: /SHARP/ })).toBeDisabled());
	await fireEvent.click(screen.getByRole('checkbox', { name: /OPSEC/ }));
	await fireEvent.click(screen.getByRole('button', { name: /own type/i }));
	const editor = await screen.findByRole('dialog');
	await fireEvent.input(within(editor).getByRole('textbox', { name: 'Name' }), { target: { value: 'Range Safety' } });
	await fireEvent.click(within(editor).getByRole('button', { name: 'Create type' }));

	await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
	expect(await screen.findByRole('button', { name: /Range Safety/ })).toBeInTheDocument();
	expect(writes).toEqual([
		{
			method: 'POST',
			url: '/org/org-1/api/training-types',
			body: expect.objectContaining({ name: 'Range Safety', sortOrder: 1 })
		}
	]);
	expect(invalidate).toHaveBeenCalledWith('app:organization-setup');
	expect(navigate).not.toHaveBeenCalled();
	expect(screen.getByRole('checkbox', { name: /OPSEC/ })).not.toBeChecked();

	await fireEvent.click(screen.getByRole('button', { name: /continue/i }));
	await waitFor(() => expect(navigate).toHaveBeenCalledWith('/org/alpha/setup/critical-tasks'));
	expect(writes.at(-1)).toEqual({
		method: 'POST',
		url: '/org/alpha/api/training-types/suggestions',
		body: { branch: 'army', suggestionIds: ['eo', 'ace', 'cyber-awareness', 'tarp', 'at-level-i', 'ctip'] }
	});
});
