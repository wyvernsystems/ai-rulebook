import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import test, { describe } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const readRepoFile = (rel, encoding = "utf8") => fs.readFile(path.join(repoRoot, rel), encoding);
const packageJson = JSON.parse(await readRepoFile("package.json"));

/** Modules the extension may import; anything else needs a requirements change. */
const ALLOWED_SOURCE_IMPORTS = new Set(["vscode", "node:fs", "node:fs/promises", "node:path"]);

async function sourceFiles() {
  const dir = path.join(repoRoot, "src");
  const names = (await fs.readdir(dir)).filter((name) => name.endsWith(".ts"));
  return Promise.all(
    names.map(async (name) => ({ name, text: await fs.readFile(path.join(dir, name), "utf8") }))
  );
}

describe("project constraints", () => {
  test("PROJ-1: the package is MIT licensed and ships the license text", async () => {
    assert.equal(packageJson.license, "MIT");
    assert.match(await readRepoFile("LICENSE"), /^MIT License\n/);
  });

  test("PROJ-2: the publisher and package name form the marketplace id", () => {
    assert.equal(`${packageJson.publisher}.${packageJson.name}`, "WyvernSystemsLLC.ai-rulebook");
  });

  test("PROJ-3: declares the supported VS Code and Node engines", () => {
    assert.deepEqual(packageJson.engines, { vscode: "^1.85.0", node: ">=18.18.0" });
  });

  test("PROJ-4: has no runtime dependencies and only tooling dev dependencies", () => {
    assert.equal(packageJson.dependencies, undefined);
    const tooling = /^(@types\/|@vscode\/vsce$|ovsx$|typescript$|typescript-eslint$|eslint$|@eslint\/)/;
    for (const name of Object.keys(packageJson.devDependencies)) {
      assert.match(name, tooling, `unexpected dev dependency: ${name}`);
    }
  });

  test("PROJ-5, PROJ-6: source imports no network modules and reads no environment variables", async () => {
    for (const { name, text } of await sourceFiles()) {
      for (const [, specifier] of text.matchAll(/from\s+"([^"]+)"/g)) {
        assert.ok(
          specifier.startsWith("./") || ALLOWED_SOURCE_IMPORTS.has(specifier),
          `${name} imports ${specifier}`
        );
      }
      assert.doesNotMatch(text, /\brequire\s*\(|\bimport\s*\(/, `${name} loads a module dynamically`);
      assert.doesNotMatch(text, /\bfetch\s*\(/, `${name} calls fetch`);
      assert.doesNotMatch(text, /process\.env/, `${name} reads environment variables`);
    }
  });

  test("PROJ-8: the README names every command and every shipped rule", async () => {
    const readme = await readRepoFile("README.md");
    for (const command of packageJson.contributes.commands) {
      const title = command.title.replace(/^AI Rulebook: /, "");
      assert.ok(readme.includes(title), `README does not mention the command "${title}"`);
    }
    const manifest = JSON.parse(await readRepoFile("bundled/manifest.json"));
    for (const rule of manifest.files) {
      assert.ok(readme.includes(`\`${rule}\``), `README does not list the rule ${rule}`);
    }
  });

  test("PROJ-9: the changelog opens with an Unreleased section", async () => {
    const firstSection = (await readRepoFile("CHANGELOG.md")).match(/^## .*$/m);
    assert.equal(firstSection?.[0], "## [Unreleased]");
  });

  test("BUNDLE-8: the marketplace icon is a PNG of at most 128×128", async () => {
    const png = await readRepoFile(packageJson.icon, null);
    assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    assert.ok(width <= 128 && height <= 128, `icon is ${width}×${height}`);
  });
});
