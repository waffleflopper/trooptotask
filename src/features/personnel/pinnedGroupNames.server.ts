import type { SelfPinPersistence } from './contracts';
export function listPinnedGroupNames(ctx: { selfPins: Pick<SelfPinPersistence, 'listNames'> }): Promise<string[]> {
	return ctx.selfPins.listNames();
}
