// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with GetText
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Copyright 2026 John Maloney, Bernat Romagosa, and Jens Mönig

// libraryinfo.js - Dialog for displaying library properties

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
		});
		this.cachedLibraryName = library.moduleName;
		this.library = library;
		this.fields = {};
		contents.replaceWith(this.bodyDiv());

		function onSave() { this.saveChanges(); };
	}

	saveChanges() {
		Object.keys(this.fields).forEach(fieldName => {
			this.library[fieldName] =
				this.extractInputValue(fieldName, this.fields[fieldName]);
		});
		if (this.cachedLibraryName !== this.library.moduleName) {
			// library name changed, we need to update the library map in the project
			let map = MB_editor.project.libraries;
			map.set(this.library.moduleName, map.get(this.cachedLibraryName));
			map.delete(this.cachedLibraryName);
			MB_editor.updateLibraryList();
		}
	}

	extractInputValue(selector, input) {
		if (['moduleName', 'author', 'description'].includes(selector)) {
			return input.value;
		} else if (selector == 'version') {
			return input.value.split('.');
		} else if (selector == 'dependencies') {
			return Array.from(input).map(div => div.getAttribute('data-value'));
		} else if (selector == 'moduleCategory') {
			return input.getAttribute('data-value');
		}
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
		this.fields[selector] = input;
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
				span.setAttribute('data-value', dep);
				div.appendChild(span);
			});
		} else {
			let text = document.createElement('l-');
			text.innerText = 'None';
			div.appendChild(text);
		}
		if (IDE.isDevMode()) {
			let addButton = document.createElement('button');
			let removeButton = document.createElement('button');
			addButton.classList.add('button-rounded');
			addButton.innerText = '+';
			addButton.onclick = (event) => this.addDependency(event);
			removeButton.classList.add('button-rounded');
			removeButton.innerText = '-';
			removeButton.onclick = (event) => {
				this.removeDependency(event, removeButton);
			};
			div.appendChild(addButton);
			div.appendChild(removeButton);
		}
		return div;
	}

	addDependency(event) {
		console.log(event);
		FloatingWindow.prompt(
			'Dependency name or URL?',
			localized(`If you are adding a library that\'s built into MicroBlocks, you
				can just enter its name.`) +
				localized(`If the library is hosted online, please input its full URL`),
			(depName) => {
				if (depName.startsWith('http')) {
					FloatingWindow.inform(
						'Not implemented',
						'Online dependencies not yet implemented sorry! Come back tomorrow.'
					);
				}
				if (!this.library.dependencies.includes(depName)) {
					this.library.dependencies.push(depName);
					this.rebuildDependencyInput();
				}
			},
			() => {}
		);
	}

	removeDependency(event, trigger) {
		Menus.popUpFromDescriptor(
			{
				selector: 'removeLibraryDependency',
				type: 'context',
				items: this.library.dependencies.map(depName => {
					return {
						label: depName,
						action: () => {
							this.library.dependencies.splice(
								this.library.dependencies.indexOf(depName),
								1
							);
							this.rebuildDependencyInput();
						}
					}
				})
			},
			trigger, // triggerElement
			null, // target
			event
		);
	}

	rebuildDependencyInput() {
		// first build the new dependencies view
		let newDepInput = this.dependenciesInput();
		// then replace the current DOM element with the new view
		this.fields.dependencies.replaceWith(newDepInput);
		// then store the new view into the fields dictionary
		this.fields.dependencies = newDepInput;
	}

	moduleCategoryInput() {
		let button = document.createElement('button');
		button.style.backgroundColor =
			Categories.colorFor(this.library.moduleCategory);
		button.setAttribute('data-value', this.library.moduleCategory);
		button.onclick = (event) => {
			Menus.popUpFromDescriptor(
				{
					selector: 'categoryColor',
					type: 'context',
					items: Categories.categoryNames().map(catName => {
						let item = document.createElement('div'),
							color = document.createElement('div'),
							label = document.createElement('span');
						item.classList.add('category--color-item');
						color.classList.add('color--rectangle');
						color.style.backgroundColor = Categories.colorFor(catName);
						label.innerText = catName;
						item.appendChild(color);
						item.appendChild(label);
						return {
							label: item,
							action: () => {
								this.library.moduleCategory = catName;
								this.rebuildModuleCategoryInput();
							}
						}
					})
				},
				button,
				null, // target
				event
			);
		};
		return button;
	}

	rebuildModuleCategoryInput() {
		// see rebuildDependencyInput
		let newModuleInput = this.moduleCategoryInput();
		this.fields.moduleCategory.replaceWith(newModuleInput);
		this.fields.moduleCategory = newModuleInput;
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
