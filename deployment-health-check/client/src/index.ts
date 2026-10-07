import {
	checkForFinsProtocol,
	checkEndpoints,
	OpenFinEndpoint,
	type Endpoint,
	type EndpointStatus
} from "@openfin/deployment";

/**
 * Manifest served next to this page so a host can be xcopied without rewriting URLs.
 */
const MANIFEST_FILE = "deployment.fin.json";

/**
 * Query keys that Launch carries into the container via OpenFin $$ deeplink parameters.
 */
const CONTAINER_QUERY_KEYS = ["eb", "eb-instance"] as const;

/**
 * The query string for this page. Starts as the browser URL and is overlaid with
 * userAppConfigArgs from the fin API when running inside a container.
 */
const pageQueryParams = new URLSearchParams(window.location.search);

/**
 * The endpoints that back the RVM based install and launch flow, which an Enterprise Browser
 * deployment does not use.
 */
const ENTERPRISE_BROWSER_EXCLUDED_ENDPOINTS: string[] = [
	OpenFinEndpoint.Installer,
	OpenFinEndpoint.ApplicationRunner,
	OpenFinEndpoint.ApplicationDirectory
];

/**
 * The documentation links for an Enterprise Browser deployment, keyed by the id of the link they
 * replace. The page carries the HERE Core equivalents as its static content.
 */
const ENTERPRISE_BROWSER_RESOURCES = {
	uiDocs: {
		title: "HERE Enterprise Browser User Docs",
		description: "Learn about the user features of Enterprise Browser",
		href: "https://resources.here.io/docs/guide/users/"
	},
	developerDocs: {
		title: "HERE Enterprise Browser Developer Docs",
		description: "Learn how to build for Enterprise Browser",
		href: "https://resources.here.io/docs/guide/devs/"
	}
};

/**
 * downloadRuntime only accepts an exact version, and errors when given a release channel.
 */
const EXACT_RUNTIME_VERSION = /^(?:\d+\.){3}\d+$/;

/**
 * The progress reported while a runtime downloads.
 */
interface DownloadProgress {
	/**
	 * How much of the runtime has been downloaded so far.
	 */
	downloadedBytes: number;

	/**
	 * The total size of the runtime being downloaded.
	 */
	totalBytes: number;
}

/**
 * The part of the HERE System API this page uses. Only @openfin/deployment is a dependency here,
 * so the shape is declared locally rather than pulling in the full container typings.
 */
interface HereSystem {
	/**
	 * Download a specific runtime version, reporting progress as it goes.
	 */
	downloadRuntime: (
		options: { version: string },
		onProgress: (progress: DownloadProgress) => void
	) => Promise<void>;

	/**
	 * Identify the operating system the container is running on.
	 */
	getHostSpecs?: () => Promise<{ name?: string }>;

	/**
	 * The runtime versions already installed on this desktop.
	 */
	getInstalledRuntimes?: () => Promise<string[]>;

	/**
	 * The version of the HERE runtime this page is running in.
	 */
	getVersion?: () => Promise<string>;

	/**
	 * The version of the HERE RVM that launched this runtime.
	 */
	getRvmInfo?: () => Promise<{ version?: string }>;
}

/**
 * The subset of Application.getInfo used to read $$ deeplink parameters.
 */
interface HereApplicationInfo {
	/**
	 * The options the application was launched with, including userAppConfigArgs.
	 */
	initialOptions?: {
		/**
		 * Values passed on the fins or fin link as $$ query parameters.
		 */
		userAppConfigArgs?: { [key: string]: string };
	};
}

/**
 * The part of the HERE Application API this page uses to read launch parameters.
 */
interface HereApplication {
	/**
	 * Read how this application was launched.
	 */
	getInfo: () => Promise<HereApplicationInfo>;
}

let endpointResults: EndpointStatus[] = [];
let runtimeVersion: string | undefined;
let ebManifest: { runtime?: { version?: string } } | undefined;

/**
 * Check whether the page is running inside HERE.
 * @returns True if the HERE API is present.
 */
function isInHere(): boolean {
	return (window as unknown as { fin?: unknown }).fin !== undefined;
}

/**
 * Check whether this desktop is macOS. downloadRuntime is not available there.
 * Prefers the container host spec when the page is running inside HERE.
 * @returns True if the host is a Mac.
 */
async function isMac(): Promise<boolean> {
	try {
		const specs = await hereSystem()?.getHostSpecs?.();
		if (specs?.name) {
			return /mac/i.test(specs.name);
		}
	} catch {
		// Fall through to the user agent.
	}

	return navigator.platform.startsWith("Mac") || /Mac OS X|Macintosh/.test(navigator.userAgent);
}

