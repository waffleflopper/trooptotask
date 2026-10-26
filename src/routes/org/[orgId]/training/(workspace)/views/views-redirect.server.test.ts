import { describe, expect, it } from 'vitest';
import { GET } from './+server';

type ViewsEvent = Parameters<typeof GET>[0];

describe('/training/views', () => {
	it.each(['org-1', 'alpha-company'])('sends %s to its Training matrix', (orgId) => {
		let thrown: unknown;
		try {
			GET({ params: { orgId } } as unknown as ViewsEvent);
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toMatchObject({ status: 308, location: `/org/${orgId}/training` });
	});
});
