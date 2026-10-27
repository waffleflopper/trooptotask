import { describe, expect, it, vi } from 'vitest';
import { _postConfig as answer } from './answer/+server';
import { _postConfig as branch } from './branch/+server';
import { _postConfig as finish } from './finish/+server';
import { _postConfig as prompt } from './prompt/+server';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { parseOrganizationSetup } from '$features/organization/contracts';
import type { OrganizationSetupPort } from '$features/organization/index.server';
import type { SetupBranch } from '$features/organization/contracts';
import { configureOrganizationRankServices, loadOrganizationRankCatalog } from '$features/personnel/index.server';

function fixture(role: 'owner' | 'admin' | 'member' = 'owner') {
	const base = createTestContext({ auth: { role } });
	let state = parseOrganizationSetup(null);
	const port: OrganizationSetupPort = {
		read: async () => state,
		saveAnswer: async (_orgId, step, value) => {
			state = parseOrganizationSetup({ ...state, answers: { ...state.answers, [step]: value } });
			return state;
		},
		saveBranch: async (_orgId, value) => {
			state = { ...state, branch: value };
			return state;
		},
		finish: async () => {
			state = { ...state, finishedAt: '2026-10-27T00:00:00Z' };
			return state;
		},
		savePrompt: async (_orgId, key, value) => {
			state = parseOrganizationSetup({ ...state, prompts: { ...state.prompts, [key]: value } });
			return state;
		}
	};
	return {
		ctx: {
			...base,
			organizationSetup: port,
			configureBranchRanks: (service: SetupBranch) => configureOrganizationRankServices(base, { service })
		},
		state: () => state
	};
}

describe('Organization setup endpoints', () => {
	it('allows an admin to answer, set a branch and finish while retaining earlier answers', async () => {
		const { ctx, state } = fixture('admin');
		await handleUseCaseRequest(answer, ctx, { step: 'groups', answer: 'reviewed' }, () => ctx);
		await handleUseCaseRequest(branch, ctx, { branch: 'army' }, () => ctx);
		expect(await ctx.rankCatalog.findEntryByCode('SGT')).toMatchObject({ state: 'active', source: 'built-in' });
		expect(await handleUseCaseRequest(finish, ctx, {}, () => ctx)).toEqual({
			branch: 'army',
			answers: { groups: 'reviewed' },
			prompts: {},
			finishedAt: '2026-10-27T00:00:00Z'
		});
		await expect(
			handleUseCaseRequest(prompt, ctx, { key: 'setup', state: { never: true } }, () => ctx)
		).rejects.toMatchObject({ status: 403 });
		expect(state().prompts).toEqual({});
	});

	it('rejects a member branch save before changing ranks or the stored branch', async () => {
		const { ctx, state } = fixture('member');
		await expect(handleUseCaseRequest(branch, ctx, { branch: 'navy' }, () => ctx)).rejects.toMatchObject({
			status: 403
		});
		expect(state()).toEqual({ branch: null, answers: {}, prompts: {}, finishedAt: null });
		expect(await ctx.rankCatalog.listEntries()).toEqual([]);
	});

	it('keeps the saved branch after a rank failure and converges when retried', async () => {
		const { ctx, state } = fixture('admin');
		await handleUseCaseRequest(branch, ctx, { branch: 'army' }, () => ctx);
		const saveEntries = ctx.rankCatalog.saveEntries;
		ctx.rankCatalog.saveEntries = async (entries) => {
			if (entries.some((entry) => entry.state === 'retired')) throw new Error('Synthetic rank write failure');
			return saveEntries(entries);
		};
		await expect(handleUseCaseRequest(branch, ctx, { branch: 'navy' }, () => ctx)).rejects.toThrow();
		expect(state()).toEqual({ branch: 'army', answers: {}, prompts: {}, finishedAt: null });
		expect(await ctx.rankCatalog.findEntryByCode('PO3')).toMatchObject({ state: 'active', source: 'built-in' });
		ctx.rankCatalog.saveEntries = saveEntries;
		expect(await handleUseCaseRequest(branch, ctx, { branch: 'navy' }, () => ctx)).toEqual({
			branch: 'navy',
			answers: {},
			prompts: {},
			finishedAt: null
		});
		expect(await ctx.rankCatalog.findEntryByCode('SGT')).toMatchObject({ state: 'retired', source: 'built-in' });
	});

	it('reconciles ranks when setup persistence fails and leaves ranks alone when clearing the branch', async () => {
		const { ctx, state } = fixture('admin');
		await handleUseCaseRequest(branch, ctx, { branch: 'army' }, () => ctx);
		const saveBranch = ctx.organizationSetup.saveBranch;
		ctx.organizationSetup.saveBranch = async () => {
			throw new Error('Synthetic setup write failure');
		};
		await expect(handleUseCaseRequest(branch, ctx, { branch: 'navy' }, () => ctx)).rejects.toThrow();
		expect(state().branch).toBe('army');
		expect(await ctx.rankCatalog.findEntryByCode('SGT')).toMatchObject({ state: 'retired' });
		ctx.organizationSetup.saveBranch = saveBranch;
		await handleUseCaseRequest(branch, ctx, { branch: 'navy' }, () => ctx);
		const beforeClear = await ctx.rankCatalog.listEntries();
		ctx.configureBranchRanks = async () => {
			throw new Error('Clearing must not configure ranks');
		};
		expect(await handleUseCaseRequest(branch, ctx, { branch: null }, () => ctx)).toEqual({
			branch: null,
			answers: {},
			prompts: {},
			finishedAt: null
		});
		expect(await ctx.rankCatalog.listEntries()).toEqual(beforeClear);
	});

	it('rejects civilian as a branch choice without changing the catalog', async () => {
		const { ctx, state } = fixture('admin');
		await handleUseCaseRequest(branch, ctx, { branch: 'army' }, () => ctx);
		const before = await loadOrganizationRankCatalog(ctx);
		await expect(handleUseCaseRequest(branch, ctx, { branch: 'civilian' }, () => ctx)).rejects.toMatchObject({
			status: 400
		});
		expect(state().branch).toBe('army');
		expect(await loadOrganizationRankCatalog(ctx)).toEqual(before);
	});

	it('keeps prompt state owner-only and validates the viewer-local snooze day', async () => {
		const { ctx, state } = fixture();
		expect(
			await handleUseCaseRequest(prompt, ctx, { key: 'setup', state: { snoozedUntil: '2026-10-28' } }, () => ctx)
		).toEqual({ branch: null, answers: {}, finishedAt: null, prompts: { setup: { snoozedUntil: '2026-10-28' } } });
		await expect(
			handleUseCaseRequest(prompt, ctx, { key: 'training', state: { snoozedUntil: '2026-02-30' } }, () => ctx)
		).rejects.toMatchObject({ status: 400 });
		expect(state().prompts).toEqual({ setup: { snoozedUntil: '2026-10-28' } });
	});

	it('rejects missing capability and malformed input before saving', async () => {
		const member = fixture('member');
		await expect(
			handleUseCaseRequest(answer, member.ctx, { step: 'groups', answer: 'reviewed' }, () => member.ctx)
		).rejects.toMatchObject({ status: 403 });
		expect(member.state().answers).toEqual({});
		const admin = fixture('admin');
		await expect(
			handleUseCaseRequest(answer, admin.ctx, { step: 'removed', answer: 'reviewed' }, () => admin.ctx)
		).rejects.toMatchObject({ status: 400 });
		await expect(handleUseCaseRequest(branch, admin.ctx, { branch: 'invalid' }, () => admin.ctx)).rejects.toMatchObject(
			{ status: 400 }
		);
		expect(admin.state()).toEqual({ branch: null, answers: {}, prompts: {}, finishedAt: null });
	});

	it('returns an updated state only after persistence acknowledges the write', async () => {
		const { ctx } = fixture('admin');
		let entered!: () => void;
		const started = new Promise<void>((resolve) => {
			entered = resolve;
		});
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		let replied = false;
		const save = ctx.organizationSetup.saveBranch;
		ctx.organizationSetup.saveBranch = async (...args) => {
			entered();
			await gate;
			return save(...args);
		};
		const pending = handleUseCaseRequest(branch, ctx, { branch: 'navy' }, () => ctx).then((state) => {
			replied = true;
			return state;
		});
		await started;
		expect(replied).toBe(false);
		release();
		await expect(pending).resolves.toEqual({ branch: 'navy', answers: {}, prompts: {}, finishedAt: null });
	});

	it.each(['organization.rank_catalog.service_pack_added', 'organization.rank_catalog.bulk_state_changed'])(
		'keeps the branch unchanged if the rank audit fails: %s',
		async (action) => {
			const { ctx, state } = fixture('admin');
			await handleUseCaseRequest(branch, ctx, { branch: 'army' }, () => ctx);
			const log = ctx.audit.log;
			ctx.audit.log = async (event) => {
				if (event.action === action) throw new Error('Synthetic audit failure');
				await log(event);
			};
			await expect(handleUseCaseRequest(branch, ctx, { branch: 'navy' }, () => ctx)).rejects.toThrow();
			expect(state()).toEqual({ branch: 'army', answers: {}, prompts: {}, finishedAt: null });
		}
	);
});

