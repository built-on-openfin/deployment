const path = require("path");
const fs = require("fs");
const os = require("os");
const fetch = require("node-fetch");
const yargs = require("yargs/yargs");
const { version } = require("yargs");

const RVM_BASE_URL = "https://cdn.openfin.co/release/rvm";
const RUNTIME_BASE_URL = "https://cdn.openfin.co/release/runtime";
const SNAP_BASE_URL = "https://cdn.openfin.co/release/snap";
let lastSnapVersion = null;
let lastRuntimeVersion = null;

const isRuntimeVersion = (value) =>
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value);

const isSnapVersion = (value) =>
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value);

// Sanitize a single path segment to prevent traversal.
const sanitizePathInput = (input) => {
  if (!input || typeof input !== "string") {
    throw new Error("Invalid input: must be a non-empty string");
  }
  const sanitized = input
    .replace(/[\/\\]/g, "") // strip path separators
    .replace(/\.{2,}/g, "") // collapse any .. sequences
    .replace(/[^a-zA-Z0-9\-_.]/g, "") // allow alphanumerics, -, _, and .
    .trim();
  if (!sanitized) {
    throw new Error("Invalid input: contains only invalid characters");
  }
  return sanitized;
};

// Maps systemInfo → URL subpath segment.
//   Windows 32-bit:     ""          → /runtime/{version}
//   Windows x64:        "x64"       → /runtime/x64/{version}
//   macOS Intel:        "mac/x64"   → /runtime/mac/x64/{version}
//   macOS Apple Silicon:"mac/arm64" → /runtime/mac/arm64/{version}
const getRuntimeSubpath = ({ platform, architecture }) => {
  if (platform === "mac") return `mac/${architecture}`;
  if (platform === "win32" && architecture === "x64") return "x64";
  return "";
};

// RVM has its own subpath scheme:
//   Windows 32-bit:        ""
//   Windows x64:           "x64"
//   macOS (Intel or ARM):  "mac/arm64-x64"  (single universal RVM)
const getRvmSubpath = ({ platform, architecture }) => {
  if (platform === "mac") return "mac/arm64-x64";
  if (platform === "win32" && architecture === "x64") return "x64";
  return "";
};

const joinUrl = (base, subpath, ...rest) =>
  [base, subpath, ...rest].filter(Boolean).join("/");

const joinLocal = (base, subpath, ...rest) => {
  const parts = subpath ? subpath.split("/") : [];
  return path.join(base, ...parts, ...rest);
};

