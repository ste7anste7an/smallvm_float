FloatingWindow.graph = function () {
	if (Graph.isOpen()) {
		// toggle graph
		Graph.window.remove();
		return;
	}

	if (!Graph.body) { Graph.build(); }

	let win = new FloatingWindow({
		title: 'Data Graph',
		body: Graph.body,
		width: Graph.width + 24,
		height: Graph.height + 24,
		resizable: true,
		onResize: Graph.resize,
		onOpen: () => {
			IDE.controlsButtons.querySelector('.--graph').classList.add('--is-active');
		},
		onClose: () => {
			IDE.controlsButtons.querySelector('.--graph').classList.remove('--is-active');
		},
		target: Graph
	});

	Graph.window = win;
	win.popUp();
	return win;
};

const Graph = {
	origin: 'center',
	step: 25,
	defaultStep: 25,
	stepRange: [1,5,10,25,50,100,250,500,1000,2500,5000],
	spacing: 25,
	offset: { 'center': 16, 'bottom': 40 },
	width: 400,
	height: 250,
	dataTracks: [[],[],[],[],[],[]],
	trackColors: [
		'rgb(200,0,0)',
		'rgb(0,110,0)',
		'rgb(0,0,200)',
		'rgb(30,30,30)',
		'rgb(0,170,170)',
		'rgb(180,0,180)'
	]
};

Graph.isOpen = function () {
	return document.querySelector('.window #graph-canvas') != null;
}

Graph.build = function () {
	let container = document.createElement('div');
	container.classList.add('window__body-object');

	this.canvas = document.createElement('canvas');
	this.canvas.id = 'graph-canvas';
	this.canvas.style.display = 'block';

	this.controls = document.createElement('div');
	this.controls.classList.add('window__body-object-controls');
	this.controls.classList.add('--can-drag-through');

	this.ctx = this.canvas.getContext('2d');
	this.resize(this.width, this.height);

	this.canvas.oncontextmenu = (e) => {
		Menus.popUp('graph', null, this, e);
		e.preventDefault();
	};

	this.updateControls();

	container.appendChild(this.canvas);
	container.appendChild(this.controls);

	this.body = container;

	return container;
};

Graph.updateControls = function () {
	this.controls.innerHTML = '';
	['graph_zoomOut', 'graph_restoreZoom', 'graph_zoomIn'].forEach(selector => {
		this.controls.appendChild(Buttons.elementFor(selector));
	});
};

Graph.resize = function (newWidth, newHeight) {
	this.width = newWidth - 24; // extra pixel so Electron doesn't show scrollbars
	this.height = newHeight - 24; // same here
	this.canvas.width = this.width;
	this.canvas.height = this.height;
	this.redraw();
};

Graph.redraw = function () {
	this.drawGrid();
	this.drawData();
};

Graph.drawGrid = function () {
	let range = this.height / this.spacing;
	this.ctx.fillStyle = 'white';
	this.ctx.fillRect(0, 0, this.width, this.height);
	this.ctx.font = 'lighter 12px Arial';
	this.ctx.lineWidth = 1;
	this.ctx.textAlign = 'end';
	if (this.origin == 'center') {
		for (let i = Math.floor(range/-2); i <= Math.floor(range/2); i ++) {
			this.drawRow(i, this.height - ((i + range/2) * this.spacing));
		}
	} else {
		for (let i = 0; i <= range; i ++) {
			this.drawRow(i, this.height - (i * this.spacing));
		}
	}
};

Graph.drawRow = function (index, y) {
	let offset = this.offset[this.origin];
	this.setColor(index);
	this.ctx.fillText(index * this.step, 40, y + 4 - offset);
	this.ctx.beginPath();
	this.ctx.moveTo(45, y - offset);
	this.ctx.lineTo(this.width - 5, y - offset);
	this.ctx.stroke();
};

Graph.setColor = function (index) {
	if (index % 5 == 0) {
		this.ctx.fillStyle = 'rgb(10,10,10)';
		this.ctx.strokeStyle = 'rgb(180,180,180)';
	} else {
		this.ctx.fillStyle = 'rgb(150,150,150)';
		this.ctx.strokeStyle = 'rgb(210,210,210)';
	}
};

Graph.drawData = function () {
	this.dataTracks.forEach((dataPoints, track) => {
		let x = 45,
			hRange = Math.floor(this.width) - 50,
			end = dataPoints.length,
			start = Math.max(0, end - hRange);

		this.ctx.beginPath();
		this.ctx.strokeStyle = this.trackColors[track];
		this.ctx.moveTo(x, this.scaleValue(dataPoints[start]));
		for (let i = start; i < end; i++) {
			if (dataPoints[i] !== null) {
				x++;
				this.ctx.lineTo(x, this.scaleValue(dataPoints[i]));
			}
		}
		this.ctx.stroke();
	});
};

