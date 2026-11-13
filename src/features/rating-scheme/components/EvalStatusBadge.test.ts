// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { evalStatusBadge } from '../utils/evalStatusBadge';
import { evaluation } from '../utils/ratingSchemeLineTestData';
import EvalStatusBadgeHost from './EvalStatusBadgeHost.svelte';

const badge = evalStatusBadge(
	evaluation('eval-1', 'scheme-1', { workflowStatus: 'with-senior-rater' }),
	new Date('2026-06-01T12:00:00')
)!;

afterEach(cleanup);

describe('EvalStatusBadge', () => {
	it('links to the Evaluation in the Eval Tracker under the name it was given', () => {
		render(EvalStatusBadgeHost, {
			props: { badge, href: '/org/org-1/evals?entry=eval-1', linkLabel: 'Open the evaluation for SGT Watanabe' }
		});

		expect(screen.getByRole('link', { name: 'Open the evaluation for SGT Watanabe' }).getAttribute('href')).toBe(
			'/org/org-1/evals?entry=eval-1'
		);
	});

	it('is not a link or a button without a destination, because it never moves a step', () => {
		render(EvalStatusBadgeHost, { props: { badge } });

		expect(screen.queryByRole('link')).toBeNull();
		expect(screen.queryByRole('button')).toBeNull();
	});
});
