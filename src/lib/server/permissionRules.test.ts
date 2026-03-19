import { describe, it, expect, vi } from 'vitest';
import { Rules, type PermissionRule } from './permissionRules';
import type { PermissionContext } from './permissionContext';

function mockCtx(overrides: Partial<PermissionContext> = {}): PermissionContext {
	return {
		role: 'member',
		isOwner: false,
		isAdmin: false,
		isPrivileged: false,
		isFullEditor: false,
		scopedGroupId: null,
		canView: { calendar: true, personnel: true, training: true, onboarding: true, 'leaders-book': true },
		canEdit: { calendar: true, personnel: true, training: true, onboarding: true, 'leaders-book': true },
		canManageMembers: false,
		requireEdit: vi.fn(),
		requireView: vi.fn(),
		requirePrivileged: vi.fn(),
		requireOwner: vi.fn(),
		requireFullEditor: vi.fn(),
		requireManageMembers: vi.fn(),
		assertCrudPermissions: vi.fn(),
		requireGroupAccess: vi.fn(),
		...overrides
	};
}

describe('atomic rule factories', () => {
	it('Rules.view(area) calls ctx.requireView(area)', () => {
		const ctx = mockCtx();
		Rules.view('training')(ctx);
		expect(ctx.requireView).toHaveBeenCalledWith('training');
	});

	it('Rules.edit(area) calls ctx.requireEdit(area)', () => {
		const ctx = mockCtx();
		Rules.edit('personnel')(ctx);
		expect(ctx.requireEdit).toHaveBeenCalledWith('personnel');
	});

	it('Rules.privileged() calls ctx.requirePrivileged()', () => {
		const ctx = mockCtx();
		Rules.privileged()(ctx);
		expect(ctx.requirePrivileged).toHaveBeenCalled();
	});

	it('Rules.owner() calls ctx.requireOwner()', () => {
		const ctx = mockCtx();
		Rules.owner()(ctx);
		expect(ctx.requireOwner).toHaveBeenCalled();
	});

	it('Rules.fullEditor() calls ctx.requireFullEditor()', () => {
		const ctx = mockCtx();
		Rules.fullEditor()(ctx);
		expect(ctx.requireFullEditor).toHaveBeenCalled();
	});

	it('Rules.manageMembers() calls ctx.requireManageMembers()', () => {
		const ctx = mockCtx();
		Rules.manageMembers()(ctx);
		expect(ctx.requireManageMembers).toHaveBeenCalled();
	});
});

describe('Rules.any()', () => {
	it('passes if at least one rule passes', () => {
		const ctx = mockCtx();
		const pass: PermissionRule = () => {};
		const fail: PermissionRule = () => {
			throw Object.assign(new Error('forbidden'), { status: 403 });
		};

		expect(() => Rules.any(fail, pass)(ctx)).not.toThrow();
	});

	it('throws 403 if all rules fail', () => {
		const ctx = mockCtx();
		const fail1: PermissionRule = () => {
			throw Object.assign(new Error('no view'), { status: 403 });
		};
		const fail2: PermissionRule = () => {
			throw Object.assign(new Error('no edit'), { status: 403 });
		};

		expect(() => Rules.any(fail1, fail2)(ctx)).toThrow();
	});

	it('passes with zero rules (vacuous truth)', () => {
		const ctx = mockCtx();
		expect(() => Rules.any()(ctx)).not.toThrow();
	});
});

describe('Rules.all()', () => {
	it('passes if all rules pass', () => {
		const ctx = mockCtx();
		const pass1: PermissionRule = () => {};
		const pass2: PermissionRule = () => {};

		expect(() => Rules.all(pass1, pass2)(ctx)).not.toThrow();
	});

	it('throws on first failure', () => {
		const ctx = mockCtx();
		const pass: PermissionRule = () => {};
		const fail: PermissionRule = () => {
			throw Object.assign(new Error('forbidden'), { status: 403 });
		};
		const neverCalled = vi.fn();

		expect(() => Rules.all(pass, fail, neverCalled)(ctx)).toThrow();
		expect(neverCalled).not.toHaveBeenCalled();
	});

	it('passes with zero rules (vacuous truth)', () => {
		const ctx = mockCtx();
		expect(() => Rules.all()(ctx)).not.toThrow();
	});
});
