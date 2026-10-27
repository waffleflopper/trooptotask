import { createContext } from 'svelte';
import { invalidate } from '$app/navigation';
import type { FeatureKey } from '$lib/access/featureSwitches';
import { SETUP_STEPS, type SetupFactKey, type SetupFacts, type SetupStep, type SetupStepKey } from './registry';
import { buildSetupModel, deriveSetupStepState, type SetupStepState } from './model';
import type { OrganizationSetup, SetupAnswer } from './state';
import { postSetup, setupErrorMessage } from './setupClient';
import type { SetupBranch } from './branch';
import type { SetupStarterPackResult, SetupTrainingSuggestionsResult } from './featureStepSupport';
import { saveOrganizationSettings } from '../saveOrganizationSettings';

export interface SetupFlowSource {
	orgUrlSegment: string;
	isOwner: boolean;
	disabledFeatures: readonly FeatureKey[];
	setupState: OrganizationSetup;
	setupFacts: Promise<SetupFacts>;
	/** The open step, or `null` on the Done page. */
	stepKey: SetupStepKey | null;
	/** A navigation has started and its page has not arrived yet. */
	navigating: boolean;
}

/** Runs before Continue moves on. A rejection keeps the owner on the step and shows its message. */
export type SetupStepSave = () => Promise<void>;
export type SetupNavigate = (href: `/org/${string}`, options?: { invalidate?: string[] }) => Promise<void>;

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

/**
 * The setup layout's client state. Every write and the navigation after it belong to the visit that started them;
 * once the owner navigates anywhere, a late response changes nothing.
 */
export class SetupFlow {
	#source: () => SetupFlowSource;
	#navigate: SetupNavigate;
	#visit = 0;

	#loaded = $derived.by(() => this.#source().setupState);
	#loadedFacts = $derived.by(() => this.#source().setupFacts);
	/** The latest write's result. It outlives step changes and yields once the layout reloads newer state. */
	#saved = $state.raw<{ over: OrganizationSetup; state: OrganizationSetup } | null>(null);

