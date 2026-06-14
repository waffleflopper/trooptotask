import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminContext } from './adminAdapter';
import {
	createPlatformFeedback,
	type PlatformFeedback,
	type PlatformFeedbackItem,
	type PlatformFeedbackMirror,
	type PlatformFeedbackMirrorInput,
	type PlatformFeedbackOrganizationContextStore,
	type PlatformFeedbackStatus,
	type PlatformFeedbackSubmissionCategory,
	type PlatformFeedbackSubmissionRecord,
	type PlatformFeedbackSubmissionStore,
	type PlatformFeedbackStore,
	type PlatformFeedbackStoreUpdateResult,
	type PlatformFeedbackUpdateInput
} from '$lib/server/core/useCases/platformFeedback';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination';
import { getAdminClient } from '$lib/server/supabase';
import { env } from '$env/dynamic/private';

const GITHUB_REPO = 'waffleflopper/trooptotask';

interface FeedbackRow {
	id: string;
	user_email: string;
	category: string;
	message: string;
	created_at: string;
	organization_name: string | null;
	page_url: string | null;
	status: PlatformFeedbackStatus;
	admin_notes: string | null;
}

interface FeedbackOrganizationMembershipRow {
	organizations:
		| {
				id: string;
				name: string;
				url_slug?: string | null;
		  }
		| {
				id: string;
				name: string;
				url_slug?: string | null;
		  }[]
		| null;
}

type SupabaseResponse<T> = {
	data: T | null;
	error: unknown;
};

type SupabaseQueryResult<T> = Promise<{ data: T[] | null; error: unknown }>;

interface SupabasePlatformFeedbackStore
	extends PlatformFeedbackStore, PlatformFeedbackOrganizationContextStore, PlatformFeedbackSubmissionStore {}

function formatSupabaseError(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === 'string') return error;
	if (error && typeof error === 'object') {
		const candidate = error as { message?: unknown; code?: unknown };
		const message = typeof candidate.message === 'string' ? candidate.message : JSON.stringify(error);
		return typeof candidate.code === 'string' ? `${message} (${candidate.code})` : message;
	}
	return String(error);
}

function assertSupabaseSuccess<T>(operation: string, response: SupabaseResponse<T>): void {
	if (response.error) {
		throw new Error(`${operation} failed: ${formatSupabaseError(response.error)}`);
	}
}

function mapFeedback(row: FeedbackRow): PlatformFeedbackItem {
	return {
		id: row.id,
		userEmail: row.user_email,
		category: row.category,
		message: row.message,
		createdAt: row.created_at,
		organizationName: row.organization_name,
		pageUrl: row.page_url,
		status: row.status,
		adminNotes: row.admin_notes
	};
}

const CATEGORY_LABELS: Record<PlatformFeedbackSubmissionCategory, string[]> = {
	bug: ['bug', 'user-feedback'],
	feature: ['enhancement', 'user-feedback'],
	general: ['user-feedback']
};

const CATEGORY_TITLES: Record<PlatformFeedbackSubmissionCategory, string> = {
	bug: 'Bug Report',
	feature: 'Feature Request',
	general: 'Feedback'
};

function createGitHubIssueBody(input: PlatformFeedbackMirrorInput): string {
	const categoryTitle = CATEGORY_TITLES[input.category];
	const bodyParts = ['', input.message, '', '---', `**Category:** ${input.category}`];

	if (input.pageSection) bodyParts.push(`**Section:** ${input.pageSection}`);
	if (input.pageUrl) bodyParts.push(`**Page:** ${input.pageUrl}`);
	if (input.organizationName) bodyParts.push(`**Organization:** ${input.organizationName}`);
	if (input.userEmail) bodyParts.push(`**Submitted by:** ${input.userEmail}`);
	bodyParts.push(`**Date:** ${new Date().toISOString()}`);

	return [`## ${categoryTitle}`, ...bodyParts].join('\n');
}

