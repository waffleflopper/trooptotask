import { describe, expect, it } from 'vitest';
import type { PlatformActivityInput, PlatformActivityResult } from '$lib/audit/contracts';
import { activityScope } from '../auditSentences';
import { listPlatformActivity } from './activity.server';

const viewer = 'viewer-1';
const everything = { category: null, q: '', from: '', to: '', page: 1 };

function recordingAudit(result: Partial<PlatformActivityResult> = {}) {
	const inputs: PlatformActivityInput[] = [];
	return {
		inputs,
		audit: {
			async listActivity(input: PlatformActivityInput): Promise<PlatformActivityResult> {
				inputs.push(input);
				return { events: [], totalCount: 0, page: input.page, limit: input.limit ?? 0, ...result };
			}
		}
	};
}

describe('listPlatformActivity', () => {
	it('asks for one page of 50 with the registry scope for the chosen category and the search text', async () => {
		const { audit, inputs } = recordingAudit();

		await listPlatformActivity(audit, { ...everything, category: 'security', q: 'pat', page: 3 }, 'UTC', viewer);

		expect(inputs).toEqual([{ ...activityScope('security'), search: 'pat', from: null, to: null, page: 3, limit: 50 }]);
		expect(inputs[0].prefixes).toEqual([]);
	});

	it('widens All to every platform prefix', async () => {
		const { audit, inputs } = recordingAudit();

		await listPlatformActivity(audit, everything, 'UTC', viewer);

		expect(inputs[0].prefixes).toContain('admin.');
		expect(inputs[0].actions).toContain('suspend_user');
	});

	it('turns the chosen days into a half-open range in the viewer time zone', async () => {
		const { audit, inputs } = recordingAudit();
		const range = { ...everything, from: '2026-10-21', to: '2026-10-22' };

		await listPlatformActivity(audit, range, 'UTC', viewer);
		await listPlatformActivity(audit, range, 'America/Los_Angeles', viewer);

		expect(inputs.map(({ from, to }) => [from?.toISOString(), to?.toISOString()])).toEqual([
			['2026-10-21T00:00:00.000Z', '2026-10-23T00:00:00.000Z'],
			['2026-10-21T07:00:00.000Z', '2026-10-23T07:00:00.000Z']
		]);
	});

	it('returns the page the database answered with, not the one asked for', async () => {
		const { audit } = recordingAudit({ page: 2, limit: 50, totalCount: 51 });

		await expect(listPlatformActivity(audit, { ...everything, page: 9 }, 'UTC', viewer)).resolves.toEqual({
			events: [],
			page: 2,
			pageSize: 50,
			totalCount: 51,
			viewerId: viewer
		});
	});
});
