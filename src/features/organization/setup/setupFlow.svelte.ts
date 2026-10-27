import { createContext } from 'svelte';
import type { FeatureKey } from '$lib/access/featureSwitches';
import { SETUP_STEPS, type SetupFactKey, type SetupFacts, type SetupStep, type SetupStepKey } from './registry';
import { buildSetupModel, deriveSetupStepState, type SetupStepState } from './model';
import { parseOrganizationSetup, type OrganizationSetup, type SetupAnswer } from './state';

export interface SetupFlowSource {
	orgUrlSegment: string;
	disabledFeatures: readonly FeatureKey[];
	setupState: OrganizationSetup;
	setupFacts: Promise<SetupFacts>;
	/** The open step, or `null` on the Done page. */
	stepKey: SetupStepKey | null;
}

/** Runs before Continue moves on. A rejection keeps the owner on the step and shows its message. */
export type SetupStepSave = () => Promise<void>;

export interface SetupRailStep {
	key: SetupStepKey;
	slug: string;
	group: SetupStep['group'];
	title: string;
	pitch: string;
	/** `null` while the unit's facts load. */
	state: SetupStepState | null;
	loadErrors: { source: SetupFactKey; message: string }[];
}

export const SETUP_GROUP_LABELS: Record<SetupStep['group'], string> = {
	unit: 'Your unit',
	features: 'Features',
	team: 'Team'
};

export const SETUP_FACT_LABELS: Record<SetupFactKey, string> = {
	groups: 'Groups',
	activeRanks: 'Ranks',
	activePeople: 'People',
	statusTypes: 'Status types',
	assignmentTypes: 'Assignment types',
	trainingTypes: 'Training types',
	criticalTasks: 'Critical task lists',
	evaluations: 'Rating scheme entries',
	onboardingTemplates: 'Onboarding templates',
	events: 'Events',
	taskings: 'Taskings',
	members: 'Members',
	pendingInvitations: 'Pending invitations',
	lossWarningWindowDays: 'Loss warning window'
};

function failedFacts(branch: SetupFacts['branch'], message: string): SetupFacts {
	const error = { status: 'error', message } as const;
	return {
		branch,
		...(Object.fromEntries(Object.keys(SETUP_FACT_LABELS).map((key) => [key, error])) as Omit<SetupFacts, 'branch'>)
	};
}

function messageOf(cause: unknown) {
	return cause instanceof Error && cause.message ? cause.message : 'Try again.';
}

/**
 * The setup layout's client state. Every write and the navigation after it belong to the visit that started them;
 * once the owner navigates anywhere, a late response changes nothing.
 */
export class SetupFlow {
	#source: () => SetupFlowSource;
	#navigate: (href: string) => Promise<void>;
	#visit = 0;

	state = $derived.by(() => this.#source().setupState);
	facts = $state<SetupFacts | null>(null);
	pending = $state(false);
	error = $state<string | null>(null);

	model = $derived.by(() => {
		if (!this.facts) return null;
		return buildSetupModel({ state: this.state, facts: this.facts, disabledFeatures: this.#source().disabledFeatures });
	});

	rail = $derived<SetupRailStep[]>(
		this.model?.steps ??
			SETUP_STEPS.map(({ key, slug, group, title, pitch }) => ({
				key,
				slug,
				group,
				title,
				pitch,
				state: null,
				loadErrors: []
			}))
	);

	stepKey = $derived.by(() => this.#source().stepKey);
	position = $derived(this.stepKey ? SETUP_STEPS.findIndex((step) => step.key === this.stepKey) : -1);
	current = $derived(this.position >= 0 ? this.rail[this.position] : null);
	previous = $derived(this.position > 0 ? this.rail[this.position - 1] : null);
	next = $derived(this.position >= 0 ? (this.rail[this.position + 1] ?? null) : null);

	constructor(source: () => SetupFlowSource, navigate: (href: string) => Promise<void>) {
		this.#source = source;
		this.#navigate = navigate;
		$effect(() => {
			const { setupFacts, setupState } = source();
			let live = true;
			setupFacts.then(
				(facts) => live && (this.facts = facts),
				(cause) => live && (this.facts = failedFacts(setupState.branch, messageOf(cause)))
			);
			return () => (live = false);
		});
	}

	get dashboardHref() {
		return `/org/${this.#source().orgUrlSegment}`;
	}

	href(slug: string) {
		return `/org/${this.#source().orgUrlSegment}/setup/${slug}`;
	}

	/** Call when any navigation starts. Work begun on the page being left no longer owns the view. */
	leave() {
		this.#visit++;
		this.pending = false;
		this.error = null;
	}

	async answer(step: SetupStepKey, answer: SetupAnswer | null) {
		const visit = this.#visit;
		const next = await this.#post('answer', { step, answer });
		if (visit === this.#visit) this.state = next;
	}

	/** Saves the open step, by default recording it reviewed, then opens the next step or Done. */
	continue(save?: SetupStepSave) {
		const step = this.current;
		if (!step) return Promise.resolve();
		const target = this.href(this.next?.slug ?? 'done');
		return this.#run(async (stillHere) => {
			await (save ?? (() => this.#markReviewed(step.key, stillHere)))();
			if (stillHere()) await this.#navigate(target);
		});
	}

	finish() {
		const target = this.dashboardHref;
		return this.#run(async (stillHere) => {
			const next = await this.#post('finish', {});
			if (!stillHere()) return;
			this.state = next;
			await this.#navigate(target);
		});
	}

	async #run(work: (stillHere: () => boolean) => Promise<void>) {
		if (this.pending) return;
		const visit = this.#visit;
		const stillHere = () => visit === this.#visit;
		this.pending = true;
		this.error = null;
		try {
			await work(stillHere);
		} catch (cause) {
			if (stillHere()) this.error = messageOf(cause);
		} finally {
			if (stillHere()) this.pending = false;
		}
	}

	async #markReviewed(key: SetupStepKey, stillHere: () => boolean) {
		const { setupFacts, disabledFeatures } = this.#source();
		const facts = await setupFacts.catch(() => null);
		if (!stillHere()) return;
		const entry = SETUP_STEPS.find((step) => step.key === key)!;
		const state = facts
			? deriveSetupStepState(entry, this.state, facts, disabledFeatures)
			: this.state.answers[key] === 'reviewed'
				? 'done'
				: 'notAnswered';
		if (state === 'done' || state === 'off') return;
		await this.answer(key, 'reviewed');
	}

	async #post(path: 'answer' | 'finish', body: Record<string, unknown>): Promise<OrganizationSetup> {
		const response = await fetch(`/org/${this.#source().orgUrlSegment}/api/organization/setup/${path}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		const payload: unknown = await response.json().catch(() => null);
		if (!response.ok) {
			const message = (payload as { message?: unknown } | null)?.message;
			throw new Error(typeof message === 'string' ? message : 'Try again.');
		}
		return parseOrganizationSetup(payload);
	}
}

export const [getSetupFlow, setSetupFlow] = createContext<SetupFlow>();
