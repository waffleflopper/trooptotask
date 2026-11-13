// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import VisibleStub from '$lib/test-stubs/VisibleStub.svelte';
import type { RatingSchemeWorkspaceResult, RatingSchemeWorkspaceRestricted } from '$features/rating-scheme/contracts';

vi.mock('$features/rating-scheme/components/RatingSchemeLinesView.svelte', async () => ({
	default: (await import('./ViewStateProbe.svelte')).default
}));

vi.mock('$features/rating-scheme/components/RatingSchemeLinesModals.svelte', () => ({
	default: VisibleStub
}));

vi.mock('$features/app-shell', () => ({
	getAppShellContext: () => ({
		orgId: 'org-1',
		orgName: 'Test Unit',
		userId: 'user-1',
		role: 'owner',
		isOwner: true,
		isAdmin: false,
		isPrivileged: true,
		capabilityMap: {
			calendar: 'configure',
			personnel: 'configure',
			training: 'configure',
			onboarding: 'configure',
			members: 'configure',
			criticalTasks: 'configure',
			ratingScheme: 'configure',
			reports: 'configure'
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

import Page from './+page.svelte';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
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
			ratingSchemes: [],
			evaluations: []
		},
		hydration: {
			orgId: 'org-1',
			ratingSchemes: { mode: 'replace', snapshotKey: 'rating-scheme:1', items: [] },
			evaluations: { mode: 'replace', snapshotKey: 'rating-scheme:1', items: [] }
		}
	};
}

type Workspace = RatingSchemeWorkspaceResult | RatingSchemeWorkspaceRestricted;

function makeRouteData(workspace: Workspace | Promise<Workspace>) {
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

function makeRouteDataWithoutRatingScheme() {
	return {
		shell: {
			org: {
				id: 'org-1',
				name: 'Test Unit'
			}
		}
	};
}

describe('rating scheme page', () => {
	it('renders a loading shell while Rating Scheme workspace data is still streaming', async () => {
		const workspace = deferred<RatingSchemeWorkspaceResult>();

		render(Page, {
			props: {
				data: makeRouteData(workspace.promise)
			}
		});

		expect(screen.getByRole('status', { name: 'Loading evaluations' }).hasAttribute('aria-busy')).toBe(false);

		workspace.resolve(makeBootstrap());

		await waitFor(() => {
			expect(screen.queryByRole('status')).toBeNull();
			expect(screen.getAllByTestId('visible-stub')).toHaveLength(2);
		});
	});

	it('leaves a rejected Rating Scheme workspace to the layout, without a skeleton, an error or a render throw', async () => {
		const workspace = deferred<RatingSchemeWorkspaceResult>();
		const errors: unknown[] = [];
		const onError = (event: ErrorEvent) => errors.push(event.error);
		window.addEventListener('error', onError);

		try {
			render(Page, { props: { data: makeRouteData(workspace.promise) } });
			expect(screen.getByRole('status')).toBeTruthy();

			workspace.reject(new Error('rating scheme failed'));

			await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
			expect(screen.queryByRole('alert')).toBeNull();
			expect(screen.queryAllByTestId('visible-stub')).toHaveLength(0);
			expect(errors).toEqual([]);
		} finally {
			window.removeEventListener('error', onError);
		}
	});

	it('shows a load error with Retry when Rating Scheme route data is missing', async () => {
		const reload = vi.fn();
		vi.stubGlobal('location', { ...window.location, reload });

		render(Page, { props: { data: makeRouteDataWithoutRatingScheme() } });

		expect((await screen.findByRole('alert')).textContent).toContain('Unable to load Evals');
		expect(screen.queryAllByTestId('visible-stub')).toHaveLength(0);

		await fireEvent.click(screen.getByRole('button', { name: 'Retry Evals' }));
		expect(reload).toHaveBeenCalledTimes(1);
	});

	it('keeps the search when the page data reloads for the same Organization', async () => {
		const { rerender } = render(Page, { props: { data: makeRouteData(makeBootstrap()) } });
		await fireEvent.input(screen.getByLabelText('Probe search'), { target: { value: 'Park' } });

		await rerender({ data: makeRouteData(makeBootstrap()) });

		expect((screen.getByLabelText('Probe search') as HTMLInputElement).value).toBe('Park');
	});

	it.each(['immediate', 'deferred'])(
		'settles %s restriction without creating the Evals editor or a busy shell',
		async (mode) => {
			const restriction: RatingSchemeWorkspaceRestricted = { laneKey: 'ratingScheme', access: 'restricted' };
			const workspace = deferred<Workspace>();
			render(Page, { props: { data: makeRouteData(mode === 'immediate' ? restriction : workspace.promise) } });
			if (mode === 'deferred') {
				expect(screen.getByRole('status')).toBeTruthy();
				workspace.resolve(restriction);
			}
			await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
			expect(screen.queryAllByTestId('visible-stub')).toHaveLength(0);
		}
	);
});
