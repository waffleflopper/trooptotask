import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
import { describe, expect, it, vi } from 'vitest';
import type { SetupBranch } from '$features/organization/contracts';
import { getTrainingSuggestions } from '$features/training/contracts';
import { createTestContext } from '$features/training/server/trainingPersistence.test-support.server';
import { RequestFailure } from '$lib/errors';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

const picked = { branch: 'army', suggestionIds: ['sharp', 'eo', 'ace'] };
const apply = (ctx: ReturnType<typeof createTestContext>, input: unknown = picked) =>
	handleUseCaseRequest(_postConfig, ctx, input, () => ctx);

describe('apply Training suggestions', () => {
	it('creates only the three picked annual requirements and reapplying preserves their identities and audits', async () => {
		const ctx = createTestContext();
		ctx.store.seed('training_types', [
			{ id: 'foreign', organization_id: 'another-org', name: 'SHARP', expiration_months: 24 }
		]);
		const first = await apply(ctx);
		expect(first.created.map(({ id }) => id)).toEqual(['sharp', 'eo', 'ace']);
		expect(first.skipped).toEqual([]);
		expect(first.failed).toEqual([]);
		expect(first.trainingTypes.map(({ name, expirationMonths }) => ({ name, expirationMonths }))).toEqual([
			{ name: 'SHARP', expirationMonths: 12 },
			{ name: 'Equal Opportunity', expirationMonths: 12 },
			{ name: 'Suicide Prevention (ACE)', expirationMonths: 12 }
		]);
		const second = await apply(ctx);
		expect(second.created).toEqual([]);
		expect(second.skipped.map(({ id }) => id)).toEqual(['sharp', 'eo', 'ace']);
		expect(second.failed).toEqual([]);
		expect(second.trainingTypes).toEqual(first.trainingTypes);
		expect(ctx.auditPort.events.map(({ action }) => action)).toEqual([
			'training_type.created',
			'training_type.created',
			'training_type.created'
		]);
	});

	it('creates the other Army suggestions with their twelve-month recurrence', async () => {
		const ctx = createTestContext();
		const result = await apply(ctx, {
			branch: 'army',
			suggestionIds: ['cyber-awareness', 'tarp', 'opsec', 'at-level-i', 'ctip']
		});
		expect(result.trainingTypes.map(({ name, expirationMonths }) => ({ name, expirationMonths }))).toEqual([
			{ name: 'Cyber Awareness Challenge', expirationMonths: 12 },
			{ name: 'Threat Awareness and Reporting', expirationMonths: 12 },
			{ name: 'OPSEC', expirationMonths: 12 },
			{ name: 'Antiterrorism Level I', expirationMonths: 12 },
			{ name: 'Combating Trafficking in Persons', expirationMonths: 12 }
		]);
	});

	it('keeps a saved SHARP unchanged and appends the other picked types', async () => {
		const ctx = createTestContext();
		ctx.store.seed('training_types', [
			{
				id: '10000000-0000-4000-8000-000000000001',
				organization_id: ctx.auth.orgId,
				name: 'SHARP',
				expiration_months: 24,
				color: '#123456',
				sort_order: 7
			}
		]);
		const result = await apply(ctx);
		expect(result.created.map(({ id }) => id)).toEqual(['eo', 'ace']);
		expect(result.skipped.map(({ id }) => id)).toEqual(['sharp']);
		expect(result.trainingTypes).toMatchObject([
			{
				id: '10000000-0000-4000-8000-000000000001',
				name: 'SHARP',
				expirationMonths: 24,
				color: '#123456',
				sortOrder: 7
			},
			{ name: 'Equal Opportunity', expirationMonths: 12 },
			{ name: 'Suicide Prevention (ACE)', expirationMonths: 12 }
		]);
		expect(ctx.auditPort.events.map(({ action }) => action)).toEqual([
			'training_type.created',
			'training_type.created'
		]);
	});

	it('uses exact type names rather than treating a differently cased name as a duplicate', async () => {
		const ctx = createTestContext();
		ctx.store.seed('training_types', [
			{ id: 'lowercase', organization_id: ctx.auth.orgId, name: 'sharp', sort_order: 0 }
		]);
		const result = await apply(ctx, { branch: 'army', suggestionIds: ['sharp', 'sharp'] });
		expect(result.created.map(({ id }) => id)).toEqual(['sharp']);
		expect(result.trainingTypes.map(({ name }) => name)).toEqual(['sharp', 'SHARP']);
	});

	it.each<SetupBranch | null>([
		'navy',
		'air-force',
		'marine-corps',
		'coast-guard',
		'space-force',
		'civilian',
		'custom',
		null
	])('offers no suggestions for %s and rejects Army picks for that branch', async (branch) => {
		const ctx = createTestContext();
		expect(getTrainingSuggestions(branch)).toEqual([]);
		expect(await apply(ctx, { branch, suggestionIds: [] })).toEqual({
			created: [],
			skipped: [],
			failed: [],
			trainingTypes: []
		});
		await expect(apply(ctx, { branch, suggestionIds: ['sharp'] })).rejects.toMatchObject({ status: 400 });
		expect(await ctx.trainingCatalog.listTypes()).toEqual([]);
	});

	it.each(['viewer', 'scoped', 'off'] as const)('denies a %s actor before creating any type', async (actor) => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: actor === 'viewer' ? 'view' : 'configure',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				...(actor === 'scoped'
					? { scopeSet: groupCoverageForTest({ kind: 'groups' as const, groupIds: ['group-1'] }) }
					: {})
			}
		});
		if (actor === 'off') ctx.disabledFeatures = ['training'];
		await expect(apply(ctx)).rejects.toMatchObject({ status: 403 });
		expect(await ctx.trainingCatalog.listTypes()).toEqual([]);
		expect(ctx.auditPort.events.filter(({ action }) => action === 'training_type.created')).toEqual([]);
	});

	it('reports a failed pick, retains the successful types and finishes them on retry without recreating them', async () => {
		const ctx = createTestContext();
		const create = ctx.trainingCatalog.createType.bind(ctx.trainingCatalog);
		vi.spyOn(ctx.trainingCatalog, 'createType').mockImplementation(async (input) => {
			if (input.name === 'Equal Opportunity') throw new Error('sensitive provider detail');
			return create(input);
		});
		const first = await apply(ctx);
		expect(first.created.map(({ id }) => id)).toEqual(['sharp', 'ace']);
		expect(first.failed.map(({ id }) => id)).toEqual(['eo']);
		expect(first.trainingTypes.map(({ name }) => name)).toEqual(['SHARP', 'Suicide Prevention (ACE)']);
		expect(JSON.stringify(first)).not.toContain('sensitive provider detail');
		vi.mocked(ctx.trainingCatalog.createType).mockImplementation(create);
		const second = await apply(ctx);
		expect(second.created.map(({ id }) => id)).toEqual(['eo']);
		expect(second.skipped.map(({ id }) => id)).toEqual(['sharp', 'ace']);
		expect(second.failed).toEqual([]);
		expect(second.trainingTypes.map(({ name }) => name).sort()).toEqual([
			'Equal Opportunity',
			'SHARP',
			'Suicide Prevention (ACE)'
		]);
		expect(second.trainingTypes.filter(({ name }) => name !== 'Equal Opportunity')).toEqual(first.trainingTypes);
	});

	it('adopts a same-name type created concurrently after the initial read', async () => {
		const ctx = createTestContext();
		const create = ctx.trainingCatalog.createType.bind(ctx.trainingCatalog);
		vi.spyOn(ctx.trainingCatalog, 'createType').mockImplementationOnce(async (input) => {
			await create(input);
			throw new RequestFailure(409, 'Concurrent create');
		});
		const result = await apply(ctx, { branch: 'army', suggestionIds: ['sharp'] });
		expect(result.created).toEqual([]);
		expect(result.skipped.map(({ id }) => id)).toEqual(['sharp']);
		expect(result.failed).toEqual([]);
		expect(result.trainingTypes.map(({ name, expirationMonths }) => ({ name, expirationMonths }))).toEqual([
			{ name: 'SHARP', expirationMonths: 12 }
		]);
	});

	it('reports an audit failure instead of acknowledging an unaudited creation', async () => {
		const ctx = createTestContext();
		const audit = Promise.reject(new Error('audit unavailable'));
		void audit.catch(() => {});
		vi.spyOn(ctx.audit, 'log').mockReturnValue(audit);
		const result = await apply(ctx, { branch: 'army', suggestionIds: ['sharp'] });
		expect(result.created).toEqual([]);
		expect(result.failed.map(({ id }) => id)).toEqual(['sharp']);
		expect(result.trainingTypes.map(({ name }) => name)).toEqual(['SHARP']);
	});

	it.each([
		{ branch: 'army', suggestionIds: ['unknown'] },
		{ branch: 'unknown', suggestionIds: ['sharp'] },
		{ branch: 'army', suggestionIds: 'sharp' }
	])('rejects malformed picks before writing', async (input) => {
		const ctx = createTestContext();
		await expect(apply(ctx, input)).rejects.toMatchObject({ status: 400 });
		expect(await ctx.trainingCatalog.listTypes()).toEqual([]);
	});
});
