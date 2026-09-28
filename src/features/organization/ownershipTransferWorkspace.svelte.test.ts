import { describe, expect, it } from 'vitest';
import { createOwnershipTransferWorkspace } from './ownershipTransferWorkspace.svelte';

describe('ownership transfer confirmation', () => {
	it('keeps the dialog blocked until the selected member email matches and clears confirmation on close', () => {
		const state = createOwnershipTransferWorkspace([
			{ id: 'member-1', userId: 'user-1', email: 'member@example.com', membershipRole: 'member' }
		]);

		state.openTransferConfirmation('user-1');
		expect(state.showTransferConfirm).toBe(true);
		expect(state.transferConfirmMatches).toBe(false);

		state.transferConfirmText = ' MEMBER@EXAMPLE.COM ';
		expect(state.transferConfirmMatches).toBe(true);
		expect(state.transferCloseBlocked).toBe(true);

		state.closeTransferConfirmation();
		expect(state.showTransferConfirm).toBe(false);
		expect(state.transferConfirmText).toBe('');
	});
});
