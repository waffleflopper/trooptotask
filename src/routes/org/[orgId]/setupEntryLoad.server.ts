import type { Cookies } from '@sveltejs/kit';
import {
	buildSetupModel,
	setupEntry,
	type SetupEntryData,
	type SetupInvitationProgress
} from '$features/organization/contracts';
import {
	createSupabaseOrganizationSetupPort,
	resolveOrganizationRouteIdentity
} from '$features/organization/index.server';
import type { DashboardPageSummaryData, DashboardWorkspaceResult } from '$features/dashboard/contracts';
import { buildLayoutRequest, type AdmittedOrganizationRequest } from '$lib/server/adapters/requestContexts.server';
import { keepStreamedRejectionObserved } from '$lib/server/adapters/streamedWorkspace';
import { viewerToday } from '$lib/server/viewerDay.server';
import { streamSetupFacts } from './setup/setupLoad.server';

interface SetupEntryRequest {
	locals: App.Locals;
	orgId: string;
	cookies: Pick<Cookies, 'get'>;
}

const entries = new WeakMap<App.Locals, Map<string, Promise<SetupEntryData | null>>>();

export function streamOrganizationSetupEntry(context: SetupEntryRequest): Promise<SetupEntryData | null> {
	let organizations = entries.get(context.locals);
	if (!organizations) {
		organizations = new Map();
		entries.set(context.locals, organizations);
	}
	let entry = organizations.get(context.orgId);
	if (!entry) {
		entry = keepStreamedRejectionObserved(readSetupEntry(context));
		organizations.set(context.orgId, entry);
	}
	return entry;
}

async function readSetupEntry({ locals, orgId, cookies }: SetupEntryRequest): Promise<SetupEntryData | null> {
	const request = await buildLayoutRequest(locals, orgId);
	if (request.auth.role !== 'owner') return null;
	const [state, identity] = await Promise.all([
		createSupabaseOrganizationSetupPort(request.supabase).read(request.auth.orgId),
		resolveOrganizationRouteIdentity(locals, orgId)
	]);
	if (!identity?.createdAt) throw new Error('Unable to load Organization creation date');
	const today = viewerToday(cookies);
	return {
		orgId: request.auth.orgId,
		state,
		today,
		entry: setupEntry({
			isOwner: true,
			state,
			disabledFeatures: request.disabledFeatures,
			organizationCreatedOn: identity.createdAt.slice(0, 10),
			today
		})
	};
}

export function streamSetupInvitationProgress({
	request,
	entry,
	workspace,
	summary
}: {
	request: AdmittedOrganizationRequest;
	entry: Promise<SetupEntryData | null>;
	workspace: Promise<DashboardWorkspaceResult>;
	summary: Promise<DashboardPageSummaryData>;
}) {
	return keepStreamedRejectionObserved<SetupInvitationProgress | null>(
		entry.then(async (data) => {
			if (request.auth.role !== 'owner' || data?.entry.prompt?.kind !== 'invitation') return null;
			const facts = await streamSetupFacts(request, {
				groups: async () => (await workspace).data.groups.length,
				// Review-only steps never use rank counts to decide whether they are done.
				activeRanks: async () => 0,
				activePeople: async () => (await workspace).data.personnel.length,
				statusTypes: async () => (await workspace).data.statusTypes.length,
				assignmentTypes: async () => (await workspace).data.assignmentTypes.length,
				trainingTypes: async () => (await workspace).data.trainingTypes.length,
				criticalTasks: async () => {
					if (request.disabledFeatures.includes('criticalTasks')) return 0;
					const value = (await summary).ictlSummary;
					if (!value) throw new Error('Critical Tasks summary unavailable');
					return Number(value.hasActiveTasks);
				},
				onboardingTemplates: async () => Number((await workspace).data.hasAnyOnboardingTemplate),
				lossWarningWindowDays: async () => (await workspace).data.lossWarningWindowDays,
				...(request.disabledFeatures.includes('eventsAndTaskings')
					? { events: async () => 0, taskings: async () => 0 }
					: {}),
				...(request.disabledFeatures.includes('evaluations') ? { evaluations: async () => 0 } : {})
			});
			const model = buildSetupModel({ state: data.state, facts, disabledFeatures: request.disabledFeatures });
			const completedSteps = model.steps.filter((step) => step.state === 'done');
			return {
				orgId: request.auth.orgId,
				done: completedSteps.length,
				total: model.total,
				completedSteps,
				loadErrors: model.steps.flatMap((step) => step.loadErrors)
			};
		})
	);
}
