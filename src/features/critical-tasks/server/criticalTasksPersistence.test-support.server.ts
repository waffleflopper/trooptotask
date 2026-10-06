import {
	createTestContext as createMemoryTestContext,
	createWritePortsContext as createMemoryWriteContext
} from '$lib/server/adapters/inMemory';
import { createInMemoryCriticalTaskCompletionPersistence } from './inMemoryCriticalTaskCompletion.server';
import { createInMemoryCriticalTaskLibraryPersistence } from './inMemoryCriticalTaskLibrary.server';
import { createInMemoryCriticalTasksReadModelAdapter } from './inMemoryCriticalTasksReadModel.server';

export function createTestContext(options?: Parameters<typeof createMemoryTestContext>[0]) {
	return createMemoryTestContext({
		...options,
		criticalTaskLibraryFactory: createInMemoryCriticalTaskLibraryPersistence,
		criticalTaskCompletionsFactory: createInMemoryCriticalTaskCompletionPersistence,
		criticalTasksReadModelFactory: options?.criticalTasksReadModelFactory ?? createInMemoryCriticalTasksReadModelAdapter
	});
}

export function createWritePortsContext(options?: Parameters<typeof createMemoryWriteContext>[0]) {
	return createMemoryWriteContext({
		...options,
		criticalTaskLibraryFactory: createInMemoryCriticalTaskLibraryPersistence,
		criticalTaskCompletionsFactory: createInMemoryCriticalTaskCompletionPersistence,
		criticalTasksReadModelFactory: options?.criticalTasksReadModelFactory ?? createInMemoryCriticalTasksReadModelAdapter
	});
}
