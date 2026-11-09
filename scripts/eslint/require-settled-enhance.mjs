import path from 'node:path';
import ts from 'typescript';

const configurations = new Map();

function compilerOptions(filename) {
	const configFile = ts.findConfigFile(path.dirname(filename), ts.sys.fileExists);
	if (!configFile) return {};
	if (!configurations.has(configFile)) {
		const config = ts.getParsedCommandLineOfConfigFile(
			configFile,
			{},
			{
				...ts.sys,
				onUnRecoverableConfigFileDiagnostic: () => {}
			}
		);
		configurations.set(configFile, config?.options ?? {});
	}
	return configurations.get(configFile);
}

function referencesSettlement(file) {
	const text = ts.sys.readFile(file);
	if (!text?.includes('settleAction')) return false;
	const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
	// A module settles when it calls or re-exports settleAction; the module that only declares it, beside
	// helpers such as restoreFocus, does not.
	function visit(node) {
		if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'settleAction')
			return true;
		if (ts.isExportSpecifier(node) && (node.propertyName ?? node.name).text === 'settleAction') return true;
		return ts.forEachChild(node, visit) ?? false;
	}
	return visit(source);
}

export default {
	meta: {
		type: 'problem',
		docs: { description: 'Keep form drafts when an enhanced action throws.' },
		schema: [],
		messages: {
			unsettled:
				'Settle use:enhance through settleAction so a thrown action keeps the draft. Call it here or import a local helper that calls it.'
		}
	},
	create(context) {
		const directives = [];
		const imports = new Map();
		function importedHelperSettles(declaration) {
			if (declaration.importKind === 'type') return false;
			const specifier = declaration.source.value;
			if (!imports.has(specifier)) {
				const resolved = ts.resolveModuleName(
					specifier,
					context.filename,
					compilerOptions(context.filename),
					ts.sys
				).resolvedModule;
				imports.set(
					specifier,
					!!resolved &&
						!resolved.isExternalLibraryImport &&
						!resolved.resolvedFileName.includes('/node_modules/') &&
						referencesSettlement(resolved.resolvedFileName)
				);
			}
			return imports.get(specifier);
		}
		return {
			SvelteDirective(node) {
				if (node.kind === 'Action' && node.key.name.name === 'enhance') directives.push(node);
			},
			'Program:exit'() {
				if (directives.length === 0) return;
				const bindings = new Map();
				for (const scope of context.sourceCode.scopeManager.scopes) {
					for (const reference of scope.references) bindings.set(reference.identifier, reference.resolved);
				}
				function settles(node, seen = new Set()) {
					if (!node || seen.has(node)) return false;
					seen.add(node);
					if (node.type === 'Identifier') {
						if (node.name === 'settleAction') return true;
						const binding = bindings.get(node);
						if (
							binding?.defs.some((definition) => {
								if (definition.type === 'ImportBinding')
									return definition.node.importKind !== 'type' && importedHelperSettles(definition.parent);
								return (
									(definition.type === 'Variable' || definition.type === 'FunctionName') &&
									settles(definition.node, seen)
								);
							})
						)
							return true;
					}
					return (context.sourceCode.visitorKeys[node.type] ?? []).some((key) => {
						const child = node[key];
						return Array.isArray(child) ? child.some((entry) => settles(entry, seen)) : settles(child, seen);
					});
				}
				for (const node of directives) {
					if (!settles(node.expression)) context.report({ node, messageId: 'unsettled' });
				}
			}
		};
	}
};
