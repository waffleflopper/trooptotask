import type { DutyTemplateSlotBlockingMode } from './duty-roster.types';

export function resolveSlotBlockingMode(
	templateIsBlocking: boolean,
	blockingMode: DutyTemplateSlotBlockingMode | undefined
): boolean {
	if (blockingMode === 'blocking') {
		return true;
	}
	if (blockingMode === 'non-blocking') {
		return false;
	}
	return templateIsBlocking;
}