Graph.addDataPoints = function (values) {
	for (let i = 0; i < this.dataTracks.length; i++) {
		if (values[i] == 'true') {
			this.dataTracks[i].push(100); // map true to 100 (useful for graphing digital pins)
		} else if (values[i] == 'false') {
			this.dataTracks[i].push(0); // map false to 0
		} else if (values[i]) {
			this.dataTracks[i].push(parseInt(values[i]));
		} else {
			// did I actually find a use case for NaN? I did!
			this.dataTracks[i].push(NaN);
		}
	}
	this.redraw();
};

Graph.scaleValue = function (value) {
	if (this.origin == 'center') {
		return this.height -
			value * this.spacing / this.step -
			(this.height / 2) -
			this.offset[this.origin];
	} else {
		return this.height -
			value * this.spacing / this.step -
			this.offset[this.origin];
	}
};

Graph.clear = function () {
	this.dataTracks = [[],[],[],[],[],[]];
	this.redraw();
};

Graph.increaseStep = function () {
	if (this.step < this.stepRange[this.stepRange.length - 1]) {
		this.step = this.stepRange[this.stepRange.indexOf(this.step) + 1];
	}
	this.redraw();
	this.updateControls();
};

Graph.decreaseStep = function () {
	if (this.step > this.stepRange[0]) {
		this.step = this.stepRange[this.stepRange.indexOf(this.step) - 1];
	}
	this.redraw();
	this.updateControls();
};

Graph.restoreStep = function () {
	this.step = this.defaultStep;
	this.redraw();
	this.updateControls();
};

Graph.setOrigin = function(which) {
	this.origin = which;
	this.redraw();
};

// Data import / export

Graph.exportData = function () {
	GP_writeFile(
		this.dataTracks.map(t => t.map(p => isNaN(p) ? 0 : p).join(',')).join('\n'),
		'data.csv',
		'graph'
	);
};

Graph.importData = function () {
	try {
		let fileUploader = document.getElementById('FileUploader');
		let oldCallback = fileUploader.onchange;
		let reader = new FileReader();
		reader.addEventListener('load', () => {
			try {
				this.dataTracks = reader.result.split('\n').map(
					line =>line.split(',').map(point=>parseInt(point))
				);
				this.redraw();
			} catch(err) {
				error(err);
			}

		});
		fileUploader.onchange = () => {
			try {
				reader.readAsText(fileUploader.files[0]);
				fileUploader.onchange = oldCallback;
			} catch(err) {
				error(err);
			}
		};
		fileUploader.click();
	} catch(err) {
		error(err);
	}
	function error(err) {
		FloatingWindow.inform(
			'Malformed CSV',
			'Could not read CSV file.' + '\n\n' + err
		);
	}
};

// Events

document.addEventListener(
	'graph.data',
	e => { Graph.addDataPoints(e.detail.value.split(' ')); }
);

document.addEventListener('graph.clear', e => { Graph.clear(); });


// Graph context menu

Menus.graph = {
	selector: 'graph',
	type: 'context',
	items: [
		{
			label: 'clear graph',
			action: () => { Graph.clear(); }
		},
		{ label: '-' },
		{
			label: 'increase range',
			action: () => { Graph.increaseStep(); }
		},
		{
			label: 'decrease range',
			action: () => { Graph.decreaseStep(); }
		},
		{
			label: () => {
				return Graph.origin == 'center' ? 'zero at bottom' : 'zero in middle'
			},
			action: () => {
				Graph.setOrigin(Graph.origin == 'center' ? 'bottom' : 'center');
			}
		},
		{ label: '-' },
		{
			label: 'export data to CSV file',
			action: () => { Graph.exportData(); }
		},
		{
			label: 'import data from CSV file',
			action: () => { Graph.importData(); }
		},
		{
			label: 'copy graph data to clipboard',
			action: () => { Graph.copyDataToClipboard(); },
			advanced: true
		},
		{
			label: '-',
			advanced: true
		},
		{
			label: 'set serial delay',
			action: (target, event) => {
				Menus.popUp('serialDelay', null, target, event);
			},
			advanced: true,
			keepOpenAfterClick: true
		}
	]
};

Menus.serialDelay = {
	selector: 'serialDelay',
	type: 'context',
	items: [1,2,3,4,5,6,8,10,12,14,16,18,20].map(value => {
		return {
			label: value.toString(),
			action: () => { GP.apiCall('ide.setSerialDelay', [value]); }
		}
	})
};

Menus.serialDelay.items.push({ label: '-' });
Menus.serialDelay.items.push({
	label: 'reset to default (10)',
	action: () => { GP.apiCall('ide.setSerialDelay', [10]); }
});
