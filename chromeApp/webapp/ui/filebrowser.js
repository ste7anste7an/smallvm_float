// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with GetText
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Copyright 2026 John Maloney, Bernat Romagosa, and Jens Mönig

// filebrowser.js - Dialog to load libraries or projects

// Sam McHardy, 2026
// Bernat Romagosa, 2026

class FileBrowser extends FloatingWindow {
	constructor(anAction, defaultPath, extensionList) {
		const contents = newDiv();

		if (typeof extensionList === 'string') { extensionList = [extensionList]; }
		let forLibraries = (extensionList.includes('.ubl'));
			
		super({
			title: 'Load ' + ( forLibraries ? 'Library' : 'Project'),
			body: contents,
			minHeight: 400,
			minWidth: 500,
			resizable: true,
			className: 'browser'
		});

		this.markdown = new MiniGFM();

		this.extensions = extensionList;
		this.forLibraries = forLibraries;
		this.topDir = '';
		this.currentDir = '';
		this.selection = [,,]; // the value of the marked row
		this.answer = '';
		this.action = anAction;

		this.folderTranslationPrefix = '';
		
		if (this.extensions &&
				(this.extensions.includes('.ubl') ||
					this.extensions.includes('.ubp') ||
					this.extensions.includes('.gpp'))
		) {
			this.folderTranslationPrefix = 'folder;';
		}

		if (forLibraries) {
			this.fileSelectAction = this.fileSelected;
		}

		contents.replaceWith(this.bodyDiv());

		this.addEventListener('keydown', e => this.handleKeyDown(e.key));

		let path = defaultPath || '';
		if ((path.length > 1) && path.endsWith('/')) { path = path.slice(0, -1); }
		this.showFolder(path, !path.includes('/'));
	}

	handleKeyDown(key) {
		// Up and Down mark the previous or next row. Enter and Escape belong to
		// the window (FloatingWindow popUp), and other keys do nothing here.
		if ((key != 'ArrowDown') && (key != 'ArrowUp')) { return; }
		let files = this.folderContents(),
			currentIndex = files.map(pair=>pair[1]).indexOf(this.selection[1]),
			newIndex = currentIndex;
		if (key == 'ArrowDown') {
			if (currentIndex < 0) {
				newIndex = 0;
			} else {
				newIndex = Math.min((newIndex + 1), files.length - 1);
			}
		} else if (key == 'ArrowUp') {
			if (currentIndex < 0) {
				newIndex = files.length - 1;
			} else {
				newIndex = Math.max((newIndex - 1), 0);
			}
		}
		if (files.length == 0) { return; }
		this.fileOrFolderSelected(files[newIndex], true);
	}

	loadSelectedFile() {
		if (!this.selection) { return; }
		if (this.selection[2]) { // isDir
			this.showFolder(this.currentDir + '/' + this.selection[1], false);
		} else {
			this.answer = this.currentDir + '/' + this.selection[1];
			if (this.action) { this.action(this.answer); }
			this.remove();
		}
	}

	cancel() { this.remove(); }

	async createLibrary() {
		const libName = await MB_editor.prompt(localized('New library name?'), '');
		if (!libName) { return; }
		if (!MB_editor.newLibrary(libName)) { return; }
		MB_editor.showLibraryInfo(libName, true);
		this.cancel();
	}

	async promptURL() {
		let url;
		this.remove();
		if (this.forLibraries) {
			url = await MB_editor.promptLibraryURL();
		} else {
			url = await MB_editor.openFromURL();
		}
	}

	bodyDiv() {
		let div = newDiv('panel__container');
		div.appendChild(this.sideDiv());
		div.appendChild(this.mainDiv());
		return div;
	}

	mainDiv() {
		let div = newDiv('main'),
			navigation = newDiv('navigation__container');

		navigation.appendChild(this.navigationBar());
		navigation.appendChild(this.navigator());

		div.appendChild(navigation);
		div.appendChild(this.buttons());
		return div;
	}

	navigationBar() {
		let div = newDiv('navigation__bar');
		this.parentButton = Icon.forSelector('arrow-right--16x16');
		this.parentButton.onclick = () => this.moveUpFolder();
		this.folderReadout = newElement('h3');
		this.folderReadout.appendChild(newLabel('MicroBlocks'));
		this.parentButton.classList.add('button-rounded');
		div.appendChild(this.parentButton);
		div.appendChild(this.folderReadout);
		return div;
	}

