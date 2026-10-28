import type { SetupFlow } from '$features/organization';

export type SetupFlowSource = ReturnType<ConstructorParameters<typeof SetupFlow>[0]>;
type SetupFacts = Awaited<SetupFlowSource['setupFacts']>;

const ready = (value: number) => ({ status: 'ready', value }) as const;

export function unitFacts(overrides: Partial<SetupFacts> = {}): SetupFacts {
	return {
		branch: 'army',
		groups: ready(0),
		activeRanks: ready(30),
		activePeople: ready(0),
		statusTypes: ready(0),
		assignmentTypes: ready(0),
		trainingTypes: ready(0),
		criticalTasks: ready(0),
		evaluations: ready(0),
		onboardingTemplates: ready(0),
		events: ready(0),
		taskings: ready(0),
		members: ready(1),
		pendingInvitations: ready(0),
		lossWarningWindowDays: ready(90),
		...overrides
	};
}

export function stepSource(
	stepKey: NonNullable<SetupFlowSource['stepKey']>,
	setupFacts: Promise<SetupFacts> = Promise.resolve(unitFacts())
): SetupFlowSource {
	return {
		orgUrlSegment: 'alpha',
		disabledFeatures: [],
		setupState: { branch: 'army', answers: {}, finishedAt: null, prompts: {} },
		setupFacts,
		stepKey,
		isOwner: true,
		navigating: false
	};
}

/** The setup answer endpoint, replying with the step recorded. */
export function answerEndpoint() {
	return async (_input: RequestInfo | URL, init?: RequestInit) => {
		const { step, answer } = JSON.parse(String(init?.body));
		const state = { branch: 'army', answers: { [step]: answer }, finishedAt: null, prompts: {} };
		return new Response(JSON.stringify(state), { status: 200, headers: { 'Content-Type': 'application/json' } });
	};
}
