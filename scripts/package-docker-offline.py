#!/usr/bin/env python3
"""Replace Fatebook application layers in a verified, complete Linux/AMD64 image.

No Docker daemon, extraction, downloaded dependencies, or host binaries are used.
Archive layout follows Moby v28.5.1 image/tarexport/{save,load}.go and OCI image-spec
config.md, image-layout.md, manifest.md and layer.md. Validation proves archive
structure and input bytes, not successful docker load or container execution.
"""

import argparse
import copy
import datetime
import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parent.parent
WEB = "usr/share/nginx/html"
NGINX = "etc/nginx/conf.d/default.conf"
OPAQUE = WEB + "/.wh..wh..opq"
APP_HISTORY = "fatebook offline app-layer: replace dist and nginx.conf"
MEDIA_MANIFEST = "application/vnd.oci.image.manifest.v1+json"
MEDIA_INDEX = "application/vnd.oci.image.index.v1+json"
MEDIA_CONFIG = "application/vnd.oci.image.config.v1+json"
MEDIA_LAYER = "application/vnd.oci.image.layer.v1.tar"
MAX_BLOB = 512 * 1024 * 1024
MAX_INFLATED = 2 * 1024 * 1024 * 1024
CHUNK = 1024 * 1024


def digest(data):
    return "sha256:" + hashlib.sha256(data).hexdigest()