/**
 * Get the HERE System API, which is only available when running inside HERE.
 * @returns The System API, or undefined in a standard browser.
 */
function hereSystem(): HereSystem | undefined {
	return (window as unknown as { fin?: { System?: HereSystem } }).fin?.System;
}

/**
 * Get the current HERE application, which is only available when running inside HERE.
 * @returns The current application, or undefined in a standard browser.
 */
async function hereApplication(): Promise<HereApplication | undefined> {
	const application = (
		window as unknown as {
			fin?: {
				Application?: {
					getCurrent?: () => Promise<HereApplication>;
					getCurrentSync?: () => HereApplication;
				};
			};
		}
	).fin?.Application;

	if (!application) {
		return undefined;
	}

	if (application.getCurrent) {
		return application.getCurrent();
	}

	return application.getCurrentSync?.();
}

/**
 * Overlay $$ deeplink parameters from the fin API onto the page query string. Those values
 * are how the container receives eb and eb-instance when this page is launched from a fins
 * or fin link.
 */
async function applyContainerQueryParams(): Promise<void> {
	if (!isInHere()) {
		return;
	}

	try {
		const application = await hereApplication();
		const info = await application?.getInfo();
		const args = info?.initialOptions?.userAppConfigArgs;
		if (!args) {
			return;
		}

		for (const key of CONTAINER_QUERY_KEYS) {
			const value = args[key];
			if (value) {
				pageQueryParams.set(key, value);
			}
		}
	} catch {
		// Stay on the page query string if the container API is unavailable.
	}
}

/**
 * Build a fins or fin link to the manifest next to this page, carrying eb and eb-instance
 * as OpenFin $$ query parameters so the container can read them via the fin API.
 * @returns The launch link for the current host and query.
 */
function launchLink(): string {
	const manifest = new URL(MANIFEST_FILE, window.location.href);
	const protocol = window.location.protocol === "https:" ? "fins:" : "fin:";
	const params: string[] = [];

	for (const key of CONTAINER_QUERY_KEYS) {
		const value = pageQueryParams.get(key);
		if (value) {
			params.push(`$$${key}=${encodeURIComponent(value)}`);
		}
	}

	const search = params.length > 0 ? `?${params.join("&")}` : "";
	return `${protocol}//${manifest.host}${manifest.pathname}${search}`;
}

/**
 * The instance manifest to check, taken from eb-instance. The value must be a full URL
 * (scheme optional) so this page does not hard-code the manifest path.
 * @param value The eb-instance value from the query string.
 * @returns The URL to check and the host name to show, or undefined if the value is not a URL.
 */
function instanceManifest(value: string | null): { url: string; host: string } | undefined {
	const trimmed = value?.trim();
	if (!trimmed) {
		return undefined;
	}

	const absolute = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

	try {
		const parsed = new URL(absolute);
		const { hostname, href, pathname } = parsed;
		// Require a dotted host and a path so a stray word does not become an endpoint to check.
		if (!/^[\da-z]([\da-z-]*[\da-z])?(\.[\da-z]([\da-z-]*[\da-z])?)+$/i.test(hostname) || pathname === "/") {
			return undefined;
		}

		return { url: href, host: hostname };
	} catch {
		return undefined;
	}
}

/**
 * Check whether the query string marks this as an Enterprise Browser deployment.
 * @returns True if eb=true was passed.
 */
function isEnterpriseBrowser(): boolean {
	return pageQueryParams.get("eb")?.toLowerCase() === "true";
}

/**
 * Read the checks to run from the query string. Passing eb=true marks this as an Enterprise
 * Browser deployment, and only then does eb-instance name the instance whose manifest should
 * be reached.
 * @returns The default endpoints to skip and any extra endpoints to check.
 */
function endpointSelection(): { exclude: string[]; custom: Endpoint[] } {
	if (!isEnterpriseBrowser()) {
		return { exclude: [], custom: [] };
	}

	const instance = instanceManifest(pageQueryParams.get("eb-instance"));

	return {
		exclude: ENTERPRISE_BROWSER_EXCLUDED_ENDPOINTS,
		custom: instance
			? [
					{
						id: `Enterprise Browser ${instance.host}`,
						url: instance.url,
						displayName: `Enterprise Browser (${instance.host})`
					}
				]
			: []
	};
}

/**
 * Look up an element that the page is expected to provide.
 * @param id The id of the element to find.
 * @returns The matching element.
 * @throws If the page does not contain the element.
 */
function requireElement<T extends HTMLElement>(id: string): T {
	const element = document.querySelector<T>(`#${id}`);
	if (!element) {
		throw new Error(`Missing element: ${id}`);
	}
	return element;
}

