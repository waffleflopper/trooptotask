import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	ORGANIZATION_CREATION_UNCONFIRMED_MESSAGE,
	provisionOrganization,
	type OrgProvisioningPort
} from './provisioning.server';

const requestId = '6f0c6c9e-7a53-4d1b-9a4e-2f3f0f9f0a11';

function port(result: Awaited<ReturnType<OrgProvisioningPort['createOrganization']>> = { orgId: 'org-1' }) {
	const requests: Array<{ name: string; requestId: string }> = [];
	return {
		requests,
		async createOrganization(input: { name: string; requestId: string }) {
			requests.push(input);
			return result;
		}
	};
}

describe('provisionOrganization', () => {
	afterEach(() => vi.restoreAllMocks());

	it('creates the Organization once with the cleaned name and the submission request id', async () => {
		const creation = port();
		expect(await provisionOrganization(creation, { name: '  Alpha   Company  ', requestId })).toEqual({
			orgId: 'org-1'
		});
		expect(creation.requests).toEqual([{ name: 'Alpha Company', requestId }]);
	});

	it('accepts a name at the 100-character boundary and clips beyond it', async () => {
		const creation = port();
		await provisionOrganization(creation, { name: 'A'.repeat(100), requestId });
		await provisionOrganization(creation, { name: 'B'.repeat(101), requestId });
		expect(creation.requests.map((request) => request.name)).toEqual(['A'.repeat(100), 'B'.repeat(100)]);
	});

	it('rejects blank names before any provider work starts', async () => {
		const creation = port();
		await expect(provisionOrganization(creation, { name: '   ', requestId })).rejects.toMatchObject({
			status: 400,
			message: 'Organization name is required'
		});
		expect(creation.requests).toEqual([]);
	});

	it('fails with a safe retry message and logs the provider text only server-side', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const creation = port({ failure: 'duplicate key value violates unique constraint "organization_rank_catalog"' });

		const failure = await provisionOrganization(creation, { name: 'Alpha Company', requestId }).catch(
			(error: unknown) => error
		);

		expect(failure).toMatchObject({
			status: 503,
			message:
				"We couldn't confirm that your Organization was created. Select Create Organization again to finish. Retrying won't create a duplicate.",
			publicMessage: true
		});
		expect((failure as Error).message).toBe(ORGANIZATION_CREATION_UNCONFIRMED_MESSAGE);
		expect(consoleError).toHaveBeenCalledWith(
			'Organization creation error:',
			'duplicate key value violates unique constraint "organization_rank_catalog"'
		);
	});
});