	moveUpFolder() {
		const i = this.currentDir.lastIndexOf('/');
		if (i < 0) { return; }
		this.showFolder(this.currentDir.slice(0, i), false);
	}

	navigator() {
		let div = newDiv('navigation__panel');
		this.fileListView = newDiv('navigation__list');

		div.appendChild(this.fileListView);

		if (this.forLibraries) {
			// keep track of HTTP fetches so the latest one wins
			this.requestCount = 0;
			this.libraryDescriptionView = newDiv('description');
			div.appendChild(this.libraryDescriptionView);
		}
		return div;
	}

	localizeDir(folderName) {
		// A folder label is translated under 'folder;<name>'. An untranslated
		// one shows its plain name rather than the key.

		const key = this.folderTranslationPrefix + folderName;
		const label = localized(key);
		return (label === key) ? folderName : label;
	}

	folderContents() {
		// Rows of [label, value, isFolder]: folders first, then the files that
		// match the extensions, each group in case-insensitive order, dot names
		// hidden.

		const ext = this.extensions;
		const showExtension = !ext ||
			!(ext.includes('.ubl') || ext.includes('.ubp') || ext.includes('.gpp'));
		const { dirs, files } = this.listFolder(this.currentDir);
		const result = [];
		if (this.topDir != this.currentDir) {
			// add a fake folder that brings you one level up
			result.push(['🡨','..',true]);
		}
		for (const dir of dirs.sort(MB_FilePicker.caseInsensitiveOrder)) {
			if (!dir.startsWith('.')) {
				result.push([this.localizeDir(dir), dir, true]);
			}
		}
		for (const fn of files.sort(MB_FilePicker.caseInsensitiveOrder)) {
			if (fn.startsWith('.')) { continue; }
			if (ext && !ext.some((e) => fn.endsWith(e))) { continue; }
			if (showExtension) {
				result.push([fn, fn, false]);
			} else {
				const dot = fn.lastIndexOf('.');
				result.push([localized((dot < 0) ? fn : fn.slice(0, dot)), fn, false]);
			}
		}
		return result;
	}

	listFolder(dir) {
		// The folders and files directly inside dir, from the built-in file list.

		const prefix = dir ? dir + '/' : '';
		const dirs = new Set();
		const files = [];
		for (const path of (MB_Files.fileNames || [])) {
			if (!path.startsWith(prefix)) { continue; }
			const rest = path.slice(prefix.length);
			const slash = rest.indexOf('/');
			if (slash < 0) {
				files.push(rest);
			} else {
				dirs.add(rest.slice(0, slash));
			}
		}
		return { dirs: [...dirs], files };
	};

	updateView() {
		this.folderReadout.innerText = this.localizeDir(
			this.currentDir.slice(this.currentDir.lastIndexOf('/') + 1)
		);

		const below =
			this.currentDir.startsWith(this.topDir) &&
				(this.currentDir.length > this.topDir.length);
		this.parentButton.disabled = !below;
		if (below) {
			this.parentButton.classList.remove('--is-disabled');
		} else {
			this.parentButton.classList.add('--is-disabled');
		}

		let list = newElement('ul');
		this.fileListView.replaceChildren(list);
		this.folderContents().forEach(entry => {
			let item = newElement('li');
			if (entry[2]) { //isFolder
				item.appendChild(Icon.forSelector('folder-open--16x16'));
			}
			item.appendChild(newLabel(isString(entry) ? entry : entry[0]));
			item.onclick = () => this.fileOrFolderSelected(entry, false);
			item.ondblclick = () => this.fileOrFolderDoubleClicked(entry);
			list.appendChild(item);
		});
	}

	fileOrFolderSelected(entry, ignoreDirectories) {
		// Mark a row. A folder row is entered unless ignoreDirectories is set.
		// entry is of the form:
		// [ localizedFileNameWithoutExtension, originalFileName, isDir ]

		let isDir = entry[2];
		this.selection = entry;
		this.fileListView.childNodes[0].childNodes.forEach(node => {
			if (node.innerText == entry[0]) {
				node.classList.add('selected');
			} else {
				node.classList.remove('selected')
			}
		});
		if (isDir) {
			if (this.forLibraries) { this.clearLibraryFields(); }
			if (ignoreDirectories) { return; }
			this.showFolder(this.currentDir + '/' + entry[1], false);
		} else if (this.fileSelectAction) {
			this.fileSelectAction(this.currentDir + '/' + entry[1]);
		}
	}

