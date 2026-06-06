// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import VisibleStub from '$lib/test-stubs/VisibleStub.svelte';
import type { RatingSchemeWorkspaceResult } from '$features/rating-scheme/server/ratingSchemeWorkspaceBootstrap';

const throwRenderErrorMock = vi.fn();

vi.mock('$features/rating-scheme/components/RatingSchemePageView.svelte', () => ({
	default: VisibleStub
}));

vi.mock('$features/rating-scheme/components/RatingSchemeModals.svelte', () => ({
	default: VisibleStub
}));

vi.mock('$lib/stores/orgContext.svelte', () => ({
	getOrgContext: () => ({
		orgId: 'org-1',
		orgName: 'Test Unit',
		userId: 'user-1',
		role: 'owner',
		isOwner: true,
		isAdmin: false,
		isPrivileged: true,
		readOnly: false,
		capabilityMap: {
			calendar: 'configure',
			personnel: 'configure',
			training: 'configure',
			onboarding: 'configure',
			members: 'configure',
			criticalTasks: 'configure',
			ratingScheme: 'configure',
			reports: 'configure',
			dutyRoster: 'configure'
		},
		hasCapability: vi.fn(() => true),
		affordanceForFeatureAction: vi.fn(() => ({
			visible: true,
			allowed: true,
			disabled: false,
			explanation: null
		})),
		affordanceForGovernanceAction: vi.fn(() => ({
			visible: true,
			allowed: true,
			disabled: false,
			explanation: null
		}))
	})
}));

vi.mock('$lib/utils/streamedRouteData', async () => {
	const actual = await vi.importActual<typeof import('$lib/utils/streamedRouteData')>('$lib/utils/streamedRouteData');

	return {
		...actual,
		throwRenderError: (error: unknown, fallbackMessage: string) => {
			throwRenderErrorMock(error, fallbackMessage);
			return undefined as never;
		}
	};
});

import Page from './+page.svelte';

afterEach(() => {
	cleanup();
	throwRenderErrorMock.mockReset();
});

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function makeBootstrap(): RatingSchemeWorkspaceResult {
	return {
		laneKey: 'ratingScheme',
		data: {
			personnelLookup: [],
			ratingSchemeEntries: [],
			lossWarningWindowDays: 180
		},
		hydration: {
			orgId: 'org-1',
			ratingSchemeEntries: {
				mode: 'replace',
				snapshotKey: 'rating-scheme:1',
				items: []
			}
		}
	};
}

function makeRouteData(workspace: RatingSchemeWorkspaceResult | Promise<RatingSchemeWorkspaceResult>) {
	return {
		shell: {
			org: {
				id: 'org-1',
				name: 'Test Unit'
			}
		},
		ratingScheme: {
			data: workspace
		}
	};
}

describe('evals page', () => {
	it('renders the Rating Scheme surface immediately when workspace data is resolved', async () => {
		render(Page, {
			props: {
				data: makeRouteData(makeBootstrap())
			}
		});

		await waitFor(() => {
			expect(screen.getAllByTestId('visible-stub')).toHaveLength(2);
		});
		expect(screen.queryByRole('status')).toBeNull();
	});

	it('renders a loading shell while Rating Scheme workspace data is still streaming', async () => {
		const workspace = deferred<RatingSchemeWorkspaceResult>();

		render(Page, {
			props: {
				data: makeRouteData(workspace.promise)
			}
		});

		expect(screen.getByRole('status')).toBeTruthy();

		workspace.resolve(makeBootstrap());

		await waitFor(() => {
			expect(screen.queryByRole('status')).toBeNull();
			expect(screen.getAllByTestId('visible-stub')).toHaveLength(2);
		});
	});

	it('invokes the render error path when Rating Scheme workspace loading fails', async () => {
		const workspace = deferred<RatingSchemeWorkspaceResult>();

		render(Page, {
			props: {
				data: makeRouteData(workspace.promise)
			}
		});

		workspace.reject(new Error('rating scheme failed'));

		await waitFor(() => {
			expect(throwRenderErrorMock).toHaveBeenCalledWith(
				expect.objectContaining({ message: 'rating scheme failed' }),
				'Failed to load Rating Scheme workspace'
			);
		});
	});
});
