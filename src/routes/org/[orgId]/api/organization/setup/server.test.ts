import { describe, expect, it } from 'vitest';
import { _postConfig as answer } from './answer/+server';
import { _postConfig as branch } from './branch/+server';
import { _postConfig as finish } from './finish/+server';
import { _postConfig as prompt } from './prompt/+server';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { parseOrganizationSetup } from '$features/organization/contracts';
import type { OrganizationSetupPort } from '$features/organization/index.server';

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
	return { ctx: { ...base, organizationSetup: port }, state: () => state };
}

describe('Organization setup endpoints', () => {
	it('allows an admin to answer, set a branch and finish while retaining earlier answers', async () => {
		const { ctx, state } = fixture('admin');
		await handleUseCaseRequest(answer, ctx, { step: 'groups', answer: 'reviewed' }, () => ctx);
		await handleUseCaseRequest(branch, ctx, { branch: 'army' }, () => ctx);
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
});
