import { describe, expect, it, vi } from 'vitest';
import {
	buildBackfillUrl,
	parseArgs,
	resolveBackfillPlan,
	runBackfill
} from '../../scripts/billing-snapshot-backfill.mjs';

describe('billing snapshot backfill script', () => {
	it('defaults to dry-run mode and adds the dryRun query parameter', () => {
		const plan = resolveBackfillPlan(parseArgs(['--limit', '10']), {
			BILLING_RECONCILIATION_SECRET: 'secret',
			PUBLIC_APP_URL: 'https://app.example.test'
		});

		expect(plan).toMatchObject({
			appUrl: 'https://app.example.test',
			dryRun: true,
			limit: 10
		});
		expect(buildBackfillUrl(plan).toString()).toBe(
			'https://app.example.test/api/billing-reconciliation?dryRun=1&limit=10'
		);
	});

	it('requires explicit production confirmation before execute mode', () => {
		expect(() =>
			resolveBackfillPlan(parseArgs(['--execute']), {
				BILLING_RECONCILIATION_SECRET: 'secret'
			})
		).toThrow('Refusing to execute without --confirm-production-backfill.');
	});

	it('omits dryRun in confirmed execute mode', () => {
		const plan = resolveBackfillPlan(parseArgs(['--execute', '--confirm-production-backfill', '--cursor', 'org-1']), {
			BILLING_RECONCILIATION_SECRET: 'secret',
			PUBLIC_APP_URL: 'https://app.example.test'
		});

		expect(plan.dryRun).toBe(false);
		expect(buildBackfillUrl(plan).toString()).toBe('https://app.example.test/api/billing-reconciliation?cursor=org-1');
	});

	it('sends the reconciliation secret only as an authorization header', async () => {
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			text: async () => JSON.stringify({ dryRun: true, processed: 0, results: [] })
		});

		await runBackfill(
			{
				appUrl: 'https://app.example.test',
				secret: 'top-secret',
				dryRun: true,
				limit: null,
				cursor: null,
				timeoutMs: null
			},
			fetchImpl
		);

		expect(fetchImpl).toHaveBeenCalledWith(new URL('https://app.example.test/api/billing-reconciliation?dryRun=1'), {
			headers: {
				authorization: 'Bearer top-secret'
			}
		});
	});
});