	fileOrFolderDoubleClicked(entry) {
		this.selection = entry;
		this.loadSelectedFile();
	}

	showFolder(path, isTop) {
		if (path.endsWith('/..')) {
			this.moveUpFolder();
			return;
		}
		this.currentDir = path;
		if (isTop) { this.topDir = path; }
		this.selection = [,,];
		if (this.forLibraries) { this.clearLibraryFields(); }
		this.updateView();
		if (this.folderSelectAction) { this.folderSelectAction(path); }
	}

	async fileSelected(path) {
		// Show the properties of the library in the file at path. The project
		// is not changed. A later selection wins over a slower earlier read.

		const request = ++this.requestCount;
		const data = await MB_Files.readFile(path);
		if (request !== this.requestCount) { return; }
		if (!data) {
			this.libraryDescriptionView = newDiv('description');
			return;
		}
		const fileName = path.slice(path.lastIndexOf('/') + 1);
		const lib = new MB_Module(fileName.replace(/\.ubl$/, ''));
		const cmdList = MB_Parser.parse(data);
		lib.loadModuleNameAndCategory(cmdList);
		lib.loadVersion(cmdList);
		lib.loadAuthor(cmdList);
		lib.loadDependencies(cmdList);
		lib.loadDescription(cmdList);
		this.library = lib;
		this.updateLibraryFields();
	}

	clearLibraryFields() {
		this.libraryDescriptionView.innerHTML = '';
	}

	updateLibraryFields() {
		this.clearLibraryFields();
		let lib = this.library;
		[
			{ label: 'Description', content: this.markdown.parse(lib.description) },
			{ label: 'Author', content: newLabel(lib.author) },
			{ label: 'Version', content: newLabel(lib.version.join('.')) },
			{ label: 'Dependencies', content: newLabel(lib.dependencies.join(',')) }
		].forEach(each => {
			let title = newElement('span', 'field-name');
			title.appendChild(newLabel(each.label));
			this.libraryDescriptionView.appendChild(title);
			let value = newElement('span', 'field-text');
			if (typeof each.content == 'string') {
				value.innerHTML = each.content;
			} else {
				// assume DOM element
				value.appendChild(each.content);
			}
			this.libraryDescriptionView.appendChild(value);
		});
	}


	buttons() {
		let div = newDiv('window__buttons');
		div.appendChild(newButton('Open', () => this.loadSelectedFile()));
		div.appendChild(newButton('Cancel', () => this.cancel()));
		return div;
	}

	sideDiv() {
		let div = newDiv('sidebar');
		div.appendChild(this.shortcuts());
		if (this.forLibraries) {
			div.appendChild(newButton('New Library', () => this.createLibrary()));
		}
		return div;
	}

	shortcuts() {
		let div = newDiv('shortcuts'),
			title = document.createElement('span'),
			list = document.createElement('ul');

		title.appendChild(newLabel('Shortcuts'));

		[
			this.forLibraries ? 'Libraries' : 'Examples',
			'Computer',
			'Cloud'
		].forEach(label => {
			let item = document.createElement('li'),
				a = document.createElement('button');
			a.appendChild(newLabel(label));
			a.onclick = () => this.selectSource(label);
			item.appendChild(a);
			list.appendChild(item);
		});

		div.appendChild(title);
		div.appendChild(list);

		return div;
	}

	selectSource(source) {
		switch(source) {
			case 'Computer':
				this.remove();
				let ext = this.extensions ? this.extensions[0] : '';
				if (ext.startsWith('.')) { ext = ext.slice(1); }
				MB_editor.browserReadFile(ext);
				break;
			case 'Cloud':
				this.promptURL();
				break;
			case 'Libraries':
				this.showFolder('Libraries');
				break;
			case 'Examples':
				this.showFolder('Examples');
				break;
			default:
				console.log('not yet implemented', source);
		}
	}
}

customElements.define('browser-', FileBrowser);
