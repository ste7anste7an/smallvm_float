// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with GetText
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Copyright 2025 John Maloney, Bernat Romagosa, and Jens Mönig

// libraryinfo.js - Dialog for library creation and library properties display

// Bernat Romagosa, 2026

class LibraryInfoWindow extends FloatingWindow {
	constructor(library) {
		const contents = document.createElement('div');
		const buttons = [{ label: 'Cancel', action: ()=>{}, closesWindow: true }];
		if (IDE.isDevMode()) {
			buttons.unshift({ label: 'Save', action: onSave, closesWindow: true });
		}
		super({
			title: library.moduleName,
			body: contents,
			buttons: buttons,
			height: 350,
			width: 350,
			resizable: true,
			className: 'library'
		})
		this.library = library;
		contents.replaceWith(this.bodyDiv());

		function onSave() { this.saveChanges(); };
	}

	saveChanges() {
		//TODO
		console.log('Saving...');
	}

	bodyDiv() {
		let div = document.createElement('div');

		div.appendChild(this.fieldFor('moduleName'));
		div.appendChild(this.fieldFor('description'));

		let fieldGroup = document.createElement('div');
		fieldGroup.classList.add('window__field_group');
		fieldGroup.appendChild(this.fieldFor('author'));
		fieldGroup.appendChild(this.fieldFor('version'));
		div.appendChild(fieldGroup);

		fieldGroup = document.createElement('div');
		fieldGroup.classList.add('window__field_group');
		fieldGroup.appendChild(this.fieldFor('dependencies'));
		fieldGroup.appendChild(this.fieldFor('moduleCategory'));
		div.appendChild(fieldGroup);
		return div;
	}

	fieldFor(selector) {
		let field = document.createElement('div');
		let label = document.createElement('l-');
		label.innerText = this.labelFor(selector);
		let input =
			['moduleName', 'author'].includes(selector) ?
				this.textInput(selector) :
				this[selector + 'Input']();
		field.classList.add('window__field');
		field.classList.add(selector);
		field.appendChild(label);
		field.appendChild(input);
		return field;
	}

	textInput(selector, value) {
		let input = document.createElement('input');
		input.classList.add('window__input');
		input.type = 'text';
		input.value = value ?? this.library[selector];
		input.readOnly = !IDE.isDevMode();
		return input;
	}

	descriptionInput() {
		let textarea = document.createElement('textarea');
		textarea.textContent = this.library.description;
		textarea.readOnly = !IDE.isDevMode();
		return textarea;
	}

	versionInput() {
		return this.textInput('version', this.library.version.join('.'));
	}

	dependenciesInput() {
		let div = document.createElement('div');
		div.classList.add('dependency__list');
		if (this.library.dependencies.length) {
			this.library.dependencies.forEach(dep => {
				let span = document.createElement('span');
				span.innerText = dep[0] == '_' ? dep.substr(1) : dep;
				div.appendChild(span);
			});
		} else {
			let text = document.createElement('l-');
			text.innerText = 'None';
			div.appendChild(text);
		}
		if (IDE.isDevMode()) {
			// TODO buttons to add and remove dependencies
		}
		return div;
	}

	moduleCategoryInput() {
		let button = document.createElement('button');
		button.style.backgroundColor =
			Categories.colorFor(this.library.moduleCategory);
		// TODO click action when in devmode to open category picker
		return button;
	}

	labelFor(selector) {
		return {
			moduleName: 'Library Name',
			description: 'Description',
			author: 'Author',
			version: 'Version',
			dependencies: 'Dependencies',
			moduleCategory: 'Color'
		}[selector];
	}
}

customElements.define('libinfo-', LibraryInfoWindow);