export function createSupabasePlatformFeedbackStore(supabase: SupabaseClient): SupabasePlatformFeedbackStore {
	return {
		async listFeedback() {
			const { data, error } = await selectAllSupabaseRows<FeedbackRow>(
				(from, to) =>
					supabase
						.from('beta_feedback')
						.select('*')
						.order('created_at', { ascending: false })
						.range(from, to) as unknown as SupabaseQueryResult<FeedbackRow>
			);
			if (error) throw new Error(`table beta_feedback list failed: ${formatSupabaseError(error)}`);
			return (data ?? []).map(mapFeedback);
		},

		async updateFeedback(input: PlatformFeedbackUpdateInput): Promise<PlatformFeedbackStoreUpdateResult | null> {
			const updateData: { status?: PlatformFeedbackStatus; admin_notes?: string | null } = {};
			if (input.status !== undefined) updateData.status = input.status;
			if (input.adminNotes !== undefined) updateData.admin_notes = input.adminNotes;

			const response = (await supabase
				.from('beta_feedback')
				.update(updateData)
				.eq('id', input.id)
				.select('id')
				.maybeSingle()) as SupabaseResponse<{ id: string }>;
			assertSupabaseSuccess('table beta_feedback update', response);
			if (!response.data) return null;
			return { id: response.data.id };
		},

		async resolveSubmissionOrganizationContext(input) {
			const response = (await supabase
				.from('organization_memberships')
				.select('organizations(id, name, url_slug)')
				.eq('organization_id', input.organizationId)
				.eq('user_id', input.userId)
				.maybeSingle<FeedbackOrganizationMembershipRow>()) as SupabaseResponse<FeedbackOrganizationMembershipRow>;
			assertSupabaseSuccess('table organization_memberships feedback context lookup', response);

			const organization = Array.isArray(response.data?.organizations)
				? response.data?.organizations[0]
				: response.data?.organizations;
			if (!organization) return null;

			return {
				organizationId: organization.id,
				organizationName: organization.name,
				organizationUrlSlug: organization.url_slug ?? null
			};
		},

		async insertFeedbackSubmission(input: PlatformFeedbackSubmissionRecord) {
			const response = (await supabase.from('beta_feedback').insert({
				user_id: input.userId,
				user_email: input.userEmail,
				organization_id: input.organizationId,
				organization_name: input.organizationName,
				category: input.category,
				message: input.message,
				page_url: input.pageUrl,
				page_section: input.pageSection,
				github_issue_number: input.githubIssueNumber,
				github_issue_url: input.githubIssueUrl
			})) as SupabaseResponse<unknown>;
			assertSupabaseSuccess('table beta_feedback insert', response);
		}
	};
}

export function createGitHubPlatformFeedbackMirror({
	token = env.GITHUB_FEEDBACK_TOKEN,
	fetcher = fetch
}: {
	token?: string;
	fetcher?: typeof fetch;
} = {}): PlatformFeedbackMirror {
	return {
		async mirror(input) {
			if (!token) {
				console.warn('GITHUB_FEEDBACK_TOKEN not set - skipping GitHub issue creation');
				return null;
			}

			const categoryTitle = CATEGORY_TITLES[input.category];
			const title = `[${categoryTitle}] ${input.message.slice(0, 80)}${input.message.length > 80 ? '...' : ''}`;

			try {
				const res = await fetcher(`https://api.github.com/repos/${GITHUB_REPO}/issues`, {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${token}`,
						Accept: 'application/vnd.github+json',
						'Content-Type': 'application/json',
						'X-GitHub-Api-Version': '2022-11-28'
					},
					body: JSON.stringify({
						title,
						body: createGitHubIssueBody(input),
						labels: CATEGORY_LABELS[input.category]
					})
				});

				if (!res.ok) {
					const errBody = await res.text().catch(() => 'unknown');
					console.error(`GitHub issue creation failed (${res.status}):`, errBody);
					return null;
				}

				const data = (await res.json()) as { number?: unknown; html_url?: unknown };
				if (typeof data.number !== 'number' || typeof data.html_url !== 'string') return null;
				return { issueNumber: data.number, issueUrl: data.html_url };
			} catch (error) {
				console.error('GitHub issue creation failed:', error);
				return null;
			}
		}
	};
}

export function createSupabasePlatformFeedback(ctx: AdminContext): PlatformFeedback {
	const store = createSupabasePlatformFeedbackStore(ctx.adminClient);
	return createPlatformFeedback({
		store,
		organizationContextStore: store,
		submissionStore: store,
		mirror: createGitHubPlatformFeedbackMirror()
	});
}

export function createSupabasePlatformFeedbackForSubmission(): PlatformFeedback {
	const store = createSupabasePlatformFeedbackStore(getAdminClient());
	return createPlatformFeedback({
		store,
		organizationContextStore: store,
		submissionStore: store,
		mirror: createGitHubPlatformFeedbackMirror()
	});
}
