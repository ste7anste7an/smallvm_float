// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// mb-compare.js - compiler output comparison for compare.html
//
// Sweeps every project in Examples and Libraries, compiles every function,
// and shows what changed: against a saved snapshot (so a compiler change is
// visible function by function), or against the GP compiler when the GP
// runtime (gp_wasm, mb-gpAPI.js) is loaded in the page.

/* globals MB_Files, MB_Project, MB_Compiler, GP */

const MB_Compare = {
	current: null,    // fileName::funcName -> {bytes: hexString, listing: [line]}
	baseline: null,
	running: false,
};

// ---------- sweeping ----------

MB_Compare.sweep = async function (statusFn) {
	const results = {};
	const errors = [];
	if (typeof MB_Specs !== 'undefined' && MB_Specs.initialize) MB_Specs.initialize();
	await MB_Files.initialize();
	const files = [...MB_Files.allFilesIn('Examples'), ...MB_Files.allFilesIn('Libraries')]
		.filter((f) => /\.(ubp|ubl)$/.test(f));
	let done = 0;
	for (const fileName of files) {
		statusFn(`compiling ${++done}/${files.length}: ${fileName}`);
		const text = await MB_Files.readFile(fileName);
		if (!text) { errors.push(fileName + ': unreadable'); continue; }
		try {
			const project = new MB_Project().loadFromString(text, false);
			const compiler = new MB_Compiler(project);
			const record = (key, obj) => {
				try {
					// pass the object: instructionsFor does not resolve names
					const bytes = compiler.compiledBytesFor(obj);
					const listing = compiler.instructionsFor(obj)
						.map((item) => Array.isArray(item) ? item.join(' ') : String(item));
					// The chunk TYPE is recorded as well as the bytes, and it is
					// not decoration. A hat block compiled as a plain command
					// chunk loses its hat and compiles to the SAME bytes, so a
					// byte comparison alone reports that nothing moved -- which
					// is exactly how a chunkTypeFor defect stayed invisible
					// while 189 hats in this corpus were being destroyed.
					let chunkType = null;
					try { chunkType = compiler.codeManager.chunkTypeFor(obj); } catch (e) { /* no type */ }
					results[key] = { bytes: MB_Compare.toHex(bytes), listing, chunkType };
				} catch (e) {
					results[key] = { error: String(e && e.message || e) };
				}
			};

			for (const f of project.allFunctions()) {
				record(fileName + '::' + f.functionName, f);
			}
			// Top-level scripts too. Every .ubp holds them, they take a
			// different chunk type from a function, and sweeping only
			// allFunctions() left every `when started` in the corpus unwatched.
			// They have no name, so they are keyed by position.
			let scriptIndex = 0;
			for (const script of project.allScripts()) {
				record(fileName + '::script#' + (scriptIndex++), script);
			}
		} catch (e) {
			errors.push(fileName + ': ' + String(e && e.message || e));
		}
		// let the page breathe every file
		await new Promise((r) => setTimeout(r, 0));
	}
	return { results, errors, fileCount: files.length };
};

MB_Compare.toHex = function (bytes) {
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

// ---------- snapshot ----------

MB_Compare.saveBaseline = function () {
	MB_Compare.baseline = MB_Compare.current;
	// Persist bytes only: with listings the corpus blows the localStorage
	// quota. A reloaded baseline can still say WHICH functions changed; the
	// side-by-side listing diff needs a baseline saved this session (or a
	// downloaded baseline file, which keeps everything).
	try {
		const compact = {};
		for (const [k, v] of Object.entries(MB_Compare.baseline)) {
			compact[k] = v.error ? { error: v.error } : { bytes: v.bytes };
		}
		localStorage.setItem('mbCompareBaseline', JSON.stringify(compact));
	} catch (e) { /* storage unavailable; the in-memory baseline still works */ }
};

MB_Compare.loadSavedBaseline = function () {
	try {
		const s = localStorage.getItem('mbCompareBaseline');
		if (s) MB_Compare.baseline = JSON.parse(s);
	} catch (e) { /* ignore */ }
};

MB_Compare.downloadBaseline = function () {
	const blob = new Blob([JSON.stringify(MB_Compare.baseline || MB_Compare.current)],
		{ type: 'application/json' });
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = 'compiler-baseline.json';
	a.click();
};

// ---------- comparing ----------

MB_Compare.diffAgainstBaseline = function () {
	const cur = MB_Compare.current || {};
	const base = MB_Compare.baseline || {};
	const rows = [];
	const keys = new Set([...Object.keys(cur), ...Object.keys(base)]);
	for (const key of [...keys].sort()) {
		const a = base[key], b = cur[key];
		let status;
		if (!a) status = 'new';
		else if (!b) status = 'gone';
		else if (a.error || b.error) status = (a.error === b.error) ? 'same' : 'changed';
		else if (a.bytes !== b.bytes) status = 'changed';
		// Same bytes, different chunk type: a hat that came back as a plain
		// command chunk compiles identically and is still a changed program.
		// Called out separately so it cannot be read as an ordinary byte diff.
		else if (a.chunkType != null && b.chunkType != null && a.chunkType !== b.chunkType) {
			status = 'reshaped';
		} else status = 'same';
		rows.push({ key, status, base: a, cur: b });
	}
	return rows;
};

// Ask GP (the wasm runtime) for its bytes for one function. Requires the
// gp_wasm runtime and a test.compile endpoint that takes (projectData,
// functionName); test.compileExample only compiles its hard-coded function.
MB_Compare.gpBytesFor = function (projectData, functionName) {
	return new Promise((resolve) => {
		if (typeof GP === 'undefined' || !GP.apiCall) { resolve(null); return; }
		const timeout = setTimeout(() => resolve(null), 5000);
		GP.apiCall('test.compile', [projectData, functionName], (value) => {
			clearTimeout(timeout);
			resolve(Array.isArray(value) ? MB_Compare.toHex(value) : null);
		});
	});
};

// ---------- listing diff rendering ----------

MB_Compare.renderListingDiff = function (baseListing, curListing) {
	// Simple aligned diff: walk both listings, mark lines that differ.
	const max = Math.max(baseListing.length, curListing.length);
	const rows = [];
	for (let i = 0; i < max; i++) {
		const a = baseListing[i] ?? '';
		const b = curListing[i] ?? '';
		rows.push({ n: i, a, b, same: a === b });
	}
	return rows;
};
