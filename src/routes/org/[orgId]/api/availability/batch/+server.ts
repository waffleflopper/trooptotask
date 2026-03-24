import { handle } from '$lib/server/adapters/httpAdapter';
import { createAvailabilityBatch, deleteAvailabilityBatch } from '$lib/server/core/useCases/availabilityBatch';

// Use case functions validate input internally; handle() parses raw JSON body
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyInput = any;

export const POST = handle<AnyInput, unknown>({
	permission: 'calendar',
	mutation: true,
	fn: (ctx, input) => createAvailabilityBatch(ctx, input)
});

export const DELETE = handle<AnyInput, unknown>({
	permission: 'calendar',
	mutation: true,
	fn: (ctx, input) => deleteAvailabilityBatch(ctx, input)
});
