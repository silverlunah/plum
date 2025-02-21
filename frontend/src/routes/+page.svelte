<!--
 * This file is part of Plum.
 *
 * Plum is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Plum is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Plum. If not, see https://www.gnu.org/licenses/.
 -->

<script>
	import { onMount } from 'svelte';
	import { io } from 'socket.io-client';

	let output = "Enter a test ID and click 'Run Test'...\n";
	let socket;
	let testCompleted = false;
	let testID = '';
	let outputRef;
	let suites = [];
	let latestReport = null;

	onMount(async () => {
		socket = io('http://localhost:3001');

		socket.on('log', (data) => {
			output += data + '\n';
			scrollToBottom();
		});

		socket.on('done', async () => {
			output += '✅ Test completed!\n';
			testCompleted = true;
			scrollToBottom();

			// Fetch the latest report **after** test completion
			await fetchLatestReport();
		});

		// Fetch test names from backend
		try {
			const response = await fetch('http://localhost:3001/tests');
			const data = await response.json();

			suites = data.suites.suites;
		} catch (error) {
			console.error('Error fetching test suites:', error);
		}
	});

	function runTest() {
		const formattedTestID = testID.replace(/\sOR\s/gi, (match) => match.toLowerCase());
		output = `Running test with ID: ${formattedTestID}...\n`;
		testCompleted = false;
		socket.emit('run-test', formattedTestID, 'manual-trigger');
	}

	async function fetchLatestReport() {
		const response = await fetch('http://localhost:3001/reports/latest');
		const data = await response.json();
		latestReport = data.latestReport;
	}

	async function scrollToBottom() {
		await new Promise((resolve) => setTimeout(resolve, 50));
		if (outputRef) outputRef.scrollTop = outputRef.scrollHeight;
	}

	function copyIdToTextbox(id) {
		console.log('Selected Test ID:', id);
		testID = id;
	}
</script>

<div class="flex w-full my-4">
	<!-- Left Panel: Run Tests -->
	<div class="card bg-base-300 rounded-box grid flex-grow place-items-center w-1/2 p-4 mr-2 ml-4">
		<div class="card-body items-center text-center">
			<h2 class="card-title">Run Tests</h2>
			<p>Enter a test case/suite ID or select an ID from the Test List</p>
			<label class="form-control w-full max-w-xs mt-4">
				<input
					type="text"
					class="input input-bordered w-full max-w-xs"
					bind:value={testID}
					placeholder="Enter test ID"
				/>
			</label>
			<div class="card-actions justify-end">
				<button class="btn btn-primary" on:click={runTest}>Run</button>
				{#if testCompleted}
					<a href={`http://localhost:3001/reports/${latestReport}`} target="_blank">
						<button class="btn btn-primary">View Report</button>
					</a>
				{/if}
			</div>
		</div>

		<pre
			bind:this={outputRef}
			class="bg-black rounded-box p-4 w-full overflow-auto whitespace-pre-wrap h-64 max-h-64">{output}</pre>
	</div>

	<!-- Right Panel: Test List -->
	<div class="card bg-base-300 rounded-box w-1/2 p-4 ml-2 mr-4">
		<div class="card-body items-center text-center">
			<h2 class="card-title sticky top-0 bg-base-300 z-10">Test List</h2>
			<div class="mt-4">
				{#each suites as suite, suiteIndex}
					<div class="collapse bg-base-200 mb-4">
						<input type="radio" name="my-accordion-1" id="collapse-{suiteIndex}" />
						<label
							for="collapse-{suiteIndex}"
							class="collapse-title font-medium justify-start cursor-pointer"
						>
							{#if Array.isArray(suite.suiteId)}
								{#each suite.suiteId as suiteId}
									<div class="badge badge-primary mr-2">{suiteId}</div>
								{/each}
							{:else}
								<div class="badge badge-primary mr-2">{suite.suiteId}</div>
							{/if}
							{suite.suiteName}
						</label>

						<div class="collapse-content">
							<button
								class="btn btn-active btn-ghost btn-xs"
								on:click={() =>
									copyIdToTextbox(Array.isArray(suite.suiteId) ? suite.suiteId[0] : suite.suiteId)}
							>
								Select Suite
							</button>

							<div class="card rounded-lg shadow-md mt-2">
								<div class="overflow-x-auto">
									<table class="table">
										<thead>
											<tr>
												<th>ID</th>
												<th>Test Case</th>
											</tr>
										</thead>
										<tbody>
											{#each suite.tests as test}
												<tr>
													<th>
														{#if Array.isArray(test.id)}
															{#each test.id as testId}
																<button
																	class="btn btn-active btn-ghost btn-xs mr-1"
																	on:click={() => copyIdToTextbox(testId)}
																>
																	{testId}
																</button>
															{/each}
														{:else}
															<button
																class="btn btn-active btn-ghost btn-xs"
																on:click={() => copyIdToTextbox(test.id)}
															>
																{test.id}
															</button>
														{/if}
													</th>
													<td>{test.testCase}</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
</div>
