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

const downloadRuntime = async(versions) => {
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
                    const channelPath = path.join(runtimeFolder, version);
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
            const runtimePath = path.join(runtimeFolder, numericVersion);
            const runtimeResponse = await fetch(`${RUNTIME_BASE_URL}/${numericVersion}`);
            if (runtimeResponse.ok) {
                const runtimeBuffer = await runtimeResponse.buffer();
                fs.writeFileSync(runtimePath, runtimeBuffer);            
                const versionListPath = path.join('./public', 'runtimeVersions');
                fs.writeFileSync(versionListPath, numericVersion, { flag: 'a+' } );
                fs.writeFileSync(versionListPath, '\n', { flag: 'a+' } );            
            } else {
                console.error(`error downloading ${numericVersion}`)
            }
        }
    }
}

const download = async() => {
    const argv = yargs(process.argv).argv;
    downloadRVM();
    if (argv.runtimes) {
        downloadRuntime(argv.runtimes.split(','));
    } else {
        downloadRuntime(['stable']);
    }
}

download();