	state = $derived(this.#saved?.over === this.#loaded ? this.#saved.state : this.#loaded);
	facts = $state<SetupFacts | null>(null);
	pending = $state(false);
	/** Continue and Finish start nothing while set. */
	busy = $derived.by(() => this.pending || this.#source().navigating);
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

	constructor(source: () => SetupFlowSource, navigate: SetupNavigate) {
		this.#source = source;
		this.#navigate = navigate;
		$effect(() => {
			let live = true;
			this.#loadedFacts.then(
				(facts) => live && (this.facts = facts),
				(cause) => live && (this.facts = failedFacts(this.#loaded.branch, setupErrorMessage(cause)))
			);
			return () => (live = false);
		});
	}

	get dashboardHref(): `/org/${string}` {
		return `/org/${this.#source().orgUrlSegment}`;
	}

	href(slug: string): `/org/${string}` {
		return `/org/${this.#source().orgUrlSegment}/setup/${slug}`;
	}

	/**
	 * Call when any navigation starts. Work begun on the page being left no longer owns the view. Reopening the page
	 * already shown leaves nothing, so its step body and in-flight writes carry on.
	 */
	leave(from?: string, to?: string) {
		if (from !== undefined && from === to) return;
		this.#visit++;
		this.pending = false;
		this.error = null;
	}

	async answer(step: SetupStepKey, answer: SetupAnswer | null) {
		const visit = this.#visit;
		const next = await this.#post('answer', { step, answer });
		if (visit === this.#visit) this.#apply(next);
	}

	/**
	 * Saves the unit's branch; the server activates that service's built-in ranks first. Resolves `true` when the
	 * result was applied, `false` when the owner had already moved on.
	 */
	async saveBranch(branch: SetupBranch) {
		const visit = this.#visit;
		const next = await this.#post('branch', { branch });
		if (visit !== this.#visit) return false;
		this.#apply(next);
		return true;
	}

	/** A check for work that outlives one render: false once the owner navigates anywhere. */
	stillHere() {
		const visit = this.#visit;
		return () => visit === this.#visit;
	}

	/** Records `answer` unless the unit's data already makes the step Done or its feature is Off. */
	async answerUnlessSettled(key: SetupStepKey, answer: SetupAnswer) {
		const stillHere = this.stillHere();
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
		await this.answer(key, answer);
	}

	/** Saves the open step, by default recording it reviewed, then opens the next step or Done. */
	continue(save?: SetupStepSave) {
		const step = this.current;
		if (!step) return Promise.resolve();
		const target = this.href(this.next?.slug ?? 'done');
		return this.#run(async (stillHere) => {
			await (save ?? (() => this.answerUnlessSettled(step.key, 'reviewed')))();
			if (stillHere()) await this.#navigate(target);
		});
	}

	finish() {
		const target = this.dashboardHref;
		return this.#run(async (stillHere) => {
			const next = await this.#post('finish', {});
			if (!stillHere()) return;
			this.#apply(next);
			await this.#navigate(target, { invalidate: ['app:organization-setup'] });
		});
	}

	finishLater() {
		const target = this.dashboardHref;
		const isOwner = this.#source().isOwner;
		const { prompts, finishedAt } = this.#loaded;
		return this.#run(async (stillHere) => {
			if (isOwner && !finishedAt && !(prompts.setup && 'never' in prompts.setup)) {
				const next = await this.#post('prompt', { key: 'setup', choice: 'tomorrow' });
				if (!stillHere()) return;
				this.#apply(next);
			}
			if (stillHere()) await this.#navigate(target, { invalidate: ['app:organization-setup'] });
		});
	}

	isFeatureOff(feature: FeatureKey) {
		return this.#source().disabledFeatures.includes(feature);
	}

	/**
	 * Writes one feature switch through Settings › Features' operation, so the audit entry is the same, then reloads
	 * the switches. Resolves false when the owner has since navigated away.
	 */
	async switchFeature(feature: FeatureKey, on: boolean) {
		const visit = this.#visit;
		await saveOrganizationSettings(this.#source().orgUrlSegment, { featureSwitch: { feature, on } });
		// The switch is saved even if the owner moved on, so the app's feature switches reload either way.
		await Promise.all([invalidate('app:org-core'), invalidate('app:organization-setup')]);
		return visit === this.#visit;
	}

	/** Turns an off feature back on without leaving the step. */
	turnFeatureOn(feature: FeatureKey) {
		return this.#run(async () => {
			await this.switchFeature(feature, true);
		});
	}

	/** Resolves null when the owner has since navigated away. */
	async addTrainingSuggestions(branch: SetupBranch, suggestionIds: readonly string[]) {
		return this.#refreshAfter(
			this.#postJson<SetupTrainingSuggestionsResult>('training-types/suggestions', { branch, suggestionIds })
		);
	}

	/** Resolves null when the owner has since navigated away. */
	async applyFirstWeekOperations() {
		return this.#refreshAfter(
			this.#postJson<SetupStarterPackResult>('starter-configuration-packs/first-week-operations/apply', {})
		);
	}

	async #refreshAfter<T>(write: Promise<T>): Promise<T | null> {
		const visit = this.#visit;
		const result = await write;
		// New rows can make the step Done from data, which the rail reads from the reloaded facts, even after a move.
		await invalidate('app:organization-setup');
		return visit === this.#visit ? result : null;
	}

	async #postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
		const response = await fetch(`/org/${this.#source().orgUrlSegment}/api/${path}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		const payload: unknown = await response.json().catch(() => null);
		if (!response.ok) {
			const message = (payload as { message?: unknown } | null)?.message;
			throw new Error(typeof message === 'string' ? message : 'Try again.');
		}
		return payload as T;
	}

	#apply(state: OrganizationSetup) {
		this.#saved = { over: this.#loaded, state };
	}

	async #run(work: (stillHere: () => boolean) => Promise<void>) {
		if (this.busy) return;
		const visit = this.#visit;
		const stillHere = () => visit === this.#visit;
		this.pending = true;
		this.error = null;
		try {
			await work(stillHere);
		} catch (cause) {
			if (stillHere()) this.error = setupErrorMessage(cause);
		} finally {
			if (stillHere()) this.pending = false;
		}
	}

	#post(path: 'answer' | 'branch' | 'finish' | 'prompt', body: Record<string, unknown>): Promise<OrganizationSetup> {
		return postSetup(this.#source().orgUrlSegment, path, body);
	}
}

export const [getSetupFlow, setSetupFlow] = createContext<SetupFlow>();
