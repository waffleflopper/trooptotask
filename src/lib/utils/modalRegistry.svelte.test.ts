import { describe, it, expect } from 'vitest';
import { ModalRegistry } from './modalRegistry.svelte';

describe('ModalRegistry', () => {
	it('isOpen returns false for unknown modal', () => {
		const registry = new ModalRegistry();
		expect(registry.isOpen('foo')).toBe(false);
	});

	it('open makes isOpen return true', () => {
		const registry = new ModalRegistry();
		registry.open('foo');
		expect(registry.isOpen('foo')).toBe(true);
	});

	it('close makes isOpen return false', () => {
		const registry = new ModalRegistry();
		registry.open('foo');
		registry.close('foo');
		expect(registry.isOpen('foo')).toBe(false);
	});

	it('closing already-closed modal is a no-op', () => {
		const registry = new ModalRegistry();
		expect(() => registry.close('nonexistent')).not.toThrow();
		expect(registry.isOpen('nonexistent')).toBe(false);
	});

	it('open with payload stores the payload', () => {
		const registry = new ModalRegistry();
		const data = { id: 1, name: 'test' };
		registry.open('foo', data);
		expect(registry.isOpen('foo')).toBe(true);
		expect(registry.payload<{ id: number; name: string }>('foo')).toEqual(data);
	});

	it('payload returns undefined for closed modal', () => {
		const registry = new ModalRegistry();
		registry.open('foo', { id: 1 });
		registry.close('foo');
		expect(registry.payload('foo')).toBeUndefined();
	});

	it('payload returns undefined for modal opened without payload', () => {
		const registry = new ModalRegistry();
		registry.open('foo');
		expect(registry.payload('foo')).toBeUndefined();
	});

	it('closeAll closes all open modals', () => {
		const registry = new ModalRegistry();
		registry.open('foo');
		registry.open('bar', { x: 1 });
		registry.open('baz');
		registry.closeAll();
		expect(registry.isOpen('foo')).toBe(false);
		expect(registry.isOpen('bar')).toBe(false);
		expect(registry.isOpen('baz')).toBe(false);
		expect(registry.payload('bar')).toBeUndefined();
	});

	it('closerFor returns a function that closes the modal', () => {
		const registry = new ModalRegistry();
		registry.open('foo');
		const closer = registry.closerFor('foo');
		expect(typeof closer).toBe('function');
		closer();
		expect(registry.isOpen('foo')).toBe(false);
	});

	it('multiple modals can be open simultaneously', () => {
		const registry = new ModalRegistry();
		registry.open('foo');
		registry.open('bar');
		registry.open('baz');
		expect(registry.isOpen('foo')).toBe(true);
		expect(registry.isOpen('bar')).toBe(true);
		expect(registry.isOpen('baz')).toBe(true);
		registry.close('bar');
		expect(registry.isOpen('foo')).toBe(true);
		expect(registry.isOpen('bar')).toBe(false);
		expect(registry.isOpen('baz')).toBe(true);
	});
});