describe('prompt choices and Finish later', () => {
	it.each([
		['America/Anchorage', '2026-03-08'],
		['Pacific/Kiritimati', '2026-03-09']
	])('persists tomorrow in the viewer zone %s and retains existing answers', async (zone, expected) => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-03-08T07:30:00Z'));
		try {
			const { ctx, state } = fixture('owner');
			await handleUseCaseRequest(answer, ctx, { step: 'groups', answer: 'reviewed' }, () => ctx);
			const input = await prompt.parseInput({
				request: new Request('http://localhost/prompt', {
					method: 'POST',
					body: JSON.stringify({ key: 'setup', choice: 'tomorrow' })
				}),
				cookies: { get: () => zone }
			} as never);
			await handleUseCaseRequest(prompt, ctx, input, () => ctx);
			expect(state()).toEqual({
				branch: null,
				answers: { groups: 'reviewed' },
				finishedAt: null,
				prompts: { setup: { snoozedUntil: expected } }
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it('persists never only for the chosen new feature', async () => {
		const { ctx, state } = fixture();
		const input = await prompt.parseInput({
			request: new Request('http://localhost/prompt', {
				method: 'POST',
				body: JSON.stringify({ key: 'training', choice: 'never' })
			}),
			cookies: { get: () => 'UTC' }
		} as never);
		await handleUseCaseRequest(prompt, ctx, input, () => ctx);
		expect(state()).toEqual({ branch: null, answers: {}, finishedAt: null, prompts: { training: { never: true } } });
	});

	it('rejects a client-provided snooze date instead of trusting the browser clock', async () => {
		await expect(
			prompt.parseInput({
				request: new Request('http://localhost/prompt', {
					method: 'POST',
					body: JSON.stringify({ key: 'setup', state: { snoozedUntil: '2028-01-01' } })
				})
			} as never)
		).rejects.toMatchObject({ status: 400 });
	});
});
