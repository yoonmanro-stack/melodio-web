#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS build hook. */

// Keep these versions and the browser loader's asset URL in sync. Runtime files
// come from npm's locked packages; builds do not fetch executable code from a CDN.
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const wrapperVersion = "0.12.15";
const coreVersion = "0.12.10";
const outputRelative = `public/vendor/voice-audio/ffmpeg-${wrapperVersion}-core-${coreVersion}`;
const outputDirectory = path.join(root, outputRelative);
const licenseDirectory = path.join(root, "public/licenses/voice-audio");
const packages = [
  {
    name: "@ffmpeg/ffmpeg",
    version: wrapperVersion,
    files: ["worker.js", "const.js", "errors.js"],
  },
  {
    name: "@ffmpeg/core",
    version: coreVersion,
    files: ["ffmpeg-core.js", "ffmpeg-core.wasm"],
  },
];

function requireFile(file) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    throw new Error(`Required asset is missing: ${path.relative(root, file)}`);
  }
  if (!stat.isFile() || stat.size === 0) {
    throw new Error(`Required asset is empty or not a file: ${path.relative(root, file)}`);
  }
  return stat.size;
}

try {
  const project = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const files = [];

  for (const dependency of packages) {
    if (project.dependencies?.[dependency.name] !== dependency.version) {
      throw new Error(`${dependency.name} must be pinned to ${dependency.version} in package.json.`);
    }
    const packageDirectory = path.join(root, "node_modules", dependency.name);
    const manifestPath = path.join(packageDirectory, "package.json");
    requireFile(manifestPath);
    const installed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (installed.name !== dependency.name || installed.version !== dependency.version) {
      throw new Error(`${dependency.name}: expected ${dependency.version}, found ${installed.version}. Run npm ci.`);
    }
    for (const file of dependency.files) {
      files.push({ source: path.join(packageDirectory, "dist/esm", file), file });
    }
  }

  for (const file of ["NOTICE.txt", "ffmpeg-wrapper-MIT.txt", "ffmpeg-core-GPL-2.0.txt"]) {
    files.push({ source: path.join(licenseDirectory, file), file });
  }

  // Validate every input before modifying public assets so incomplete installs
  // cannot silently produce a build that only fails when a user imports audio.
  const bytes = files.reduce((total, { source }) => total + requireFile(source), 0);
  fs.mkdirSync(outputDirectory, { recursive: true });
  for (const { source, file } of files) {
    fs.copyFileSync(source, path.join(outputDirectory, file));
  }
  console.log(`[voice-audio] Prepared ${files.length} local assets (${(bytes / 1024 / 1024).toFixed(1)} MiB) in ${outputRelative}`);
} catch (error) {
  console.error(`[voice-audio] Asset preparation failed: ${error.message}`);
  process.exitCode = 1;
}
