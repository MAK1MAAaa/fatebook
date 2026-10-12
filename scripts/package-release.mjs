import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = path.join(root, "dist");
const releaseRoot = path.join(root, "release");
const createdAt = new Date().toISOString();
const releaseId = createdAt.replace(/[-:.]/g, "");
const archiveName = `fatebook-1panel-${releaseId}.tar.gz`;

async function copyStaticFiles(source, target) {
  await mkdir(target, { recursive: true, mode: 0o755 });
  await chmod(target, 0o755);
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (/[\r\n\\]/.test(entry.name))
      throw new Error(`无法打包该文件名：${entry.name}`);
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`静态文件不能包含符号链接：${from}`);
    if (entry.isDirectory()) await copyStaticFiles(from, to);
    else if (entry.isFile()) {
      await copyFile(from, to);
      await chmod(to, 0o644);
    } else throw new Error(`不支持的静态文件类型：${from}`);
  }
}

async function collectFiles(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory())
      files.push(
        ...(await collectFiles(path.join(directory, entry.name), relative)),
      );
    else files.push(relative);
  }
  return files.sort();
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function main() {
  if (!(await lstat(dist)).isDirectory())
    throw new Error("请先生成 dist 构建产物。");
  const index = await readFile(path.join(dist, "index.html"), "utf8");
  if (!index.includes("./assets/"))
    throw new Error("构建入口必须使用相对 assets 路径。");
  const contentSource = await readFile(
    path.join(root, "src/rpg/content.ts"),
    "utf8",
  );
  const storyVersion = contentSource.match(
    /CONTENT_VERSION\s*=\s*["']([^"']+)["']/,
  )?.[1];
  if (!storyVersion) throw new Error("未找到剧情版本，停止打包。");
  const packageInfo = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8"),
  );
  const staging = await mkdtemp(path.join(tmpdir(), "fatebook-release-"));
  const partialArchive = path.join(releaseRoot, `${archiveName}.partial`);
  try {
    const bundle = path.join(staging, "fatebook");
    await mkdir(bundle, { mode: 0o755 });
    await chmod(bundle, 0o755);
    await copyStaticFiles(dist, path.join(bundle, "site"));
    for (const name of ["docker-compose.yml", "nginx.conf", "README.md"]) {
      const source = path.join(root, "deploy", name === "docker-compose.yml" ? "docker-compose.static.yml" : name);
      if (!(await lstat(source)).isFile())
        throw new Error(`缺少部署文件：${name}`);
      await copyFile(source, path.join(bundle, name));
      await chmod(path.join(bundle, name), 0o644);
    }
    const siteFiles = await collectFiles(path.join(bundle, "site"));
    await writeFile(
      path.join(bundle, "release.json"),
      `${JSON.stringify(
        {
          releaseId,
          createdAt,
          application: packageInfo.name,
          applicationVersion: packageInfo.version,
          storyVersion,
          deploymentDirectory: "/opt/fatebook",
          staticFileCount: siteFiles.length,
          savesIncluded: false,
        },
        null,
        2,
      )}\n`,
      { mode: 0o644 },
    );
    await chmod(path.join(bundle, "release.json"), 0o644);
    const checksums = [];
    for (const file of await collectFiles(bundle)) {
      checksums.push(
        `${sha256(await readFile(path.join(bundle, file)))}  ${file}`,
      );
    }
    await writeFile(
      path.join(bundle, "SHA256SUMS"),
      `${checksums.join("\n")}\n`,
      { mode: 0o644 },
    );
    await chmod(path.join(bundle, "SHA256SUMS"), 0o644);
    await mkdir(releaseRoot, { recursive: true });
    const result = spawnSync(
      "tar",
      ["-czf", partialArchive, "-C", staging, "fatebook"],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          COPYFILE_DISABLE: "1",
          COPY_EXTENDED_ATTRIBUTES_DISABLE: "1",
        },
      },
    );
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(`tar 打包失败，退出码 ${result.status}`);
    const archive = path.join(releaseRoot, archiveName);
    await rename(partialArchive, archive);
    await chmod(archive, 0o644);
    const bytes = await readFile(archive);
    await writeFile(`${archive}.sha256`, `${sha256(bytes)}  ${archiveName}\n`);
    await chmod(`${archive}.sha256`, 0o644);
    console.log(`\n1Panel 部署包：${archive}`);
    console.log(`SHA-256：${archive}.sha256`);
    console.log(
      `大小：${(bytes.length / 1024).toFixed(1)} KiB；剧情版本：${storyVersion}`,
    );
    console.log(
      "上传到服务器 /opt 并解压，在 1Panel 从 /opt/fatebook/docker-compose.yml 创建编排。",
    );
  } finally {
    await rm(staging, { recursive: true, force: true });
    await rm(partialArchive, { force: true });
  }
}

main().catch((error) => {
  console.error(
    `打包失败：${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
