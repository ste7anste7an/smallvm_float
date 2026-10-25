// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright 2026 John Maloney and Bernat Romagosa

// mb-autosave.js - keeps unsaved work in the browser's IndexedDB, so that after
// a crash, a reload or a closed tab the next page can offer it back.

/* global localized */

class MB_Autosave {
	constructor(editor) {
		this.editor = editor;
		this.delay = 1500; // milliseconds from an edit to writing it
		this.maxAge = 7 * 24 * 3600 * 1000; // older work is not offered to whoever uses this browser next
		this.timer = null;
		this.writes = 0; // projects written since the page loaded
		this.writeFailed = false; // a write failed once, so the page stops trying
		this.warned = false;
		this.dbPromise = null;
		// New on every load, so a page never writes over a record it has not offered.
		this.pageID = Date.now().toString(36) + Math.random().toString(36).slice(2);
		this.asking = false; // the restore question is open
		this.offer = Promise.resolve(); // settles once the startup question and any restore are done
	}

	start() {
		// Called once the editor is open. Offer back what a page that is gone left
		// behind, and keep this page's own work from now on.
		document.addEventListener('visibilitychange', () => {
			if (document.hidden && this.timer) this.writeNow();
		});
		// Held while this page is open, so another tab can tell that its record is in use.
		if (navigator.locks) navigator.locks.request(this.lockName(this.pageID), () => new Promise(() => {}));
		this.offer = this.offerRestore().catch((e) => this.failed(e));
		return this.offer;
	}

	edited() {
		// The project changed. Written after a short delay, so a burst of edits is one write.
		if (this.writeFailed || this.timer) return;
		this.timer = setTimeout(() => this.writeNow(), this.delay);
	}

	saved(downloaded) {
		// Nothing to keep once the project is in a file, unless it was edited while the save dialog was open.
		// The page cannot tell whether a download worked, so its copy is kept, with any edit not yet written.
		if (!downloaded) this.writeNow();
		else if (this.timer) this.writeNow(true);
	}

	async writeNow(keep = false) {
		clearTimeout(this.timer);
		this.timer = null;
		if (this.asking) return; // written when the question closes
		const editor = this.editor;
		// The project holds the blocks themselves, so part of a script in the hand is
		// missing from its text: write after the drop.
		if (editor.scriptsOutOfPane() === 'part') {
			if (!this.writeFailed) this.timer = setTimeout(() => this.writeNow(keep), this.delay);
			return;
		}
		if (!(editor.hasUnsavedEdits() || (keep && editor.project.hasUserCode()))) return this.remove(this.pageID); // saved, or emptied
		if (this.writeFailed) return;
		const record = { tab: this.pageID, name: editor.projectName, text: editor.project.codeString(), time: Date.now() };
		try {
			await this.inStore('readwrite', (store) => store.put(record));
			this.writes++;
		} catch (e) {
			this.failed(e);
		}
	}

	async remove(pageID) {
		try {
			await this.inStore('readwrite', (store) => store.delete(pageID));
		} catch (e) {
			this.warn(e);
		}
	}

	async offerRestore() {
		const records = await this.inStore('readonly', (store) => store.getAll());
		const left = [];
		for (const r of records) {
			if (!r.text || ((Date.now() - r.time) > this.maxAge)) await this.remove(r.tab);
			else if (!(await this.inUse(r.tab))) left.push(r);
		}
		if (0 === left.length) return;
		const record = left.reduce((a, b) => (b.time > a.time ? b : a));

		this.asking = true;
		let yes;
		try {
			yes = await this.ask(record);
		} finally {
			this.asking = false;
			if (this.editor.unsavedEdits) this.edited(); // an edit made while the question was open
		}
		if (yes) await this.restore(record);
		if (yes === false) await this.remove(record.tab);
		// Closed without an answer: kept, and offered again next time.
	}

	ask(record) {
		// Answer true, false, or null when the question's window was closed unanswered.
		const title = (record.name || '').replace(/\.ubp$/, '') || localized('Untitled');
		const when = new Date(record.time).toLocaleString();
		return this.editor.confirm(localized('Restore unsaved work?') + ' ' + title + ' (' + when + ')', null);
	}

	async restore(record) {
		// Opened the way a file is. A record that cannot be opened is dropped; one the
		// user chose not to put in place of their current work is kept.
		const editor = this.editor;
		const before = editor.project;
		const hadWork = before.hasUserCode();
		await editor.openProjectFromString(record.text, record.name || localized('Untitled'));
		if (editor.project === before) {
			if (!hadWork) await this.remove(record.tab);
			return;
		}
		editor.projectName = record.name;
		editor.updateProjectProperties();
		editor.unsavedEdits = true; // still in no file
		await this.writeNow(); // this page keeps it from now on
		await this.remove(record.tab);
	}

	// Storage

	inStore(mode, action) {
		// Answer the result of action on the projects store once its transaction completes.
		return this.database().then((db) => new Promise((resolve, reject) => {
			const tx = db.transaction('projects', mode);
			const request = action(tx.objectStore('projects'));
			tx.oncomplete = () => resolve(request.result);
			tx.onerror = tx.onabort = () => reject(tx.error);
		}));
	}

	database() {
		if (!this.dbPromise) this.dbPromise = new Promise((resolve, reject) => {
			const request = indexedDB.open('microblocks-autosave', 1);
			request.onupgradeneeded = () => request.result.createObjectStore('projects', { keyPath: 'tab' });
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		return this.dbPromise;
	}

	failed(e) {
		// Editing goes on without autosave: a private window or blocked storage is not an error to show.
		this.warn(e);
		this.writeFailed = true;
		clearTimeout(this.timer);
		this.timer = null;
		this.remove(this.pageID); // an older copy of this page's work must not be offered later
	}

	warn(e) {
		if (!this.warned) console.warn('Autosave is off:', e);
		this.warned = true;
	}

	// Pages

	lockName(pageID) { return 'mb-autosave-' + pageID; }

	async inUse(pageID) {
		// Whether an open tab holds the lock of the page that wrote a record. Without Web Locks, none does.
		if (!navigator.locks) return false;
		return navigator.locks.request(this.lockName(pageID), { ifAvailable: true }, (lock) => lock === null);
	}
}
