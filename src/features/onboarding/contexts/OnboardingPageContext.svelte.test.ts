import { onboardingStore } from '../stores/onboarding.svelte';
import { toastStore } from '$lib/stores/toast.svelte';
import type { ScopeSet } from '$lib/access/memberAccessShape';
import { afterEach, describe, it, expect, vi } from 'vitest';

const { invalidateMock } = vi.hoisted(() => ({
	invalidateMock: vi.fn()
}));

vi.mock('$app/navigation', () => ({
	goto: vi.fn(),
	invalidate: invalidateMock,
	invalidateAll: vi.fn()
}));

import { OnboardingPageContext, getProgress, formatTimestamp } from './OnboardingPageContext.svelte';
import type { PersonnelOnboarding, OnboardingStepProgress } from '../onboarding.types';
import { personnelRosterHydration } from '$features/personnel';
import type { CapabilityMap } from '$lib/access/memberAccessShape';
import { createTestOrgContext, NONE_TEST_CAPABILITY_MAP } from '$lib/test-support/orgContextBuilder';

afterEach(() => {
	personnelRosterHydration.load([], 'org-test-reset');
	onboardingStore.load([], 'org-test-reset');
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

// ── Fixtures ──────────────────────────────────────────────────

function makeStep(overrides: Partial<OnboardingStepProgress> = {}): OnboardingStepProgress {
	return {
		id: 'step-1',
		onboardingId: 'ob-1',
		stepName: 'Sign paperwork',
		stepType: 'checkbox',
		trainingTypeId: null,
		stages: null,
		sortOrder: 0,
		completed: false,
		currentStage: null,
		notes: [],
		templateStepId: 'tpl-step-1',
		active: true,
		...overrides
	};
}

function makeOnboarding(overrides: Partial<PersonnelOnboarding> = {}): PersonnelOnboarding {
	return {
		id: 'ob-1',
		personnelId: 'p-1',
		startedAt: '2026-01-01T00:00:00Z',
		completedAt: null,
		cancelledAt: null,
		status: 'in_progress',
		steps: [],
		templateId: 'tpl-1',
		...overrides
	};
}

const baseCapabilityMap: CapabilityMap = {
	...NONE_TEST_CAPABILITY_MAP,
	personnel: 'view',
	onboarding: 'operate'
};

function makeOrgContext(capabilityMap: CapabilityMap = baseCapabilityMap) {
	return createTestOrgContext({
		orgId: 'org-1',
		userRole: 'member',
		capabilityMap,
		scopeSet: { kind: 'groups', groupIds: ['g-1'] }
	});
}

describe('OnboardingPageContext Organization input', () => {
	it('uses the canonical Organization segment for History, Templates and Training links', () => {
		const ctx = new OnboardingPageContext({} as never, {
			orgId: 'organization-database-id',
			orgUrlSegment: 'alpha-unit',
			scopeSet: { kind: 'organization' },
			affordanceForFeatureAction: () => ({ allowed: true, visible: true })
		});

		expect(ctx.historyUrl).toBe('/org/alpha-unit/onboarding/history');
		expect(ctx.templatesUrl).toBe('/org/alpha-unit/onboarding/templates');
		expect(ctx.trainingPageUrl).toBe('/org/alpha-unit/training');
	});
});

describe('Onboarding inactive step removal feedback', () => {
	it('restores failed removal with an error and permits a successful retry without losing other work', async () => {
		const target = makeStep({
			active: false,
			templateStepId: null,
			stepType: 'paperwork',
			stages: ['Submitted', 'Reviewed', 'Filed'],
			currentStage: 'Reviewed',
			notes: [{ text: 'Retained paperwork', timestamp: '2026-01-01T12:00:00Z', userId: 'author' }]
		});
		const sibling = makeStep({ id: 'other-step', completed: true });
		onboardingStore.load([makeOnboarding({ steps: [target, sibling] })], 'org-1');
		const ctx = new OnboardingPageContext({ open: vi.fn() } as never, makeOrgContext());
		let respond!: (response: Response) => void;
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockImplementationOnce(() => new Promise<Response>((resolve) => (respond = resolve)))
				.mockResolvedValueOnce(new Response('{"success":true}', { status: 200 }))
		);
		const feedback = vi.spyOn(toastStore, 'error');

		const pending = ctx.handleRemoveDeprecatedStep(target.id);
		expect(ctx.removingDeprecatedStepId).toBe(target.id);
		expect(onboardingStore.items[0].steps).toEqual([sibling]);
		respond(new Response('{}', { status: 503 }));
		await pending;

		expect(onboardingStore.items[0].steps).toEqual([target, sibling]);
		expect(ctx.removingDeprecatedStepId).toBeNull();
		expect(feedback).toHaveBeenCalledWith(expect.stringMatching(/\S/));
		feedback.mockClear();
		await ctx.handleRemoveDeprecatedStep(target.id);
		expect(onboardingStore.items[0].steps).toEqual([sibling]);
		expect(ctx.removingDeprecatedStepId).toBeNull();
		expect(feedback).not.toHaveBeenCalled();
	});

	it.each(['disposed', 'changed-organization', 'reloaded-organization'] as const)(
		'does not show a late removal failure for a %s context',
		async (change) => {
			const target = makeStep({ active: false });
			onboardingStore.load([makeOnboarding({ steps: [target] })], 'org-1');
			let currentOrgId = 'org-1';
			const ctx = new OnboardingPageContext({ open: vi.fn() } as never, {
				get orgId() {
					return currentOrgId;
				},
				scopeSet: { kind: 'organization' },
				affordanceForFeatureAction: () => ({ allowed: true, visible: true })
			});
			let respond!: (response: Response) => void;
			vi.stubGlobal('fetch', () => new Promise<Response>((resolve) => (respond = resolve)));
			const feedback = vi.spyOn(toastStore, 'error');
			const pending = ctx.handleRemoveDeprecatedStep(target.id);

			const fresh = makeOnboarding({
				id: 'fresh-packet',
				steps: [makeStep({ id: 'fresh-step', onboardingId: 'fresh-packet' })]
			});
			if (change === 'disposed') ctx.dispose();
			else if (change === 'changed-organization') currentOrgId = 'org-2';
			else {
				onboardingStore.load([], 'org-2');
				onboardingStore.load([fresh], 'org-1');
			}
			respond(new Response('{}', { status: 503 }));
			await pending;

			expect(feedback).not.toHaveBeenCalled();
			expect(onboardingStore.items).toEqual(
				change === 'reloaded-organization' ? [fresh] : [makeOnboarding({ steps: [target] })]
			);
		}
	);
});

describe('Onboarding Personnel creation result', () => {
	it('does not show a late save failure after its page context is disposed', async () => {
		onboardingStore.load([makeOnboarding({ steps: [makeStep()] })], 'org-1');
		const ctx = new OnboardingPageContext({ open: vi.fn() } as never, makeOrgContext());
		let respond!: (response: Response) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn(
				() =>
					new Promise<Response>((resolve) => {
						respond = resolve;
					})
			)
		);
		const feedback = vi.spyOn(toastStore, 'error');
		const pending = ctx.handleToggleCheckbox(makeStep());
		ctx.dispose();
		respond(new Response('{}', { status: 503 }));
		await pending;
		expect(feedback).not.toHaveBeenCalled();
	});
	it('rejects an unconfirmed old-Organization create without adding it to the new roster', async () => {
		personnelRosterHydration.load([], 'org-a');
		let finishRequest!: (response: Response) => void;
		const response = new Promise<Response>((resolve) => {
			finishRequest = resolve;
		});
		vi.stubGlobal('fetch', () => response);
		const ctx = new OnboardingPageContext({ open: vi.fn() } as never, createTestOrgContext({ orgId: 'org-a' }));
		const data = {
			rank: 'SPC',
			lastName: 'Synthetic',
			firstName: 'OldOrg',
			mos: '',
			clinicRole: '',
			groupId: null,
			groupName: ''
		};
		const pending = ctx.handleAddPerson(data);
		personnelRosterHydration.load([], 'org-b');
		finishRequest(Response.json({ ...data, id: 'created-in-a' }, { status: 201 }));
		await expect(pending).rejects.toThrow();
		expect(personnelRosterHydration.orgId).toBe('org-b');
		expect(personnelRosterHydration.items).toEqual([]);
	});
});

