#!/usr/bin/env node
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path, { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { StringDecoder } from "node:string_decoder";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
//#endregion
//#region src/cli/args.ts
var BOOLEAN_FLAGS = /* @__PURE__ */ new Set([
	"pretty",
	"dry-run",
	"force",
	"fast",
	"external",
	"create",
	"help",
	"response",
	"overwrite"
]);
/** Splits argv into a subcommand, positionals and flags. Repeated flags accumulate in order. */
function parseArgs(argv) {
	const positionals = [];
	const flags = {};
	let pretty = false;
	const push = (name, value) => {
		(flags[name] ??= []).push(value);
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--") {
			positionals.push(...argv.slice(i + 1));
			break;
		}
		if (!arg.startsWith("--") || arg === "--") {
			positionals.push(arg);
			continue;
		}
		const eq = arg.indexOf("=");
		const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
		if (name === "pretty") {
			pretty = !(eq !== -1 && arg.slice(eq + 1) === "false");
			continue;
		}
		if (eq !== -1) push(name, arg.slice(eq + 1));
		else if (BOOLEAN_FLAGS.has(name)) push(name, "true");
		else {
			const next = argv[i + 1];
			if (next === void 0 || next.startsWith("--")) push(name, "true");
			else {
				push(name, next);
				i++;
			}
		}
	}
	const [command, ...rest] = positionals;
	return {
		command,
		positionals: rest,
		flags,
		pretty
	};
}
/** The last value given for a value flag. */
function flag(args, name) {
	const values = args.flags[name];
	return values?.[values.length - 1];
}
/** Every value given for a repeatable value flag, in order. */
function flagAll(args, name) {
	return args.flags[name] ?? [];
}
/** The one accessor for boolean flags: present means true, `--name=false` means false. */
function boolFlag(args, name) {
	const value = flag(args, name);
	return value !== void 0 && value !== "false";
}
//#endregion
//#region src/cli/errors.ts
/** A failure a command reports as `error` in its CliResult. `code` must be one
*  of the strings in output.ts's exit-code map. */
var CliFailure = class extends Error {
	code;
	candidates;
	constructor(code, message, candidates) {
		super(message);
		this.name = "CliFailure";
		this.code = code;
		this.candidates = candidates;
	}
	toCliError() {
		return {
			code: this.code,
			message: this.message,
			...this.candidates ? { candidates: this.candidates } : {}
		};
	}
};
var LossyFileError = class extends CliFailure {
	constructor(findings) {
		super("LOSSY_FILE", "Rewriting this file would drop content c4hero does not model. Edit the DSL by hand, or pass --force to accept the loss.", findings);
	}
};
var ParseFailedError = class extends CliFailure {
	constructor(message, errors) {
		super("PARSE_FAILED", message, errors);
	}
};
//#endregion
//#region node_modules/immer/dist/immer.mjs
var NOTHING = Symbol.for("immer-nothing");
var DRAFTABLE = Symbol.for("immer-draftable");
var DRAFT_STATE = Symbol.for("immer-state");
function die(error, ...args) {
	throw new Error(`[Immer] minified error nr: ${error}. Full error at: https://bit.ly/3cXEKWf`);
}
var O = Object;
var getPrototypeOf = O.getPrototypeOf;
var CONSTRUCTOR = "constructor";
var PROTOTYPE = "prototype";
var CONFIGURABLE = "configurable";
var ENUMERABLE = "enumerable";
var WRITABLE = "writable";
var VALUE = "value";
var isDraft = (value) => !!value && !!value[DRAFT_STATE];
function isDraftable(value) {
	if (!value) return false;
	return isPlainObject(value) || isArray(value) || !!value[DRAFTABLE] || !!value[CONSTRUCTOR]?.[DRAFTABLE] || isMap(value) || isSet(value);
}
var objectCtorString = O[PROTOTYPE][CONSTRUCTOR].toString();
var cachedCtorStrings = /* @__PURE__ */ new WeakMap();
function isPlainObject(value) {
	if (!value || !isObjectish(value)) return false;
	const proto = getPrototypeOf(value);
	if (proto === null || proto === O[PROTOTYPE]) return true;
	const Ctor = O.hasOwnProperty.call(proto, CONSTRUCTOR) && proto[CONSTRUCTOR];
	if (Ctor === Object) return true;
	if (!isFunction(Ctor)) return false;
	let ctorString = cachedCtorStrings.get(Ctor);
	if (ctorString === void 0) {
		ctorString = Function.toString.call(Ctor);
		cachedCtorStrings.set(Ctor, ctorString);
	}
	return ctorString === objectCtorString;
}
function original(value) {
	if (!isDraft(value)) die(15, value);
	return value[DRAFT_STATE].base_;
}
function each(obj, iter, strict = true) {
	if (getArchtype(obj) === 0) (strict ? Reflect.ownKeys(obj) : O.keys(obj)).forEach((key) => {
		iter(key, obj[key], obj);
	});
	else obj.forEach((entry, index) => iter(index, entry, obj));
}
function getArchtype(thing) {
	const state = thing[DRAFT_STATE];
	return state ? state.type_ : isArray(thing) ? 1 : isMap(thing) ? 2 : isSet(thing) ? 3 : 0;
}
var has = (thing, prop, type = getArchtype(thing)) => type === 2 ? thing.has(prop) : O[PROTOTYPE].hasOwnProperty.call(thing, prop);
var get = (thing, prop, type = getArchtype(thing)) => type === 2 ? thing.get(prop) : thing[prop];
var set = (thing, propOrOldValue, value, type = getArchtype(thing)) => {
	if (type === 2) thing.set(propOrOldValue, value);
	else if (type === 3) thing.add(value);
	else thing[propOrOldValue] = value;
};
function is(x, y) {
	if (x === y) return x !== 0 || 1 / x === 1 / y;
	else return x !== x && y !== y;
}
var isArray = Array.isArray;
var isMap = (target) => target instanceof Map;
var isSet = (target) => target instanceof Set;
var isObjectish = (target) => typeof target === "object";
var isFunction = (target) => typeof target === "function";
var isBoolean = (target) => typeof target === "boolean";
function isArrayIndex(value) {
	const n = +value;
	return Number.isInteger(n) && String(n) === value;
}
var latest = (state) => state.copy_ || state.base_;
var getFinalValue = (state) => state.modified_ ? state.copy_ : state.base_;
function shallowCopy(base, strict) {
	if (isMap(base)) return new Map(base);
	if (isSet(base)) return new Set(base);
	if (isArray(base)) return Array[PROTOTYPE].slice.call(base);
	const isPlain = isPlainObject(base);
	if (strict === true || strict === "class_only" && !isPlain) {
		const descriptors = O.getOwnPropertyDescriptors(base);
		delete descriptors[DRAFT_STATE];
		let keys = Reflect.ownKeys(descriptors);
		for (let i = 0; i < keys.length; i++) {
			const key = keys[i];
			const desc = descriptors[key];
			if (desc[WRITABLE] === false) {
				desc[WRITABLE] = true;
				desc[CONFIGURABLE] = true;
			}
			if (desc.get || desc.set) descriptors[key] = {
				[CONFIGURABLE]: true,
				[WRITABLE]: true,
				[ENUMERABLE]: desc[ENUMERABLE],
				[VALUE]: base[key]
			};
		}
		return O.create(getPrototypeOf(base), descriptors);
	} else {
		const proto = getPrototypeOf(base);
		if (proto !== null && isPlain) return { ...base };
		const obj = O.create(proto);
		return O.assign(obj, base);
	}
}
function freeze(obj, deep = false) {
	if (isFrozen(obj) || isDraft(obj) || !isDraftable(obj)) return obj;
	if (getArchtype(obj) > 1) O.defineProperties(obj, {
		set: dontMutateMethodOverride,
		add: dontMutateMethodOverride,
		clear: dontMutateMethodOverride,
		delete: dontMutateMethodOverride
	});
	O.freeze(obj);
	if (deep) each(obj, (_key, value) => {
		freeze(value, true);
	}, false);
	return obj;
}
function dontMutateFrozenCollections() {
	die(2);
}
var dontMutateMethodOverride = { [VALUE]: dontMutateFrozenCollections };
function isFrozen(obj) {
	if (obj === null || !isObjectish(obj)) return true;
	return O.isFrozen(obj);
}
var PluginMapSet = "MapSet";
var PluginPatches = "Patches";
var PluginArrayMethods = "ArrayMethods";
var plugins = {};
function getPlugin(pluginKey) {
	const plugin = plugins[pluginKey];
	if (!plugin) die(0, pluginKey);
	return plugin;
}
var isPluginLoaded = (pluginKey) => !!plugins[pluginKey];
var currentScope;
var getCurrentScope = () => currentScope;
var createScope = (parent_, immer_) => ({
	drafts_: [],
	parent_,
	immer_,
	canAutoFreeze_: true,
	unfinalizedDrafts_: 0,
	handledSet_: /* @__PURE__ */ new Set(),
	processedForPatches_: /* @__PURE__ */ new Set(),
	mapSetPlugin_: isPluginLoaded(PluginMapSet) ? getPlugin(PluginMapSet) : void 0,
	arrayMethodsPlugin_: isPluginLoaded(PluginArrayMethods) ? getPlugin(PluginArrayMethods) : void 0
});
function usePatchesInScope(scope, patchListener) {
	if (patchListener) {
		scope.patchPlugin_ = getPlugin(PluginPatches);
		scope.patches_ = [];
		scope.inversePatches_ = [];
		scope.patchListener_ = patchListener;
	}
}
function revokeScope(scope) {
	leaveScope(scope);
	scope.drafts_.forEach(revokeDraft);
	scope.drafts_ = null;
}
function leaveScope(scope) {
	if (scope === currentScope) currentScope = scope.parent_;
}
var enterScope = (immer2) => currentScope = createScope(currentScope, immer2);
function revokeDraft(draft) {
	const state = draft[DRAFT_STATE];
	if (state.type_ === 0 || state.type_ === 1) state.revoke_();
	else state.revoked_ = true;
}
function processResult(result, scope) {
	scope.unfinalizedDrafts_ = scope.drafts_.length;
	const baseDraft = scope.drafts_[0];
	if (result !== void 0 && result !== baseDraft) {
		if (baseDraft[DRAFT_STATE].modified_) {
			revokeScope(scope);
			die(4);
		}
		if (isDraftable(result)) result = finalize(scope, result);
		const { patchPlugin_ } = scope;
		if (patchPlugin_) patchPlugin_.generateReplacementPatches_(baseDraft[DRAFT_STATE].base_, result, scope);
	} else result = finalize(scope, baseDraft);
	maybeFreeze(scope, result, true);
	revokeScope(scope);
	if (scope.patches_) scope.patchListener_(scope.patches_, scope.inversePatches_);
	return result !== NOTHING ? result : void 0;
}
function finalize(rootScope, value) {
	if (isFrozen(value)) return value;
	const state = value[DRAFT_STATE];
	if (!state) return handleValue(value, rootScope.handledSet_, rootScope);
	if (!isSameScope(state, rootScope)) return value;
	if (!state.modified_) return state.base_;
	if (!state.finalized_) {
		const { callbacks_ } = state;
		if (callbacks_) while (callbacks_.length > 0) callbacks_.pop()(rootScope);
		generatePatchesAndFinalize(state, rootScope);
	}
	return state.copy_;
}
function maybeFreeze(scope, value, deep = false) {
	if (!scope.parent_ && scope.immer_.autoFreeze_ && scope.canAutoFreeze_) freeze(value, deep);
}
function markStateFinalized(state) {
	state.finalized_ = true;
	state.scope_.unfinalizedDrafts_--;
}
var isSameScope = (state, rootScope) => state.scope_ === rootScope;
var EMPTY_LOCATIONS_RESULT = [];
function updateDraftInParent(parent, draftValue, finalizedValue, originalKey) {
	const parentCopy = latest(parent);
	const parentType = parent.type_;
	if (originalKey !== void 0) {
		if (get(parentCopy, originalKey, parentType) === draftValue) {
			set(parentCopy, originalKey, finalizedValue, parentType);
			return;
		}
	}
	if (!parent.draftLocations_) {
		const draftLocations = parent.draftLocations_ = /* @__PURE__ */ new Map();
		each(parentCopy, (key, value) => {
			if (isDraft(value)) {
				const keys = draftLocations.get(value) || [];
				keys.push(key);
				draftLocations.set(value, keys);
			}
		});
	}
	const locations = parent.draftLocations_.get(draftValue) ?? EMPTY_LOCATIONS_RESULT;
	for (const location of locations) set(parentCopy, location, finalizedValue, parentType);
}
function registerChildFinalizationCallback(parent, child, key) {
	parent.callbacks_.push(function childCleanup(rootScope) {
		const state = child;
		if (!state || !isSameScope(state, rootScope)) return;
		rootScope.mapSetPlugin_?.fixSetContents(state);
		const finalizedValue = getFinalValue(state);
		updateDraftInParent(parent, state.draft_ ?? state, finalizedValue, key);
		generatePatchesAndFinalize(state, rootScope);
	});
}
function generatePatchesAndFinalize(state, rootScope) {
	if (state.modified_ && !state.finalized_ && (state.type_ === 3 || state.type_ === 1 && state.allIndicesReassigned_ || (state.assigned_?.size ?? 0) > 0)) {
		const { patchPlugin_ } = rootScope;
		if (patchPlugin_) {
			const basePath = patchPlugin_.getPath(state);
			if (basePath) patchPlugin_.generatePatches_(state, basePath, rootScope);
		}
		markStateFinalized(state);
	}
}
function handleCrossReference(target, key, value) {
	const { scope_ } = target;
	if (isDraft(value)) {
		const state = value[DRAFT_STATE];
		if (isSameScope(state, scope_)) state.callbacks_.push(function crossReferenceCleanup() {
			prepareCopy(target);
			updateDraftInParent(target, value, getFinalValue(state), key);
		});
	} else if (isDraftable(value)) target.callbacks_.push(function nestedDraftCleanup() {
		const targetCopy = latest(target);
		if (target.type_ === 3) {
			if (targetCopy.has(value)) handleValue(value, scope_.handledSet_, scope_);
		} else if (get(targetCopy, key, target.type_) === value) {
			if (scope_.drafts_.length > 1 && (target.assigned_.get(key) ?? false) === true && target.copy_) handleValue(get(target.copy_, key, target.type_), scope_.handledSet_, scope_);
		}
	});
}
function handleValue(target, handledSet, rootScope) {
	if (!rootScope.immer_.autoFreeze_ && rootScope.unfinalizedDrafts_ < 1) return target;
	if (isDraft(target) || handledSet.has(target) || !isDraftable(target) || isFrozen(target)) return target;
	handledSet.add(target);
	each(target, (key, value) => {
		if (isDraft(value)) {
			const state = value[DRAFT_STATE];
			if (isSameScope(state, rootScope)) {
				set(target, key, getFinalValue(state), target.type_);
				markStateFinalized(state);
			}
		} else if (isDraftable(value)) handleValue(value, handledSet, rootScope);
	});
	return target;
}
function createProxyProxy(base, parent) {
	const baseIsArray = isArray(base);
	const state = {
		type_: baseIsArray ? 1 : 0,
		scope_: parent ? parent.scope_ : getCurrentScope(),
		modified_: false,
		finalized_: false,
		assigned_: void 0,
		parent_: parent,
		base_: base,
		draft_: null,
		copy_: null,
		revoke_: null,
		isManual_: false,
		callbacks_: void 0
	};
	let target = state;
	let traps = objectTraps;
	if (baseIsArray) {
		target = [state];
		traps = arrayTraps;
	}
	const { revoke, proxy } = Proxy.revocable(target, traps);
	state.draft_ = proxy;
	state.revoke_ = revoke;
	return [proxy, state];
}
var objectTraps = {
	get(state, prop) {
		if (prop === DRAFT_STATE) return state;
		let arrayPlugin = state.scope_.arrayMethodsPlugin_;
		const isArrayWithStringProp = state.type_ === 1 && typeof prop === "string";
		if (isArrayWithStringProp) {
			if (arrayPlugin?.isArrayOperationMethod(prop)) return arrayPlugin.createMethodInterceptor(state, prop);
		}
		const source = latest(state);
		if (!has(source, prop, state.type_)) return readPropFromProto(state, source, prop);
		const value = source[prop];
		if (state.finalized_ || !isDraftable(value)) return value;
		if (isArrayWithStringProp && state.operationMethod && arrayPlugin?.isMutatingArrayMethod(state.operationMethod) && isArrayIndex(prop)) return value;
		if (value === peek(state.base_, prop) || isRelocatedBaseRef(state, prop, value)) {
			prepareCopy(state);
			const childKey = state.type_ === 1 ? +prop : prop;
			const childDraft = createProxy(state.scope_, value, state, childKey);
			return state.copy_[childKey] = childDraft;
		}
		return value;
	},
	has(state, prop) {
		return prop in latest(state);
	},
	ownKeys(state) {
		return Reflect.ownKeys(latest(state));
	},
	set(state, prop, value) {
		const desc = getDescriptorFromProto(latest(state), prop);
		if (desc?.set) {
			desc.set.call(state.draft_, value);
			return true;
		}
		if (!state.modified_) {
			const current2 = peek(latest(state), prop);
			const currentState = current2?.[DRAFT_STATE];
			if (currentState && currentState.base_ === value) {
				state.copy_[prop] = value;
				state.assigned_.set(prop, false);
				return true;
			}
			if (is(value, current2) && (value !== void 0 || has(state.base_, prop, state.type_))) return true;
			prepareCopy(state);
			markChanged(state);
		}
		if (state.copy_[prop] === value && (value !== void 0 || has(state.copy_, prop, state.type_)) || Number.isNaN(value) && Number.isNaN(state.copy_[prop])) return true;
		state.copy_[prop] = value;
		state.assigned_.set(prop, true);
		handleCrossReference(state, prop, value);
		return true;
	},
	deleteProperty(state, prop) {
		prepareCopy(state);
		if (peek(state.base_, prop) !== void 0 || prop in state.base_) {
			state.assigned_.set(prop, false);
			markChanged(state);
		} else state.assigned_.delete(prop);
		if (state.copy_) delete state.copy_[prop];
		return true;
	},
	getOwnPropertyDescriptor(state, prop) {
		const owner = latest(state);
		const desc = Reflect.getOwnPropertyDescriptor(owner, prop);
		if (!desc) return desc;
		return {
			[WRITABLE]: true,
			[CONFIGURABLE]: state.type_ !== 1 || prop !== "length",
			[ENUMERABLE]: desc[ENUMERABLE],
			[VALUE]: owner[prop]
		};
	},
	defineProperty() {
		die(11);
	},
	getPrototypeOf(state) {
		return getPrototypeOf(state.base_);
	},
	setPrototypeOf() {
		die(12);
	}
};
var arrayTraps = {};
for (let key in objectTraps) {
	let fn = objectTraps[key];
	arrayTraps[key] = function() {
		const args = arguments;
		args[0] = args[0][0];
		return fn.apply(this, args);
	};
}
arrayTraps.deleteProperty = function(state, prop) {
	return arrayTraps.set.call(this, state, prop, void 0);
};
arrayTraps.set = function(state, prop, value) {
	return objectTraps.set.call(this, state[0], prop, value, state[0]);
};
function peek(draft, prop) {
	const state = draft[DRAFT_STATE];
	return (state ? latest(state) : draft)[prop];
}
function isRelocatedBaseRef(state, prop, value) {
	if (state.type_ !== 1 || !state.allIndicesReassigned_ || state.assigned_?.get(prop) || !isDraftable(value) || value[DRAFT_STATE]) return false;
	return state.baseRefs_.has(value);
}
function readPropFromProto(state, source, prop) {
	const desc = getDescriptorFromProto(source, prop);
	return desc ? VALUE in desc ? desc[VALUE] : desc.get?.call(state.draft_) : void 0;
}
function getDescriptorFromProto(source, prop) {
	if (!(prop in source)) return void 0;
	let proto = getPrototypeOf(source);
	while (proto) {
		const desc = Object.getOwnPropertyDescriptor(proto, prop);
		if (desc) return desc;
		proto = getPrototypeOf(proto);
	}
}
function markChanged(state) {
	if (!state.modified_) {
		state.modified_ = true;
		if (state.parent_) markChanged(state.parent_);
	}
}
function prepareCopy(state) {
	if (!state.copy_) {
		state.assigned_ = /* @__PURE__ */ new Map();
		state.copy_ = shallowCopy(state.base_, state.scope_.immer_.useStrictShallowCopy_);
	}
}
var Immer2 = class {
	constructor(config) {
		this.autoFreeze_ = true;
		this.useStrictShallowCopy_ = false;
		this.useStrictIteration_ = false;
		/**
		* The `produce` function takes a value and a "recipe function" (whose
		* return value often depends on the base state). The recipe function is
		* free to mutate its first argument however it wants. All mutations are
		* only ever applied to a __copy__ of the base state.
		*
		* Pass only a function to create a "curried producer" which relieves you
		* from passing the recipe function every time.
		*
		* Only plain objects and arrays are made mutable. All other objects are
		* considered uncopyable.
		*
		* Note: This function is __bound__ to its `Immer` instance.
		*
		* @param {any} base - the initial state
		* @param {Function} recipe - function that receives a proxy of the base state as first argument and which can be freely modified
		* @param {Function} patchListener - optional function that will be called with all the patches produced here
		* @returns {any} a new state, or the initial state if nothing was modified
		*/
		this.produce = (base, recipe, patchListener) => {
			if (isFunction(base) && !isFunction(recipe)) {
				const defaultBase = recipe;
				recipe = base;
				const self = this;
				return function curriedProduce(base2 = defaultBase, ...args) {
					return self.produce(base2, (draft) => recipe.call(this, draft, ...args));
				};
			}
			if (!isFunction(recipe)) die(6);
			if (patchListener !== void 0 && !isFunction(patchListener)) die(7);
			let result;
			if (isDraftable(base)) {
				const scope = enterScope(this);
				const proxy = createProxy(scope, base, void 0);
				let hasError = true;
				try {
					result = recipe(proxy);
					hasError = false;
				} finally {
					if (hasError) revokeScope(scope);
					else leaveScope(scope);
				}
				usePatchesInScope(scope, patchListener);
				return processResult(result, scope);
			} else if (!base || !isObjectish(base)) {
				result = recipe(base);
				if (result === void 0) result = base;
				if (result === NOTHING) result = void 0;
				if (this.autoFreeze_) freeze(result, true);
				if (patchListener) {
					const p = [];
					const ip = [];
					getPlugin(PluginPatches).generateReplacementPatches_(base, result, {
						patches_: p,
						inversePatches_: ip
					});
					patchListener(p, ip);
				}
				return result;
			} else die(1, base);
		};
		this.produceWithPatches = (base, recipe) => {
			if (isFunction(base)) return (state, ...args) => this.produceWithPatches(state, (draft) => base(draft, ...args));
			let patches, inversePatches;
			return [
				this.produce(base, recipe, (p, ip) => {
					patches = p;
					inversePatches = ip;
				}),
				patches,
				inversePatches
			];
		};
		if (isBoolean(config?.autoFreeze)) this.setAutoFreeze(config.autoFreeze);
		if (isBoolean(config?.useStrictShallowCopy)) this.setUseStrictShallowCopy(config.useStrictShallowCopy);
		if (isBoolean(config?.useStrictIteration)) this.setUseStrictIteration(config.useStrictIteration);
	}
	createDraft(base) {
		if (!isDraftable(base)) die(8);
		if (isDraft(base)) base = current(base);
		const scope = enterScope(this);
		const proxy = createProxy(scope, base, void 0);
		proxy[DRAFT_STATE].isManual_ = true;
		leaveScope(scope);
		return proxy;
	}
	finishDraft(draft, patchListener) {
		const state = draft && draft[DRAFT_STATE];
		if (!state || !state.isManual_) die(9);
		const { scope_: scope } = state;
		usePatchesInScope(scope, patchListener);
		return processResult(void 0, scope);
	}
	/**
	* Pass true to automatically freeze all copies created by Immer.
	*
	* By default, auto-freezing is enabled.
	*/
	setAutoFreeze(value) {
		this.autoFreeze_ = value;
	}
	/**
	* Pass true to enable strict shallow copy.
	*
	* By default, immer does not copy the object descriptors such as getter, setter and non-enumrable properties.
	*/
	setUseStrictShallowCopy(value) {
		this.useStrictShallowCopy_ = value;
	}
	/**
	* Pass false to use faster iteration that skips non-enumerable properties
	* but still handles symbols for compatibility.
	*
	* By default, strict iteration is enabled (includes all own properties).
	*/
	setUseStrictIteration(value) {
		this.useStrictIteration_ = value;
	}
	shouldUseStrictIteration() {
		return this.useStrictIteration_;
	}
	applyPatches(base, patches) {
		let i;
		for (i = patches.length - 1; i >= 0; i--) {
			const patch = patches[i];
			if (patch.path.length === 0 && patch.op === "replace") {
				base = patch.value;
				break;
			}
		}
		if (i > -1) patches = patches.slice(i + 1);
		const applyPatchesImpl = getPlugin(PluginPatches).applyPatches_;
		if (isDraft(base)) return applyPatchesImpl(base, patches);
		return this.produce(base, (draft) => applyPatchesImpl(draft, patches));
	}
};
function createProxy(rootScope, value, parent, key) {
	const [draft, state] = isMap(value) ? getPlugin(PluginMapSet).proxyMap_(value, parent) : isSet(value) ? getPlugin(PluginMapSet).proxySet_(value, parent) : createProxyProxy(value, parent);
	(parent?.scope_ ?? getCurrentScope()).drafts_.push(draft);
	state.callbacks_ = parent?.callbacks_ ?? [];
	state.key_ = key;
	if (parent && key !== void 0) registerChildFinalizationCallback(parent, state, key);
	else state.callbacks_.push(function rootDraftCleanup(rootScope2) {
		rootScope2.mapSetPlugin_?.fixSetContents(state);
		const { patchPlugin_ } = rootScope2;
		if (state.modified_ && patchPlugin_) patchPlugin_.generatePatches_(state, [], rootScope2);
	});
	return draft;
}
function current(value) {
	if (!isDraft(value)) die(10, value);
	return currentImpl(value);
}
function currentImpl(value) {
	if (!isDraftable(value) || isFrozen(value)) return value;
	const state = value[DRAFT_STATE];
	let copy;
	let strict = true;
	if (state) {
		if (!state.modified_) return state.base_;
		state.finalized_ = true;
		copy = shallowCopy(value, state.scope_.immer_.useStrictShallowCopy_);
		strict = state.scope_.immer_.shouldUseStrictIteration();
	} else copy = shallowCopy(value, true);
	each(copy, (key, childValue) => {
		set(copy, key, currentImpl(childValue));
	}, strict);
	if (state) state.finalized_ = false;
	return copy;
}
globalThis.Iterator?.from;
var produce = new Immer2().produce;
//#endregion
//#region src/lib/deployment.ts
/** Depth-first walk over an environment's deployment node tree. */
function walkDeploymentNodes(env, visit) {
	const stack = [...env.deploymentNodes];
	while (stack.length > 0) {
		const node = stack.pop();
		visit(node);
		stack.push(...node.children);
	}
}
/** Element IDs that belong to the scope system for deployment-view filtering:
*  the system itself plus its containers. */
function deploymentScopeIds(model, softwareSystemId) {
	const ids = /* @__PURE__ */ new Set([softwareSystemId]);
	const sys = model.softwareSystems.find((s) => s.id === softwareSystemId);
	if (sys) for (const c of sys.containers) ids.add(c.id);
	return ids;
}
/** Every deployment element a deployment view of `environmentName` shows:
*  all deployment nodes (plus their infrastructure nodes and instances). When
*  `scopeSystemId` is given, only instances of that system (or its containers)
*  are kept, nodes whose subtree contains no kept instance are dropped, and
*  infrastructure nodes survive with their parent node. */
function expandDeploymentElements(model, environmentName, scopeSystemId) {
	const env = (model.deploymentEnvironments ?? []).find((e) => e.name === environmentName);
	if (!env) return [];
	const scopeIds = scopeSystemId ? deploymentScopeIds(model, scopeSystemId) : void 0;
	const ids = [];
	const addNode = (node) => {
		const keptChildIds = [];
		let hasKeptInstance = false;
		for (const inst of node.containerInstances) if (!scopeIds || scopeIds.has(inst.containerId)) {
			keptChildIds.push(inst.id);
			hasKeptInstance = true;
		}
		for (const inst of node.softwareSystemInstances) if (!scopeIds || scopeIds.has(inst.softwareSystemId)) {
			keptChildIds.push(inst.id);
			hasKeptInstance = true;
		}
		let hasKeptDescendant = hasKeptInstance;
		for (const child of node.children) if (addNode(child)) hasKeptDescendant = true;
		if (!scopeIds || hasKeptDescendant) {
			ids.push(node.id);
			for (const infra of node.infrastructureNodes) ids.push(infra.id);
			ids.push(...keptChildIds);
			return true;
		}
		return false;
	};
	for (const node of env.deploymentNodes) addNode(node);
	const seen = /* @__PURE__ */ new Set();
	return ids.filter((id) => seen.has(id) ? false : (seen.add(id), true)).map((id) => ({ id }));
}
//#endregion
//#region src/store/workspace-helpers.ts
/** Deep-clone an object that may be an Immer draft. structuredClone'ing a
*  draft proxy throws DataCloneError; current() unwraps the draft to a plain
*  snapshot first, then structuredClone produces a writable detached copy.
*  Acts as identity for plain (non-draft) inputs. */
function deepCloneMaybeDraft(value) {
	if (value === null || typeof value !== "object") return value;
	return structuredClone(isDraft(value) ? current(value) : value);
}
/** Sequential renumber + membership recompute after any step edit.
*
*  Orders regenerate 1..n, which flattens parallel-sequence numbering — the
*  editor is a linear list, so an edit is the user restating the sequence as
*  linear. Membership is a projection of the steps (steps are all that
*  serializes), so elements whose last step died drop out here. */
function normalizeDynamicView(ws, view) {
	view.relationships.forEach((step, i) => {
		step.order = String(i + 1);
	});
	const endpoints = /* @__PURE__ */ new Set();
	for (const step of view.relationships) {
		const rel = ws.model.relationships.find((r) => r.id === step.id);
		const sourceId = step.sourceId ?? rel?.sourceId;
		const destId = step.destinationId ?? rel?.destinationId;
		if (sourceId) endpoints.add(sourceId);
		if (destId) endpoints.add(destId);
	}
	view.elements = view.elements.filter((e) => endpoints.has(e.id));
}
/** Fill view arrays and model collections that predate their introduction.
*  Workspaces persisted (or crash-recovery-snapshotted) before dynamic and
*  deployment views existed lack those arrays; every VIEW_ARRAY_KEYS loop and
*  allViewsOf spread would throw on them. Run once at every point a workspace
*  object from outside the store becomes THE workspace. */
function normalizeWorkspaceShape(ws) {
	ws.views.dynamicViews ??= [];
	ws.views.deploymentViews ??= [];
	ws.model.deploymentEnvironments ??= [];
	return ws;
}
/** Get flat array of all views */
function allViewsOf(ws) {
	return [
		...ws.views.systemLandscapeViews,
		...ws.views.systemContextViews,
		...ws.views.containerViews,
		...ws.views.componentViews,
		...ws.views.dynamicViews ?? [],
		...ws.views.deploymentViews ?? []
	];
}
/** Find a view by key inside a workspace */
function findViewHelper(ws, key) {
	return allViewsOf(ws).find((v) => v.key === key);
}
/** Iterate every element in the model tree. Return true from callback to stop early. */
function forEachElementHelper(ws, fn) {
	for (const p of ws.model.people) if (fn(p)) return;
	for (const sys of ws.model.softwareSystems) {
		if (fn(sys)) return;
		for (const c of sys.containers) {
			if (fn(c)) return;
			for (const comp of c.components) if (fn(comp)) return;
		}
	}
}
/** Find an element by ID in the model tree */
function findElementHelper(ws, id) {
	return getElementIndex(ws).get(id);
}
/**
* Workspace-scoped id → element cache. Keyed by Workspace identity, so
* each cloned workspace snapshot gets its own index built lazily on the
* first lookup and reused thereafter. Replaces the O(n) tree walks that
* findElementHelper used to do on every call — relevant for hot paths
* that look up multiple elements per render (e.g. relationship resolution
* on the canvas, view derivation, undo/redo recompute).
*
* The WeakMap means cached snapshots are GC'd as soon as the store
* releases its reference.
*/
var elementIndexCache = /* @__PURE__ */ new WeakMap();
/** Build (or fetch from cache) the id → element map for a workspace. */
function getElementIndex(ws) {
	let idx = elementIndexCache.get(ws);
	if (!idx) {
		idx = /* @__PURE__ */ new Map();
		forEachElementHelper(ws, (el) => {
			idx.set(el.id, el);
		});
		elementIndexCache.set(ws, idx);
	}
	return idx;
}
/**
* Drop the cached id → element index for a workspace. Call after a helper
* mutates `ws.model` so the next reader (e.g. Canvas's buildElementMap)
* rebuilds against the new tree. Without this, helpers that read through
* findElementHelper before pushing/removing elements leave a stale index
* behind and the canvas renders against pre-mutation state.
*/
function invalidateElementIndex(ws) {
	elementIndexCache.delete(ws);
}
/** Apply a patch to an element in-place. Returns true only when the
*  element was found AND at least one field changed. Returning false
*  prevents phantom undo entries when nothing actually mutated. */
function applyElementPatch(ws, id, patch) {
	let changed = false;
	forEachElementHelper(ws, (el) => {
		if (el.id !== id) return false;
		if (patch.name !== void 0 && el.name !== patch.name) {
			el.name = patch.name;
			changed = true;
		}
		if ("description" in patch && el.description !== patch.description) {
			el.description = patch.description;
			changed = true;
		}
		if (patch.tags !== void 0) {
			if (patch.tags.length !== el.tags.length || patch.tags.some((t, i) => t !== el.tags[i])) {
				el.tags = patch.tags;
				changed = true;
			}
		}
		if ("status" in patch && el.status !== patch.status) {
			el.status = patch.status;
			changed = true;
		}
		if ("owner" in patch && el.owner !== patch.owner) {
			el.owner = patch.owner;
			changed = true;
		}
		if ("url" in patch && el.url !== patch.url) {
			el.url = patch.url;
			changed = true;
		}
		if ("documents" in patch && JSON.stringify(patch.documents) !== JSON.stringify(el.documents)) {
			el.documents = patch.documents;
			changed = true;
		}
		if (patch.location !== void 0 && (el.type === "person" || el.type === "softwareSystem")) {
			if (el.location !== patch.location) {
				el.location = patch.location;
				changed = true;
			}
		}
		if (patch.technology !== void 0 && (el.type === "container" || el.type === "component")) {
			if (el.technology !== patch.technology) {
				el.technology = patch.technology;
				changed = true;
			}
		}
		return true;
	});
	return changed;
}
/** True if an element with the given ID exists in the model tree. Deployment
*  elements count too — an explicit relationship may anchor on an
*  infrastructure node or instance (e.g. a load balancer routing to a
*  container instance), exactly as the DSL allows inside an environment. */
function elementExists(ws, id) {
	if (getElementIndex(ws).has(id)) return true;
	for (const env of ws.model.deploymentEnvironments ?? []) {
		let found = false;
		walkDeploymentNodes(env, (node) => {
			if (found) return;
			if (node.id === id || node.infrastructureNodes.some((i) => i.id === id) || node.containerInstances.some((i) => i.id === id) || node.softwareSystemInstances.some((i) => i.id === id)) found = true;
		});
		if (found) return true;
	}
	return false;
}
/** The view-type array keys — used wherever we need to iterate or locate views by type. */
var VIEW_ARRAY_KEYS = [
	"systemLandscapeViews",
	"systemContextViews",
	"containerViews",
	"componentViews",
	"dynamicViews",
	"deploymentViews"
];
/** Apply a callback to every view in the workspace (mutates views in place). */
function forEachView(ws, fn) {
	for (const key of VIEW_ARRAY_KEYS) for (const v of ws.views[key] ?? []) fn(v);
}
/** Return a name that doesn't collide with any existing element name. */
function uniqueElementName(base, ws) {
	const taken = /* @__PURE__ */ new Set();
	forEachElementHelper(ws, (el) => {
		taken.add(el.name);
	});
	if (!taken.has(base)) return base;
	let n = 2;
	while (taken.has(`${base} ${n}`)) n++;
	return `${base} ${n}`;
}
/** Add an element to the active view (no-op if no view is active or the
*  element is already present). */
/** Which element types each C4 view kind may show — a higher-level view never
*  shows lower-level internals (a System Landscape never shows containers, etc.),
*  though deeper views may show higher-level elements as external/boundary nodes. */
var VIEW_ELEMENT_TYPES = {
	systemLandscape: /* @__PURE__ */ new Set(["person", "softwareSystem"]),
	systemContext: /* @__PURE__ */ new Set(["person", "softwareSystem"]),
	container: /* @__PURE__ */ new Set([
		"person",
		"softwareSystem",
		"container"
	]),
	component: /* @__PURE__ */ new Set([
		"person",
		"softwareSystem",
		"container",
		"component"
	]),
	dynamic: /* @__PURE__ */ new Set(),
	deployment: /* @__PURE__ */ new Set()
};
/** True when a view of `viewType` is allowed to display an element of `elementType`. */
function viewAllowsElementType(viewType, elementType) {
	return VIEW_ELEMENT_TYPES[viewType].has(elementType);
}
function addToCurrentView(ws, activeViewKey, elementId, position, elementType) {
	if (!activeViewKey) return;
	const view = findViewHelper(ws, activeViewKey);
	if (!view) return;
	if (elementType && !viewAllowsElementType(view.type, elementType)) return;
	if (!view.elements.some((e) => e.id === elementId)) view.elements.push({
		id: elementId,
		x: position?.x,
		y: position?.y
	});
}
/** Reset the element/relationship/group selection on the draft. One place to
*  change if selection ever gains another field. */
function clearSelectionDraft(s) {
	s.selectedElementIds = [];
	s.selectedRelationshipId = null;
	s.selectedGroupId = null;
}
/** Close both AI surfaces (assistant + settings) so the inspector can take the
*  shared slot. Callers own the guard (selection vs create differ on batchApplying). */
function closeAiSurfaces(s) {
	s.aiPanelOpen = false;
	s.aiSettingsOpen = false;
}
/** Select a just-created element and close the assistant so the inspector shows
*  — EXCEPT during an AI batch apply (keep the panel to show its results) or while
*  the assistant is mid-flow (aiPanelBusy: interview/wizard/sweep — don't yank it
*  out from under the user). Centralizes the selection-reset + panel-close that
*  every create action shares, matching the selection-slice guard. */
function selectCreated(s, id) {
	s.focusElementId = id;
	s.selectedElementIds = [id];
	s.selectedRelationshipId = null;
	s.selectedGroupId = null;
	if (!s.batchApplying && !s.aiPanelBusy) closeAiSurfaces(s);
}
/**
* Compute the initial elements + relationships for a freshly-created view
* so the canvas isn't empty when the user adds a new view. Auto-population
* rules (preserving Structurizr's "include the scope + everything related"
* convention):
*
*  - systemLandscape: all people + all software systems
*  - systemContext:   the scoped system + every person/system with a
*                     relationship to it
*  - container:       all containers of the scoped system + people/other
*                     systems/other containers that interact with them
*  - component:       all components of the scoped container + people/
*                     systems/containers that interact with them (other
*                     containers shown as the C4 boundary if a child
*                     component is related)
*
* Returns the auto-populated element refs and the relationship refs whose
* endpoints both ended up in the view.
*/
function buildInitialViewContent(model, type, scopeId) {
	const elements = [];
	if (type === "systemLandscape") {
		for (const p of model.people) elements.push({ id: p.id });
		for (const sys of model.softwareSystems) elements.push({ id: sys.id });
	} else if (type === "systemContext" && scopeId) {
		elements.push({ id: scopeId });
		const scopeSys = model.softwareSystems.find((s) => s.id === scopeId);
		const scopeInternalIds = /* @__PURE__ */ new Set([scopeId]);
		if (scopeSys) for (const c of scopeSys.containers) {
			scopeInternalIds.add(c.id);
			for (const comp of c.components) scopeInternalIds.add(comp.id);
		}
		const related = /* @__PURE__ */ new Set();
		for (const rel of model.relationships) {
			if (scopeInternalIds.has(rel.sourceId)) related.add(rel.destinationId);
			if (scopeInternalIds.has(rel.destinationId)) related.add(rel.sourceId);
		}
		for (const p of model.people) if (related.has(p.id)) elements.push({ id: p.id });
		for (const sys of model.softwareSystems) if (sys.id !== scopeId && related.has(sys.id)) elements.push({ id: sys.id });
	} else if (type === "container" && scopeId) {
		const sys = model.softwareSystems.find((s) => s.id === scopeId);
		if (sys) for (const c of sys.containers) elements.push({ id: c.id });
		const containerIds = new Set(elements.map((e) => e.id));
		const related = /* @__PURE__ */ new Set();
		for (const rel of model.relationships) {
			if (containerIds.has(rel.sourceId)) related.add(rel.destinationId);
			if (containerIds.has(rel.destinationId)) related.add(rel.sourceId);
		}
		for (const p of model.people) if (related.has(p.id)) elements.push({ id: p.id });
		for (const otherSys of model.softwareSystems) {
			if (otherSys.id !== scopeId && related.has(otherSys.id)) elements.push({ id: otherSys.id });
			for (const c of otherSys.containers) if (related.has(c.id)) elements.push({ id: c.id });
		}
	} else if (type === "component" && scopeId) {
		const container = model.softwareSystems.flatMap((s) => s.containers).find((c) => c.id === scopeId);
		if (container) for (const comp of container.components) elements.push({ id: comp.id });
		const componentIds = new Set(elements.map((e) => e.id));
		const related = /* @__PURE__ */ new Set();
		for (const rel of model.relationships) {
			if (componentIds.has(rel.sourceId)) related.add(rel.destinationId);
			if (componentIds.has(rel.destinationId)) related.add(rel.sourceId);
		}
		for (const p of model.people) if (related.has(p.id)) elements.push({ id: p.id });
		for (const otherSys of model.softwareSystems) {
			if (related.has(otherSys.id)) elements.push({ id: otherSys.id });
			for (const c of otherSys.containers) if (c.id !== scopeId && related.has(c.id)) elements.push({ id: c.id });
			else if (c.id !== scopeId && c.components.some((comp) => related.has(comp.id))) elements.push({ id: c.id });
		}
	}
	const elementIdSet = new Set(elements.map((e) => e.id));
	return {
		elements,
		relationships: model.relationships.filter((r) => elementIdSet.has(r.sourceId) && elementIdSet.has(r.destinationId)).map((r) => ({ id: r.id }))
	};
}
/** Build a scoped view (initial content + the standard shape) and push it onto
*  the matching view array of the (draft) workspace, returning the new view.
*  Centralizes the View construction shared by addView, addContainer and
*  addComponent — caller owns selection/active-view/undo handling. */
function appendScopedView(ws, type, scopeId, title, key, options) {
	const view = {
		type,
		key,
		title,
		elements: [],
		relationships: [],
		autoLayout: { direction: "TB" },
		softwareSystemId: type === "systemContext" || type === "container" || type === "deployment" || type === "dynamic" ? scopeId : void 0,
		containerId: type === "component" ? scopeId : void 0,
		environment: type === "deployment" ? options?.environment : void 0
	};
	if (type === "deployment") {
		view.elements = expandDeploymentElements(ws.model, options?.environment, scopeId);
		const idSet = new Set(view.elements.map((e) => e.id));
		view.relationships = ws.model.relationships.filter((r) => idSet.has(r.sourceId) && idSet.has(r.destinationId)).map((r) => ({ id: r.id }));
	} else if (type !== "dynamic") {
		const { elements, relationships } = buildInitialViewContent(ws.model, type, scopeId);
		view.elements = elements;
		view.relationships = relationships;
	}
	switch (type) {
		case "systemLandscape":
			ws.views.systemLandscapeViews.push(view);
			break;
		case "systemContext":
			ws.views.systemContextViews.push(view);
			break;
		case "container":
			ws.views.containerViews.push(view);
			break;
		case "component":
			ws.views.componentViews.push(view);
			break;
		case "dynamic":
			(ws.views.dynamicViews ??= []).push(view);
			break;
		case "deployment": (ws.views.deploymentViews ??= []).push(view);
	}
	return view;
}
/**
* Duplicate the given elements within the active view. Mutates the workspace in
* place — clones each model element with a new ID and a "<name> copy" name,
* mirrors the auto-add-to-sibling-views behaviour of addPerson/Container/
* Component, and clones intra-set relationships so the cloned subgraph
* preserves its internal connectivity.
*
* Returns the array of newly-created element IDs (in the order they were
* created). Empty array means no elements were duplicated.
*/
function duplicateElementsInTree(ws, ids, activeViewKey, nanoid) {
	const newIds = [];
	const view = findViewHelper(ws, activeViewKey);
	if (!view) return newIds;
	const uniqueIds = [...new Set(ids)];
	if (uniqueIds.length === 0) return newIds;
	const idMapping = /* @__PURE__ */ new Map();
	for (const id of uniqueIds) {
		const element = findElementHelper(ws, id);
		if (!element) continue;
		const inView = view.elements.find((e) => e.id === id);
		const offsetX = (inView?.x ?? 200) + 60;
		const offsetY = (inView?.y ?? 200) + 30;
		const newId = nanoid();
		let cloned = false;
		if (element.type === "person") {
			ws.model.people.push({
				...deepCloneMaybeDraft(element),
				id: newId,
				name: uniqueElementName(`${element.name} copy`, ws)
			});
			cloned = true;
		} else if (element.type === "softwareSystem") {
			const clonedContainers = element.containers.map((c) => ({
				...deepCloneMaybeDraft(c),
				id: nanoid(),
				components: c.components.map((comp) => ({
					...deepCloneMaybeDraft(comp),
					id: nanoid()
				}))
			}));
			ws.model.softwareSystems.push({
				...deepCloneMaybeDraft(element),
				id: newId,
				name: uniqueElementName(`${element.name} copy`, ws),
				containers: clonedContainers
			});
			cloned = true;
		} else if (element.type === "container") {
			const parent = ws.model.softwareSystems.find((sys) => sys.containers.some((c) => c.id === id));
			if (parent) {
				parent.containers.push({
					...deepCloneMaybeDraft(element),
					id: newId,
					name: uniqueElementName(`${element.name} copy`, ws),
					components: element.components.map((comp) => ({
						...deepCloneMaybeDraft(comp),
						id: nanoid()
					}))
				});
				cloned = true;
			}
		} else if (element.type === "component") {
			outer: for (const sys of ws.model.softwareSystems) for (const container of sys.containers) if (container.components.some((c) => c.id === id)) {
				container.components.push({
					...deepCloneMaybeDraft(element),
					id: newId,
					name: uniqueElementName(`${element.name} copy`, ws)
				});
				cloned = true;
				break outer;
			}
		}
		if (!cloned) continue;
		idMapping.set(id, newId);
		newIds.push(newId);
		view.elements.push({
			id: newId,
			x: offsetX,
			y: offsetY
		});
		if (element.type === "person" || element.type === "softwareSystem") {
			for (const v of ws.views.systemLandscapeViews) if (v.key !== activeViewKey && !v.elements.some((e) => e.id === newId)) v.elements.push({ id: newId });
		} else if (element.type === "container") {
			const parentSysId = ws.model.softwareSystems.find((sys) => sys.containers.some((c) => c.id === newId))?.id;
			if (parentSysId) {
				for (const v of ws.views.containerViews) if (v.softwareSystemId === parentSysId && v.key !== activeViewKey && !v.elements.some((e) => e.id === newId)) v.elements.push({ id: newId });
			}
		} else if (element.type === "component") {
			let parentContainerId = null;
			for (const sys of ws.model.softwareSystems) {
				for (const c of sys.containers) if (c.components.some((comp) => comp.id === newId)) {
					parentContainerId = c.id;
					break;
				}
				if (parentContainerId) break;
			}
			if (parentContainerId) {
				for (const v of ws.views.componentViews) if (v.containerId === parentContainerId && v.key !== activeViewKey && !v.elements.some((e) => e.id === newId)) v.elements.push({ id: newId });
			}
		}
	}
	for (const rel of ws.model.relationships) {
		const newSourceId = idMapping.get(rel.sourceId);
		const newDestId = idMapping.get(rel.destinationId);
		if (newSourceId && newDestId) {
			const newRelId = nanoid();
			ws.model.relationships.push({
				...deepCloneMaybeDraft(rel),
				id: newRelId,
				sourceId: newSourceId,
				destinationId: newDestId
			});
			for (const v of allViewsOf(ws)) {
				const viewElIds = new Set(v.elements.map((e) => e.id));
				if (viewElIds.has(newSourceId) && viewElIds.has(newDestId)) {
					if (!v.relationships.some((r) => r.id === newRelId)) v.relationships.push({ id: newRelId });
				}
			}
		}
	}
	invalidateElementIndex(ws);
	return newIds;
}
/**
* Cascade-delete elements from the workspace tree:
*   - removes the targeted elements from the model
*   - removes any children rolled up under them (containers in deleted
*     systems, components in deleted containers)
*   - prunes relationships whose endpoints were deleted
*   - removes view element refs and view relationship refs that point at
*     deleted IDs
*   - removes scoped views (systemContext / container / component) whose
*     scope element was deleted
*   - removes deleted IDs from group memberships
*
* Mutates the workspace in place. The caller is expected to have cloned
* the workspace before invoking.
*/
function cascadeDeleteElements(ws, ids) {
	const idSet = new Set(ids);
	const deletedContainerIds = /* @__PURE__ */ new Set();
	const deletedComponentIds = /* @__PURE__ */ new Set();
	for (const sys of ws.model.softwareSystems) if (idSet.has(sys.id)) for (const c of sys.containers) {
		deletedContainerIds.add(c.id);
		for (const comp of c.components) deletedComponentIds.add(comp.id);
	}
	else for (const c of sys.containers) if (idSet.has(c.id)) {
		deletedContainerIds.add(c.id);
		for (const comp of c.components) deletedComponentIds.add(comp.id);
	} else for (const comp of c.components) if (idSet.has(comp.id)) deletedComponentIds.add(comp.id);
	const allDeletedIds = /* @__PURE__ */ new Set([
		...idSet,
		...deletedContainerIds,
		...deletedComponentIds
	]);
	ws.model.people = ws.model.people.filter((p) => !idSet.has(p.id));
	ws.model.softwareSystems = ws.model.softwareSystems.filter((sys) => {
		if (idSet.has(sys.id)) return false;
		sys.containers = sys.containers.filter((c) => {
			if (idSet.has(c.id)) return false;
			c.components = c.components.filter((comp) => !idSet.has(comp.id));
			return true;
		});
		return true;
	});
	const collectSubtree = (node, into) => {
		into.add(node.id);
		for (const inst of node.containerInstances) into.add(inst.id);
		for (const inst of node.softwareSystemInstances) into.add(inst.id);
		for (const infra of node.infrastructureNodes) into.add(infra.id);
		for (const child of node.children) collectSubtree(child, into);
	};
	const removedDeploymentIds = /* @__PURE__ */ new Set();
	const pruneNodes = (nodes) => nodes.filter((node) => {
		if (idSet.has(node.id)) {
			collectSubtree(node, removedDeploymentIds);
			return false;
		}
		node.children = pruneNodes(node.children);
		node.infrastructureNodes = node.infrastructureNodes.filter((infra) => {
			if (!idSet.has(infra.id)) return true;
			removedDeploymentIds.add(infra.id);
			return false;
		});
		node.containerInstances = node.containerInstances.filter((inst) => {
			if (!idSet.has(inst.id)) return true;
			removedDeploymentIds.add(inst.id);
			return false;
		});
		node.softwareSystemInstances = node.softwareSystemInstances.filter((inst) => {
			if (!idSet.has(inst.id)) return true;
			removedDeploymentIds.add(inst.id);
			return false;
		});
		return true;
	});
	for (const env of ws.model.deploymentEnvironments ?? []) env.deploymentNodes = pruneNodes(env.deploymentNodes);
	for (const id of removedDeploymentIds) allDeletedIds.add(id);
	const removedInstanceIds = /* @__PURE__ */ new Set();
	for (const env of ws.model.deploymentEnvironments ?? []) walkDeploymentNodes(env, (node) => {
		node.containerInstances = node.containerInstances.filter((inst) => {
			if (!allDeletedIds.has(inst.containerId)) return true;
			removedInstanceIds.add(inst.id);
			return false;
		});
		node.softwareSystemInstances = node.softwareSystemInstances.filter((inst) => {
			if (!allDeletedIds.has(inst.softwareSystemId)) return true;
			removedInstanceIds.add(inst.id);
			return false;
		});
	});
	for (const id of removedInstanceIds) allDeletedIds.add(id);
	ws.model.relationships = ws.model.relationships.filter((r) => !allDeletedIds.has(r.sourceId) && !allDeletedIds.has(r.destinationId));
	const survivingRelIds = new Set(ws.model.relationships.map((r) => r.id));
	const survivingRelById = new Map(ws.model.relationships.map((r) => [r.id, r]));
	forEachView(ws, (v) => {
		v.elements = v.elements.filter((e) => !allDeletedIds.has(e.id));
		v.relationships = v.relationships.filter((r) => survivingRelIds.has(r.id));
		if (v.type === "dynamic") {
			const stepEndpoints = /* @__PURE__ */ new Set();
			for (const step of v.relationships) {
				const rel = survivingRelById.get(step.id);
				stepEndpoints.add(step.sourceId ?? rel?.sourceId ?? "");
				stepEndpoints.add(step.destinationId ?? rel?.destinationId ?? "");
			}
			v.elements = v.elements.filter((e) => stepEndpoints.has(e.id));
		}
	});
	ws.views.systemContextViews = ws.views.systemContextViews.filter((v) => !v.softwareSystemId || !idSet.has(v.softwareSystemId));
	ws.views.containerViews = ws.views.containerViews.filter((v) => !v.softwareSystemId || !idSet.has(v.softwareSystemId));
	ws.views.componentViews = ws.views.componentViews.filter((v) => !v.containerId || !idSet.has(v.containerId) && !deletedContainerIds.has(v.containerId));
	ws.views.deploymentViews = (ws.views.deploymentViews ?? []).filter((v) => !v.softwareSystemId || !idSet.has(v.softwareSystemId));
	ws.views.dynamicViews = (ws.views.dynamicViews ?? []).filter((v) => (!v.softwareSystemId || !idSet.has(v.softwareSystemId)) && (!v.containerId || !idSet.has(v.containerId) && !deletedContainerIds.has(v.containerId)));
	ws.model.groups = ws.model.groups.map((g) => ({
		...g,
		elementIds: g.elementIds.filter((eid) => !allDeletedIds.has(eid))
	}));
	invalidateElementIndex(ws);
	return {
		allDeletedIds,
		deletedContainerIds
	};
}
//#endregion
//#region src/cli/resolve.ts
var MAX_SUGGESTIONS = 5;
/** Every model element mapped to its parent (undefined for top level). */
function parentMap(ws) {
	const parents = /* @__PURE__ */ new Map();
	for (const p of ws.model.people) parents.set(p.id, void 0);
	for (const sys of ws.model.softwareSystems) {
		parents.set(sys.id, void 0);
		for (const c of sys.containers) {
			parents.set(c.id, sys);
			for (const comp of c.components) parents.set(comp.id, c);
		}
	}
	return parents;
}
function allElements$2(ws) {
	const out = [];
	forEachElementHelper(ws, (el) => {
		out.push(el);
	});
	return out;
}
function childrenOf(el) {
	if (el.type === "softwareSystem") return el.containers;
	if (el.type === "container") return el.components;
	return [];
}
/** Classic Levenshtein distance, two-row. */
function editDistance(a, b) {
	let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		const cur = [i];
		for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
		prev = cur;
	}
	return prev[b.length];
}
/** Up to 5 element ids closest to `ref` by edit distance over ids and names. */
function suggestElements(ws, ref) {
	const needle = ref.toLowerCase();
	return allElements$2(ws).map((el) => ({
		id: el.id,
		score: Math.min(editDistance(needle, el.id.toLowerCase()), editDistance(needle, el.name.toLowerCase()))
	})).sort((a, b) => a.score - b.score || a.id.localeCompare(b.id)).slice(0, MAX_SUGGESTIONS).map((s) => s.id);
}
function resolveHierarchical(ws, ref) {
	const segments = ref.split(".");
	if (segments.length < 2) return void 0;
	let current = allElements$2(ws).filter((el) => el.id === segments[0] && parentMap(ws).get(el.id) === void 0)[0];
	for (const seg of segments.slice(1)) {
		if (!current) return void 0;
		current = childrenOf(current).find((c) => c.id === seg);
	}
	return current;
}
/** Resolves `<ref>`: an identifier (flat or hierarchical `a.b.c`), then a unique
*  exact element name. Throws AMBIGUOUS (with candidate ids) or NOT_FOUND
*  (with up to 5 closest ids). */
function resolveElement(ws, ref) {
	const elements = allElements$2(ws);
	const byId = elements.find((el) => el.id === ref);
	if (byId) return byId;
	const hierarchical = resolveHierarchical(ws, ref);
	if (hierarchical) return hierarchical;
	const byName = elements.filter((el) => el.name === ref);
	if (byName.length === 1) return byName[0];
	if (byName.length > 1) throw new CliFailure("AMBIGUOUS", `'${ref}' matches ${byName.length} elements by name. Use an identifier.`, byName.map((el) => el.id));
	throw new CliFailure("NOT_FOUND", `No element '${ref}'.`, suggestElements(ws, ref));
}
function describeRel(r) {
	return r.description ? `${r.id} (${r.description})` : r.id;
}
/** Resolves `<relRef>`: a relationship id, or `<srcRef>-><dstRef>` with an
*  optional `--match` description to pick among parallel edges. */
function resolveRelationship(ws, ref, match) {
	const byId = ws.model.relationships.find((r) => r.id === ref);
	if (byId) return byId;
	const arrow = ref.indexOf("->");
	if (arrow === -1) throw new CliFailure("NOT_FOUND", `No relationship '${ref}'.`, ws.model.relationships.slice(0, MAX_SUGGESTIONS).map(describeRel));
	const src = resolveElement(ws, ref.slice(0, arrow).trim());
	const dst = resolveElement(ws, ref.slice(arrow + 2).trim());
	let matches = ws.model.relationships.filter((r) => r.sourceId === src.id && r.destinationId === dst.id);
	if (matches.length === 0) throw new CliFailure("NOT_FOUND", `No relationship from '${src.id}' to '${dst.id}'.`);
	if (match !== void 0) {
		matches = matches.filter((r) => r.description === match);
		if (matches.length === 0) throw new CliFailure("NOT_FOUND", `No relationship from '${src.id}' to '${dst.id}' with description '${match}'.`);
	}
	if (matches.length > 1) throw new CliFailure("AMBIGUOUS", `${matches.length} relationships from '${src.id}' to '${dst.id}'. Pass --match <description> or a relationship id.`, matches.map(describeRel));
	return matches[0];
}
//#endregion
//#region src/lib/dsl/lexer.ts
var KEYWORDS = /* @__PURE__ */ new Set([
	"workspace",
	"model",
	"views",
	"person",
	"softwareSystem",
	"softwaresystem",
	"container",
	"component",
	"group",
	"enterprise",
	"element",
	"relationship",
	"styles",
	"systemLandscape",
	"systemlandscape",
	"systemContext",
	"systemcontext",
	"dynamic",
	"deployment",
	"filtered",
	"custom",
	"include",
	"exclude",
	"autoLayout",
	"autolayout",
	"animation",
	"title",
	"description",
	"technology",
	"tags",
	"url",
	"properties",
	"perspectives",
	"extends",
	"theme",
	"themes",
	"branding",
	"terminology",
	"configuration",
	"users",
	"deploymentEnvironment",
	"deploymentNode",
	"infrastructureNode",
	"softwareSystemInstance",
	"containerInstance",
	"healthCheck",
	"default",
	"location",
	"status",
	"owner"
]);
var OPAQUE_DIRECTIVES = /* @__PURE__ */ new Set([
	"!script",
	"!docs",
	"!adrs",
	"!include",
	"!const",
	"!var",
	"!element",
	"!relationship",
	"!identifiers",
	"!impliedRelationships",
	"!extend",
	"!plugin"
]);
/**
* The consume-one escape rule in one place: the step length at position `i`
* inside a quoted string is 2 when a backslash begins one of the two real
* escapes (`\"` or `\n`), else 1 — a backslash before anything else is a
* literal consumed alone. readString and scanQuotedString both step with
* this, so the tokenizer and boundary scanner cannot drift apart.
*/
function escapeStep(input, i) {
	return input[i] === "\\" && (input[i + 1] === "\"" || input[i + 1] === "n") ? 2 : 1;
}
function lex(input) {
	const tokens = [];
	const errors = [];
	let pos = 0;
	let line = 1;
	let column = 1;
	function peek() {
		return pos < input.length ? input[pos] : "\0";
	}
	function peekAt(offset) {
		const idx = pos + offset;
		return idx < input.length ? input[idx] : "\0";
	}
	function advance() {
		const ch = input[pos];
		pos++;
		if (ch === "\n") {
			line++;
			column = 1;
		} else column++;
		return ch;
	}
	function skipWhitespaceExceptNewline() {
		while (pos < input.length) {
			const ch = input[pos];
			if (ch === " " || ch === "	" || ch === "\r") advance();
			else break;
		}
	}
	function readString() {
		const startLine = line;
		const startCol = column;
		advance();
		let value = "";
		while (pos < input.length && peek() !== "\"") if (escapeStep(input, pos) === 2) {
			const escaped = peekAt(1);
			advance();
			advance();
			value += escaped === "n" ? "\n" : "\"";
		} else value += advance();
		if (pos < input.length) advance();
		else errors.push({
			message: "Unterminated string literal",
			line: startLine,
			column: startCol
		});
		return {
			type: "STRING",
			value,
			line: startLine,
			column: startCol
		};
	}
	function readWord() {
		const startLine = line;
		const startCol = column;
		let value = "";
		if (peek() === "!") value += advance();
		while (pos < input.length) {
			const ch = peek();
			if (/[a-zA-Z0-9_]/.test(ch)) value += advance();
			else break;
		}
		if (OPAQUE_DIRECTIVES.has(value)) {
			let rest = "";
			while (pos < input.length && peek() !== "\n") rest += advance();
			return {
				type: "KEYWORD",
				value: value + rest,
				line: startLine,
				column: startCol
			};
		}
		return {
			type: KEYWORDS.has(value) ? "KEYWORD" : "IDENTIFIER",
			value,
			line: startLine,
			column: startCol
		};
	}
	function readNumber() {
		const startLine = line;
		const startCol = column;
		let value = "";
		while (pos < input.length && /[0-9]/.test(peek())) value += advance();
		return {
			type: "NUMBER",
			value,
			line: startLine,
			column: startCol
		};
	}
	function readHexValue() {
		const startLine = line;
		const startCol = column;
		let value = "";
		value += advance();
		while (pos < input.length && /[0-9a-fA-F]/.test(peek())) value += advance();
		return {
			type: "IDENTIFIER",
			value,
			line: startLine,
			column: startCol
		};
	}
	function readLineComment() {
		const startLine = line;
		const startCol = column;
		let value = "";
		if (peek() === "#") value += advance();
		else {
			value += advance();
			value += advance();
		}
		while (pos < input.length && peek() !== "\n") value += advance();
		return {
			type: "COMMENT",
			value,
			line: startLine,
			column: startCol
		};
	}
	function readBlockComment() {
		const startLine = line;
		const startCol = column;
		let value = "";
		value += advance();
		value += advance();
		while (pos < input.length) {
			if (peek() === "*" && peekAt(1) === "/") {
				value += advance();
				value += advance();
				break;
			}
			value += advance();
		}
		if (!value.endsWith("*/")) errors.push({
			message: "Unterminated block comment",
			line: startLine,
			column: startCol
		});
		return {
			type: "COMMENT",
			value,
			line: startLine,
			column: startCol
		};
	}
	while (pos < input.length) {
		skipWhitespaceExceptNewline();
		if (pos >= input.length) break;
		const ch = peek();
		const startLine = line;
		const startCol = column;
		if (ch === "\n") {
			advance();
			tokens.push({
				type: "NEWLINE",
				value: "\n",
				line: startLine,
				column: startCol
			});
			continue;
		}
		if (ch === "\"") {
			tokens.push(readString());
			continue;
		}
		if (ch === "{") {
			advance();
			tokens.push({
				type: "LBRACE",
				value: "{",
				line: startLine,
				column: startCol
			});
			continue;
		}
		if (ch === "}") {
			advance();
			tokens.push({
				type: "RBRACE",
				value: "}",
				line: startLine,
				column: startCol
			});
			continue;
		}
		if (ch === "=") {
			advance();
			tokens.push({
				type: "EQUALS",
				value: "=",
				line: startLine,
				column: startCol
			});
			continue;
		}
		if (ch === "*") {
			advance();
			tokens.push({
				type: "STAR",
				value: "*",
				line: startLine,
				column: startCol
			});
			continue;
		}
		if (ch === ".") {
			advance();
			tokens.push({
				type: "DOT",
				value: ".",
				line: startLine,
				column: startCol
			});
			continue;
		}
		if (ch === "-" && peekAt(1) === ">") {
			advance();
			advance();
			tokens.push({
				type: "ARROW",
				value: "->",
				line: startLine,
				column: startCol
			});
			continue;
		}
		if (ch === "/" && peekAt(1) === "/") {
			tokens.push(readLineComment());
			continue;
		}
		if (ch === "/" && peekAt(1) === "*") {
			tokens.push(readBlockComment());
			continue;
		}
		if (ch === "#") {
			const nextCh = peekAt(1);
			if (/[0-9a-fA-F]/.test(nextCh)) tokens.push(readHexValue());
			else tokens.push(readLineComment());
			continue;
		}
		if (/[0-9]/.test(ch)) {
			tokens.push(readNumber());
			continue;
		}
		if (/[a-zA-Z_!]/.test(ch)) {
			tokens.push(readWord());
			continue;
		}
		errors.push({
			message: `Unexpected character: '${ch}'`,
			line: startLine,
			column: startCol
		});
		advance();
	}
	tokens.push({
		type: "EOF",
		value: "",
		line,
		column
	});
	return {
		tokens,
		errors
	};
}
//#endregion
//#region src/lib/renameIdentifier.ts
/** The identifier shape the DSL serializer emits unchanged (see
*  `SerializerContext.registerElement`): no sanitizing, no `e` prefix. */
var IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
function eachDeploymentNode(nodes, fn) {
	for (const node of nodes) {
		fn(node);
		eachDeploymentNode(node.children, fn);
	}
}
/** Rewrite every reference to element `oldId` so it points at `newId`:
*  the element itself (model tree and deployment tree), relationship
*  endpoints, view scopes, view elements, dynamic-step endpoints, group
*  membership and deployment instance targets. Implied relationships are
*  derived on demand and carry no stored ids, so they need no rewrite.
*  Mutates `ws`; throws when `oldId` is missing, `newId` is taken or not a
*  valid DSL identifier (reserved words such as `views` included). */
function renameElementId(ws, oldId, newId) {
	if (oldId === newId) return;
	if (!IDENTIFIER.test(newId)) throw new Error(`Invalid identifier "${newId}"`);
	if (isReservedWord(newId)) throw new Error(`Invalid identifier "${newId}": it is a DSL keyword`);
	const swap = (id) => id === oldId ? newId : id;
	const holders = [];
	const instances = [];
	for (const p of ws.model.people) holders.push(p);
	for (const sys of ws.model.softwareSystems) {
		holders.push(sys);
		for (const c of sys.containers) {
			holders.push(c);
			holders.push(...c.components);
		}
	}
	for (const env of ws.model.deploymentEnvironments ?? []) eachDeploymentNode(env.deploymentNodes, (node) => {
		holders.push(node, ...node.infrastructureNodes, ...node.containerInstances, ...node.softwareSystemInstances);
		instances.push(...node.containerInstances, ...node.softwareSystemInstances);
	});
	if (!holders.some((h) => h.id === oldId)) throw new Error(`Element "${oldId}" not found`);
	if (holders.some((h) => h.id === newId)) throw new Error(`Identifier "${newId}" is already in use`);
	for (const h of holders) h.id = swap(h.id);
	for (const inst of instances) if (inst.type === "containerInstance") inst.containerId = swap(inst.containerId);
	else inst.softwareSystemId = swap(inst.softwareSystemId);
	for (const rel of ws.model.relationships) {
		rel.sourceId = swap(rel.sourceId);
		rel.destinationId = swap(rel.destinationId);
	}
	for (const group of ws.model.groups) group.elementIds = group.elementIds.map(swap);
	forEachView(ws, (view) => {
		if (view.softwareSystemId) view.softwareSystemId = swap(view.softwareSystemId);
		if (view.containerId) view.containerId = swap(view.containerId);
		for (const el of view.elements) el.id = swap(el.id);
		for (const step of view.relationships) {
			if (step.sourceId) step.sourceId = swap(step.sourceId);
			if (step.destinationId) step.destinationId = swap(step.destinationId);
		}
	});
}
function rekeyRecord(record, renames, removed) {
	if (!record) return void 0;
	const out = {};
	for (const [key, value] of Object.entries(record)) {
		if (removed.has(key)) continue;
		out[renames.get(key) ?? key] = value;
	}
	return Object.keys(out).length > 0 ? out : void 0;
}
/** Move sidecar entries (element/relationship records and per-view node
*  positions and locks) from old ids to new ids and drop removed ids.
*  View keys are not element ids and are left alone. Pure: returns a new
*  object. */
function rekeySidecar(sidecar, renames, removed) {
	const out = { version: 1 };
	const elements = rekeyRecord(sidecar.elements, renames, removed);
	if (elements) out.elements = elements;
	const relationships = rekeyRecord(sidecar.relationships, renames, removed);
	if (relationships) out.relationships = relationships;
	if (sidecar.views) {
		const views = {};
		for (const [key, view] of Object.entries(sidecar.views)) {
			const entry = {};
			if (view.locked) entry.locked = view.locked;
			const viewElements = rekeyRecord(view.elements, renames, removed);
			if (viewElements) entry.elements = viewElements;
			if (entry.locked || entry.elements) views[key] = entry;
		}
		if (Object.keys(views).length > 0) out.views = views;
	}
	return out;
}
/** Derive a camelCase, ASCII-only DSL identifier from a display name that
*  the serializer emits unchanged and that is not in `taken`
*  ("Order Service" -> "orderService"; collisions get a numeric suffix). */
function deriveIdentifier(name, taken) {
	let base = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").split(/[^A-Za-z0-9]+/).filter(Boolean).map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("");
	if (!base) base = "item";
	else if (/^[0-9]/.test(base)) base = `e${base}`;
	const used = taken instanceof Set ? taken : new Set(taken);
	if (!used.has(base) && !isReservedWord(base)) return base;
	let i = 2;
	while (used.has(`${base}${i}`)) i++;
	return `${base}${i}`;
}
/** DSL keywords (`model`, `views`, `element`, ...) cannot be variable names:
*  the parser reads them as keywords. Asking the lexer keeps this in step.
*  `this` is reserved by Structurizr (the enclosing element) though the lexer
*  reads it as a plain identifier. */
function isReservedWord(word) {
	return word === "this" || lex(word).tokens.some((t) => t.type === "KEYWORD");
}
//#endregion
//#region node_modules/zustand/esm/vanilla.mjs
var createStoreImpl = (createState) => {
	let state;
	const listeners = /* @__PURE__ */ new Set();
	const setState = (partial, replace) => {
		const nextState = typeof partial === "function" ? partial(state) : partial;
		if (!Object.is(nextState, state)) {
			const previousState = state;
			state = (replace != null ? replace : typeof nextState !== "object" || nextState === null) ? nextState : Object.assign({}, state, nextState);
			listeners.forEach((listener) => listener(state, previousState));
		}
	};
	const getState = () => state;
	const getInitialState = () => initialState;
	const subscribe = (listener) => {
		listeners.add(listener);
		return () => listeners.delete(listener);
	};
	const api = {
		setState,
		getState,
		getInitialState,
		subscribe
	};
	const initialState = state = createState(setState, getState, api);
	return api;
};
var createStore = ((createState) => createState ? createStoreImpl(createState) : createStoreImpl);
//#endregion
//#region node_modules/react/cjs/react.production.js
/**
* @license React
* react.production.js
*
* Copyright (c) Meta Platforms, Inc. and affiliates.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/
var require_react_production = /* @__PURE__ */ __commonJSMin(((exports) => {
	var ReactNoopUpdateQueue = {
		isMounted: function() {
			return !1;
		},
		enqueueForceUpdate: function() {},
		enqueueReplaceState: function() {},
		enqueueSetState: function() {}
	};
	var assign = Object.assign;
	var emptyObject = {};
	function Component(props, context, updater) {
		this.props = props;
		this.context = context;
		this.refs = emptyObject;
		this.updater = updater || ReactNoopUpdateQueue;
	}
	Component.prototype.isReactComponent = {};
	Component.prototype.setState = function(partialState, callback) {
		if ("object" !== typeof partialState && "function" !== typeof partialState && null != partialState) throw Error("takes an object of state variables to update or a function which returns an object of state variables.");
		this.updater.enqueueSetState(this, partialState, callback, "setState");
	};
	Component.prototype.forceUpdate = function(callback) {
		this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
	};
	function ComponentDummy() {}
	ComponentDummy.prototype = Component.prototype;
	function PureComponent(props, context, updater) {
		this.props = props;
		this.context = context;
		this.refs = emptyObject;
		this.updater = updater || ReactNoopUpdateQueue;
	}
	var pureComponentPrototype = PureComponent.prototype = new ComponentDummy();
	pureComponentPrototype.constructor = PureComponent;
	assign(pureComponentPrototype, Component.prototype);
	pureComponentPrototype.isPureReactComponent = !0;
	Array.isArray;
	var ReactSharedInternals = {
		H: null,
		A: null,
		T: null,
		S: null
	};
	exports.useCallback = function(callback, deps) {
		return ReactSharedInternals.H.useCallback(callback, deps);
	};
	exports.useDebugValue = function() {};
	exports.useSyncExternalStore = function(subscribe, getSnapshot, getServerSnapshot) {
		return ReactSharedInternals.H.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
	};
}));
//#endregion
//#region node_modules/zustand/esm/react.mjs
var import_react = /* @__PURE__ */ __toESM((/* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = require_react_production();
})))(), 1);
var identity = (arg) => arg;
function useStore(api, selector = identity) {
	const slice = import_react.useSyncExternalStore(api.subscribe, import_react.useCallback(() => selector(api.getState()), [api, selector]), import_react.useCallback(() => selector(api.getInitialState()), [api, selector]));
	import_react.useDebugValue(slice);
	return slice;
}
var createImpl = (createState) => {
	const api = createStore(createState);
	const useBoundStore = (selector) => useStore(api, selector);
	Object.assign(useBoundStore, api);
	return useBoundStore;
};
var create = ((createState) => createState ? createImpl(createState) : createImpl);
//#endregion
//#region node_modules/zustand/esm/middleware/immer.mjs
var immerImpl = (initializer) => (set, get, store) => {
	store.setState = (updater, replace, ...args) => {
		return set(typeof updater === "function" ? produce(updater) : updater, replace, ...args);
	};
	return initializer(store.setState, get, store);
};
var immer = immerImpl;
//#endregion
//#region src/store/slices/filter-slice.ts
var createFilterSlice = (set) => ({
	activeTagFilter: [],
	activeStatusFilter: [],
	activeTechFilter: [],
	activeTeamFilter: [],
	lastClearedHighlightFilters: null,
	tagFilterMode: "any",
	statusFilterMode: "any",
	techFilterMode: "all",
	teamFilterMode: "any",
	setActiveTagFilter: (tags) => set({ activeTagFilter: tags }),
	toggleActiveTagFilter: (tag) => set((s) => {
		const idx = s.activeTagFilter.indexOf(tag);
		if (idx >= 0) s.activeTagFilter.splice(idx, 1);
		else s.activeTagFilter.push(tag);
	}),
	setActiveStatusFilter: (statuses) => set({ activeStatusFilter: statuses }),
	toggleActiveStatusFilter: (status) => set((s) => {
		const idx = s.activeStatusFilter.indexOf(status);
		if (idx >= 0) s.activeStatusFilter.splice(idx, 1);
		else s.activeStatusFilter.push(status);
	}),
	setActiveTechFilter: (techs) => set({ activeTechFilter: techs }),
	toggleActiveTechFilter: (tech) => set((s) => {
		const idx = s.activeTechFilter.indexOf(tech);
		if (idx >= 0) s.activeTechFilter.splice(idx, 1);
		else s.activeTechFilter.push(tech);
	}),
	setActiveTeamFilter: (teams) => set({ activeTeamFilter: teams }),
	toggleActiveTeamFilter: (team) => set((s) => {
		const idx = s.activeTeamFilter.indexOf(team);
		if (idx >= 0) s.activeTeamFilter.splice(idx, 1);
		else s.activeTeamFilter.push(team);
	}),
	clearAllHighlightFilters: () => set({
		activeTagFilter: [],
		activeStatusFilter: [],
		activeTechFilter: [],
		activeTeamFilter: [],
		lastClearedHighlightFilters: null
	}),
	restoreHighlightFilters: () => set((s) => {
		const stash = s.lastClearedHighlightFilters;
		if (!stash) return;
		s.activeTagFilter = stash.activeTagFilter;
		s.activeStatusFilter = stash.activeStatusFilter;
		s.activeTechFilter = stash.activeTechFilter;
		s.activeTeamFilter = stash.activeTeamFilter;
		s.lastClearedHighlightFilters = null;
	}),
	dismissClearedHighlightFiltersHint: () => set({ lastClearedHighlightFilters: null }),
	setTagFilterMode: (mode) => set({ tagFilterMode: mode }),
	setStatusFilterMode: (mode) => set({ statusFilterMode: mode }),
	setTechFilterMode: (mode) => set({ techFilterMode: mode }),
	setTeamFilterMode: (mode) => set({ teamFilterMode: mode })
});
//#endregion
//#region node_modules/nanoid/url-alphabet/index.js
var urlAlphabet = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";
//#endregion
//#region node_modules/nanoid/index.js
var GET_RANDOM_LIMIT = 65536;
function fillRandom(buffer) {
	let from = 0;
	while (from < buffer.length) {
		let to = Math.min(from + GET_RANDOM_LIMIT, buffer.length);
		crypto.getRandomValues(buffer.subarray(from, to));
		from = to;
	}
}
function random(bytes) {
	bytes |= 0;
	if (bytes < 0) throw new RangeError("Wrong ID size");
	let buffer = Buffer.allocUnsafe(bytes);
	fillRandom(buffer);
	return buffer;
}
function customRandom(alphabet, defaultSize, getRandom) {
	let safeByteCutoff = 256 - 256 % alphabet.length;
	if (safeByteCutoff === 256) {
		let mask = alphabet.length - 1;
		return (size = defaultSize) => {
			if (!size) return "";
			let id = "";
			while (true) {
				let bytes = getRandom(size);
				let i = size;
				while (i--) {
					id += alphabet[bytes[i] & mask];
					if (id.length >= size) return id;
				}
			}
		};
	}
	let step = Math.ceil(409.6 * defaultSize / safeByteCutoff);
	return (size = defaultSize) => {
		if (!size) return "";
		let id = "";
		while (true) {
			let bytes = getRandom(step);
			let i = step;
			while (i--) if (bytes[i] < safeByteCutoff) {
				id += alphabet[bytes[i] % alphabet.length];
				if (id.length >= size) return id;
			}
		}
	};
}
var POOL_MAX = GET_RANDOM_LIMIT / 2;
function customAlphabet(alphabet, defaultSize = 21) {
	if (typeof alphabet !== "string" || !alphabet || alphabet.length > 256) return customRandom(alphabet, defaultSize, random);
	for (let i = 0; i < alphabet.length; i++) if (alphabet.charCodeAt(i) > 255) return customRandom(alphabet, defaultSize, random);
	let charCodes = Uint8Array.from(alphabet, (str) => {
		return str.charCodeAt(0);
	});
	let alphabetLen = alphabet.length;
	let mask = (2 << 31 - Math.clz32(alphabetLen - 1 | 1)) - 1;
	let pool = "";
	let poolOffset = 0;
	let poolNext = 0;
	return (size = defaultSize) => {
		size |= 0;
		if (size < 0) throw new RangeError("Wrong ID size");
		if (size === 0) return "";
		if (poolOffset + size > pool.length) {
			let target = Math.max(poolNext, size);
			poolNext = Math.min(target * 16, POOL_MAX);
			let buffer = Buffer.allocUnsafe(target);
			if (mask === alphabetLen - 1) {
				fillRandom(buffer);
				for (let i = 0; i < target; i++) buffer[i] = charCodes[buffer[i] & mask];
			} else {
				let randomBytes = Buffer.allocUnsafe(Math.ceil(1.6 * (mask + 1) * target / alphabetLen));
				let accepted = 0;
				while (accepted < target) {
					fillRandom(randomBytes);
					for (let i = 0; i < randomBytes.length; i++) {
						let index = randomBytes[i] & mask;
						if (index < alphabetLen) {
							buffer[accepted++] = charCodes[index];
							if (accepted === target) break;
						}
					}
				}
			}
			pool = buffer.toString("latin1");
			poolOffset = 0;
		}
		poolOffset += size;
		return pool.substring(poolOffset - size, poolOffset);
	};
}
customAlphabet(urlAlphabet);
//#endregion
//#region src/store/internals.ts
var nanoid = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", 8);
/** Resolve the pre-mutation workspace reference suitable for the undo stack.
*  Inside an Immer producer, original(draft) returns the pre-produce ref —
*  immutable, structurally shared with the next state. Outside a producer
*  (e.g. test setState shortcuts), s.workspace is already a stable snapshot. */
function undoSnapshot(s) {
	if (!s.workspace) return null;
	return isDraft(s.workspace) ? original(s.workspace) : s.workspace;
}
/** Append the pre-produce workspace snapshot to undoStack and clear redoStack
*  in place. Safe to call before OR after mutations — original() always
*  returns the pre-produce ref, so position within the producer doesn't
*  matter. */
function pushUndoSnapshot(s) {
	if (s.batchApplying) return;
	const snapshot = undoSnapshot(s);
	if (!snapshot) return;
	s.undoStack.push(snapshot);
	if (s.undoStack.length > 25) s.undoStack.splice(0, s.undoStack.length - 25);
	s.redoStack.length = 0;
}
//#endregion
//#region src/store/slices/ui-slice.ts
var batchBaseWs = null;
var batchRedo = [];
var batchUndo = [];
var createUiSlice = (set, get) => ({
	leftPanelOpen: true,
	rightPanelOpen: true,
	searchOpen: false,
	commandPaletteOpen: false,
	iconListDialogOpen: false,
	canvasSettingsOpen: false,
	aiPanelOpen: false,
	aiPanelFeature: null,
	aiSettingsOpen: false,
	aiPanelBusy: false,
	batchApplying: false,
	canvasGuideOpen: false,
	addElementPanelOpen: false,
	highlighterOpenFacet: null,
	viewsPanelOpen: false,
	createViewDialogOpen: false,
	exportProposalDialogOpen: false,
	pendingDelete: null,
	presentationMode: false,
	minimapEnabled: true,
	snapToGrid: false,
	multiSelectMode: false,
	toggleLeftPanel: () => set((s) => {
		s.leftPanelOpen = !s.leftPanelOpen;
	}),
	toggleRightPanel: () => set((s) => {
		s.rightPanelOpen = !s.rightPanelOpen;
	}),
	setLeftPanelOpen: (open) => set({ leftPanelOpen: open }),
	setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
	setSearchOpen: (open) => set({
		searchOpen: open,
		commandPaletteOpen: false
	}),
	setCommandPaletteOpen: (open) => set({
		commandPaletteOpen: open,
		searchOpen: false
	}),
	setIconListDialogOpen: (open) => set({
		iconListDialogOpen: open,
		commandPaletteOpen: false
	}),
	setCanvasSettingsOpen: (open) => set({
		canvasSettingsOpen: open,
		commandPaletteOpen: false
	}),
	setAiPanelOpen: (open, feature) => set((s) => {
		s.aiPanelOpen = open;
		s.aiPanelFeature = open ? feature ?? null : null;
		s.commandPaletteOpen = false;
	}),
	setAiSettingsOpen: (open) => set((s) => {
		s.aiSettingsOpen = open;
		s.commandPaletteOpen = false;
		if (open) {
			s.aiPanelOpen = true;
			s.aiPanelFeature = null;
		}
	}),
	clearAiPanelFeature: () => set({ aiPanelFeature: null }),
	setAiPanelBusy: (busy) => set({ aiPanelBusy: busy }),
	setBatchApplying: (on) => {
		if (on && get().readOnly) return;
		if (on && !get().batchApplying) {
			batchBaseWs = get().workspace ?? null;
			batchRedo = get().redoStack.slice();
			batchUndo = get().undoStack.slice();
			set((s) => {
				pushUndoSnapshot(s);
				s.batchApplying = true;
			});
		} else if (!on && get().batchApplying) {
			const unchanged = get().workspace === batchBaseWs;
			set((s) => {
				if (unchanged) {
					s.undoStack = batchUndo;
					s.redoStack = batchRedo;
				}
				s.batchApplying = false;
			});
			batchBaseWs = null;
			batchRedo = [];
			batchUndo = [];
		} else set((s) => {
			s.batchApplying = on;
		});
	},
	setCanvasGuideOpen: (open) => set({
		canvasGuideOpen: open,
		commandPaletteOpen: false
	}),
	setAddElementPanelOpen: (open) => set({
		addElementPanelOpen: open,
		commandPaletteOpen: false
	}),
	setHighlighterOpenFacet: (facet) => set({
		highlighterOpenFacet: facet,
		commandPaletteOpen: false
	}),
	setViewsPanelOpen: (open) => set({ viewsPanelOpen: open }),
	toggleViewsPanel: () => set((s) => {
		s.viewsPanelOpen = !s.viewsPanelOpen;
	}),
	setCreateViewDialogOpen: (open) => set({
		createViewDialogOpen: open,
		commandPaletteOpen: false
	}),
	setExportProposalDialogOpen: (open) => set({
		exportProposalDialogOpen: open,
		commandPaletteOpen: false
	}),
	toggleMinimap: () => set((s) => {
		s.minimapEnabled = !s.minimapEnabled;
	}),
	toggleSnapToGrid: () => set((s) => {
		s.snapToGrid = !s.snapToGrid;
	}),
	setMultiSelectMode: (on) => set({ multiSelectMode: on }),
	setPresentationMode: (on) => set({ presentationMode: on }),
	confirmDelete: (payload, onConfirm) => set({ pendingDelete: typeof payload === "string" ? {
		message: payload,
		onConfirm
	} : {
		message: payload.message,
		impact: payload.impact,
		onConfirm
	} }),
	cancelDelete: () => set({ pendingDelete: null })
});
//#endregion
//#region src/store/slices/selection-slice.ts
var createSelectionSlice = (set) => ({
	selectedElementIds: [],
	selectedRelationshipId: null,
	selectedGroupId: null,
	selectElements: (ids) => set((s) => {
		s.selectedElementIds = ids;
		s.selectedRelationshipId = null;
		s.selectedGroupId = null;
		if (ids.length > 0) s.highlighterOpenFacet = null;
	}),
	selectRelationship: (id) => set((s) => {
		s.selectedRelationshipId = id;
		s.selectedElementIds = [];
		s.selectedGroupId = null;
		if (id) s.highlighterOpenFacet = null;
	}),
	selectGroup: (id) => set((s) => {
		s.selectedGroupId = id;
		s.selectedElementIds = [];
		s.selectedRelationshipId = null;
		if (id) s.highlighterOpenFacet = null;
	}),
	clearSelection: () => set({
		selectedElementIds: [],
		selectedRelationshipId: null,
		selectedGroupId: null
	})
});
//#endregion
//#region src/store/workspace-selectors.ts
function getFirstViewKey(workspace) {
	return allViewsOf(workspace)[0]?.key ?? null;
}
function findChildView(workspace, elementId, currentViewKey) {
	const element = findElementHelper(workspace, elementId);
	if (!element) return void 0;
	if (element.type === "softwareSystem") {
		const container = workspace.views.containerViews.find((v) => v.softwareSystemId === elementId);
		if (container) return container;
		const context = workspace.views.systemContextViews.find((v) => v.softwareSystemId === elementId);
		if (context && context.key !== currentViewKey) return context;
		return;
	}
	if (element.type === "container") return workspace.views.componentViews.find((v) => v.containerId === elementId);
}
/** Determine whether an element can be "zoomed into". Unlike canDrillInto, this
*  does NOT require a child view (or even child elements) to exist — the zoom-in
*  flow prompts to create one, and empty views are a valid starting point for
*  adding the first containers/components. */
function getZoomTarget(workspace, elementId) {
	const element = findElementHelper(workspace, elementId);
	if (!element) return null;
	if (element.type === "softwareSystem" && element.location !== "External") return {
		elementName: element.name,
		targetType: "container"
	};
	if (element.type === "container") return {
		elementName: element.name,
		targetType: "component"
	};
	return null;
}
/**
* The focal-scope element ID for `view` — the element the view is *about*:
* the system whose context/containers a view shows, or the container whose
* components a view shows. Returns undefined for landscape views (no focal
* element) and for unknown view shapes.
*
* Single source of truth — every focal-scope check (Backspace guard, Trash
* guard, AddElementPanel filter, removeElementsFromView guard, deleteElements
* defense-in-depth) routes through here so the rule can never quietly drift.
*/
function getFocalScopeId(view) {
	if (!view) return void 0;
	switch (view.type) {
		case "systemContext":
		case "container": return view.softwareSystemId;
		case "component": return view.containerId;
		default: return;
	}
}
//#endregion
//#region src/lib/announce.ts
/** Announce a message to screen readers via the live region */
function announce(message) {
	if (typeof document === "undefined") return;
	const el = document.getElementById("c4hero-live");
	if (el) {
		el.textContent = "";
		(typeof requestAnimationFrame === "function" ? requestAnimationFrame : (cb) => globalThis.setTimeout(() => cb(globalThis.performance?.now() ?? Date.now()), 0))(() => {
			el.textContent = message;
		});
	}
}
//#endregion
//#region src/store/slices/navigation-slice.ts
/** If any Highlighter filter is non-empty, snapshot all four into
*  `lastClearedHighlightFilters` and clear the active filters. Idempotent
*  when filters are empty (preserves any pre-existing stash). Modes are
*  preferences and are intentionally NOT touched. */
function clearHighlightFiltersWithStash(s) {
	if (!(s.activeTagFilter.length > 0 || s.activeStatusFilter.length > 0 || s.activeTechFilter.length > 0 || s.activeTeamFilter.length > 0)) return false;
	s.lastClearedHighlightFilters = {
		activeTagFilter: [...s.activeTagFilter],
		activeStatusFilter: [...s.activeStatusFilter],
		activeTechFilter: [...s.activeTechFilter],
		activeTeamFilter: [...s.activeTeamFilter]
	};
	s.activeTagFilter = [];
	s.activeStatusFilter = [];
	s.activeTechFilter = [];
	s.activeTeamFilter = [];
	return true;
}
var createNavigationSlice = (set, get) => ({
	activeViewKey: null,
	viewHistory: [],
	pendingZoomConfirm: null,
	createViewDefaults: null,
	focusElementId: null,
	focusRelationshipId: null,
	clearFocusElement: () => set({ focusElementId: null }),
	clearFocusRelationship: () => set({ focusRelationshipId: null }),
	focusViewForElements: (ids) => set((s) => {
		if (!s.workspace || ids.length === 0) return;
		const idSet = new Set(ids);
		const tiers = [
			s.workspace.views.componentViews,
			s.workspace.views.containerViews,
			s.workspace.views.systemContextViews,
			s.workspace.views.systemLandscapeViews
		];
		let best = null;
		for (const tier of tiers) {
			let bestCount = 0;
			for (const v of tier) {
				const count = v.elements.reduce((n, e) => n + (idSet.has(e.id) ? 1 : 0), 0);
				if (count > bestCount) {
					bestCount = count;
					best = v.key;
				}
			}
			if (best) break;
		}
		if (best && best !== s.activeViewKey) {
			if (s.activeViewKey) s.viewHistory.push(s.activeViewKey);
			s.activeViewKey = best;
			clearSelectionDraft(s);
			if (clearHighlightFiltersWithStash(s)) announce("Highlighter cleared on view change");
		}
	}),
	setActiveView: (key) => set((s) => {
		const changed = s.activeViewKey !== key;
		s.activeViewKey = key;
		s.selectedElementIds = [];
		s.selectedRelationshipId = null;
		s.selectedGroupId = null;
		if (changed && clearHighlightFiltersWithStash(s)) announce("Highlighter cleared on view change");
	}),
	drillInto: (elementId) => set((s) => {
		if (!s.workspace || !s.activeViewKey) return;
		const childView = findChildView(s.workspace, elementId);
		if (!childView) return;
		if (childView.key === s.activeViewKey) return;
		s.viewHistory.push(s.activeViewKey);
		s.activeViewKey = childView.key;
		s.selectedElementIds = [];
		s.selectedRelationshipId = null;
		s.selectedGroupId = null;
		if (clearHighlightFiltersWithStash(s)) announce("Highlighter cleared on view change");
	}),
	zoomInto: (elementId) => {
		const s = get();
		if (!s.workspace || !s.activeViewKey) return;
		const childView = findChildView(s.workspace, elementId, s.activeViewKey);
		if (childView && childView.key !== s.activeViewKey) {
			get().drillInto(elementId);
			return;
		}
		if (s.readOnly) return;
		const target = getZoomTarget(s.workspace, elementId);
		if (!target) return;
		set({ pendingZoomConfirm: {
			elementId,
			elementName: target.elementName,
			targetType: target.targetType
		} });
	},
	confirmZoomCreate: () => {
		if (get().readOnly) return;
		const s = get();
		const pending = s.pendingZoomConfirm;
		if (!pending || !s.workspace) return;
		const viewTypeName = pending.targetType === "container" ? "Container" : "Component";
		const title = `${pending.elementName} — ${viewTypeName}s`;
		const prevActive = s.activeViewKey;
		get().addView(pending.targetType, pending.elementId, title);
		if (prevActive) set((curr) => {
			curr.viewHistory.push(prevActive);
			curr.pendingZoomConfirm = null;
		});
		else set({ pendingZoomConfirm: null });
	},
	cancelZoomConfirm: () => set({ pendingZoomConfirm: null }),
	openCreateViewFromZoom: () => {
		if (get().readOnly) return;
		const pending = get().pendingZoomConfirm;
		if (!pending) return;
		set({
			pendingZoomConfirm: null,
			createViewDefaults: {
				type: pending.targetType,
				scopeId: pending.elementId
			},
			createViewDialogOpen: true
		});
	},
	setCreateViewDefaults: (defaults) => set({ createViewDefaults: defaults }),
	navigateBack: () => set((s) => {
		if (s.viewHistory.length === 0) return;
		s.activeViewKey = s.viewHistory.pop();
		s.selectedElementIds = [];
		s.selectedRelationshipId = null;
		s.selectedGroupId = null;
		if (clearHighlightFiltersWithStash(s)) announce("Highlighter cleared on view change");
	}),
	revealInView: (viewKey, target) => set((s) => {
		if (s.activeViewKey !== viewKey) {
			if (s.activeViewKey) s.viewHistory.push(s.activeViewKey);
			s.activeViewKey = viewKey;
			clearSelectionDraft(s);
			if (clearHighlightFiltersWithStash(s)) announce("Highlighter cleared on view change");
		}
		if (target.kind === "element") {
			s.selectedElementIds = [target.id];
			s.selectedRelationshipId = null;
			s.focusElementId = target.id;
			s.focusRelationshipId = null;
		} else {
			s.selectedRelationshipId = target.id;
			s.selectedElementIds = [];
			s.focusRelationshipId = target.id;
			s.focusElementId = null;
		}
		s.selectedGroupId = null;
	})
});
//#endregion
//#region src/store/slices/element-slice.ts
/** Drop the ids from a view and prune relationship refs left without both endpoints. */
function removeFromView(ws, view, ids) {
	view.elements = view.elements.filter((e) => !ids.has(e.id));
	const present = new Set(view.elements.map((e) => e.id));
	const relById = new Map(ws.model.relationships.map((r) => [r.id, r]));
	view.relationships = view.relationships.filter((r) => {
		const rel = relById.get(r.id);
		return !rel || present.has(rel.sourceId) && present.has(rel.destinationId);
	});
}
/** Add an element to a view plus the relationships it has to elements already shown. */
function addToScopedView(ws, view, id) {
	if (!view.elements.some((e) => e.id === id)) view.elements.push({ id });
	const present = new Set(view.elements.map((e) => e.id));
	for (const r of ws.model.relationships) {
		if (r.sourceId !== id && r.destinationId !== id) continue;
		if (!present.has(r.sourceId) || !present.has(r.destinationId)) continue;
		if (!view.relationships.some((vr) => vr.id === r.id)) view.relationships.push({ id: r.id });
	}
}
/** The software system that owns a container or component (undefined for top-level elements). */
function owningSystemId(ws, id) {
	return ws.model.softwareSystems.find((sys) => sys.containers.some((c) => c.id === id || c.components.some((comp) => comp.id === id)))?.id;
}
/** Drop dynamic steps that stopped being valid for their view's scope because an endpoint
*  left it: a system-scoped view only shows containers/components of that system, a
*  container-scoped view only the components of that container. Steps that were already
*  out of scope before the move are left alone. */
function dropInvalidDynamicSteps(ws, movedId, moved, oldSystemId, oldContainerId) {
	const relById = new Map(ws.model.relationships.map((r) => [r.id, r]));
	for (const v of ws.views.dynamicViews ?? []) {
		const scopeSystemId = v.softwareSystemId;
		const scopeContainerId = v.containerId;
		if (!scopeSystemId && !scopeContainerId) continue;
		const leftScope = (endpoint) => {
			if (!endpoint || !moved.has(endpoint)) return false;
			if (scopeSystemId) return oldSystemId === scopeSystemId && owningSystemId(ws, endpoint) !== scopeSystemId;
			return oldContainerId === scopeContainerId && endpoint === movedId;
		};
		const kept = v.relationships.filter((step) => {
			const rel = relById.get(step.id);
			return !(leftScope(step.sourceId ?? rel?.sourceId) || leftScope(step.destinationId ?? rel?.destinationId));
		});
		if (kept.length === v.relationships.length) continue;
		v.relationships = kept;
		normalizeDynamicView(ws, v);
	}
}
var createElementSlice = (set, get) => ({
	addPerson: (name, position, location) => {
		if (get().readOnly) return "";
		const id = nanoid(8);
		set((s) => {
			if (!s.workspace) return;
			pushUndoSnapshot(s);
			const ws = s.workspace;
			const person = {
				id,
				type: "person",
				name: uniqueElementName(name, ws),
				tags: ["Element", "Person"],
				properties: {},
				location: location ?? "Internal"
			};
			ws.model.people.push(person);
			addToCurrentView(ws, s.activeViewKey, id, position, "person");
			for (const v of ws.views.systemLandscapeViews) if (v.key !== s.activeViewKey && !v.elements.some((e) => e.id === id)) v.elements.push({ id });
			selectCreated(s, id);
		});
		announce("Person created");
		return id;
	},
	addSoftwareSystem: (name, position, location) => {
		if (get().readOnly) return "";
		const id = nanoid(8);
		set((s) => {
			if (!s.workspace) return;
			pushUndoSnapshot(s);
			const ws = s.workspace;
			const system = {
				id,
				type: "softwareSystem",
				name: uniqueElementName(name, ws),
				tags: ["Element", "Software System"],
				properties: {},
				containers: [],
				location: location ?? "Internal"
			};
			ws.model.softwareSystems.push(system);
			addToCurrentView(ws, s.activeViewKey, id, position, "softwareSystem");
			for (const v of ws.views.systemLandscapeViews) if (v.key !== s.activeViewKey && !v.elements.some((e) => e.id === id)) v.elements.push({ id });
			selectCreated(s, id);
		});
		get().revalidateScope();
		announce("System created");
		return id;
	},
	addContainer: (systemId, name, position, extraTag) => {
		if (get().readOnly) return "";
		const id = nanoid(8);
		let added = false;
		set((s) => {
			if (!s.workspace) return;
			const ws = s.workspace;
			const system = ws.model.softwareSystems.find((sys) => sys.id === systemId);
			if (!system) return;
			pushUndoSnapshot(s);
			const tags = extraTag ? [
				"Element",
				"Container",
				extraTag
			] : ["Element", "Container"];
			const container = {
				id,
				type: "container",
				name: uniqueElementName(name, ws),
				tags,
				properties: {},
				components: []
			};
			system.containers.push(container);
			let placed = false;
			for (const v of ws.views.containerViews) {
				if (v.softwareSystemId !== systemId) continue;
				if (!v.elements.some((e) => e.id === id)) v.elements.push(v.key === s.activeViewKey ? {
					id,
					x: position?.x,
					y: position?.y
				} : { id });
				placed = true;
			}
			if (!placed) {
				const vk = nanoid(8);
				appendScopedView(ws, "container", systemId, `${system.name} — Containers`, vk);
				if (!s.batchApplying) s.activeViewKey = vk;
			}
			selectCreated(s, id);
			added = true;
		});
		if (added) {
			get().revalidateScope();
			announce("Container created");
		}
		return id;
	},
	addComponent: (containerId, name, position) => {
		if (get().readOnly) return "";
		const id = nanoid(8);
		let added = false;
		set((s) => {
			if (!s.workspace) return;
			const ws = s.workspace;
			for (const sys of ws.model.softwareSystems) {
				const container = sys.containers.find((c) => c.id === containerId);
				if (!container) continue;
				pushUndoSnapshot(s);
				const comp = {
					id,
					type: "component",
					name: uniqueElementName(name, ws),
					tags: ["Element", "Component"],
					properties: {}
				};
				container.components.push(comp);
				let placed = false;
				for (const v of ws.views.componentViews) {
					if (v.containerId !== containerId) continue;
					if (!v.elements.some((e) => e.id === id)) v.elements.push(v.key === s.activeViewKey ? {
						id,
						x: position?.x,
						y: position?.y
					} : { id });
					placed = true;
				}
				if (!placed) {
					const vk = nanoid(8);
					appendScopedView(ws, "component", containerId, `${container.name} — Components`, vk);
					if (!s.batchApplying) s.activeViewKey = vk;
				}
				selectCreated(s, id);
				added = true;
				return;
			}
		});
		if (added) announce("Component created");
		return id;
	},
	updateElement: (id, patch) => set((s) => {
		if (s.readOnly || !s.workspace) return;
		if (!applyElementPatch(s.workspace, id, patch)) return;
		pushUndoSnapshot(s);
	}),
	updateElementLive: (id, patch) => set((s) => {
		if (s.readOnly || !s.workspace) return;
		applyElementPatch(s.workspace, id, patch);
	}),
	updateElementTechnology: (id, technology) => set((s) => {
		if (s.readOnly || !s.workspace) return;
		if (!applyElementPatch(s.workspace, id, { technology })) return;
		pushUndoSnapshot(s);
	}),
	moveElement: (id, newParentId) => {
		if (get().readOnly) return false;
		let moved = false;
		set((s) => {
			if (!s.workspace) return;
			const ws = s.workspace;
			const systems = ws.model.softwareSystems;
			let oldSystemId;
			let oldContainerId;
			let ids;
			let place;
			const fromSystem = systems.find((sys) => sys.containers.some((c) => c.id === id));
			if (fromSystem) {
				const target = systems.find((sys) => sys.id === newParentId);
				if (!target || target === fromSystem) return;
				const container = fromSystem.containers.find((c) => c.id === id);
				oldSystemId = fromSystem.id;
				ids = [id, ...container.components.map((c) => c.id)];
				place = () => {
					fromSystem.containers = fromSystem.containers.filter((c) => c.id !== id);
					target.containers.push(container);
				};
			} else {
				const fromContainer = systems.flatMap((sys) => sys.containers).find((c) => c.components.some((comp) => comp.id === id));
				if (!fromContainer) return;
				const target = systems.flatMap((sys) => sys.containers).find((c) => c.id === newParentId);
				if (!target || target === fromContainer) return;
				const component = fromContainer.components.find((c) => c.id === id);
				oldContainerId = fromContainer.id;
				oldSystemId = owningSystemId(ws, id);
				ids = [id];
				place = () => {
					fromContainer.components = fromContainer.components.filter((c) => c.id !== id);
					target.components.push(component);
				};
			}
			pushUndoSnapshot(s);
			place();
			invalidateElementIndex(ws);
			const movedIds = new Set(ids);
			for (const v of ws.views.containerViews) if (oldContainerId === void 0 && v.softwareSystemId === oldSystemId) removeFromView(ws, v, movedIds);
			for (const v of ws.views.componentViews) if (oldContainerId !== void 0 && v.containerId === oldContainerId) removeFromView(ws, v, movedIds);
			for (const g of ws.model.groups) g.elementIds = g.elementIds.filter((eid) => eid !== id);
			dropInvalidDynamicSteps(ws, id, movedIds, oldSystemId, oldContainerId);
			const element = oldContainerId === void 0 ? "container" : "component";
			const scoped = (element === "container" ? ws.views.containerViews : ws.views.componentViews).filter((v) => (element === "container" ? v.softwareSystemId : v.containerId) === newParentId);
			for (const v of scoped) addToScopedView(ws, v, id);
			if (scoped.length === 0) {
				const parentName = findElementHelper(ws, newParentId)?.name ?? newParentId;
				appendScopedView(ws, element, newParentId, element === "container" ? `${parentName} — Containers` : `${parentName} — Components`, nanoid(8));
			}
			moved = true;
		});
		if (moved) {
			get().revalidateScope();
			announce("Element moved");
		}
		return moved;
	},
	deleteElement: (id) => {
		if (get().readOnly) return;
		get().deleteElements([id]);
	},
	deleteElements: (ids) => {
		if (get().readOnly) return;
		if (ids.length === 0) return;
		set((s) => {
			if (!s.workspace) return;
			pushUndoSnapshot(s);
			cascadeDeleteElements(s.workspace, ids);
			s.activeViewKey = (s.activeViewKey ? !!findViewHelper(s.workspace, s.activeViewKey) : false) ? s.activeViewKey : getFirstViewKey(s.workspace);
			s.viewHistory = s.viewHistory.filter((k) => !!findViewHelper(s.workspace, k));
			s.selectedElementIds = [];
			s.selectedRelationshipId = null;
			s.selectedGroupId = null;
		});
		get().revalidateScope();
		announce(ids.length === 1 ? "Element deleted" : `${ids.length} elements deleted`);
	},
	duplicateElements: (ids) => {
		if (get().readOnly) return [];
		let createdIds = [];
		set((s) => {
			if (!s.workspace || !s.activeViewKey) return;
			createdIds = duplicateElementsInTree(s.workspace, ids, s.activeViewKey, () => nanoid(8));
			if (createdIds.length === 0) return;
			pushUndoSnapshot(s);
			s.selectedElementIds = createdIds;
			s.selectedRelationshipId = null;
			s.selectedGroupId = null;
		});
		if (createdIds.length > 0) {
			announce(createdIds.length === 1 ? "Element duplicated" : `${createdIds.length} elements duplicated`);
			get().revalidateScope();
		}
		return createdIds;
	}
});
//#endregion
//#region src/store/slices/group-slice.ts
var createGroupSlice = (set, get) => ({
	addGroup: (name, elementIds = []) => {
		if (get().readOnly) return "";
		const id = nanoid(8);
		set((s) => {
			if (!s.workspace) return;
			pushUndoSnapshot(s);
			const group = {
				id,
				name,
				elementIds
			};
			s.workspace.model.groups.push(group);
		});
		return id;
	},
	updateGroup: (id, patch) => set((s) => {
		if (s.readOnly) return;
		if (!s.workspace) return;
		const group = s.workspace.model.groups.find((g) => g.id === id);
		if (!group) return;
		let changed = false;
		if (patch.name !== void 0 && group.name !== patch.name) {
			group.name = patch.name;
			changed = true;
		}
		if (patch.elementIds !== void 0) {
			group.elementIds = patch.elementIds;
			changed = true;
		}
		if (!changed) return;
		pushUndoSnapshot(s);
	}),
	deleteGroup: (id) => set((s) => {
		if (s.readOnly) return;
		if (!s.workspace) return;
		const deleted = s.workspace.model.groups.find((g) => g.id === id);
		if (!deleted) return;
		pushUndoSnapshot(s);
		for (const group of s.workspace.model.groups) {
			if (group.parentId !== id) continue;
			if (deleted.parentId) group.parentId = deleted.parentId;
			else delete group.parentId;
		}
		s.workspace.model.groups = s.workspace.model.groups.filter((g) => g.id !== id);
		if (s.selectedGroupId === id) s.selectedGroupId = null;
	})
});
//#endregion
//#region src/store/slices/relationship-slice.ts
/** Drop every step of `relId` from a dynamic view and recompute the view's
*  derived element membership from the surviving steps. Dynamic membership
*  exists only as a projection of the steps — leaving an element behind after
*  its last step dies renders an orphan node until the next reload. */
function dropDynamicSteps(ws, v, relId) {
	const before = v.relationships.length;
	v.relationships = v.relationships.filter((r) => r.id !== relId);
	if (v.relationships.length === before) return;
	const endpoints = /* @__PURE__ */ new Set();
	for (const step of v.relationships) {
		const stepRel = ws.model.relationships.find((r) => r.id === step.id);
		endpoints.add(step.sourceId ?? stepRel?.sourceId ?? "");
		endpoints.add(step.destinationId ?? stepRel?.destinationId ?? "");
	}
	v.elements = v.elements.filter((e) => endpoints.has(e.id));
}
var createRelationshipSlice = (set, get) => ({
	addRelationship: (sourceId, destinationId, description, technology) => {
		if (get().readOnly) return "";
		const id = nanoid(8);
		let created = false;
		set((s) => {
			if (!s.workspace) return;
			if (sourceId === destinationId) return;
			const ws = s.workspace;
			if (!elementExists(ws, sourceId) || !elementExists(ws, destinationId)) return;
			pushUndoSnapshot(s);
			const rel = {
				id,
				sourceId,
				destinationId,
				description,
				technology,
				tags: ["Relationship"],
				properties: {}
			};
			ws.model.relationships.push(rel);
			created = true;
			for (const v of ws.views.systemContextViews) {
				if (!v.softwareSystemId) continue;
				const scopeId = v.softwareSystemId;
				const sourceIsScope = sourceId === scopeId;
				if (sourceIsScope || destinationId === scopeId) {
					const actorId = sourceIsScope ? destinationId : sourceId;
					if (!v.elements.some((e) => e.id === actorId)) v.elements.push({ id: actorId });
				}
			}
			for (const view of allViewsOf(ws)) {
				if (view.type === "dynamic" || view.type === "deployment") continue;
				const viewElIds = new Set(view.elements.map((e) => e.id));
				if (viewElIds.has(sourceId) && viewElIds.has(destinationId)) {
					if (!view.relationships.some((r) => r.id === id)) view.relationships.push({ id });
				}
			}
			s.selectedRelationshipId = id;
			s.selectedElementIds = [];
			s.selectedGroupId = null;
			if (!s.batchApplying && !s.aiPanelBusy) closeAiSurfaces(s);
		});
		return created ? id : "";
	},
	updateRelationship: (id, patch) => set((s) => {
		if (s.readOnly) return;
		if (!s.workspace) return;
		const rel = s.workspace.model.relationships.find((r) => r.id === id);
		if (!rel) return;
		let changed = false;
		if ("description" in patch && rel.description !== patch.description) {
			rel.description = patch.description;
			changed = true;
		}
		if ("technology" in patch && rel.technology !== patch.technology) {
			rel.technology = patch.technology;
			changed = true;
		}
		if ("interactionStyle" in patch && rel.interactionStyle !== patch.interactionStyle) {
			rel.interactionStyle = patch.interactionStyle;
			changed = true;
		}
		if ("lineStyle" in patch && rel.lineStyle !== patch.lineStyle) {
			rel.lineStyle = patch.lineStyle;
			changed = true;
		}
		if ("url" in patch && rel.url !== patch.url) {
			rel.url = patch.url;
			changed = true;
		}
		if (patch.tags !== void 0) {
			if (patch.tags.length !== rel.tags.length || patch.tags.some((t, i) => t !== rel.tags[i])) {
				rel.tags = patch.tags;
				changed = true;
			}
		}
		if (patch.properties !== void 0) {
			if (JSON.stringify(patch.properties) !== JSON.stringify(rel.properties)) {
				rel.properties = patch.properties;
				changed = true;
			}
		}
		if ("documents" in patch) {
			if (JSON.stringify(patch.documents) !== JSON.stringify(rel.documents)) {
				rel.documents = patch.documents;
				changed = true;
			}
		}
		if (!changed) return;
		pushUndoSnapshot(s);
	}),
	reconnectRelationship: (id, newSourceId, newTargetId) => set((s) => {
		if (s.readOnly) return;
		if (!s.workspace) return;
		const ws = s.workspace;
		const rel = ws.model.relationships.find((r) => r.id === id);
		if (!rel) return;
		if (rel.sourceId === newSourceId && rel.destinationId === newTargetId) return;
		if (newSourceId === newTargetId) return;
		if (!elementExists(ws, newSourceId) || !elementExists(ws, newTargetId)) return;
		pushUndoSnapshot(s);
		rel.sourceId = newSourceId;
		rel.destinationId = newTargetId;
		for (const v of ws.views.systemContextViews) {
			if (!v.softwareSystemId) continue;
			const scopeId = v.softwareSystemId;
			const sourceIsScope = newSourceId === scopeId;
			if (sourceIsScope || newTargetId === scopeId) {
				const actorId = sourceIsScope ? newTargetId : newSourceId;
				if (!v.elements.some((e) => e.id === actorId)) v.elements.push({ id: actorId });
			}
		}
		forEachView(ws, (v) => {
			if (v.type === "dynamic") {
				dropDynamicSteps(ws, v, id);
				return;
			}
			const elIds = new Set(v.elements.map((e) => e.id));
			const hasRel = v.relationships.some((r) => r.id === id);
			const bothPresent = elIds.has(newSourceId) && elIds.has(newTargetId);
			if (hasRel && !bothPresent) v.relationships = v.relationships.filter((r) => r.id !== id);
			else if (!hasRel && bothPresent) v.relationships.push({ id });
		});
	}),
	deleteRelationship: (id) => set((s) => {
		if (s.readOnly) return;
		if (!s.workspace) return;
		const ws = s.workspace;
		if (!ws.model.relationships.some((r) => r.id === id)) return;
		pushUndoSnapshot(s);
		ws.model.relationships = ws.model.relationships.filter((r) => r.id !== id);
		forEachView(ws, (v) => {
			if (v.type === "dynamic") {
				dropDynamicSteps(ws, v, id);
				return;
			}
			v.relationships = v.relationships.filter((r) => r.id !== id);
		});
		if (s.selectedRelationshipId === id) s.selectedRelationshipId = null;
	})
});
//#endregion
//#region src/store/slices/view-slice.ts
/** Drop the saved positions a full re-layout is meant to discard, leaving
*  locked elements exactly where the user put them. Exported so tests can
*  exercise the real implementation instead of a hand-copied stand-in. */
function clearUnlockedPositions(view) {
	for (const el of view.elements) {
		if (el.locked) continue;
		el.x = void 0;
		el.y = void 0;
		el.pinned = void 0;
	}
}
var createViewSlice = (set, get) => ({
	layoutVersion: 0,
	addView: (type, scopeId, title, options) => {
		if (get().readOnly) return "";
		const key = nanoid(8);
		set((s) => {
			if (!s.workspace) return;
			pushUndoSnapshot(s);
			appendScopedView(s.workspace, type, scopeId, title ?? `New ${type} view`, key, options);
			s.activeViewKey = key;
			s.selectedElementIds = [];
			s.selectedRelationshipId = null;
			s.selectedGroupId = null;
		});
		return key;
	},
	deleteView: (key) => set((s) => {
		if (s.readOnly) return;
		if (!s.workspace) return;
		const ws = s.workspace;
		let found = false;
		for (const arrKey of VIEW_ARRAY_KEYS) {
			const idx = (ws.views[arrKey] ?? []).findIndex((v) => v.key === key);
			if (idx !== -1) {
				pushUndoSnapshot(s);
				ws.views[arrKey].splice(idx, 1);
				found = true;
				break;
			}
		}
		if (!found) return;
		if (s.activeViewKey === key) {
			s.activeViewKey = getFirstViewKey(ws);
			s.selectedElementIds = [];
			s.selectedRelationshipId = null;
			s.selectedGroupId = null;
		}
		s.viewHistory = s.viewHistory.filter((k) => k !== key);
	}),
	renameView: (key, title) => set((s) => {
		if (s.readOnly) return;
		if (!s.workspace) return;
		const ws = s.workspace;
		for (const arrKey of VIEW_ARRAY_KEYS) {
			const v = (ws.views[arrKey] ?? []).find((v) => v.key === key);
			if (v) {
				if (v.title === title) return;
				pushUndoSnapshot(s);
				v.title = title;
				return;
			}
		}
	}),
	duplicateView: (key) => {
		if (get().readOnly) return "";
		const newKey = nanoid(8);
		set((s) => {
			if (!s.workspace) return;
			const ws = s.workspace;
			for (const arrKey of VIEW_ARRAY_KEYS) {
				const src = (ws.views[arrKey] ?? []).find((v) => v.key === key);
				if (!src) continue;
				pushUndoSnapshot(s);
				const detached = current(src);
				const copy = {
					...structuredClone(detached),
					key: newKey,
					title: `${src.title ?? "View"} copy`
				};
				ws.views[arrKey].push(copy);
				s.activeViewKey = newKey;
				s.selectedElementIds = [];
				s.selectedRelationshipId = null;
				s.selectedGroupId = null;
				return;
			}
		});
		return newKey;
	},
	updateNodePosition: (nodeId, x, y) => set((s) => {
		if (s.readOnly) return;
		if (!s.workspace || !s.activeViewKey) return;
		for (const key of VIEW_ARRAY_KEYS) {
			const view = (s.workspace.views[key] ?? []).find((v) => v.key === s.activeViewKey);
			if (!view) continue;
			if (view.locked) return;
			const el = view.elements.find((e) => e.id === nodeId);
			if (!el) return;
			if (el.locked) return;
			el.x = x;
			el.y = y;
			el.pinned = true;
			return;
		}
	}),
	updateNodePositions: (updates) => set((s) => {
		if (s.readOnly) return;
		if (!s.workspace || !s.activeViewKey) return;
		const updateMap = new Map(updates.map((u) => [u.id, u]));
		for (const key of VIEW_ARRAY_KEYS) {
			const view = (s.workspace.views[key] ?? []).find((v) => v.key === s.activeViewKey);
			if (!view) continue;
			if (view.locked) return;
			for (const el of view.elements) {
				if (el.locked) continue;
				const u = updateMap.get(el.id);
				if (!u) continue;
				el.x = u.x;
				el.y = u.y;
				el.pinned = true;
			}
			return;
		}
	}),
	syncAutoLayoutPositions: (viewKey, updates) => set((s) => {
		if (!s.workspace || updates.size === 0) return;
		for (const key of VIEW_ARRAY_KEYS) {
			const view = (s.workspace.views[key] ?? []).find((v) => v.key === viewKey);
			if (!view) continue;
			for (const el of view.elements) {
				if (el.x !== void 0 && el.y !== void 0) continue;
				const u = updates.get(el.id);
				if (!u) continue;
				el.x = u.x;
				el.y = u.y;
			}
			return;
		}
	}),
	removeElementsFromView: (viewKey, ids) => set((s) => {
		if (s.readOnly) return;
		if (!s.workspace) return;
		if (ids.length === 0) return;
		const ws = s.workspace;
		const view = findViewHelper(ws, viewKey);
		if (!view) return;
		const focalId = getFocalScopeId(view);
		const removable = new Set(ids.filter((id) => id !== focalId));
		if (removable.size === 0) return;
		pushUndoSnapshot(s);
		view.elements = view.elements.filter((e) => !removable.has(e.id));
		view.relationships = view.relationships.filter((r) => {
			const rel = ws.model.relationships.find((mr) => mr.id === r.id);
			if (!rel) return false;
			return !removable.has(rel.sourceId) && !removable.has(rel.destinationId);
		});
	}),
	toggleElementInView: (viewKey, elementId) => set((s) => {
		if (s.readOnly) return;
		if (!s.workspace) return;
		const ws = s.workspace;
		const view = findViewHelper(ws, viewKey);
		if (!view) return;
		const idx = view.elements.findIndex((e) => e.id === elementId);
		pushUndoSnapshot(s);
		if (idx >= 0) {
			view.elements.splice(idx, 1);
			view.relationships = view.relationships.filter((r) => {
				const rel = ws.model.relationships.find((mr) => mr.id === r.id);
				if (!rel) return false;
				return rel.sourceId !== elementId && rel.destinationId !== elementId;
			});
		} else {
			const existingElementIds = new Set(view.elements.map((e) => e.id));
			view.elements.push({ id: elementId });
			const existingRelIds = new Set(view.relationships.map((r) => r.id));
			for (const rel of ws.model.relationships) {
				if (existingRelIds.has(rel.id)) continue;
				if (rel.sourceId === elementId && existingElementIds.has(rel.destinationId) || rel.destinationId === elementId && existingElementIds.has(rel.sourceId)) {
					view.relationships.push({ id: rel.id });
					existingRelIds.add(rel.id);
				}
			}
		}
	}),
	setLayoutDirection: (viewKey, direction) => set((s) => {
		if (s.readOnly) return;
		if (!s.workspace) return;
		const view = findViewHelper(s.workspace, viewKey);
		if (!view) return;
		if (view.locked) return;
		pushUndoSnapshot(s);
		view.autoLayout = {
			...view.autoLayout,
			direction
		};
		clearUnlockedPositions(view);
		s.layoutVersion += 1;
	}),
	resetAndRelayout: (viewKey, direction) => set((s) => {
		if (s.readOnly) return;
		if (!s.workspace) return;
		const view = findViewHelper(s.workspace, viewKey);
		if (!view) return;
		if (view.locked) return;
		pushUndoSnapshot(s);
		clearUnlockedPositions(view);
		if (direction) view.autoLayout = {
			...view.autoLayout,
			direction
		};
		s.layoutVersion += 1;
	}),
	setElementsLocked: (viewKey, ids, locked) => set((s) => {
		if (s.readOnly) return;
		if (!s.workspace || ids.length === 0) return;
		const view = findViewHelper(s.workspace, viewKey);
		if (!view) return;
		const targets = new Set(ids);
		const changed = view.elements.filter((el) => targets.has(el.id) && (el.locked ?? false) !== locked);
		if (changed.length === 0) return;
		pushUndoSnapshot(s);
		for (const el of changed) {
			el.locked = locked || void 0;
			if (el.x !== void 0 && el.y !== void 0) el.pinned = true;
		}
	}),
	setViewLocked: (viewKey, locked) => set((s) => {
		if (s.readOnly) return;
		if (!s.workspace) return;
		const view = findViewHelper(s.workspace, viewKey);
		if (!view) return;
		if ((view.locked ?? false) === locked) return;
		pushUndoSnapshot(s);
		view.locked = locked || void 0;
	}),
	unlockAllInView: (viewKey) => set((s) => {
		if (s.readOnly) return;
		if (!s.workspace) return;
		const view = findViewHelper(s.workspace, viewKey);
		if (!view) return;
		const locked = view.elements.filter((el) => el.locked);
		if (locked.length === 0) return;
		pushUndoSnapshot(s);
		for (const el of locked) {
			el.locked = void 0;
			if (el.x !== void 0 && el.y !== void 0) el.pinned = true;
		}
	})
});
//#endregion
//#region src/store/builtin-tags.ts
/** Tags that always exist and whose styles cannot be removed.
*  'Relationship' is the built-in tag for all relationships and is
*  included here so removeTagGlobal can't strip it from the model. */
var BUILTIN_TAGS = /* @__PURE__ */ new Set([
	"Element",
	"Person",
	"Software System",
	"Container",
	"Component",
	"Relationship",
	"Database"
]);
//#endregion
//#region src/store/slices/tag-style-slice.ts
var createTagStyleSlice = (set) => ({
	updateElementStyle: (style) => set((s) => {
		if (s.readOnly) return;
		if (!s.workspace) return;
		const styles = s.workspace.views.configuration.styles.elements;
		const idx = styles.findIndex((es) => es.tag === style.tag);
		if (idx >= 0) {
			const existing = styles[idx];
			if (!Object.keys(style).some((k) => k !== "tag" && style[k] !== existing[k])) return;
			pushUndoSnapshot(s);
			styles[idx] = {
				...existing,
				...style
			};
		} else {
			pushUndoSnapshot(s);
			styles.push(style);
		}
	}),
	removeElementStyle: (tag) => set((s) => {
		if (s.readOnly) return;
		if (!s.workspace) return;
		const styles = s.workspace.views.configuration.styles.elements;
		if (!styles.some((es) => es.tag === tag)) return;
		pushUndoSnapshot(s);
		s.workspace.views.configuration.styles.elements = styles.filter((es) => es.tag !== tag);
	}),
	renameTag: (oldTag, newTag) => set((s) => {
		if (s.readOnly) return;
		if (!newTag.trim() || oldTag === newTag) return;
		if (BUILTIN_TAGS.has(oldTag)) return;
		if (BUILTIN_TAGS.has(newTag.trim())) return;
		if (!s.workspace) return;
		const ws = s.workspace;
		let exists = ws.views.configuration.styles.elements.some((es) => es.tag === oldTag) || ws.views.configuration.styles.relationships.some((rs) => rs.tag === oldTag) || ws.model.relationships.some((r) => r.tags.includes(oldTag));
		if (!exists) forEachElementHelper(ws, (el) => {
			if (el.tags.includes(oldTag)) {
				exists = true;
				return true;
			}
		});
		if (!exists) return;
		pushUndoSnapshot(s);
		forEachElementHelper(ws, (el) => {
			el.tags = el.tags.map((t) => t === oldTag ? newTag : t);
		});
		for (const rel of ws.model.relationships) rel.tags = rel.tags.map((t) => t === oldTag ? newTag : t);
		const elStyle = ws.views.configuration.styles.elements.find((es) => es.tag === oldTag);
		if (elStyle) elStyle.tag = newTag;
		const relStyle = ws.views.configuration.styles.relationships.find((rs) => rs.tag === oldTag);
		if (relStyle) relStyle.tag = newTag;
		s.activeTagFilter = s.activeTagFilter.map((t) => t === oldTag ? newTag : t);
	}),
	removeTagGlobal: (tag) => set((s) => {
		if (s.readOnly) return;
		if (BUILTIN_TAGS.has(tag)) return;
		if (!s.workspace) return;
		const ws = s.workspace;
		let exists = ws.views.configuration.styles.elements.some((es) => es.tag === tag) || ws.views.configuration.styles.relationships.some((rs) => rs.tag === tag) || ws.model.relationships.some((r) => r.tags.includes(tag));
		if (!exists) forEachElementHelper(ws, (el) => {
			if (el.tags.includes(tag)) {
				exists = true;
				return true;
			}
		});
		if (!exists) return;
		pushUndoSnapshot(s);
		forEachElementHelper(ws, (el) => {
			el.tags = el.tags.filter((t) => t !== tag);
		});
		for (const rel of ws.model.relationships) rel.tags = rel.tags.filter((t) => t !== tag);
		ws.views.configuration.styles.elements = ws.views.configuration.styles.elements.filter((es) => es.tag !== tag);
		ws.views.configuration.styles.relationships = ws.views.configuration.styles.relationships.filter((rs) => rs.tag !== tag);
		s.activeTagFilter = s.activeTagFilter.filter((t) => t !== tag);
	})
});
//#endregion
//#region src/lib/scopeValidation.ts
function validateScope(workspace) {
	const violations = [];
	const { scope, model } = workspace;
	const systems = model.softwareSystems ?? [];
	const allContainers = systems.flatMap((s) => s.containers ?? []);
	if (scope && scope !== "none") {
		if (scope === "landscape") {
			if (allContainers.length > 0) violations.push({
				type: "error",
				message: `Landscape-scoped workspaces must not define containers. Found ${allContainers.length} container(s).`
			});
		}
		if (scope === "softwaresystem") {
			const systemsWithContainers = systems.filter((s) => (s.containers ?? []).length > 0);
			if (systemsWithContainers.length > 1) violations.push({
				type: "error",
				message: `System Context views can show multiple software systems, but a software-system scoped workspace can define container/component internals for only one of them. Found internals for ${systemsWithContainers.length}: ${systemsWithContainers.map((s) => s.name).join(", ")}. Split those internals into separate workspaces, or use an unscoped workspace.`
			});
		}
	}
	const allElementIds = /* @__PURE__ */ new Set();
	for (const p of model.people ?? []) allElementIds.add(p.id);
	for (const s of systems) {
		allElementIds.add(s.id);
		for (const c of s.containers ?? []) {
			allElementIds.add(c.id);
			for (const cmp of c.components ?? []) allElementIds.add(cmp.id);
		}
	}
	for (const rel of model.relationships ?? []) {
		if (!allElementIds.has(rel.sourceId)) violations.push({
			type: "error",
			message: `Relationship source element is missing.`,
			relationshipId: rel.id
		});
		if (!allElementIds.has(rel.destinationId)) violations.push({
			type: "error",
			message: `Relationship destination element is missing.`,
			relationshipId: rel.id
		});
	}
	if (scope === "landscape") for (const s of systems) for (const c of s.containers ?? []) violations.push({
		type: "error",
		message: `Container "${c.name}" can't exist in a landscape-scoped workspace.`,
		elementId: c.id
	});
	return violations;
}
//#endregion
//#region src/store/slices/undo-slice.ts
var createUndoSlice = (set, get) => ({
	undoStack: [],
	redoStack: [],
	lastSavedUndoLength: 0,
	setLastSavedUndoLength: (n) => set({ lastSavedUndoLength: n }),
	undo: () => {
		if (get().readOnly) return;
		set((s) => {
			if (s.undoStack.length === 0 || !s.workspace) return;
			const currentWs = undoSnapshot(s);
			const previous = s.undoStack.pop();
			s.redoStack.push(currentWs);
			s.workspace = previous;
			s.activeViewKey = (s.activeViewKey ? !!findViewHelper(previous, s.activeViewKey) : false) ? s.activeViewKey : getFirstViewKey(previous);
			s.viewHistory = s.viewHistory.filter((k) => !!findViewHelper(previous, k));
			s.selectedElementIds = [];
			s.selectedRelationshipId = null;
			s.selectedGroupId = null;
			s.scopeViolations = validateScope(previous);
		});
		announce("Undone");
	},
	redo: () => {
		if (get().readOnly) return;
		set((s) => {
			if (s.redoStack.length === 0 || !s.workspace) return;
			const currentWs = undoSnapshot(s);
			const next = s.redoStack.pop();
			s.undoStack.push(currentWs);
			s.workspace = next;
			s.activeViewKey = (s.activeViewKey ? !!findViewHelper(next, s.activeViewKey) : false) ? s.activeViewKey : getFirstViewKey(next);
			s.viewHistory = s.viewHistory.filter((k) => !!findViewHelper(next, k));
			s.selectedElementIds = [];
			s.selectedRelationshipId = null;
			s.selectedGroupId = null;
			s.scopeViolations = validateScope(next);
		});
		announce("Redone");
	},
	canUndo: () => get().undoStack.length > 0,
	canRedo: () => get().redoStack.length > 0,
	resetWorkspaceTo: (ws) => set((s) => {
		if (s.readOnly) return;
		normalizeWorkspaceShape(ws);
		s.workspace = ws;
		s.activeViewKey = (s.activeViewKey ? !!findViewHelper(ws, s.activeViewKey) : false) ? s.activeViewKey : getFirstViewKey(ws);
		s.viewHistory = s.viewHistory.filter((k) => !!findViewHelper(ws, k));
		clearSelectionDraft(s);
		s.scopeViolations = validateScope(ws);
	})
});
//#endregion
//#region src/store/slices/lifecycle-slice.ts
var createLifecycleSlice = (set, get) => ({
	workspace: null,
	scopeViolations: [],
	activeWorkspaceFilename: null,
	readOnly: false,
	setActiveWorkspaceFilename: (name) => set({ activeWorkspaceFilename: name }),
	setReadOnly: (v) => set({ readOnly: v }),
	revalidateScope: () => set((s) => {
		s.scopeViolations = s.workspace ? validateScope(s.workspace) : [];
	}),
	loadWorkspace: (workspace) => {
		normalizeWorkspaceShape(workspace);
		set({
			workspace,
			activeViewKey: getFirstViewKey(workspace),
			viewHistory: [],
			selectedElementIds: [],
			selectedRelationshipId: null,
			selectedGroupId: null,
			focusElementId: null,
			focusRelationshipId: null,
			aiPanelOpen: false,
			aiSettingsOpen: false,
			aiPanelFeature: null,
			pendingDelete: null,
			pendingZoomConfirm: null,
			createViewDefaults: null,
			undoStack: [],
			redoStack: [],
			lastSavedUndoLength: 0,
			activeTagFilter: [],
			activeStatusFilter: [],
			activeTechFilter: [],
			activeTeamFilter: [],
			lastClearedHighlightFilters: null,
			scopeViolations: validateScope(workspace)
		});
	},
	closeWorkspace: () => {
		if (get().readOnly) return;
		set({
			workspace: null,
			activeWorkspaceFilename: null,
			activeViewKey: null,
			viewHistory: [],
			selectedElementIds: [],
			selectedRelationshipId: null,
			selectedGroupId: null,
			focusElementId: null,
			focusRelationshipId: null,
			aiPanelOpen: false,
			aiSettingsOpen: false,
			aiPanelFeature: null,
			pendingDelete: null,
			pendingZoomConfirm: null,
			createViewDefaults: null,
			undoStack: [],
			redoStack: [],
			lastClearedHighlightFilters: null,
			scopeViolations: []
		});
	},
	updateWorkspaceMeta: (patch) => set((s) => {
		if (s.readOnly) return;
		if (!s.workspace) return;
		const ws = s.workspace;
		if (!(patch.name !== void 0 && ws.name !== patch.name || patch.description !== void 0 && ws.description !== patch.description)) return;
		pushUndoSnapshot(s);
		if (patch.name !== void 0) ws.name = patch.name;
		if (patch.description !== void 0) ws.description = patch.description;
	})
});
//#endregion
//#region src/store/slices/dynamic-step-slice.ts
var createDynamicStepSlice = (set) => ({
	addDynamicStep: (viewKey, sourceId, destinationId, description) => set((s) => {
		if (s.readOnly) return;
		if (!s.workspace) return;
		const ws = s.workspace;
		const view = findViewHelper(ws, viewKey);
		if (!view || view.type !== "dynamic") return;
		if (sourceId === destinationId) return;
		if (!elementExists(ws, sourceId) || !elementExists(ws, destinationId)) return;
		pushUndoSnapshot(s);
		let rel = ws.model.relationships.find((r) => r.sourceId === sourceId && r.destinationId === destinationId);
		let response = false;
		if (!rel) {
			const reverse = ws.model.relationships.find((r) => r.sourceId === destinationId && r.destinationId === sourceId);
			if (reverse) {
				rel = reverse;
				response = true;
			}
		}
		if (!rel) {
			const created = {
				id: nanoid(8),
				sourceId,
				destinationId,
				description,
				tags: ["Relationship"],
				properties: {}
			};
			ws.model.relationships.push(created);
			rel = created;
			for (const v of allViewsOf(ws)) {
				if (v.type === "dynamic" || v.type === "deployment") continue;
				const ids = new Set(v.elements.map((e) => e.id));
				if (ids.has(sourceId) && ids.has(destinationId) && !v.relationships.some((r) => r.id === rel.id)) v.relationships.push({ id: rel.id });
			}
		}
		view.relationships.push({
			id: rel.id,
			sourceId,
			destinationId,
			response: response ? true : void 0,
			order: String(view.relationships.length + 1),
			description: description && description !== rel.description ? description : void 0
		});
		for (const id of [sourceId, destinationId]) if (!view.elements.some((e) => e.id === id)) view.elements.push({ id });
		normalizeDynamicView(ws, view);
		s.layoutVersion += 1;
	}),
	updateDynamicStepDescription: (viewKey, stepIndex, description) => set((s) => {
		if (s.readOnly) return;
		if (!s.workspace) return;
		const view = findViewHelper(s.workspace, viewKey);
		if (!view || view.type !== "dynamic") return;
		const step = view.relationships[stepIndex];
		if (!step) return;
		const rel = s.workspace.model.relationships.find((r) => r.id === step.id);
		const trimmed = description.trim();
		const next = trimmed && trimmed !== rel?.description ? trimmed : void 0;
		if (step.description === next) return;
		pushUndoSnapshot(s);
		step.description = next;
	}),
	moveDynamicStep: (viewKey, stepIndex, direction) => set((s) => {
		if (s.readOnly) return;
		if (!s.workspace) return;
		const view = findViewHelper(s.workspace, viewKey);
		if (!view || view.type !== "dynamic") return;
		const target = direction === "up" ? stepIndex - 1 : stepIndex + 1;
		if (stepIndex < 0 || stepIndex >= view.relationships.length) return;
		if (target < 0 || target >= view.relationships.length) return;
		pushUndoSnapshot(s);
		const steps = view.relationships;
		[steps[stepIndex], steps[target]] = [steps[target], steps[stepIndex]];
		normalizeDynamicView(s.workspace, view);
	}),
	deleteDynamicStep: (viewKey, stepIndex) => set((s) => {
		if (s.readOnly) return;
		if (!s.workspace) return;
		const view = findViewHelper(s.workspace, viewKey);
		if (!view || view.type !== "dynamic") return;
		if (stepIndex < 0 || stepIndex >= view.relationships.length) return;
		pushUndoSnapshot(s);
		view.relationships.splice(stepIndex, 1);
		normalizeDynamicView(s.workspace, view);
		s.layoutVersion += 1;
	})
});
//#endregion
//#region src/store/slices/deployment-slice.ts
function envByName(ws, environment) {
	return (ws.model.deploymentEnvironments ?? []).find((e) => e.name === environment);
}
function nodeById(env, id) {
	let found;
	walkDeploymentNodes(env, (node) => {
		if (node.id === id) found = node;
	});
	return found;
}
/** Recompute every deployment view of `environment` from the canonical
*  membership rules (the same expansion `include *` parses to), keeping the
*  positions of elements that survive. */
function refreshDeploymentViews(ws, environment) {
	for (const v of ws.views.deploymentViews ?? []) {
		if (v.environment !== environment) continue;
		const existing = new Map(v.elements.map((e) => [e.id, e]));
		v.elements = expandDeploymentElements(ws.model, v.environment, v.softwareSystemId).map((e) => existing.get(e.id) ?? e);
	}
}
var createDeploymentSlice = (set, get) => ({
	addDeploymentEnvironment: (name) => {
		if (get().readOnly) return false;
		const trimmed = name.trim();
		if (!trimmed) return false;
		let ok = false;
		set((s) => {
			if (!s.workspace) return;
			if (envByName(s.workspace, trimmed)) {
				ok = true;
				return;
			}
			pushUndoSnapshot(s);
			s.workspace.model.deploymentEnvironments ??= [];
			s.workspace.model.deploymentEnvironments.push({
				id: nanoid(8),
				name: trimmed,
				deploymentNodes: []
			});
			ok = true;
		});
		return ok;
	},
	addDeploymentNode: (environment, parentNodeId) => {
		if (get().readOnly) return "";
		const id = nanoid(8);
		let created = false;
		set((s) => {
			if (!s.workspace) return;
			const env = envByName(s.workspace, environment);
			if (!env) return;
			const parent = parentNodeId ? nodeById(env, parentNodeId) : void 0;
			if (parentNodeId && !parent) return;
			pushUndoSnapshot(s);
			const node = {
				id,
				type: "deploymentNode",
				name: "New Deployment Node",
				tags: ["Element", "Deployment Node"],
				properties: {},
				children: [],
				infrastructureNodes: [],
				containerInstances: [],
				softwareSystemInstances: []
			};
			(parent ? parent.children : env.deploymentNodes).push(node);
			refreshDeploymentViews(s.workspace, environment);
			s.layoutVersion += 1;
			created = true;
		});
		return created ? id : "";
	},
	addInfrastructureNode: (environment, hostNodeId) => {
		if (get().readOnly) return "";
		const id = nanoid(8);
		let created = false;
		set((s) => {
			if (!s.workspace) return;
			const env = envByName(s.workspace, environment);
			const host = env ? nodeById(env, hostNodeId) : void 0;
			if (!host) return;
			pushUndoSnapshot(s);
			host.infrastructureNodes.push({
				id,
				type: "infrastructureNode",
				name: "New Infrastructure Node",
				tags: ["Element", "Infrastructure Node"],
				properties: {}
			});
			refreshDeploymentViews(s.workspace, environment);
			s.layoutVersion += 1;
			created = true;
		});
		return created ? id : "";
	},
	addContainerInstance: (environment, hostNodeId, containerId) => {
		if (get().readOnly) return "";
		const id = nanoid(8);
		let created = false;
		set((s) => {
			if (!s.workspace) return;
			const ws = s.workspace;
			const env = envByName(ws, environment);
			const host = env ? nodeById(env, hostNodeId) : void 0;
			const containerExists = ws.model.softwareSystems.some((sys) => sys.containers.some((c) => c.id === containerId));
			if (!host || !containerExists) return;
			pushUndoSnapshot(s);
			host.containerInstances.push({
				id,
				type: "containerInstance",
				containerId,
				tags: ["Container Instance"],
				properties: {}
			});
			refreshDeploymentViews(ws, environment);
			s.layoutVersion += 1;
			created = true;
		});
		return created ? id : "";
	},
	addSoftwareSystemInstance: (environment, hostNodeId, softwareSystemId) => {
		if (get().readOnly) return "";
		const id = nanoid(8);
		let created = false;
		set((s) => {
			if (!s.workspace) return;
			const ws = s.workspace;
			const env = envByName(ws, environment);
			const host = env ? nodeById(env, hostNodeId) : void 0;
			if (!host || !ws.model.softwareSystems.some((sys) => sys.id === softwareSystemId)) return;
			pushUndoSnapshot(s);
			host.softwareSystemInstances.push({
				id,
				type: "softwareSystemInstance",
				softwareSystemId,
				tags: ["Software System Instance"],
				properties: {}
			});
			refreshDeploymentViews(ws, environment);
			s.layoutVersion += 1;
			created = true;
		});
		return created ? id : "";
	},
	updateDeploymentElement: (environment, id, patch) => set((s) => {
		if (s.readOnly) return;
		if (!s.workspace) return;
		const env = envByName(s.workspace, environment);
		if (!env) return;
		let target;
		walkDeploymentNodes(env, (node) => {
			if (node.id === id) target = node;
			for (const infra of node.infrastructureNodes) if (infra.id === id) target = infra;
		});
		if (!target) return;
		let changed = false;
		const name = patch.name?.trim();
		if (name && name !== target.name) changed = true;
		if ("technology" in patch && patch.technology !== target.technology) changed = true;
		if ("description" in patch && patch.description !== target.description) changed = true;
		if (!changed) return;
		pushUndoSnapshot(s);
		if (name) target.name = name;
		if ("technology" in patch) target.technology = patch.technology || void 0;
		if ("description" in patch) target.description = patch.description || void 0;
	}),
	renameDeploymentElement: (environment, id, name) => set((s) => {
		if (s.readOnly) return;
		if (!s.workspace) return;
		const env = envByName(s.workspace, environment);
		if (!env) return;
		const trimmed = name.trim();
		if (!trimmed) return;
		let target;
		walkDeploymentNodes(env, (node) => {
			if (node.id === id) target = node;
			for (const infra of node.infrastructureNodes) if (infra.id === id) target = infra;
		});
		if (!target || target.name === trimmed) return;
		pushUndoSnapshot(s);
		target.name = trimmed;
	})
});
//#endregion
//#region src/store/workspace.ts
/**
* Workspace store — composed of per-domain slices in ./slices/. Each slice
* is a self-contained {state + actions} module that operates on the shared
* WorkspaceState; cross-slice action calls go through get() / set().
*
* State shape: see workspace-types.ts.
* Undo helpers (used by every workspace-mutating slice): see internals.ts.
*/
var useWorkspaceStore = create()(immer((...a) => ({
	...createFilterSlice(...a),
	...createUiSlice(...a),
	...createSelectionSlice(...a),
	...createNavigationSlice(...a),
	...createLifecycleSlice(...a),
	...createElementSlice(...a),
	...createGroupSlice(...a),
	...createRelationshipSlice(...a),
	...createViewSlice(...a),
	...createDynamicStepSlice(...a),
	...createDeploymentSlice(...a),
	...createTagStyleSlice(...a),
	...createUndoSlice(...a)
})));
//#endregion
//#region src/lib/docPath.ts
var MARKDOWN_EXTENSIONS = [".md", ".markdown"];
var HTML_EXTENSIONS = [".html", ".htm"];
var DOCUMENT_EXTENSIONS = [...MARKDOWN_EXTENSIONS, ...HTML_EXTENSIONS];
function hasMarkdownExtension(docPath) {
	const lower = docPath.toLowerCase();
	return MARKDOWN_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
/** True for a markdown or HTML document path (`.md` `.markdown` `.html` `.htm`). */
function hasDocumentExtension(docPath) {
	const lower = docPath.toLowerCase();
	return DOCUMENT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
/** The document kind by extension, or null when `docPath` is neither markdown nor HTML. */
function documentKind(docPath) {
	if (hasMarkdownExtension(docPath)) return "markdown";
	const lower = docPath.toLowerCase();
	return HTML_EXTENSIONS.some((ext) => lower.endsWith(ext)) ? "html" : null;
}
/** True when any segment starts with `.` — blocks dotfiles/dirs and `..`. */
function hasHiddenSegment(docPath) {
	return docPath.split(/[\\/]/).some((segment) => segment.startsWith("."));
}
/** Textual allowlist: why `docPath` is not an acceptable document path, or
*  null when it is. Does not touch the filesystem. */
function docPathProblem(docPath) {
	if (isAbsolute(docPath) || /^[a-zA-Z]:/.test(docPath)) return "must be relative to the project root, not absolute";
	if (!hasDocumentExtension(docPath)) return "must end in .md, .markdown, .html or .htm";
	if (hasHiddenSegment(docPath)) return "must not contain hidden or '..' segments";
	return null;
}
/** True when `target` is `root` itself or lies inside it (textual, no symlinks). */
function isInsideRoot(root, target) {
	const rel = relative(root, target);
	return rel === "" || !(rel.startsWith("..") || isAbsolute(rel));
}
/** Like `isInsideRoot` but on symlink-resolved paths. `target` need not exist:
*  its nearest existing ancestor is resolved instead. */
function isInsideRootReal(root, target) {
	let probe = resolve(target);
	while (!existsSync(probe)) {
		const parent = dirname(probe);
		if (parent === probe) return false;
		probe = parent;
	}
	try {
		return isInsideRoot(realpathSync(root), realpathSync(probe));
	} catch {
		return false;
	}
}
/** Project root that document-link paths are relative to: the nearest ancestor
*  of `workspacePath` (a workspace directory or a `.dsl` file) holding `.git`
*  (a directory, or a file in a worktree), else the workspace directory itself.
*  The CLI (`link-doc`) and every serving path (dev, build, viewer) share it. */
function docsRootFor(workspacePath) {
	const abs = resolve(workspacePath);
	let start = abs;
	try {
		if (statSync(abs).isFile()) start = dirname(abs);
	} catch {}
	for (let dir = start;; dir = dirname(dir)) {
		if (existsSync(join(dir, ".git"))) return dir;
		if (dirname(dir) === dir) return start;
	}
}
//#endregion
//#region src/cli/discover.ts
var SKIPPED_DIRS = (name) => name === "node_modules" || name.startsWith("dist") || name.startsWith(".");
/** Git root above `cwd` (a `.git` directory or worktree file), else `cwd` itself. */
function findRoot(cwd) {
	return docsRootFor(cwd);
}
/** Git root above the workspace file, else the file's own directory. */
function projectRootFor(file) {
	return docsRootFor(path.dirname(file));
}
function scanDsl(dir, out) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (!SKIPPED_DIRS(entry.name)) scanDsl(full, out);
		} else if (entry.isFile() && /\.dsl$/i.test(entry.name)) out.push(full);
	}
}
function configuredWorkspace(root) {
	const configPath = path.join(root, ".c4hero", "config.json");
	if (!existsSync(configPath)) return null;
	let workspace;
	try {
		workspace = JSON.parse(readFileSync(configPath, "utf8")).workspace;
	} catch {
		throw new CliFailure("USAGE", `${configPath} is not valid JSON`);
	}
	if (workspace === void 0) return null;
	if (typeof workspace !== "string") throw new CliFailure("USAGE", `${configPath}: "workspace" must be a string path`);
	return path.resolve(root, workspace);
}
/** Resolves the `.dsl` a command operates on: `--file`, else the workspace
*  pinned in `<root>/.c4hero/config.json`, else the only `.dsl` under the git
*  root (or `cwd` outside a repository), skipping `node_modules`, `dist*` and
*  dot-directories. Returns an absolute path. */
function discoverWorkspace(opts) {
	const file = opts.file ?? configuredWorkspace(findRoot(opts.cwd));
	if (file !== null && file !== void 0) {
		const abs = path.resolve(opts.cwd, file);
		if (!existsSync(abs) || !statSync(abs).isFile()) throw new CliFailure("NOT_FOUND", `Workspace file not found: ${abs}`);
		return abs;
	}
	const root = findRoot(opts.cwd);
	const matches = [];
	scanDsl(root, matches);
	matches.sort();
	if (matches.length === 0) throw new CliFailure("NOT_FOUND", `No .dsl file found under ${root}. Pass --file <path>.`);
	if (matches.length > 1) throw new CliFailure("MULTIPLE_WORKSPACES", "Several .dsl files found. Pass --file <path> or pin one in .c4hero/config.json.", matches.map((m) => path.relative(root, m)));
	return matches[0];
}
//#endregion
//#region src/lib/dsl/parser-styles.ts
function parseStylesBody(p, config) {
	while (!p.check("RBRACE") && p.peekType() !== "EOF") {
		p.skipNewlines();
		if (p.check("RBRACE") || p.peekType() === "EOF") break;
		const token = p.peek();
		if (token.type === "COMMENT") {
			p.advance();
			continue;
		}
		if (token.type === "KEYWORD") {
			const kw = token.value.toLowerCase();
			if (kw === "element") {
				p.advance();
				const style = parseElementStyleBlock(p);
				if (style) config.styles.elements.push(style);
				continue;
			}
			if (kw === "relationship") {
				p.advance();
				const style = parseRelationshipStyleBlock(p);
				if (style) config.styles.relationships.push(style);
				continue;
			}
		}
		p.advance();
	}
}
function parseElementStyleBlock(p) {
	const style = { tag: p.readString() };
	p.skipNewlines();
	if (!p.match("LBRACE")) return style;
	while (!p.check("RBRACE") && p.peekType() !== "EOF") {
		p.skipNewlines();
		if (p.check("RBRACE") || p.peekType() === "EOF") break;
		const token = p.peek();
		if (token.type === "COMMENT") {
			p.advance();
			continue;
		}
		if (token.type === "KEYWORD" || token.type === "IDENTIFIER") {
			applyStyleProperty(p, style, p.advance().value.toLowerCase());
			continue;
		}
		p.advance();
	}
	p.skipNewlines();
	p.expect("RBRACE");
	return style;
}
function parseRelationshipStyleBlock(p) {
	const style = { tag: p.readString() };
	p.skipNewlines();
	if (!p.match("LBRACE")) return style;
	while (!p.check("RBRACE") && p.peekType() !== "EOF") {
		p.skipNewlines();
		if (p.check("RBRACE") || p.peekType() === "EOF") break;
		const token = p.peek();
		if (token.type === "COMMENT") {
			p.advance();
			continue;
		}
		if (token.type === "KEYWORD" || token.type === "IDENTIFIER") {
			applyRelStyleProperty(p, style, p.advance().value.toLowerCase());
			continue;
		}
		p.advance();
	}
	p.skipNewlines();
	p.expect("RBRACE");
	return style;
}
function applyStyleProperty(p, style, prop) {
	const val = p.readStyleValue();
	if (val === void 0) {
		p.noteSkipped(p.pos - 1);
		return;
	}
	switch (prop) {
		case "background":
			style.background = val;
			break;
		case "color":
		case "colour":
			style.color = val;
			break;
		case "shape":
			style.shape = val;
			break;
		case "fontsize": {
			const n = parseInt(val, 10);
			if (!isNaN(n)) style.fontSize = n;
			break;
		}
		case "border":
			style.border = val;
			break;
		case "opacity": {
			const n = parseInt(val, 10);
			if (!isNaN(n)) style.opacity = n;
			break;
		}
		case "icon":
			style.icon = val;
			break;
		case "stroke":
			style.stroke = val;
			break;
		case "strokewidth": {
			const n = parseInt(val, 10);
			if (!isNaN(n)) style.strokeWidth = n;
			break;
		}
		default: p.noteSkipped(p.pos - 1);
	}
}
function applyRelStyleProperty(p, style, prop) {
	const val = p.readStyleValue();
	if (val === void 0) {
		p.noteSkipped(p.pos - 1);
		return;
	}
	switch (prop) {
		case "color":
		case "colour":
			style.color = val;
			break;
		case "thickness": {
			const n = parseInt(val, 10);
			if (!isNaN(n)) style.thickness = n;
			break;
		}
		case "dashed":
			style.dashed = val.toLowerCase() === "true";
			break;
		case "fontsize": {
			const n = parseInt(val, 10);
			if (!isNaN(n)) style.fontSize = n;
			break;
		}
		case "opacity": {
			const n = parseInt(val, 10);
			if (!isNaN(n)) style.opacity = n;
			break;
		}
		default: p.noteSkipped(p.pos - 1);
	}
}
//#endregion
//#region src/lib/dsl/parser-views.ts
/** Generate a stable, unique view key when the DSL doesn't provide one.
*  Mirrors the Structurizr default-key convention (Type-ScopeRef) and falls
*  back to a numeric suffix on collision. Empty/missing keys break navigation
*  in the workspace store, so we always assign one. */
function ensureViewKey(view, viewsContainer, elementRef) {
	if (view.key) return;
	const typeKey = view.type === "systemLandscape" ? "SystemLandscape" : view.type === "systemContext" ? "SystemContext" : view.type === "container" ? "Containers" : view.type === "component" ? "Components" : view.type === "dynamic" ? "Dynamic" : "Deployment";
	const base = elementRef ? `${typeKey}-${elementRef}` : typeKey;
	const existing = [
		...viewsContainer.systemLandscapeViews,
		...viewsContainer.systemContextViews,
		...viewsContainer.containerViews,
		...viewsContainer.componentViews,
		...viewsContainer.dynamicViews,
		...viewsContainer.deploymentViews
	];
	let candidate = base;
	let suffix = 2;
	while (existing.some((v) => v.key === candidate)) candidate = `${base}-${suffix++}`;
	view.key = candidate;
	view.autoKey = true;
}
function parseViewsBody(p, views, model) {
	while (!p.check("RBRACE") && p.peekType() !== "EOF") {
		p.skipNewlines();
		if (p.check("RBRACE") || p.peekType() === "EOF") break;
		const token = p.peek();
		if (token.type === "COMMENT") {
			p.advance();
			continue;
		}
		if (token.type === "KEYWORD") {
			const kw = token.value.toLowerCase();
			if (kw === "systemlandscape") {
				const view = parseSystemLandscapeView(p, model);
				if (view) {
					ensureViewKey(view, views, void 0);
					views.systemLandscapeViews.push(view);
				}
				continue;
			}
			if (kw === "systemcontext") {
				const view = parseElementView(p, "systemContext", model);
				if (view) {
					ensureViewKey(view, views, view.softwareSystemId);
					views.systemContextViews.push(view);
				}
				continue;
			}
			if (kw === "container") {
				const view = parseElementView(p, "container", model);
				if (view) {
					ensureViewKey(view, views, view.softwareSystemId);
					views.containerViews.push(view);
				}
				continue;
			}
			if (kw === "component") {
				const view = parseElementView(p, "component", model);
				if (view) {
					ensureViewKey(view, views, view.containerId);
					views.componentViews.push(view);
				}
				continue;
			}
			if (kw === "styles") {
				p.advance();
				p.skipNewlines();
				if (p.match("LBRACE")) {
					parseStylesBody(p, views.configuration);
					p.skipNewlines();
					p.expect("RBRACE");
				}
				continue;
			}
			if (kw === "theme" || kw === "themes") {
				p.advance();
				const themes = [];
				while (p.check("STRING") || p.check("IDENTIFIER")) themes.push(p.advance().value);
				views.configuration.themes = themes;
				continue;
			}
			if (kw === "dynamic") {
				const view = parseDynamicView(p, model);
				if (view) {
					ensureViewKey(view, views, view.softwareSystemId ?? view.containerId);
					views.dynamicViews.push(view);
				}
				continue;
			}
			if (kw === "deployment") {
				const view = parseDeploymentView(p, model);
				if (view) {
					ensureViewKey(view, views, view.softwareSystemId ?? view.environment);
					views.deploymentViews.push(view);
				}
				continue;
			}
			if (kw === "filtered" || kw === "custom") {
				p.advance();
				while (p.check("STRING") || p.check("IDENTIFIER")) p.advance();
				p.skipNewlines();
				p.skipBraceBlock();
				continue;
			}
			if (kw === "branding" || kw === "terminology" || kw === "configuration" || kw === "properties") {
				p.advance();
				p.skipNewlines();
				p.skipBraceBlock();
				continue;
			}
			p.advance();
			p.skipUnknownDirective();
			continue;
		}
		if (token.type === "IDENTIFIER") {
			p.advance();
			p.skipUnknownDirective();
			continue;
		}
		p.advance();
	}
}
function parseSystemLandscapeView(p, model) {
	p.advance();
	const key = p.readOptionalStringOrIdentifier() ?? "";
	const positionalDescription = p.readOptionalString();
	const view = {
		type: "systemLandscape",
		key,
		title: positionalDescription,
		description: positionalDescription,
		elements: [],
		relationships: []
	};
	p.skipNewlines();
	if (p.match("LBRACE")) {
		parseViewBody(p, view, model);
		p.skipNewlines();
		p.expect("RBRACE");
	}
	return view;
}
function parseElementView(p, type, model) {
	p.advance();
	const scope = p.readQualifiedRef({ allowString: true });
	const elementRef = scope?.ref;
	const key = p.readOptionalStringOrIdentifier() ?? "";
	const positionalDescription = p.readOptionalString();
	const view = {
		type,
		key,
		title: positionalDescription,
		description: positionalDescription,
		elements: [],
		relationships: []
	};
	if (elementRef && scope) {
		const resolvedId = p.resolveRef(elementRef);
		if (!resolvedId && elementRef.includes(".")) p.addError(`Unresolved reference: '${elementRef}'`, scope.token);
		if (type === "systemContext" || type === "container") view.softwareSystemId = resolvedId ?? elementRef;
		else if (type === "component") view.containerId = resolvedId ?? elementRef;
	}
	p.skipNewlines();
	if (p.match("LBRACE")) {
		parseViewBody(p, view, model);
		p.skipNewlines();
		p.expect("RBRACE");
	}
	return view;
}
/** Parse `autoLayout [direction] [rankSep] [nodeSep]` into a view. */
function parseAutoLayoutInto(p, view) {
	p.advance();
	const layout = { direction: "TB" };
	if (p.check("IDENTIFIER") || p.check("KEYWORD")) {
		const dir = p.peekValue().toUpperCase();
		if (dir === "TB" || dir === "BT" || dir === "LR" || dir === "RL") {
			layout.direction = dir;
			p.advance();
		}
	}
	if (p.check("NUMBER")) layout.rankSeparation = parseInt(p.advance().value, 10);
	if (p.check("NUMBER")) layout.nodeSeparation = parseInt(p.advance().value, 10);
	view.autoLayout = layout;
}
/** Parse `dynamic <scope|*> [key] [description] { ... }`.
*
*  The body is an ordered sequence of `source -> destination ["description"]`
*  steps. Each step must reference a relationship that exists in the model
*  (Structurizr semantics); the view stores the relationship id plus the
*  step's order label and optional description override. View elements are
*  derived from the step endpoints. */
/** Structurizr restricts view keys to [a-zA-Z0-9_-]; foreign DSL can carry
*  keys the upstream parser would reject (e.g. quoted keys with spaces).
*  Normalize at parse so every downstream consumer — sidecar, serializer,
*  key dedup — works with a key that survives re-serialization. An all-
*  illegal key normalizes to '' and takes the auto-key path. */
function sanitizeViewKey(raw) {
	return raw.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}
/** The element plus every descendant in the C4 tree (system -> containers ->
*  components). People and components have no descendants. */
function subtreeIds$1(model, rootId) {
	const ids = /* @__PURE__ */ new Set([rootId]);
	for (const sys of model.softwareSystems) {
		if (sys.id === rootId) {
			for (const c of sys.containers) {
				ids.add(c.id);
				for (const comp of c.components) ids.add(comp.id);
			}
			return ids;
		}
		for (const c of sys.containers) if (c.id === rootId) {
			for (const comp of c.components) ids.add(comp.id);
			return ids;
		}
	}
	return ids;
}
function parseDynamicView(p, model) {
	p.advance();
	let scopeRef;
	if (p.check("STAR")) p.advance();
	else scopeRef = p.readQualifiedRef()?.ref;
	const key = sanitizeViewKey(p.readOptionalStringOrIdentifier() ?? "");
	const positionalDescription = p.readOptionalString();
	const view = {
		type: "dynamic",
		key,
		title: positionalDescription,
		description: positionalDescription,
		elements: [],
		relationships: []
	};
	if (scopeRef) {
		const resolvedId = p.resolveRef(scopeRef);
		if ((resolvedId ? p.elementsById.get(resolvedId)?.type : void 0) === "container") view.containerId = resolvedId;
		else view.softwareSystemId = resolvedId ?? scopeRef;
	}
	p.skipNewlines();
	if (p.match("LBRACE")) {
		parseDynamicViewBody(p, view, model, { next: 1 });
		p.skipNewlines();
		p.expect("RBRACE");
	}
	return view;
}
function parseDynamicViewBody(p, view, model, order) {
	const addElement = (id) => {
		if (!view.elements.some((e) => e.id === id)) view.elements.push({ id });
	};
	while (!p.check("RBRACE") && p.peekType() !== "EOF") {
		p.skipNewlines();
		if (p.check("RBRACE") || p.peekType() === "EOF") break;
		const token = p.peek();
		if (token.type === "COMMENT") {
			p.advance();
			continue;
		}
		if (token.type === "LBRACE") {
			p.advance();
			p.skipped.push({
				line: token.line,
				text: "{ ... } (parallel steps)"
			});
			const base = order.next;
			parseDynamicViewBody(p, view, model, order);
			p.skipNewlines();
			p.expect("RBRACE");
			order.next = base;
			continue;
		}
		if (token.type === "KEYWORD") {
			const kw = token.value.toLowerCase();
			if (kw === "autolayout") {
				parseAutoLayoutInto(p, view);
				continue;
			}
			if (kw === "title") {
				p.advance();
				view.title = p.readOptionalString();
				continue;
			}
			if (kw === "description") {
				p.advance();
				view.description = p.readOptionalString();
				continue;
			}
			if (kw === "animation" || kw === "properties") {
				p.advance();
				p.skipNewlines();
				p.skipBraceBlock();
				continue;
			}
			if (kw === "default") {
				p.advance();
				p.noteSkipped(p.pos - 1);
				continue;
			}
		}
		if (p.looksLikeRelationship()) {
			const source = p.readQualifiedRef();
			p.skipNewlines();
			p.advance();
			p.skipNewlines();
			const dest = p.readQualifiedRef();
			if (!dest) {
				p.addError(`Expected interaction destination, got ${p.peekType()}`, p.peek());
				p.skipToNextLine();
				continue;
			}
			const stepDescription = p.readOptionalString() || void 0;
			const sourceId = p.resolveRef(source.ref);
			const destId = p.resolveRef(dest.ref);
			if (!sourceId || !destId) {
				p.addError(`Unresolved reference in dynamic view: '${!sourceId ? source.ref : dest.ref}'`, source.token);
				continue;
			}
			const pick = (rels) => rels.find((r) => stepDescription && r.description === stepDescription) ?? rels[0];
			const sourceTree = subtreeIds$1(model, sourceId);
			const destTree = subtreeIds$1(model, destId);
			const forward = pick(model.relationships.filter((r) => r.sourceId === sourceId && r.destinationId === destId)) ?? pick(model.relationships.filter((r) => sourceTree.has(r.sourceId) && destTree.has(r.destinationId)));
			const reverse = forward ? void 0 : pick(model.relationships.filter((r) => r.sourceId === destId && r.destinationId === sourceId)) ?? pick(model.relationships.filter((r) => destTree.has(r.sourceId) && sourceTree.has(r.destinationId)));
			const rel = forward ?? reverse;
			if (!rel) {
				p.addError(`Dynamic view step references a relationship that does not exist in the model: '${source.ref} -> ${dest.ref}'`, source.token);
				continue;
			}
			view.relationships.push({
				id: rel.id,
				sourceId,
				destinationId: destId,
				response: reverse ? true : void 0,
				order: String(order.next++),
				description: stepDescription
			});
			addElement(sourceId);
			addElement(destId);
			continue;
		}
		if (token.type === "KEYWORD" || token.type === "IDENTIFIER") {
			p.advance();
			p.skipUnknownDirective();
			continue;
		}
		p.advance();
	}
}
/** Parse `deployment <scope|*> <environment> [key] [description] { ... }`.
*  The body is the standard view body (include/exclude/autoLayout/…). */
function parseDeploymentView(p, model) {
	p.advance();
	let scopeRef;
	if (p.check("STAR")) p.advance();
	else scopeRef = p.readQualifiedRef({ allowString: true })?.ref;
	let environment = p.readOptionalStringOrIdentifier();
	if (environment !== void 0) {
		const resolved = p.resolveRef(environment);
		if (resolved && p.elementsById.get(resolved)?.type === "deploymentEnvironment") environment = p.elementsById.get(resolved).name;
	}
	const key = sanitizeViewKey(p.readOptionalStringOrIdentifier() ?? "");
	const positionalDescription = p.readOptionalString();
	const view = {
		type: "deployment",
		key,
		title: positionalDescription,
		description: positionalDescription,
		environment,
		elements: [],
		relationships: []
	};
	if (scopeRef) view.softwareSystemId = p.resolveRef(scopeRef) ?? scopeRef;
	if (environment !== void 0 && !model.deploymentEnvironments.some((e) => e.name === environment)) p.addError(`Deployment view references unknown environment '${environment}'`, p.peek());
	p.skipNewlines();
	if (p.match("LBRACE")) {
		parseViewBody(p, view, model);
		p.skipNewlines();
		p.expect("RBRACE");
	}
	return view;
}
function parseViewBody(p, view, model) {
	while (!p.check("RBRACE") && p.peekType() !== "EOF") {
		p.skipNewlines();
		if (p.check("RBRACE") || p.peekType() === "EOF") break;
		const token = p.peek();
		if (token.type === "COMMENT") {
			p.advance();
			continue;
		}
		if (token.type === "KEYWORD") {
			const kw = token.value.toLowerCase();
			if (kw === "include") {
				p.advance();
				if (p.match("STAR")) view.elements.push({ id: "*" });
				else while (p.check("IDENTIFIER") || p.check("STRING") || p.check("KEYWORD")) {
					const expansion = tryParseElementExpression(p, model);
					if (expansion) {
						for (const id of expansion) view.elements.push({ id });
						continue;
					}
					const ref = p.readQualifiedRef({ allowString: true });
					if (!ref) {
						p.advance();
						continue;
					}
					const resolvedId = p.resolveRef(ref.ref);
					if (!resolvedId && ref.ref.includes(".")) p.addError(`Unresolved reference: '${ref.ref}'`, ref.token);
					view.elements.push({ id: resolvedId ?? ref.ref });
				}
				continue;
			}
			if (kw === "exclude") {
				p.advance();
				const excluded = p.viewExcludedIds.get(view) ?? /* @__PURE__ */ new Set();
				while (p.check("STAR") || p.check("IDENTIFIER") || p.check("STRING") || p.check("KEYWORD")) {
					if (p.check("STAR")) {
						excluded.add(p.advance().value);
						continue;
					}
					const ref = p.readQualifiedRef({ allowString: true });
					if (!ref) {
						p.advance();
						continue;
					}
					if (ref.ref.includes("->")) p.noteSkipped(p.pos - 1);
					const resolvedId = p.resolveRef(ref.ref);
					if (!resolvedId && ref.ref.includes(".")) p.addError(`Unresolved reference: '${ref.ref}'`, ref.token);
					excluded.add(resolvedId ?? ref.ref);
				}
				p.viewExcludedIds.set(view, excluded);
				continue;
			}
			if (kw === "autolayout") {
				parseAutoLayoutInto(p, view);
				continue;
			}
			if (kw === "animation") {
				p.advance();
				p.skipNewlines();
				p.skipBraceBlock();
				continue;
			}
			if (kw === "title") {
				p.advance();
				view.title = p.readOptionalString();
				continue;
			}
			if (kw === "description") {
				p.advance();
				view.description = p.readOptionalString();
				continue;
			}
			if (kw === "properties") {
				p.advance();
				p.skipNewlines();
				p.skipBraceBlock();
				continue;
			}
			if (kw === "default") {
				p.advance();
				p.noteSkipped(p.pos - 1);
				continue;
			}
			p.advance();
			p.skipUnknownDirective();
			continue;
		}
		if (token.type === "IDENTIFIER") {
			p.advance();
			p.skipUnknownDirective();
			continue;
		}
		p.advance();
	}
}
/**
* Attempts to parse a Structurizr expression of the form
* `element.<field>==<value>` from the current parser position. Returns the
* list of element IDs the expression resolves to, or null if no expression
* was found (in which case the caller falls through to the normal element-ref
* path and the parser position is unchanged).
*
* Supported fields:
*   - `element.type==<typename>` — every element of that type. Accepts the
*     C4 type names: person, softwareSystem, container, component.
*   - `element.parent==<ref>`    — every direct child of `<ref>` (containers
*     of a system, or components of a container).
*
* Recognised at parse time inside `include` statements; the cookbook recipe
* for "container view for multiple software systems" demonstrates the usage.
* https://docs.structurizr.com/dsl/cookbook/container-view-multiple-software-systems/
*/
function tryParseElementExpression(p, model) {
	if (p.peekValue() !== "element" || p.tokens[p.pos + 1]?.type !== "DOT") return null;
	if (p.tokens[p.pos + 2]?.type !== "IDENTIFIER" && p.tokens[p.pos + 2]?.type !== "KEYWORD") return null;
	if (p.tokens[p.pos + 3]?.type !== "EQUALS" || p.tokens[p.pos + 4]?.type !== "EQUALS") return null;
	const valueTok = p.tokens[p.pos + 5];
	if (valueTok?.type !== "IDENTIFIER" && valueTok?.type !== "STRING" && valueTok?.type !== "KEYWORD") return null;
	const fieldName = p.tokens[p.pos + 2].value;
	p.advance();
	p.advance();
	p.advance();
	p.advance();
	p.advance();
	return resolveExpression(fieldName, p.readQualifiedRef({ allowString: true })?.ref ?? p.advance().value, model, p);
}
function resolveExpression(field, value, model, p) {
	if (field === "type") return resolveTypeExpression(value, model);
	if (field === "parent") return resolveParentExpression(value, model, p);
	return [];
}
function resolveTypeExpression(typeName, model) {
	const out = [];
	const t = typeName.toLowerCase();
	if (t === "person" || t === "people") for (const person of model.people) out.push(person.id);
	else if (t === "softwaresystem" || t === "softwaresystems") for (const sys of model.softwareSystems) out.push(sys.id);
	else if (t === "container" || t === "containers") for (const sys of model.softwareSystems) for (const c of sys.containers) out.push(c.id);
	else if (t === "component" || t === "components") for (const sys of model.softwareSystems) for (const c of sys.containers) for (const cmp of c.components) out.push(cmp.id);
	return out;
}
function resolveParentExpression(parentRef, model, p) {
	const parentId = p.resolveRef(parentRef) ?? parentRef;
	const out = [];
	for (const sys of model.softwareSystems) {
		if (sys.id === parentId) {
			for (const c of sys.containers) out.push(c.id);
			return out;
		}
		for (const c of sys.containers) if (c.id === parentId) {
			for (const cmp of c.components) out.push(cmp.id);
			return out;
		}
	}
	return out;
}
//#endregion
//#region src/types/model.ts
function isElementStatus(v) {
	return v === "Live" || v === "Planned" || v === "Deprecated" || v === "Removed";
}
function isInteractionStyle(v) {
	return v === "Synchronous" || v === "Asynchronous";
}
function isLineStyle(v) {
	return v === "Curved" || v === "Straight" || v === "Orthogonal";
}
//#endregion
//#region src/lib/dsl/documentLinks.ts
var KEY_PREFIX = "c4hero.documents.";
function pathKey(index) {
	return `${KEY_PREFIX}${index}.path`;
}
function titleKey(index) {
	return `${KEY_PREFIX}${index}.title`;
}
/**
* Hoist indexed `c4hero.documents.<n>.path` / `.title` properties into a
* `DocLink[]`. Indices are read consecutively starting from 0 and parsing
* stops at the first gap — an index with neither key present ends the scan,
* and anything from that index on (even if present at a higher index) stays
* in `rest`, untouched.
*
* An entry missing either `.path` or `.title` at a given index is never
* hoisted as a partial `DocLink` — it's left in `rest` so nothing is
* silently lost, matching the "only hoist a valid, complete value" rule the
* `status`/`owner` hoists already follow (parser-model.ts:50-58).
*/
function parseDocumentsFromProperties(properties) {
	const rest = { ...properties };
	const documents = [];
	for (let i = 0;; i++) {
		const pKey = pathKey(i);
		const tKey = titleKey(i);
		const hasPath = Object.prototype.hasOwnProperty.call(properties, pKey);
		const hasTitle = Object.prototype.hasOwnProperty.call(properties, tKey);
		if (!hasPath && !hasTitle) break;
		if (!hasPath || !hasTitle) break;
		documents.push({
			path: properties[pKey],
			title: properties[tKey]
		});
		delete rest[pKey];
		delete rest[tKey];
	}
	return {
		documents: documents.length > 0 ? documents : void 0,
		rest
	};
}
/**
* Derive indexed `c4hero.documents.<n>.path` / `.title` properties from a
* `DocLink[]`. Returns an empty object for `undefined`/empty input so an
* element or relationship with no documents emits no `c4hero.documents.*`
* properties at all.
*/
function documentsToProperties(documents) {
	const props = {};
	if (!documents) return props;
	documents.forEach((doc, i) => {
		props[pathKey(i)] = doc.path;
		props[titleKey(i)] = doc.title;
	});
	return props;
}
/**
* Drop every `c4hero.documents.*` key from a properties map, regardless of
* index or completeness. Used by the serializer to clear the whole namespace
* before re-deriving it from `el.documents`/`rel.documents` — see the comment
* at its call site (`serializer.ts`'s `elementProperties`/
* `relationshipProperties`) for why a stale/orphaned entry under this prefix
* is deliberately not preserved across such a re-derive.
*/
function withoutDocumentProperties(properties) {
	const result = {};
	for (const [key, val] of Object.entries(properties)) if (!key.startsWith(KEY_PREFIX)) setUserProperty(result, key, val);
	return result;
}
//#endregion
//#region src/lib/dsl/parser-relationship.ts
function parseRelationship(p) {
	const source = p.readQualifiedRef();
	if (!source) {
		p.addError(`Expected relationship source, got ${p.peekType()}`, p.peek());
		p.skipToNextLine();
		return null;
	}
	const sourceToken = source.token;
	p.skipNewlines();
	p.expect("ARROW");
	const dest = p.readQualifiedRef();
	if (!dest) {
		p.addError(`Expected relationship destination, got ${p.peekType()}`, p.peek());
		p.skipToNextLine();
		return null;
	}
	const destRef = dest.ref;
	const destToken = dest.token;
	const description = p.readOptionalString() || void 0;
	const technology = p.readOptionalString() || void 0;
	const tagsStr = p.readOptionalString();
	const sourceId = p.resolveRef(source.ref);
	const destId = p.resolveRef(destRef);
	if (!sourceId) p.addError(`Unresolved reference: '${source.ref}'`, sourceToken);
	if (!destId) p.addError(`Unresolved reference: '${destRef}'`, destToken);
	p.relCounter++;
	const initialTags = ["Relationship"];
	if (tagsStr) for (const t of tagsStr.split(",")) {
		const trimmed = t.trim();
		if (trimmed && !initialTags.includes(trimmed)) initialTags.push(trimmed);
	}
	const rel = {
		id: `rel-${p.relCounter}`,
		sourceId: sourceId ?? source.ref,
		destinationId: destId ?? destRef,
		description,
		technology,
		tags: initialTags,
		properties: {}
	};
	p.skipNewlines();
	if (p.check("LBRACE")) {
		p.advance();
		while (!p.check("RBRACE") && p.peekType() !== "EOF") {
			p.skipNewlines();
			if (p.check("RBRACE") || p.peekType() === "EOF") break;
			if (p.peekType() === "COMMENT") {
				p.advance();
				continue;
			}
			if (p.peekType() === "KEYWORD" && p.peekValue().toLowerCase() === "tags") {
				p.advance();
				while (p.check("STRING") || p.check("IDENTIFIER")) {
					const tagVal = p.advance().value;
					for (const t of tagVal.split(",")) {
						const trimmed = t.trim();
						if (trimmed && !rel.tags.includes(trimmed)) rel.tags.push(trimmed);
					}
				}
				continue;
			}
			if (p.peekType() === "KEYWORD" && p.peekValue().toLowerCase() === "properties") {
				p.advance();
				p.skipNewlines();
				if (p.check("LBRACE")) {
					p.advance();
					while (!p.check("RBRACE") && p.peekType() !== "EOF") {
						p.skipNewlines();
						if (p.check("RBRACE") || p.peekType() === "EOF") break;
						if (p.peekType() === "COMMENT") {
							p.advance();
							continue;
						}
						if (p.peek().type !== "STRING" && p.peek().type !== "IDENTIFIER") {
							p.advance();
							continue;
						}
						const key = p.advance().value;
						const valTok = p.peek();
						if (valTok.type === "STRING" || valTok.type === "IDENTIFIER" || valTok.type === "NUMBER") setUserProperty(rel.properties, key, p.advance().value);
					}
					if (p.check("RBRACE")) p.advance();
				}
				continue;
			}
			if ((p.peekType() === "IDENTIFIER" || p.peekType() === "KEYWORD") && p.peekValue().toLowerCase() === "interactionstyle") {
				p.advance();
				const valTok = p.peek();
				if (valTok.type === "IDENTIFIER" || valTok.type === "KEYWORD") {
					const raw = p.advance().value;
					if (isInteractionStyle(raw)) rel.interactionStyle = raw;
				}
				continue;
			}
			if (p.peekType() === "KEYWORD" && p.peekValue().toLowerCase() === "description") {
				p.advance();
				const val = p.readOptionalString();
				if (val !== void 0) rel.description = val;
				continue;
			}
			if (p.peekType() === "KEYWORD" && p.peekValue().toLowerCase() === "technology") {
				p.advance();
				const val = p.readOptionalString();
				if (val !== void 0) rel.technology = val;
				continue;
			}
			if (p.peekType() === "KEYWORD" && p.peekValue().toLowerCase() === "url") {
				p.advance();
				if (p.peekType() === "STRING") rel.url = p.advance().value;
				continue;
			}
			if ((p.peekType() === "IDENTIFIER" || p.peekType() === "KEYWORD") && p.peekValue().toLowerCase() === "linestyle") {
				p.advance();
				const valTok = p.peek();
				if (valTok.type === "IDENTIFIER" || valTok.type === "KEYWORD") {
					const raw = p.advance().value;
					if (isLineStyle(raw)) rel.lineStyle = raw;
				}
				continue;
			}
			if (p.peek().type === "KEYWORD" || p.peek().type === "IDENTIFIER") {
				p.advance();
				p.skipUnknownDirective();
				continue;
			}
			p.advance();
		}
		p.skipNewlines();
		p.expect("RBRACE");
	}
	applyRelationshipConventions(rel);
	return rel;
}
/**
* Hoist the property-encoded `lineStyle` / `interactionStyle` back onto the
* relationship fields. Structurizr rejects both as bare keywords in a
* relationship body, so the serializer emits them as `c4hero.lineStyle` /
* `c4hero.interactionStyle` properties. The legacy bare keywords are still
* accepted by the block parser above and win when both forms appear; only
* valid enum members are hoisted — anything else stays a plain property so no
* value is silently lost.
*/
function applyRelationshipConventions(rel) {
	const lineStyle = rel.properties["c4hero.lineStyle"];
	if (lineStyle !== void 0 && rel.lineStyle === void 0 && isLineStyle(lineStyle)) {
		rel.lineStyle = lineStyle;
		delete rel.properties["c4hero.lineStyle"];
	}
	const interactionStyle = rel.properties["c4hero.interactionStyle"];
	if (interactionStyle !== void 0 && rel.interactionStyle === void 0 && isInteractionStyle(interactionStyle)) {
		rel.interactionStyle = interactionStyle;
		delete rel.properties["c4hero.interactionStyle"];
	}
	const { documents, rest } = parseDocumentsFromProperties(rel.properties);
	if (documents !== void 0) rel.documents = documents;
	rel.properties = rest;
}
//#endregion
//#region src/lib/dsl/parser-deployment.ts
function parseDeploymentEnvironment(p, model, varName) {
	p.advance();
	const name = p.readString();
	const id = varName ?? nextId();
	const env = {
		id,
		name,
		deploymentNodes: []
	};
	p.registerDeploymentElement(id, name, "deploymentEnvironment", varName);
	p.skipNewlines();
	if (p.check("LBRACE")) {
		p.advance();
		parseDeploymentEnvironmentBody(p, env, model);
		p.skipNewlines();
		p.expect("RBRACE");
	}
	model.deploymentEnvironments.push(env);
}
function parseDeploymentEnvironmentBody(p, env, model) {
	p.depth++;
	if (p.depth > 50) {
		p.addError("Maximum nesting depth exceeded", p.peek());
		p.depth--;
		return;
	}
	while (!p.check("RBRACE") && p.peekType() !== "EOF") {
		p.skipNewlines();
		if (p.check("RBRACE") || p.peekType() === "EOF") break;
		const token = p.peek();
		if (token.type === "COMMENT") {
			p.advance();
			continue;
		}
		if (token.type === "KEYWORD" && token.value.startsWith("!")) {
			p.advance();
			p.skipToNextLine();
			continue;
		}
		if (token.type === "KEYWORD") {
			const kw = token.value.toLowerCase();
			if (kw === "deploymentnode") {
				const node = parseDeploymentNode(p, model);
				if (node) env.deploymentNodes.push(node);
				continue;
			}
			if (kw === "group") {
				p.advance();
				p.readOptionalString();
				p.skipNewlines();
				if (p.match("LBRACE")) {
					parseDeploymentEnvironmentBody(p, env, model);
					p.skipNewlines();
					p.expect("RBRACE");
				}
				continue;
			}
			if (kw === "properties") {
				p.advance();
				p.skipNewlines();
				p.skipBraceBlock();
				continue;
			}
			p.advance();
			p.skipUnknownDirective();
			continue;
		}
		if (token.type === "IDENTIFIER") {
			const saved = p.pos;
			p.advance();
			p.skipNewlines();
			if (p.check("EQUALS")) {
				p.advance();
				p.skipNewlines();
				const vn = token.value;
				if (p.check("KEYWORD") && p.peekValue().toLowerCase() === "deploymentnode") {
					const node = parseDeploymentNode(p, model, vn);
					if (node) env.deploymentNodes.push(node);
				} else p.skipUnknownDirective();
				continue;
			}
			if (p.check("ARROW")) {
				p.pos = saved;
				const rel = parseRelationship(p);
				if (rel) model.relationships.push(rel);
				continue;
			}
			p.pos = saved;
			p.advance();
			p.skipUnknownDirective();
			continue;
		}
		p.advance();
	}
	p.depth--;
}
function parseDeploymentNode(p, model, varName) {
	p.advance();
	const name = p.readString();
	const description = p.readOptionalString() || void 0;
	const technology = p.readOptionalString() || void 0;
	const tagsStr = p.readOptionalString();
	let positionalInstances;
	if (p.check("NUMBER") || p.check("STRING")) positionalInstances = p.advance().value;
	const id = varName ?? nextId();
	const node = {
		id,
		type: "deploymentNode",
		name,
		description,
		technology,
		instances: positionalInstances,
		tags: p.buildTags("Element", "Deployment Node", tagsStr),
		properties: {},
		children: [],
		infrastructureNodes: [],
		containerInstances: [],
		softwareSystemInstances: []
	};
	p.registerDeploymentElement(id, name, "deploymentNode", varName);
	p.skipNewlines();
	if (p.check("LBRACE")) {
		p.advance();
		parseDeploymentNodeBody(p, node, model);
		p.skipNewlines();
		p.expect("RBRACE");
	}
	return node;
}
function parseDeploymentNodeBody(p, node, model) {
	p.depth++;
	if (p.depth > 50) {
		p.addError("Maximum nesting depth exceeded", p.peek());
		p.depth--;
		return;
	}
	while (!p.check("RBRACE") && p.peekType() !== "EOF") {
		p.skipNewlines();
		if (p.check("RBRACE") || p.peekType() === "EOF") break;
		const token = p.peek();
		if (token.type === "COMMENT") {
			p.advance();
			continue;
		}
		if (token.type === "KEYWORD" && token.value.startsWith("!")) {
			p.advance();
			p.skipToNextLine();
			continue;
		}
		if (token.type === "KEYWORD" || token.type === "IDENTIFIER") {
			const kw = token.value.toLowerCase();
			if (token.type === "KEYWORD" && kw === "deploymentnode") {
				const child = parseDeploymentNode(p, model);
				if (child) node.children.push(child);
				continue;
			}
			if (token.type === "KEYWORD" && kw === "infrastructurenode") {
				const infra = parseInfrastructureNode(p);
				if (infra) node.infrastructureNodes.push(infra);
				continue;
			}
			if (token.type === "KEYWORD" && kw === "containerinstance") {
				const inst = parseElementInstance(p, "containerInstance");
				if (inst) node.containerInstances.push(inst);
				continue;
			}
			if (token.type === "KEYWORD" && kw === "softwaresysteminstance") {
				const inst = parseElementInstance(p, "softwareSystemInstance");
				if (inst) node.softwareSystemInstances.push(inst);
				continue;
			}
			if (kw === "instances") {
				p.advance();
				const val = p.peek();
				if (val.type === "NUMBER" || val.type === "STRING" || val.type === "IDENTIFIER") node.instances = p.advance().value;
				continue;
			}
			if (token.type === "KEYWORD" && (kw === "tags" || kw === "description" || kw === "technology" || kw === "url" || kw === "properties")) {
				parseDeploymentElementProperty(p, node, kw);
				continue;
			}
			if (token.type === "KEYWORD" && kw === "group") {
				p.advance();
				p.readOptionalString();
				p.skipNewlines();
				if (p.match("LBRACE")) {
					parseDeploymentNodeBody(p, node, model);
					p.skipNewlines();
					p.expect("RBRACE");
				}
				continue;
			}
			if (token.type === "IDENTIFIER") {
				const saved = p.pos;
				p.advance();
				p.skipNewlines();
				if (p.check("EQUALS")) {
					p.advance();
					p.skipNewlines();
					const vn = token.value;
					if (p.check("KEYWORD")) {
						const ekw = p.peekValue().toLowerCase();
						if (ekw === "deploymentnode") {
							const child = parseDeploymentNode(p, model, vn);
							if (child) node.children.push(child);
						} else if (ekw === "infrastructurenode") {
							const infra = parseInfrastructureNode(p, vn);
							if (infra) node.infrastructureNodes.push(infra);
						} else if (ekw === "containerinstance") {
							const inst = parseElementInstance(p, "containerInstance", vn);
							if (inst) node.containerInstances.push(inst);
						} else if (ekw === "softwaresysteminstance") {
							const inst = parseElementInstance(p, "softwareSystemInstance", vn);
							if (inst) node.softwareSystemInstances.push(inst);
						} else p.skipUnknownDirective();
					} else p.skipUnknownDirective();
					continue;
				}
				if (p.check("ARROW")) {
					p.pos = saved;
					const rel = parseRelationship(p);
					if (rel) model.relationships.push(rel);
					continue;
				}
				p.pos = saved;
				p.advance();
				p.skipUnknownDirective();
				continue;
			}
			p.advance();
			p.skipUnknownDirective();
			continue;
		}
		p.advance();
	}
	p.depth--;
}
function parseInfrastructureNode(p, varName) {
	p.advance();
	const name = p.readString();
	const description = p.readOptionalString() || void 0;
	const technology = p.readOptionalString() || void 0;
	const tagsStr = p.readOptionalString();
	const id = varName ?? nextId();
	const infra = {
		id,
		type: "infrastructureNode",
		name,
		description,
		technology,
		tags: p.buildTags("Element", "Infrastructure Node", tagsStr),
		properties: {}
	};
	p.registerDeploymentElement(id, name, "infrastructureNode", varName);
	p.skipNewlines();
	if (p.check("LBRACE")) {
		p.advance();
		while (!p.check("RBRACE") && p.peekType() !== "EOF") {
			p.skipNewlines();
			if (p.check("RBRACE") || p.peekType() === "EOF") break;
			const t = p.peek();
			if (t.type === "COMMENT") {
				p.advance();
				continue;
			}
			if (t.type === "KEYWORD" && (t.value.toLowerCase() === "tags" || t.value.toLowerCase() === "description" || t.value.toLowerCase() === "technology" || t.value.toLowerCase() === "url" || t.value.toLowerCase() === "properties")) {
				parseDeploymentElementProperty(p, infra, t.value.toLowerCase());
				continue;
			}
			p.advance();
			p.skipUnknownDirective();
		}
		p.skipNewlines();
		p.expect("RBRACE");
	}
	return infra;
}
/** Parse `containerInstance <ref>` / `softwareSystemInstance <ref>` including
*  optional deployment-group identifiers (ignored) and a trailing tags string. */
function parseElementInstance(p, type, varName) {
	const instanceToken = p.advance();
	const refToken = p.peek();
	if (refToken.type !== "IDENTIFIER" && refToken.type !== "STRING" && refToken.type !== "KEYWORD") {
		p.addError(`Expected ${type} element reference, got ${refToken.type}`, refToken);
		p.skipUnknownDirective();
		return null;
	}
	const ref = p.advance().value;
	const referencedId = p.resolveRef(ref);
	if (!referencedId) p.addError(`Unresolved reference: '${ref}'`, instanceToken);
	while (p.check("IDENTIFIER")) p.advance();
	const tagsStr = p.readOptionalString();
	const id = varName ?? nextId();
	const tags = [type === "containerInstance" ? "Container Instance" : "Software System Instance"];
	if (tagsStr) for (const t of tagsStr.split(",")) {
		const trimmed = t.trim();
		if (trimmed && !tags.includes(trimmed)) tags.push(trimmed);
	}
	const referencedName = p.elementsById.get(referencedId ?? "")?.name ?? ref;
	p.registerDeploymentElement(id, referencedName, type, varName);
	const base = {
		id,
		tags,
		properties: {}
	};
	const instance = type === "containerInstance" ? {
		...base,
		type,
		containerId: referencedId ?? ref
	} : {
		...base,
		type,
		softwareSystemId: referencedId ?? ref
	};
	p.skipNewlines();
	if (p.check("LBRACE")) {
		p.advance();
		while (!p.check("RBRACE") && p.peekType() !== "EOF") {
			p.skipNewlines();
			if (p.check("RBRACE") || p.peekType() === "EOF") break;
			const t = p.peek();
			if (t.type === "COMMENT") {
				p.advance();
				continue;
			}
			const kw = t.value.toLowerCase();
			if (t.type === "KEYWORD" && kw === "tags") {
				p.advance();
				while (p.check("STRING") || p.check("IDENTIFIER")) for (const tag of p.advance().value.split(",")) {
					const trimmed = tag.trim();
					if (trimmed && !instance.tags.includes(trimmed)) instance.tags.push(trimmed);
				}
				continue;
			}
			if (t.type === "KEYWORD" && kw === "url") {
				p.advance();
				const val = p.readOptionalString();
				if (val !== void 0) instance.url = val;
				continue;
			}
			if (t.type === "KEYWORD" && kw === "properties") {
				p.advance();
				p.skipNewlines();
				if (p.match("LBRACE")) {
					while (!p.check("RBRACE") && p.peekType() !== "EOF") {
						p.skipNewlines();
						if (p.check("RBRACE") || p.peekType() === "EOF") break;
						const keyTok = p.peek();
						if (keyTok.type !== "STRING" && keyTok.type !== "IDENTIFIER") {
							p.advance();
							continue;
						}
						const key = p.advance().value;
						const valTok = p.peek();
						if (valTok.type === "STRING" || valTok.type === "IDENTIFIER" || valTok.type === "NUMBER") instance.properties[key] = p.advance().value;
					}
					p.skipNewlines();
					p.expect("RBRACE");
				}
				continue;
			}
			p.advance();
			p.skipUnknownDirective();
		}
		p.skipNewlines();
		p.expect("RBRACE");
	}
	return instance;
}
/** Property keywords shared by deploymentNode and infrastructureNode bodies. */
function parseDeploymentElementProperty(p, element, keyword) {
	p.advance();
	if (keyword === "tags") while (p.check("STRING") || p.check("IDENTIFIER")) for (const t of p.advance().value.split(",")) {
		const trimmed = t.trim();
		if (trimmed && !element.tags.includes(trimmed)) element.tags.push(trimmed);
	}
	else if (keyword === "description") {
		const val = p.readOptionalString();
		if (val !== void 0) element.description = val;
	} else if (keyword === "technology") {
		const val = p.readOptionalString();
		if (val !== void 0) element.technology = val;
	} else if (keyword === "url") {
		const val = p.readOptionalString();
		if (val !== void 0) element.url = val;
	} else if (keyword === "properties") {
		p.skipNewlines();
		if (p.match("LBRACE")) {
			while (!p.check("RBRACE") && p.peekType() !== "EOF") {
				p.skipNewlines();
				if (p.check("RBRACE") || p.peekType() === "EOF") break;
				const keyTok = p.peek();
				if (keyTok.type !== "STRING" && keyTok.type !== "IDENTIFIER") {
					p.advance();
					continue;
				}
				const key = p.advance().value;
				const valTok = p.peek();
				if (valTok.type === "STRING" || valTok.type === "IDENTIFIER" || valTok.type === "NUMBER") element.properties[key] = p.advance().value;
			}
			p.skipNewlines();
			p.expect("RBRACE");
		}
	}
}
//#endregion
//#region src/lib/dsl/parser-model.ts
/**
* Map Structurizr-native encodings back onto c4hero's model fields.
*
* Structurizr has no `location` keyword (externality is the `External` tag)
* and no `owner` / `status` keywords (both travel as properties — `owner`
* bare, `status` as `c4hero.status`), so the serializer emits them that way.
* Undo them here so a round-trip is exact, and so files authored in other
* Structurizr tools get the same interpretation.
*
* The legacy bare `location` / `owner` / `status` keywords are still accepted
* by parseElementPropertyOnElement for back-compat with older c4hero files;
* this runs afterwards and only fills in what those did not set.
*/
function applyStructurizrConventions(element) {
	if (element.type === "person" || element.type === "softwareSystem") {
		const i = element.tags.indexOf("External");
		if (i !== -1 && element.location === void 0) {
			element.location = "External";
			element.tags.splice(i, 1);
		}
	}
	if (element.properties.owner && element.owner === void 0) {
		element.owner = element.properties.owner;
		delete element.properties.owner;
	}
	const status = element.properties["c4hero.status"];
	if (status !== void 0 && element.status === void 0) {
		if (isElementStatus(status)) {
			element.status = status;
			delete element.properties["c4hero.status"];
		}
	}
	const { documents, rest } = parseDocumentsFromProperties(element.properties);
	if (documents !== void 0) element.documents = documents;
	element.properties = rest;
}
function parseModelBody(p, model, groupRefIds, parentGroupId) {
	p.depth++;
	if (p.depth > 50) {
		p.addError("Maximum nesting depth exceeded", p.peek());
		p.depth--;
		return;
	}
	while (!p.check("RBRACE") && p.peekType() !== "EOF") {
		p.skipNewlines();
		if (p.check("RBRACE") || p.peekType() === "EOF") break;
		const token = p.peek();
		if (token.type === "KEYWORD" && token.value.startsWith("!")) {
			p.noteDirective(token.value);
			p.advance();
			p.skipToNextLine();
			continue;
		}
		if (token.type === "COMMENT") {
			p.advance();
			continue;
		}
		if (token.type === "KEYWORD") {
			const kw = token.value.toLowerCase();
			if (kw === "enterprise") {
				p.advance();
				p.readOptionalString();
				p.skipNewlines();
				if (p.match("LBRACE")) {
					parseModelBody(p, model);
					p.skipNewlines();
					p.expect("RBRACE");
				}
				continue;
			}
			if (kw === "group") {
				p.advance();
				const groupName = p.readOptionalString() ?? `Group ${model.groups.length + 1}`;
				const groupId = nextId();
				p.skipNewlines();
				if (p.match("LBRACE")) {
					const memberRefs = [];
					const beforePeople = model.people.length;
					const beforeSystems = model.softwareSystems.length;
					parseModelBody(p, model, memberRefs, groupId);
					p.skipNewlines();
					p.expect("RBRACE");
					const definedIds = [...model.people.slice(beforePeople).map((pp) => pp.id), ...model.softwareSystems.slice(beforeSystems).map((s) => s.id)];
					const group = {
						id: groupId,
						name: groupName,
						elementIds: [.../* @__PURE__ */ new Set([...definedIds, ...memberRefs])]
					};
					if (parentGroupId) group.parentId = parentGroupId;
					model.groups.push(group);
				}
				continue;
			}
			if (kw === "person") {
				const person = parsePerson(p);
				if (person) model.people.push(person);
				continue;
			}
			if (kw === "softwaresystem") {
				const sys = parseSoftwareSystem(p, void 0, model);
				if (sys) model.softwareSystems.push(sys);
				continue;
			}
			if (kw === "deploymentenvironment") {
				parseDeploymentEnvironment(p, model);
				continue;
			}
			if (kw === "properties") {
				p.advance();
				p.skipNewlines();
				p.skipBraceBlock();
				continue;
			}
			p.advance();
			p.skipUnknownDirective();
			continue;
		}
		if (token.type === "IDENTIFIER") {
			if (p.looksLikeRelationship()) {
				const rel = parseRelationship(p);
				if (rel) model.relationships.push(rel);
				continue;
			}
			const saved = p.pos;
			p.advance();
			p.skipNewlines();
			if (p.check("EQUALS")) {
				p.advance();
				p.skipNewlines();
				const varName = token.value;
				if (p.check("KEYWORD")) {
					const elementKw = p.peekValue().toLowerCase();
					if (elementKw === "person") {
						const person = parsePerson(p, varName);
						if (person) model.people.push(person);
					} else if (elementKw === "softwaresystem") {
						const sys = parseSoftwareSystem(p, varName, model);
						if (sys) model.softwareSystems.push(sys);
					} else if (elementKw === "deploymentenvironment") parseDeploymentEnvironment(p, model, varName);
					else p.skipUnknownDirective();
				} else p.skipUnknownDirective();
				continue;
			}
			p.pos = saved;
			const ref = p.readQualifiedRef();
			if (ref) {
				const resolvedId = p.resolveRef(ref.ref);
				if (resolvedId) {
					if (groupRefIds !== void 0) groupRefIds.push(resolvedId);
				} else if (ref.ref.includes(".")) p.addError(`Unresolved reference: '${ref.ref}'`, ref.token);
			} else p.advance();
			p.skipUnknownDirective();
			continue;
		}
		p.advance();
	}
	p.depth--;
}
function parsePerson(p, varName) {
	p.advance();
	const name = p.readString();
	const description = p.readOptionalString() || void 0;
	const tagsStr = p.readOptionalString();
	const id = p.allocateId(varName);
	const person = {
		id,
		type: "person",
		name,
		description,
		tags: p.buildTags("Element", "Person", tagsStr),
		properties: {}
	};
	p.registerElement(id, name, "person", varName);
	p.skipNewlines();
	if (p.check("LBRACE")) {
		p.advance();
		parseSimpleElementBlock(p, person);
		p.skipNewlines();
		p.expect("RBRACE");
	}
	applyStructurizrConventions(person);
	return person;
}
function parseSoftwareSystem(p, varName, model) {
	p.advance();
	const name = p.readString();
	const description = p.readOptionalString() || void 0;
	const tagsStr = p.readOptionalString();
	const id = p.allocateId(varName);
	const sys = {
		id,
		type: "softwareSystem",
		name,
		description,
		tags: p.buildTags("Element", "Software System", tagsStr),
		properties: {},
		containers: []
	};
	const path = p.registerElement(id, name, "softwareSystem", varName);
	p.skipNewlines();
	if (p.check("LBRACE")) {
		p.advance();
		parseSoftwareSystemBody(p, sys, model, path);
		p.skipNewlines();
		p.expect("RBRACE");
	}
	applyStructurizrConventions(sys);
	return sys;
}
function parseSoftwareSystemBody(p, sys, model, path, parentGroupId) {
	p.depth++;
	if (p.depth > 50) {
		p.addError("Maximum nesting depth exceeded", p.peek());
		p.depth--;
		return;
	}
	while (!p.check("RBRACE") && p.peekType() !== "EOF") {
		p.skipNewlines();
		if (p.check("RBRACE") || p.peekType() === "EOF") break;
		const token = p.peek();
		if (token.type === "COMMENT") {
			p.advance();
			continue;
		}
		if (token.type === "KEYWORD" && token.value.startsWith("!")) {
			p.advance();
			p.skipToNextLine();
			continue;
		}
		if (token.type === "KEYWORD") {
			const kw = token.value.toLowerCase();
			if (kw === "group") {
				p.advance();
				const groupName = p.readOptionalString() ?? `Group ${(model?.groups.length ?? 0) + 1}`;
				const groupId = nextId();
				p.skipNewlines();
				if (p.match("LBRACE")) {
					const beforeContainers = sys.containers.length;
					parseSoftwareSystemBody(p, sys, model, path, groupId);
					p.skipNewlines();
					p.expect("RBRACE");
					if (model) {
						const group = {
							id: groupId,
							name: groupName,
							elementIds: sys.containers.slice(beforeContainers).map((container) => container.id)
						};
						if (parentGroupId) group.parentId = parentGroupId;
						model.groups.push(group);
					}
				}
				continue;
			}
			if (kw === "container") {
				const container = parseContainer(p, void 0, model, path);
				if (container) sys.containers.push(container);
				continue;
			}
			if (kw === "tags" || kw === "description" || kw === "technology" || kw === "url" || kw === "properties" || kw === "perspectives" || kw === "location" || kw === "status" || kw === "owner") {
				parseElementPropertyOnElement(p, sys, kw);
				continue;
			}
			p.advance();
			p.skipUnknownDirective();
			continue;
		}
		if (token.type === "IDENTIFIER") {
			if (p.looksLikeRelationship()) {
				if (model) {
					const rel = parseRelationship(p);
					if (rel) model.relationships.push(rel);
				} else p.skipToNextLine();
				continue;
			}
			const saved = p.pos;
			p.advance();
			p.skipNewlines();
			if (p.check("EQUALS")) {
				p.advance();
				p.skipNewlines();
				const vn = token.value;
				if (p.check("KEYWORD")) {
					if (p.peekValue().toLowerCase() === "container") {
						const container = parseContainer(p, vn, model, path);
						if (container) sys.containers.push(container);
					} else p.skipUnknownDirective();
				} else p.skipUnknownDirective();
				continue;
			}
			p.pos = saved;
			p.advance();
			p.skipUnknownDirective();
			continue;
		}
		p.advance();
	}
	p.depth--;
}
function parseContainer(p, varName, model, parentPath) {
	p.advance();
	const name = p.readString();
	const description = p.readOptionalString() || void 0;
	const technology = p.readOptionalString() || void 0;
	const tagsStr = p.readOptionalString();
	const id = p.allocateId(varName, parentPath);
	const container = {
		id,
		type: "container",
		name,
		description,
		technology,
		tags: p.buildTags("Element", "Container", tagsStr),
		properties: {},
		components: []
	};
	const path = p.registerElement(id, name, "container", varName, parentPath);
	p.skipNewlines();
	if (p.check("LBRACE")) {
		p.advance();
		parseContainerBody(p, container, model, path);
		p.skipNewlines();
		p.expect("RBRACE");
	}
	applyStructurizrConventions(container);
	return container;
}
function parseContainerBody(p, container, model, path, parentGroupId) {
	p.depth++;
	if (p.depth > 50) {
		p.addError("Maximum nesting depth exceeded", p.peek());
		p.depth--;
		return;
	}
	while (!p.check("RBRACE") && p.peekType() !== "EOF") {
		p.skipNewlines();
		if (p.check("RBRACE") || p.peekType() === "EOF") break;
		const token = p.peek();
		if (token.type === "COMMENT") {
			p.advance();
			continue;
		}
		if (token.type === "KEYWORD" && token.value.startsWith("!")) {
			p.advance();
			p.skipToNextLine();
			continue;
		}
		if (token.type === "KEYWORD") {
			const kw = token.value.toLowerCase();
			if (kw === "group") {
				p.advance();
				const groupName = p.readOptionalString() ?? `Group ${(model?.groups.length ?? 0) + 1}`;
				const groupId = nextId();
				p.skipNewlines();
				if (p.match("LBRACE")) {
					const beforeComponents = container.components.length;
					parseContainerBody(p, container, model, path, groupId);
					p.skipNewlines();
					p.expect("RBRACE");
					if (model) {
						const group = {
							id: groupId,
							name: groupName,
							elementIds: container.components.slice(beforeComponents).map((component) => component.id)
						};
						if (parentGroupId) group.parentId = parentGroupId;
						model.groups.push(group);
					}
				}
				continue;
			}
			if (kw === "component") {
				const comp = parseComponent(p, void 0, path, model);
				if (comp) container.components.push(comp);
				continue;
			}
			if (kw === "tags" || kw === "description" || kw === "technology" || kw === "url" || kw === "properties" || kw === "perspectives" || kw === "status" || kw === "owner") {
				parseElementPropertyOnElement(p, container, kw);
				continue;
			}
			p.advance();
			p.skipUnknownDirective();
			continue;
		}
		if (token.type === "IDENTIFIER") {
			if (p.looksLikeRelationship()) {
				if (model) {
					const rel = parseRelationship(p);
					if (rel) model.relationships.push(rel);
				} else p.skipToNextLine();
				continue;
			}
			const saved = p.pos;
			p.advance();
			p.skipNewlines();
			if (p.check("EQUALS")) {
				p.advance();
				p.skipNewlines();
				const vn = token.value;
				if (p.check("KEYWORD") && p.peekValue().toLowerCase() === "component") {
					const comp = parseComponent(p, vn, path, model);
					if (comp) container.components.push(comp);
				} else p.skipUnknownDirective();
				continue;
			}
			p.pos = saved;
			p.advance();
			p.skipUnknownDirective();
			continue;
		}
		p.advance();
	}
	p.depth--;
}
function parseComponent(p, varName, parentPath, model) {
	p.advance();
	const name = p.readString();
	const description = p.readOptionalString() || void 0;
	const technology = p.readOptionalString() || void 0;
	const tagsStr = p.readOptionalString();
	const id = p.allocateId(varName, parentPath);
	const component = {
		id,
		type: "component",
		name,
		description,
		technology,
		tags: p.buildTags("Element", "Component", tagsStr),
		properties: {}
	};
	p.registerElement(id, name, "component", varName, parentPath);
	p.skipNewlines();
	if (p.check("LBRACE")) {
		p.advance();
		parseSimpleElementBlock(p, component, model);
		p.skipNewlines();
		p.expect("RBRACE");
	}
	applyStructurizrConventions(component);
	return component;
}
function parseSimpleElementBlock(p, element, model) {
	while (!p.check("RBRACE") && p.peekType() !== "EOF") {
		p.skipNewlines();
		if (p.check("RBRACE") || p.peekType() === "EOF") break;
		const token = p.peek();
		if (token.type === "COMMENT") {
			p.advance();
			continue;
		}
		if (token.type === "KEYWORD" && token.value.startsWith("!")) {
			p.advance();
			p.skipToNextLine();
			continue;
		}
		if (token.type === "KEYWORD") {
			const kw = token.value.toLowerCase();
			if (kw === "group" && element.type === "component") {
				p.advance();
				const groupName = p.readOptionalString();
				if (groupName && model) model.groups.push({
					id: nextId(),
					name: groupName,
					elementIds: [element.id]
				});
				continue;
			}
			if (kw === "tags" || kw === "description" || kw === "technology" || kw === "url" || kw === "properties" || kw === "perspectives" || kw === "location" || kw === "status" || kw === "owner") {
				parseElementPropertyOnElement(p, element, kw);
				continue;
			}
			p.advance();
			p.skipUnknownDirective();
			continue;
		}
		p.advance();
		p.skipUnknownDirective();
	}
}
function parseElementPropertyOnElement(p, element, keyword) {
	p.advance();
	if (keyword === "tags") while (p.check("STRING") || p.check("IDENTIFIER")) {
		const tagVal = p.advance().value;
		for (const t of tagVal.split(",")) {
			const trimmed = t.trim();
			if (trimmed && !element.tags.includes(trimmed)) element.tags.push(trimmed);
		}
	}
	else if (keyword === "description") {
		const val = p.readOptionalString();
		if (val !== void 0) element.description = val;
	} else if (keyword === "technology") {
		const val = p.readOptionalString();
		if (val !== void 0 && "technology" in element) element.technology = val;
	} else if (keyword === "url") {
		const val = p.readOptionalString();
		if (val !== void 0) element.url = val;
	} else if (keyword === "status") {
		const val = p.peek();
		if (val.type === "IDENTIFIER" || val.type === "KEYWORD" || val.type === "STRING") {
			const s = p.advance().value;
			if (isElementStatus(s)) element.status = s;
		}
	} else if (keyword === "owner") {
		const val = p.readOptionalString();
		if (val !== void 0) element.owner = val;
	} else if (keyword === "location") {
		const val = p.peek();
		if (val.type === "IDENTIFIER" || val.type === "KEYWORD") {
			const loc = p.advance().value;
			if (element.type === "person" || element.type === "softwareSystem") {
				if (loc === "External") element.location = "External";
				else if (loc === "Internal") element.location = "Internal";
			}
		}
	} else if (keyword === "properties") {
		p.skipNewlines();
		if (p.match("LBRACE")) {
			parsePropertiesBlock(p, element);
			p.skipNewlines();
			p.expect("RBRACE");
		}
	} else if (keyword === "perspectives") {
		p.skipNewlines();
		p.skipBraceBlock();
	}
}
/** Parse a `properties { "key" "value" ... }` block and attach known
*  keys to the element. Recognizes `c4hero.location` for Person/SoftwareSystem. */
function parsePropertiesBlock(p, element) {
	while (!p.check("RBRACE") && p.peekType() !== "EOF") {
		p.skipNewlines();
		if (p.check("RBRACE") || p.peekType() === "EOF") break;
		const token = p.peek();
		if (token.type === "COMMENT") {
			p.advance();
			continue;
		}
		if (token.type !== "STRING" && token.type !== "IDENTIFIER") {
			p.advance();
			continue;
		}
		const key = p.advance().value;
		const valTok = p.peek();
		let val;
		if (valTok.type === "STRING" || valTok.type === "IDENTIFIER" || valTok.type === "NUMBER") val = p.advance().value;
		if (val === void 0) continue;
		if (key === "c4hero.location" && (element.type === "person" || element.type === "softwareSystem") && (val === "External" || val === "Internal") && element.location === void 0) element.location = val;
		else setUserProperty(element.properties, key, val);
	}
}
//#endregion
//#region src/lib/dsl/parser.ts
/**
* Expand an `include *` wildcard into the actual elements appropriate for the view type.
* Structurizr semantics: landscape/context = people + systems; container = people + systems + containers
* of the scoped system; component = people + systems + containers + components of the scoped container.
*/
function expandWildcard(model, view) {
	const seen = /* @__PURE__ */ new Set();
	const ids = [];
	const addId = (id) => {
		if (seen.has(id)) return;
		seen.add(id);
		ids.push(id);
	};
	if (view.type === "systemLandscape") {
		for (const p of model.people) addId(p.id);
		for (const s of model.softwareSystems) addId(s.id);
	} else if (view.type === "systemContext" && view.softwareSystemId) {
		const scopeId = view.softwareSystemId;
		addId(scopeId);
		const scopeSys = model.softwareSystems.find((s) => s.id === scopeId);
		const scopeInternalIds = /* @__PURE__ */ new Set([scopeId]);
		if (scopeSys) for (const c of scopeSys.containers) {
			scopeInternalIds.add(c.id);
			for (const comp of c.components) scopeInternalIds.add(comp.id);
		}
		const connectedIds = /* @__PURE__ */ new Set();
		for (const rel of model.relationships) {
			if (scopeInternalIds.has(rel.sourceId)) connectedIds.add(rel.destinationId);
			if (scopeInternalIds.has(rel.destinationId)) connectedIds.add(rel.sourceId);
		}
		for (const p of model.people) if (connectedIds.has(p.id)) addId(p.id);
		for (const s of model.softwareSystems) if (s.id !== scopeId && connectedIds.has(s.id)) addId(s.id);
	} else if (view.type === "container" && view.softwareSystemId) {
		const scopeSys = model.softwareSystems.find((s) => s.id === view.softwareSystemId);
		if (scopeSys) for (const c of scopeSys.containers) addId(c.id);
		const containerIds = new Set(ids);
		const relatedIds = /* @__PURE__ */ new Set();
		for (const rel of model.relationships) {
			if (containerIds.has(rel.sourceId)) relatedIds.add(rel.destinationId);
			if (containerIds.has(rel.destinationId)) relatedIds.add(rel.sourceId);
		}
		for (const p of model.people) if (relatedIds.has(p.id)) addId(p.id);
		for (const s of model.softwareSystems) {
			if (s.id !== view.softwareSystemId && relatedIds.has(s.id)) addId(s.id);
			for (const c of s.containers) if (relatedIds.has(c.id)) addId(c.id);
		}
	} else if (view.type === "component" && view.containerId) {
		const containerId = view.containerId;
		for (const s of model.softwareSystems) {
			const parentContainer = s.containers.find((c) => c.id === containerId);
			if (parentContainer) for (const comp of parentContainer.components) addId(comp.id);
		}
		const componentIds = new Set(ids);
		const relatedToComponents = /* @__PURE__ */ new Set();
		for (const rel of model.relationships) {
			if (componentIds.has(rel.sourceId)) relatedToComponents.add(rel.destinationId);
			if (componentIds.has(rel.destinationId)) relatedToComponents.add(rel.sourceId);
		}
		for (const p of model.people) if (relatedToComponents.has(p.id)) addId(p.id);
		for (const s of model.softwareSystems) {
			if (relatedToComponents.has(s.id)) addId(s.id);
			for (const c of s.containers) if (c.id !== containerId && relatedToComponents.has(c.id)) addId(c.id);
			else if (c.id !== containerId && c.components.some((comp) => relatedToComponents.has(comp.id))) addId(c.id);
		}
	}
	return ids.map((id) => ({ id }));
}
var globalIdCounter = 0;
function nextId() {
	globalIdCounter++;
	return `p${globalIdCounter}`;
}
/**
* Store a parsed user property. defineProperty, not assignment: a
* "__proto__" key would otherwise set the object's prototype instead of
* storing the property. Every properties-block parser must use this.
*/
function setUserProperty(props, key, value) {
	Object.defineProperty(props, key, {
		value,
		enumerable: true,
		writable: true,
		configurable: true
	});
}
var ContextAwareParser = class {
	tokens;
	pos = 0;
	errors = [];
	depth = 0;
	varToId = /* @__PURE__ */ new Map();
	nameToId = /* @__PURE__ */ new Map();
	elementsById = /* @__PURE__ */ new Map();
	qualifiedToId = /* @__PURE__ */ new Map();
	usedIds = /* @__PURE__ */ new Set();
	/** Set by `!identifiers hierarchical`. Refs are resolved qualified-first
	*  either way; the flag records the DSL's declared intent. */
	hierarchicalIdentifiers = false;
	/** Set by `!impliedRelationships true|false`. Copied onto the workspace
	*  once parsing finishes — see noteDirective(). */
	impliedRelationships = void 0;
	relCounter = 0;
	viewExcludedIds = /* @__PURE__ */ new Map();
	getExcludedIdsForView(view) {
		return this.viewExcludedIds.get(view) ?? /* @__PURE__ */ new Set();
	}
	constructor(tokens) {
		this.tokens = tokens;
	}
	peek() {
		return this.tokens[this.pos];
	}
	peekType() {
		return this.tokens[this.pos].type;
	}
	peekValue() {
		return this.tokens[this.pos].value;
	}
	advance() {
		const token = this.tokens[this.pos];
		this.pos++;
		return token;
	}
	expect(type, expectedValue) {
		const token = this.peek();
		if (token.type !== type || expectedValue !== void 0 && token.value !== expectedValue) {
			this.addError(`Expected ${type}${expectedValue ? ` '${expectedValue}'` : ""}, got ${token.type} '${token.value}'`, token);
			return token;
		}
		return this.advance();
	}
	match(type, value) {
		const token = this.peek();
		if (token.type === type && (value === void 0 || token.value === value)) {
			this.advance();
			return true;
		}
		return false;
	}
	check(type, value) {
		const token = this.peek();
		return token.type === type && (value === void 0 || token.value === value);
	}
	skipNewlines() {
		while (this.peekType() === "NEWLINE" || this.peekType() === "COMMENT") this.advance();
	}
	skipToNextLine() {
		while (this.peekType() !== "NEWLINE" && this.peekType() !== "EOF") this.advance();
		if (this.peekType() === "NEWLINE") this.advance();
	}
	addError(message, token) {
		this.errors.push({
			message,
			line: token.line,
			column: token.column
		});
	}
	skipBraceBlock() {
		if (this.check("LBRACE") && !this.insideUnknownDirective) this.noteSkipped(this.pos - 1);
		if (!this.match("LBRACE")) return;
		let depth = 1;
		while (depth > 0 && this.peekType() !== "EOF") {
			if (this.peekType() === "LBRACE") depth++;
			if (this.peekType() === "RBRACE") depth--;
			if (depth > 0) this.advance();
		}
		if (this.peekType() === "RBRACE") this.advance();
	}
	/** Consume inline args (until newline/EOF/LBRACE), then skip any following brace
	*  block. Used to gracefully ignore unknown keywords/identifiers in element bodies
	*  without mistakenly consuming the parent's closing `}`. */
	skipUnknownDirective() {
		this.noteSkipped(this.pos - 1);
		while (this.peekType() !== "NEWLINE" && this.peekType() !== "EOF" && !this.check("LBRACE")) this.advance();
		if (this.peekType() === "NEWLINE") this.advance();
		this.skipNewlines();
		this.insideUnknownDirective = true;
		if (this.check("LBRACE")) this.skipBraceBlock();
		this.insideUnknownDirective = false;
	}
	/** Statements consumed without being modelled; see SkippedConstruct. */
	skipped = [];
	insideUnknownDirective = false;
	/** Record the statement whose keyword sits at or before token `anchor`. */
	noteSkipped(anchor) {
		let i = Math.max(anchor, 0);
		while (i > 0 && (this.tokens[i].type === "NEWLINE" || this.tokens[i].type === "COMMENT")) i--;
		let start = i;
		while (start > 0 && this.tokens[start - 1].type !== "NEWLINE" && this.tokens[start - 1].type !== "LBRACE") start--;
		const parts = [];
		for (let j = start; j < this.tokens.length; j++) {
			const t = this.tokens[j];
			if (t.type === "NEWLINE" || t.type === "LBRACE" || t.type === "EOF") break;
			parts.push(t.type === "STRING" ? `"${t.value}"` : t.value);
		}
		const entry = {
			line: this.tokens[start].line,
			text: parts.join(" ")
		};
		if (!this.skipped.some((k) => k.line === entry.line && k.text === entry.text)) this.skipped.push(entry);
	}
	/**
	* Pick a unique element id for a declaration. The DSL variable name is used
	* verbatim when it's still free, so ids survive a serialize → parse
	* roundtrip. When the same variable name is reused in another scope (legal
	* with hierarchical identifiers — `ctk.gatewayApi` and `mpng.gatewayApi`
	* both declare `gatewayApi`), fall back to the qualified path with dots
	* replaced by underscores so the id stays a valid DSL identifier.
	*/
	allocateId(varName, parentPath) {
		if (!varName) {
			let generated = nextId();
			while (this.usedIds.has(generated)) generated = nextId();
			this.usedIds.add(generated);
			return generated;
		}
		if (!this.usedIds.has(varName)) {
			this.usedIds.add(varName);
			return varName;
		}
		const base = (parentPath ? `${parentPath}.${varName}` : varName).replace(/\./g, "_");
		let candidate = base;
		let suffix = 2;
		while (this.usedIds.has(candidate)) candidate = `${base}_${suffix++}`;
		this.usedIds.add(candidate);
		return candidate;
	}
	/**
	* Record an element under every name it can be referenced by, and return
	* its own qualified path so children can build theirs.
	*
	* `parentPath` is the qualified path of the enclosing element (undefined at
	* the top level). A container inside `mpng` is registered as both the bare
	* `gatewayApi` and the qualified `mpng.gatewayApi`; bare names are ambiguous
	* across scopes, which is why resolveRef() prefers the qualified match.
	*/
	registerElement(id, name, _type, varName, parentPath) {
		this.elementsById.set(id, {
			name,
			type: _type
		});
		this.nameToId.set(name, id);
		if (varName) this.varToId.set(varName, id);
		const segment = varName ?? name;
		const path = parentPath ? `${parentPath}.${segment}` : segment;
		if (parentPath) {
			this.qualifiedToId.set(path, id);
			const namePath = `${parentPath}.${name}`;
			if (!this.qualifiedToId.has(namePath)) this.qualifiedToId.set(namePath, id);
		}
		return path;
	}
	/** Register a deployment-family element (environment, node, instance).
	*  Unlike registerElement this never maps the display name, because
	*  deployment names routinely duplicate model element names (an instance
	*  shares its container's name) and must not shadow them in resolveRef. */
	registerDeploymentElement(id, name, _type, varName) {
		this.elementsById.set(id, {
			name,
			type: _type
		});
		if (varName) this.varToId.set(varName, id);
	}
	resolveRef(ref) {
		const qualified = this.qualifiedToId.get(ref);
		if (qualified !== void 0) return qualified;
		if (this.varToId.has(ref)) return this.varToId.get(ref);
		if (this.nameToId.has(ref)) return this.nameToId.get(ref);
		if (this.elementsById.has(ref)) return ref;
	}
	/** Record the effect of a preprocessor directive. The lexer folds the whole
	*  line into the keyword's value, so `!identifiers hierarchical` arrives as
	*  a single token. c4hero always registers bare *and* qualified names, so
	*  the flag only records intent — resolution prefers qualified regardless. */
	noteDirective(value) {
		if (/^!identifiers\b/.test(value) && /\bhierarchical\b/.test(value)) this.hierarchicalIdentifiers = true;
		const implied = /^!impliedRelationships\s+(true|false)\b/.exec(value);
		if (implied) this.impliedRelationships = implied[1] === "true";
	}
	/** True when the token at `index` can be a segment of a qualified path.
	*  Keywords are allowed because element variables may be named after them
	*  (`spine.status`, `atk.default`). */
	isRefSegment(index) {
		const t = this.tokens[index];
		return t !== void 0 && (t.type === "IDENTIFIER" || t.type === "KEYWORD");
	}
	/** True when `DOT IDENT` at `dotIndex` is the head of a Structurizr
	*  expression (`element.type==X`, `element.parent==Y`) rather than a
	*  qualified path segment. */
	isExpressionTail(dotIndex) {
		return this.tokens[dotIndex + 2]?.type === "EQUALS" && this.tokens[dotIndex + 3]?.type === "EQUALS";
	}
	/**
	* Consume an element reference — `IDENT (DOT IDENT)*` — and return the
	* joined path plus the token it starts at (for error positions).
	* Returns null when the current token cannot start a reference.
	*
	* `element.type==` / `element.parent==` expressions are left alone: the
	* `==` lookahead stops the join, so `include` / `exclude` still hand those
	* to the expression parser.
	*/
	readQualifiedRef(options) {
		const start = this.peek();
		if (!(start.type === "IDENTIFIER" || start.type === "KEYWORD" || options?.allowString === true && start.type === "STRING")) return null;
		this.advance();
		let ref = start.value;
		while (this.check("DOT") && this.isRefSegment(this.pos + 1) && !this.isExpressionTail(this.pos)) {
			this.advance();
			ref += "." + this.advance().value;
		}
		return {
			ref,
			token: start
		};
	}
	/** True when the statement at the current position is a relationship —
	*  `ref (.ref)* ->`. Needed because a dotted source puts a DOT, not an
	*  ARROW, immediately after the first identifier. Newlines before the arrow
	*  are tolerated, as they were before qualified refs existed. */
	looksLikeRelationship() {
		if (!this.isRefSegment(this.pos)) return false;
		let i = this.pos + 1;
		while (this.tokens[i]?.type === "DOT" && this.isRefSegment(i + 1)) i += 2;
		while (this.tokens[i]?.type === "NEWLINE" || this.tokens[i]?.type === "COMMENT") i++;
		return this.tokens[i]?.type === "ARROW";
	}
	readOptionalString() {
		if (this.check("STRING")) return this.advance().value;
	}
	readString() {
		if (this.check("STRING")) return this.advance().value;
		this.addError(`Expected string, got ${this.peekType()} '${this.peekValue()}'`, this.peek());
		return "";
	}
	readOptionalStringOrIdentifier() {
		if (this.check("STRING")) return this.advance().value;
		if (this.check("IDENTIFIER")) return this.advance().value;
	}
	buildTags(defaultTag1, defaultTag2, extraTags) {
		const tags = [defaultTag1, defaultTag2];
		if (extraTags) for (const t of extraTags.split(",")) {
			const trimmed = t.trim();
			if (trimmed && !tags.includes(trimmed)) tags.push(trimmed);
		}
		return tags;
	}
	readStyleValue() {
		if (this.check("STRING")) return this.advance().value;
		if (this.check("NUMBER")) return this.advance().value;
		if (this.check("IDENTIFIER") || this.check("KEYWORD")) return this.advance().value;
	}
	parse() {
		const workspace = this.createEmptyWorkspace();
		this.skipNewlines();
		if (this.check("KEYWORD", "workspace")) {
			this.advance();
			if (this.check("KEYWORD", "extends") || this.check("IDENTIFIER", "extends")) {
				this.skipToNextLine();
				this.skipBraceBlock();
				return {
					workspace,
					errors: this.errors,
					skipped: this.skipped
				};
			}
			workspace.name = this.readOptionalString() || void 0;
			workspace.description = this.readOptionalString() || void 0;
			this.skipNewlines();
			if (this.match("LBRACE")) {
				this.parseWorkspaceBody(workspace);
				this.skipNewlines();
				this.match("RBRACE");
			}
			if (this.impliedRelationships !== void 0) workspace.impliedRelationships = this.impliedRelationships;
		}
		return {
			workspace,
			errors: this.errors,
			skipped: this.skipped
		};
	}
	createEmptyWorkspace() {
		return {
			name: void 0,
			description: void 0,
			model: {
				people: [],
				softwareSystems: [],
				relationships: [],
				groups: [],
				deploymentEnvironments: []
			},
			views: {
				systemLandscapeViews: [],
				systemContextViews: [],
				containerViews: [],
				componentViews: [],
				dynamicViews: [],
				deploymentViews: [],
				configuration: { styles: {
					elements: [],
					relationships: []
				} }
			}
		};
	}
	parseWorkspaceBody(workspace) {
		while (!this.check("RBRACE") && this.peekType() !== "EOF") {
			this.skipNewlines();
			if (this.check("RBRACE") || this.peekType() === "EOF") break;
			const token = this.peek();
			if (token.type === "KEYWORD") {
				const kw = token.value.toLowerCase();
				if (kw === "model") {
					this.advance();
					this.skipNewlines();
					if (this.match("LBRACE")) {
						parseModelBody(this, workspace.model);
						this.skipNewlines();
						this.expect("RBRACE");
					}
				} else if (kw === "views") {
					this.advance();
					this.skipNewlines();
					if (this.match("LBRACE")) {
						parseViewsBody(this, workspace.views, workspace.model);
						this.skipNewlines();
						this.expect("RBRACE");
					}
				} else if (token.value.startsWith("!")) {
					this.noteDirective(token.value);
					this.advance();
					this.skipToNextLine();
				} else if (kw === "configuration") {
					this.advance();
					this.skipNewlines();
					if (this.match("LBRACE")) {
						this.parseWorkspaceConfiguration(workspace);
						this.skipNewlines();
						this.expect("RBRACE");
					}
				} else if (kw === "properties") {
					this.advance();
					this.skipNewlines();
					this.skipBraceBlock();
				} else {
					this.advance();
					while (this.check("STRING") || this.check("IDENTIFIER") || this.check("NUMBER")) this.advance();
					this.skipNewlines();
					if (this.check("LBRACE")) this.skipBraceBlock();
					else this.noteSkipped(this.pos - 1);
				}
			} else this.advance();
		}
	}
	parseWorkspaceConfiguration(workspace) {
		while (!this.check("RBRACE") && this.peekType() !== "EOF") {
			this.skipNewlines();
			if (this.check("RBRACE") || this.peekType() === "EOF") break;
			const token = this.peek();
			if ((token.type === "IDENTIFIER" || token.type === "KEYWORD") && token.value.toLowerCase() === "scope") {
				this.advance();
				const val = this.peek();
				if (val.type === "IDENTIFIER" || val.type === "KEYWORD") {
					this.advance();
					const s = val.value.toLowerCase();
					if (s === "softwaresystem") workspace.scope = "softwaresystem";
					else if (s === "landscape") workspace.scope = "landscape";
					else if (s === "none") workspace.scope = "none";
					else {
						this.addError(`Unknown scope value '${val.value}' — expected 'softwareSystem', 'landscape', or 'none'`, val);
						workspace.scope = "none";
					}
				}
			} else {
				this.advance();
				this.skipUnknownDirective();
			}
		}
	}
};
function parse(input) {
	globalIdCounter = 0;
	const lexResult = lex(input);
	const parser = new ContextAwareParser(lexResult.tokens);
	const result = parser.parse();
	const errors = [...lexResult.errors, ...result.errors];
	const ws = result.workspace;
	const allViews = [
		...ws.views.systemLandscapeViews,
		...ws.views.systemContextViews,
		...ws.views.containerViews,
		...ws.views.componentViews,
		...ws.views.deploymentViews
	];
	for (const view of allViews) {
		const excluded = parser.getExcludedIdsForView(view);
		if (view.elements.some((e) => e.id === "*")) {
			let expanded = view.type === "deployment" ? expandDeploymentElements(ws.model, view.environment, view.softwareSystemId) : expandWildcard(ws.model, view);
			if (excluded.size > 0) expanded = expanded.filter((e) => !excluded.has(e.id));
			view.elements = expanded;
			const expandedIds = new Set(expanded.map((e) => e.id));
			view.relationships = ws.model.relationships.filter((r) => expandedIds.has(r.sourceId) && expandedIds.has(r.destinationId)).map((r) => ({ id: r.id }));
		} else {
			let elements = view.elements;
			if (excluded.size > 0) elements = elements.filter((e) => !excluded.has(e.id));
			const seen = /* @__PURE__ */ new Set();
			elements = elements.filter((e) => {
				if (seen.has(e.id)) return false;
				seen.add(e.id);
				return true;
			});
			view.elements = elements;
			const elementIds = seen;
			view.relationships = ws.model.relationships.filter((r) => elementIds.has(r.sourceId) && elementIds.has(r.destinationId)).map((r) => ({ id: r.id }));
		}
	}
	return {
		workspace: ws,
		errors,
		skipped: parser.skipped
	};
}
//#endregion
//#region src/lib/dsl/serializer.ts
var INDENT = "    ";
var GROUP_SEPARATOR = "/";
/** Raised when c4hero's richer boundary model cannot be represented by
* Structurizr's single hierarchical group path per element. */
var GroupSerializationError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "GroupSerializationError";
	}
};
function serialize(workspace) {
	return new SerializerContext(workspace).serialize();
}
var SerializerContext = class {
	workspace;
	lines = [];
	depth = 0;
	idToVar = /* @__PURE__ */ new Map();
	allElementIds = /* @__PURE__ */ new Set();
	topLevelGroups;
	containerGroups = /* @__PURE__ */ new Map();
	componentGroups = /* @__PURE__ */ new Map();
	hasNestedGroups = false;
	constructor(workspace) {
		this.workspace = workspace;
		this.buildIdMaps();
		this.topLevelGroups = this.buildGroupScope([...workspace.model.people, ...workspace.model.softwareSystems], true);
		this.hasNestedGroups ||= this.topLevelGroups.nested;
		for (const sys of workspace.model.softwareSystems) {
			const containers = this.buildGroupScope(sys.containers);
			this.containerGroups.set(sys.id, containers);
			this.hasNestedGroups ||= containers.nested;
			for (const container of sys.containers) {
				const components = this.buildGroupScope(container.components);
				this.componentGroups.set(container.id, components);
				this.hasNestedGroups ||= components.nested;
			}
		}
		if (this.hasNestedGroups) {
			const badName = workspace.model.groups.find((group) => group.name.includes(GROUP_SEPARATOR));
			if (badName) throw new GroupSerializationError(`Cannot export nested group "${badName.name}": group names may not contain the configured separator "${GROUP_SEPARATOR}". Rename the group first.`);
		}
	}
	/**
	* Project flat c4hero group membership into the one group path Structurizr
	* permits at a single abstraction scope. Disjoint sets are siblings and a
	* proper subset is a nested group. Explicit parentId retains nesting when
	* parent and child aggregate to equal sets; unrelated crossing or equal
	* sets would require two paths, so fail instead of silently degrading the
	* exported model.
	*/
	buildGroupScope(elements, includeGloballyEmpty = false) {
		const elementIds = new Set(elements.map((element) => element.id));
		const groups = this.workspace.model.groups.map((group, order) => ({
			group,
			globalMemberIds: new Set(group.elementIds),
			memberIds: new Set(group.elementIds.filter((id) => elementIds.has(id))),
			members: [],
			children: [],
			order
		})).filter((scoped) => scoped.memberIds.size > 0 || includeGloballyEmpty && scoped.group.elementIds.length === 0);
		const allGroupsById = new Map(this.workspace.model.groups.map((group) => [group.id, group]));
		const scopedById = new Map(groups.map((group) => [group.group.id, group]));
		for (const scoped of groups) {
			const seen = /* @__PURE__ */ new Set([scoped.group.id]);
			let parentId = scoped.group.parentId;
			while (parentId) {
				if (seen.has(parentId)) throw new GroupSerializationError(`Cannot export group "${scoped.group.name}": its parent hierarchy contains a cycle.`);
				seen.add(parentId);
				const parent = allGroupsById.get(parentId);
				if (!parent) throw new GroupSerializationError(`Cannot export group "${scoped.group.name}": parent group ${parentId} does not exist.`);
				parentId = parent.parentId;
			}
		}
		const isExplicitDescendant = (child, ancestor) => {
			const seen = /* @__PURE__ */ new Set();
			let parentId = child.parentId;
			while (parentId) {
				if (parentId === ancestor.id) return true;
				if (seen.has(parentId)) throw new GroupSerializationError(`Cannot export group "${child.name}": its parent hierarchy contains a cycle.`);
				seen.add(parentId);
				const parent = allGroupsById.get(parentId);
				if (!parent) throw new GroupSerializationError(`Cannot export group "${child.name}": parent group ${parentId} does not exist.`);
				parentId = parent.parentId;
			}
			return false;
		};
		for (const child of groups) {
			if (!child.group.parentId) continue;
			const explicitParent = allGroupsById.get(child.group.parentId);
			if (!explicitParent) throw new GroupSerializationError(`Cannot export group "${child.group.name}": parent group ${child.group.parentId} does not exist.`);
			const parentIds = new Set(explicitParent.elementIds);
			if (![...child.globalMemberIds].every((id) => parentIds.has(id))) throw new GroupSerializationError(`Cannot export nested group "${child.group.name}": its parent "${explicitParent.name}" does not contain all of its members.`);
		}
		for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
			const a = groups[i];
			const b = groups[j];
			const intersection = [...a.memberIds].filter((id) => b.memberIds.has(id));
			if (intersection.length === 0) continue;
			if (isExplicitDescendant(a.group, b.group) || isExplicitDescendant(b.group, a.group)) continue;
			const aInsideB = a.globalMemberIds.size < b.globalMemberIds.size && [...a.globalMemberIds].every((id) => b.globalMemberIds.has(id));
			const bInsideA = b.globalMemberIds.size < a.globalMemberIds.size && [...b.globalMemberIds].every((id) => a.globalMemberIds.has(id));
			if (aInsideB || bInsideA) continue;
			const names = intersection.map((id) => this.elementName(id)).join(", ");
			throw new GroupSerializationError(`Cannot export groups "${a.group.name}" and "${b.group.name}": ${names} ${intersection.length === 1 ? "belongs" : "belong"} to both groups, but neither group is nested inside the other. Make the groups disjoint or one a strict subset of the other.`);
		}
		const parent = /* @__PURE__ */ new Map();
		for (const child of groups) {
			if (child.group.parentId) {
				const explicitParent = scopedById.get(child.group.parentId);
				if (explicitParent) {
					parent.set(child, explicitParent);
					continue;
				}
			}
			const candidates = groups.filter((candidate) => candidate !== child && child.globalMemberIds.size < candidate.globalMemberIds.size && [...child.globalMemberIds].every((id) => candidate.globalMemberIds.has(id))).sort((a, b) => a.globalMemberIds.size - b.globalMemberIds.size || a.order - b.order);
			if (candidates[0]) parent.set(child, candidates[0]);
		}
		for (const group of groups) {
			const p = parent.get(group);
			if (p) p.children.push(group);
		}
		for (const group of groups) group.children.sort((a, b) => a.order - b.order);
		for (const element of elements) {
			const memberships = groups.filter((group) => group.memberIds.has(element.id)).sort((a, b) => {
				if (isExplicitDescendant(a.group, b.group)) return -1;
				if (isExplicitDescendant(b.group, a.group)) return 1;
				return a.globalMemberIds.size - b.globalMemberIds.size || a.order - b.order;
			});
			if (memberships[0]) memberships[0].members.push(element);
		}
		return {
			ungrouped: elements.filter((element) => !groups.some((group) => group.memberIds.has(element.id))),
			roots: groups.filter((group) => !parent.has(group)).sort((a, b) => a.order - b.order),
			nested: parent.size > 0
		};
	}
	elementName(id) {
		for (const person of this.workspace.model.people) if (person.id === id) return `"${person.name}"`;
		for (const sys of this.workspace.model.softwareSystems) {
			if (sys.id === id) return `"${sys.name}"`;
			for (const container of sys.containers) {
				if (container.id === id) return `"${container.name}"`;
				const component = container.components.find((item) => item.id === id);
				if (component) return `"${component.name}"`;
			}
		}
		return `element ${id}`;
	}
	buildIdMaps() {
		const model = this.workspace.model;
		for (const person of model.people) this.registerElement(person.id);
		for (const sys of model.softwareSystems) {
			this.registerElement(sys.id);
			for (const container of sys.containers) {
				this.registerElement(container.id);
				for (const comp of container.components) this.registerElement(comp.id);
			}
		}
		for (const env of model.deploymentEnvironments ?? []) this.registerDeploymentNodes(env.deploymentNodes);
	}
	registerDeploymentNodes(nodes) {
		for (const node of nodes) {
			this.registerElement(node.id);
			for (const infra of node.infrastructureNodes) this.registerElement(infra.id);
			for (const inst of node.containerInstances) this.registerElement(inst.id);
			for (const inst of node.softwareSystemInstances) this.registerElement(inst.id);
			this.registerDeploymentNodes(node.children);
		}
	}
	usedVarNames = /* @__PURE__ */ new Set();
	registerElement(id) {
		this.allElementIds.add(id);
		const sanitized = id.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^([0-9])/, "e$1");
		let varName = sanitized || "element";
		if (this.usedVarNames.has(varName)) {
			let i = 2;
			while (this.usedVarNames.has(`${sanitized}_${i}`)) i++;
			varName = `${sanitized}_${i}`;
		}
		this.idToVar.set(id, varName);
		this.usedVarNames.add(varName);
	}
	indent() {
		return INDENT.repeat(this.depth);
	}
	emit(line) {
		if (line === "") this.lines.push("");
		else this.lines.push(this.indent() + line);
	}
	emitBlank() {
		if (this.lines.length > 0 && this.lines[this.lines.length - 1] !== "") this.lines.push("");
	}
	/**
	* Tags to emit for an element that has a `location`.
	*
	* Structurizr removed the `location` keyword; externality is now carried
	* by the `External` tag. c4hero keeps the field (it drives the UI and the
	* model), and the parser maps the tag back on import.
	*/
	locationAwareTags(el, defaults) {
		let tags = el.tags;
		if (el.location === "External" && !tags.includes("External")) tags = [...tags, "External"];
		else if (el.location !== void 0 && el.location !== "External" && tags.includes("External")) tags = tags.filter((t) => t !== "External");
		return this.getExtraTags(tags, defaults);
	}
	/**
	* Properties to emit for an element. `owner` and `status` are not
	* Structurizr keywords (the real parser rejects them inside an element
	* block), so they travel inside the `properties` block — `owner` under the
	* bare `owner` key, `status` under `c4hero.status`; the parser hoists both
	* back to their fields. Derived keys are emitted first and deliberately
	* win over a colliding user property (the collision is only reachable by
	* hand-writing a reserved key next to the legacy bare keyword), so
	* serialize → parse → serialize is byte-identical. `documents` follows the
	* same precedent but is indexed rather than scalar
	* (`c4hero.documents.<n>.path`/`.title`), so it can't be one of
	* `mergeDerivedProperties`'s scalar `[key, value]` pairs — its derived
	* keys are layered on afterwards, also winning over any colliding user
	* property.
	*
	* Before that layering, every existing `c4hero.documents.*` key is
	* stripped from the merged properties (`withoutDocumentProperties`),
	* regardless of index or completeness, and the whole namespace is
	* re-derived fresh from `el.documents`. This matters for a hand-written
	* DSL that leaves a non-hoisted "orphaned" entry behind — e.g.
	* `c4hero.documents.1.path` with no matching `.1.title` (an incomplete
	* entry `parseDocumentsFromProperties` correctly leaves in `rest`
	* instead of hoisting), or `c4hero.documents.2.*` orphaned by a gap at
	* index 1 (also left in `rest` per that function's documented
	* stop-at-first-gap behavior). Once the user edits `documents` through
	* the app (e.g. adds a new entry via the inspector), simply layering
	* freshly derived keys on top of the merged properties — as this used to
	* do — would either silently clobber an orphan whose index collides with
	* a newly derived one, or leave a stale orphan at a now-filled gap index
	* that silently re-hoists into a THIRD, never-added document on the next
	* parse. Both are confirmed bugs (code review finding m2). Clearing the
	* namespace first means an orphan present before such an edit is
	* deliberately NOT preserved — this is simpler and more predictable than
	* trying to merge/renumber stale indices alongside new ones, which would
	* still surprise the user about where a renumbered entry came from.
	*/
	elementProperties(el) {
		return {
			...withoutDocumentProperties(this.mergeDerivedProperties([["owner", el.owner], ["c4hero.status", el.status]], el.properties)),
			...documentsToProperties(el.documents)
		};
	}
	/**
	* Properties to emit for a relationship. `lineStyle` and `interactionStyle`
	* are not Structurizr keywords in a relationship body (the real parser
	* rejects them), so they travel as `c4hero.lineStyle` /
	* `c4hero.interactionStyle` properties, with the same derived-first,
	* derived-wins rules as elementProperties() — including the whole-
	* namespace `c4hero.documents.*` clear-and-replace described there.
	*/
	relationshipProperties(rel) {
		return {
			...withoutDocumentProperties(this.mergeDerivedProperties([["c4hero.lineStyle", rel.lineStyle], ["c4hero.interactionStyle", rel.interactionStyle]], rel.properties)),
			...documentsToProperties(rel.documents)
		};
	}
	/**
	* Merge derived (field-encoded) keys ahead of user properties. A reserved
	* key always occupies its leading slot — filled from the field when set
	* (deliberately winning over a colliding user property), else from a user
	* property with that key. The fixed position matters: parsing hoists a
	* valid reserved-key property onto its field and forgets where it sat in
	* the block, so only a position-independent emission order keeps
	* serialize → parse → serialize byte-identical. Null prototype so
	* `key in props` cannot match inherited names like `constructor`.
	*/
	mergeDerivedProperties(derived, user) {
		const props = Object.create(null);
		for (const [key, fieldVal] of derived) if (fieldVal) props[key] = fieldVal;
		else if (Object.prototype.hasOwnProperty.call(user, key)) props[key] = user[key];
		for (const [key, val] of Object.entries(user)) if (!(key in props)) props[key] = val;
		return props;
	}
	/** Emit a `properties { }` block for any user-defined key/value pairs. */
	serializeProperties(props) {
		const entries = Object.entries(props);
		if (entries.length === 0) return;
		this.emit("properties {");
		this.depth++;
		for (const [key, val] of entries) this.emit(`"${this.escapeString(key)}" "${this.escapeString(val)}"`);
		this.depth--;
		this.emit("}");
	}
	serialize() {
		const ws = this.workspace;
		const parts = [];
		parts.push("workspace");
		if (ws.name) parts.push(`"${this.escapeString(ws.name)}"`);
		if (ws.description) parts.push(`"${this.escapeString(ws.description)}"`);
		this.emit(parts.join(" ") + " {");
		this.depth++;
		if (ws.impliedRelationships) this.emit("!impliedRelationships true");
		this.emitBlank();
		this.serializeModel();
		this.emitBlank();
		this.serializeViews();
		if (ws.scope && ws.scope !== "none") {
			this.emitBlank();
			this.emit("configuration {");
			this.depth++;
			this.emit(`scope ${ws.scope}`);
			this.depth--;
			this.emit("}");
		}
		this.emitBlank();
		this.depth--;
		this.emit("}");
		while (this.lines.length > 0 && this.lines[this.lines.length - 1] === "") this.lines.pop();
		this.lines.push("");
		return this.lines.join("\n");
	}
	serializeModel() {
		this.emit("model {");
		this.depth++;
		const model = this.workspace.model;
		if (this.hasNestedGroups) {
			this.serializeProperties({ "structurizr.groupSeparator": GROUP_SEPARATOR });
			this.emitBlank();
		}
		this.serializeGroupScope(this.topLevelGroups, (element) => this.serializeModelElement(element));
		for (const env of model.deploymentEnvironments ?? []) {
			this.emitBlank();
			this.serializeDeploymentEnvironment(env);
		}
		if (model.relationships.length > 0) {
			this.emitBlank();
			for (const rel of model.relationships) this.serializeRelationship(rel);
		}
		this.depth--;
		this.emit("}");
	}
	serializeGroupScope(scope, serializeElement) {
		let emitted = false;
		for (const group of scope.roots) {
			if (emitted) this.emitBlank();
			this.serializeGroup(group, serializeElement);
			emitted = true;
		}
		if (emitted && scope.ungrouped.length > 0) this.emitBlank();
		for (const element of scope.ungrouped) {
			serializeElement(element);
			emitted = true;
		}
	}
	serializeGroup(scoped, serializeElement) {
		this.emit(`group "${this.escapeString(scoped.group.name)}" {`);
		this.depth++;
		let emitted = false;
		for (const child of scoped.children) {
			if (emitted) this.emitBlank();
			this.serializeGroup(child, serializeElement);
			emitted = true;
		}
		if (emitted && scoped.members.length > 0) this.emitBlank();
		for (const element of scoped.members) {
			serializeElement(element);
			emitted = true;
		}
		this.depth--;
		this.emit("}");
	}
	serializeModelElement(element) {
		if (element.type === "person") this.serializePerson(element);
		else this.serializeSoftwareSystem(element);
	}
	serializeDeploymentEnvironment(env) {
		this.emit(`deploymentEnvironment "${this.escapeString(env.name)}" {`);
		this.depth++;
		for (let i = 0; i < env.deploymentNodes.length; i++) {
			if (i > 0) this.emitBlank();
			this.serializeDeploymentNode(env.deploymentNodes[i]);
		}
		this.depth--;
		this.emit("}");
	}
	serializeDeploymentNode(node) {
		const varName = this.idToVar.get(node.id);
		const extraTags = this.getExtraTags(node.tags, ["Element", "Deployment Node"]);
		const hasProperties = Object.keys(node.properties).length > 0;
		const parts = [];
		parts.push("deploymentNode");
		parts.push(`"${this.escapeString(node.name)}"`);
		if (node.description || node.technology || extraTags) parts.push(`"${this.escapeString(node.description ?? "")}"`);
		if (node.technology || extraTags) parts.push(`"${this.escapeString(node.technology ?? "")}"`);
		if (extraTags) parts.push(`"${extraTags}"`);
		const prefix = varName ? `${varName} = ` : "";
		this.emit(`${prefix}${parts.join(" ")} {`);
		this.depth++;
		if (node.instances !== void 0) this.emit(`instances ${/^\d+$/.test(node.instances) ? node.instances : `"${this.escapeString(node.instances)}"`}`);
		if (node.url) this.emit(`url "${this.escapeString(node.url)}"`);
		if (hasProperties) this.serializeProperties(node.properties);
		for (const infra of node.infrastructureNodes) this.serializeInfrastructureNode(infra);
		for (const inst of node.softwareSystemInstances) this.serializeElementInstance("softwareSystemInstance", inst.id, inst.softwareSystemId, inst.tags, ["Software System Instance"], inst.url, inst.properties);
		for (const inst of node.containerInstances) this.serializeElementInstance("containerInstance", inst.id, inst.containerId, inst.tags, ["Container Instance"], inst.url, inst.properties);
		for (const child of node.children) this.serializeDeploymentNode(child);
		this.depth--;
		this.emit("}");
	}
	serializeInfrastructureNode(infra) {
		const varName = this.idToVar.get(infra.id);
		const extraTags = this.getExtraTags(infra.tags, ["Element", "Infrastructure Node"]);
		const hasProperties = Object.keys(infra.properties).length > 0;
		const hasBlock = !!infra.url || hasProperties;
		const parts = [];
		parts.push("infrastructureNode");
		parts.push(`"${this.escapeString(infra.name)}"`);
		if (infra.description || infra.technology || extraTags) parts.push(`"${this.escapeString(infra.description ?? "")}"`);
		if (infra.technology || extraTags) parts.push(`"${this.escapeString(infra.technology ?? "")}"`);
		if (extraTags) parts.push(`"${extraTags}"`);
		const prefix = varName ? `${varName} = ` : "";
		if (hasBlock) {
			this.emit(`${prefix}${parts.join(" ")} {`);
			this.depth++;
			if (infra.url) this.emit(`url "${this.escapeString(infra.url)}"`);
			if (hasProperties) this.serializeProperties(infra.properties);
			this.depth--;
			this.emit("}");
		} else this.emit(`${prefix}${parts.join(" ")}`);
	}
	serializeElementInstance(keyword, id, referencedId, tags, defaultTags, url, properties) {
		const varName = this.idToVar.get(id);
		const ref = this.idToVar.get(referencedId) ?? referencedId;
		const extraTags = this.getExtraTags(tags, defaultTags);
		const hasProperties = Object.keys(properties).length > 0;
		const hasBlock = !!url || hasProperties;
		const parts = [keyword, ref];
		if (extraTags) parts.push(`"${extraTags}"`);
		const prefix = varName ? `${varName} = ` : "";
		if (hasBlock) {
			this.emit(`${prefix}${parts.join(" ")} {`);
			this.depth++;
			if (url) this.emit(`url "${this.escapeString(url)}"`);
			if (hasProperties) this.serializeProperties(properties);
			this.depth--;
			this.emit("}");
		} else this.emit(`${prefix}${parts.join(" ")}`);
	}
	serializePerson(person) {
		const varName = this.idToVar.get(person.id);
		const extraTags = this.locationAwareTags(person, ["Element", "Person"]);
		const props = this.elementProperties(person);
		const hasProperties = Object.keys(props).length > 0;
		const hasBlock = !!person.url || hasProperties;
		const parts = [];
		parts.push("person");
		parts.push(`"${this.escapeString(person.name)}"`);
		if (person.description || extraTags) parts.push(`"${this.escapeString(person.description ?? "")}"`);
		if (extraTags) parts.push(`"${extraTags}"`);
		const prefix = varName ? `${varName} = ` : "";
		if (hasBlock) {
			this.emit(`${prefix}${parts.join(" ")} {`);
			this.depth++;
			if (person.url) this.emit(`url "${this.escapeString(person.url)}"`);
			if (hasProperties) this.serializeProperties(props);
			this.depth--;
			this.emit("}");
		} else this.emit(`${prefix}${parts.join(" ")}`);
	}
	serializeSoftwareSystem(sys) {
		const varName = this.idToVar.get(sys.id);
		const extraTags = this.locationAwareTags(sys, ["Element", "Software System"]);
		const props = this.elementProperties(sys);
		const hasProperties = Object.keys(props).length > 0;
		const hasBody = sys.containers.length > 0 || !!sys.url || hasProperties;
		const parts = [];
		parts.push("softwareSystem");
		parts.push(`"${this.escapeString(sys.name)}"`);
		if (sys.description || extraTags) parts.push(`"${this.escapeString(sys.description ?? "")}"`);
		if (extraTags) parts.push(`"${extraTags}"`);
		const prefix = varName ? `${varName} = ` : "";
		if (hasBody) {
			this.emit(`${prefix}${parts.join(" ")} {`);
			this.depth++;
			if (sys.url) this.emit(`url "${this.escapeString(sys.url)}"`);
			if (hasProperties) this.serializeProperties(props);
			const scope = this.containerGroups.get(sys.id);
			if (scope) this.serializeGroupScope(scope, (container) => this.serializeContainer(container));
			this.depth--;
			this.emit("}");
		} else this.emit(`${prefix}${parts.join(" ")}`);
	}
	serializeContainer(container) {
		const varName = this.idToVar.get(container.id);
		const extraTags = this.getExtraTags(container.tags, ["Element", "Container"]);
		const props = this.elementProperties(container);
		const hasProperties = Object.keys(props).length > 0;
		const hasBody = container.components.length > 0 || !!container.url || hasProperties;
		const parts = [];
		parts.push("container");
		parts.push(`"${this.escapeString(container.name)}"`);
		if (container.description || container.technology || extraTags) parts.push(`"${this.escapeString(container.description ?? "")}"`);
		if (container.technology || extraTags) parts.push(`"${this.escapeString(container.technology ?? "")}"`);
		if (extraTags) parts.push(`"${extraTags}"`);
		const prefix = varName ? `${varName} = ` : "";
		if (hasBody) {
			this.emit(`${prefix}${parts.join(" ")} {`);
			this.depth++;
			if (container.url) this.emit(`url "${this.escapeString(container.url)}"`);
			if (hasProperties) this.serializeProperties(props);
			const scope = this.componentGroups.get(container.id);
			if (scope) this.serializeGroupScope(scope, (comp) => this.serializeComponent(comp));
			this.depth--;
			this.emit("}");
		} else this.emit(`${prefix}${parts.join(" ")}`);
	}
	serializeComponent(comp) {
		const varName = this.idToVar.get(comp.id);
		const extraTags = this.getExtraTags(comp.tags, ["Element", "Component"]);
		const props = this.elementProperties(comp);
		const hasProperties = Object.keys(props).length > 0;
		const hasBlock = !!comp.url || hasProperties;
		const parts = [];
		parts.push("component");
		parts.push(`"${this.escapeString(comp.name)}"`);
		if (comp.description || comp.technology || extraTags) parts.push(`"${this.escapeString(comp.description ?? "")}"`);
		if (comp.technology || extraTags) parts.push(`"${this.escapeString(comp.technology ?? "")}"`);
		if (extraTags) parts.push(`"${extraTags}"`);
		const prefix = varName ? `${varName} = ` : "";
		if (hasBlock) {
			this.emit(`${prefix}${parts.join(" ")} {`);
			this.depth++;
			if (comp.url) this.emit(`url "${this.escapeString(comp.url)}"`);
			if (hasProperties) this.serializeProperties(props);
			this.depth--;
			this.emit("}");
		} else this.emit(`${prefix}${parts.join(" ")}`);
	}
	serializeRelationship(rel) {
		const sourceRef = this.idToVar.get(rel.sourceId) ?? rel.sourceId;
		const destRef = this.idToVar.get(rel.destinationId) ?? rel.destinationId;
		const parts = [];
		parts.push(`${sourceRef} -> ${destRef}`);
		if (rel.description || rel.technology) parts.push(`"${this.escapeString(rel.description ?? "")}"`);
		if (rel.technology) parts.push(`"${this.escapeString(rel.technology)}"`);
		const extraTags = this.getExtraTags(rel.tags, ["Relationship"]);
		const props = this.relationshipProperties(rel);
		const hasProperties = Object.keys(props).length > 0;
		if (!!rel.url || hasProperties) {
			this.emit(`${parts.join(" ")} {`);
			this.depth++;
			if (rel.url) this.emit(`url "${this.escapeString(rel.url)}"`);
			if (hasProperties) this.serializeProperties(props);
			if (extraTags) this.emit(`tags "${extraTags}"`);
			this.depth--;
			this.emit("}");
		} else if (extraTags) {
			const inline = [
				`${sourceRef} -> ${destRef}`,
				`"${this.escapeString(rel.description ?? "")}"`,
				`"${this.escapeString(rel.technology ?? "")}"`,
				`"${extraTags}"`
			];
			this.emit(inline.join(" "));
		} else this.emit(parts.join(" "));
	}
	serializeViews() {
		this.emit("views {");
		this.depth++;
		const views = this.workspace.views;
		let needsBlank = false;
		for (const view of views.systemLandscapeViews) {
			if (view.autoView) continue;
			if (needsBlank) this.emitBlank();
			this.serializeView(view);
			needsBlank = true;
		}
		for (const view of views.systemContextViews) {
			if (view.autoView) continue;
			if (needsBlank) this.emitBlank();
			this.serializeView(view);
			needsBlank = true;
		}
		for (const view of views.containerViews) {
			if (view.autoView) continue;
			if (needsBlank) this.emitBlank();
			this.serializeView(view);
			needsBlank = true;
		}
		for (const view of views.componentViews) {
			if (view.autoView) continue;
			if (needsBlank) this.emitBlank();
			this.serializeView(view);
			needsBlank = true;
		}
		for (const view of views.dynamicViews ?? []) {
			if (view.autoView) continue;
			if (needsBlank) this.emitBlank();
			this.serializeDynamicView(view);
			needsBlank = true;
		}
		for (const view of views.deploymentViews ?? []) {
			if (view.autoView) continue;
			if (needsBlank) this.emitBlank();
			this.serializeView(view);
			needsBlank = true;
		}
		const styles = this.emittableStyles(views.configuration);
		if (styles.elements.length > 0 || styles.relationships.length > 0) {
			if (needsBlank) this.emitBlank();
			this.serializeStyles(styles);
			needsBlank = true;
		}
		if (views.configuration.themes && views.configuration.themes.length > 0) {
			if (needsBlank) this.emitBlank();
			this.emit(`themes ${views.configuration.themes.map((t) => `"${this.escapeString(t)}"`).join(" ")}`);
		}
		this.depth--;
		this.emit("}");
	}
	serializeView(view) {
		const parts = [];
		if (view.type === "systemLandscape") parts.push("systemLandscape");
		else if (view.type === "systemContext") {
			parts.push("systemContext");
			if (view.softwareSystemId) {
				const ref = this.idToVar.get(view.softwareSystemId) ?? view.softwareSystemId;
				parts.push(ref);
			}
		} else if (view.type === "container") {
			parts.push("container");
			if (view.softwareSystemId) {
				const ref = this.idToVar.get(view.softwareSystemId) ?? view.softwareSystemId;
				parts.push(ref);
			}
		} else if (view.type === "component") {
			parts.push("component");
			if (view.containerId) {
				const ref = this.idToVar.get(view.containerId) ?? view.containerId;
				parts.push(ref);
			}
		} else if (view.type === "deployment") {
			parts.push("deployment");
			if (view.softwareSystemId) parts.push(this.idToVar.get(view.softwareSystemId) ?? view.softwareSystemId);
			else parts.push("*");
			parts.push(`"${this.escapeString(view.environment ?? "")}"`);
		}
		if (view.key && !view.autoKey) parts.push(`"${this.escapeString(view.key)}"`);
		this.emit(`${parts.join(" ")} {`);
		this.depth++;
		if (view.title) this.emit(`title "${this.escapeString(view.title)}"`);
		if (view.description) this.emit(`description "${this.escapeString(view.description)}"`);
		if (view.elements.some((e) => e.id === "*")) this.emit("include *");
		else if (view.elements.length > 0) for (const el of view.elements) {
			const ref = this.idToVar.get(el.id) ?? el.id;
			this.emit(`include ${ref}`);
		}
		if (view.autoLayout) this.serializeAutoLayout(view.autoLayout);
		this.depth--;
		this.emit("}");
	}
	/** Dynamic views serialize as an ordered list of interaction steps
	*  (`source -> destination "description"`), not as include lines. */
	serializeDynamicView(view) {
		const parts = ["dynamic"];
		const scopeId = view.softwareSystemId ?? view.containerId;
		if (scopeId) parts.push(this.idToVar.get(scopeId) ?? scopeId);
		else parts.push("*");
		if (view.key && !view.autoKey) parts.push(`"${this.escapeString(view.key)}"`);
		this.emit(`${parts.join(" ")} {`);
		this.depth++;
		if (view.title) this.emit(`title "${this.escapeString(view.title)}"`);
		if (view.description) this.emit(`description "${this.escapeString(view.description)}"`);
		const relById = new Map(this.workspace.model.relationships.map((r) => [r.id, r]));
		const steps = view.relationships.filter((step) => relById.has(step.id));
		const emitStep = (step) => {
			const rel = relById.get(step.id);
			const fromId = step.sourceId ?? (step.response ? rel.destinationId : rel.sourceId);
			const toId = step.destinationId ?? (step.response ? rel.sourceId : rel.destinationId);
			const sourceRef = this.idToVar.get(fromId) ?? fromId;
			const destRef = this.idToVar.get(toId) ?? toId;
			const description = step.description ?? rel.description;
			const line = description ? `${sourceRef} -> ${destRef} "${this.escapeString(description)}"` : `${sourceRef} -> ${destRef}`;
			this.emit(line);
		};
		const groups = this.parallelGroupsFor(steps);
		if (groups) for (const group of groups) if (group.parallel) {
			this.emit("{");
			this.depth++;
			group.steps.forEach(emitStep);
			this.depth--;
			this.emit("}");
		} else group.steps.forEach(emitStep);
		else steps.forEach(emitStep);
		if (view.autoLayout) this.serializeAutoLayout(view.autoLayout);
		this.depth--;
		this.emit("}");
	}
	/** Partition dynamic-view steps into plain sequences and parallel brace
	*  groups whose reparse reproduces the stored orders exactly.
	*
	*  Orders are grouped into maximal runs that increment by one. A run is
	*  plain when the next run continues where it ended; when the next run
	*  restarts INSIDE it, the run splits — the prefix before the restart
	*  point stays plain and the rest becomes a braced branch (whose close
	*  reverts the counter, which is what lets the next run restart there).
	*  Returns null when no split assignment reproduces the sequence (only
	*  deeply nested parallel groups produce such orders) — the caller then
	*  emits flat lines, whose orders regenerate sequentially on reparse. */
	parallelGroupsFor(steps) {
		const orders = steps.map((step) => {
			const n = Number(step.order);
			return Number.isInteger(n) && n > 0 ? n : null;
		});
		if (orders.some((o) => o === null)) return steps.length === 0 ? [] : null;
		const ints = orders;
		const runs = [];
		for (let i = 0; i < ints.length;) {
			let j = i;
			while (j + 1 < ints.length && ints[j + 1] === ints[j] + 1) j++;
			runs.push({
				from: i,
				to: j,
				start: ints[i],
				end: ints[j]
			});
			i = j + 1;
		}
		const groups = [];
		let counter = 0;
		for (let r = 0; r < runs.length; r++) {
			const run = runs[r];
			if (run.start !== counter + 1) return null;
			const next = runs[r + 1];
			if (next === void 0 || next.start === run.end + 1) {
				groups.push({
					parallel: false,
					steps: steps.slice(run.from, run.to + 1)
				});
				counter = run.end;
			} else if (next.start >= run.start && next.start <= run.end) {
				const splitAt = run.from + (next.start - run.start);
				if (splitAt > run.from) groups.push({
					parallel: false,
					steps: steps.slice(run.from, splitAt)
				});
				groups.push({
					parallel: true,
					steps: steps.slice(splitAt, run.to + 1)
				});
				counter = next.start - 1;
			} else return null;
		}
		return groups;
	}
	serializeAutoLayout(layout) {
		const parts = ["autoLayout"];
		if (layout.direction !== "TB" || layout.rankSeparation !== void 0 || layout.nodeSeparation !== void 0) parts.push(layout.direction.toLowerCase());
		if (layout.rankSeparation !== void 0) parts.push(String(layout.rankSeparation));
		if (layout.nodeSeparation !== void 0) parts.push(String(layout.nodeSeparation));
		this.emit(parts.join(" "));
	}
	/**
	* Styles whose tag survives sanitization, paired with the sanitized
	* selector so it is computed exactly once. A selector that sanitizes to
	* nothing (e.g. a tag of only commas) would emit `element "" {`, which
	* the real parser rejects ("A tag must be specified") — skip it instead.
	*/
	emittableStyles(config) {
		const sanitize = (styles) => styles.map((style) => ({
			style,
			tag: this.sanitizeTag(style.tag)
		})).filter((s) => s.tag.length > 0);
		return {
			elements: sanitize(config.styles.elements),
			relationships: sanitize(config.styles.relationships)
		};
	}
	serializeStyles(styles) {
		this.emit("styles {");
		this.depth++;
		let needsBlank = false;
		for (const { style, tag } of styles.elements) {
			if (needsBlank) this.emitBlank();
			this.serializeElementStyle(style, tag);
			needsBlank = true;
		}
		for (const { style, tag } of styles.relationships) {
			if (needsBlank) this.emitBlank();
			this.serializeRelationshipStyle(style, tag);
			needsBlank = true;
		}
		this.depth--;
		this.emit("}");
	}
	serializeElementStyle(style, tag) {
		this.emit(`element "${tag}" {`);
		this.depth++;
		if (style.background !== void 0) this.emit(`background ${style.background}`);
		if (style.color !== void 0) this.emit(`color ${style.color}`);
		if (style.shape !== void 0) this.emit(`shape ${style.shape}`);
		if (style.fontSize !== void 0) this.emit(`fontSize ${style.fontSize}`);
		if (style.border !== void 0) this.emit(`border ${style.border}`);
		if (style.opacity !== void 0) this.emit(`opacity ${style.opacity}`);
		if (style.icon !== void 0) this.emit(`icon "${this.escapeString(style.icon)}"`);
		if (style.stroke !== void 0) this.emit(`stroke ${style.stroke}`);
		if (style.strokeWidth !== void 0) this.emit(`strokeWidth ${style.strokeWidth}`);
		this.depth--;
		this.emit("}");
	}
	serializeRelationshipStyle(style, tag) {
		this.emit(`relationship "${tag}" {`);
		this.depth++;
		if (style.color !== void 0) this.emit(`color ${style.color}`);
		if (style.thickness !== void 0) this.emit(`thickness ${style.thickness}`);
		if (style.dashed !== void 0) this.emit(`dashed ${style.dashed}`);
		if (style.fontSize !== void 0) this.emit(`fontSize ${style.fontSize}`);
		if (style.opacity !== void 0) this.emit(`opacity ${style.opacity}`);
		this.depth--;
		this.emit("}");
	}
	/**
	* Encode a value as the body of a Structurizr double-quoted string.
	*
	* Structurizr's tokenizer (verified against structurizr-java 5.0.2)
	* recognises exactly two escapes inside a quoted string: `\"` and `\n`.
	* Every other backslash is kept verbatim — `\\` is NOT collapsed to a
	* single backslash the way JSON does it, and after a missed escape the
	* tokenizer consumes only the backslash, re-examining the next char.
	* Emitting JSON-style escapes therefore corrupts the value rather than
	* protecting it.
	*
	* A backslash before a quote IS representable: the quote's own `\"`
	* escape leaves the backslash a literal miss, so raw `a\"b` emits as
	* `a\\"b` and decodes back exactly. Because there is no way to escape a
	* backslash itself, it stays unrepresentable in two positions where it
	* would be read as (part of) an escape:
	*
	*   - immediately before an `n` (any run length — `\\n` still decodes
	*     as literal-backslash + newline), and
	*   - at the very end of the value, where it escapes the closing quote
	*     and swallows the rest of the line ("Too many tokens").
	*
	* Those backslashes are dropped. Everything else round-trips exactly.
	* The drop is silent for now; surfacing a save-time warning is TEA-169.
	*/
	escapeString(s) {
		return s.replace(/\\+(?=n)/g, "").replace(/\\+$/, "").replace(/"/g, "\\\"").replace(/\r\n|\r|\n/g, "\\n");
	}
	/**
	* Structurizr splits a tag string on commas, so a tag containing a comma
	* would silently become two tags. Drop commas rather than corrupt the set
	* (warning the user about the rename is TEA-169). Values still go through
	* escapeString like every other quoted string. Element tags and style tag
	* selectors both use this, so a style keyed on "has,comma" stays attached
	* to the element's renamed "hascomma" tag.
	*/
	sanitizeTag(tag) {
		return this.escapeString(tag.replace(/,/g, ""));
	}
	getExtraTags(tags, defaults) {
		const extra = tags.filter((t) => !defaults.includes(t)).map((t) => this.sanitizeTag(t)).filter((t) => t.length > 0);
		if (extra.length === 0) return void 0;
		return extra.join(",");
	}
};
//#endregion
//#region src/lib/dsl/auto-views.ts
/** Generate sensible default views for a workspace that has none.
*
*  Mirrors the convention Structurizr CLI uses when --views isn't specified:
*  one SystemLandscape view, one SystemContext view per software system, one
*  Container view per system that has containers, and one Component view per
*  container that has components. Element population follows the same rules as
*  the workspace store's `addView` action.
*
*  Generated views are flagged with `autoView: true` so the serializer can
*  skip them and the source DSL roundtrips byte-identical. */
function generateDefaultViews(ws) {
	if (ws.views.systemLandscapeViews.length > 0 || ws.views.systemContextViews.length > 0 || ws.views.containerViews.length > 0 || ws.views.componentViews.length > 0 || (ws.views.dynamicViews?.length ?? 0) > 0 || (ws.views.deploymentViews?.length ?? 0) > 0) return;
	const allElements = collectAllElementsById(ws);
	const findElement = (id) => allElements.get(id);
	const usedKeys = /* @__PURE__ */ new Set();
	const claim = (base) => {
		let candidate = base;
		let suffix = 2;
		while (usedKeys.has(candidate)) candidate = `${base}-${suffix++}`;
		usedKeys.add(candidate);
		return candidate;
	};
	if (ws.model.people.length > 0 || ws.model.softwareSystems.length > 0) {
		const elements = [...ws.model.people.map((p) => ({ id: p.id })), ...ws.model.softwareSystems.map((s) => ({ id: s.id }))];
		ws.views.systemLandscapeViews.push({
			type: "systemLandscape",
			key: claim("SystemLandscape"),
			autoView: true,
			autoKey: true,
			title: "System Landscape",
			elements,
			relationships: relationshipsBetween(ws, elements),
			autoLayout: { direction: "TB" }
		});
	}
	for (const sys of ws.model.softwareSystems) {
		const relatedIds = relationshipNeighbours(ws, [sys.id]);
		const elements = [
			{ id: sys.id },
			...ws.model.people.filter((p) => relatedIds.has(p.id)).map((p) => ({ id: p.id })),
			...ws.model.softwareSystems.filter((s) => s.id !== sys.id && relatedIds.has(s.id)).map((s) => ({ id: s.id }))
		];
		ws.views.systemContextViews.push({
			type: "systemContext",
			key: claim(`SystemContext-${sys.id}`),
			autoView: true,
			autoKey: true,
			title: `${sys.name} - System Context`,
			softwareSystemId: sys.id,
			elements,
			relationships: relationshipsBetween(ws, elements),
			autoLayout: { direction: "TB" }
		});
	}
	for (const sys of ws.model.softwareSystems) {
		if (sys.containers.length === 0) continue;
		const relatedIds = relationshipNeighbours(ws, sys.containers.map((c) => c.id));
		const elements = [
			...sys.containers.map((c) => ({ id: c.id })),
			...ws.model.people.filter((p) => relatedIds.has(p.id)).map((p) => ({ id: p.id })),
			...ws.model.softwareSystems.filter((s) => s.id !== sys.id && relatedIds.has(s.id)).map((s) => ({ id: s.id }))
		];
		ws.views.containerViews.push({
			type: "container",
			key: claim(`Containers-${sys.id}`),
			autoView: true,
			autoKey: true,
			title: `${sys.name} - Containers`,
			softwareSystemId: sys.id,
			elements,
			relationships: relationshipsBetween(ws, elements),
			autoLayout: { direction: "TB" }
		});
	}
	for (const sys of ws.model.softwareSystems) for (const container of sys.containers) {
		if (container.components.length === 0) continue;
		const relatedIds = relationshipNeighbours(ws, container.components.map((c) => c.id));
		const elements = [...container.components.map((c) => ({ id: c.id })), ...Array.from(relatedIds).filter((id) => findElement(id) !== void 0).map((id) => ({ id }))];
		ws.views.componentViews.push({
			type: "component",
			key: claim(`Components-${container.id}`),
			autoView: true,
			autoKey: true,
			title: `${container.name} - Components`,
			containerId: container.id,
			elements,
			relationships: relationshipsBetween(ws, elements),
			autoLayout: { direction: "TB" }
		});
	}
}
function collectAllElementsById(ws) {
	const map = /* @__PURE__ */ new Map();
	for (const p of ws.model.people) map.set(p.id, p);
	for (const s of ws.model.softwareSystems) {
		map.set(s.id, s);
		for (const c of s.containers) {
			map.set(c.id, c);
			for (const comp of c.components) map.set(comp.id, comp);
		}
	}
	return map;
}
function relationshipNeighbours(ws, ids) {
	const idSet = new Set(ids);
	const neighbours = /* @__PURE__ */ new Set();
	for (const r of ws.model.relationships) {
		if (idSet.has(r.sourceId)) neighbours.add(r.destinationId);
		if (idSet.has(r.destinationId)) neighbours.add(r.sourceId);
	}
	return neighbours;
}
function relationshipsBetween(ws, elements) {
	const idSet = new Set(elements.map((e) => e.id));
	return ws.model.relationships.filter((r) => idSet.has(r.sourceId) && idSet.has(r.destinationId)).map((r) => ({ id: r.id }));
}
//#endregion
//#region src/lib/dsl/index.ts
/**
* Parse a Structurizr DSL string into a Workspace model.
*
* Returns the parsed workspace and any errors encountered.
* Parsing is lenient — it returns as much of the model as it can
* even when errors are present.
*/
function parseDSL(input) {
	const result = parse(input);
	generateDefaultViews(result.workspace);
	return result;
}
/**
* Serialize a Workspace model back to Structurizr DSL text.
*
* Produces clean, idiomatic DSL with 4-space indentation,
* blank lines between sections, and proper formatting.
*/
function serializeDSL(workspace) {
	return serialize(workspace);
}
//#endregion
//#region src/lib/logger.ts
var LEVEL_PRIORITY = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3
};
var minLevel = "warn";
var transports = [];
/** Per-session correlation ID for grouping a user's events in external transports. */
var sessionId = (() => {
	try {
		const g = globalThis;
		if (g.crypto?.randomUUID) return g.crypto.randomUUID();
		if (g.crypto?.getRandomValues) {
			const bytes = /* @__PURE__ */ new Uint8Array(8);
			g.crypto.getRandomValues(bytes);
			return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
		}
	} catch {}
	return Math.random().toString(36).slice(2, 18);
})();
function consoleTransport(entry) {
	const prefix = `[c4hero][${entry.component}]`;
	const consoleFn = entry.level === "error" ? console.error : entry.level === "warn" ? console.warn : entry.level === "info" ? console.info : console.debug;
	if (entry.data !== void 0) consoleFn(prefix, entry.message, entry.data);
	else consoleFn(prefix, entry.message);
}
function emit(entry) {
	if (LEVEL_PRIORITY[entry.level] < LEVEL_PRIORITY[minLevel]) return;
	consoleTransport(entry);
	for (const transport of transports) try {
		transport(entry);
	} catch {}
}
/** Create a namespaced logger. The `component` string is included in every log entry
*  so you can filter by source in the console or in your transport. */
function createLogger(component) {
	function log(level, message, data) {
		emit({
			level,
			component,
			message,
			data,
			timestamp: (/* @__PURE__ */ new Date()).toISOString(),
			sessionId
		});
	}
	return {
		debug: (message, data) => log("debug", message, data),
		info: (message, data) => log("info", message, data),
		warn: (message, data) => log("warn", message, data),
		error: (message, data) => log("error", message, data)
	};
}
//#endregion
//#region src/lib/guards.ts
function isRecord(value) {
	return !!value && typeof value === "object" && !Array.isArray(value);
}
function isFiniteNumber(value) {
	return typeof value === "number" && Number.isFinite(value);
}
function isStringArray$1(value) {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function isRecordOf(value, guard) {
	return isRecord(value) && Object.values(value).every(guard);
}
//#endregion
//#region src/lib/filenames.ts
/** Sanitize a filename by removing path separators and dangerous characters. */
function sanitizeFilename(name) {
	const illegalChars = /* @__PURE__ */ new Set("/\\:*?\"<>|");
	const cleaned = Array.from(name.trim(), (char) => {
		const code = char.charCodeAt(0);
		return code <= 31 || code === 127 || illegalChars.has(char) ? "_" : char;
	}).join("").replace(/^\.+/, "_").replace(/[. ]+$/, "").slice(0, 180);
	if (!cleaned || cleaned === "_") return "download";
	if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(cleaned)) return `_${cleaned}`;
	return cleaned;
}
//#endregion
//#region src/lib/sidecarName.ts
function sidecarName(dslName) {
	const safeBaseName = sanitizeFilename(dslName.replace(/\.dsl$/i, ""));
	return `${safeBaseName === "download" ? "workspace" : safeBaseName}.c4hero.json`;
}
//#endregion
//#region src/lib/sidecar.ts
var VALID_STATUSES = /* @__PURE__ */ new Set([
	"Live",
	"Planned",
	"Deprecated",
	"Removed"
]);
var VALID_LINE_STYLES = /* @__PURE__ */ new Set([
	"Curved",
	"Straight",
	"Orthogonal"
]);
function isValidStatus(v) {
	return typeof v === "string" && VALID_STATUSES.has(v);
}
function isValidLineStyle(v) {
	return typeof v === "string" && VALID_LINE_STYLES.has(v);
}
var log$1 = createLogger("sidecar");
function isSidecarElement(value) {
	if (!isRecord(value)) return false;
	if ("status" in value && value.status !== void 0 && !isValidStatus(value.status)) return false;
	if ("owner" in value && value.owner !== void 0 && typeof value.owner !== "string") return false;
	return true;
}
function isSidecarRelationship(value) {
	if (!isRecord(value)) return false;
	if ("lineStyle" in value && value.lineStyle !== void 0 && !isValidLineStyle(value.lineStyle)) return false;
	return true;
}
function isSidecarViewElement(value) {
	if (!isRecord(value)) return false;
	if ("pinned" in value && value.pinned !== void 0 && typeof value.pinned !== "boolean") return false;
	if ("locked" in value && value.locked !== void 0 && typeof value.locked !== "boolean") return false;
	if ("x" in value && value.x !== void 0 && !isFiniteNumber(value.x)) return false;
	if ("y" in value && value.y !== void 0 && !isFiniteNumber(value.y)) return false;
	return true;
}
function isSidecarView(value) {
	if (!isRecord(value)) return false;
	if ("locked" in value && value.locked !== void 0 && typeof value.locked !== "boolean") return false;
	if ("elements" in value && value.elements !== void 0 && !isRecordOf(value.elements, isSidecarViewElement)) return false;
	return true;
}
function isSidecarData(value) {
	if (!isRecord(value) || value.version !== 1) return false;
	if ("elements" in value && value.elements !== void 0 && !isRecordOf(value.elements, isSidecarElement)) return false;
	if ("relationships" in value && value.relationships !== void 0 && !isRecordOf(value.relationships, isSidecarRelationship)) return false;
	if ("views" in value && value.views !== void 0 && !isRecordOf(value.views, isSidecarView)) return false;
	return true;
}
function extractSidecar(workspace) {
	const sidecar = { version: 1 };
	let hasData = false;
	const views = {};
	for (const view of allViewsOf(workspace)) {
		const viewElements = {};
		for (const el of view.elements) if (el.pinned || el.locked) {
			const entry = {};
			if (el.pinned) entry.pinned = true;
			if (el.locked) entry.locked = true;
			if (el.x !== void 0) entry.x = el.x;
			if (el.y !== void 0) entry.y = el.y;
			viewElements[el.id] = entry;
			hasData = true;
		}
		const entry = {};
		if (view.locked) {
			entry.locked = true;
			hasData = true;
		}
		if (Object.keys(viewElements).length > 0) entry.elements = viewElements;
		if (entry.locked || entry.elements) views[view.key] = entry;
	}
	if (Object.keys(views).length > 0) sidecar.views = views;
	return hasData ? sidecar : null;
}
function applySidecar(workspace, sidecar) {
	if (sidecar.version !== 1) return;
	if (sidecar.elements) {
		const applyToElement = (id, data) => {
			const applyProps = (el) => {
				if (el.status === void 0 && isValidStatus(data.status)) el.status = data.status;
				if (el.owner === void 0 && typeof data.owner === "string") el.owner = data.owner;
			};
			for (const p of workspace.model.people) if (p.id === id) {
				applyProps(p);
				return;
			}
			for (const sys of workspace.model.softwareSystems) {
				if (sys.id === id) {
					applyProps(sys);
					return;
				}
				for (const c of sys.containers) {
					if (c.id === id) {
						applyProps(c);
						return;
					}
					for (const comp of c.components) if (comp.id === id) {
						applyProps(comp);
						return;
					}
				}
			}
		};
		for (const [id, data] of Object.entries(sidecar.elements)) applyToElement(id, data);
	}
	if (sidecar.relationships) for (const rel of workspace.model.relationships) {
		const data = sidecar.relationships[rel.id];
		if (data) {
			if (isValidLineStyle(data.lineStyle)) rel.lineStyle = data.lineStyle;
		}
	}
	if (sidecar.views) for (const view of allViewsOf(workspace)) {
		const viewData = sidecar.views[view.key];
		if (!viewData) continue;
		if (viewData.locked) view.locked = true;
		if (!viewData.elements) continue;
		for (const el of view.elements) {
			const elData = viewData.elements[el.id];
			if (!elData) continue;
			if (elData.pinned !== void 0) el.pinned = elData.pinned || void 0;
			if (elData.locked !== void 0) el.locked = elData.locked || void 0;
			if (isFiniteNumber(elData.x)) el.x = elData.x;
			if (isFiniteNumber(elData.y)) el.y = elData.y;
		}
	}
}
function serializeSidecar(data) {
	return JSON.stringify(data, null, 2);
}
function parseSidecar(json) {
	try {
		const data = JSON.parse(json);
		return isSidecarData(data) ? data : null;
	} catch (err) {
		log$1.warn("Failed to parse sidecar JSON", err);
		return null;
	}
}
//#endregion
//#region src/lib/workspaceDocument.ts
function parseWorkspaceDocument({ content, fallbackName, sidecarJson }) {
	const { workspace, errors } = parseDSL(content);
	if (!workspace.name && fallbackName) workspace.name = fallbackName;
	const sidecar = sidecarJson ? parseSidecar(sidecarJson) : null;
	if (sidecar) applySidecar(workspace, sidecar);
	return {
		workspace,
		errors
	};
}
//#endregion
//#region src/cli/diff.ts
/** Unified diff of two texts, 3 lines of context. Line-based LCS after
*  trimming the common head and tail; returns '' when the texts are equal. */
function unifiedDiff(label, before, after, context = 3) {
	if (before === after) return "";
	const a = before === "" ? [] : before.split("\n");
	const b = after === "" ? [] : after.split("\n");
	let head = 0;
	while (head < a.length && head < b.length && a[head] === b[head]) head++;
	let tail = 0;
	while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
	const am = a.slice(head, a.length - tail);
	const bm = b.slice(head, b.length - tail);
	const lcs = Array.from({ length: am.length + 1 }, () => new Uint32Array(bm.length + 1));
	for (let i = am.length - 1; i >= 0; i--) for (let j = bm.length - 1; j >= 0; j--) lcs[i][j] = am[i] === bm[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
	const ops = a.slice(0, head).map((text) => ({
		tag: " ",
		text
	}));
	let i = 0;
	let j = 0;
	while (i < am.length || j < bm.length) if (i < am.length && j < bm.length && am[i] === bm[j]) {
		ops.push({
			tag: " ",
			text: am[i]
		});
		i++;
		j++;
	} else if (j < bm.length && (i === am.length || lcs[i][j + 1] >= lcs[i + 1][j])) ops.push({
		tag: "+",
		text: bm[j++]
	});
	else ops.push({
		tag: "-",
		text: am[i++]
	});
	for (const text of a.slice(a.length - tail)) ops.push({
		tag: " ",
		text
	});
	const out = [`--- a/${label}`, `+++ b/${label}`];
	const changed = ops.flatMap((op, idx) => op.tag === " " ? [] : [idx]);
	let k = 0;
	while (k < changed.length) {
		let start = Math.max(changed[k] - context, 0);
		let end = Math.min(changed[k] + context, ops.length - 1);
		while (k + 1 < changed.length && changed[k + 1] - context <= end + 1) {
			k++;
			end = Math.min(changed[k] + context, ops.length - 1);
		}
		k++;
		start = Math.max(start, 0);
		const hunk = ops.slice(start, end + 1);
		const oldStart = ops.slice(0, start).filter((o) => o.tag !== "+").length + 1;
		const newStart = ops.slice(0, start).filter((o) => o.tag !== "-").length + 1;
		const oldLen = hunk.filter((o) => o.tag !== "+").length;
		const newLen = hunk.filter((o) => o.tag !== "-").length;
		out.push(`@@ -${oldStart},${oldLen} +${newStart},${newLen} @@`);
		for (const op of hunk) out.push(op.tag + op.text);
	}
	return out.join("\n") + "\n";
}
//#endregion
//#region src/cli/lossyGuard.ts
/** The only `!` directive that survives a parse and serialize round trip
*  (the parser stores it as `workspace.impliedRelationships`, the serializer
*  writes it back). Every other directive (`!include`, `!const`, `!var`,
*  `!identifiers`, `!docs`, `!adrs`, `!script`, `!element`, ...) is dropped. */
var ROUND_TRIPPING_DIRECTIVE = /^!impliedRelationships\s+(true|false)\s*$/;
/** Everything a canonical rewrite of `source` would silently drop, ordered by
*  line. Three sources, all driven by the real lexer and parser so `#` in hex
*  colors and `//` inside strings are never mistaken for comments:
*  - comment tokens (line `//`, line `#`, and block comments), which the lexer discards;
*  - `!` directives, which the lexer keeps as opaque lines;
*  - statements the parser consumed without modelling (`branding`,
*    `terminology`, `animation`, `users`, unknown keywords, ...). */
function findLossyConstructs(source) {
	const findings = [];
	for (const token of lex(source).tokens) if (token.type === "COMMENT") findings.push({
		line: token.line,
		kind: "comment",
		text: firstLine(token.value)
	});
	else if (token.type === "KEYWORD" && token.value.startsWith("!") && !ROUND_TRIPPING_DIRECTIVE.test(token.value)) findings.push({
		line: token.line,
		kind: "directive",
		text: token.value.trim()
	});
	for (const skipped of parseDSL(source).skipped) findings.push({
		line: skipped.line,
		kind: "unmodelled",
		text: skipped.text
	});
	return findings.sort((a, b) => a.line - b.line);
}
function describeFinding(f) {
	return `line ${f.line}: ${f.kind} \`${f.text}\``;
}
function firstLine(text) {
	const nl = text.indexOf("\n");
	return nl === -1 ? text : `${text.slice(0, nl)} ...`;
}
//#endregion
//#region src/cli/viewKeys.ts
/** The `--type` word for each view type; also the suffix of a default key. */
var VIEW_TYPE_WORDS = {
	landscape: "systemLandscape",
	context: "systemContext",
	container: "container",
	component: "component",
	dynamic: "dynamic",
	deployment: "deployment"
};
var WORD_BY_TYPE = Object.fromEntries(Object.entries(VIEW_TYPE_WORDS).map(([word, type]) => [type, word]));
/** `base`, or `base-2`, `base-3`, ... when a view already holds the key. */
function uniqueViewKey(ws, base) {
	const taken = new Set(allViewsOf(ws).map((v) => v.key));
	let key = base;
	for (let n = 2; taken.has(key); n++) key = `${base}-${n}`;
	return key;
}
/** The readable default key for a view: `<scopeId>-<type word>` (or just the
*  type word without a scope, e.g. `landscape`), made unique. */
function defaultViewKey(ws, type, scopeId) {
	const word = WORD_BY_TYPE[type];
	return uniqueViewKey(ws, scopeId ? `${scopeId}-${word}` : word);
}
/** Maps `changed.views` through the renames a save applied and reports them as
*  `data.renamedViews` ({ storeMintedKey: finalKey }). No-op without renames. */
function withRenamedViews(result, renamed) {
	if (Object.keys(renamed).length === 0) return result;
	const views = result.changed?.views?.map((k) => renamed[k] ?? k);
	return {
		...result,
		...result.changed ? { changed: {
			...result.changed,
			...views ? { views } : {}
		} } : {},
		data: {
			...result.data,
			renamedViews: renamed
		}
	};
}
//#endregion
//#region src/cli/session.ts
/** Loads `file` the way the app opens a .dsl (parseWorkspaceDocument with the
*  sibling sidecar, then `loadWorkspace`). Throws ParseFailedError on parse
*  errors, and LossyFileError when a rewrite would drop content unless
*  `force`. Read-only commands pass `force: true`, since they never write. */
function openSession(file, opts) {
	const dslPath = path.resolve(file);
	if (!existsSync(dslPath)) throw new CliFailure("NOT_FOUND", `Workspace file not found: ${dslPath}`);
	const sidecarPath = path.join(path.dirname(dslPath), sidecarName(path.basename(dslPath)));
	const content = readFileSync(dslPath, "utf8");
	const sidecarJson = existsSync(sidecarPath) ? readFileSync(sidecarPath, "utf8") : void 0;
	const { workspace, errors } = parseWorkspaceDocument({
		content,
		fallbackName: path.basename(dslPath, path.extname(dslPath)),
		sidecarJson
	});
	if (errors.length > 0) throw new ParseFailedError(`${dslPath} has ${errors.length} parse error(s)`, errors.map((e) => `line ${e.line}: ${e.message}`));
	if (!opts.force) {
		const findings = findLossyConstructs(content);
		if (findings.length > 0) throw new LossyFileError(findings.map(describeFinding));
	}
	useWorkspaceStore.getState().loadWorkspace(workspace);
	const renames = /* @__PURE__ */ new Map();
	const removed = /* @__PURE__ */ new Set();
	const settledViewKeys = new Set(allViewsOf(workspace).map((v) => v.key));
	/** Renames session-created views with a non-explicit key to readable ones.
	*  Nothing in the workspace refers to a view by key (the sidecar is built from
	*  the views at save time), so changing `view.key` is the whole rename. */
	function renameAutoViews() {
		const renamed = {};
		if (allViewsOf(useWorkspaceStore.getState().workspace).filter((v) => !settledViewKeys.has(v.key)).length === 0) return renamed;
		const next = structuredClone(useWorkspaceStore.getState().workspace);
		for (const view of allViewsOf(next).filter((v) => !settledViewKeys.has(v.key))) {
			const key = defaultViewKey(next, view.type, view.type === "component" ? view.containerId : view.softwareSystemId);
			renamed[view.key] = key;
			view.key = key;
			settledViewKeys.add(key);
		}
		useWorkspaceStore.getState().resetWorkspaceTo(next);
		return renamed;
	}
	return {
		file: dslPath,
		workspace() {
			const ws = useWorkspaceStore.getState().workspace;
			if (!ws) throw new Error("No workspace loaded");
			return ws;
		},
		actions: () => useWorkspaceStore.getState(),
		recordRename(oldId, newId) {
			for (const [from, to] of renames) if (to === oldId) renames.set(from, newId);
			if (!renames.has(oldId)) renames.set(oldId, newId);
		},
		recordRemoved(id) {
			removed.add(id);
		},
		markExplicitViewKey(key) {
			settledViewKeys.add(key);
		},
		save({ dryRun }) {
			const renamedViews = renameAutoViews();
			const ws = this.workspace();
			const nextDsl = serializeDSL(ws);
			assertSerializedKeepsContent(ws, nextDsl);
			const extracted = extractSidecar(ws);
			const nextSidecar = extracted ? serializeSidecar(rekeySidecar(extracted, renames, removed)) : null;
			const prevSidecar = sidecarJson ?? null;
			const dslChanged = nextDsl !== content;
			const sidecarChanged = nextSidecar !== prevSidecar;
			const result = {
				changed: dslChanged || sidecarChanged,
				dslPath,
				sidecarPath: nextSidecar !== null || prevSidecar !== null ? sidecarPath : null,
				renamedViews
			};
			if (dryRun) {
				result.diff = unifiedDiff(path.basename(dslPath), content, nextDsl) + unifiedDiff(path.basename(sidecarPath), prevSidecar ?? "", nextSidecar ?? "");
				return result;
			}
			if (dslChanged) writeAtomic(dslPath, nextDsl);
			if (sidecarChanged) {
				if (nextSidecar === null) rmSync(sidecarPath, { force: true });
				else writeAtomic(sidecarPath, nextSidecar);
			}
			return result;
		}
	};
}
function tally(ws) {
	let elements = 0;
	forEachElementHelper(ws, () => {
		elements++;
	});
	return {
		elements,
		relationships: ws.model.relationships.length,
		views: allViewsOf(ws).filter((v) => !v.autoView).length
	};
}
/** Last line of defence against a serializer or parser blind spot (for example
*  a DSL keyword used as an element id): re-parse what is about to be written
*  and refuse when it fails to parse or lost elements, relationships or views. */
function assertSerializedKeepsContent(ws, dsl) {
	const reparsed = parseDSL(dsl);
	if (reparsed.errors.length > 0) throw new CliFailure("VALIDATION", "The rewritten file would not parse back; refusing to write it.", reparsed.errors.map((e) => `line ${e.line}: ${e.message}`));
	const want = tally(ws);
	const got = tally(reparsed.workspace);
	const lost = [
		"elements",
		"relationships",
		"views"
	].filter((k) => got[k] < want[k]).map((k) => `${k}: ${want[k]} in memory, ${got[k]} after re-parse`);
	if (lost.length > 0) throw new CliFailure("VALIDATION", "The rewritten file would lose content on re-parse; refusing to write it.", lost);
}
/** Temp file in the destination directory, then rename: readers never see a
*  half-written file, and rename is atomic on one filesystem. */
function writeAtomic(target, data) {
	const tmp = `${target}.${process.pid}.tmp`;
	try {
		writeFileSync(tmp, data);
		renameSync(tmp, target);
	} catch (err) {
		rmSync(tmp, { force: true });
		throw err;
	}
}
//#endregion
//#region src/cli/commands/shared.ts
/** Opens the workspace a mutating command edits (`--file`, `--force`). */
function openForEdit(args, ctx) {
	return openSession(discoverWorkspace({
		file: flag(args, "file"),
		cwd: ctx.cwd
	}), { force: boolFlag(args, "force") });
}
/** Every identifier a new element must not collide with: model elements,
*  relationships, deployment environments, nodes and their children share one namespace. */
function takenIds(ws) {
	const taken = new Set(ws.model.relationships.map((r) => r.id));
	forEachElementHelper(ws, (el) => {
		taken.add(el.id);
	});
	for (const env of ws.model.deploymentEnvironments ?? []) {
		taken.add(env.id);
		walkDeploymentNodes(env, (n) => {
			taken.add(n.id);
			for (const x of [
				...n.infrastructureNodes,
				...n.containerInstances,
				...n.softwareSystemInstances
			]) taken.add(x.id);
		});
	}
	return taken;
}
/** An explicit `--id` must be free; throws VALIDATION otherwise. `own` is the
*  id the element holds right now, which does not count as taken. */
function requireFreeId(ws, id, own) {
	const taken = takenIds(ws);
	if (own !== void 0) taken.delete(own);
	if (taken.has(id)) throw new CliFailure("VALIDATION", `Identifier '${id}' is already in use.`);
}
//#endregion
//#region src/cli/commands/types.ts
/** Boolean flags every mutating command accepts. */
var MUTATING_BOOLEANS = ["dry-run", "force"];
//#endregion
//#region src/cli/commands/deployment.ts
function required$1(args, name) {
	const value = flag(args, name);
	if (value === void 0 || value === "true") throw new CliFailure("USAGE", `--${name} is required`);
	return value;
}
function environments(ws) {
	return ws.model.deploymentEnvironments ?? [];
}
function nodesOf(env) {
	const out = [];
	walkDeploymentNodes(env, (n) => out.push(n));
	return out;
}
function requireEnv(ws, name) {
	const env = environments(ws).find((e) => e.name === name);
	if (!env) throw new CliFailure("NOT_FOUND", `No deployment environment '${name}'.`, environments(ws).map((e) => e.name));
	return env;
}
/** Local deployment-node resolver (resolve.ts covers model elements only):
*  by id, then by unique name, within `envName` when given, else across all
*  environments. Returns the node with the environment that holds it. */
function resolveNode(ws, ref, envName) {
	const all = (envName === void 0 ? environments(ws) : [requireEnv(ws, envName)]).flatMap((env) => nodesOf(env).map((node) => ({
		env,
		node
	})));
	const byId = all.find((x) => x.node.id === ref);
	if (byId) return byId;
	const byName = all.filter((x) => x.node.name === ref);
	if (byName.length === 1) return byName[0];
	if (byName.length > 1) throw new CliFailure("AMBIGUOUS", `'${ref}' matches ${byName.length} deployment nodes by name. Use an identifier.`, byName.map((x) => x.node.id));
	throw new CliFailure("NOT_FOUND", `No deployment node '${ref}'.`, all.map((x) => x.node.id).slice(0, 5));
}
/** Gives a freshly created element a readable identifier. The store holds
*  frozen state, so the rename runs inside an immer draft. */
function assignIdentifier(session, oldId, args, name) {
	const explicit = flag(args, "id");
	if (explicit !== void 0) requireFreeId(session.workspace(), explicit, oldId);
	const taken = takenIds(session.workspace());
	taken.delete(oldId);
	const newId = explicit ?? deriveIdentifier(name, taken);
	try {
		useWorkspaceStore.setState((s) => {
			renameElementId(s.workspace, oldId, newId);
		});
	} catch (err) {
		throw new CliFailure("VALIDATION", err.message);
	}
	session.recordRename(oldId, newId);
	return newId;
}
function finish$4(session, args, command, elements, data) {
	const save = session.save({ dryRun: boolFlag(args, "dry-run") });
	return {
		ok: true,
		command,
		file: session.file,
		changed: save.changed && elements.length > 0 ? { elements } : {},
		data: {
			...data,
			...save.diff !== void 0 ? { diff: save.diff } : {}
		},
		warnings: []
	};
}
function envAdd(session, args) {
	const name = args.positionals[2] ?? flag(args, "name");
	if (!name) throw new CliFailure("USAGE", "deploy env add needs an environment name");
	if (!session.actions().addDeploymentEnvironment(name)) throw new CliFailure("VALIDATION", `Could not add environment '${name}'.`);
	return finish$4(session, args, "deploy", [], { environment: name.trim() });
}
function nodeAdd(session, args) {
	const ws = session.workspace();
	const env = requireEnv(ws, required$1(args, "env"));
	const name = required$1(args, "name");
	const parentRef = flag(args, "parent");
	const parent = parentRef === void 0 ? void 0 : resolveNode(ws, parentRef, env.name).node;
	const instances = flag(args, "instances");
	const rawId = session.actions().addDeploymentNode(env.name, parent?.id ?? null);
	if (!rawId) throw new CliFailure("VALIDATION", `Could not add node '${name}' to '${env.name}'.`);
	session.actions().updateDeploymentElement(env.name, rawId, {
		name,
		technology: flag(args, "technology")
	});
	if (instances !== void 0) useWorkspaceStore.setState((s) => {
		const draftEnv = environments(s.workspace).find((e) => e.name === env.name);
		nodesOf(draftEnv).find((n) => n.id === rawId).instances = instances;
	});
	const id = assignIdentifier(session, rawId, args, name);
	return finish$4(session, args, "deploy", [id], {
		id,
		name,
		environment: env.name,
		...parent ? { parent: parent.id } : {}
	});
}
function instanceAdd(session, args) {
	const ws = session.workspace();
	const { env, node } = resolveNode(ws, required$1(args, "node"), flag(args, "env"));
	const target = resolveElement(ws, required$1(args, "of"));
	let rawId;
	if (target.type === "container") rawId = session.actions().addContainerInstance(env.name, node.id, target.id);
	else if (target.type === "softwareSystem") rawId = session.actions().addSoftwareSystemInstance(env.name, node.id, target.id);
	else throw new CliFailure("USAGE", `--of must be a container or software system, '${target.id}' is a ${target.type}.`);
	if (!rawId) throw new CliFailure("VALIDATION", `Could not add an instance of '${target.id}' to '${node.id}'.`);
	const id = assignIdentifier(session, rawId, args, `${target.name} instance`);
	return finish$4(session, args, "deploy", [id], {
		id,
		of: target.id,
		node: node.id,
		environment: env.name
	});
}
function infraAdd(session, args) {
	const { env, node } = resolveNode(session.workspace(), required$1(args, "node"), flag(args, "env"));
	const name = required$1(args, "name");
	const rawId = session.actions().addInfrastructureNode(env.name, node.id);
	if (!rawId) throw new CliFailure("VALIDATION", `Could not add infrastructure node '${name}' to '${node.id}'.`);
	session.actions().updateDeploymentElement(env.name, rawId, {
		name,
		technology: flag(args, "technology")
	});
	const id = assignIdentifier(session, rawId, args, name);
	return finish$4(session, args, "deploy", [id], {
		id,
		name,
		node: node.id,
		environment: env.name
	});
}
/** Ids a delete of `id` removes: the element, plus a deployment node's whole subtree. */
function subtreeIds(ws, ref, envName) {
	const envs = envName === void 0 ? environments(ws) : [requireEnv(ws, envName)];
	for (const env of envs) for (const n of nodesOf(env)) for (const x of [
		...n.infrastructureNodes,
		...n.containerInstances,
		...n.softwareSystemInstances
	]) if (x.id === ref) return {
		ids: [x.id],
		env: env.name
	};
	const { env, node } = resolveNode(ws, ref, envName);
	const ids = [];
	const collect = (n) => {
		ids.push(n.id, ...n.infrastructureNodes.map((x) => x.id), ...n.containerInstances.map((x) => x.id), ...n.softwareSystemInstances.map((x) => x.id));
		n.children.forEach(collect);
	};
	collect(node);
	return {
		ids,
		env: env.name
	};
}
function removeElement(session, args) {
	const ref = args.positionals[1];
	if (!ref) throw new CliFailure("USAGE", "deploy remove needs a node, instance or infrastructure node ref");
	const { ids, env } = subtreeIds(session.workspace(), ref, flag(args, "env"));
	session.actions().deleteElements([ids[0]]);
	for (const id of ids) session.recordRemoved(id);
	return finish$4(session, args, "deploy", ids, {
		removed: ids,
		environment: env
	});
}
var HANDLERS = {
	"env add": envAdd,
	"node add": nodeAdd,
	"instance add": instanceAdd,
	"infra add": infraAdd
};
var deploymentCommands = [{
	name: "deploy",
	summary: "Author deployment environments, nodes, instances and infrastructure",
	flags: {
		booleans: MUTATING_BOOLEANS,
		bySubcommand: {
			env: { values: ["name"] },
			node: { values: [
				"env",
				"name",
				"parent",
				"technology",
				"instances",
				"id"
			] },
			instance: { values: [
				"node",
				"of",
				"env",
				"id"
			] },
			infra: { values: [
				"node",
				"name",
				"technology",
				"env",
				"id"
			] },
			remove: { values: ["env"] }
		}
	},
	usage: "deploy env add <name> | deploy node add --env <name> --name <text> [--parent <node>] [--technology <text>] [--instances <n>] [--id <ident>] | deploy instance add --node <ref> --of <containerOrSystemRef> [--env <name>] | deploy infra add --node <ref> --name <text> [--technology <text>] [--env <name>] | deploy remove <ref> [--env <name>]  [--file <dsl>] [--dry-run] [--force]",
	run(args, ctx) {
		const [first, second] = args.positionals;
		const handler = first === "remove" ? removeElement : HANDLERS[`${first} ${second}`];
		if (!handler) throw new CliFailure("USAGE", `deploy needs a subcommand: ${[...Object.keys(HANDLERS), "remove"].join(", ")}`);
		return handler(openForEdit(args, ctx), args);
	}
}];
//#endregion
//#region src/cli/commands/docs.ts
function resolveTarget(ws, ref, match) {
	if (ref.includes("->")) return {
		kind: "relationship",
		relationship: resolveRelationship(ws, ref, match)
	};
	try {
		return {
			kind: "element",
			element: resolveElement(ws, ref)
		};
	} catch (err) {
		if (!(err instanceof CliFailure) || err.code !== "NOT_FOUND") throw err;
		if (ws.model.relationships.some((r) => r.id === ref)) return {
			kind: "relationship",
			relationship: resolveRelationship(ws, ref, match)
		};
		throw err;
	}
}
function validatedPath(raw) {
	const problem = docPathProblem(raw);
	if (problem) throw new CliFailure("USAGE", `Invalid document path '${raw}': ${problem}.`);
	return path.posix.normalize(raw.replace(/\\/g, "/"));
}
function scaffold(ws, target) {
	const nameOf = (id) => {
		const el = [...ws.model.people, ...ws.model.softwareSystems].flatMap((r) => [r, ..."containers" in r ? r.containers.flatMap((c) => [c, ...c.components]) : []]).find((e) => e.id === id);
		return el ? el.name : id;
	};
	const lines = [];
	if (target.kind === "element") {
		const el = target.element;
		lines.push(`# ${el.name}`, "");
		if (el.description) lines.push(el.description, "");
		const tech = el.technology;
		if (tech) lines.push(`**Technology:** ${tech}`, "");
		const rels = ws.model.relationships.filter((r) => r.sourceId === el.id || r.destinationId === el.id);
		lines.push("## Relationships", "");
		if (rels.length === 0) lines.push("_None._");
		for (const r of rels) {
			const outgoing = r.sourceId === el.id;
			const other = nameOf(outgoing ? r.destinationId : r.sourceId);
			const detail = [r.description, r.technology ? `[${r.technology}]` : ""].filter(Boolean).join(" ");
			lines.push(`- ${outgoing ? "->" : "<-"} ${other}${detail ? `: ${detail}` : ""}`);
		}
	} else {
		const r = target.relationship;
		lines.push(`# ${nameOf(r.sourceId)} -> ${nameOf(r.destinationId)}`, "");
		if (r.description) lines.push(r.description, "");
		if (r.technology) lines.push(`**Technology:** ${r.technology}`, "");
	}
	return lines.join("\n").replace(/\n+$/, "") + "\n";
}
function setDocuments(target, documents, actions) {
	if (target.kind === "element") actions.updateElement(target.element.id, { documents });
	else actions.updateRelationship(target.relationship.id, { documents });
}
function targetId(target) {
	return target.kind === "element" ? target.element.id : target.relationship.id;
}
function changedOf(target) {
	return target.kind === "element" ? { elements: [target.element.id] } : { relationships: [target.relationship.id] };
}
function commonSetup(args, ctx) {
	const ref = args.positionals[0];
	if (!ref) throw new CliFailure("USAGE", "Missing <ref> (element ref or relationship ref).");
	const rawPath = flag(args, "path");
	if (!rawPath) throw new CliFailure("USAGE", "Missing --path <repo-relative.md|.html>.");
	const docPath = validatedPath(rawPath);
	const session = openForEdit(args, ctx);
	const target = resolveTarget(session.workspace(), ref, flag(args, "match"));
	return {
		file: session.file,
		session,
		target,
		docPath,
		dryRun: boolFlag(args, "dry-run")
	};
}
function currentDocs(target) {
	return (target.kind === "element" ? target.element.documents : target.relationship.documents) ?? [];
}
var docsCommands = [{
	name: "link-doc",
	summary: "Link a markdown document to an element or relationship",
	flags: {
		values: [
			"path",
			"title",
			"match"
		],
		booleans: ["create", ...MUTATING_BOOLEANS]
	},
	usage: "link-doc <ref|relRef> --path <repo-relative.md|.html> [--title <text>] [--create] [--match <description>] [--file <dsl>] [--dry-run] [--force]",
	run(args, ctx) {
		const { file, session, target, docPath, dryRun } = commonSetup(args, ctx);
		const warnings = [];
		const root = projectRootFor(file);
		const absolute = path.resolve(root, docPath);
		if (!isInsideRoot(root, absolute) || !isInsideRootReal(root, absolute)) throw new CliFailure("USAGE", `Document path '${docPath}' resolves outside the project root ${root}.`);
		if (boolFlag(args, "create") && documentKind(docPath) !== "markdown") throw new CliFailure("USAGE", `--create only scaffolds markdown; '${docPath}' is not a markdown path.`);
		const docs = currentDocs(target);
		const existing = docs.findIndex((d) => d.path === docPath);
		const title = flag(args, "title") ?? docs[existing]?.title ?? path.posix.basename(docPath).replace(/\.(md|markdown|html|htm)$/i, "");
		const next = existing === -1 ? [...docs, {
			path: docPath,
			title
		}] : docs.map((d, i) => i === existing ? {
			path: docPath,
			title
		} : d);
		setDocuments(target, next, session.actions());
		let created = false;
		if (existsSync(absolute)) {
			if (boolFlag(args, "create")) warnings.push(`${docPath} already exists; left untouched.`);
		} else if (boolFlag(args, "create")) {
			if (!dryRun) {
				mkdirSync(path.dirname(absolute), { recursive: true });
				if (!isInsideRootReal(root, absolute)) throw new CliFailure("USAGE", `Document path '${docPath}' resolves outside the project root ${root}.`);
				writeFileSync(absolute, scaffold(session.workspace(), target), { flag: "wx" });
			}
			created = true;
		} else warnings.push(`${docPath} does not exist under ${root}. Pass --create to scaffold it.`);
		const saved = session.save({ dryRun });
		return {
			ok: true,
			command: "link-doc",
			file,
			changed: saved.changed ? changedOf(target) : {},
			data: {
				target: targetId(target),
				documents: next,
				updatedExisting: existing !== -1,
				created,
				...saved.diff !== void 0 ? { diff: saved.diff } : {}
			},
			warnings
		};
	}
}, {
	name: "unlink-doc",
	summary: "Remove a document link from an element or relationship",
	flags: {
		values: ["path", "match"],
		booleans: MUTATING_BOOLEANS
	},
	usage: "unlink-doc <ref|relRef> --path <repo-relative.md|.html> [--match <description>] [--file <dsl>] [--dry-run] [--force]",
	run(args, ctx) {
		const { file, session, target, docPath, dryRun } = commonSetup(args, ctx);
		const docs = currentDocs(target);
		if (!docs.some((d) => d.path === docPath)) throw new CliFailure("NOT_FOUND", `'${targetId(target)}' has no document link '${docPath}'.`, docs.map((d) => d.path));
		const next = docs.filter((d) => d.path !== docPath);
		setDocuments(target, next, session.actions());
		const saved = session.save({ dryRun });
		return {
			ok: true,
			command: "unlink-doc",
			file,
			changed: saved.changed ? changedOf(target) : {},
			data: {
				target: targetId(target),
				documents: next,
				...saved.diff !== void 0 ? { diff: saved.diff } : {}
			},
			warnings: []
		};
	}
}];
//#endregion
//#region src/lib/dynamicSteps.ts
/** Elements a dynamic view's steps may connect, mirroring what the real
*  Structurizr parser accepts (verified against CLI v2025.11.09):
*  unscoped — people and software systems only; system-scoped — plus
*  containers; container-scoped — plus the scoped container's components. */
function eligibleStepElements(ws, view) {
	const out = [...ws.model.people, ...ws.model.softwareSystems];
	if (view.softwareSystemId || view.containerId) for (const system of ws.model.softwareSystems) out.push(...system.containers);
	if (view.containerId) {
		const scoped = ws.model.softwareSystems.flatMap((s) => s.containers).find((c) => c.id === view.containerId);
		out.push(...scoped?.components ?? []);
	}
	return out.sort((a, b) => a.name.localeCompare(b.name));
}
//#endregion
//#region src/cli/commands/dynamic.ts
function required(args, name) {
	const value = flag(args, name);
	if (value === void 0 || value === "true") throw new CliFailure("USAGE", `--${name} is required`);
	return value;
}
/** A 1-based step position, matching the `order` shown for the step. */
function stepNumber(args, name, count) {
	const raw = required(args, name);
	const n = Number(raw);
	if (!Number.isInteger(n) || n < 1 || n > count) throw new CliFailure("USAGE", `--${name} must be an integer between 1 and ${count} (got '${raw}')`);
	return n;
}
function dynamicView(session, key) {
	const view = findViewHelper(session.workspace(), key);
	if (!view) throw new CliFailure("NOT_FOUND", `No view '${key}'.`);
	if (view.type !== "dynamic") throw new CliFailure("USAGE", `View '${key}' is a ${view.type} view, not a dynamic view.`);
	return view;
}
function describeSteps(view) {
	return view.relationships.map((s, i) => ({
		index: i + 1,
		relationship: s.id,
		from: s.sourceId,
		to: s.destinationId,
		...s.response ? { response: true } : {},
		...s.description ? { description: s.description } : {}
	}));
}
function finish$3(session, args, command, viewKey, warnings) {
	const save = session.save({ dryRun: boolFlag(args, "dry-run") });
	return {
		ok: true,
		command,
		file: session.file,
		changed: save.changed ? { views: [viewKey] } : {},
		data: {
			steps: describeSteps(findViewHelper(session.workspace(), viewKey)),
			...save.diff !== void 0 ? { diff: save.diff } : {}
		},
		warnings
	};
}
function add$1(session, args, viewKey) {
	const view = dynamicView(session, viewKey);
	const ws = session.workspace();
	const from = resolveElement(ws, required(args, "from"));
	const to = resolveElement(ws, required(args, "to"));
	if (from.id === to.id) throw new CliFailure("VALIDATION", "A step needs two different elements.");
	const eligible = new Set(eligibleStepElements(ws, view).map((e) => e.id));
	for (const el of [from, to]) if (!eligible.has(el.id)) throw new CliFailure("USAGE", `'${el.id}' (${el.type}) cannot take part in steps of view '${viewKey}'.`, [...eligible]);
	const forward = ws.model.relationships.some((r) => r.sourceId === from.id && r.destinationId === to.id);
	const reverse = ws.model.relationships.some((r) => r.sourceId === to.id && r.destinationId === from.id);
	const warnings = [];
	if (boolFlag(args, "response")) {
		if (forward) throw new CliFailure("USAGE", `--response needs no forward relationship ${from.id} -> ${to.id}; one exists, so the step would not be a response.`);
		if (!reverse) throw new CliFailure("USAGE", `--response needs an existing relationship ${to.id} -> ${from.id}.`);
	} else if (!forward && reverse) warnings.push(`No relationship ${from.id} -> ${to.id}; the step is a response over ${to.id} -> ${from.id}. Pass --response to make this explicit.`);
	const before = view.relationships.length;
	session.actions().addDynamicStep(viewKey, from.id, to.id, flag(args, "description"));
	if (findViewHelper(session.workspace(), viewKey).relationships.length === before) throw new CliFailure("USAGE", `The step ${from.id} -> ${to.id} was not added to view '${viewKey}'.`);
	return finish$3(session, args, "step", viewKey, warnings);
}
function move$1(session, args, viewKey) {
	const count = dynamicView(session, viewKey).relationships.length;
	const index = stepNumber(args, "index", count);
	const to = stepNumber(args, "to", count);
	const direction = to < index ? "up" : "down";
	for (let i = index - 1; i !== to - 1; i += direction === "up" ? -1 : 1) session.actions().moveDynamicStep(viewKey, i, direction);
	return finish$3(session, args, "step", viewKey, []);
}
function remove$1(session, args, viewKey) {
	const count = dynamicView(session, viewKey).relationships.length;
	const index = stepNumber(args, "index", count);
	session.actions().deleteDynamicStep(viewKey, index - 1);
	return finish$3(session, args, "step", viewKey, []);
}
var SUBCOMMANDS = {
	add: add$1,
	move: move$1,
	remove: remove$1
};
var dynamicCommands = [{
	name: "step",
	summary: "Add, move or remove steps of a dynamic view (indexes are 1-based)",
	flags: {
		booleans: MUTATING_BOOLEANS,
		bySubcommand: {
			add: {
				values: [
					"view",
					"from",
					"to",
					"description"
				],
				booleans: ["response"]
			},
			move: { values: [
				"view",
				"index",
				"to"
			] },
			remove: { values: ["view", "index"] }
		}
	},
	usage: "step add --view <key> --from <ref> --to <ref> [--description <text>] [--response] | step move --view <key> --index N --to M | step remove --view <key> --index N  [--file <dsl>] [--dry-run] [--force]",
	run(args, ctx) {
		const sub = args.positionals[0];
		const handler = sub === void 0 ? void 0 : SUBCOMMANDS[sub];
		if (!handler) throw new CliFailure("USAGE", `step needs a subcommand: ${Object.keys(SUBCOMMANDS).join(", ")}`);
		const viewKey = required(args, "view");
		return handler(openForEdit(args, ctx), args, viewKey);
	}
}];
//#endregion
//#region src/cli/commands/elements.ts
var ADD_TYPES = [
	"person",
	"system",
	"container",
	"component"
];
var LOCATIONS = [
	"Internal",
	"External",
	"Unspecified"
];
function csv$1(value) {
	return (value ?? "").split(",").map((t) => t.trim()).filter(Boolean);
}
function finish$2(command, session, args, changed, warnings, data) {
	const saved = session.save({ dryRun: boolFlag(args, "dry-run") });
	return withRenamedViews({
		ok: true,
		command,
		file: session.file,
		changed: saved.changed ? changed : {},
		data: saved.diff !== void 0 ? {
			...data,
			diff: saved.diff
		} : data,
		warnings
	}, saved.renamedViews);
}
function descendantIds(el) {
	if (el.type === "softwareSystem") return el.containers.flatMap((c) => [c.id, ...descendantIds(c)]);
	if (el.type === "container") return el.components.map((c) => c.id);
	return [];
}
function parseProperty(raw) {
	const eq = raw.indexOf("=");
	if (eq < 1) throw new CliFailure("USAGE", `--property expects key=value, got '${raw}'`);
	return [raw.slice(0, eq), raw.slice(eq + 1)];
}
/** The store state is frozen by immer, so renames go through setState's draft. */
function rename(oldId, newId) {
	try {
		useWorkspaceStore.setState((s) => {
			renameElementId(s.workspace, oldId, newId);
		});
	} catch (err) {
		throw new CliFailure("VALIDATION", err.message);
	}
}
function setProperties(id, edit) {
	useWorkspaceStore.setState((s) => {
		if (!s.workspace) return;
		forEachElementHelper(s.workspace, (el) => {
			if (el.id !== id) return false;
			edit(el.properties);
			return true;
		});
	});
}
var add = {
	name: "add",
	summary: "Add a person, system, container or component",
	flags: {
		values: [
			"name",
			"parent",
			"id",
			"description",
			"technology",
			"tags"
		],
		booleans: ["external", ...MUTATING_BOOLEANS]
	},
	usage: "add person|system|softwareSystem|container|component (<name> or --name <name>) [--parent <ref>] [--id <ident>] [--description <text>] [--technology <text>] [--tags a,b] [--external] [--file <dsl>] [--dry-run] [--force]",
	run(args, ctx) {
		const rawType = args.positionals[0];
		const type = rawType === "softwareSystem" ? "system" : rawType;
		if (!ADD_TYPES.includes(type)) throw new CliFailure("USAGE", `add expects one of ${ADD_TYPES.join(", ")}, softwareSystem`);
		const flagName = flag(args, "name");
		const positionalName = args.positionals[1];
		if (args.positionals.length > 2) throw new CliFailure("USAGE", "add takes one name; quote names with spaces");
		if (flagName !== void 0 && positionalName !== void 0 && flagName !== positionalName) throw new CliFailure("USAGE", `add got two different names: '${positionalName}' and --name '${flagName}'`);
		const name = flagName ?? positionalName;
		if (!name || name === "true") throw new CliFailure("USAGE", "add requires a name: add <type> <name> or --name");
		const external = boolFlag(args, "external");
		if (external && type !== "person" && type !== "system") throw new CliFailure("USAGE", "--external applies to person and system only");
		const technology = flag(args, "technology");
		if (technology !== void 0 && type !== "container" && type !== "component") throw new CliFailure("USAGE", "--technology applies to container and component only");
		const session = openForEdit(args, ctx);
		const store = session.actions();
		const ws = session.workspace();
		const parentRef = flag(args, "parent");
		const parent = parentRef === void 0 ? void 0 : resolveElement(ws, parentRef);
		const location = external ? "External" : "Internal";
		let newId;
		if (type === "person" || type === "system") {
			if (parent) throw new CliFailure("USAGE", `${type} has no parent`);
			newId = type === "person" ? store.addPerson(name, void 0, location) : store.addSoftwareSystem(name, void 0, location);
		} else if (type === "container") {
			if (parent?.type !== "softwareSystem") throw new CliFailure("USAGE", "add container requires --parent <software system>");
			newId = store.addContainer(parent.id, name);
		} else {
			if (parent?.type !== "container") throw new CliFailure("USAGE", "add component requires --parent <container>");
			newId = store.addComponent(parent.id, name);
		}
		if (!newId) throw new CliFailure("VALIDATION", `Could not add ${type} '${name}'`);
		const explicitId = flag(args, "id");
		if (explicitId !== void 0) requireFreeId(session.workspace(), explicitId, newId);
		const wanted = explicitId ?? deriveIdentifier(name, takenIds(session.workspace()));
		rename(newId, wanted);
		session.recordRename(newId, wanted);
		const tags = csv$1(flag(args, "tags"));
		const created = resolveElement(session.workspace(), wanted);
		store.updateElement(wanted, {
			description: flag(args, "description"),
			...tags.length > 0 ? { tags: [...created.tags, ...tags.filter((t) => !created.tags.includes(t))] } : {}
		});
		if (technology !== void 0) store.updateElementTechnology(wanted, technology);
		const warnings = [];
		const finalName = created.name;
		if (finalName !== name) warnings.push(`name '${name}' already used; created as '${finalName}' (id ${wanted})`);
		for (const view of allViewsOf(session.workspace())) if (view.locked && view.elements.some((e) => e.id === wanted)) warnings.push(`view '${view.key}' is layout-locked; new element has no position`);
		return finish$2("add", session, args, { elements: [wanted] }, warnings, {
			id: wanted,
			name: finalName
		});
	}
};
var update = {
	name: "update",
	summary: "Update an element",
	flags: {
		values: [
			"name",
			"description",
			"technology",
			"url",
			"add-tag",
			"remove-tag",
			"property",
			"remove-property",
			"status",
			"owner",
			"location"
		],
		booleans: MUTATING_BOOLEANS
	},
	usage: "update <ref> [--name] [--description] [--technology] [--url] [--add-tag t]... [--remove-tag t]... [--property k=v]... [--remove-property k]... [--status] [--owner] [--location] [--file <dsl>] [--dry-run] [--force]",
	run(args, ctx) {
		const ref = args.positionals[0];
		if (!ref) throw new CliFailure("USAGE", "update requires <ref>");
		const session = openForEdit(args, ctx);
		const el = resolveElement(session.workspace(), ref);
		const store = session.actions();
		const patch = {};
		const name = flag(args, "name");
		if (name !== void 0) patch.name = name;
		for (const key of [
			"description",
			"url",
			"owner"
		]) {
			const v = flag(args, key);
			if (v !== void 0) patch[key] = v === "" ? void 0 : v;
		}
		const status = flag(args, "status");
		if (status !== void 0) {
			if (status !== "" && !isElementStatus(status)) throw new CliFailure("USAGE", "--status must be Live, Planned, Deprecated or Removed");
			patch.status = status === "" ? void 0 : status;
		}
		const location = flag(args, "location");
		if (location !== void 0) {
			if (!LOCATIONS.includes(location)) throw new CliFailure("USAGE", `--location must be one of ${LOCATIONS.join(", ")}`);
			if (el.type !== "person" && el.type !== "softwareSystem") throw new CliFailure("USAGE", "--location applies to person and system only");
			patch.location = location;
		}
		const addTags = flagAll(args, "add-tag");
		const removeTags = flagAll(args, "remove-tag");
		if (addTags.length > 0 || removeTags.length > 0) {
			const next = el.tags.filter((t) => !removeTags.includes(t));
			for (const t of addTags) if (!next.includes(t)) next.push(t);
			patch.tags = next;
		}
		store.updateElement(el.id, patch);
		const technology = flag(args, "technology");
		if (technology !== void 0) {
			if (el.type !== "container" && el.type !== "component") throw new CliFailure("USAGE", "--technology applies to container and component only");
			store.updateElementTechnology(el.id, technology);
		}
		const setProps = flagAll(args, "property").map(parseProperty);
		const dropProps = flagAll(args, "remove-property");
		if (setProps.length > 0 || dropProps.length > 0) setProperties(el.id, (props) => {
			for (const k of dropProps) delete props[k];
			for (const [k, v] of setProps) props[k] = v;
		});
		return finish$2("update", session, args, { elements: [el.id] }, []);
	}
};
var remove = {
	name: "remove",
	summary: "Remove an element and everything under or attached to it",
	flags: { booleans: MUTATING_BOOLEANS },
	usage: "remove <ref> [--file <dsl>] [--dry-run] [--force]",
	run(args, ctx) {
		const ref = args.positionals[0];
		if (!ref) throw new CliFailure("USAGE", "remove requires <ref>");
		const session = openForEdit(args, ctx);
		const el = resolveElement(session.workspace(), ref);
		const relsBefore = session.workspace().model.relationships.map((r) => r.id);
		const removedIds = [el.id, ...descendantIds(el)];
		session.actions().deleteElement(el.id);
		const relsAfter = new Set(session.workspace().model.relationships.map((r) => r.id));
		const removedRels = relsBefore.filter((id) => !relsAfter.has(id));
		for (const id of [...removedIds, ...removedRels]) session.recordRemoved(id);
		return finish$2("remove", session, args, { elements: removedIds }, [], { removedRelationships: removedRels.length });
	}
};
var renameId = {
	name: "rename-id",
	summary: "Change an element identifier everywhere it is referenced",
	flags: { booleans: MUTATING_BOOLEANS },
	usage: "rename-id <ref> <newId> [--file <dsl>] [--dry-run] [--force]",
	run(args, ctx) {
		const [ref, newId] = args.positionals;
		if (!ref || !newId) throw new CliFailure("USAGE", "rename-id requires <ref> <newId>");
		const session = openForEdit(args, ctx);
		const el = resolveElement(session.workspace(), ref);
		if (newId !== el.id) requireFreeId(session.workspace(), newId, el.id);
		rename(el.id, newId);
		session.recordRename(el.id, newId);
		return finish$2("rename-id", session, args, { elements: [newId] }, [], {
			from: el.id,
			to: newId
		});
	}
};
/** `key -> serialized content` for every view, to find which ones a store action touched. */
function viewFingerprints(ws) {
	return new Map(allViewsOf(ws).map((v) => [v.key, JSON.stringify([v.elements.map((e) => e.id), v.relationships])]));
}
/** Dynamic steps as `viewKey: source -> destination` labels, keyed by view and relationship id. */
function dynamicSteps(ws) {
	const rels = new Map(ws.model.relationships.map((r) => [r.id, r]));
	const steps = /* @__PURE__ */ new Map();
	for (const v of ws.views.dynamicViews ?? []) v.relationships.forEach((step, i) => {
		const rel = rels.get(step.id);
		steps.set(`${v.key}#${i}#${step.id}`, `${v.key}: ${step.sourceId ?? rel?.sourceId} -> ${step.destinationId ?? rel?.destinationId}`);
	});
	return steps;
}
var elementCommands = [
	add,
	update,
	remove,
	renameId,
	{
		name: "move",
		summary: "Move a container to another system, or a component to another container",
		flags: {
			values: ["to"],
			booleans: MUTATING_BOOLEANS
		},
		usage: "move <ref> --to <parentRef> [--file <dsl>] [--dry-run] [--force]",
		run(args, ctx) {
			const ref = args.positionals[0];
			const to = flag(args, "to");
			if (!ref) throw new CliFailure("USAGE", "move requires <ref>");
			if (!to || to === "true") throw new CliFailure("USAGE", "move requires --to <parentRef>");
			const session = openForEdit(args, ctx);
			const el = resolveElement(session.workspace(), ref);
			const parent = resolveElement(session.workspace(), to);
			if (el.type !== "container" && el.type !== "component") throw new CliFailure("VALIDATION", `move applies to containers and components, '${el.id}' is a ${el.type}`);
			const expected = el.type === "container" ? "softwareSystem" : "container";
			if (parent.type !== expected) throw new CliFailure("VALIDATION", `a ${el.type} moves into a ${expected === "softwareSystem" ? "software system" : "container"}, '${parent.id}' is a ${parent.type}`);
			const oldParent = parentMap(session.workspace()).get(el.id);
			if (oldParent?.id === parent.id) throw new CliFailure("VALIDATION", `'${el.id}' is already in '${parent.id}'`);
			const viewsBefore = viewFingerprints(session.workspace());
			const stepsBefore = dynamicSteps(session.workspace());
			if (!session.actions().moveElement(el.id, parent.id)) throw new CliFailure("VALIDATION", `Could not move '${el.id}' into '${parent.id}'`);
			const ws = session.workspace();
			const changedViews = [...viewFingerprints(ws)].filter(([key, fp]) => viewsBefore.get(key) !== fp).map(([key]) => key);
			const stepsAfter = new Set(dynamicSteps(ws).keys());
			const dropped = [...stepsBefore].filter(([key]) => !stepsAfter.has(key)).map(([, label]) => label);
			const warnings = dropped.map((label) => `dynamic step dropped (no longer valid in its scope) in view ${label}`);
			for (const view of allViewsOf(ws)) if (view.locked && changedViews.includes(view.key)) warnings.push(`view '${view.key}' is layout-locked; moved element has no position`);
			return finish$2("move", session, args, {
				elements: [el.id, ...descendantIds(el)],
				views: changedViews
			}, warnings, {
				id: el.id,
				from: oldParent?.id,
				to: parent.id,
				droppedSteps: dropped
			});
		}
	}
];
//#endregion
//#region src/cli/export/browser.ts
var BROWSERS = [
	{
		name: "Google Chrome Canary",
		id: /chrome.*canary/,
		mac: ["Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary"],
		linux: [],
		win: ["Google\\Chrome SxS\\Application\\chrome.exe"]
	},
	{
		name: "Google Chrome Beta",
		id: /chrome.*beta/,
		mac: ["Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta"],
		linux: ["google-chrome-beta"],
		win: ["Google\\Chrome Beta\\Application\\chrome.exe"]
	},
	{
		name: "Google Chrome",
		id: /chrome(?!.*(canary|beta))/,
		mac: ["Google Chrome.app/Contents/MacOS/Google Chrome"],
		linux: ["google-chrome", "google-chrome-stable"],
		win: ["Google\\Chrome\\Application\\chrome.exe"]
	},
	{
		name: "Microsoft Edge",
		id: /edge/,
		mac: ["Microsoft Edge.app/Contents/MacOS/Microsoft Edge"],
		linux: ["microsoft-edge", "microsoft-edge-stable"],
		win: ["Microsoft\\Edge\\Application\\msedge.exe"]
	},
	{
		name: "Brave",
		id: /brave/,
		mac: ["Brave Browser.app/Contents/MacOS/Brave Browser"],
		linux: ["brave-browser", "brave"],
		win: ["BraveSoftware\\Brave-Browser\\Application\\brave.exe"]
	},
	{
		name: "Arc",
		id: /thebrowser|^arc/,
		mac: ["Arc.app/Contents/MacOS/Arc"],
		linux: [],
		win: []
	},
	{
		name: "Chromium",
		id: /chromium/,
		mac: ["Chromium.app/Contents/MacOS/Chromium"],
		linux: ["chromium", "chromium-browser"],
		win: ["Chromium\\Application\\chrome.exe"]
	},
	{
		name: "Vivaldi",
		id: /vivaldi/,
		mac: ["Vivaldi.app/Contents/MacOS/Vivaldi"],
		linux: ["vivaldi", "vivaldi-stable"],
		win: ["Vivaldi\\Application\\vivaldi.exe"]
	},
	{
		name: "Opera",
		id: /opera/,
		mac: ["Opera.app/Contents/MacOS/Opera"],
		linux: ["opera"],
		win: ["Opera\\opera.exe"]
	}
];
function findInstalled(spec, platform, probe) {
	if (platform === "darwin") {
		for (const dir of ["/Applications", join(probe.home, "Applications")]) for (const rel of spec.mac) {
			const p = join(dir, rel);
			if (probe.fileExists(p)) return p;
		}
		return null;
	}
	if (platform === "win32") {
		const roots = [
			probe.env.ProgramFiles,
			probe.env["ProgramFiles(x86)"],
			probe.env.LOCALAPPDATA
		].filter((r) => !!r);
		for (const root of roots) for (const rel of spec.win) {
			const p = `${root}\\${rel}`;
			if (probe.fileExists(p)) return p;
		}
		return null;
	}
	for (const cmd of spec.linux) {
		const found = probe.which?.(cmd) ?? [
			"/usr/bin",
			"/usr/local/bin",
			"/snap/bin"
		].map((d) => `${d}/${cmd}`).find((p) => probe.fileExists(p));
		if (found) return found;
	}
	return null;
}
/** All usable browsers in priority order: C4HERO_BROWSER, the OS default when
*  Chromium-family, then every other installed Chromium-family browser. */
function listCandidates(platform, probe) {
	const out = [];
	const seen = /* @__PURE__ */ new Set();
	const push = (c) => {
		if (seen.has(c.path)) return;
		seen.add(c.path);
		out.push(c);
	};
	const override = probe.env.C4HERO_BROWSER;
	let envWarning;
	if (override) {
		if (probe.fileExists(override)) push({
			name: "C4HERO_BROWSER",
			path: override,
			source: "env"
		});
		else envWarning = `C4HERO_BROWSER=${override} does not exist and was ignored.`;
	}
	const defaultId = probe.readDefaultBrowserId();
	const defaultSpec = defaultId ? BROWSERS.find((b) => b.id.test(defaultId.toLowerCase())) : void 0;
	const defaultPath = defaultSpec ? findInstalled(defaultSpec, platform, probe) : null;
	if (defaultSpec && defaultPath) push({
		name: defaultSpec.name,
		path: defaultPath,
		source: "default"
	});
	let warning = envWarning;
	if (!defaultPath) {
		const why = defaultId ? defaultSpec ? `Default browser ${defaultSpec.name} was not found on disk` : `Default browser (${defaultId}) is not Chromium-based and cannot be driven headless` : "Could not determine the default browser";
		warning = [envWarning, `${why}; using another installed Chromium-based browser.`].filter(Boolean).join(" ");
	}
	for (const spec of BROWSERS) {
		const p = findInstalled(spec, platform, probe);
		if (p) push({
			name: spec.name,
			path: p,
			source: "fallback",
			...warning ? { warning } : {}
		});
	}
	return out;
}
/** Pure parser for `defaults read ...launchservices.secure LSHandlers` output. */
function parseMacDefaultHandler(text) {
	for (const raw of text.split(/^\s*\{\s*$/m)) {
		const entry = raw.replace(/=\s*\{[^{}]*\}\s*;/g, "");
		if (!/LSHandlerURLScheme\s*=\s*"?https"?\s*;/.test(entry)) continue;
		const m = /LSHandlerRoleAll\s*=\s*"?([^";\s]+)"?\s*;/.exec(entry);
		if (m) return m[1];
	}
	return null;
}
function run(cmd, args) {
	try {
		return execFileSync(cmd, args, {
			encoding: "utf8",
			timeout: 3e3,
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			]
		});
	} catch {
		return null;
	}
}
function systemProbe(platform = process.platform) {
	const home = homedir();
	return {
		env: process.env,
		home,
		fileExists: (p) => existsSync(p),
		which: platform === "win32" ? void 0 : (cmd) => run("which", [cmd])?.trim() || null,
		readDefaultBrowserId() {
			if (platform === "darwin") {
				const out = run("defaults", [
					"read",
					join(home, "Library/Preferences/com.apple.LaunchServices/com.apple.launchservices.secure"),
					"LSHandlers"
				]);
				return out ? parseMacDefaultHandler(out) : null;
			}
			if (platform === "win32") {
				const out = run("reg", [
					"query",
					"HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice",
					"/v",
					"ProgId"
				]);
				return out ? /ProgId\s+REG_SZ\s+(\S+)/.exec(out)?.[1] ?? null : null;
			}
			return run("xdg-settings", ["get", "default-web-browser"])?.trim() || null;
		}
	};
}
//#endregion
//#region src/cli/export/cdp.ts
/** Chrome DevTools Protocol over `--remote-debugging-pipe`: NUL-delimited JSON. */
var CdpPipe = class {
	nextId = 1;
	buffer = "";
	decoder = new StringDecoder("utf8");
	pending = /* @__PURE__ */ new Map();
	listeners = /* @__PURE__ */ new Map();
	closed = false;
	output;
	timeoutMs;
	constructor(input, output, timeoutMs = 3e4) {
		this.output = output;
		this.timeoutMs = timeoutMs;
		input.on("data", (chunk) => this.onData(typeof chunk === "string" ? chunk : this.decoder.write(chunk)));
		input.on("close", () => this.failAll("Browser pipe closed"));
		input.on("error", (e) => this.failAll(`Browser pipe error: ${e.message}`));
		output.on("error", (e) => this.failAll(`Browser pipe error: ${e.message}`));
	}
	send(method, params = {}, sessionId) {
		if (this.closed) return Promise.reject(/* @__PURE__ */ new Error("CDP pipe is closed"));
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(/* @__PURE__ */ new Error(`CDP ${method} timed out after ${this.timeoutMs}ms`));
			}, this.timeoutMs);
			this.pending.set(id, {
				resolve,
				reject,
				timer
			});
			this.output.write(JSON.stringify({
				id,
				method,
				params,
				...sessionId ? { sessionId } : {}
			}) + "\0");
		});
	}
	on(method, cb) {
		let set = this.listeners.get(method);
		if (!set) this.listeners.set(method, set = /* @__PURE__ */ new Set());
		set.add(cb);
		return () => set.delete(cb);
	}
	close() {
		this.failAll("CDP pipe is closed");
		this.output.end();
	}
	onData(text) {
		this.buffer += text;
		let idx;
		while ((idx = this.buffer.indexOf("\0")) !== -1) {
			const frame = this.buffer.slice(0, idx);
			this.buffer = this.buffer.slice(idx + 1);
			if (frame) this.dispatch(frame);
		}
	}
	dispatch(frame) {
		let msg;
		try {
			msg = JSON.parse(frame);
		} catch {
			return;
		}
		if (typeof msg.id === "number") {
			const p = this.pending.get(msg.id);
			if (!p) return;
			this.pending.delete(msg.id);
			clearTimeout(p.timer);
			if (msg.error) p.reject(/* @__PURE__ */ new Error(`CDP error ${msg.error.code}: ${msg.error.message}`));
			else p.resolve(msg.result);
		} else if (msg.method) for (const cb of this.listeners.get(msg.method) ?? []) cb(msg.params, msg.sessionId);
	}
	failAll(reason) {
		this.closed = true;
		for (const [id, p] of this.pending) {
			clearTimeout(p.timer);
			p.reject(new Error(reason));
			this.pending.delete(id);
		}
	}
};
var FLAGS = [
	"--headless=new",
	"--remote-debugging-pipe",
	"--no-first-run",
	"--no-default-browser-check",
	"--disable-extensions",
	"--disable-gpu",
	"--hide-scrollbars",
	"--mute-audio"
];
async function launchBrowser(candidate, opts) {
	const profile = await mkdtemp(join(tmpdir(), "c4hero-browser-"));
	const removeProfile = () => rm(profile, {
		recursive: true,
		force: true,
		maxRetries: 5,
		retryDelay: 100
	});
	try {
		const proc = spawn(candidate.path, [...FLAGS, `--user-data-dir=${profile}`], { stdio: [
			"ignore",
			"ignore",
			"pipe",
			"pipe",
			"pipe"
		] });
		await new Promise((resolve, reject) => {
			proc.once("spawn", resolve);
			proc.once("error", reject);
		});
		proc.on("error", () => {});
		proc.stderr?.resume();
		const cdp = new CdpPipe(proc.stdio[4], proc.stdio[3], opts.timeoutMs);
		const exited = new Promise((resolve) => proc.once("exit", () => resolve()));
		let closing;
		const close = () => closing ??= (async () => {
			try {
				cdp.close();
				if (proc.exitCode === null && proc.signalCode === null) {
					proc.kill("SIGKILL");
					await Promise.race([exited, new Promise((r) => setTimeout(r, 2e3))]);
				}
			} finally {
				await removeProfile();
			}
		})();
		return {
			cdp,
			close
		};
	} catch (e) {
		await removeProfile();
		throw e;
	}
}
/** Opens `url` in a new target, injecting `injectScript` before any page script runs. */
async function openPage(cdp, url, opts = {}) {
	const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
	const { sessionId } = await cdp.send("Target.attachToTarget", {
		targetId,
		flatten: true
	});
	await cdp.send("Page.enable", {}, sessionId);
	if (opts.injectScript) await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: opts.injectScript }, sessionId);
	const loaded = new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			off();
			reject(/* @__PURE__ */ new Error("Page load timed out"));
		}, opts.timeoutMs ?? 3e4);
		const off = cdp.on("Page.loadEventFired", (_p, sid) => {
			if (sid !== sessionId) return;
			clearTimeout(timer);
			off();
			resolve();
		});
	});
	loaded.catch(() => {});
	await cdp.send("Page.navigate", { url }, sessionId);
	await loaded;
	return {
		sessionId,
		async evaluate(expression, awaitPromise = false) {
			const res = await cdp.send("Runtime.evaluate", {
				expression,
				returnByValue: true,
				awaitPromise
			}, sessionId);
			if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
			return res.result.value;
		}
	};
}
//#endregion
//#region src/cli/export/server.ts
var CONTENT_TYPES = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".woff2": "font/woff2",
	".woff": "font/woff",
	".json": "application/json; charset=utf-8",
	".webmanifest": "application/manifest+json",
	".ico": "image/x-icon"
};
/** The built export viewer: `../viewer` next to the bundled `bin/c4hero.mjs`.
*  `C4HERO_VIEWER_DIR` overrides it (tests, local experiments). */
function resolveViewerDir(env = process.env) {
	return env.C4HERO_VIEWER_DIR || fileURLToPath(new URL("../viewer", import.meta.url));
}
/** Serves `dir` on 127.0.0.1 and a random port. Only files inside `dir` are
*  reachable; unknown extension-less paths fall back to index.html. */
async function startStaticServer(dir) {
	const root = realpathSync(dir);
	const send = (res, status, file, body) => {
		if (!file) {
			res.writeHead(status, { "content-type": "text/plain; charset=utf-8" }).end(body ?? "");
			return;
		}
		res.writeHead(status, { "content-type": CONTENT_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream" });
		createReadStream(file).on("error", () => res.destroy()).pipe(res);
	};
	const server = createServer((req, res) => {
		if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, null, "Method not allowed");
		let pathname;
		try {
			pathname = decodeURIComponent(new URL(req.url ?? "/", "http://127.0.0.1").pathname);
		} catch {
			return send(res, 400, null, "Bad request");
		}
		if (pathname.includes("\0")) return send(res, 400, null, "Bad request");
		const candidate = path.join(root, pathname);
		const inside = (p) => p === root || p.startsWith(root + path.sep);
		const serveable = (p) => {
			if (!inside(p) || !existsSync(p)) return false;
			try {
				return inside(realpathSync(p)) && statSync(p).isFile();
			} catch {
				return false;
			}
		};
		if (serveable(candidate)) return send(res, 200, candidate);
		if (!path.extname(pathname)) {
			const index = path.join(root, "index.html");
			if (serveable(index)) return send(res, 200, index);
		}
		send(res, 404, null, "Not found");
	});
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	const { port } = server.address();
	return {
		url: `http://127.0.0.1:${port}/`,
		close: () => new Promise((resolve) => {
			server.close(() => resolve());
			server.closeAllConnections();
		})
	};
}
//#endregion
//#region src/cli/commands/export.ts
var HARD_TIMEOUT_MS = 6e4;
var POLL_MS = 100;
var defaultDeps = {
	candidates: () => listCandidates(process.platform, systemProbe()),
	launch: launchBrowser,
	openPage,
	startServer: startStaticServer,
	viewerDir: () => resolveViewerDir(),
	timeoutMs: HARD_TIMEOUT_MS
};
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** Waits for the viewer to report ready (or an input error), within `deadline`. */
async function waitReady(page, deadline) {
	while (Date.now() < deadline) {
		const state = await page.evaluate("({ ready: window.__c4heroExportReady === true, error: window.__c4heroExportError ?? null })");
		if (state.error) throw new CliFailure("VALIDATION", `The export viewer rejected the workspace: ${state.error}`);
		if (state.ready) return;
		await sleep(POLL_MS);
	}
	throw new Error("Timed out waiting for the export viewer to become ready");
}
async function renderWith(deps, candidate, url, job) {
	const remaining = () => Math.max(1e3, job.deadline - Date.now());
	const browser = await deps.launch(candidate, { timeoutMs: remaining() });
	job.launched.push(browser);
	try {
		const page = await deps.openPage(browser.cdp, url, {
			injectScript: job.injectScript,
			timeoutMs: remaining()
		});
		await waitReady(page, job.deadline);
		const reply = await page.evaluate(`window.__c4heroExport(${JSON.stringify(job.request)})`, true);
		if (!reply.ok) throw new CliFailure("VALIDATION", `Export failed: ${reply.error}`);
		return Buffer.from(reply.base64, "base64");
	} finally {
		await browser.close();
	}
}
function envFailure(detail) {
	return new CliFailure("EXPORT_ENV", `${detail} Install a Chromium-based browser (Chrome, Edge, Brave, Chromium) or point C4HERO_BROWSER at its binary.`);
}
function createExportCommand(deps) {
	return {
		name: "export",
		summary: "Render a view to a PNG or SVG file using a local Chromium-based browser",
		flags: { values: [
			"view",
			"format",
			"theme",
			"out",
			"padding"
		] },
		usage: "export --view <key> --format png|svg [--theme light|dark] [--out <path>] [--padding <fraction, default 0.05>] [--file <dsl>]",
		async run(args, ctx) {
			const view = flag(args, "view");
			if (!view) throw new CliFailure("USAGE", "--view <key> is required");
			const format = flag(args, "format");
			if (format !== "png" && format !== "svg") throw new CliFailure("USAGE", "--format must be png or svg");
			const theme = flag(args, "theme") ?? "light";
			if (theme !== "light" && theme !== "dark") throw new CliFailure("USAGE", "--theme must be light or dark");
			const paddingRaw = flag(args, "padding");
			const padding = paddingRaw === void 0 ? void 0 : Number(paddingRaw);
			if (padding !== void 0 && !(Number.isFinite(padding) && padding >= 0)) throw new CliFailure("USAGE", "--padding must be a non-negative fraction of the canvas, e.g. 0.05");
			const session = openSession(discoverWorkspace({
				file: flag(args, "file"),
				cwd: ctx.cwd
			}), { force: true });
			const ws = session.workspace();
			if (!findViewHelper(ws, view)) throw new CliFailure("NOT_FOUND", `No view '${view}'.`, allViewsOf(ws).map((v) => v.key));
			const root = projectRootFor(session.file);
			const outFlag = flag(args, "out");
			const out = outFlag ? path.resolve(ctx.cwd, outFlag) : path.join(path.dirname(session.file), `${view}.${format}`);
			if (!isInsideRoot(root, out) || !isInsideRootReal(root, out)) throw new CliFailure("USAGE", `--out '${outFlag ?? out}' resolves outside the project root ${root}.`);
			if (path.extname(out).toLowerCase() !== `.${format}`) throw new CliFailure("USAGE", `--out '${outFlag ?? out}' must end in .${format} to match --format ${format}.`);
			if (hasHiddenSegment(path.relative(root, out))) throw new CliFailure("USAGE", `--out '${outFlag ?? out}' must not contain hidden ('.'-prefixed) path segments.`);
			const candidates = deps.candidates();
			if (candidates.length === 0) throw envFailure("No Chromium-based browser was found.");
			const sidecarPath = path.join(path.dirname(session.file), sidecarName(path.basename(session.file)));
			const input = {
				dsl: readFileSync(session.file, "utf8"),
				sidecar: existsSync(sidecarPath) ? readFileSync(sidecarPath, "utf8") : null,
				name: path.basename(session.file, path.extname(session.file))
			};
			const deadline = Date.now() + deps.timeoutMs;
			const job = {
				injectScript: `window.__C4HERO_EXPORT_INPUT__ = ${JSON.stringify(input)};`,
				request: {
					view,
					format,
					theme,
					...padding !== void 0 ? { padding } : {}
				},
				deadline,
				launched: []
			};
			const warnings = [];
			let timer;
			const server = await deps.startServer(deps.viewerDir());
			try {
				const work = (async () => {
					const failures = [];
					for (const candidate of candidates) try {
						return {
							candidate,
							bytes: await renderWith(deps, candidate, server.url, job)
						};
					} catch (e) {
						if (e instanceof CliFailure) throw e;
						failures.push(`${candidate.name}: ${e instanceof Error ? e.message : String(e)}`);
					}
					throw envFailure(`Could not export with any browser (${failures.join("; ")}).`);
				})();
				work.catch(() => {});
				const timeout = new Promise((_, reject) => {
					timer = setTimeout(() => reject(envFailure(`Export timed out after ${deps.timeoutMs / 1e3}s.`)), deps.timeoutMs);
				});
				const { candidate, bytes } = await Promise.race([work, timeout]);
				if (candidate.warning) warnings.push(candidate.warning);
				mkdirSync(path.dirname(out), { recursive: true });
				writeFileSync(out, bytes);
				return {
					ok: true,
					command: "export",
					file: session.file,
					data: {
						view,
						format,
						out,
						bytes: bytes.length,
						browser: {
							name: candidate.name,
							source: candidate.source
						}
					},
					warnings
				};
			} finally {
				clearTimeout(timer);
				await Promise.allSettled(job.launched.map((b) => b.close()));
				await server.close();
			}
		}
	};
}
var exportCommands = [createExportCommand(defaultDeps)];
//#endregion
//#region src/cli/commands/read.ts
var ELEMENT_TYPES = [
	"person",
	"softwareSystem",
	"container",
	"component"
];
function load(args, ctx) {
	const file = discoverWorkspace({
		file: flag(args, "file"),
		cwd: ctx.cwd
	});
	return {
		file,
		ws: openSession(file, { force: true }).workspace()
	};
}
function children(el) {
	if (el.type === "softwareSystem") return el.containers;
	if (el.type === "container") return el.components;
	return [];
}
function descendants(el) {
	return children(el).flatMap((c) => [c, ...descendants(c)]);
}
function allElements$1(ws) {
	return [...ws.model.people, ...ws.model.softwareSystems].flatMap((r) => [r, ...descendants(r)]);
}
function summarize(el, parent) {
	const tech = el.technology;
	return {
		id: el.id,
		type: el.type,
		name: el.name,
		...parent ? { parent: parent.id } : {},
		...el.description ? { description: el.description } : {},
		...tech ? { technology: tech } : {},
		tags: el.tags
	};
}
function result(command, file, data) {
	return {
		ok: true,
		command,
		file,
		data,
		warnings: []
	};
}
var list = {
	name: "list",
	summary: "List model elements",
	flags: { values: ["type", "parent"] },
	usage: "list [--type person|softwareSystem|container|component] [--parent <ref>] [--file <dsl>]",
	run(args, ctx) {
		const { file, ws } = load(args, ctx);
		const type = flag(args, "type");
		if (type !== void 0 && !ELEMENT_TYPES.includes(type)) throw new CliFailure("USAGE", `--type must be one of ${ELEMENT_TYPES.join(", ")}`);
		const parentRef = flag(args, "parent");
		const parent = parentRef === void 0 ? void 0 : resolveElement(ws, parentRef);
		const parents = parentMap(ws);
		return result("list", file, { elements: (parent ? children(parent) : allElements$1(ws)).filter((el) => type === void 0 || el.type === type).map((el) => summarize(el, parents.get(el.id))) });
	}
};
var show = {
	name: "show",
	summary: "Show one element with relationships and views",
	flags: {},
	usage: "show <ref> [--file <dsl>]",
	run(args, ctx) {
		const ref = args.positionals[0];
		if (!ref) throw new CliFailure("USAGE", "show requires <ref>");
		const { file, ws } = load(args, ctx);
		const el = resolveElement(ws, ref);
		const parent = parentMap(ws).get(el.id);
		const rel = (r) => ({
			id: r.id,
			source: r.sourceId,
			destination: r.destinationId,
			...r.description ? { description: r.description } : {},
			...r.technology ? { technology: r.technology } : {}
		});
		const location = el.type === "person" || el.type === "softwareSystem" ? el.location : void 0;
		const technology = el.type === "container" || el.type === "component" ? el.technology : void 0;
		return result("show", file, {
			id: el.id,
			type: el.type,
			name: el.name,
			description: el.description ?? null,
			technology: technology ?? null,
			tags: el.tags,
			properties: el.properties,
			url: el.url ?? null,
			documents: el.documents ?? [],
			status: el.status ?? null,
			owner: el.owner ?? null,
			location: location ?? null,
			parent: parent?.id ?? null,
			children: children(el).map((c) => c.id),
			incoming: ws.model.relationships.filter((r) => r.destinationId === el.id).map(rel),
			outgoing: ws.model.relationships.filter((r) => r.sourceId === el.id).map(rel),
			views: allViewsOf(ws).filter((v) => v.elements.some((e) => e.id === el.id)).map((v) => v.key)
		});
	}
};
function viewScope(v) {
	return v.containerId ?? v.softwareSystemId ?? v.environment ?? null;
}
var readCommands = [
	list,
	show,
	{
		name: "views",
		summary: "List views",
		flags: {},
		usage: "views [--file <dsl>]",
		run(args, ctx) {
			const { file, ws } = load(args, ctx);
			return result("views", file, { views: allViewsOf(ws).map((v) => ({
				key: v.key,
				type: v.type,
				title: v.title ?? null,
				scope: viewScope(v),
				elements: v.elements.length,
				relationships: v.relationships.length,
				autoLayout: v.autoLayout?.direction ?? null,
				locked: v.locked === true
			})) });
		}
	},
	{
		name: "graph",
		summary: "Nodes and edges of the model, or one element's neighbourhood",
		flags: {},
		usage: "graph [<ref>] [--file <dsl>]",
		run(args, ctx) {
			const { file, ws } = load(args, ctx);
			const ref = args.positionals[0];
			let edges = ws.model.relationships;
			let nodes = allElements$1(ws);
			if (ref !== void 0) {
				const root = resolveElement(ws, ref);
				const inside = new Set([root, ...descendants(root)].map((e) => e.id));
				edges = edges.filter((r) => inside.has(r.sourceId) || inside.has(r.destinationId));
				const keep = new Set(inside);
				for (const r of edges) {
					keep.add(r.sourceId);
					keep.add(r.destinationId);
				}
				nodes = nodes.filter((n) => keep.has(n.id));
			}
			const parents = parentMap(ws);
			return result("graph", file, {
				nodes: nodes.map((n) => ({
					id: n.id,
					type: n.type,
					name: n.name,
					...parents.get(n.id) ? { parent: parents.get(n.id).id } : {}
				})),
				edges: edges.map((r) => ({
					id: r.id,
					source: r.sourceId,
					destination: r.destinationId,
					...r.description ? { description: r.description } : {},
					...r.technology ? { technology: r.technology } : {}
				}))
			});
		}
	}
];
//#endregion
//#region src/cli/commands/relationships.ts
function csv(value) {
	return (value ?? "").split(",").map((t) => t.trim()).filter(Boolean);
}
function describe(rel) {
	return `${rel.sourceId}->${rel.destinationId}`;
}
function finish$1(command, session, args, rel, data) {
	const saved = session.save({ dryRun: boolFlag(args, "dry-run") });
	return {
		ok: true,
		command,
		file: session.file,
		changed: saved.changed ? { relationships: [rel] } : {},
		data: saved.diff !== void 0 ? {
			...data,
			diff: saved.diff
		} : data,
		warnings: []
	};
}
/** Fields shared by `relate` and `update-rel`; an empty value clears the field. */
function stylePatch(args) {
	const patch = {};
	for (const key of ["description", "technology"]) {
		const v = flag(args, key);
		if (v !== void 0) patch[key] = v === "" ? void 0 : v;
	}
	const interaction = flag(args, "interaction-style");
	if (interaction !== void 0) {
		if (interaction !== "" && !isInteractionStyle(interaction)) throw new CliFailure("USAGE", "--interaction-style must be Synchronous or Asynchronous");
		patch.interactionStyle = interaction === "" ? void 0 : interaction;
	}
	const line = flag(args, "line-style");
	if (line !== void 0) {
		if (line !== "" && !isLineStyle(line)) throw new CliFailure("USAGE", "--line-style must be Curved, Straight or Orthogonal");
		patch.lineStyle = line === "" ? void 0 : line;
	}
	return patch;
}
var relationshipCommands = [
	{
		name: "relate",
		summary: "Add a relationship between two elements",
		flags: {
			values: [
				"description",
				"technology",
				"interaction-style",
				"line-style",
				"tags"
			],
			booleans: MUTATING_BOOLEANS
		},
		usage: "relate <src> <dst> [--description] [--technology] [--interaction-style Synchronous|Asynchronous] [--line-style Curved|Straight|Orthogonal] [--tags a,b] [--file <dsl>] [--dry-run] [--force]",
		run(args, ctx) {
			const [srcRef, dstRef] = args.positionals;
			if (!srcRef || !dstRef) throw new CliFailure("USAGE", "relate requires <src> <dst>");
			const patch = stylePatch(args);
			const session = openForEdit(args, ctx);
			const src = resolveElement(session.workspace(), srcRef);
			const dst = resolveElement(session.workspace(), dstRef);
			if (src.id === dst.id) throw new CliFailure("VALIDATION", "A relationship needs two different elements");
			const store = session.actions();
			const id = store.addRelationship(src.id, dst.id, patch.description, patch.technology);
			if (!id) throw new CliFailure("VALIDATION", `Could not relate '${src.id}' to '${dst.id}'`);
			const tags = csv(flag(args, "tags"));
			const rel = session.workspace().model.relationships.find((r) => r.id === id);
			store.updateRelationship(id, {
				interactionStyle: patch.interactionStyle,
				lineStyle: patch.lineStyle,
				...tags.length > 0 ? { tags: [...rel.tags, ...tags.filter((t) => !rel.tags.includes(t))] } : {}
			});
			return finish$1("relate", session, args, describe(rel));
		}
	},
	{
		name: "update-rel",
		summary: "Update a relationship",
		flags: {
			values: [
				"match",
				"description",
				"technology",
				"interaction-style",
				"line-style",
				"url",
				"add-tag",
				"remove-tag",
				"property",
				"remove-property"
			],
			booleans: MUTATING_BOOLEANS
		},
		usage: "update-rel <relRef> [--match <current description>] [--description <new>] [--technology] [--interaction-style] [--line-style] [--url] [--add-tag t]... [--remove-tag t]... [--property k=v]... [--remove-property k]... [--file <dsl>] [--dry-run] [--force]",
		run(args, ctx) {
			const ref = args.positionals[0];
			if (!ref) throw new CliFailure("USAGE", "update-rel requires <relRef>");
			const session = openForEdit(args, ctx);
			const rel = resolveRelationship(session.workspace(), ref, flag(args, "match"));
			const patch = stylePatch(args);
			const url = flag(args, "url");
			if (url !== void 0) patch.url = url === "" ? void 0 : url;
			const addTags = flagAll(args, "add-tag");
			const removeTags = flagAll(args, "remove-tag");
			if (addTags.length > 0 || removeTags.length > 0) {
				const next = rel.tags.filter((t) => !removeTags.includes(t));
				for (const t of addTags) if (!next.includes(t)) next.push(t);
				patch.tags = next;
			}
			const setProps = flagAll(args, "property");
			const dropProps = flagAll(args, "remove-property");
			if (setProps.length > 0 || dropProps.length > 0) {
				const props = { ...rel.properties };
				for (const k of dropProps) delete props[k];
				for (const raw of setProps) {
					const eq = raw.indexOf("=");
					if (eq < 1) throw new CliFailure("USAGE", `--property expects key=value, got '${raw}'`);
					props[raw.slice(0, eq)] = raw.slice(eq + 1);
				}
				patch.properties = props;
			}
			const label = describe(rel);
			session.actions().updateRelationship(rel.id, patch);
			return finish$1("update-rel", session, args, label);
		}
	},
	{
		name: "unrelate",
		summary: "Remove a relationship",
		flags: {
			values: ["match"],
			booleans: MUTATING_BOOLEANS
		},
		usage: "unrelate <relRef> [--match <description>] [--file <dsl>] [--dry-run] [--force]",
		run(args, ctx) {
			const ref = args.positionals[0];
			if (!ref) throw new CliFailure("USAGE", "unrelate requires <relRef>");
			const session = openForEdit(args, ctx);
			const rel = resolveRelationship(session.workspace(), ref, flag(args, "match"));
			const label = describe(rel);
			session.actions().deleteRelationship(rel.id);
			session.recordRemoved(rel.id);
			return finish$1("unrelate", session, args, label);
		}
	}
];
//#endregion
//#region src/cli/commands/views.ts
var DIRECTIONS = [
	"TB",
	"BT",
	"LR",
	"RL"
];
var KEY_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
function finish(command, session, args, changed, warnings) {
	const saved = session.save({ dryRun: boolFlag(args, "dry-run") });
	return withRenamedViews({
		ok: true,
		command,
		file: session.file,
		changed: saved.changed ? changed : {},
		...saved.diff !== void 0 ? { data: { diff: saved.diff } } : {},
		warnings
	}, saved.renamedViews);
}
/** Replaces the workspace with an edited clone. For the few edits the store has
*  no action for (view key and description, relationship styles). */
function patchWorkspace(session, edit) {
	const next = structuredClone(session.workspace());
	edit(next);
	session.actions().resetWorkspaceTo(next);
}
function requireView(ws, key) {
	if (!key) throw new CliFailure("USAGE", "A view key is required");
	const view = findViewHelper(ws, key);
	if (!view) throw new CliFailure("NOT_FOUND", `No view '${key}'.`, allViewsOf(ws).map((v) => v.key).slice(0, 5));
	return view;
}
function number(args, name) {
	const raw = flag(args, name);
	if (raw === void 0) return void 0;
	const value = Number(raw);
	if (!Number.isFinite(value)) throw new CliFailure("USAGE", `--${name} must be a number`);
	return value;
}
function defaultTitle(type, scopeName) {
	switch (type) {
		case "systemLandscape": return "System Landscape";
		case "systemContext": return `${scopeName} — System Context`;
		case "container": return `${scopeName} — Containers`;
		case "component": return `${scopeName} — Components`;
		case "dynamic": return `${scopeName ?? "Workspace"} — Dynamic`;
		case "deployment": return `${scopeName ?? "Workspace"} — Deployment`;
	}
}
function viewAdd(args, session) {
	const ws = session.workspace();
	const typeFlag = flag(args, "type");
	const type = typeFlag === void 0 ? void 0 : VIEW_TYPE_WORDS[typeFlag];
	if (!type) throw new CliFailure("USAGE", `--type must be one of ${Object.keys(VIEW_TYPE_WORDS).join(", ")}`);
	const scopeRef = flag(args, "scope");
	let scopeId;
	let scopeName;
	if (type !== "systemLandscape" || scopeRef !== void 0) {
		if (scopeRef === void 0 && (type === "systemContext" || type === "container" || type === "component")) throw new CliFailure("USAGE", `--scope is required for a ${typeFlag} view`);
		if (scopeRef !== void 0) {
			const scope = resolveElement(ws, scopeRef);
			const wanted = type === "component" ? "container" : "softwareSystem";
			if (type === "systemLandscape" || scope.type !== wanted) throw new CliFailure("VALIDATION", `A ${typeFlag} view cannot be scoped to ${scope.type} '${scope.id}'.`);
			scopeId = scope.id;
			scopeName = scope.name;
		}
	}
	const environment = flag(args, "environment");
	if (type === "deployment" && !environment) throw new CliFailure("USAGE", "A deployment view requires --environment");
	const requestedKey = flag(args, "key");
	if (requestedKey !== void 0) {
		if (!KEY_PATTERN.test(requestedKey)) throw new CliFailure("VALIDATION", `Invalid view key '${requestedKey}'.`);
		if (findViewHelper(ws, requestedKey)) throw new CliFailure("VALIDATION", `A view with key '${requestedKey}' already exists.`);
	}
	const key = requestedKey ?? defaultViewKey(ws, type, scopeId);
	const title = flag(args, "title") ?? defaultTitle(type, scopeName);
	const description = flag(args, "description");
	const generated = session.actions().addView(type, scopeId, title, environment ? { environment } : void 0);
	patchWorkspace(session, (next) => {
		const view = findViewHelper(next, generated);
		view.key = key;
		if (description !== void 0) view.description = description;
	});
	session.markExplicitViewKey(key);
	return { views: [key] };
}
function viewUpdate(args, session, warnings) {
	const key = args.positionals[1];
	const ws = session.workspace();
	const view = requireView(ws, key);
	const include = flagAll(args, "include");
	const exclude = flagAll(args, "exclude");
	const direction = flag(args, "auto-layout");
	const title = flag(args, "title");
	const description = flag(args, "description");
	if (direction !== void 0 && !DIRECTIONS.includes(direction)) throw new CliFailure("USAGE", `--auto-layout must be one of ${DIRECTIONS.join(", ")}`);
	if (include.length + exclude.length === 0 && !direction && title === void 0 && description === void 0) throw new CliFailure("USAGE", "view update needs at least one of --include, --exclude, --auto-layout, --title, --description");
	if (view.locked) warnings.push(`view '${key}' is layout-locked; layout changes were ignored`);
	const actions = session.actions();
	for (const ref of include) {
		const current = new Set(requireView(session.workspace(), key).elements.map((e) => e.id));
		const ids = ref === "*" ? buildInitialViewContent(ws.model, view.type, view.containerId ?? view.softwareSystemId).elements.map((e) => e.id) : [resolveElement(ws, ref).id];
		for (const id of ids) if (!current.has(id)) actions.toggleElementInView(key, id);
	}
	if (exclude.length > 0) {
		const ids = exclude.map((ref) => resolveElement(ws, ref).id);
		actions.removeElementsFromView(key, ids);
		const remaining = new Set(requireView(session.workspace(), key).elements.map((e) => e.id));
		for (const id of ids) if (remaining.has(id)) warnings.push(`'${id}' is the view's scope and cannot be excluded`);
	}
	if (direction) actions.setLayoutDirection(key, direction);
	if (title !== void 0) actions.renameView(key, title);
	if (description !== void 0) patchWorkspace(session, (next) => {
		findViewHelper(next, key).description = description || void 0;
	});
	return { views: [key] };
}
function viewRemove(args, session) {
	const key = args.positionals[1];
	requireView(session.workspace(), key);
	session.actions().deleteView(key);
	return { views: [key] };
}
var view = {
	name: "view",
	summary: "Add, update or remove a view",
	flags: {
		booleans: MUTATING_BOOLEANS,
		bySubcommand: {
			add: { values: [
				"type",
				"scope",
				"key",
				"title",
				"description",
				"environment"
			] },
			update: { values: [
				"include",
				"exclude",
				"auto-layout",
				"title",
				"description"
			] },
			remove: {}
		}
	},
	usage: [
		"view add --type landscape|context|container|component|dynamic|deployment [--scope <ref>] [--key <key>] [--title <t>] [--description <d>] [--environment <env>]",
		"view update <key> [--include <ref|*>]... [--exclude <ref>]... [--auto-layout TB|BT|LR|RL] [--title <t>] [--description <d>]",
		"view remove <key>",
		"(all: [--file <dsl>] [--dry-run] [--force])"
	].join("\n"),
	run(args, ctx) {
		const sub = args.positionals[0];
		if (sub !== "add" && sub !== "update" && sub !== "remove") throw new CliFailure("USAGE", "view requires a subcommand: add, update or remove");
		const session = openForEdit(args, ctx);
		const warnings = [];
		return finish("view", session, args, sub === "add" ? viewAdd(args, session) : sub === "update" ? viewUpdate(args, session, warnings) : viewRemove(args, session), warnings);
	}
};
function elementStyle(args, tag) {
	const style = { tag };
	for (const name of [
		"background",
		"color",
		"shape",
		"border",
		"stroke",
		"icon"
	]) {
		const value = flag(args, name);
		if (value !== void 0) style[name] = value;
	}
	const fontSize = number(args, "font-size");
	const opacity = number(args, "opacity");
	const thickness = number(args, "thickness");
	if (fontSize !== void 0) style.fontSize = fontSize;
	if (opacity !== void 0) style.opacity = opacity;
	if (thickness !== void 0) style.strokeWidth = thickness;
	return style;
}
function relationshipStyle(args, tag) {
	const style = { tag };
	const color = flag(args, "color");
	if (color !== void 0) style.color = color;
	for (const [name, field] of [
		["thickness", "thickness"],
		["font-size", "fontSize"],
		["opacity", "opacity"]
	]) {
		const value = number(args, name);
		if (value !== void 0) style[field] = value;
	}
	const dashed = flag(args, "dashed");
	if (dashed !== void 0) {
		if (dashed !== "true" && dashed !== "false") throw new CliFailure("USAGE", "--dashed must be true or false");
		style.dashed = dashed === "true";
	}
	return style;
}
var viewCommands = [view, {
	name: "style",
	summary: "Set the style of an element or relationship tag",
	flags: {
		booleans: MUTATING_BOOLEANS,
		bySubcommand: {
			element: { values: [
				"tag",
				"background",
				"color",
				"shape",
				"border",
				"stroke",
				"thickness",
				"font-size",
				"opacity",
				"icon"
			] },
			relationship: { values: [
				"tag",
				"color",
				"thickness",
				"dashed",
				"font-size",
				"opacity"
			] }
		}
	},
	usage: [
		"style element --tag <tag> [--background <c>] [--color <c>] [--shape <s>] [--border <b>] [--stroke <c>] [--thickness <n>] [--font-size <n>] [--opacity <n>] [--icon <url>]",
		"style relationship --tag <tag> [--color <c>] [--thickness <n>] [--dashed true|false] [--font-size <n>] [--opacity <n>]",
		"(all: [--file <dsl>] [--dry-run] [--force])"
	].join("\n"),
	run(args, ctx) {
		const sub = args.positionals[0];
		if (sub !== "element" && sub !== "relationship") throw new CliFailure("USAGE", "style requires a subcommand: element or relationship");
		const tag = flag(args, "tag");
		if (!tag || tag === "true") throw new CliFailure("USAGE", `style ${sub} requires --tag`);
		const session = openForEdit(args, ctx);
		if (sub === "element") {
			const next = elementStyle(args, tag);
			if (Object.keys(next).length === 1) throw new CliFailure("USAGE", "style element needs at least one style flag");
			session.actions().updateElementStyle(next);
		} else {
			const next = relationshipStyle(args, tag);
			if (Object.keys(next).length === 1) throw new CliFailure("USAGE", "style relationship needs at least one style flag");
			patchWorkspace(session, (ws) => {
				const list = ws.views.configuration.styles.relationships;
				const idx = list.findIndex((r) => r.tag === tag);
				if (idx >= 0) list[idx] = {
					...list[idx],
					...next
				};
				else list.push(next);
			});
		}
		return finish("style", session, args, { styles: [`${sub}:${tag}`] }, []);
	}
}];
//#endregion
//#region src/lib/ai/context.ts
/** Walk people + systems + containers + components into a flat, ordered list. */
function flattenElements(ws) {
	const out = [];
	for (const p of ws.model.people) out.push({
		id: p.id,
		type: "person",
		name: p.name,
		description: p.description
	});
	for (const sys of ws.model.softwareSystems) {
		out.push({
			id: sys.id,
			type: "softwareSystem",
			name: sys.name,
			description: sys.description
		});
		for (const c of sys.containers) {
			out.push({
				id: c.id,
				type: "container",
				name: c.name,
				description: c.description,
				technology: c.technology,
				parentId: sys.id,
				parentName: sys.name
			});
			for (const comp of c.components) out.push({
				id: comp.id,
				type: "component",
				name: comp.name,
				description: comp.description,
				technology: comp.technology,
				parentId: c.id,
				parentName: c.name
			});
		}
	}
	return out;
}
/** True for an absent or whitespace-only string (missing name/description/tech). */
function isBlank(value) {
	return !value || value.trim().length === 0;
}
/** Relationships whose description is empty. */
function relationshipsMissingDescription(ws) {
	return ws.model.relationships.filter((r) => isBlank(r.description));
}
//#endregion
//#region src/lib/ai/schema.ts
/** Valid lifecycle status values (mirrors ElementStatus). */
var ELEMENT_STATUS_VALUES = /* @__PURE__ */ new Set([
	"Live",
	"Planned",
	"Deprecated",
	"Removed"
]);
/** Valid view-type values (mirrors ViewType). */
var VIEW_TYPE_VALUES = /* @__PURE__ */ new Set([
	"systemLandscape",
	"systemContext",
	"container",
	"component"
]);
/** Maximum length (chars) for description fields. */
var MAX_DESCRIPTION_LENGTH = 2e3;
var OP_NAMES = /* @__PURE__ */ new Set([
	"addPerson",
	"addSoftwareSystem",
	"addContainer",
	"addComponent",
	"addRelationship",
	"updateElement",
	"updateRelationship",
	"deleteElement",
	"addView"
]);
var OP_STRING_FIELDS = [
	"ref",
	"id",
	"name",
	"description",
	"technology",
	"parent",
	"source",
	"destination",
	"owner",
	"scope",
	"title"
];
function hasValidOpFieldTypes(value) {
	for (const field of OP_STRING_FIELDS) if (value[field] !== void 0 && typeof value[field] !== "string") return false;
	if (value.external !== void 0 && typeof value.external !== "boolean") return false;
	if (value.tags !== void 0 && !isStringArray$1(value.tags)) return false;
	if (value.location !== void 0 && typeof value.location !== "string") return false;
	if (value.viewType !== void 0 && typeof value.viewType !== "string") return false;
	return value.status === void 0 || typeof value.status === "string";
}
function isEditOp(value) {
	if (!isRecord(value) || typeof value.op !== "string" || !OP_NAMES.has(value.op)) return false;
	if (!hasValidOpFieldTypes(value)) return false;
	switch (value.op) {
		case "addPerson":
		case "addSoftwareSystem": return typeof value.ref === "string" && typeof value.name === "string";
		case "addContainer":
		case "addComponent": return typeof value.ref === "string" && typeof value.name === "string" && typeof value.parent === "string";
		case "addRelationship": return typeof value.source === "string" && typeof value.destination === "string";
		case "updateElement":
		case "updateRelationship":
		case "deleteElement": return typeof value.id === "string";
		case "addView": return typeof value.viewType === "string" && VIEW_TYPE_VALUES.has(value.viewType);
		default: return false;
	}
}
/** Strip C0 control characters (U+0000 through U+001F) from a string, preserving
*  newline and tab when keepLinebreaks is true. */
function stripControlChars(s, keepLinebreaks) {
	if (keepLinebreaks) return s.split("").filter((c) => {
		const code = c.charCodeAt(0);
		return code >= 32 || code === 9 || code === 10;
	}).join("");
	return s.split("").filter((c) => c.charCodeAt(0) >= 32).join("");
}
/** Sanitize an EditOp: truncate text fields, strip control chars, enforce id-field
*  length limits, and cap tags. Returns the sanitized op or null if the op should
*  be dropped entirely (e.g., an id-field exceeds MAX_ID_FIELD_LENGTH). */
function sanitizeEditOp(op) {
	const opAny = op;
	for (const field of [
		"ref",
		"id",
		"parent",
		"source",
		"destination",
		"scope"
	]) if (field in opAny && typeof opAny[field] === "string") {
		if (opAny[field].length > 512) return null;
	}
	const result = { ...op };
	if (typeof result.name === "string") result.name = stripControlChars(result.name, false).slice(0, 200);
	if (typeof result.description === "string") result.description = stripControlChars(result.description, true).slice(0, MAX_DESCRIPTION_LENGTH);
	if (typeof result.technology === "string") result.technology = stripControlChars(result.technology, false).slice(0, 100);
	if (typeof result.owner === "string") result.owner = stripControlChars(result.owner, false).slice(0, 120);
	if (typeof result.title === "string") result.title = stripControlChars(result.title, false).slice(0, 120);
	if (Array.isArray(result.tags)) {
		const tags = result.tags.slice(0, 20).map((t) => {
			if (typeof t === "string") {
				const trimmed = t.trim();
				return trimmed.length <= 80 ? trimmed : null;
			}
			return null;
		}).filter((t) => t !== null && t.length > 0);
		result.tags = tags.length > 0 ? tags : void 0;
	}
	return result;
}
//#endregion
//#region src/lib/ai/operations.ts
function editOpRank(op) {
	switch (op.op) {
		case "addPerson":
		case "addSoftwareSystem": return 0;
		case "addContainer": return 1;
		case "addComponent": return 2;
		case "addRelationship": return 3;
		case "updateElement":
		case "updateRelationship": return 4;
		case "addView": return 5;
		case "deleteElement": return 6;
		default: return 4;
	}
}
function optStr(v) {
	return typeof v === "string" && v.trim() ? v.trim() : void 0;
}
/** Validate an AI-proposed status against the enum, dropping anything invalid so
*  a bogus value never reaches the store. */
function optStatus(v) {
	return typeof v === "string" && ELEMENT_STATUS_VALUES.has(v) ? v : void 0;
}
/** Merge AI-proposed category tags into an element's existing tags. Additive by
*  design: replacing the array would strip structural tags (Element, Container,
*  Database, …) that drive styling, so "tag your datastores" would silently
*  break the diagram. Returns a new array only when it genuinely adds a tag
*  (case-insensitive), else undefined so the update is a no-op. */
function mergeTags(existing, proposed) {
	if (!Array.isArray(proposed)) return void 0;
	const clean = proposed.map((t) => typeof t === "string" ? t.trim() : "").filter(Boolean);
	if (!clean.length) return void 0;
	const base = existing ?? [];
	const seen = new Set(base.map((t) => t.toLowerCase()));
	const out = [...base];
	for (const t of clean) {
		const k = t.toLowerCase();
		if (!seen.has(k)) {
			seen.add(k);
			out.push(t);
		}
	}
	return out.length > base.length ? out : void 0;
}
/** Apply each operation in dependency order, resolving refs to real ids. Invalid
*  ops (unknown parent, missing element, empty name) are skipped, not fatal. */
function applyEditPlan(plan, actions, ws) {
	const refMap = /* @__PURE__ */ new Map();
	const nameToId = /* @__PURE__ */ new Map();
	const validIds = /* @__PURE__ */ new Set();
	const systemIds = /* @__PURE__ */ new Set();
	const containerIds = /* @__PURE__ */ new Set();
	for (const el of flattenElements(ws)) {
		validIds.add(el.id);
		const key = el.name.trim().toLowerCase();
		if (key && !nameToId.has(key)) nameToId.set(key, el.id);
		if (el.type === "softwareSystem") systemIds.add(el.id);
		else if (el.type === "container") containerIds.add(el.id);
	}
	const relIds = new Set(ws.model.relationships.map((r) => r.id));
	const preExistingIds = new Set(validIds);
	const sameplanContainerParents = /* @__PURE__ */ new Set();
	const tagsById = /* @__PURE__ */ new Map();
	for (const p of ws.model.people) tagsById.set(p.id, p.tags);
	for (const sys of ws.model.softwareSystems) {
		tagsById.set(sys.id, sys.tags);
		for (const c of sys.containers) {
			tagsById.set(c.id, c.tags);
			for (const comp of c.components) tagsById.set(comp.id, comp.tags);
		}
	}
	const externalSystemIds = new Set(ws.model.softwareSystems.filter((s) => s.location === "External").map((s) => s.id));
	const systemsWithContainers = new Set(ws.model.softwareSystems.filter((s) => Array.isArray(s.containers) && s.containers.length > 0).map((s) => s.id));
	const applied = [];
	const register = (ref, id, name, tags) => {
		if (ref && !preExistingIds.has(ref) && !refMap.has(ref)) refMap.set(ref, id);
		validIds.add(id);
		tagsById.set(id, tags);
		const key = name.trim().toLowerCase();
		if (key && !nameToId.has(key)) nameToId.set(key, id);
	};
	const resolve = (token) => {
		if (!token) return null;
		if (refMap.has(token)) return refMap.get(token);
		if (validIds.has(token)) return token;
		return nameToId.get(token.trim().toLowerCase()) ?? null;
	};
	const resolveExact = (token) => {
		if (!token) return null;
		if (refMap.has(token)) return refMap.get(token);
		return validIds.has(token) ? token : null;
	};
	const skip = (op, reason) => applied.push({
		op,
		ok: false,
		reason
	});
	const ok = (op) => applied.push({
		op,
		ok: true
	});
	const ordered = [...plan.operations].sort((a, b) => editOpRank(a) - editOpRank(b));
	for (const op of ordered) switch (op.op) {
		case "addPerson": {
			if (!op.name?.trim()) {
				skip(op, "missing name");
				break;
			}
			const id = actions.addPerson(op.name.trim());
			register(op.ref, id, op.name, ["Element", "Person"]);
			const desc = optStr(op.description);
			if (desc) actions.updateElement(id, { description: desc });
			ok(op);
			break;
		}
		case "addSoftwareSystem": {
			if (!op.name?.trim()) {
				skip(op, "missing name");
				break;
			}
			const id = actions.addSoftwareSystem(op.name.trim(), op.external);
			register(op.ref, id, op.name, ["Element", "Software System"]);
			systemIds.add(id);
			if (op.external) externalSystemIds.add(id);
			const desc = optStr(op.description);
			if (desc) actions.updateElement(id, { description: desc });
			ok(op);
			break;
		}
		case "addContainer": {
			const parentId = resolve(op.parent);
			if (!parentId) {
				skip(op, "unknown parent system");
				break;
			}
			if (!systemIds.has(parentId)) {
				skip(op, "parent is not a software system");
				break;
			}
			if (externalSystemIds.has(parentId)) {
				skip(op, "parent is an external system");
				break;
			}
			if (!op.name?.trim()) {
				skip(op, "missing name");
				break;
			}
			const id = actions.addContainer(parentId, op.name.trim());
			register(op.ref, id, op.name, ["Element", "Container"]);
			containerIds.add(id);
			sameplanContainerParents.add(parentId);
			const desc = optStr(op.description), tech = optStr(op.technology);
			if (desc || tech) actions.updateElement(id, {
				description: desc,
				technology: tech
			});
			ok(op);
			break;
		}
		case "addComponent": {
			const parentId = resolve(op.parent);
			if (!parentId) {
				skip(op, "unknown parent container");
				break;
			}
			if (!containerIds.has(parentId)) {
				skip(op, "parent is not a container");
				break;
			}
			if (!op.name?.trim()) {
				skip(op, "missing name");
				break;
			}
			const id = actions.addComponent(parentId, op.name.trim());
			register(op.ref, id, op.name, ["Element", "Component"]);
			const desc = optStr(op.description), tech = optStr(op.technology);
			if (desc || tech) actions.updateElement(id, {
				description: desc,
				technology: tech
			});
			ok(op);
			break;
		}
		case "addRelationship": {
			const source = resolve(op.source);
			const destination = resolve(op.destination);
			if (!source || !destination) {
				skip(op, "unknown source or destination");
				break;
			}
			if (source === destination) {
				skip(op, "self-relationship");
				break;
			}
			if (!actions.addRelationship(source, destination, optStr(op.description), optStr(op.technology))) {
				skip(op, "could not create relationship");
				break;
			}
			ok(op);
			break;
		}
		case "updateElement": {
			const id = resolveExact(op.id);
			if (!id) {
				skip(op, "element not found");
				break;
			}
			if (op.location === "External" && (systemsWithContainers.has(id) || sameplanContainerParents.has(id))) {
				skip(op, "system has containers");
				break;
			}
			const name = optStr(op.name);
			const description = optStr(op.description);
			const technology = optStr(op.technology);
			const owner = optStr(op.owner);
			const status = optStatus(op.status);
			const tags = mergeTags(tagsById.get(id), op.tags);
			actions.updateElement(id, {
				...name && { name },
				...description && { description },
				...technology && { technology },
				...tags && { tags },
				...status && { status },
				...owner && { owner },
				location: op.location === "External" || op.location === "Internal" ? op.location : void 0
			});
			if (tags) tagsById.set(id, tags);
			ok(op);
			break;
		}
		case "updateRelationship": {
			if (!relIds.has(op.id)) {
				skip(op, "relationship not found");
				break;
			}
			const description = optStr(op.description);
			const technology = optStr(op.technology);
			actions.updateRelationship(op.id, {
				...description && { description },
				...technology && { technology }
			});
			ok(op);
			break;
		}
		case "addView": {
			const title = optStr(op.title);
			if (op.viewType === "systemLandscape") {
				actions.addView("systemLandscape", void 0, title);
				ok(op);
				break;
			}
			const scopeId = resolve(op.scope);
			if (!scopeId) {
				skip(op, "unknown view scope element");
				break;
			}
			if (op.viewType === "systemContext" || op.viewType === "container") {
				if (!systemIds.has(scopeId)) {
					skip(op, "view scope is not a software system");
					break;
				}
			} else if (!containerIds.has(scopeId)) {
				skip(op, "view scope is not a container");
				break;
			}
			actions.addView(op.viewType, scopeId, title);
			ok(op);
			break;
		}
		case "deleteElement": {
			const id = resolveExact(op.id);
			if (!id) {
				skip(op, "element not found");
				break;
			}
			actions.deleteElement(id);
			ok(op);
			break;
		}
		default: skip(op, "unknown operation");
	}
	const appliedCount = applied.filter((a) => a.ok).length;
	return {
		applied,
		appliedCount,
		skippedCount: applied.length - appliedCount
	};
}
/** One-line, human-readable summary of an ApplyResult's skipped operations,
*  or null when everything applied. Reasons are grouped and counted so the UI
*  can show e.g. "Skipped 2 of 7 changes — unknown parent system (2)." —
*  applyEditPlan skips invalid ops rather than failing, and silently dropping
*  them reads as success to the user. */
function summarizeSkips(result) {
	if (result.skippedCount === 0) return null;
	const counts = /* @__PURE__ */ new Map();
	for (const a of result.applied) {
		if (a.ok) continue;
		const reason = a.reason ?? "unknown reason";
		counts.set(reason, (counts.get(reason) ?? 0) + 1);
	}
	const reasons = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([reason, n]) => n > 1 ? `${reason} (${n})` : reason).join(", ");
	const total = result.applied.length;
	return `Skipped ${result.skippedCount} of ${total} ${total === 1 ? "change" : "changes"} — ${reasons}.`;
}
//#endregion
//#region src/lib/ai/sweep.ts
/**
* Every instantly-detectable missing-info gap, in sweep order: titles first
* (most glaring), then descriptions, technologies, and untyped relationships.
* When `scopeIds` is given (the element + relationship ids shown in a view), only
* gaps for those targets are returned — so "Improve this view" stays in-view.
*/
function missingInfoGaps(ws, scopeIds) {
	const gaps = [];
	const all = flattenElements(ws);
	const names = new Map(all.map((el) => [el.id, el.name]));
	const els = scopeIds ? all.filter((el) => scopeIds.has(el.id)) : all;
	for (const el of els) if (isBlank(el.name)) gaps.push({
		key: `title:${el.id}`,
		kind: "title",
		targetId: el.id,
		targetKind: "element",
		label: "(unnamed element)",
		elementType: el.type
	});
	for (const el of els) if (isBlank(el.description)) gaps.push({
		key: `desc:${el.id}`,
		kind: "desc",
		targetId: el.id,
		targetKind: "element",
		label: el.name || "(unnamed element)",
		elementType: el.type
	});
	for (const el of els) if ((el.type === "container" || el.type === "component") && isBlank(el.technology)) gaps.push({
		key: `tech:${el.id}`,
		kind: "tech",
		targetId: el.id,
		targetKind: "element",
		label: el.name || "(unnamed element)",
		elementType: el.type
	});
	for (const r of relationshipsMissingDescription(ws)) {
		if (scopeIds && !scopeIds.has(r.id)) continue;
		const label = `${names.get(r.sourceId) ?? r.sourceId} → ${names.get(r.destinationId) ?? r.destinationId}`;
		gaps.push({
			key: `rel:${r.id}`,
			kind: "rel",
			targetId: r.id,
			targetKind: "relationship",
			label
		});
	}
	return gaps;
}
/** Field-level completeness for the review header ("X of Y fields complete").
*  Always-present fields are counted in BOTH the
*  numerator and the denominator — each element's type (and its name, when set)
*  plus each relationship's endpoints — so a fresh model reads as mostly
*  complete instead of a discouraging 0%. */
function healthFieldCounts(ws, scopeIds) {
	const all = flattenElements(ws);
	const els = scopeIds ? all.filter((e) => scopeIds.has(e.id)) : all;
	const rels = (ws.model.relationships ?? []).filter((r) => !scopeIds || scopeIds.has(r.id));
	let total = els.length + rels.length;
	let filled = els.length + rels.length;
	for (const el of els) {
		total += 2;
		if (!isBlank(el.name)) filled += 1;
		if (!isBlank(el.description)) filled += 1;
		if (el.type === "container" || el.type === "component") {
			total += 1;
			if (!isBlank(el.technology)) filled += 1;
		}
	}
	for (const r of rels) {
		total += 1;
		if (!isBlank(r.description)) filled += 1;
	}
	return {
		filled,
		total,
		pct: total === 0 ? 100 : Math.round(filled / total * 100)
	};
}
//#endregion
//#region src/lib/modelIntegrity.ts
/**
* Walk the model defensively, tolerating any shape of corruption (missing
* arrays, non-array values, non-object entries) without throwing. Returns
* every element found, plus a running list of structural violations
* discovered along the way (missing containers/components arrays, non-object
* array entries).
*/
function walkElements(model, violations) {
	const out = [];
	if (!model || typeof model !== "object") return out;
	const people = Array.isArray(model.people) ? model.people : [];
	for (const p of people) if (p && typeof p === "object") out.push({
		element: p,
		kind: "person"
	});
	const systems = Array.isArray(model.softwareSystems) ? model.softwareSystems : [];
	for (const s of systems) {
		if (!s || typeof s !== "object") continue;
		const system = s;
		out.push({
			element: system,
			kind: "softwareSystem"
		});
		if (!("containers" in system) || !Array.isArray(system.containers)) {
			violations.push({
				code: "malformed-containers",
				message: `Software system "${String(system.name ?? system.id)}" has a missing or non-array "containers" field.`,
				elementId: typeof system.id === "string" ? system.id : void 0
			});
			continue;
		}
		for (const c of system.containers) {
			if (!c || typeof c !== "object") {
				violations.push({
					code: "malformed-container-entry",
					message: `Software system "${String(system.name ?? system.id)}" has a non-object entry in its "containers" array.`,
					elementId: typeof system.id === "string" ? system.id : void 0
				});
				continue;
			}
			const container = c;
			out.push({
				element: container,
				kind: "container"
			});
			if (!("components" in container) || !Array.isArray(container.components)) {
				violations.push({
					code: "malformed-components",
					message: `Container "${String(container.name ?? container.id)}" has a missing or non-array "components" field.`,
					elementId: typeof container.id === "string" ? container.id : void 0
				});
				continue;
			}
			for (const cmp of container.components) {
				if (!cmp || typeof cmp !== "object") {
					violations.push({
						code: "malformed-component-entry",
						message: `Container "${String(container.name ?? container.id)}" has a non-object entry in its "components" array.`,
						elementId: typeof container.id === "string" ? container.id : void 0
					});
					continue;
				}
				out.push({
					element: cmp,
					kind: "component"
				});
			}
		}
	}
	return out;
}
function isStringArray(value) {
	return Array.isArray(value) && value.every((v) => typeof v === "string");
}
/** Checks a workspace's model + views for structural integrity. Never throws. */
function checkModelIntegrity(ws) {
	const violations = [];
	if (!ws || typeof ws !== "object") return violations;
	const walked = walkElements(ws.model, violations);
	const seenIds = /* @__PURE__ */ new Set();
	const elementIdToKind = /* @__PURE__ */ new Map();
	for (const { element, kind } of walked) {
		const id = element && typeof element.id === "string" ? element.id : void 0;
		if (!id) continue;
		if (seenIds.has(id)) violations.push({
			code: "duplicate-id",
			message: `Id "${id}" is used by more than one element or relationship.`,
			elementId: id
		});
		else seenIds.add(id);
		if (!elementIdToKind.has(id)) elementIdToKind.set(id, kind);
	}
	const relationships = Array.isArray(ws.model?.relationships) ? ws.model.relationships : [];
	for (const rel of relationships) {
		if (!rel || typeof rel !== "object") continue;
		const id = typeof rel.id === "string" ? rel.id : void 0;
		if (id) {
			if (seenIds.has(id)) violations.push({
				code: "duplicate-id",
				message: `Id "${id}" is used by more than one element or relationship.`,
				relationshipId: id
			});
			else seenIds.add(id);
		}
		const sourceOk = typeof rel.sourceId === "string" && elementIdToKind.has(rel.sourceId);
		const destOk = typeof rel.destinationId === "string" && elementIdToKind.has(rel.destinationId);
		if (!sourceOk || !destOk) violations.push({
			code: "dangling-relationship",
			message: `Relationship "${id ?? "?"}" has a source or destination that does not resolve to an existing element.`,
			relationshipId: id
		});
	}
	const systems = Array.isArray(ws.model?.softwareSystems) ? ws.model.softwareSystems : [];
	for (const s of systems) {
		if (!s || typeof s !== "object") continue;
		const system = s;
		if (system.location === "External" && Array.isArray(system.containers) && system.containers.length > 0) violations.push({
			code: "external-system-has-containers",
			message: `Software system "${String(system.name ?? system.id)}" is marked External but has ${system.containers.length} container(s).`,
			elementId: typeof system.id === "string" ? system.id : void 0
		});
	}
	for (const { element } of walked) if (!isStringArray(element?.tags)) violations.push({
		code: "bad-tags",
		message: `Element "${String(element?.name ?? element?.id)}" has a "tags" field that is not a string array.`,
		elementId: typeof element?.id === "string" ? element.id : void 0
	});
	for (const rel of relationships) {
		if (!rel || typeof rel !== "object") continue;
		if (!isStringArray(rel.tags)) violations.push({
			code: "bad-tags",
			message: `Relationship "${String(rel.id)}" has a "tags" field that is not a string array.`,
			relationshipId: typeof rel.id === "string" ? rel.id : void 0
		});
	}
	const relIds = new Set(relationships.filter((r) => r && typeof r === "object" && typeof r.id === "string").map((r) => r.id));
	const views = ws.views && typeof ws.views === "object" ? ws.views : void 0;
	function checkViewRefs(view) {
		const key = typeof view?.key === "string" ? view.key : void 0;
		const viewElements = Array.isArray(view?.elements) ? view.elements : [];
		for (const ve of viewElements) if (!ve || typeof ve !== "object" || typeof ve.id !== "string" || !elementIdToKind.has(ve.id)) violations.push({
			code: "dangling-view-ref",
			message: `View "${key ?? "?"}" references an element id that does not exist in the model.`,
			viewKey: key
		});
		const viewRelationships = Array.isArray(view?.relationships) ? view.relationships : [];
		for (const vr of viewRelationships) if (!vr || typeof vr !== "object" || typeof vr.id !== "string" || !relIds.has(vr.id)) violations.push({
			code: "dangling-view-ref",
			message: `View "${key ?? "?"}" references a relationship id that does not exist in the model.`,
			viewKey: key
		});
	}
	function checkScope(view, field, wantKind) {
		const key = typeof view?.key === "string" ? view.key : void 0;
		const scopeId = view ? view[field] : void 0;
		if (typeof scopeId !== "string" || elementIdToKind.get(scopeId) !== wantKind) violations.push({
			code: "bad-view-scope",
			message: `View "${key ?? "?"}" has a scope reference that does not resolve to an existing ${wantKind}.`,
			viewKey: key
		});
	}
	if (views) {
		for (const v of Array.isArray(views.systemLandscapeViews) ? views.systemLandscapeViews : []) {
			if (!v || typeof v !== "object") continue;
			checkViewRefs(v);
		}
		for (const v of Array.isArray(views.systemContextViews) ? views.systemContextViews : []) {
			if (!v || typeof v !== "object") continue;
			checkScope(v, "softwareSystemId", "softwareSystem");
			checkViewRefs(v);
		}
		for (const v of Array.isArray(views.containerViews) ? views.containerViews : []) {
			if (!v || typeof v !== "object") continue;
			checkScope(v, "softwareSystemId", "softwareSystem");
			checkViewRefs(v);
		}
		for (const v of Array.isArray(views.componentViews) ? views.componentViews : []) {
			if (!v || typeof v !== "object") continue;
			checkScope(v, "containerId", "container");
			checkViewRefs(v);
		}
	}
	return violations;
}
//#endregion
//#region src/lib/templates/bigBank.ts
/** Big Bank plc — classic Structurizr example workspace */
function createBigBankSample() {
	return {
		name: "Big Bank plc",
		description: "A model of the Big Bank plc software system landscape.",
		model: {
			people: [
				{
					id: "customer",
					type: "person",
					name: "Personal Banking Customer",
					description: "A customer of the bank, with personal bank accounts.",
					tags: [
						"Element",
						"Person",
						"Customer"
					],
					properties: {},
					location: "External"
				},
				{
					id: "supportStaff",
					type: "person",
					name: "Customer Service Staff",
					description: "Customer service staff within the bank.",
					tags: [
						"Element",
						"Person",
						"Bank Staff"
					],
					properties: {},
					location: "Internal"
				},
				{
					id: "backoffice",
					type: "person",
					name: "Back Office Staff",
					description: "Administration and support staff within the bank.",
					tags: [
						"Element",
						"Person",
						"Bank Staff"
					],
					properties: {},
					location: "Internal"
				}
			],
			softwareSystems: [
				{
					id: "internetBanking",
					type: "softwareSystem",
					name: "Internet Banking System",
					description: "Allows customers to view information about their bank accounts, and make payments.",
					tags: ["Element", "Software System"],
					properties: {},
					location: "Internal",
					containers: [
						{
							id: "singlePageApp",
							type: "container",
							name: "Single-Page Application",
							description: "Provides all of the Internet banking functionality to customers via their web browser.",
							technology: "JavaScript, Angular",
							tags: ["Element", "Container"],
							properties: {},
							components: []
						},
						{
							id: "mobileApp",
							type: "container",
							name: "Mobile App",
							description: "Provides a limited subset of the Internet banking functionality to customers via their mobile device.",
							technology: "Xamarin",
							tags: ["Element", "Container"],
							properties: {},
							components: []
						},
						{
							id: "webApp",
							type: "container",
							name: "Web Application",
							description: "Delivers the single page application.",
							technology: "Java, Spring MVC",
							tags: ["Element", "Container"],
							properties: {},
							components: []
						},
						{
							id: "apiApp",
							type: "container",
							name: "API Application",
							description: "Provides Internet banking functionality via a JSON/HTTPS API.",
							technology: "Java, Spring MVC",
							tags: ["Element", "Container"],
							properties: {},
							components: [
								{
									id: "signinController",
									type: "component",
									name: "Sign In Controller",
									description: "Allows users to sign in to the Internet Banking System.",
									technology: "Spring MVC Controller",
									tags: ["Element", "Component"],
									properties: {}
								},
								{
									id: "resetPassController",
									type: "component",
									name: "Reset Password Controller",
									description: "Allows users to reset their passwords.",
									technology: "Spring MVC Controller",
									tags: ["Element", "Component"],
									properties: {}
								},
								{
									id: "accountsSummary",
									type: "component",
									name: "Accounts Summary Controller",
									description: "Provides customers with a summary of their bank accounts.",
									technology: "Spring MVC Controller",
									tags: ["Element", "Component"],
									properties: {}
								},
								{
									id: "securityComponent",
									type: "component",
									name: "Security Component",
									description: "Provides functionality related to signing in, changing passwords, etc.",
									technology: "Spring Bean",
									tags: ["Element", "Component"],
									properties: {}
								},
								{
									id: "emailComponent",
									type: "component",
									name: "E-mail Component",
									description: "Sends e-mails to users.",
									technology: "Spring Bean",
									tags: ["Element", "Component"],
									properties: {}
								},
								{
									id: "mainframeFacade",
									type: "component",
									name: "Mainframe Banking System Facade",
									description: "A facade onto the mainframe banking system.",
									technology: "Spring Bean",
									tags: ["Element", "Component"],
									properties: {}
								}
							]
						},
						{
							id: "database",
							type: "container",
							name: "Database",
							description: "Stores user registration information, hashed authentication credentials, access logs, etc.",
							technology: "Oracle 12c",
							tags: [
								"Element",
								"Container",
								"Database"
							],
							properties: {},
							components: []
						}
					]
				},
				{
					id: "mainframe",
					type: "softwareSystem",
					name: "Mainframe Banking System",
					description: "Stores all of the core banking information about customers, accounts, transactions, etc.",
					tags: [
						"Element",
						"Software System",
						"Existing System"
					],
					properties: {},
					location: "Internal",
					containers: []
				},
				{
					id: "email",
					type: "softwareSystem",
					name: "E-mail System",
					description: "The internal Microsoft Exchange e-mail system.",
					tags: [
						"Element",
						"Software System",
						"Existing System"
					],
					properties: {},
					location: "Internal",
					containers: []
				},
				{
					id: "atm",
					type: "softwareSystem",
					name: "ATM",
					description: "Allows customers to withdraw cash.",
					tags: [
						"Element",
						"Software System",
						"Existing System"
					],
					properties: {},
					location: "Internal",
					containers: []
				}
			],
			relationships: [
				{
					id: "r1",
					sourceId: "customer",
					destinationId: "internetBanking",
					description: "Views account balances and makes payments",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r2",
					sourceId: "internetBanking",
					destinationId: "mainframe",
					description: "Gets account information from",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r3",
					sourceId: "internetBanking",
					destinationId: "email",
					description: "Sends e-mail using",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r4",
					sourceId: "email",
					destinationId: "customer",
					description: "Sends e-mails to",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r5",
					sourceId: "customer",
					destinationId: "supportStaff",
					description: "Asks questions to",
					technology: "Telephone",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r6",
					sourceId: "supportStaff",
					destinationId: "mainframe",
					description: "Uses",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r7",
					sourceId: "customer",
					destinationId: "atm",
					description: "Withdraws cash",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r8",
					sourceId: "atm",
					destinationId: "mainframe",
					description: "Uses",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r9",
					sourceId: "backoffice",
					destinationId: "mainframe",
					description: "Uses",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r10",
					sourceId: "customer",
					destinationId: "webApp",
					description: "Visits",
					technology: "HTTPS",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r11",
					sourceId: "customer",
					destinationId: "singlePageApp",
					description: "Views and interacts",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r12",
					sourceId: "customer",
					destinationId: "mobileApp",
					description: "Views and interacts",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r13",
					sourceId: "webApp",
					destinationId: "singlePageApp",
					description: "Delivers",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r14",
					sourceId: "singlePageApp",
					destinationId: "apiApp",
					description: "Makes API calls",
					technology: "JSON/HTTPS",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r15",
					sourceId: "mobileApp",
					destinationId: "apiApp",
					description: "Makes API calls",
					technology: "JSON/HTTPS",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r16",
					sourceId: "apiApp",
					destinationId: "database",
					description: "Reads from and writes to",
					technology: "JDBC",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r17",
					sourceId: "apiApp",
					destinationId: "mainframe",
					description: "Makes API calls",
					technology: "XML/HTTPS",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r18",
					sourceId: "apiApp",
					destinationId: "email",
					description: "Sends e-mail using",
					technology: "SMTP",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r19",
					sourceId: "singlePageApp",
					destinationId: "signinController",
					description: "Makes API calls",
					technology: "JSON/HTTPS",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r20",
					sourceId: "singlePageApp",
					destinationId: "resetPassController",
					description: "Makes API calls",
					technology: "JSON/HTTPS",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r21",
					sourceId: "singlePageApp",
					destinationId: "accountsSummary",
					description: "Makes API calls",
					technology: "JSON/HTTPS",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r22",
					sourceId: "signinController",
					destinationId: "securityComponent",
					description: "Uses",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r23",
					sourceId: "resetPassController",
					destinationId: "securityComponent",
					description: "Uses",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r24",
					sourceId: "resetPassController",
					destinationId: "emailComponent",
					description: "Uses",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r25",
					sourceId: "accountsSummary",
					destinationId: "mainframeFacade",
					description: "Uses",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r26",
					sourceId: "securityComponent",
					destinationId: "database",
					description: "Reads from and writes to",
					technology: "JDBC",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r27",
					sourceId: "emailComponent",
					destinationId: "email",
					description: "Sends e-mail using",
					technology: "SMTP",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r28",
					sourceId: "mainframeFacade",
					destinationId: "mainframe",
					description: "Makes API calls",
					technology: "XML/HTTPS",
					tags: ["Relationship"],
					properties: {}
				}
			],
			groups: [],
			deploymentEnvironments: []
		},
		views: {
			systemLandscapeViews: [{
				type: "systemLandscape",
				key: "SystemLandscape",
				title: "System Landscape",
				description: "The system landscape for Big Bank plc.",
				elements: [
					{ id: "customer" },
					{ id: "internetBanking" },
					{ id: "mainframe" },
					{ id: "email" },
					{ id: "atm" },
					{ id: "supportStaff" },
					{ id: "backoffice" }
				],
				relationships: [
					{ id: "r1" },
					{ id: "r2" },
					{ id: "r3" },
					{ id: "r4" },
					{ id: "r5" },
					{ id: "r6" },
					{ id: "r7" },
					{ id: "r8" },
					{ id: "r9" }
				],
				autoLayout: { direction: "TB" }
			}],
			systemContextViews: [{
				type: "systemContext",
				key: "SystemContext",
				title: "System Context",
				description: "The system context for Internet Banking.",
				softwareSystemId: "internetBanking",
				elements: [
					{ id: "customer" },
					{ id: "internetBanking" },
					{ id: "mainframe" },
					{ id: "email" }
				],
				relationships: [
					{ id: "r1" },
					{ id: "r2" },
					{ id: "r3" },
					{ id: "r4" }
				],
				autoLayout: { direction: "TB" }
			}],
			containerViews: [{
				type: "container",
				key: "Containers",
				title: "Containers",
				description: "The containers within Internet Banking.",
				softwareSystemId: "internetBanking",
				elements: [
					{ id: "customer" },
					{ id: "singlePageApp" },
					{ id: "mobileApp" },
					{ id: "webApp" },
					{ id: "apiApp" },
					{ id: "database" },
					{ id: "mainframe" },
					{ id: "email" }
				],
				relationships: [
					{ id: "r10" },
					{ id: "r11" },
					{ id: "r12" },
					{ id: "r13" },
					{ id: "r14" },
					{ id: "r15" },
					{ id: "r16" },
					{ id: "r17" },
					{ id: "r18" }
				],
				autoLayout: { direction: "TB" }
			}],
			componentViews: [{
				type: "component",
				key: "Components",
				title: "Components",
				description: "The components within the API Application.",
				containerId: "apiApp",
				elements: [
					{ id: "singlePageApp" },
					{ id: "signinController" },
					{ id: "resetPassController" },
					{ id: "accountsSummary" },
					{ id: "securityComponent" },
					{ id: "emailComponent" },
					{ id: "mainframeFacade" },
					{ id: "database" },
					{ id: "email" },
					{ id: "mainframe" }
				],
				relationships: [
					{ id: "r19" },
					{ id: "r20" },
					{ id: "r21" },
					{ id: "r22" },
					{ id: "r23" },
					{ id: "r24" },
					{ id: "r25" },
					{ id: "r26" },
					{ id: "r27" },
					{ id: "r28" }
				],
				autoLayout: { direction: "TB" }
			}],
			dynamicViews: [],
			deploymentViews: [],
			configuration: { styles: {
				elements: [
					{
						tag: "Bank Staff",
						background: "#1e2832",
						color: "#94a3b8",
						stroke: "#475569"
					},
					{
						tag: "Existing System",
						background: "#2a2018",
						color: "#d4a96a",
						stroke: "#a37032"
					},
					{
						tag: "Database",
						background: "#1e1a40",
						color: "#c4b5fd",
						stroke: "#7c3aed",
						shape: "Cylinder"
					}
				],
				relationships: []
			} }
		}
	};
}
//#endregion
//#region src/lib/templates/microservices.ts
/** Microservices architecture — API gateway + services + message broker */
function createMicroservicesTemplate() {
	return {
		name: "Microservices Architecture",
		description: "An API gateway with microservices, message broker, and backing data stores.",
		model: {
			people: [{
				id: "customer",
				type: "person",
				name: "Customer",
				description: "A user of the platform who interacts via web or mobile.",
				tags: [
					"Element",
					"Person",
					"Customer"
				],
				properties: {},
				location: "External"
			}],
			softwareSystems: [{
				id: "platform",
				type: "softwareSystem",
				name: "E-Commerce Platform",
				description: "The microservices-based e-commerce platform.",
				tags: ["Element", "Software System"],
				properties: {},
				location: "Internal",
				containers: [
					{
						id: "apiGateway",
						type: "container",
						name: "API Gateway",
						description: "Routes requests to the appropriate microservice and handles authentication.",
						technology: "Node.js, Express",
						tags: ["Element", "Container"],
						properties: {},
						components: []
					},
					{
						id: "userService",
						type: "container",
						name: "User Service",
						description: "Manages user accounts, authentication, and profiles.",
						technology: "Java, Spring Boot",
						tags: ["Element", "Container"],
						properties: {},
						components: []
					},
					{
						id: "orderService",
						type: "container",
						name: "Order Service",
						description: "Handles order creation, tracking, and fulfilment.",
						technology: "Java, Spring Boot",
						tags: ["Element", "Container"],
						properties: {},
						components: []
					},
					{
						id: "productService",
						type: "container",
						name: "Product Service",
						description: "Manages the product catalogue and inventory.",
						technology: "Go",
						tags: ["Element", "Container"],
						properties: {},
						components: []
					},
					{
						id: "postgres",
						type: "container",
						name: "PostgreSQL",
						description: "Primary relational data store for users, orders, and products.",
						technology: "PostgreSQL 15",
						tags: [
							"Element",
							"Container",
							"Database"
						],
						properties: {},
						components: []
					},
					{
						id: "redis",
						type: "container",
						name: "Redis",
						description: "In-memory cache and session store.",
						technology: "Redis 7",
						tags: [
							"Element",
							"Container",
							"Database"
						],
						properties: {},
						components: []
					},
					{
						id: "rabbitMQ",
						type: "container",
						name: "RabbitMQ",
						description: "Message broker for asynchronous communication between services.",
						technology: "RabbitMQ",
						tags: [
							"Element",
							"Container",
							"Queue"
						],
						properties: {},
						components: []
					}
				]
			}],
			relationships: [
				{
					id: "r1",
					sourceId: "customer",
					destinationId: "platform",
					description: "Browses products, places orders",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r2",
					sourceId: "customer",
					destinationId: "apiGateway",
					description: "Makes API requests",
					technology: "HTTPS",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r3",
					sourceId: "apiGateway",
					destinationId: "userService",
					description: "Routes auth requests",
					technology: "gRPC",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r4",
					sourceId: "apiGateway",
					destinationId: "orderService",
					description: "Routes order requests",
					technology: "gRPC",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r5",
					sourceId: "apiGateway",
					destinationId: "productService",
					description: "Routes product requests",
					technology: "gRPC",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r6",
					sourceId: "userService",
					destinationId: "postgres",
					description: "Reads from and writes to",
					technology: "SQL",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r7",
					sourceId: "orderService",
					destinationId: "postgres",
					description: "Reads from and writes to",
					technology: "SQL",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r8",
					sourceId: "productService",
					destinationId: "postgres",
					description: "Reads from and writes to",
					technology: "SQL",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r9",
					sourceId: "apiGateway",
					destinationId: "redis",
					description: "Caches sessions and tokens",
					technology: "Redis Protocol",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r10",
					sourceId: "orderService",
					destinationId: "rabbitMQ",
					description: "Publishes order events",
					technology: "AMQP",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r11",
					sourceId: "productService",
					destinationId: "rabbitMQ",
					description: "Consumes inventory updates",
					technology: "AMQP",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r12",
					sourceId: "userService",
					destinationId: "rabbitMQ",
					description: "Publishes user events",
					technology: "AMQP",
					tags: ["Relationship"],
					properties: {}
				}
			],
			groups: [],
			deploymentEnvironments: []
		},
		views: {
			systemLandscapeViews: [{
				type: "systemLandscape",
				key: "SystemLandscape",
				title: "System Landscape",
				description: "Overview of the microservices platform.",
				elements: [{ id: "customer" }, { id: "platform" }],
				relationships: [{ id: "r1" }],
				autoLayout: { direction: "TB" }
			}],
			systemContextViews: [],
			containerViews: [{
				type: "container",
				key: "Containers",
				title: "Containers",
				description: "The microservices, data stores, and message broker.",
				softwareSystemId: "platform",
				elements: [
					{ id: "customer" },
					{ id: "apiGateway" },
					{ id: "userService" },
					{ id: "orderService" },
					{ id: "productService" },
					{ id: "postgres" },
					{ id: "redis" },
					{ id: "rabbitMQ" }
				],
				relationships: [
					{ id: "r2" },
					{ id: "r3" },
					{ id: "r4" },
					{ id: "r5" },
					{ id: "r6" },
					{ id: "r7" },
					{ id: "r8" },
					{ id: "r9" },
					{ id: "r10" },
					{ id: "r11" },
					{ id: "r12" }
				],
				autoLayout: { direction: "TB" }
			}],
			componentViews: [],
			dynamicViews: [],
			deploymentViews: [],
			configuration: { styles: {
				elements: [{
					tag: "Database",
					background: "#1e1a40",
					color: "#c4b5fd",
					stroke: "#7c3aed",
					shape: "Cylinder"
				}, {
					tag: "Queue",
					background: "#2d1f0d",
					color: "#fdba74",
					stroke: "#f97316"
				}],
				relationships: []
			} }
		}
	};
}
//#endregion
//#region src/lib/templates/monolith.ts
/** Monolithic architecture — frontend, backend, and database */
function createMonolithTemplate() {
	return {
		name: "Monolithic Application",
		description: "A traditional monolithic web application with frontend, backend, and database.",
		model: {
			people: [{
				id: "admin",
				type: "person",
				name: "Administrator",
				description: "An internal administrator who manages content and users.",
				tags: [
					"Element",
					"Person",
					"Staff"
				],
				properties: {},
				location: "Internal"
			}, {
				id: "endUser",
				type: "person",
				name: "End User",
				description: "A public user who interacts with the application.",
				tags: [
					"Element",
					"Person",
					"Customer"
				],
				properties: {},
				location: "External"
			}],
			softwareSystems: [{
				id: "monolith",
				type: "softwareSystem",
				name: "Monolithic Application",
				description: "The primary web application serving all business functionality.",
				tags: ["Element", "Software System"],
				properties: {},
				location: "Internal",
				containers: [
					{
						id: "webFrontend",
						type: "container",
						name: "Web Frontend",
						description: "Delivers the user interface to browsers.",
						technology: "React, TypeScript",
						tags: ["Element", "Container"],
						properties: {},
						components: []
					},
					{
						id: "backendApp",
						type: "container",
						name: "Backend Application",
						description: "Handles business logic, API endpoints, and server-side rendering.",
						technology: "Python, Django",
						tags: ["Element", "Container"],
						properties: {},
						components: []
					},
					{
						id: "database",
						type: "container",
						name: "Database",
						description: "Stores all application data including users, content, and configuration.",
						technology: "MySQL 8",
						tags: [
							"Element",
							"Container",
							"Database"
						],
						properties: {},
						components: []
					}
				]
			}, {
				id: "emailService",
				type: "softwareSystem",
				name: "E-mail Service",
				description: "Third-party transactional email provider.",
				tags: [
					"Element",
					"Software System",
					"External System"
				],
				properties: {},
				location: "External",
				containers: []
			}],
			relationships: [
				{
					id: "r1",
					sourceId: "endUser",
					destinationId: "monolith",
					description: "Uses the application",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r2",
					sourceId: "admin",
					destinationId: "monolith",
					description: "Manages content and users",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r3",
					sourceId: "monolith",
					destinationId: "emailService",
					description: "Sends transactional emails via",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r4",
					sourceId: "emailService",
					destinationId: "endUser",
					description: "Sends emails to",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r5",
					sourceId: "endUser",
					destinationId: "webFrontend",
					description: "Visits and interacts",
					technology: "HTTPS",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r6",
					sourceId: "admin",
					destinationId: "webFrontend",
					description: "Manages via admin panel",
					technology: "HTTPS",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r7",
					sourceId: "webFrontend",
					destinationId: "backendApp",
					description: "Makes API calls",
					technology: "JSON/HTTPS",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r8",
					sourceId: "backendApp",
					destinationId: "database",
					description: "Reads from and writes to",
					technology: "SQL",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r9",
					sourceId: "backendApp",
					destinationId: "emailService",
					description: "Sends emails via",
					technology: "SMTP",
					tags: ["Relationship"],
					properties: {}
				}
			],
			groups: [],
			deploymentEnvironments: []
		},
		views: {
			systemLandscapeViews: [{
				type: "systemLandscape",
				key: "SystemLandscape",
				title: "System Landscape",
				description: "Overview of the monolithic application and its users.",
				elements: [
					{ id: "admin" },
					{ id: "endUser" },
					{ id: "monolith" },
					{ id: "emailService" }
				],
				relationships: [
					{ id: "r1" },
					{ id: "r2" },
					{ id: "r3" },
					{ id: "r4" }
				],
				autoLayout: { direction: "TB" }
			}],
			systemContextViews: [],
			containerViews: [{
				type: "container",
				key: "Containers",
				title: "Containers",
				description: "The frontend, backend, and database within the monolith.",
				softwareSystemId: "monolith",
				elements: [
					{ id: "admin" },
					{ id: "endUser" },
					{ id: "webFrontend" },
					{ id: "backendApp" },
					{ id: "database" },
					{ id: "emailService" }
				],
				relationships: [
					{ id: "r5" },
					{ id: "r6" },
					{ id: "r7" },
					{ id: "r8" },
					{ id: "r9" }
				],
				autoLayout: { direction: "TB" }
			}],
			componentViews: [],
			dynamicViews: [],
			deploymentViews: [],
			configuration: { styles: {
				elements: [
					{
						tag: "Staff",
						background: "#1e2832",
						color: "#94a3b8",
						stroke: "#475569"
					},
					{
						tag: "External System",
						background: "#201c28",
						color: "#c084fc",
						stroke: "#9333ea"
					},
					{
						tag: "Database",
						background: "#1e1a40",
						color: "#c4b5fd",
						stroke: "#7c3aed",
						shape: "Cylinder"
					}
				],
				relationships: []
			} }
		}
	};
}
//#endregion
//#region src/lib/templates/eventDriven.ts
/** Event-driven architecture — producers, Kafka, consumers, data lake */
function createEventDrivenTemplate() {
	return {
		name: "Event-Driven Architecture",
		description: "An event-driven system with producer services, Kafka, consumer services, and a data lake.",
		model: {
			people: [{
				id: "analyst",
				type: "person",
				name: "Data Analyst",
				description: "Queries the data lake for business intelligence and reporting.",
				tags: [
					"Element",
					"Person",
					"Staff"
				],
				properties: {},
				location: "Internal"
			}],
			softwareSystems: [{
				id: "eventPlatform",
				type: "softwareSystem",
				name: "Event-Driven Platform",
				description: "The event-driven data processing platform.",
				tags: ["Element", "Software System"],
				properties: {},
				location: "Internal",
				containers: [
					{
						id: "ingestService",
						type: "container",
						name: "Ingest Service",
						description: "Receives data from external sources and publishes events.",
						technology: "Python, FastAPI",
						tags: [
							"Element",
							"Container",
							"Producer"
						],
						properties: {},
						components: []
					},
					{
						id: "clickstreamService",
						type: "container",
						name: "Clickstream Collector",
						description: "Captures user interaction events from web and mobile clients.",
						technology: "Go",
						tags: [
							"Element",
							"Container",
							"Producer"
						],
						properties: {},
						components: []
					},
					{
						id: "kafka",
						type: "container",
						name: "Apache Kafka",
						description: "Distributed event streaming platform and central message backbone.",
						technology: "Apache Kafka",
						tags: [
							"Element",
							"Container",
							"Queue"
						],
						properties: {},
						components: []
					},
					{
						id: "enrichmentService",
						type: "container",
						name: "Enrichment Service",
						description: "Consumes raw events, enriches with metadata, and re-publishes.",
						technology: "Java, Kafka Streams",
						tags: [
							"Element",
							"Container",
							"Consumer"
						],
						properties: {},
						components: []
					},
					{
						id: "analyticsService",
						type: "container",
						name: "Analytics Service",
						description: "Processes enriched events and generates aggregated metrics.",
						technology: "Scala, Apache Flink",
						tags: [
							"Element",
							"Container",
							"Consumer"
						],
						properties: {},
						components: []
					},
					{
						id: "notificationService",
						type: "container",
						name: "Notification Service",
						description: "Listens for specific events and sends alerts via email and push notifications.",
						technology: "Node.js",
						tags: [
							"Element",
							"Container",
							"Consumer"
						],
						properties: {},
						components: []
					},
					{
						id: "dataLake",
						type: "container",
						name: "Data Lake",
						description: "Long-term storage for raw and processed event data.",
						technology: "AWS S3, Apache Parquet",
						tags: [
							"Element",
							"Container",
							"Database"
						],
						properties: {},
						components: []
					}
				]
			}, {
				id: "externalSource",
				type: "softwareSystem",
				name: "External Data Source",
				description: "Third-party systems that push data into the platform.",
				tags: [
					"Element",
					"Software System",
					"External System"
				],
				properties: {},
				location: "External",
				containers: []
			}],
			relationships: [
				{
					id: "r1",
					sourceId: "externalSource",
					destinationId: "eventPlatform",
					description: "Sends data to",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r2",
					sourceId: "analyst",
					destinationId: "eventPlatform",
					description: "Queries for reports",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r3",
					sourceId: "externalSource",
					destinationId: "ingestService",
					description: "Pushes data via webhooks",
					technology: "HTTPS",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r4",
					sourceId: "ingestService",
					destinationId: "kafka",
					description: "Publishes raw events",
					technology: "Kafka Protocol",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r5",
					sourceId: "clickstreamService",
					destinationId: "kafka",
					description: "Publishes clickstream events",
					technology: "Kafka Protocol",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r6",
					sourceId: "kafka",
					destinationId: "enrichmentService",
					description: "Delivers raw events",
					technology: "Kafka Protocol",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r7",
					sourceId: "enrichmentService",
					destinationId: "kafka",
					description: "Publishes enriched events",
					technology: "Kafka Protocol",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r8",
					sourceId: "kafka",
					destinationId: "analyticsService",
					description: "Delivers enriched events",
					technology: "Kafka Protocol",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r9",
					sourceId: "kafka",
					destinationId: "notificationService",
					description: "Delivers alert-worthy events",
					technology: "Kafka Protocol",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r10",
					sourceId: "analyticsService",
					destinationId: "dataLake",
					description: "Writes aggregated data",
					technology: "S3 API",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r11",
					sourceId: "enrichmentService",
					destinationId: "dataLake",
					description: "Archives enriched events",
					technology: "S3 API",
					tags: ["Relationship"],
					properties: {}
				},
				{
					id: "r12",
					sourceId: "analyst",
					destinationId: "dataLake",
					description: "Queries for analytics",
					technology: "SQL / Athena",
					tags: ["Relationship"],
					properties: {}
				}
			],
			groups: [],
			deploymentEnvironments: []
		},
		views: {
			systemLandscapeViews: [{
				type: "systemLandscape",
				key: "SystemLandscape",
				title: "System Landscape",
				description: "Overview of the event-driven platform.",
				elements: [
					{ id: "analyst" },
					{ id: "eventPlatform" },
					{ id: "externalSource" }
				],
				relationships: [{ id: "r1" }, { id: "r2" }],
				autoLayout: { direction: "TB" }
			}],
			systemContextViews: [],
			containerViews: [{
				type: "container",
				key: "Containers",
				title: "Containers",
				description: "Producers, Kafka, consumers, and data lake.",
				softwareSystemId: "eventPlatform",
				elements: [
					{ id: "analyst" },
					{ id: "externalSource" },
					{ id: "ingestService" },
					{ id: "clickstreamService" },
					{ id: "kafka" },
					{ id: "enrichmentService" },
					{ id: "analyticsService" },
					{ id: "notificationService" },
					{ id: "dataLake" }
				],
				relationships: [
					{ id: "r3" },
					{ id: "r4" },
					{ id: "r5" },
					{ id: "r6" },
					{ id: "r7" },
					{ id: "r8" },
					{ id: "r9" },
					{ id: "r10" },
					{ id: "r11" },
					{ id: "r12" }
				],
				autoLayout: { direction: "TB" }
			}],
			componentViews: [],
			dynamicViews: [],
			deploymentViews: [],
			configuration: { styles: {
				elements: [
					{
						tag: "Staff",
						background: "#1e2832",
						color: "#94a3b8",
						stroke: "#475569"
					},
					{
						tag: "External System",
						background: "#201c28",
						color: "#c084fc",
						stroke: "#9333ea"
					},
					{
						tag: "Producer",
						background: "#0e2a1a",
						color: "#6ee7b7",
						stroke: "#059669"
					},
					{
						tag: "Consumer",
						background: "#2d0f0f",
						color: "#fca5a5",
						stroke: "#ef4444"
					},
					{
						tag: "Queue",
						background: "#2d1f0d",
						color: "#fdba74",
						stroke: "#f97316"
					},
					{
						tag: "Database",
						background: "#1e1a40",
						color: "#c4b5fd",
						stroke: "#7c3aed",
						shape: "Cylinder"
					}
				],
				relationships: []
			} }
		}
	};
}
//#endregion
//#region src/lib/templates/blank.ts
/** Empty workspace for starting from scratch.
*  For softwaresystem scope, seeds a placeholder software system plus a systemContext
*  view pointing to it, since a systemContext view requires a software system reference.
*  The user can rename the placeholder system immediately (F2). */
function createBlankWorkspace(scope) {
	const isSoftwareSystem = scope === "softwaresystem";
	const placeholderId = "sys1";
	return {
		name: "Untitled Workspace",
		description: "",
		scope,
		model: {
			people: [],
			softwareSystems: isSoftwareSystem ? [{
				id: placeholderId,
				type: "softwareSystem",
				name: "New System",
				description: "",
				tags: ["Element", "Software System"],
				properties: {},
				containers: []
			}] : [],
			relationships: [],
			groups: [],
			deploymentEnvironments: []
		},
		views: {
			systemLandscapeViews: isSoftwareSystem ? [] : [{
				type: "systemLandscape",
				key: "default",
				title: "System Landscape",
				elements: [],
				relationships: [],
				autoLayout: { direction: "TB" }
			}],
			systemContextViews: isSoftwareSystem ? [{
				type: "systemContext",
				key: "SystemContext",
				title: "System Context",
				softwareSystemId: placeholderId,
				elements: [{ id: placeholderId }],
				relationships: [],
				autoLayout: { direction: "TB" }
			}] : [],
			containerViews: [],
			componentViews: [],
			dynamicViews: [],
			deploymentViews: [],
			configuration: { styles: {
				elements: [],
				relationships: []
			} }
		}
	};
}
//#endregion
//#region src/cli/commands/workspace.ts
var TEMPLATES = {
	blank: () => createBlankWorkspace(),
	microservices: createMicroservicesTemplate,
	monolith: createMonolithTemplate,
	eventDriven: createEventDrivenTemplate,
	bigBank: createBigBankSample
};
var init = {
	name: "init",
	summary: "Create a workspace from a template",
	flags: {
		values: ["template", "name"],
		booleans: ["overwrite"]
	},
	usage: "init --template blank|microservices|monolith|eventDriven|bigBank [--name <name>] [--file <dsl>] [--overwrite]",
	run(args, ctx) {
		const templateName = flag(args, "template") ?? "blank";
		const make = templateName in TEMPLATES ? TEMPLATES[templateName] : void 0;
		if (!make) throw new CliFailure("USAGE", `--template must be one of ${Object.keys(TEMPLATES).join(", ")}`);
		const file = path.resolve(ctx.cwd, flag(args, "file") ?? "workspace.dsl");
		const root = findRoot(ctx.cwd);
		if (!isInsideRoot(root, file) || !isInsideRootReal(root, file)) throw new CliFailure("USAGE", `--file '${flag(args, "file")}' resolves outside the project root ${root}.`);
		if (existsSync(file) && !boolFlag(args, "overwrite")) throw new CliFailure("USAGE", `${file} already exists. Pass --overwrite to replace it.`);
		const ws = make();
		const name = flag(args, "name");
		if (name !== void 0) ws.name = name;
		const sidecarPath = path.join(path.dirname(file), sidecarName(path.basename(file)));
		const sidecar = extractSidecar(ws);
		mkdirSync(path.dirname(file), { recursive: true });
		writeFileSync(file, serializeDSL(ws));
		if (sidecar) writeFileSync(sidecarPath, serializeSidecar(sidecar));
		else rmSync(sidecarPath, { force: true });
		return {
			ok: true,
			command: "init",
			file,
			data: {
				template: templateName,
				name: ws.name,
				sidecar: sidecar ? sidecarPath : null
			},
			warnings: []
		};
	}
};
function checkResult(file, data) {
	if (data.errors.length === 0) return {
		ok: true,
		command: "check",
		file,
		data,
		warnings: []
	};
	return {
		ok: false,
		command: "check",
		file,
		data,
		warnings: [],
		error: {
			code: data.errors.some((e) => e.kind === "parse") ? "PARSE_FAILED" : "VALIDATION",
			message: `${data.errors.length} error(s) in ${file}`
		}
	};
}
function parseFinding(text) {
	const m = /^line (\d+): (.*)$/s.exec(text);
	return m ? {
		kind: "parse",
		message: m[2],
		line: Number(m[1])
	} : {
		kind: "parse",
		message: text
	};
}
function allElements(ws) {
	return [...ws.model.people, ...ws.model.softwareSystems.flatMap((s) => [s, ...s.containers.flatMap((c) => [c, ...c.components])])];
}
/** Elements that take part in no relationship, directly or through a descendant. */
function orphans(ws) {
	const linked = new Set(ws.model.relationships.flatMap((r) => [r.sourceId, r.destinationId]));
	const touches = (ids) => ids.some((id) => linked.has(id));
	const out = [];
	const report = (el, ids) => {
		if (!touches(ids)) out.push({
			kind: "orphan",
			message: `${el.name} has no relationships`,
			id: el.id
		});
	};
	for (const p of ws.model.people) report(p, [p.id]);
	for (const s of ws.model.softwareSystems) {
		report(s, [s.id, ...s.containers.flatMap((c) => [c.id, ...c.components.map((k) => k.id)])]);
		for (const c of s.containers) {
			report(c, [c.id, ...c.components.map((k) => k.id)]);
			for (const k of c.components) report(k, [k.id]);
		}
	}
	return out;
}
function missingDocuments(ws, root) {
	const out = [];
	const holders = [...allElements(ws), ...ws.model.relationships];
	for (const h of holders) for (const doc of h.documents ?? []) {
		const abs = path.resolve(root, doc.path);
		const rel = path.relative(root, abs);
		if (!(!path.isAbsolute(doc.path) && !rel.startsWith("..") && !path.isAbsolute(rel)) || !existsSync(abs) || !statSync(abs).isFile()) out.push({
			kind: "missing-document",
			message: `${h.id}: document ${doc.path} not found under ${root}`,
			id: h.id
		});
	}
	return out;
}
var GAP_KIND = {
	title: "missing-name",
	desc: "missing-description",
	tech: "missing-technology",
	rel: "missing-relationship-label"
};
var check = {
	name: "check",
	summary: "Validate the workspace (parse, integrity, scope, model health, docs)",
	flags: { booleans: ["fast"] },
	usage: "check [--fast] [--file <dsl>]",
	run(args, ctx) {
		const file = discoverWorkspace({
			file: flag(args, "file"),
			cwd: ctx.cwd
		});
		const fast = boolFlag(args, "fast");
		const data = {
			errors: [],
			warnings: [],
			info: [],
			health: null
		};
		let ws;
		try {
			ws = openSession(file, { force: true }).workspace();
		} catch (err) {
			if (!(err instanceof ParseFailedError)) throw err;
			data.errors.push(...(err.candidates ?? []).map(parseFinding));
			return checkResult(file, data);
		}
		for (const v of checkModelIntegrity(ws)) data.errors.push({
			kind: v.code,
			message: v.message,
			id: v.elementId ?? v.relationshipId ?? v.viewKey
		});
		if (fast) return checkResult(file, data);
		for (const v of validateScope(ws)) {
			const finding = {
				kind: "scope",
				message: v.message,
				id: v.elementId ?? v.relationshipId
			};
			(v.type === "error" ? data.errors : data.warnings).push(finding);
		}
		const gaps = missingInfoGaps(ws);
		const gapCounts = {};
		for (const g of gaps) {
			gapCounts[g.kind] = (gapCounts[g.kind] ?? 0) + 1;
			data.warnings.push({
				kind: GAP_KIND[g.kind],
				message: `${g.label}: ${GAP_KIND[g.kind].replace("missing-", "no ")}`,
				id: g.targetId
			});
		}
		data.health = {
			...healthFieldCounts(ws),
			gaps: gapCounts
		};
		data.warnings.push(...orphans(ws), ...missingDocuments(ws, projectRootFor(file)));
		data.info.push(...findLossyConstructs(readFileSync(file, "utf8")).map((f) => ({
			kind: `lossy-${f.kind}`,
			message: describeFinding(f),
			line: f.line
		})));
		return checkResult(file, data);
	}
};
/** EditActions bound to the session's store, mirroring `storeEditActions` in
*  src/components/ai/aiHelpers.ts (which is React-coupled, so not importable).
*  Ids the store mints are recorded so refs can be given readable ids later. */
function editActions(s, created) {
	const track = (id) => (created.push(id), id);
	return {
		addPerson: (name) => track(s().addPerson(name)),
		addSoftwareSystem: (name, external) => track(s().addSoftwareSystem(name, void 0, external ? "External" : void 0)),
		addContainer: (systemId, name) => track(s().addContainer(systemId, name)),
		addComponent: (containerId, name) => track(s().addComponent(containerId, name)),
		addRelationship: (src, dst, desc, tech) => s().addRelationship(src, dst, desc, tech),
		updateElement: (id, patch) => s().updateElement(id, patch),
		updateRelationship: (id, patch) => s().updateRelationship(id, patch),
		deleteElement: (id) => s().deleteElement(id),
		addView: (type, scopeId, title) => s().addView(type, scopeId, title)
	};
}
function readPlan(file) {
	let raw;
	try {
		raw = JSON.parse(readFileSync(file, "utf8"));
	} catch (err) {
		throw new CliFailure("USAGE", `Cannot read plan ${file}: ${err.message}`);
	}
	const ops = raw?.operations;
	if (!Array.isArray(ops)) throw new CliFailure("VALIDATION", "Plan must be a JSON object { \"operations\": [...] }");
	const operations = [];
	const rejected = [];
	ops.forEach((candidate, index) => {
		if (operations.length >= 300) return rejected.push({
			index,
			reason: `plan exceeds 300 operations`
		});
		const clean = isEditOp(candidate) ? sanitizeEditOp(candidate) : null;
		if (clean) operations.push(clean);
		else rejected.push({
			index,
			reason: "invalid operation"
		});
	});
	return {
		operations,
		rejected
	};
}
//#endregion
//#region src/cli/commands/index.ts
/** Every command, in help order. New command modules register here. */
var COMMANDS = [
	...[
		init,
		check,
		{
			name: "apply",
			summary: "Apply an EditPlan JSON file to the workspace",
			flags: {
				values: ["plan"],
				booleans: MUTATING_BOOLEANS
			},
			usage: "apply --plan <file.json> [--file <dsl>] [--dry-run] [--force]",
			run(args, ctx) {
				const planFile = flag(args, "plan");
				if (!planFile) throw new CliFailure("USAGE", "apply requires --plan <file.json>");
				const { operations, rejected } = readPlan(path.resolve(ctx.cwd, planFile));
				const session = openSession(discoverWorkspace({
					file: flag(args, "file"),
					cwd: ctx.cwd
				}), { force: boolFlag(args, "force") });
				const before = session.workspace();
				const beforeIds = new Set(flattenElements(before).map((e) => e.id));
				const beforeViews = new Set(allViewsOf(before).map((v) => v.key));
				const created = [];
				const result = applyEditPlan({ operations }, editActions(() => session.actions(), created), before);
				const afterApply = session.workspace();
				const surviving = new Set(flattenElements(afterApply).map((e) => e.id));
				for (const id of beforeIds) if (!surviving.has(id)) session.recordRemoved(id);
				const refs = {};
				const elementCreates = result.applied.filter((a) => a.ok && /^add(Person|SoftwareSystem|Container|Component)$/.test(a.op.op));
				if (elementCreates.length > 0) {
					const ws = structuredClone(afterApply);
					const taken = takenIds(ws);
					const names = new Map(flattenElements(ws).map((e) => [e.id, e.name]));
					elementCreates.forEach((a, i) => {
						const oldId = created[i];
						const newId = deriveIdentifier(names.get(oldId) ?? "item", taken);
						taken.add(newId);
						try {
							renameElementId(ws, oldId, newId);
						} catch (err) {
							throw new CliFailure("VALIDATION", `Cannot give ${oldId} the id ${newId}: ${err.message}`);
						}
						session.recordRename(oldId, newId);
						const ref = a.op.ref;
						refs[ref || oldId] = newId;
					});
					session.actions().loadWorkspace(ws);
				}
				const dryRun = boolFlag(args, "dry-run");
				const save = session.save({ dryRun });
				const final = session.workspace();
				const finalIds = new Set(flattenElements(final).map((e) => e.id));
				const describe = (a) => ({
					op: a.op.op,
					..."ref" in a.op && a.op.ref ? { ref: a.op.ref } : {},
					..."name" in a.op && a.op.name ? { name: a.op.name } : {},
					status: a.ok ? "applied" : "skipped",
					...a.reason ? { reason: a.reason } : {}
				});
				const skipSummary = summarizeSkips(result);
				const warnings = [...skipSummary ? [skipSummary] : [], ...rejected.length > 0 ? [`Rejected ${rejected.length} invalid operation(s): index ${rejected.map((r) => r.index).join(", ")}`] : []];
				return {
					ok: true,
					command: "apply",
					file: session.file,
					changed: save.changed ? {
						elements: [...finalIds].filter((id) => !beforeIds.has(id)),
						views: allViewsOf(final).map((v) => v.key).filter((k) => !beforeViews.has(k))
					} : {},
					data: {
						applied: result.appliedCount,
						skipped: result.skippedCount + rejected.length,
						ops: result.applied.map(describe),
						rejected,
						refs,
						saved: !dryRun && save.changed,
						...Object.keys(save.renamedViews).length > 0 ? { renamedViews: save.renamedViews } : {},
						...save.diff !== void 0 ? { diff: save.diff } : {}
					},
					warnings
				};
			}
		}
	],
	...readCommands,
	...elementCommands,
	...relationshipCommands,
	...docsCommands,
	...viewCommands,
	...dynamicCommands,
	...deploymentCommands,
	...exportCommands
];
//#endregion
//#region src/cli/help.ts
var GLOBAL_FLAGS = [
	"--pretty (human-readable output)",
	"--file <dsl> (workspace file; discovered from the cwd when omitted)",
	"--help"
];
var GLOBAL_ACCEPTED = [{
	name: "file",
	boolean: false
}, {
	name: "help",
	boolean: true
}];
function fromSet(set) {
	return [...(set.values ?? []).map((name) => ({
		name,
		boolean: false
	})), ...(set.booleans ?? []).map((name) => ({
		name,
		boolean: true
	}))];
}
/** Every flag `mod` accepts for the invocation whose first positional is `sub`:
*  global flags, the command's own, and the subcommand's. Null when `sub` is not
*  a declared subcommand, so the command itself reports the bad subcommand. */
function acceptedFlags(mod, sub) {
	const { bySubcommand, ...base } = mod.flags;
	let extra = {};
	if (bySubcommand) {
		if (sub === void 0 || !(sub in bySubcommand)) return null;
		extra = bySubcommand[sub];
	}
	const merged = /* @__PURE__ */ new Map();
	for (const f of [
		...GLOBAL_ACCEPTED,
		...fromSet(base),
		...fromSet(extra)
	]) merged.set(f.name, f);
	return [...merged.values()];
}
/** Per-invocation flag lists for `help <cmd>`, generated from the same declaration dispatch validates. */
function flagLists(mod) {
	const render = (flags) => flags.filter((f) => !GLOBAL_ACCEPTED.some((g) => g.name === f.name)).map((f) => `--${f.name}${f.boolean ? "" : " <value>"}`);
	if (!mod.flags.bySubcommand) return { "": render(acceptedFlags(mod, void 0) ?? []) };
	return Object.fromEntries(Object.keys(mod.flags.bySubcommand).map((sub) => [sub, render(acceptedFlags(mod, sub) ?? [])]));
}
/** Splits a usage string into one line per invocation form. */
function usageLines(usage) {
	return usage.split("\n").flatMap((line) => line.split(" | ")).map((l) => l.trim()).filter(Boolean);
}
/** `c4hero help`: every command with its summary. */
function helpIndex(commands) {
	return {
		ok: true,
		command: "help",
		warnings: [],
		data: {
			usage: "c4hero <command> [args] [flags]   |   c4hero help <command>   |   c4hero <command> --help",
			globalFlags: GLOBAL_FLAGS,
			commands: [
				...commands.map((c) => ({
					name: c.name,
					summary: c.summary
				})),
				{
					name: "version",
					summary: "Print the CLI version"
				},
				{
					name: "help",
					summary: "List commands, or show usage for one"
				}
			]
		}
	};
}
/** `c4hero help <cmd>` / `c4hero <cmd> --help`: usage forms for one command. */
function helpFor(commands, name) {
	const mod = commands.find((c) => c.name === name);
	if (!mod) throw new CliFailure("NOT_FOUND", `Unknown command '${name}'`, commands.map((c) => c.name));
	return {
		ok: true,
		command: "help",
		warnings: [],
		data: {
			name: mod.name,
			summary: mod.summary,
			usage: usageLines(mod.usage),
			flags: flagLists(mod),
			globalFlags: GLOBAL_FLAGS
		}
	};
}
/** Human rendering for `--pretty`. */
function formatHelp(result) {
	const data = result.data;
	const lines = [];
	if (data.commands) {
		const width = Math.max(...data.commands.map((c) => c.name.length));
		lines.push(`Usage: ${data.usage}`, "", "Commands:");
		for (const c of data.commands) lines.push(`  ${c.name.padEnd(width)}  ${c.summary}`);
	} else {
		lines.push(`${data.name} - ${data.summary}`, "", "Usage:");
		for (const u of data.usage) lines.push(`  c4hero ${u}`);
		for (const [sub, list] of Object.entries(data.flags ?? {})) if (list.length > 0) lines.push("", `Flags${sub ? ` (${sub})` : ""}: ${list.join(" ")}`);
	}
	lines.push("", "Global flags:", ...data.globalFlags.map((f) => `  ${f}`));
	return lines.join("\n");
}
//#endregion
//#region src/cli/output.ts
var EXIT = {
	OK: 0,
	USAGE: 1,
	VALIDATION: 2,
	LOSSY: 3,
	EXPORT_ENV: 4,
	INTERNAL: 5
};
var EXIT_BY_CODE = {
	USAGE: EXIT.USAGE,
	UNKNOWN_COMMAND: EXIT.USAGE,
	NOT_FOUND: EXIT.USAGE,
	AMBIGUOUS: EXIT.USAGE,
	MULTIPLE_WORKSPACES: EXIT.USAGE,
	PARSE_FAILED: EXIT.VALIDATION,
	VALIDATION: EXIT.VALIDATION,
	LOSSY_FILE: EXIT.LOSSY,
	EXPORT_ENV: EXIT.EXPORT_ENV,
	INTERNAL: EXIT.INTERNAL
};
function exitCodeFor(result) {
	if (result.ok) return EXIT.OK;
	return EXIT_BY_CODE[result.error?.code ?? ""] ?? EXIT.USAGE;
}
function formatResult(result, pretty) {
	if (!pretty) return JSON.stringify(result);
	const lines = [
		`${result.ok ? "OK" : "ERROR"} ${result.command}`,
		...result.error ? [`  ${result.error.code}: ${result.error.message}`] : [],
		...(result.error?.candidates ?? []).map((c) => `    - ${c}`),
		...result.warnings.map((w) => `  warning: ${w}`)
	];
	if (result.data !== void 0) lines.push(JSON.stringify(result.data, null, 2));
	return lines.join("\n");
}
//#endregion
//#region src/cli/main.ts
var VERSION = "0.4.0";
function failure(command, err) {
	return {
		ok: false,
		command,
		warnings: [],
		error: err.toCliError()
	};
}
/** USAGE failure for any flag the command does not declare. */
function rejectUnknownFlags(mod, args) {
	const accepted = acceptedFlags(mod, args.positionals[0]);
	if (accepted === null) return;
	const known = new Set(accepted.map((f) => f.name));
	const unknown = Object.keys(args.flags).filter((name) => !known.has(name));
	if (unknown.length === 0) return;
	throw new CliFailure("USAGE", `Unknown flag${unknown.length > 1 ? "s" : ""} ${unknown.map((f) => `--${f}`).join(", ")} for '${mod.name}'. Run 'c4hero help ${mod.name}'.`, accepted.map((f) => `--${f.name}${f.boolean ? "" : " <value>"}`));
}
async function dispatch(argv, cwd) {
	const args = parseArgs(argv);
	const { command, pretty } = args;
	try {
		if (command === "version") return {
			result: {
				ok: true,
				command,
				data: { version: VERSION },
				warnings: []
			},
			pretty
		};
		if (command === "help") {
			const target = args.positionals[0];
			return {
				result: target ? helpFor(COMMANDS, target) : helpIndex(COMMANDS),
				pretty
			};
		}
		if (command === void 0 && args.flags["help"]) return {
			result: helpIndex(COMMANDS),
			pretty
		};
		const mod = COMMANDS.find((c) => c.name === command);
		if (mod) {
			if (args.flags["help"]) return {
				result: helpFor(COMMANDS, mod.name),
				pretty
			};
			rejectUnknownFlags(mod, args);
			return {
				result: await mod.run(args, { cwd }),
				pretty
			};
		}
		return {
			result: {
				ok: false,
				command: command ?? "",
				warnings: [],
				error: {
					code: command ? "UNKNOWN_COMMAND" : "USAGE",
					message: command ? `Unknown command '${command}'. Run 'c4hero help'.` : "No command given. Run 'c4hero help'."
				}
			},
			pretty
		};
	} catch (err) {
		if (err instanceof CliFailure) return {
			result: failure(command ?? "", err),
			pretty
		};
		return {
			result: internalFailure(command ?? "", err),
			pretty,
			cause: err
		};
	}
}
function internalFailure(command, err) {
	return {
		ok: false,
		command,
		warnings: [],
		error: {
			code: "INTERNAL",
			message: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`
		}
	};
}
/** Runs one CLI invocation and returns the process exit code. Side effects are
*  limited to the injected `stdout`, so tests can call it in-process. */
async function runCli(argv, io) {
	const { result, pretty, cause } = await dispatch(argv, io.cwd);
	if (cause !== void 0 && process.env.C4HERO_DEBUG === "1") io.stderr?.(`${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}\n`);
	const text = pretty && result.ok && result.command === "help" ? formatHelp(result) : formatResult(result, pretty);
	io.stdout(text + "\n");
	return exitCodeFor(result);
}
//#endregion
//#region src/cli/bin.ts
process.exitCode = await runCli(process.argv.slice(2), {
	cwd: process.cwd(),
	stdout: (text) => process.stdout.write(text),
	stderr: (text) => process.stderr.write(text)
});
//#endregion
export {};
