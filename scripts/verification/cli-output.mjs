import fs from 'node:fs/promises';
import path from 'node:path';
import { Blocked } from './core.mjs';
import { isUnderEvidence, textContent } from './browser.mjs';

export function commandArguments(input, environment = process.env) {
	const args = [...input];
	const index = args.indexOf('--worker');
	const worker = index < 0 ? (environment.VERIFY_WORKER ?? '1') : args.splice(index, 2)[1];
	if (!['1', '2'].includes(worker)) throw new Blocked('WORKER', 'Choose --worker 1 or --worker 2.');
	return { args, worker };
}

export function toolArguments(input) {
	const args = [...input];
	const textIndex = args.indexOf('--text');
	const text = textIndex >= 0;
	if (text) args.splice(textIndex, 1);
	const saveIndex = args.indexOf('--save');
	const save = saveIndex < 0 ? undefined : args.splice(saveIndex, 2)[1];
	if (saveIndex >= 0 && (!save || save.startsWith('--')))
		throw new Blocked('ARGUMENTS', '--save needs a path under .verification/evidence/.');
	if (args.length < 1 || args.length > 2)
		throw new Blocked('ARGUMENTS', "Use tool NAME '{...}' [--text] [--save PATH].");
	return { name: args[0], args: JSON.parse(args[1] ?? '{}'), text, save };
}

async function assertSavePath(options, evidenceDirectory) {
	if (options.save && !(await isUnderEvidence(options.save, evidenceDirectory)))
		throw new Blocked('EVIDENCE_PATH', '--save needs a path under .verification/evidence/, without .. or a symlink.');
	if (options.save && (await fs.stat(options.save).catch(() => null)))
		throw new Blocked('EVIDENCE_EXISTS', `--save ${options.save} already exists; choose a new file name.`);
}

export async function runTool(input, request, evidenceDirectory) {
	const options = toolArguments(input);
	await assertSavePath(options, evidenceDirectory);
	const result = await request({ command: 'tool', name: options.name, args: options.args });
	return { result, output: await toolOutput(result, options, evidenceDirectory) };
}

export async function toolOutput(result, options, evidenceDirectory) {
	const output = options.text && result.content ? textContent(result) : JSON.stringify(result, null, 2);
	if (options.save) {
		await assertSavePath(options, evidenceDirectory);
		await fs.mkdir(path.dirname(options.save), { recursive: true });
		await fs.writeFile(options.save, `${output}\n`, { mode: 0o600, flag: 'wx' });
	}
	return output;
}