const downloadAsset = async (savePath, url) => {
  console.log(`downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    console.error(
      `Error downloading ${url}: ${response.status} ${response.statusText}`,
    );
    return false;
  }
  const buffer = await response.buffer();
  fs.writeFileSync(savePath, buffer);
  return true;
};

const resolveChannelVersion = async (channel) => {
  const response = await fetch(`${RUNTIME_BASE_URL}/${channel}`);
  if (!response.ok) {
    console.error(
      `Error resolving release channel ${channel}: ${response.status}`,
    );
    return null;
  }
  const version = (await response.text()).trim();
  if (!isRuntimeVersion(version)) {
    console.error(`Channel ${channel} returned invalid version: ${version}`);
    return null;
  }
  return version;
};

const downloadRVM = async (systemInfo) => {
  console.log(
    `Debug: Starting RVM download for ${systemInfo.platform}/${systemInfo.architecture}`,
  );
  const subpath = getRvmSubpath(systemInfo);
  console.log(`Debug: RVM subpath: ${subpath}`);
  const rvmFolder =
    subpath !== ""
      ? path.join(__dirname, "..", "public", "rvm", subpath)
      : path.join(__dirname, "..", "public", "rvm");
  console.log(`Debug: RVM folder path: ${rvmFolder}`);

  fs.mkdirSync(rvmFolder, { recursive: true });

  const latestResponse = await fetch(`${RVM_BASE_URL}/latestVersion`);
  if (!latestResponse.ok) {
    console.error("Error: latestVersion of RVM is unavailable.");
    return;
  }

  const latestVersion = (await latestResponse.text()).trim();
  console.log(`Debug: Latest RVM version: ${latestVersion}`);

  fs.writeFileSync(path.join(rvmFolder, "latestVersion"), latestVersion);

  const url = joinUrl(RVM_BASE_URL, subpath, latestVersion);
  const savePath = path.join(rvmFolder, "latest");
  console.log(`Debug: RVM download URL: ${url}`);
  console.log(`Debug: RVM save path: ${savePath}`);

  await downloadAsset(savePath, url);
};

const downloadRuntime = async (systemInfo, versions) => {
  console.log(
    `Debug: Starting Runtime download for ${systemInfo.platform}/${systemInfo.architecture}`,
  );
  console.log(`Debug: Runtime versions to download: ${versions}`);

  const subpath = getRuntimeSubpath(systemInfo);
  console.log(`Debug: Runtime subpath: ${subpath}`);

  const baseFolder = path.join(__dirname, "..", "public", "runtime");
  const targetFolder = joinLocal(baseFolder, subpath);
  console.log(`Debug: Runtime target folder: ${targetFolder}`);

  fs.mkdirSync(targetFolder, { recursive: true });

  for (const version of versions) {
    console.log(`Debug: Processing runtime version: ${version}`);
    let numericVersion;

    if (isRuntimeVersion(version)) {
      numericVersion = version;
      lastRuntimeVersion = version;
    } else {
      numericVersion = await resolveChannelVersion(version);
      if (!numericVersion) {
        console.error(
          `Error: Failed to resolve runtime version for channel: ${version}`,
        );
        continue;
      }
      console.log(
        `Debug: Resolved channel ${version} to version ${numericVersion}`,
      );

      const sanitizedChannel = sanitizePathInput(version);
      fs.writeFileSync(
        path.join(targetFolder, sanitizedChannel),
        numericVersion,
      );
    }

    const sanitizedVersion = sanitizePathInput(numericVersion);
    const url = joinUrl(RUNTIME_BASE_URL, subpath, numericVersion);
    const savePath = path.join(targetFolder, sanitizedVersion);
    console.log(`Debug: Runtime download URL: ${url}`);
    console.log(`Debug: Runtime save path: ${savePath}`);

    const ok = await downloadAsset(savePath, url);
    if (!ok) {
      console.error(
        `Error: Failed to download runtime version: ${numericVersion}`,
      );
      continue;
    }

    fs.appendFileSync(
      path.join(baseFolder, "runtimeVersions"),
      `${numericVersion}\n`,
    );
  }
};

const downloadSnap = async (systemInfo, versions) => {
  if (systemInfo.platform === "win32" && systemInfo.architecture === "x64") {
    const targetFolder = path.join(__dirname, "..", "public", "snap");
    console.log(`Debug: Snap target folder: ${targetFolder}`);

    fs.mkdirSync(targetFolder, { recursive: true });
    for (const version of versions) {
      console.log(`Debug: Processing runtime version: ${version}`);
      let numericVersion;

      if (isSnapVersion(version)) {
        numericVersion = version;
        lastSnapVersion = version;
      } else {
        console.error(
          `Error: Invalid Snap version format: ${version}. Expected format is x.y.z (e.g., 1.6.0)`,
        );
        continue;
      }

      const sanitizedVersion = sanitizePathInput(numericVersion);
      const url = joinUrl(SNAP_BASE_URL, numericVersion, "snap.zip");
      const versionFolder = path.join(targetFolder, sanitizedVersion);
      fs.mkdirSync(versionFolder, { recursive: true });
      const savePath = path.join(versionFolder, "snap.zip");
      console.log(`Debug: Snap download URL: ${url}`);
      console.log(`Debug: Snap save path: ${savePath}`);

      const ok = await downloadAsset(savePath, url);
      if (!ok) {
        console.error(
          `Error: Failed to download Snap version: ${numericVersion}`,
        );
        continue;
      }

      fs.appendFileSync(
        path.join(targetFolder, "snapVersions"),
        `${numericVersion}\n`,
      );
    }
  } else {
    console.error(
      "Snap is only available for Windows x64. Skipping Snap download.",
    );
    return;
  }
};

const updateAppManifest = () => {
  const templatePath = path.join(__dirname, "..", "app-template.json");
  const template = JSON.parse(fs.readFileSync(templatePath, "utf8"));
  const appJsonPath = path.join(__dirname, "..", "public", "app.json");
  template.runtime.version = lastRuntimeVersion;
  template.appAssets = [];
  if (lastSnapVersion) {
    template.appAssets.push({
      src: `http://localhost:5555/snap/${lastSnapVersion}/snap.zip`,
      alias: "openfin-snap",
      version: lastSnapVersion,
      target: "OpenFinSnap.exe",
      mandatory: false,
    });
    console.log(
      `creating ${appJsonPath} with Runtime version ${lastRuntimeVersion} and Snap version ${lastSnapVersion}`,
    );
  } else {
    console.log(
      `creating ${appJsonPath} with Runtime version ${lastRuntimeVersion}`,
    );
  }
  fs.writeFileSync(appJsonPath, JSON.stringify(template, null, 3));
};

const download = async () => {
  const argv = yargs(process.argv).argv;
  const rawPlatform = os.platform();
  const systemInfo = {
    architecture: os.arch(),
    platform: rawPlatform === "darwin" ? "mac" : rawPlatform,
  };
  console.log(`System information: ${JSON.stringify(systemInfo)}`);

  // Add debug logs to track system information and folder paths
  console.log("Debug: System Info:", systemInfo);

  const versions = argv.runtimes ? argv.runtimes.split(",") : ["stable"];
  const snapVersions = argv.snapSDKs ? argv.snapSDKs.split(",") : [];
  const manifest = argv.manifest || "false";

  const downloadTasks = [
    downloadRVM(systemInfo),
    downloadRuntime(systemInfo, versions),
  ];

  if (snapVersions.length > 0) {
    downloadTasks.push(downloadSnap(systemInfo, snapVersions));
  }

  await Promise.all(downloadTasks);
  if (manifest === "true") {
    await updateAppManifest();
  }
};

download().catch((err) => {
  console.error("Download failed:", err);
  process.exit(1);
});
