import {
	createTestContext as createMemoryTestContext,
	createWritePortsContext as createMemoryWriteContext
} from '$lib/server/adapters/inMemory';
import { createInMemoryCriticalTaskLibraryPersistence } from './inMemoryCriticalTaskLibrary.server';
import { createInMemoryCriticalTasksReadModelAdapter } from './inMemoryCriticalTasksReadModel.server';

function withTaskLibrary<
	T extends {
		rawStore: Parameters<typeof createInMemoryCriticalTaskLibraryPersistence>[0];
		auth: { orgId: string };
	}
>(ctx: T) {
	const criticalTaskLibrary = createInMemoryCriticalTaskLibraryPersistence(ctx.rawStore, ctx.auth.orgId);
	return {
		...ctx,
		criticalTaskLibrary,
		criticalTasksReadModel: createInMemoryCriticalTasksReadModelAdapter(ctx.rawStore, criticalTaskLibrary)
	};
}

export function createTestContext(options?: Parameters<typeof createMemoryTestContext>[0]) {
	const injected = { ...options, criticalTaskLibraryFactory: createInMemoryCriticalTaskLibraryPersistence };
	return withTaskLibrary(createMemoryTestContext(injected));
}

export function createWritePortsContext(options?: Parameters<typeof createMemoryWriteContext>[0]) {
	const injected = { ...options, criticalTaskLibraryFactory: createInMemoryCriticalTaskLibraryPersistence };
	return withTaskLibrary(createMemoryWriteContext(injected));
}
