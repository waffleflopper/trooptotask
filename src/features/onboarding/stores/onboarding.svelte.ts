/**
 * Onboarding store — active and completed onboarding records for the org.
 *
 * Extended methods (all call server API routes):
 * - `startOnboarding(personnelId, startedAt, templateId?)` — creates a new onboarding from a template
 * - `toggleCheckbox(stepId, completed)` — marks a step complete/incomplete
 * - `advanceStage(stepId, stageName)` — advances a multi-stage step (e.g., training steps)
 * - `addNote(stepId, text)` — appends a timestamped note to a step
 * - `resync(onboardingId)` — reconciles steps when the template was edited after start
 * - `switchTemplate(onboardingId, newTemplateId)` — reassigns to a different template
 * - `cancelOnboarding(id)` / `completeOnboarding(id)` — lifecycle transitions
 *
 * `activeList` is a derived getter filtered to `status === 'in_progress'`.
 * Loaded by the onboarding page and dashboard page load functions.
 */
import { defineStore } from '$lib/stores/core';
import type { Store, StoreInternals } from '$lib/stores/core';
import { formatToday } from '$lib/utils/dates';
import type { PersonnelOnboarding, OnboardingStepProgress } from '../onboarding.types';

interface OnboardingExtensions extends Record<string, unknown> {
	readonly activeList: PersonnelOnboarding[];
	readonly organizationVersion: number;
	enterOrganization: (orgId: string) => void;
	invalidatePendingRequests: () => void;
	load: (onboardings: PersonnelOnboarding[], orgId: string) => void;
	getByPersonnelId: (personnelId: string) => PersonnelOnboarding | undefined;
	getById: (id: string) => PersonnelOnboarding | undefined;
	startOnboarding: (
		personnelId: string,
		startedAt: string,
		templateId: string | null
	) => Promise<PersonnelOnboarding | null>;
	toggleCheckbox: (stepId: string, completed: boolean) => Promise<boolean>;
	advanceStage: (stepId: string, stageName: string) => Promise<boolean>;
	addNote: (stepId: string, text: string) => Promise<boolean>;
	removeDeprecatedStep: (stepId: string) => Promise<boolean>;
	resync: (onboardingId: string) => Promise<{ success: boolean; error?: string }>;
	switchTemplate: (onboardingId: string, newTemplateId: string) => Promise<{ success: boolean; error?: string }>;
	assignTemplate: (onboardingId: string, templateId: string) => Promise<{ success: boolean; error?: string }>;
	cancelOnboarding: (id: string) => Promise<boolean>;
	completeOnboarding: (id: string) => Promise<boolean>;
}