describe('OnboardingPageContext policy affordances', () => {
	it('allows an Onboarding-only operator to start workflows without offering Personnel creation', () => {
		const onboardingOnly = new OnboardingPageContext(
			{ open: vi.fn() } as never,
			makeOrgContext({ ...NONE_TEST_CAPABILITY_MAP, onboarding: 'operate' })
		);
		expect(onboardingOnly.canManageWorkflows).toBe(true);
		expect(onboardingOnly.canAddPerson).toBe(false);

		const personnelAdmin = new OnboardingPageContext(
			{ open: vi.fn() } as never,
			createTestOrgContext({
				orgId: 'org-1',
				userRole: 'member',
				capabilityMap: { ...NONE_TEST_CAPABILITY_MAP, onboarding: 'operate', personnel: 'configure' },
				scopeSet: { kind: 'organization' }
			})
		);
		expect(personnelAdmin.canAddPerson).toBe(true);
	});

	it('offers the shared creation form to an Alpha Personnel configurator', () => {
		const ctx = new OnboardingPageContext(
			{ open: vi.fn() } as never,
			createTestOrgContext({
				userRole: 'member',
				capabilityMap: { ...NONE_TEST_CAPABILITY_MAP, onboarding: 'configure', personnel: 'configure' },
				scopeSet: { kind: 'groups', groupIds: ['alpha'] }
			})
		);
		expect(ctx.canAddPerson).toBe(true);
	});

	it('uses advisory Onboarding policy decisions instead of legacy permission flags', () => {
		const ctx = new OnboardingPageContext({ open: vi.fn() } as never, makeOrgContext());

		expect(ctx.canViewOnboarding).toBe(true);
		expect(ctx.canManageWorkflows).toBe(true);
		expect(ctx.canManageConfig).toBe(false);
	});

	it('requires Organization scope for the configuration navigation without borrowing other lanes', () => {
		for (const scopeSet of [
			{ kind: 'organization' },
			{ kind: 'groups', groupIds: ['g-1'] },
			{ kind: 'groups', groupIds: [] }
		] satisfies ScopeSet[]) {
			const context = new OnboardingPageContext(
				{ open: vi.fn() } as never,
				createTestOrgContext({
					orgId: 'org-1',
					userRole: 'member',
					capabilityMap: { ...NONE_TEST_CAPABILITY_MAP, onboarding: 'configure' },
					scopeSet
				})
			);
			expect(context.canManageConfig).toBe(scopeSet.kind === 'organization');
			expect(context.canViewOnboarding).toBe(true);
		}
	});

	it('checks per-personnel scope for onboarding record actions', () => {
		personnelRosterHydration.load(
			[
				{
					id: 'p-1',
					rank: 'SGT',
					firstName: 'Ada',
					lastName: 'Lovelace',
					mos: '',
					clinicRole: '',
					groupId: 'g-1',
					groupName: 'Alpha'
				},
				{
					id: 'p-2',
					rank: 'SGT',
					firstName: 'Grace',
					lastName: 'Hopper',
					mos: '',
					clinicRole: '',
					groupId: 'g-2',
					groupName: 'Bravo'
				}
			],
			'org-1'
		);
		const ctx = new OnboardingPageContext({ open: vi.fn() } as never, makeOrgContext());

		expect(ctx.canManageOnboarding(makeOnboarding({ personnelId: 'p-1' }))).toBe(true);
		expect(ctx.canManageOnboarding(makeOnboarding({ personnelId: 'p-2' }))).toBe(false);
	});
});