/**
 * Show the outcome of a check against a list item.
 * @param item The list item to update.
 * @param success True if the check passed.
 * @param detail The short value to show alongside the label.
 * @param hint An optional explanation shown on hover.
 */
function setStatus(item: HTMLElement, success: boolean, detail: string, hint?: string): void {
	item.classList.toggle("good", success);
	item.classList.toggle("bad", !success);

	const detailElement = item.querySelector(".status-detail");
	if (detailElement) {
		detailElement.textContent = detail;
	}

	if (hint) {
		item.setAttribute("title", hint);
	} else {
		item.removeAttribute("title");
	}
}

/**
 * Get the label to show for an endpoint. The package still ships the pre-rebrand endpoint names,
 * and the endpoint it calls Workspaces serves a different product depending on the deployment.
 * @param status The status returned for the endpoint.
 * @returns The label to show.
 */
function displayName(status: EndpointStatus): string {
	if (status.id === OpenFinEndpoint.Workspaces) {
		return isEnterpriseBrowser() ? "HERE Notification Center" : "HERE Core UI";
	}

	return status.displayName.replace(/^OpenFin\b/, "HERE");
}

/**
 * Get the short detail to show for an endpoint. The package reports no status code of its own
 * for a failed request, using -1 when the browser blocked it by CORS and -2 when the request
 * could not be made at all. A failed 2xx is an instance manifest that did not return JSON.
 * @param status The status returned for the endpoint.
 * @returns The detail to show.
 */
function statusDetail(status: EndpointStatus): string {
	if (!status.success && status.statusCode >= 200 && status.statusCode < 300) {
		return "Not JSON";
	}
	if (status.statusCode > 0) {
		return `${status.statusCode}`;
	}
	if (status.statusCode === -1) {
		return "CORS blocked";
	}
	return status.statusText || "unreachable";
}

/**
 * Point the documentation links at the Enterprise Browser guides, leaving the HERE Core links
 * the page ships with in place for a standard deployment.
 */
function applyResourceLinks(): void {
	if (!isEnterpriseBrowser()) {
		return;
	}

	for (const [id, resource] of Object.entries(ENTERPRISE_BROWSER_RESOURCES)) {
		const link = requireElement<HTMLAnchorElement>(id);
		const title = link.querySelector(".resource-title");
		const description = link.querySelector(".resource-description");

		link.href = resource.href;
		if (title) {
			title.textContent = `${resource.title} \u2192`;
		}
		if (description) {
			description.textContent = resource.description;
		}
	}
}

/**
 * Get the results with the labels the page shows, so that copied output matches what was on
 * screen rather than the pre-rebrand names the package returns.
 * @returns The results, with each display name replaced by its label.
 */
function labelledResults(): EndpointStatus[] {
	return endpointResults.map((status) => ({ ...status, displayName: displayName(status) }));
}

/**
 * Add an endpoint result to the endpoints list.
 * @param list The list to add the result to.
 * @param status The status returned for the endpoint.
 */
function addEndpointItem(list: HTMLElement, status: EndpointStatus): void {
	const item = document.createElement("li");
	item.setAttribute("id", `url_${status.id}`);
	item.setAttribute("title", status.statusText ? `${status.url}\n${status.statusText}` : status.url);
	item.classList.add(status.success ? "good" : "bad");

	const led = document.createElement("span");
	led.classList.add("led");
	item.append(led);

	const name = document.createElement("span");
	name.classList.add("status-name");
	name.textContent = displayName(status);
	item.append(name);

	const detail = document.createElement("span");
	detail.classList.add("status-detail");
	detail.textContent = statusDetail(status);
	item.append(detail);

	list.append(item);
}

/**
 * Copy text to the clipboard, falling back to a selection when the clipboard API is unavailable.
 * @param text The text to copy.
 * @returns True if the text was copied.
 */
async function copyToClipboard(text: string): Promise<boolean> {
	if (navigator.clipboard && window.isSecureContext) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch {
			// Fall through to the selection based fallback.
		}
	}

	const textArea = document.createElement("textarea");
	textArea.value = text;
	textArea.setAttribute("readonly", "");
	textArea.style.position = "fixed";
	textArea.style.opacity = "0";
	document.body.append(textArea);
	textArea.select();

	try {
		return document.execCommand("copy");
	} catch {
		return false;
	} finally {
		textArea.remove();
	}
}

/**
 * Wire a button up to copy text, showing the outcome in its label.
 * @param button The button to wire up.
 * @param getText Returns the text to copy when the button is clicked.
 */
