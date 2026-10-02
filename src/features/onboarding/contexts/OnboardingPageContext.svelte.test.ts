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

import {
	OnboardingPageContext,
	getProgress,
	isStepDeprecated,
	isTrainingStepComplete,
	getPaperworkStageIndex,
	formatTimestamp
} from './OnboardingPageContext.svelte';
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

describe('Onboarding Personnel creation result', () => {
	it('keeps a failed note draft and clears it only after a confirmed retry', async () => {
		onboardingStore.load([makeOnboarding({ steps: [makeStep()] })], 'org-1');
		const ctx = new OnboardingPageContext({ open: vi.fn() } as never, makeOrgContext());
		ctx.noteInputs['step-1'] = ' Retained note ';
		const save = vi.spyOn(onboardingStore, 'addNote').mockResolvedValueOnce(false).mockResolvedValueOnce(true);
		const feedback = vi.spyOn(toastStore, 'error');
		await ctx.handleAddNote(makeStep());
		expect(ctx.noteInputs['step-1']).toBe(' Retained note ');
		expect(feedback).toHaveBeenCalledWith(expect.any(String));
		await ctx.handleAddNote(makeStep());
		expect(ctx.noteInputs['step-1']).toBe('');
		expect(save.mock.calls).toEqual([
			['step-1', 'Retained note'],
			['step-1', 'Retained note']
		]);
	});

	it('keeps a newer note draft when an earlier submission succeeds', async () => {
		onboardingStore.load([makeOnboarding({ steps: [makeStep()] })], 'org-1');
		const ctx = new OnboardingPageContext({ open: vi.fn() } as never, makeOrgContext());
		ctx.noteInputs['step-1'] = 'First note';
		let confirm!: (saved: boolean) => void;
		vi.spyOn(onboardingStore, 'addNote').mockImplementation(
			() =>
				new Promise<boolean>((resolve) => {
					confirm = resolve;
				})
		);
		const pending = ctx.handleAddNote(makeStep());
		ctx.noteInputs['step-1'] = 'Next note';
		confirm(true);
		await pending;
		expect(ctx.noteInputs['step-1']).toBe('Next note');
	});

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

// ── isStepDeprecated ──────────────────────────────────────────

describe('isStepDeprecated', () => {
	it('returns false when templateStepId is null (legacy step)', () => {
		const step = makeStep({ templateStepId: null });
		expect(isStepDeprecated(step, [])).toBe(false);
	});

	it('returns false when templateStepId exists in known steps', () => {
		const step = makeStep({ templateStepId: 'tpl-step-1' });
		expect(isStepDeprecated(step, ['tpl-step-1', 'tpl-step-2'])).toBe(false);
	});

	it('returns true when templateStepId no longer exists in any template', () => {
		const step = makeStep({ templateStepId: 'removed-step' });
		expect(isStepDeprecated(step, ['tpl-step-1'])).toBe(true);
	});

	it('returns true when known step IDs list is empty', () => {
		const step = makeStep({ templateStepId: 'tpl-step-1' });
		expect(isStepDeprecated(step, [])).toBe(true);
	});
});

// ── isTrainingStepComplete ─────────────────────────────────────

describe('isTrainingStepComplete', () => {
	it('returns step.completed (server-derived)', () => {
		const incomplete = makeStep({ stepType: 'training', trainingTypeId: 'tt-1', completed: false });
		expect(isTrainingStepComplete(incomplete)).toBe(false);

		const complete = makeStep({ stepType: 'training', trainingTypeId: 'tt-1', completed: true });
		expect(isTrainingStepComplete(complete)).toBe(true);
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

// ── getPaperworkStageIndex ─────────────────────────────────────

describe('getPaperworkStageIndex', () => {
	it('returns 0 when currentStage is null', () => {
		const step = makeStep({ stages: ['A', 'B', 'C'], currentStage: null });
		expect(getPaperworkStageIndex(step)).toBe(0);
	});

	it('returns 0 when stages is null', () => {
		const step = makeStep({ stages: null, currentStage: null });
		expect(getPaperworkStageIndex(step)).toBe(0);
	});

	it('returns correct index for current stage', () => {
		const step = makeStep({ stages: ['Draft', 'Signed', 'Filed'], currentStage: 'Signed' });
		expect(getPaperworkStageIndex(step)).toBe(1);
	});

	it('returns 0 when currentStage not found in stages', () => {
		const step = makeStep({ stages: ['A', 'B'], currentStage: 'Unknown' });
		expect(getPaperworkStageIndex(step)).toBe(0);
	});
});

// ── formatTimestamp ────────────────────────────────────────────

describe('formatTimestamp', () => {
	it('formats a valid ISO string to readable format', () => {
		const result = formatTimestamp('2026-01-15T14:30:00.000Z');
		expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2} at \d{1,2}:\d{2} (AM|PM)$/);
	});
});