function enhance(
	base: Store<PersonnelOnboarding>,
	internals: StoreInternals<PersonnelOnboarding>
): OnboardingExtensions {
	let organizationVersion = 0;
	type StepMutation = {
		onboardingId: string;
		stepId: string;
		mutationId: string;
		update: (steps: OnboardingStepProgress[]) => OnboardingStepProgress[];
		stage: boolean;
		superseded: boolean;
	};
	let pendingStepMutations: StepMutation[] = [];

	function load(onboardings: PersonnelOnboarding[], orgId: string) {
		if (orgId !== internals.orgId()) {
			organizationVersion++;
			pendingStepMutations = [];
		}
		base.load(onboardings, orgId);
		rebaseStepMutations();
	}
	function getDisplay(): PersonnelOnboarding[] {
		return internals.snapshot();
	}

	function apiUrl(path: string): string {
		return `/org/${internals.orgId()}/api/${path}`;
	}

	function rebaseStepMutations() {
		if (!pendingStepMutations.length) return;
		// Rebuild existing log entries from saved state so one pending step cannot
		// replace another step's confirmed work with an earlier checklist snapshot.
		for (const mutation of pendingStepMutations) internals.log.resolve(mutation.mutationId);
		const stepsByPacket = new Map(getDisplay().map((packet) => [packet.id, packet.steps]));
		for (const mutation of pendingStepMutations) {
			const steps = stepsByPacket.get(mutation.onboardingId);
			const updatedSteps = steps && !mutation.superseded ? mutation.update(steps) : steps;
			if (updatedSteps) stepsByPacket.set(mutation.onboardingId, updatedSteps);
			internals.log.push({
				type: 'update',
				mutationId: mutation.mutationId,
				targetId: mutation.onboardingId,
				data: updatedSteps ? { steps: updatedSteps } : {}
			});
		}
	}

	function applyStepMutation(stepId: string, update: StepMutation['update'], stage = false) {
		const onboarding = getDisplay().find((o) => o.steps.some((s) => s.id === stepId));
		if (!onboarding) return null;

		const mutation: StepMutation = {
			onboardingId: onboarding.id,
			stepId,
			mutationId: crypto.randomUUID(),
			update,
			stage,
			superseded: false
		};
		pendingStepMutations.push(mutation);
		rebaseStepMutations();
		return mutation;
	}

	function applyStepUpdate(
		stepId: string,
		updater: (step: OnboardingStepProgress) => OnboardingStepProgress,
		stage = false
	) {
		return applyStepMutation(
			stepId,
			(steps) => steps.map((step) => (step.id === stepId ? updater(step) : step)),
			stage
		);
	}

	function resolveStepMutation(mutation: StepMutation) {
		internals.log.resolve(mutation.mutationId);
		pendingStepMutations = pendingStepMutations.filter((pending) => pending !== mutation);
		rebaseStepMutations();
	}

	function commitStepUpdate(
		mutation: StepMutation,
		update: (steps: OnboardingStepProgress[]) => OnboardingStepProgress[]
	) {
		if (!mutation.superseded) {
			internals.serverState.set(
				internals.serverState
					.getSnapshot()
					.map((o) => (o.id === mutation.onboardingId ? { ...o, steps: update(o.steps) } : o))
			);
			if (mutation.stage) {
				// Only a confirmed newer stage supersedes older selections. Failed
				// requests still roll back to saved state and leave a usable retry.
				for (const pending of pendingStepMutations) {
					if (pending === mutation) break;
					if (pending.stage && pending.stepId === mutation.stepId) pending.superseded = true;
				}
			}
		}
		resolveStepMutation(mutation);
	}

	async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
		const text = await res.text();
		try {
			const parsed = JSON.parse(text);
			if (parsed.message) return parsed.message;
		} catch {
			// ignore parse errors
		}
		return fallback;
	}

	return {
		get activeList() {
			return internals.replay().filter((o) => o.status === 'in_progress');
		},

		get organizationVersion() {
			return organizationVersion;
		},

		enterOrganization(orgId: string) {
			if (orgId !== internals.orgId()) load([], orgId);
		},

		invalidatePendingRequests() {
			organizationVersion++;
			pendingStepMutations = [];
			internals.log.clear();
		},

		load,

		getByPersonnelId(personnelId: string) {
			return getDisplay().find((o) => o.personnelId === personnelId && o.status === 'in_progress');
		},

		getById(id: string) {
			return getDisplay().find((o) => o.id === id);
		},

		async startOnboarding(
			personnelId: string,
			startedAt: string,
			templateId: string | null
		): Promise<PersonnelOnboarding | null> {
			const version = organizationVersion;
			try {
				const res = await fetch(apiUrl('onboarding'), {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ personnelId, templateId, startedAt })
				});
				if (!res.ok) throw new Error('Failed to start onboarding');
				const newOnboarding = await res.json();
				if (version !== organizationVersion) return null;
				internals.serverState.set([...internals.serverState.getSnapshot(), newOnboarding]);
				return newOnboarding;
			} catch {
				return null;
			}
		},

		async toggleCheckbox(stepId: string, completed: boolean): Promise<boolean> {
			const version = organizationVersion;
			const mutation = applyStepUpdate(stepId, (s) => ({ ...s, completed }));
			if (!mutation) return false;

			try {
				const res = await fetch(apiUrl('onboarding-steps'), {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'toggleCheckbox', stepId, completed })
				});
				if (!res.ok) throw new Error('Failed to toggle checkbox');
				const result: Pick<OnboardingStepProgress, 'completed' | 'currentStage'> = await res.json();
				if (version !== organizationVersion) return false;
				commitStepUpdate(mutation, (steps) =>
					steps.map((step) =>
						step.id === stepId ? { ...step, completed: result.completed, currentStage: result.currentStage } : step
					)
				);
				return true;
			} catch {
				if (version !== organizationVersion) return false;
				resolveStepMutation(mutation);
				return false;
			}
		},

		async advanceStage(stepId: string, stageName: string): Promise<boolean> {
			const version = organizationVersion;
			const display = getDisplay();
			const onboarding = display.find((o) => o.steps.some((s) => s.id === stepId));
			if (!onboarding) return false;

			const step = onboarding.steps.find((s) => s.id === stepId)!;
			const stages = step.stages ?? [];
			const isLast = stageName === stages[stages.length - 1];

			const mutation = applyStepUpdate(stepId, (s) => ({ ...s, currentStage: stageName, completed: isLast }), true);
			if (!mutation) return false;

			try {
				const res = await fetch(apiUrl('onboarding-steps'), {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'advanceStage', stepId, stageName })
				});
				if (!res.ok) throw new Error('Failed to advance stage');
				const result: Pick<OnboardingStepProgress, 'completed' | 'currentStage'> = await res.json();
				if (version !== organizationVersion) return false;
				commitStepUpdate(mutation, (steps) =>
					steps.map((step) =>
						step.id === stepId ? { ...step, completed: result.completed, currentStage: result.currentStage } : step
					)
				);
				return true;
			} catch {
				if (version !== organizationVersion) return false;
				resolveStepMutation(mutation);
				return false;
			}
		},

		async addNote(stepId: string, text: string): Promise<boolean> {
			const version = organizationVersion;
			const display = getDisplay();
			const onboarding = display.find((o) => o.steps.some((s) => s.id === stepId));
			if (!onboarding) return false;

			// Optimistic: add a placeholder note client-side
			const placeholderNote = { text, timestamp: new Date().toISOString(), userId: '' };
			const mutation = applyStepUpdate(stepId, (s) => ({
				...s,
				notes: [placeholderNote, ...s.notes]
			}));
			if (!mutation) return false;

			try {
				const res = await fetch(apiUrl('onboarding-steps'), {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'addNote', stepId, text })
				});
				if (!res.ok) throw new Error('Failed to add note');

				// Server returns the authoritative notes array with real userId/timestamp
				const result = await res.json();
				if (version !== organizationVersion) return false;
				commitStepUpdate(mutation, (steps) =>
					steps.map((step) => (step.id === stepId ? { ...step, notes: result.notes } : step))
				);
				return true;
			} catch {
				if (version !== organizationVersion) return false;
				resolveStepMutation(mutation);
				return false;
			}
		},

		async removeDeprecatedStep(stepId: string): Promise<boolean> {
			const version = organizationVersion;
			const mutation = applyStepMutation(stepId, (steps) => steps.filter((step) => step.id !== stepId));
			if (!mutation) return false;

			try {
				const res = await fetch(apiUrl('onboarding-steps'), {
					method: 'DELETE',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id: stepId })
				});
				if (!res.ok) throw new Error('Failed to remove step');
				if (version !== organizationVersion) return false;
				commitStepUpdate(mutation, (steps) => steps.filter((step) => step.id !== stepId));
				return true;
			} catch {
				if (version !== organizationVersion) return false;
				resolveStepMutation(mutation);
				return false;
			}
		},

		async resync(onboardingId: string): Promise<{ success: boolean; error?: string }> {
			const version = organizationVersion;
			try {
				const res = await fetch(apiUrl('onboarding-resync'), {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ onboardingId })
				});

				if (!res.ok) {
					return { success: false, error: await parseErrorMessage(res, 'Failed to re-sync onboarding') };
				}

				const result = await res.json();
				if (version !== organizationVersion) return { success: false };
				internals.serverState.set(
					internals.serverState
						.getSnapshot()
						.map((o) => (o.id === onboardingId ? { ...o, templateId: result.templateId, steps: result.steps } : o))
				);
				return { success: true };
			} catch {
				return { success: false, error: 'Failed to re-sync onboarding' };
			}
		},

		async switchTemplate(onboardingId: string, newTemplateId: string): Promise<{ success: boolean; error?: string }> {
			const version = organizationVersion;
			try {
				const res = await fetch(apiUrl('onboarding-resync'), {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ onboardingId, newTemplateId })
				});

				if (!res.ok) {
					return { success: false, error: await parseErrorMessage(res, 'Failed to switch template') };
				}

				const result = await res.json();
				if (version !== organizationVersion) return { success: false };
				internals.serverState.set(
					internals.serverState
						.getSnapshot()
						.map((o) => (o.id === onboardingId ? { ...o, templateId: result.templateId, steps: result.steps } : o))
				);
				return { success: true };
			} catch {
				return { success: false, error: 'Failed to switch template' };
			}
		},

		async assignTemplate(onboardingId: string, templateId: string): Promise<{ success: boolean; error?: string }> {
			const version = organizationVersion;
			try {
				const res = await fetch(apiUrl('onboarding-resync'), {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ onboardingId, newTemplateId: templateId })
				});
				if (!res.ok) {
					return { success: false, error: await parseErrorMessage(res, 'Failed to assign template') };
				}
				const result = await res.json();
				if (version !== organizationVersion) return { success: false };
				internals.serverState.set(
					internals.serverState
						.getSnapshot()
						.map((o) => (o.id === onboardingId ? { ...o, templateId: result.templateId, steps: result.steps } : o))
				);
				return { success: true };
			} catch {
				return { success: false, error: 'Failed to assign template' };
			}
		},

		async cancelOnboarding(id: string): Promise<boolean> {
			const version = organizationVersion;
			const display = getDisplay();
			const original = display.find((o) => o.id === id);
			if (!original) return false;

			const mutationId = crypto.randomUUID();
			internals.log.push({
				type: 'update',
				mutationId,
				targetId: id,
				data: { status: 'cancelled' } as Partial<PersonnelOnboarding>
			});

			try {
				const res = await fetch(apiUrl('onboarding'), {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id, status: 'cancelled' })
				});
				if (!res.ok) throw new Error('Failed to cancel onboarding');
				const result: Pick<PersonnelOnboarding, 'status' | 'cancelledAt' | 'completedAt'> = await res.json();
				if (version !== organizationVersion) return false;

				internals.serverState.set(
					internals.serverState
						.getSnapshot()
						.map((o) =>
							o.id === id
								? { ...o, status: result.status, cancelledAt: result.cancelledAt, completedAt: result.completedAt }
								: o
						)
				);
				internals.log.resolve(mutationId);
				return true;
			} catch {
				if (version !== organizationVersion) return false;
				internals.log.resolve(mutationId);
				return false;
			}
		},

		async completeOnboarding(id: string): Promise<boolean> {
			const version = organizationVersion;
			const display = getDisplay();
			const original = display.find((o) => o.id === id);
			if (!original) return false;

			const today = formatToday();
			const mutationId = crypto.randomUUID();
			internals.log.push({
				type: 'update',
				mutationId,
				targetId: id,
				data: { status: 'completed', completedAt: today } as Partial<PersonnelOnboarding>
			});

			try {
				const res = await fetch(apiUrl('onboarding'), {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id, status: 'completed', completedAt: today })
				});
				if (!res.ok) throw new Error('Failed to complete onboarding');
				const result: Pick<PersonnelOnboarding, 'status' | 'cancelledAt' | 'completedAt'> = await res.json();
				if (version !== organizationVersion) return false;

				internals.serverState.set(
					internals.serverState
						.getSnapshot()
						.map((o) =>
							o.id === id
								? { ...o, status: result.status, completedAt: result.completedAt, cancelledAt: result.cancelledAt }
								: o
						)
				);
				internals.log.resolve(mutationId);
				return true;
			} catch {
				if (version !== organizationVersion) return false;
				internals.log.resolve(mutationId);
				return false;
			}
		}
	};
}

export const onboardingStore = defineStore<PersonnelOnboarding, OnboardingExtensions>(
	{ table: 'personnel_onboarding' },
	enhance
);
