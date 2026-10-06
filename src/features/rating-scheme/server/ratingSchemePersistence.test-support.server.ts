import { createTestContext as createMemoryTestContext } from '$lib/server/adapters/inMemory';
import { createInMemoryRatingSchemePersistence } from './inMemoryRatingSchemePersistence.server';

export function createTestContext(options?: Parameters<typeof createMemoryTestContext>[0]) {
	return createMemoryTestContext({
		...options,
		ratingSchemeFactory: createInMemoryRatingSchemePersistence
	});
}
