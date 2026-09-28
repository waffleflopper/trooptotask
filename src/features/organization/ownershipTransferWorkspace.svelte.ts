import type { OwnershipTransferCandidate } from './ownershipTransferSettings';

export class OwnershipTransferWorkspace {
	readonly #getCandidates: () => OwnershipTransferCandidate[];

	showTransferConfirm = $state(false);
	transferTargetId = $state<string | null>(null);
	transferConfirmText = $state('');

	constructor(candidates: OwnershipTransferCandidate[] | (() => OwnershipTransferCandidate[])) {
		this.#getCandidates = typeof candidates === 'function' ? candidates : () => candidates;
	}

	get selectedTransferCandidate(): OwnershipTransferCandidate | null {
		return this.#getCandidates().find((candidate) => candidate.userId === this.transferTargetId) ?? null;
	}

	get transferConfirmMatches(): boolean {
		const email = this.selectedTransferCandidate?.email;
		return Boolean(email && this.transferConfirmText.trim().toLowerCase() === email.toLowerCase());
	}

	get transferCloseBlocked(): boolean {
		return this.transferConfirmText.trim() !== '';
	}

	openTransferConfirmation(candidateId?: string | null): void {
		if (candidateId !== undefined) this.transferTargetId = candidateId;
		this.showTransferConfirm = true;
	}

	closeTransferConfirmation(): void {
		this.showTransferConfirm = false;
		this.transferConfirmText = '';
	}
}

export function createOwnershipTransferWorkspace(
	candidates: OwnershipTransferCandidate[] | (() => OwnershipTransferCandidate[])
): OwnershipTransferWorkspace {
	return new OwnershipTransferWorkspace(candidates);
}
