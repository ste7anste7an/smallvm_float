const Categories = {
	descriptors: [
		{
			label: 'cat;Output',
			color: '#4852bf'
		},
		{
			label: 'cat;Input',
			color: '#9f42a5'
		},
		{
			label: 'cat;Pins',
			color: '#548799'
		},
		{
			label: 'cat;Comm',
			color: '#1e997a',
			advanced: true
		},
		{
			label: 'cat;Control',
			color: '#d18c25'
		},
		{
			label: 'cat;Operators',
			color: '#479d1d'
		},
		{
			label: 'cat;Variables',
			color: '#d3732a'
		},
		{
			label: 'cat;Data',
			color: '#c44e6b'
		},
		{
			label: 'cat;My Blocks',
			color: '#1a8cdd'
		}
	]
};


Categories.colorFor = function (categoryName) {
	let descriptor = this.descriptors.find(descriptor => {
		return descriptor.label == 'cat;' + categoryName
	});
	// default "Generic" category color is #1e997a
	return descriptor ? descriptor.color : '#1e997a';
};


Categories.build = function (descriptors, className, dataIde) {
	let container = document.createElement('div');
	container.classList.add(className);
	container.setAttribute('data-ide', dataIde);
	descriptors.forEach(descriptor => {
		container.appendChild(this.elementFor(descriptor));
	});
	return container;
};


Categories.buildStandard = function () {
	return this.build(this.descriptors, 'categories__list', 'categories-list');
};


Categories.buildLibraries = function (descriptors) {
	return this.build(
		descriptors.map(descriptor => {
			return {
				label: descriptor.label,
				color: this.colorFor(descriptor.category),
				isLibrary: true
			};
		}),
		'libraries__list',
		'libraries-list'
	);
};


Categories.elementFor = function (descriptor) {

	// Create element
	let button = document.createElement('button');
	let loc = document.createElement('l-');
	button.classList.add('category-button');
	button.style.backgroundColor = descriptor.color;
	button.ariaLabel = 'Block Category';
	button.ariaDescription = '[l] to show the blocks in this category';
	loc.innerText = descriptor.label;
	button.appendChild(loc);

	// Associate functionalities
	if (descriptor.isLibrary) {
		button.onclick = () => {
			GP.apiCall('ide.selectLibrary', [descriptor.label]);
		};
		button.oncontextmenu = (e) => {
			Menus.popUp('library', button, descriptor.label, e);
			e.preventDefault();
		};

	} else {
		if (descriptor.label == 'cat;My Blocks') {
			button.oncontextmenu = (e) => {
				Menus.popUp('myBlocks', button, null, e);
				e.preventDefault();
			};
		}
		button.onclick = () => {
			GP.apiCall('ide.selectCategory', [descriptor.label]);
		};
	}

	// Selected and Dev Mode
	if (IDE.currentCategory == descriptor.label) {
		button.classList.add('--is-selected');
	}
	if (descriptor.advanced && !IDE.userPreference('devMode')) {
		button.classList.add('--is-hidden');
	}

	return button;
};


document.addEventListener(
	'currentCategory',
	(e) => {
		document.querySelectorAll('.category-button').forEach(element => {
				if (element.innerText == GetText.localize(e.detail.value)) {
					element.classList.add('--is-selected');
				} else {
					element.classList.remove('--is-selected');
				}
			}
		);
	}
);


document.addEventListener(
	'libraryList',
	(e) => {
		let librariesList = document.querySelector('[data-ide="libraries-list"]');

		if (IDE.libraryList?.length > 0) {
			IDE.populateLibraries(librariesList);
		} else {
			librariesList.innerHTML = '';
		}
	}
);
