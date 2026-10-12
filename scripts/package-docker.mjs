import { spawn, execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createGzip } from "node:zlib";

const root = fileURLToPath(new URL("../", import.meta.url));
const releaseRoot = path.join(root, "release");
const execFileAsync = promisify(execFile);

function selectedArchitectures(args) {
  if (args.length === 0) return ["amd64", "arm64"];
  if (args.length === 1 && /^--arch=(amd64|arm64)$/.test(args[0]))
    return [args[0].slice("--arch=".length)];
  throw new Error(
    "参数无效。用法：node scripts/package-docker.mjs [--arch=amd64|--arch=arm64] [--archive-only]；默认分别构建两种架构。",
  );
}

function completion(child, description) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `${description}失败：${signal ? `信号 ${signal}` : `退出码 ${code}`}`,
          ),
        );
    });
  });
}

async function docker(args) {
  const child = spawn("docker", args, { cwd: root, stdio: "inherit" });
  await completion(child, `docker ${args.slice(0, 2).join(" ")}`);
}

async function inspectImage(tag, architecture) {
  const { stdout } = await execFileAsync("docker", ["image", "inspect", tag], {
    cwd: root,
    maxBuffer: 1024 * 1024,
  });
  const [image] = JSON.parse(stdout);
  if (image?.Os !== "linux" || image?.Architecture !== architecture)
    throw new Error(
      `镜像架构不符：预期 linux/${architecture}，实际 ${image?.Os}/${image?.Architecture}`,
    );
  if (typeof image.Id !== "string" || !/^sha256:[a-f0-9]{64}$/.test(image.Id))
    throw new Error("Docker 未返回有效的镜像 ID。");
  return image;
}

async function saveCompressedImage(tags, target) {
  const child = spawn("docker", ["image", "save", ...tags], {
    cwd: root,
    stdio: ["ignore", "pipe", "inherit"],
  });
  const exited = completion(child, "Docker 镜像导出");
  const compressed = pipeline(
    child.stdout,
    createGzip({ level: 9 }),
    createWriteStream(target, { flags: "wx", mode: 0o644 }),
  ).catch((error) => {
    child.kill();
    throw error;
  });
  // A successful gzip stream alone does not prove that docker save succeeded.
  const results = await Promise.allSettled([exited, compressed]);
  for (const result of results)
    if (result.status === "rejected") throw result.reason;
}

async function fileHash(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function packageArchitecture(
  architecture,
  contentVersion,
  createdAt,
  releaseId,
  archiveOnly,
) {
  const platform = `linux/${architecture}`;
  const tags = [
    `fatebook:${contentVersion}-${releaseId}-${architecture}`,
    `fatebook:${contentVersion}-${architecture}`,
  ];
  const name = `fatebook-docker-${contentVersion}-${releaseId}-${architecture}.tar.gz`;
  const archive = path.join(releaseRoot, name);
  const partialArchive = `${archive}.partial`;
  const checksumFile = `${archive}.sha256`;
  const metadataFile = `${archive}.metadata.json`;
  const partialChecksum = `${checksumFile}.partial`;
  const partialMetadata = `${metadataFile}.partial`;

  console.log(`\n构建 ${platform}：${tags[0]}`);
  await docker([
    "buildx",
    "build",
    "--platform",
    platform,
    "--load",
    "--provenance=false",
    "--file",
    path.join(root, "deploy/Dockerfile"),
    ...tags.flatMap((tag) => ["--tag", tag]),
    root,
  ]);
  const image = await inspectImage(tags[0], architecture);
  if (!tags.every((tag) => image.RepoTags?.includes(tag)))
    throw new Error("构建镜像缺少预期标签，停止导出。");

  try {
    console.log(`导出并压缩 ${platform} 镜像……`);
    await saveCompressedImage(tags, partialArchive);
    await chmod(partialArchive, 0o644);
    const size = (await stat(partialArchive)).size;
    const sha256 = await fileHash(partialArchive);
    const metadata = {
      releaseId,
      createdAt,
      contentVersion,
      platform,
      imageTags: tags,
      imageId: image.Id,
      archive: name,
      size,
      sha256,
      port: 6657,
      savesIncluded: false,
      format: "docker-save+gzip",
    };
    if (!archiveOnly) {
      await writeFile(partialChecksum, `${sha256}  ${name}\n`, {
        flag: "wx",
        mode: 0o644,
      });
      await writeFile(partialMetadata, `${JSON.stringify(metadata, null, 2)}\n`, {
        flag: "wx",
        mode: 0o644,
      });
      await chmod(partialChecksum, 0o644);
      await chmod(partialMetadata, 0o644);
      await rename(partialChecksum, checksumFile);
      await rename(partialMetadata, metadataFile);
    }
    await rename(partialArchive, archive);
    console.log(`镜像包：${archive}`);
    console.log(
      `大小：${(size / 1024 / 1024).toFixed(2)} MiB；端口：6657；SHA-256：${sha256}`,
    );
    if (!archiveOnly)
      console.log(`校验文件：${checksumFile}\n发布信息：${metadataFile}`);
  } finally {
    for (const partial of [partialArchive, partialChecksum, partialMetadata])
      await rm(partial, { force: true });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const archiveOnly = args.includes("--archive-only");
  const architectures = selectedArchitectures(args.filter(arg => arg !== "--archive-only"));
  for (const file of ["dist/index.html", "deploy/Dockerfile", "deploy/nginx.conf"])
    if (!(await lstat(path.join(root, file))).isFile())
      throw new Error(`缺少普通文件 ${file}，请先完成前端构建。`);
  const source = await readFile(path.join(root, "src/rpg/content.ts"), "utf8");
  const contentVersion = source.match(/CONTENT_VERSION\s*=\s*["']([^"']+)["']/)?.[1];
  if (
    !contentVersion ||
    !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/.test(contentVersion) ||
    contentVersion.length > 64
  )
    throw new Error("剧情版本缺失或不能用于 Docker 标签，停止打包。");
  const createdAt = new Date().toISOString();
  const releaseId = createdAt.replace(/[-:.]/g, "");
  await mkdir(releaseRoot, { recursive: true });
  for (const architecture of architectures)
    await packageArchitecture(architecture, contentVersion, createdAt, releaseId, archiveOnly);
  console.log(
    "\n上传与服务器架构相符的 .tar.gz 到 1Panel 镜像导入；创建容器时映射 6657:6657。",
  );
}

main().catch((error) => {
  console.error(
    `镜像打包失败：${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
