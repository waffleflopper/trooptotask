import { describe, it, expect } from 'vitest';
import { createReactiveCollection, createReactiveValue } from './reactiveState.svelte';

describe('createReactiveCollection', () => {
	it('should start with empty array by default', () => {
		const collection = createReactiveCollection<{ id: string }>();
		expect(collection.items).toEqual([]);
	});

	it('should start with provided initial items', () => {
		const initial = [{ id: '1' }, { id: '2' }];
		const collection = createReactiveCollection(initial);
		expect(collection.items).toEqual(initial);
	});

	it('should replace items via set()', () => {
		const collection = createReactiveCollection<{ id: string }>();
		const newItems = [{ id: 'a' }, { id: 'b' }];
		collection.set(newItems);
		expect(collection.items).toEqual(newItems);
	});

	it('should return current items via getSnapshot()', () => {
		const collection = createReactiveCollection<{ id: string }>();
		const items = [{ id: '1' }];
		collection.set(items);
		expect(collection.getSnapshot()).toEqual(items);
	});
});

describe('createReactiveValue', () => {
	it('should hold the initial value', () => {
		const val = createReactiveValue('hello');
		expect(val.value).toBe('hello');
	});

	it('should replace value via set()', () => {
		const val = createReactiveValue(0);
		val.set(42);
		expect(val.value).toBe(42);
	});
});
