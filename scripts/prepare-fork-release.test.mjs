import test from "node:test";
import assert from "node:assert/strict";
import {
  generateKeyPairSync,
  randomBytes,
  sign,
  createHash,
} from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateReleaseVersion,
  verifyUpdaterSignature,
  prepareRelease,
} from "./prepare-fork-release.mjs";

function fixture(bytes, algorithm = "ED") {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const keyId = randomBytes(8);
  const pub = Buffer.concat([
    Buffer.from("Ed"),
    keyId,
    publicKey.export({ format: "der", type: "spki" }).subarray(-32),
  ]);
  const signed =
    algorithm === "ED"
      ? createHash("blake2b512").update(bytes).digest()
      : bytes;
  const sig = sign(null, signed, privateKey);
  const trusted = "timestamp:1\tfile:fixture";
  const globalSig = sign(
    null,
    Buffer.concat([sig, Buffer.from(trusted)]),
    privateKey,
  );
  const inner = `untrusted comment: fixture\n${Buffer.concat([Buffer.from(algorithm), keyId, sig]).toString("base64")}\ntrusted comment: ${trusted}\n${globalSig.toString("base64")}\n`;
  return {
    publicKey: Buffer.from(
      `untrusted comment: fixture\n${pub.toString("base64")}\n`,
    ).toString("base64"),
    signature: Buffer.from(inner).toString("base64"),
  };
}
for (const algorithm of ["ED", "Ed"])
  test(`verifies minisign ${algorithm} artifact and trusted comment`, () => {
    const bytes = Buffer.from("signed test artifact");
    const f = fixture(bytes, algorithm);
    verifyUpdaterSignature(bytes, f.signature, f.publicKey);
    assert.throws(
      () =>
        verifyUpdaterSignature(
          Buffer.from("tampered"),
          f.signature,
          f.publicKey,
        ),
      /Invalid updater/,
    );
    const tampered = Buffer.from(
      Buffer.from(f.signature, "base64")
        .toString()
        .replace("timestamp:1", "timestamp:2"),
    ).toString("base64");
    assert.throws(
      () => verifyUpdaterSignature(bytes, tampered, f.publicKey),
      /trusted comment/,
    );
    assert.throws(
      () =>
        verifyUpdaterSignature(bytes, f.signature, fixture(bytes).publicKey),
      /key does not match/,
    );
  });
test("rejects malformed signature instead of producing partial metadata", () => {
  assert.throws(
    () =>
      verifyUpdaterSignature(Buffer.from("test"), "bad signature", "bad key"),
    /Invalid base64/,
  );
});
test("checks tag, all version files, app identity, and update source", () => {
  validateReleaseVersion(process.cwd(), "v3.20.4");
  assert.throws(
    () => validateReleaseVersion(process.cwd(), "v3.20.3"),
    /versions/,
  );
  assert.throws(
    () => validateReleaseVersion(process.cwd(), "v3.20.4-rc1"),
    /stable/,
  );
  assert.throws(
    () => prepareRelease(process.cwd(), ".", "v3.20.4", "farion1231/cc-switch"),
    /outside/,
  );
});
test("requires complete assets and signatures, then emits six verified platform entries", () => {
  const root = mkdtempSync(join(tmpdir(), "ccswitch-release-fixture-"));
  try {
    mkdirSync(join(root, "src-tauri"));
    mkdirSync(join(root, "docs/release-notes"), { recursive: true });
    mkdirSync(join(root, "assets"));
    const bytes = Buffer.from("artifact");
    const f = fixture(bytes);
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ version: "3.20.4" }),
    );
    writeFileSync(
      join(root, "src-tauri/Cargo.toml"),
      '[package]\nversion = "3.20.4"\n',
    );
    writeFileSync(
      join(root, "src-tauri/Cargo.lock"),
      '[[package]]\nname = "cc-switch"\nversion = "3.20.4"\n',
    );
    writeFileSync(
      join(root, "src-tauri/tauri.conf.json"),
      JSON.stringify({
        version: "3.20.4",
        productName: "CC Switch Pro",
        identifier: "com.mezaicc.switchpro",
        plugins: {
          "deep-link": { desktop: { schemes: ["ccswitch-pro"] } },
          updater: {
            pubkey: f.publicKey,
            endpoints: [
              "https://github.com/Alex-lsky/cc-switch/releases/latest/download/latest.json",
            ],
          },
        },
      }),
    );
    writeFileSync(
      join(root, "docs/release-notes/v3.20.4-zh.md"),
      "Release notes",
    );
    const assets = join(root, "assets");
    assert.throws(
      () => prepareRelease(root, assets, "v3.20.4", "Alex-lsky/cc-switch"),
      /ENOENT/,
    );
    const suffixes = [
      "macOS.dmg",
      "macOS.zip",
      "macOS.tar.gz",
      "Windows.msi",
      "Windows-Portable.zip",
      "Windows-arm64.msi",
      "Windows-arm64-Portable.zip",
      ...["x86_64", "arm64"].flatMap((a) =>
        ["AppImage", "deb", "rpm"].map((e) => `Linux-${a}.${e}`),
      ),
    ];
    for (const suffix of suffixes)
      writeFileSync(join(assets, `CC-Switch-v3.20.4-${suffix}`), bytes);
    assert.throws(
      () => prepareRelease(root, assets, "v3.20.4", "Alex-lsky/cc-switch"),
      /ENOENT/,
    );
    for (const suffix of [
      "macOS.tar.gz",
      "Windows.msi",
      "Windows-arm64.msi",
      "Linux-x86_64.AppImage",
      "Linux-arm64.AppImage",
    ])
      writeFileSync(
        join(assets, `CC-Switch-v3.20.4-${suffix}.sig`),
        f.signature,
      );
    const manifest = prepareRelease(
      root,
      assets,
      "v3.20.4",
      "Alex-lsky/cc-switch",
    );
    assert.equal(Object.keys(manifest.platforms).length, 6);
    assert.equal(manifest.version, "3.20.4");
    for (const p of Object.values(manifest.platforms))
      assert.match(
        p.url,
        /Alex-lsky\/cc-switch\/releases\/download\/v3\.20\.4\//,
      );
    writeFileSync(join(assets, "CC-Switch-v3.20.4-Windows.msi"), "tampered");
    assert.throws(
      () => prepareRelease(root, assets, "v3.20.4", "Alex-lsky/cc-switch"),
      /Invalid updater/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
