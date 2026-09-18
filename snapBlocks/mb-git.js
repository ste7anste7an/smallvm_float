// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright 2026 John Maloney and Bernat Romagosa

//	mb-git.js - Connector to store and retrieve projects from different Git
//	providers

const MB_GIT_PROVIDERS = {
	codeberg: {
		baseUrl: 'https://codeberg.org/api/v1/'
	}
};

class MB_Git {
	constructor(provider) {
		if (MB_GIT_PROVIDERS[provider]) {
			this.provider = MB_GIT_PROVIDERS[provider];
		} else {
			throw new Error('Unsupported cloud provider: ' + provider);
		}
		this.repo = 'ublocks_projects';
	}

	async apiCall(method, path, body) {
		const response = await fetch(
			this.provider.baseUrl + path,
			{
				method: method,
				body: JSON.stringify(body),
				headers: {
					'Accept': 'application/json',
					'Authorization': 'Basic ' + this.authToken,
					'Content-Type': 'application/json'
				}
			}
		);
		if (!response.ok) { return false; }
		return await response.json();
	}

	async login(username, password) {
		this.authToken = btoa(`${username}:${password}`);
		this.username = username;
		const response = await this.apiCall('GET', 'user');
		if (response.login == username) {
			// User credentials are okay, check whether the project repo exists, and
			// if it doesn't, create it for them
			const repo = await this.getRepo();
			if (!repo) { await this.createRepo(); }
			return repo.name == this.repo;
		};
	}

	async getRepo() {
		return await this.apiCall('GET', `repos/${this.username}/${this.repo}`);
	}

	async createRepo() {
		return await this.apiCall(
			'POST',
			'user/repos',
			{
				description: `MicroBlocks projects by ${this.username}`,
				default_branch: 'main',
				license: 'GPLv3',
				name: this.repo
			}
		);
	}

	filePathForProject(projectName) {
		return `repos/${this.username}/${this.repo}/contents/${projectName}.ubp`
	};

	async saveProject(projectName, contents) {
		const d = new Date();
		return await this.apiCall(
			'POST',
			this.filePathForProject(projectName),
			{
				content: btoa(contents),
				message: `Updated from MicroBlocks on ${d.toISOString()}`
			});
	}

	async getProject(projectName) {
		// Get the file contents. We may need to use the raw URL, we'll see...
		return await this.apiCall('GET', this.filePathForProject(projectName));
	}

	async projectList() {
		return await this.apiCall(
			'GET',
			`repos/${this.username}/${this.repo}/contents`
		);
	}

	async deleteProject(projectName) {
		return await this.apiCall('DELETE', this.filePathForProject(projectName));
	}
}

