import assert from 'node:assert/strict';
import { test } from 'node:test';
import { observePrint } from './print-observation.mjs';

test('print observation counts real events, restores listeners and leaves print intact', () => {
	const target = new EventTarget();
	const print = () => {
		throw new Error('Must not invoke native print');
	};
	target.print = print;
	assert.deepEqual(observePrint(target, 'state'), { armed: false, before: 0, after: 0 });
	assert.deepEqual(observePrint(target, 'arm'), { armed: true, before: 0, after: 0 });
	assert.throws(() => observePrint(target, 'arm'), /Restore/);
	target.dispatchEvent(new Event('beforeprint'));
	target.dispatchEvent(new Event('afterprint'));
	target.dispatchEvent(new Event('beforeprint'));
	assert.deepEqual(observePrint(target, 'state'), { armed: true, before: 2, after: 1 });
	assert.equal(target.print, print);
	const previous = target.__mapPrintObservation;
	assert.deepEqual(observePrint(target, 'restore'), { restored: true });
	target.dispatchEvent(new Event('afterprint'));
	assert.equal(previous.after, 1);
	assert.deepEqual(observePrint(target, 'state'), { armed: false, before: 0, after: 0 });
	assert.deepEqual(observePrint(target, 'restore'), { restored: false });
	assert.deepEqual(observePrint(target, 'arm'), { armed: true, before: 0, after: 0 });
	observePrint(target, 'restore');
});

test('print observation rejects unsupported actions without adding listeners or calling print', () => {
	const target = new EventTarget();
	target.print = () => {
		throw new Error('Must not invoke print');
	};
	assert.throws(() => observePrint(target, 'save'), /arm, state, or restore/);
	assert.deepEqual(observePrint(target, 'state'), { armed: false, before: 0, after: 0 });
});