describe('OnboardingPageContext onboarding actions', () => {
	it('returns success only for a confirmed current-Organization packet', async () => {
		onboardingStore.load([], 'org-1');
		const start = vi
			.spyOn(onboardingStore, 'startOnboarding')
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce(makeOnboarding());
		const ctx = new OnboardingPageContext({} as never, makeOrgContext());

		await expect(ctx.handleStartOnboarding('p-1', '2026-03-15', 'tpl-1')).resolves.toBe(false);
		await expect(ctx.handleStartOnboarding('p-1', '2026-03-15', 'tpl-1')).resolves.toBe(true);

		expect(start).toHaveBeenLastCalledWith('p-1', '2026-03-15', 'tpl-1');
	});
});

// ── getProgress ────────────────────────────────────────────────

describe('getProgress', () => {
	it('returns 0/0 when there are no steps', () => {
		const ob = makeOnboarding({ steps: [] });
		expect(getProgress(ob)).toEqual({ completed: 0, total: 0 });
	});

	it('excludes inactive steps from count', () => {
		const inactiveStep = makeStep({ id: 's-inactive', active: false, completed: true });
		const ob = makeOnboarding({ steps: [inactiveStep] });
		expect(getProgress(ob)).toEqual({ completed: 0, total: 0 });
	});

	it('counts a completed checkbox step', () => {
		const step = makeStep({ stepType: 'checkbox', completed: true });
		const ob = makeOnboarding({ steps: [step] });
		expect(getProgress(ob)).toEqual({ completed: 1, total: 1 });
	});

	it('counts an incomplete checkbox step', () => {
		const step = makeStep({ stepType: 'checkbox', completed: false });
		const ob = makeOnboarding({ steps: [step] });
		expect(getProgress(ob)).toEqual({ completed: 0, total: 1 });
	});

	it('counts paperwork as complete when completed=true', () => {
		const step = makeStep({
			id: 's-paper',
			stepType: 'paperwork',
			stages: ['Draft', 'Signed', 'Filed'],
			currentStage: 'Filed',
			completed: true
		});
		const ob = makeOnboarding({ steps: [step] });
		expect(getProgress(ob)).toEqual({ completed: 1, total: 1 });
	});

	it('counts paperwork as incomplete when completed=false', () => {
		const step = makeStep({
			id: 's-paper',
			stepType: 'paperwork',
			stages: ['Draft', 'Signed', 'Filed'],
			currentStage: 'Draft',
			completed: false
		});
		const ob = makeOnboarding({ steps: [step] });
		expect(getProgress(ob)).toEqual({ completed: 0, total: 1 });
	});

	it('counts training step as complete when completed=true (server-derived)', () => {
		const trainingStep = makeStep({
			id: 's-train',
			stepType: 'training',
			trainingTypeId: 'tt-1',
			completed: true
		});
		const ob = makeOnboarding({ steps: [trainingStep] });
		expect(getProgress(ob)).toEqual({ completed: 1, total: 1 });
	});

	it('handles mixed step types with mixed completion', () => {
		const steps = [
			makeStep({ id: 's1', stepType: 'checkbox', completed: true }),
			makeStep({ id: 's2', stepType: 'paperwork', completed: false }),
			makeStep({ id: 's3', stepType: 'training', trainingTypeId: 'tt-1', completed: true }),
			makeStep({ id: 's4', stepType: 'checkbox', completed: false, active: false })
		];
		const ob = makeOnboarding({ steps });
		expect(getProgress(ob)).toEqual({ completed: 2, total: 3 });
	});
});

// ── formatTimestamp ────────────────────────────────────────────

describe('formatTimestamp', () => {
	it('formats a valid ISO string to readable format', () => {
		const result = formatTimestamp('2026-01-15T14:30:00.000Z');
		expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2} at \d{1,2}:\d{2} (AM|PM)$/);
	});
});