def json_bytes(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")


def release_tags(version, created_at):
    if not isinstance(version, str) or not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?", version) or len(version) > 64:
        raise ValueError("应用版本不能用于 Docker 标签")
    date = datetime.datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    if date.tzinfo is None:
        raise ValueError("created-at 必须包含时区")
    utc = date.astimezone(datetime.timezone.utc)
    release_id = utc.strftime("%Y%m%dT%H%M%S") + f"{utc.microsecond // 1000:03d}Z"
    return ["fatebook:" + version + "-" + release_id + "-amd64", "fatebook:" + version + "-amd64"]


def safe_name(name):
    if not isinstance(name, str) or "\\" in name or "\0" in name:
        raise ValueError("归档路径无效")
    path = PurePosixPath(name)
    if path.is_absolute() or ".." in path.parts:
        raise ValueError("归档包含不安全路径：" + name)
    return str(path)


def blob_path(identifier):
    if not isinstance(identifier, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", identifier):
        raise ValueError("仅支持有效 SHA-256 摘要")
    return "blobs/sha256/" + identifier.split(":", 1)[1]


class ImageArchive:
    def __init__(self, path):
        self.path = Path(path)
        self.tar = tarfile.open(self.path, "r:*")
        self.members = {}
        try:
            for member in self.tar:
                name = safe_name(member.name)
                if not member.isfile() and not member.isdir():
                    raise ValueError("外层归档只能包含普通文件与目录：" + name)
                if name in self.members:
                    raise ValueError("外层归档路径重复：" + name)
                self.members[name] = member
        except Exception:
            self.tar.close()
            raise

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.tar.close()

    def read(self, name):
        name = safe_name(name)
        member = self.members.get(name)
        if not member or not member.isfile() or member.size > MAX_BLOB:
            raise ValueError("归档缺少普通文件或文件过大：" + name)
        stream = self.tar.extractfile(member)  # Read bytes only; never extract paths.
        if stream is None:
            raise ValueError("无法读取归档文件：" + name)
        data = stream.read(MAX_BLOB + 1)
        if len(data) != member.size:
            raise ValueError("归档文件长度不一致：" + name)
        return data

    def descriptor(self, descriptor):
        data = self.read(blob_path(descriptor.get("digest")))
        if digest(data) != descriptor["digest"] or len(data) != descriptor.get("size"):
            raise ValueError("OCI 摘要或大小不符：" + descriptor["digest"])
        return data


def layer_diff_id(payload):
    stream = gzip.GzipFile(fileobj=io.BytesIO(payload)) if payload.startswith(b"\x1f\x8b") else io.BytesIO(payload)
    hasher = hashlib.sha256()
    total = 0
    with stream:
        while chunk := stream.read(CHUNK):
            total += len(chunk)
            if total > MAX_INFLATED:
                raise ValueError("层解压后过大")
            hasher.update(chunk)
    return "sha256:" + hasher.hexdigest()


def layer_members(payload):
    with tarfile.open(fileobj=io.BytesIO(payload), mode="r:*") as archive:
        members = archive.getmembers()
    names = [safe_name(member.name) for member in members]
    if len(names) != len(set(names)):
        raise ValueError("镜像层路径重复")
    return members


def read_image(path):
    with ImageArchive(path) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        if not isinstance(manifest, list) or len(manifest) != 1:
            raise ValueError("基包必须只包含一个镜像（可有多个标签）")
        docker_manifest = manifest[0]
        config_name = safe_name(docker_manifest["Config"])
        match = re.fullmatch(r"(?:blobs/sha256/)?([0-9a-f]{64})(?:\.json)?", config_name)
        if not match:
            raise ValueError("Config 文件名必须明确声明 SHA-256 摘要")
        config_data = archive.read(config_name)
        config_digest = digest(config_data)
        if config_digest != "sha256:" + match[1]:
            raise ValueError("config.digest 校验失败")
        config = json.loads(config_data)
        if config.get("os") != "linux" or config.get("architecture") != "amd64":
            raise ValueError("必须使用 Linux/AMD64 基包")
        rootfs = config.get("rootfs", {})
        layer_names = docker_manifest.get("Layers", [])
        diff_ids = rootfs.get("diff_ids", [])
        if rootfs.get("type") != "layers" or not layer_names or len(diff_ids) != len(layer_names):
            raise ValueError("rootfs.diff_ids 与 manifest 层数量不符")
        layers = []
        for name, expected_diff in zip(layer_names, diff_ids):
            blob_path(expected_diff)
            payload = archive.read(name)
            identifier = digest(payload)
            normalized = safe_name(name)
            if normalized.startswith("blobs/sha256/") and normalized != blob_path(identifier):
                raise ValueError("层 blob.digest 校验失败：" + name)
            if layer_diff_id(payload) != expected_diff:
                raise ValueError("层 diff_id 校验失败：" + name)
            layers.append({"payload": payload, "digest": identifier, "diff_id": expected_diff, "members": layer_members(payload)})
        has_layout = "oci-layout" in archive.members or "index.json" in archive.members
        oci_tags = []
        if has_layout:
            if json.loads(archive.read("oci-layout")).get("imageLayoutVersion") != "1.0.0":
                raise ValueError("不支持的 OCI layout 版本")
            index = json.loads(archive.read("index.json"))
            if index.get("schemaVersion") != 2 or not index.get("manifests"):
                raise ValueError("OCI index 无效")
            for descriptor in index["manifests"]:
                if descriptor.get("mediaType") != MEDIA_MANIFEST:
                    raise ValueError("只支持单平台 OCI image manifest")
                annotation = descriptor.get("annotations", {}).get("config.digest")
                oci_tags.append({"name": descriptor.get("annotations", {}).get("io.containerd.image.name"), "ref": descriptor.get("annotations", {}).get("org.opencontainers.image.ref.name")})
                if annotation is not None and annotation != config_digest:
                    raise ValueError("index config.digest 不符")
                oci = json.loads(archive.descriptor(descriptor))
                if oci.get("schemaVersion") != 2 or oci.get("mediaType") != MEDIA_MANIFEST:
                    raise ValueError("OCI manifest 无效")
                if oci["config"].get("mediaType") != MEDIA_CONFIG or archive.descriptor(oci["config"]) != config_data:
                    raise ValueError("OCI 与 Docker Config 不一致")
                if len(oci["layers"]) != len(layers):
                    raise ValueError("OCI 与 Docker 层数量不一致")
                for layer, layer_descriptor in zip(layers, oci["layers"]):
                    media = MEDIA_LAYER + ("+gzip" if layer["payload"].startswith(b"\x1f\x8b") else "")
                    if layer_descriptor.get("mediaType") != media or archive.descriptor(layer_descriptor) != layer["payload"]:
                        raise ValueError("OCI 与 Docker 层内容不一致")
        history = config.get("history", [])
        if sum(not entry.get("empty_layer", False) for entry in history) != len(layers):
            raise ValueError("history 与 rootfs 层数量不一致")
        return {"config": config, "config_digest": config_digest, "layers": layers, "oci": has_layout, "tags": docker_manifest.get("RepoTags", []), "oci_tags": oci_tags}


def runtime_config(config):
    runtime = config.get("config", {})
    if runtime.get("Entrypoint") != ["/docker-entrypoint.sh"] or runtime.get("Cmd") != ["nginx", "-g", "daemon off;"]:
        raise ValueError("基包不是预期的完整 Nginx 运行镜像")
    health = runtime.get("Healthcheck", {})
    test = health.get("Test", [])
    if "6657/tcp" not in runtime.get("ExposedPorts", {}) or len(test) != 2 or test[0] != "CMD-SHELL" or "127.0.0.1:6657/healthz" not in test[1]:
        raise ValueError("基包缺少 6657 端口或健康检查")


def application_boundary(image):
    count = 0
    boundary = None
    for index, entry in enumerate(image["config"]["history"]):
        if entry.get("empty_layer", False):
            continue
        command = entry.get("created_by", "")
        if APP_HISTORY in command or "rm -rf /usr/share/nginx/html/*" in command:
            boundary = (count, index)
            break
        count += 1
    if boundary is None or boundary[0] < 1:
        raise ValueError("无法确认网页层边界，拒绝猜测或累加旧网页层")
    found_index = found_config = False
    for layer in image["layers"][boundary[0]:]:
        for member in layer["members"]:
            name = safe_name(member.name)
            found_index |= name == WEB + "/index.html" and member.isfile()
            found_config |= name == NGINX and member.isfile()
            # The original cleanup layer includes only empty Rosetta cache directories.
            allowed_directory = member.isdir() and (name in {".", "usr", "usr/share", "usr/share/nginx", "etc", "etc/nginx", "etc/nginx/conf.d", "root", "root/.cache", "root/.cache/rosetta"})
            app_path = name == WEB or name.startswith(WEB + "/") or name == NGINX
            if not app_path and not allowed_directory:
                raise ValueError("待替换层含非网页依赖，拒绝删除：" + name)
    if not found_index or not found_config:
        raise ValueError("旧网页层缺少 index.html 或 nginx.conf")
    return boundary


def source_files(dist, nginx_conf):
    dist, nginx_conf = Path(dist), Path(nginx_conf)
    if dist.is_symlink() or not dist.is_dir() or nginx_conf.is_symlink() or not nginx_conf.is_file():
        raise ValueError("dist 必须为目录，nginx.conf 必须为普通文件，禁止符号链接")
    files = {NGINX: nginx_conf.read_bytes(), OPAQUE: b""}
    for path in sorted(dist.rglob("*")):
        if path.is_symlink() or not (path.is_dir() or path.is_file()):
            raise ValueError("dist 禁止符号链接或特殊文件：" + str(path))
        name = safe_name(path.relative_to(dist).as_posix())
        if any(part.startswith(".wh.") for part in PurePosixPath(name).parts):
            raise ValueError("dist 禁止 OCI whiteout 保留名称：" + name)
        if path.is_file():
            if path.stat().st_size > MAX_BLOB:
                raise ValueError("dist 文件过大：" + name)
            files[WEB + "/" + name] = path.read_bytes()
    if not files.get(WEB + "/index.html"):
        raise ValueError("缺少非空 dist/index.html，请先完成生产构建")
    nginx = files[NGINX].decode("utf-8")
    if not re.search(r"\blisten\s+6657\s*;", nginx) or not re.search(r"\blocation\s*=\s*/healthz\s*\{", nginx):
        raise ValueError("nginx.conf 必须监听 6657 并提供 /healthz")
    return files


def add_entry(archive, name, data=None, timestamp=0):
    info = tarfile.TarInfo(name)
    info.uid = info.gid = 0
    info.uname = info.gname = "root"
    info.mtime = timestamp
    info.mode = 0o755 if data is None else 0o644
    if data is None:
        info.type = tarfile.DIRTYPE
    else:
        info.size = len(data)
    archive.addfile(info, None if data is None else io.BytesIO(data))


def compressed(data):
    target = io.BytesIO()
    with gzip.GzipFile(fileobj=target, mode="wb", filename="", mtime=0, compresslevel=9) as stream:
        stream.write(data)
    return target.getvalue()


def application_layer(files, timestamp):
    target = io.BytesIO()
    directories = set()
    for name in files:
        directories.update(str(parent) for parent in PurePosixPath(name).parents if str(parent) != ".")
    with tarfile.open(fileobj=target, mode="w", format=tarfile.PAX_FORMAT) as archive:
        for name in sorted(directories, key=lambda value: (value.count("/"), value)):
            add_entry(archive, name, timestamp=timestamp)
        for name, data in sorted(files.items()):
            add_entry(archive, name, data, timestamp)
    raw = target.getvalue()
    payload = compressed(raw)
    return {"payload": payload, "digest": digest(payload), "diff_id": digest(raw), "members": layer_members(payload)}


def descriptor(data, media):
    return {"mediaType": media, "digest": digest(data), "size": len(data)}


def image_entries(config, layers, tags):
    config_data = json_bytes(config)
    config_descriptor = descriptor(config_data, MEDIA_CONFIG)
    oci = {"schemaVersion": 2, "mediaType": MEDIA_MANIFEST, "config": config_descriptor, "layers": [descriptor(layer["payload"], MEDIA_LAYER + ("+gzip" if layer["payload"].startswith(b"\x1f\x8b") else "")) for layer in layers]}
    oci_data = json_bytes(oci)
    manifest_descriptor = descriptor(oci_data, MEDIA_MANIFEST)
    manifest_descriptor["platform"] = {"architecture": "amd64", "os": "linux"}
    descriptors = []
    for tag in tags:
        tagged = copy.deepcopy(manifest_descriptor)
        tagged["annotations"] = {"config.digest": config_descriptor["digest"], "io.containerd.image.name": "docker.io/library/" + tag, "org.opencontainers.image.ref.name": tag.split(":", 1)[1]}
        descriptors.append(tagged)
    entries = {blob_path(layer["digest"]): layer["payload"] for layer in layers}
    entries[blob_path(config_descriptor["digest"])] = config_data
    entries[blob_path(digest(oci_data))] = oci_data
    entries["manifest.json"] = json_bytes([{"Config": blob_path(config_descriptor["digest"]), "RepoTags": tags, "Layers": [blob_path(layer["digest"]) for layer in layers]}])
    entries["oci-layout"] = json_bytes({"imageLayoutVersion": "1.0.0"})
    entries["index.json"] = json_bytes({"schemaVersion": 2, "mediaType": MEDIA_INDEX, "manifests": descriptors})
    return entries


def verify_image(path, dist, nginx_conf, base=None, version=None):
    image = read_image(path)
    runtime_config(image["config"])
    boundary, history_index = application_boundary(image)
    if len(image["layers"]) != boundary + 1 or image["config"]["history"][history_index].get("created_by") != APP_HISTORY:
        raise ValueError("新版镜像必须只有一个重建的应用层")
    if not image["oci"]:
        raise ValueError("新版包缺少有效 OCI index/layout")
    files = source_files(dist, nginx_conf)
    actual = {}
    with tarfile.open(fileobj=io.BytesIO(image["layers"][-1]["payload"]), mode="r:*") as layer:
        for member in layer:
            if member.uid != 0 or member.gid != 0 or member.mode != (0o755 if member.isdir() else 0o644):
                raise ValueError("新应用层属主或权限不符")
            if member.isfile():
                actual[safe_name(member.name)] = layer.extractfile(member).read()
            elif not member.isdir():
                raise ValueError("新应用层出现特殊文件")
    if actual != files:
        raise ValueError("新应用层与 dist/nginx.conf 文件路径或字节不一致")
    app_version = image["config"]["config"].get("Labels", {}).get("org.opencontainers.image.version")
    if version is not None and app_version != version:
        raise ValueError("应用版本标签不符")
    expected_tags = release_tags(app_version, image["config"]["created"])
    expected_oci_tags = [{"name": "docker.io/library/" + tag, "ref": tag.split(":", 1)[1]} for tag in expected_tags]
    if image["tags"] != expected_tags or image["oci_tags"] != expected_oci_tags:
        raise ValueError("时间戳回滚标签或稳定别名缺失、不符")
    replaced = None
    if base is not None:
        original = read_image(base)
        original_boundary, _ = application_boundary(original)
        if boundary != original_boundary or any(left["payload"] != right["payload"] for left, right in zip(image["layers"][:boundary], original["layers"][:boundary])):
            raise ValueError("基础依赖层未原样保留")
        if any(layer["digest"] in {old["digest"] for old in original["layers"][boundary:]} for layer in image["layers"]):
            raise ValueError("输出仍包含旧应用层")
        original_runtime = {key: value for key, value in original["config"]["config"].items() if key != "Labels"}
        rebuilt_runtime = {key: value for key, value in image["config"]["config"].items() if key != "Labels"}
        if rebuilt_runtime != original_runtime:
            raise ValueError("运行入口、环境、端口或健康检查未原样保留")
        replaced = len(original["layers"]) - boundary
    return {"platform": "linux/amd64", "imageId": image["config_digest"], "imageTags": image["tags"], "releaseId": expected_tags[0][len("fatebook:") + len(app_version) + 1:-len("-amd64")], "createdAt": image["config"]["created"], "appVersion": app_version, "baseLayers": boundary, "replacedLayers": replaced, "totalLayers": len(image["layers"]), "applicationFiles": len(files) - 1, "port": 6657, "format": "docker-save+oci+gzip", "archiveValidation": "passed", "dockerLoadAndRun": "not-run"}


def build_image(base, dist, nginx_conf, output, version="2.1.0", created_at=None):
    output = Path(output).resolve()
    if output == Path(base).resolve() or output == Path(nginx_conf).resolve() or output.is_relative_to(Path(dist).resolve()):
        raise ValueError("输出不能覆盖基包或位于构建输入中")
    if output.exists():
        raise ValueError("输出已存在，拒绝覆盖：" + str(output))
    created_at = created_at or datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    tags = release_tags(version, created_at)
    date = datetime.datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    original = read_image(base)
    runtime_config(original["config"])
    boundary, history_index = application_boundary(original)
    files = source_files(dist, nginx_conf)
    layers = original["layers"][:boundary] + [application_layer(files, int(date.timestamp()))]
    config = copy.deepcopy(original["config"])
    config["created"] = created_at
    config["rootfs"]["diff_ids"] = [layer["diff_id"] for layer in layers]
    config["history"] = config["history"][:history_index] + [{"created": created_at, "created_by": APP_HISTORY, "comment": "Offline byte-verified replacement; original runtime dependencies retained."}]
    config["config"].setdefault("Labels", {}).update({"org.opencontainers.image.version": version, "org.opencontainers.image.base.digest": original["config_digest"]})
    config.pop("container", None)
    config.pop("container_config", None)
    entries = image_entries(config, layers, tags)
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=output.parent, prefix=output.name + ".", suffix=".partial", delete=False) as raw:
            temporary = Path(raw.name)
            with gzip.GzipFile(fileobj=raw, mode="wb", filename="", mtime=0, compresslevel=9) as zipped:
                with tarfile.open(fileobj=zipped, mode="w|", format=tarfile.PAX_FORMAT) as archive:
                    for name in ["blobs", "blobs/sha256"]:
                        add_entry(archive, name)
                    for name, data in sorted(entries.items()):
                        add_entry(archive, name, data)
        report = verify_image(temporary, dist, nginx_conf, base, version)
        os.chmod(temporary, 0o644)
        hasher = hashlib.sha256()
        with temporary.open("rb") as stream:
            while chunk := stream.read(CHUNK):
                hasher.update(chunk)
        report.update({"archive": str(output), "size": temporary.stat().st_size, "sha256": hasher.hexdigest()})
        # Publish atomically without overwriting an existing package, even in a race.
        os.link(temporary, output)
        return report
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", type=Path, required=True, help="显式指定已验证的旧 Docker tar.gz 基包")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--output", type=Path, help="创建的新归档（禁止覆盖已有文件）")
    mode.add_argument("--verify", type=Path, help="只校验已生成归档及其与输入的字节一致性")
    parser.add_argument("--dist", type=Path, default=ROOT / "dist")
    parser.add_argument("--nginx-conf", type=Path, default=ROOT / "deploy/nginx.conf")
    parser.add_argument("--version", default="2.1.0")
    parser.add_argument("--created-at", help="带时区的 ISO 时间；固定该值可复现归档")
    args = parser.parse_args()
    try:
        if args.verify:
            report = verify_image(args.verify, args.dist, args.nginx_conf, args.base, args.version)
        else:
            report = build_image(args.base, args.dist, args.nginx_conf, args.output, args.version, args.created_at)
    except (ValueError, OSError, EOFError, tarfile.TarError, KeyError, TypeError) as error:
        parser.exit(1, "离线镜像打包/校验失败：" + str(error) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