function withCopyFeedback(button: HTMLButtonElement, getText: () => string): void {
	const label = button.textContent;

	button.addEventListener("click", async () => {
		const copied = await copyToClipboard(getText());
		button.textContent = copied ? "Copied" : "Copy failed";
		window.setTimeout(() => {
			button.textContent = label;
		}, 2000);
	});
}

/**
 * Check every HERE endpoint and show the results.
 */
async function runEndpointChecks(): Promise<void> {
	const list = requireElement("endpointChecks");
	const summary = requireElement("endpointSummary");
	const revalidateButton = requireElement<HTMLButtonElement>("revalidate");

	revalidateButton.disabled = true;
	list.innerHTML = "";
	summary.textContent = "Checking endpoints\u2026";

	try {
		const { exclude, custom } = endpointSelection();
		ebManifest = undefined;
		const results = await checkEndpoints(exclude, custom);
		endpointResults = await Promise.all(
			results.map(async (status) => (status.url === custom[0]?.url ? verifyManifest(status) : status))
		);
		for (const status of endpointResults) {
			addEndpointItem(list, status);
		}

		const reachable = endpointResults.filter((status) => status.success).length;
		summary.textContent = `${reachable} of ${endpointResults.length} reachable`;
	} finally {
		revalidateButton.disabled = false;
	}
}

/**
 * Check that a reachable Enterprise Browser instance returned a JSON manifest. A proxy such as
 * Zscaler can answer with an HTML block page and a success status, which is not reachable in
 * any useful sense. A valid manifest is kept so the runtime check can read it.
 * @param status The status returned for the instance manifest.
 * @returns The status, marked as failed if the response was not a JSON object.
 */
async function verifyManifest(status: EndpointStatus): Promise<EndpointStatus> {
	if (!status.success) {
		return status;
	}

	let contentType = "";
	let parsed = false;
	try {
		const response = await fetch(status.url, { cache: "no-store" });
		contentType = response.headers.get("content-type") ?? "";
		const body: unknown = JSON.parse(await response.text());
		parsed = true;
		if (body && typeof body === "object" && !Array.isArray(body)) {
			ebManifest = body as { runtime?: { version?: string } };
			return status;
		}
	} catch {
		// Anything that does not parse as JSON is reported below.
	}

	let received = contentType || "a response that is not JSON";
	if (parsed) {
		received = "JSON that is not a manifest object";
	} else if (/html/i.test(contentType)) {
		received = "an HTML page";
	}
	return {
		...status,
		success: false,
		statusText: `Expected a JSON manifest but received ${received}. A proxy such as Zscaler may be blocking the request.`
	};
}

/**
 * Check whether a runtime version is already installed. downloadRuntime throws for a version
 * that is already present.
 * @param version The exact runtime version.
 * @returns True if installed, false if not, or undefined if the installed list is unavailable.
 */
