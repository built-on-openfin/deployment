const path = require('path');
const fs = require('fs');
const os = require('os');
const fetch = require('node-fetch');
const yargs = require('yargs/yargs');

const RVM_BASE_URL = 'https://cdn.openfin.co/release/rvm';
const RUNTIME_BASE_URL = 'https://cdn.openfin.co/release/runtime';

// ---------- helpers ----------

const isRuntimeVersion = (value) =>
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value);

// Sanitize a single path segment to prevent traversal.
// Allows alphanumerics, dots (for version strings), hyphens, and underscores.
const sanitizePathInput = (input) => {
    if (!input || typeof input !== 'string') {
        throw new Error('Invalid input: must be a non-empty string');
    }
    const sanitized = input
        .replace(/[\/\\]/g, '')           // strip path separators
        .replace(/\.{2,}/g, '')           // collapse any .. sequences
        .replace(/[^a-zA-Z0-9\-_.]/g, '') // allow alphanumerics, -, _, and .
        .trim();
    if (!sanitized) {
        throw new Error('Invalid input: contains only invalid characters');
    }
    return sanitized;
};

// Maps systemInfo → URL subpath segment.
//   Windows 32-bit:     ""          → /runtime/{version}
//   Windows x64:        "x64"       → /runtime/x64/{version}
//   macOS Intel:        "mac/x64"   → /runtime/mac/x64/{version}
//   macOS Apple Silicon:"mac/arm64" → /runtime/mac/arm64/{version}
const getRuntimeSubpath = ({ platform, architecture }) => {
    if (platform === 'mac') return `mac/${architecture}`;
    if (platform === 'win32' && architecture === 'x64') return 'x64';
    return '';
};

// RVM has its own subpath scheme:
//   Windows 32-bit:        ""
//   Windows x64:           "x64"
//   macOS (Intel or ARM):  "mac/arm64-x64"  (single universal RVM)
const getRvmSubpath = ({ platform, architecture }) => {
    if (platform === 'mac') return 'mac/arm64-x64';
    if (platform === 'win32' && architecture === 'x64') return 'x64';
    return '';
};

const joinUrl = (base, subpath, ...rest) =>
    [base, subpath, ...rest].filter(Boolean).join('/');

const joinLocal = (base, subpath, ...rest) => {
    const parts = subpath ? subpath.split('/') : [];
    return path.join(base, ...parts, ...rest);
};

// ---------- download primitives ----------

const downloadAsset = async (savePath, url) => {
    console.log(`downloading ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
        console.error(`Error downloading ${url}: ${response.status} ${response.statusText}`);
        return false;
    }
    const buffer = await response.buffer();
    fs.writeFileSync(savePath, buffer);
    return true;
};

const resolveChannelVersion = async (channel) => {
    const response = await fetch(`${RUNTIME_BASE_URL}/${channel}`);
    if (!response.ok) {
        console.error(`Error resolving release channel ${channel}: ${response.status}`);
        return null;
    }
    const version = (await response.text()).trim();
    if (!isRuntimeVersion(version)) {
        console.error(`Channel ${channel} returned invalid version: ${version}`);
        return null;
    }
    return version;
};

// ---------- RVM ----------

const downloadRVM = async (systemInfo) => {
    console.log(`Downloading RVM for ${systemInfo.platform}/${systemInfo.architecture}`);

    const rvmFolder = path.join(__dirname, '..', 'public', 'rvm');
    fs.mkdirSync(rvmFolder, { recursive: true });

    const latestResponse = await fetch(`${RVM_BASE_URL}/latestVersion`);
    if (!latestResponse.ok) {
        console.error('Error: latestVersion of RVM is unavailable.');
        return;
    }

    const latestVersion = (await latestResponse.text()).trim();
    console.log(`The latest version of RVM is: ${latestVersion}`);

    // Record the channel file locally
    fs.writeFileSync(path.join(rvmFolder, 'latestVersion'), latestVersion);

    const subpath = getRvmSubpath(systemInfo);
    const url = joinUrl(RVM_BASE_URL, subpath, latestVersion);
    const savePath = path.join(rvmFolder, 'latest');

    await downloadAsset(savePath, url);
};

// ---------- Runtime ----------

const downloadRuntime = async (systemInfo, versions, updateManifest) => {
    console.log(`Downloading Runtime versions ${versions} for ${systemInfo.platform}/${systemInfo.architecture}`);

    const subpath = getRuntimeSubpath(systemInfo);
    const baseFolder = path.join(__dirname, '..', 'public', 'runtime');
    // Local tree mirrors the URL: public/runtime[/mac][/arch]
    const targetFolder = joinLocal(baseFolder, subpath);
    fs.mkdirSync(targetFolder, { recursive: true });

    for (const version of versions) {
        let numericVersion;

        if (isRuntimeVersion(version)) {
            numericVersion = version;
        } else {
            // Treat as a release channel (e.g. "stable") and resolve it.
            numericVersion = await resolveChannelVersion(version);
            if (!numericVersion) continue;
            console.log(`Release channel ${version} → ${numericVersion}`);

            // Save the channel→version mapping alongside the binary
            const sanitizedChannel = sanitizePathInput(version);
            fs.writeFileSync(path.join(targetFolder, sanitizedChannel), numericVersion);
        }

        const sanitizedVersion = sanitizePathInput(numericVersion);
        const url = joinUrl(RUNTIME_BASE_URL, subpath, numericVersion);
        const savePath = path.join(targetFolder, sanitizedVersion);

        const ok = await downloadAsset(savePath, url);
        if (!ok) continue;

        // Flat index of all downloaded versions, kept at the runtime root
        fs.appendFileSync(path.join(baseFolder, 'runtimeVersions'), `${numericVersion}\n`);

        if (updateManifest) {
            updateAppManifest(numericVersion);
        }
    }
};

// ---------- App manifest ----------

const updateAppManifest = (numericVersion) => {
    const templatePath = path.join(__dirname, '..', 'app-template.json');
    const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    template.runtime.version = numericVersion;

    const appJsonPath = path.join(__dirname, '..', 'public', 'app.json');
    console.log(`creating ${appJsonPath} with Runtime version ${numericVersion}`);
    fs.writeFileSync(appJsonPath, JSON.stringify(template, null, 3));
};

// ---------- entry point ----------

const download = async () => {
    const argv = yargs(process.argv).argv;
    const rawPlatform = os.platform();
    const systemInfo = {
        architecture: os.arch(),
        platform: rawPlatform === 'darwin' ? 'mac' : rawPlatform,
    };
    console.log(`System information: ${JSON.stringify(systemInfo)}`);

    const versions = argv.runtimes ? argv.runtimes.split(',') : ['stable'];
    const updateManifest = !argv.runtimes; // only update manifest on default stable pull

    // Run RVM and Runtime downloads in parallel — they're independent.
    await Promise.all([
        downloadRVM(systemInfo),
        downloadRuntime(systemInfo, versions, updateManifest),
    ]);
};

download().catch((err) => {
    console.error('Download failed:', err);
    process.exit(1);
});