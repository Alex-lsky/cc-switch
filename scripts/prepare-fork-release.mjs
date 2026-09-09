// Prepare all updater metadata before publishing. No signing secrets are read here.
import { createHash, createPublicKey, verify } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function decode64(value) {
  const text = value.trim();
  if (!text || !/^[A-Za-z0-9+/]+={0,2}$/.test(text))
    throw new Error("Invalid base64");
  const data = Buffer.from(text, "base64");
  if (data.toString("base64").replace(/=+$/, "") !== text.replace(/=+$/, ""))
    throw new Error("Invalid base64 encoding");
  return data;
}

export function verifyUpdaterSignature(
  bytes,
  encodedSignature,
  encodedPublicKey,
) {
  const publicLines = decode64(encodedPublicKey)
    .toString("utf8")
    .trim()
    .split(/\r?\n/);
  const sigLines = decode64(encodedSignature)
    .toString("utf8")
    .trim()
    .split(/\r?\n/);
  if (
    publicLines.length !== 2 ||
    sigLines.length !== 4 ||
    !sigLines[2].startsWith("trusted comment: ")
  )
    throw new Error("Invalid minisign envelope");
  const pub = decode64(publicLines[1]);
  const sig = decode64(sigLines[1]);
  const globalSig = decode64(sigLines[3]);
  if (
    pub.length !== 42 ||
    pub.subarray(0, 2).toString() !== "Ed" ||
    sig.length !== 74 ||
    globalSig.length !== 64
  )
    throw new Error("Invalid minisign key/signature size");
  if (!pub.subarray(2, 10).equals(sig.subarray(2, 10)))
    throw new Error(
      "Updater signing key does not match application public key",
    );
  const algorithm = sig.subarray(0, 2).toString();
  if (!["ED", "Ed"].includes(algorithm))
    throw new Error("Unsupported minisign algorithm");
  const key = createPublicKey({
    key: Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      pub.subarray(10),
    ]),
    format: "der",
    type: "spki",
  });
  const signed =
    algorithm === "ED"
      ? createHash("blake2b512").update(bytes).digest()
      : bytes;
  if (!verify(null, signed, key, sig.subarray(10)))
    throw new Error("Invalid updater artifact signature");
  const globalMessage = Buffer.concat([
    sig.subarray(10),
    Buffer.from(sigLines[2].slice("trusted comment: ".length)),
  ]);
  if (!verify(null, globalMessage, key, globalSig))
    throw new Error("Invalid minisign trusted comment signature");
}

export function validateReleaseVersion(root, tag) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag))
    throw new Error("Expected a stable vX.Y.Z release tag");
  const version = tag.slice(1);
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const config = JSON.parse(
    readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8"),
  );
  const cargo = readFileSync(join(root, "src-tauri/Cargo.toml"), "utf8")
    .replace(/\r\n/g, "\n")
    .match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  const lock = readFileSync(join(root, "src-tauri/Cargo.lock"), "utf8")
    .replace(/\r\n/g, "\n")
    .match(/\[\[package\]\]\nname = "cc-switch"\nversion = "([^"]+)"/)?.[1];
  if (![pkg.version, config.version, cargo, lock].every((v) => v === version))
    throw new Error(
      `Release versions do not match tag: expected ${version}, got pkg=${pkg.version}, config=${config.version}, cargo=${cargo}, lock=${lock}`,
    );
  if (
    config.productName !== "CC Switch Pro" ||
    config.identifier !== "com.mezaicc.switchpro" ||
    JSON.stringify(config.plugins["deep-link"].desktop.schemes) !==
      '["ccswitch-pro"]'
  )
    throw new Error("Fork application identity changed");
  if (
    JSON.stringify(config.plugins.updater.endpoints) !==
    '["https://github.com/Alex-lsky/cc-switch/releases/latest/download/latest.json"]'
  )
    throw new Error("Fork update endpoint changed");
  if (!config.plugins.updater.pubkey)
    throw new Error("Missing updater verification key");
  return config;
}

export function prepareRelease(root, assetsDir, tag, repo) {
  if (repo !== "Alex-lsky/cc-switch")
    throw new Error("Refusing to publish outside the maintained fork");
  const config = validateReleaseVersion(root, tag);
  const prefix = `CC-Switch-${tag}-`;
  const required = [
    "macOS.dmg",
    "macOS.zip",
    "Windows.msi",
    "Windows-Portable.zip",
    "Windows-arm64.msi",
    "Windows-arm64-Portable.zip",
    ...["x86_64", "arm64"].flatMap((a) =>
      ["AppImage", "deb", "rpm"].map((ext) => `Linux-${a}.${ext}`),
    ),
  ];
  for (const suffix of required)
    if (!readFileSync(join(assetsDir, prefix + suffix)).length)
      throw new Error(`Empty asset: ${suffix}`);
  const platforms = {};
  for (const [suffix, keys] of [
    ["macOS.tar.gz", ["darwin-aarch64", "darwin-x86_64"]],
    ["Windows.msi", ["windows-x86_64"]],
    ["Windows-arm64.msi", ["windows-aarch64"]],
    ["Linux-x86_64.AppImage", ["linux-x86_64"]],
    ["Linux-arm64.AppImage", ["linux-aarch64"]],
  ]) {
    const name = prefix + suffix;
    const bytes = readFileSync(join(assetsDir, name));
    const signature = readFileSync(
      join(assetsDir, name + ".sig"),
      "utf8",
    ).trim();
    if (!bytes.length) throw new Error(`Empty updater asset: ${name}`);
    verifyUpdaterSignature(bytes, signature, config.plugins.updater.pubkey);
    for (const key of keys)
      platforms[key] = {
        signature,
        url: `https://github.com/${repo}/releases/download/${tag}/${name}`,
      };
  }
  const notes = readFileSync(
    join(root, `docs/release-notes/${tag}-zh.md`),
    "utf8",
  );
  const manifest = {
    version: tag.slice(1),
    notes,
    pub_date: new Date().toISOString(),
    platforms,
  };
  writeFileSync(
    join(assetsDir, "latest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  return manifest;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [mode, tag, assetsDir, repo] = process.argv.slice(2);
  if (mode === "--check") validateReleaseVersion(process.cwd(), tag);
  else if (mode === "--prepare")
    prepareRelease(process.cwd(), assetsDir, tag, repo);
  else
    throw new Error(
      "Usage: --check <tag> | --prepare <tag> <assets-dir> <owner/repo>",
    );
  console.log(`Release validation passed: ${tag}`);
}
