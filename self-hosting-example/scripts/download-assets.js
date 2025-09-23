const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const yargs = require('yargs/yargs');

const RVM_BASE_URL = 'https://cdn.openfin.co/release/rvm';
const RUNTIME_BASE_URL = 'https://cdn.openfin.co/release/runtime';

const downloadRVM = async() => {
    const rvmFolder = path.join( __dirname, '..', 'public', 'rvm');
    fs.mkdirSync(rvmFolder, { recursive: true });

    const response = await fetch(`${RVM_BASE_URL}/latestVersion`);
    if (response.ok) {
        const latestVersion = await response.text();
        console.log(`latest version of RVM: ${latestVersion}`);
        const rvmLatestPath = path.join(rvmFolder, 'latestVersion');
        fs.writeFileSync(rvmLatestPath, latestVersion);

        console.log('downloading latest version of RVM');
        const rvmPath = path.join(rvmFolder, 'latest');
        const rvmResponse = await fetch(`${RVM_BASE_URL}/latest`);
        if (rvmResponse.ok) { 
            const rvmBuffer = await rvmResponse.buffer();
            fs.writeFileSync(rvmPath, rvmBuffer);
        } else {
            console.error(`error downloading latest of RVM`);
        }
    } else {
        console.error(`error downloading latestVersion of RVM`);
    }
}

const isRuntimeVersion = (value) => {
    return  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value);
}

// Sanitize input to prevent path traversal attacks
const sanitizePathInput = (input) => {
    if (!input || typeof input !== 'string') {
        throw new Error('Invalid input: must be a non-empty string');
    }
    
    // Remove any path traversal sequences and normalize the path
    const sanitized = input
        .replace(/\.\./g, '') // Remove .. sequences
        .replace(/[\/\\]/g, '') // Remove path separators
        .replace(/[^a-zA-Z0-9\-_]/g, '') // Only allow alphanumeric, hyphens, and underscores
        .trim();
    
    if (!sanitized) {
        throw new Error('Invalid input: contains only invalid characters');
    }
    
    return sanitized;
}

const downloadRuntime = async(versions, updateManifest) => {
    const runtimeFolder = path.join( __dirname, '..', 'public', 'runtime');
    fs.mkdirSync(runtimeFolder, { recursive: true });
    for (let version of versions) {
        let numericVersion;
        if (!isRuntimeVersion(version)) {  // must be a release channel
            const response = await fetch(`${RUNTIME_BASE_URL}/${version}`);
            if (response.ok) {
                const mappedVersion = await response.text();
                if (isRuntimeVersion(mappedVersion)) {
                    numericVersion = mappedVersion;
                    console.log(`release channel ${version} of Runtime: ${numericVersion}`);
                    const sanitizedVersion = sanitizePathInput(version);
                    const channelPath = path.join(runtimeFolder, sanitizedVersion);
                    fs.writeFileSync(channelPath, numericVersion);
                }
            } else {
                console.error(`error downloading release channel ${version}`)
            }
        } else {
            numericVersion = version;
        }

        if (numericVersion) {
            console.log(`downloading version ${numericVersion} of Runtime`);
            const sanitizedNumericVersion = sanitizePathInput(numericVersion);
            const runtimePath = path.join(runtimeFolder, sanitizedNumericVersion);
            if (downloadAsset(runtimePath, `${RUNTIME_BASE_URL}/${numericVersion}`)) {
                const versionListPath = path.join('./public', 'runtimeVersions');
                fs.writeFileSync(versionListPath, numericVersion, { flag: 'a+' } );
                fs.writeFileSync(versionListPath, '\n', { flag: 'a+' } );
                if (updateManifest) {
                    updateAppManifest(numericVersion);
                }
                const runtimeFolder64 = path.join( __dirname, '..', 'public', 'runtime', 'x64');
                fs.mkdirSync(runtimeFolder64, { recursive: true });            
                downloadAsset(path.join(runtimeFolder64, sanitizedNumericVersion), `${RUNTIME_BASE_URL}/x64/${numericVersion}`)
            }
        }
    }
}

const downloadAsset = async (savePath, url) => {
    console.log(`downloading ${url}`);
    const runtimeResponse = await fetch(url);
    if (runtimeResponse.ok) {
        const runtimeBuffer = await runtimeResponse.buffer();
        fs.writeFileSync(savePath, runtimeBuffer);
        return true;
    } else {
        console.error(`error downloading ${numericVersion}`)
        return false;
    }
}


const updateAppManifest = (numericVersion) => {
    const appJsonTemplateStr = fs.readFileSync(path.join( __dirname, '..', 'app-template.json'));
    const appJsonTemplate = JSON.parse(appJsonTemplateStr);
    appJsonTemplate.runtime.version = numericVersion;

    const appJsonPath = path.join( __dirname, '..', 'public', 'app.json');
    console.log(`creating ${appJsonPath} with Runtime version ${numericVersion}`)
    fs.writeFileSync(appJsonPath, JSON.stringify(appJsonTemplate, null, 3));
}

const download = async() => {
    const argv = yargs(process.argv).argv;
    downloadRVM();
    if (argv.runtimes) {
        downloadRuntime(argv.runtimes.split(','), false);
    } else {
        downloadRuntime(['stable'], true);
    }
}

download();