async function isRuntimeInstalled(version: string): Promise<boolean | undefined> {
	try {
		const installed = await hereSystem()?.getInstalledRuntimes?.();
		return installed ? installed.includes(version) : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Show the runtime section, but only when running inside HERE against an Enterprise Browser
 * instance whose manifest was reachable. The runtime the instance pins is read from that
 * manifest so that it can be downloaded on request.
 */
async function runRuntimeCheck(): Promise<void> {
	const card = requireElement("runtimeCard");
	const summary = requireElement("runtimeSummary");
	const versionItem = requireElement("runtimeVersion");
	const downloadItem = requireElement("runtimeDownload");
	const downloadButton = requireElement<HTMLButtonElement>("downloadRuntime");
	const downloadActions = requireElement("runtimeDownloadActions");

	runtimeVersion = undefined;
	card.hidden = true;

	const manifestUrl = endpointSelection().custom[0]?.url;

	if (!hereSystem() || !manifestUrl || !ebManifest) {
		return;
	}

	const mac = await isMac();
	card.hidden = false;
	downloadItem.hidden = mac;
	downloadButton.hidden = mac;
	downloadActions.hidden = mac;
	downloadButton.disabled = true;
	if (!mac) {
		setStatus(downloadItem, false, "Not attempted");
	}
	const version = ebManifest.runtime?.version;

	if (!version) {
		setStatus(versionItem, false, "Not found", `No runtime version in ${manifestUrl}`);
		summary.textContent = "The manifest does not pin a runtime version";
		return;
	}

	if (!EXACT_RUNTIME_VERSION.test(version)) {
		setStatus(versionItem, false, version, "A release channel cannot be downloaded by version.");
		summary.textContent = `${version} is a release channel, not an exact version`;
		return;
	}

	runtimeVersion = version;
	setStatus(versionItem, true, version);
	if (mac) {
		summary.textContent = `Manifest pins runtime ${version}`;
		return;
	}

	if (await isRuntimeInstalled(version)) {
		setStatus(downloadItem, true, "Already installed");
		downloadActions.hidden = true;
		summary.textContent = `Runtime ${version} is already installed`;
		return;
	}

	setStatus(downloadItem, false, "Not attempted");
	summary.textContent = `Manifest pins runtime ${version}`;
	downloadButton.disabled = false;
}

/**
 * Download the runtime that the instance manifest pins, and report whether it succeeded.
 */
async function downloadPinnedRuntime(): Promise<void> {
	const system = hereSystem();
	const summary = requireElement("runtimeSummary");
	const downloadItem = requireElement("runtimeDownload");
	const downloadButton = requireElement<HTMLButtonElement>("downloadRuntime");
	const version = runtimeVersion;

	if (!system || !version || (await isMac())) {
		return;
	}

	downloadButton.disabled = true;
	setStatus(downloadItem, false, "Downloading\u2026");
	summary.textContent = `Downloading runtime ${version}\u2026`;

	try {
		await system.downloadRuntime({ version }, (progress) => {
			const percent =
				progress.totalBytes > 0 ? Math.floor((progress.downloadedBytes / progress.totalBytes) * 100) : 0;
			summary.textContent = `Downloading runtime ${version}, ${percent}%`;
		});

		setStatus(downloadItem, true, "Yes");
		requireElement("runtimeDownloadActions").hidden = true;
		summary.textContent = `Runtime ${version} downloaded`;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		setStatus(downloadItem, false, "Failed", message);
		summary.textContent = `Runtime ${version} failed to download`;
	} finally {
		downloadButton.disabled = false;
	}
}

/**
 * Read the runtime and RVM versions from the fin API.
 * @returns The versions, or "unknown" when an API is missing or fails.
 */
async function hereEnvironmentVersions(): Promise<{ runtime: string; rvm: string }> {
	const system = hereSystem();
	const unknown = "unknown";

	try {
		const [runtime, rvmInfo] = await Promise.all([system?.getVersion?.(), system?.getRvmInfo?.()]);

		return {
			runtime: runtime ?? unknown,
			rvm: rvmInfo?.version ?? unknown
		};
	} catch {
		return { runtime: unknown, rvm: unknown };
	}
}

/**
 * Show whether this page is running in HERE and, when it is not, whether the HERE RVM was
 * detected. Inside a container the RVM row is hidden and the environment label includes
 * the runtime and RVM versions.
 */
async function runHereInfoChecks(): Promise<void> {
	const environmentItem = requireElement("hereEnvironment");
	const environmentName = environmentItem.querySelector(".status-name");
	const rvmItem = requireElement("rvmDetected");
	const launchButton = requireElement<HTMLButtonElement>("launch");

	const inHere = isInHere();
	setStatus(environmentItem, inHere, inHere ? "Yes" : "No");

	rvmItem.hidden = inHere;
	launchButton.hidden = inHere;
	if (inHere) {
		const { runtime, rvm } = await hereEnvironmentVersions();
		if (environmentName) {
			environmentName.textContent = `Running in a HERE Environment [Runtime: ${runtime}, RVM: ${rvm}]`;
		}
		return;
	}

	const finsProtocolResult = await checkForFinsProtocol();
	const rvmDetected = finsProtocolResult.isFinsDetectionSupported && finsProtocolResult.isFinsSupported;
	setStatus(
		rvmItem,
		rvmDetected,
		rvmDetected ? "Yes" : "No",
		finsProtocolResult.isFinsDetectionSupported
			? undefined
			: "Detection requires enableInstallationDetection in desktop owner settings."
	);
}

window.addEventListener("DOMContentLoaded", async () => {
	await applyContainerQueryParams();
	applyResourceLinks();

	requireElement<HTMLButtonElement>("revalidate").addEventListener("click", async () => {
		await runEndpointChecks();
		await runRuntimeCheck();
	});
	requireElement<HTMLButtonElement>("launch").addEventListener("click", () => window.open(launchLink()));
	requireElement<HTMLButtonElement>("downloadRuntime").addEventListener("click", async () => {
		await downloadPinnedRuntime();
	});

	withCopyFeedback(requireElement<HTMLButtonElement>("copyEndpoints"), () =>
		JSON.stringify(labelledResults(), null, 2)
	);
	withCopyFeedback(requireElement<HTMLButtonElement>("copyFinsLink"), () => launchLink());

	await Promise.all([runEndpointChecks(), runHereInfoChecks()]);
	await runRuntimeCheck();
});
