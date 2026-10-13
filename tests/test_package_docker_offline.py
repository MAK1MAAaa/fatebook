"""Run with: python3 -m unittest discover -s tests -p 'test_package_docker_offline.py'."""

import gzip
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parent.parent / "scripts/package-docker-offline.py"
spec = importlib.util.spec_from_file_location("offline_package", SCRIPT)
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)
CREATED = "2026-10-12T00:00:00Z"


def hash_bytes(data):
    return "sha256:" + hashlib.sha256(data).hexdigest()


def encode(value):
    return json.dumps(value, separators=(",", ":")).encode()


def tar_bytes(files):
    target = io.BytesIO()
    with tarfile.open(fileobj=target, mode="w") as archive:
        for name, content in files.items():
            member = tarfile.TarInfo(name)
            member.size = len(content)
            member.mode = 0o644
            archive.addfile(member, io.BytesIO(content))
    return target.getvalue()


def write_archive(path, files):
    path.write_bytes(gzip.compress(tar_bytes(files), mtime=0))


def archive_files(path):
    with tarfile.open(path, "r:gz") as archive:
        return {member.name: archive.extractfile(member).read() for member in archive if member.isfile()}


class OfflinePackageTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.base = self.root / "base.tar.gz"
        self.dist = self.root / "dist"
        self.dist.mkdir()
        (self.dist / "assets").mkdir()
        (self.dist / "index.html").write_bytes(b'<script src="./assets/new.js"></script>')
        (self.dist / "assets/new.js").write_bytes(b"window.APP_VERSION='2.1.0';")
        self.conf = self.root / "nginx.conf"
        self.conf.write_bytes(b"server { listen 6657; location = /healthz { return 200 'ok'; } }")
        self.output = self.root / "new.tar.gz"
        self.layers = [
            tar_bytes({"bin/busybox": b"dependency-elf", "usr/sbin/nginx": b"nginx-elf", "usr/lib/libpcre2.so": b"pcre-elf", "docker-entrypoint.sh": b"#!/bin/sh\nexec \"$@\""}),
            tar_bytes({"usr/share/nginx/html/.wh.index.html": b""}),
            tar_bytes({"etc/nginx/conf.d/default.conf": b"old config"}),
            tar_bytes({"usr/share/nginx/html/index.html": b"old game", "usr/share/nginx/html/assets/old.js": b"old code"}),
            tar_bytes({}),
        ]
        self.config = {
            "architecture": "amd64", "os": "linux", "created": CREATED,
            "config": {"Entrypoint": ["/docker-entrypoint.sh"], "Cmd": ["nginx", "-g", "daemon off;"], "Env": ["PATH=/bin:/usr/sbin"], "StopSignal": "SIGQUIT", "ExposedPorts": {"6657/tcp": {}}, "Healthcheck": {"Test": ["CMD-SHELL", "wget -q -O /dev/null http://127.0.0.1:6657/healthz || exit 1"], "Interval": 30000000000, "Retries": 3}},
            "rootfs": {"type": "layers", "diff_ids": [hash_bytes(layer) for layer in self.layers]},
            "history": [{"created_by": "ADD alpine nginx runtime"}, {"created_by": "CMD nginx", "empty_layer": True}, {"created_by": "RUN rm -rf /usr/share/nginx/html/*"}, {"created_by": "COPY nginx.conf"}, {"created_by": "COPY dist/"}, {"created_by": "RUN chmod"}],
        }
        self.make_base()

    def tearDown(self):
        self.temp.cleanup()

    def make_base(self):
        config = encode(self.config)
        payloads = [gzip.compress(layer, mtime=0) for layer in self.layers]
        config_path = "blobs/sha256/" + hash_bytes(config)[7:]
        layer_paths = ["blobs/sha256/" + hash_bytes(layer)[7:] for layer in payloads]
        self.base_files = {name: data for name, data in zip(layer_paths, payloads)}
        self.base_files[config_path] = config
        self.base_files["manifest.json"] = encode([{"Config": config_path, "RepoTags": ["fatebook:2.0.0-amd64"], "Layers": layer_paths}])
        self.base_oci = {"schemaVersion": 2, "mediaType": package.MEDIA_MANIFEST, "config": {"mediaType": package.MEDIA_CONFIG, "digest": hash_bytes(config), "size": len(config)}, "layers": [{"mediaType": package.MEDIA_LAYER + "+gzip", "digest": hash_bytes(layer), "size": len(layer)} for layer in payloads]}
        self.attach_oci()
        write_archive(self.base, self.base_files)

    def attach_oci(self):
        oci = encode(self.base_oci)
        self.base_files["blobs/sha256/" + hash_bytes(oci)[7:]] = oci
        self.base_files["oci-layout"] = encode({"imageLayoutVersion": "1.0.0"})
        self.base_files["index.json"] = encode({"schemaVersion": 2, "mediaType": package.MEDIA_INDEX, "manifests": [{"mediaType": package.MEDIA_MANIFEST, "digest": hash_bytes(oci), "size": len(oci)}]})

    def build(self, output=None):
        return package.build_image(self.base, self.dist, self.conf, output or self.output, created_at=CREATED)

    def test_archive_reuses_dependencies_and_replaces_all_old_web_layers(self):
        original_bytes = self.base.read_bytes()
        report = self.build()
        self.assertEqual((report["baseLayers"], report["replacedLayers"], report["totalLayers"]), (1, 4, 2))
        self.assertEqual(report["dockerLoadAndRun"], "not-run")
        self.assertEqual(report["imageTags"], ["fatebook:2.1.0-20261012T000000000Z-amd64", "fatebook:2.1.0-amd64"])
        self.assertEqual(report["releaseId"], "20261012T000000000Z")
        self.assertEqual(self.base.read_bytes(), original_bytes)
        files = archive_files(self.output)
        manifest = json.loads(files["manifest.json"])[0]
        config_data = files[manifest["Config"]]
        config = json.loads(config_data)
        self.assertEqual(manifest["Config"], "blobs/sha256/" + hash_bytes(config_data)[7:])
        self.assertEqual(config["config"]["Healthcheck"], self.config["config"]["Healthcheck"])
        self.assertEqual(config["config"]["Entrypoint"], self.config["config"]["Entrypoint"])
        for name, diff_id in zip(manifest["Layers"], config["rootfs"]["diff_ids"]):
            payload = files[name]
            self.assertEqual(name, "blobs/sha256/" + hash_bytes(payload)[7:])
            self.assertEqual(hash_bytes(gzip.decompress(payload)), diff_id)
        self.assertEqual(files[manifest["Layers"][0]], gzip.compress(self.layers[0], mtime=0))
        with tarfile.open(fileobj=io.BytesIO(gzip.decompress(files[manifest["Layers"][-1]]))) as layer:
            self.assertNotIn("usr/share/nginx/html/assets/old.js", layer.getnames())
            self.assertEqual(layer.extractfile("usr/share/nginx/html/index.html").read(), (self.dist / "index.html").read_bytes())
            self.assertEqual(layer.extractfile("etc/nginx/conf.d/default.conf").read(), self.conf.read_bytes())
            self.assertEqual(layer.extractfile(package.OPAQUE).read(), b"")
        index = json.loads(files["index.json"])
        self.assertEqual(len(index["manifests"]), 2)
        for entry in index["manifests"]:
            oci_bytes = files["blobs/sha256/" + entry["digest"][7:]]
            self.assertEqual(hash_bytes(oci_bytes), entry["digest"])
            self.assertEqual(len(oci_bytes), entry["size"])
            oci = json.loads(oci_bytes)
            for descriptor in [oci["config"]] + oci["layers"]:
                data = files["blobs/sha256/" + descriptor["digest"][7:]]
                self.assertEqual(hash_bytes(data), descriptor["digest"])
                self.assertEqual(len(data), descriptor["size"])

    def test_verify_detects_changed_build_input(self):
        self.build()
        (self.dist / "assets/new.js").write_bytes(b"changed after packaging")
        with self.assertRaisesRegex(ValueError, "字节不一致"):
            package.verify_image(self.output, self.dist, self.conf, self.base)

    def test_rejects_wrong_architecture_and_dependency_in_removed_layer(self):
        self.config["architecture"] = "arm64"
        self.make_base()
        with self.assertRaisesRegex(ValueError, "Linux/AMD64"):
            self.build()
        self.config["architecture"] = "amd64"
        self.layers[-1] = tar_bytes({"usr/sbin/important-runtime": b"must remain"})
        self.config["rootfs"]["diff_ids"][-1] = hash_bytes(self.layers[-1])
        self.make_base()
        with self.assertRaisesRegex(ValueError, "非网页依赖"):
            self.build()
        self.assertFalse(self.output.exists())

    def test_rejects_config_and_layer_digest_corruption(self):
        manifest = json.loads(self.base_files["manifest.json"])[0]
        self.base_files[manifest["Config"]] += b" "
        write_archive(self.base, self.base_files)
        with self.assertRaisesRegex(ValueError, "config.digest"):
            self.build()
        self.make_base()
        self.config["rootfs"]["diff_ids"][0] = "sha256:" + "0" * 64
        self.make_base()
        with self.assertRaisesRegex(ValueError, "diff_id"):
            self.build()
        self.config["rootfs"]["diff_ids"][0] = hash_bytes(self.layers[0])
        self.make_base()
        layer_name = json.loads(self.base_files["manifest.json"])[0]["Layers"][0]
        self.base_files[layer_name] += b"corrupt"
        write_archive(self.base, self.base_files)
        with self.assertRaisesRegex(ValueError, "blob.digest"):
            self.build()

    def test_rejects_outer_and_inner_traversal_without_extracting(self):
        self.base_files["../escape"] = b"unsafe"
        write_archive(self.base, self.base_files)
        with self.assertRaisesRegex(ValueError, "不安全路径"):
            self.build()
        self.layers[0] = tar_bytes({"../escape": b"unsafe"})
        self.config["rootfs"]["diff_ids"][0] = hash_bytes(self.layers[0])
        self.make_base()
        with self.assertRaisesRegex(ValueError, "不安全路径"):
            self.build()
        self.assertFalse((self.root.parent / "escape").exists())

    def test_rejects_source_symlinks_and_missing_history_boundary(self):
        (self.dist / "linked").symlink_to(self.conf)
        with self.assertRaisesRegex(ValueError, "符号链接"):
            self.build()
        (self.dist / "linked").unlink()
        self.config["history"][2]["created_by"] = "unknown application change"
        self.make_base()
        with self.assertRaisesRegex(ValueError, "网页层边界"):
            self.build()

    def test_reproducible_output_and_never_overwrites_base_or_package(self):
        self.build()
        original = self.output.read_bytes()
        second = self.root / "second.tar.gz"
        self.build(second)
        self.assertEqual(second.read_bytes(), original)
        with self.assertRaisesRegex(ValueError, "输出已存在"):
            self.build()
        with self.assertRaisesRegex(ValueError, "覆盖基包"):
            self.build(self.base)
        self.assertEqual(self.output.read_bytes(), original)

    def test_rejects_oci_descriptor_size_and_config_annotation_mismatch(self):
        self.base_oci["layers"][0]["size"] += 1
        self.attach_oci()
        write_archive(self.base, self.base_files)
        with self.assertRaisesRegex(ValueError, "大小不符"):
            self.build()
        self.make_base()
        index = json.loads(self.base_files["index.json"])
        index["manifests"][0]["annotations"] = {"config.digest": "sha256:" + "0" * 64}
        self.base_files["index.json"] = encode(index)
        write_archive(self.base, self.base_files)
        with self.assertRaisesRegex(ValueError, "config.digest 不符"):
            self.build()

    def test_verify_requires_both_rollback_and_stable_alias_in_docker_and_oci(self):
        self.build()
        original_files = archive_files(self.output)
        for missing in [0, 1]:
            files = dict(original_files)
            manifest = json.loads(files["manifest.json"])
            del manifest[0]["RepoTags"][missing]
            files["manifest.json"] = encode(manifest)
            write_archive(self.output, files)
            with self.assertRaisesRegex(ValueError, "回滚标签或稳定别名"):
                package.verify_image(self.output, self.dist, self.conf, self.base)
        files = dict(original_files)
        index = json.loads(files["index.json"])
        index["manifests"][0]["annotations"]["org.opencontainers.image.ref.name"] = "wrong-version"
        files["index.json"] = encode(index)
        write_archive(self.output, files)
        with self.assertRaisesRegex(ValueError, "回滚标签或稳定别名"):
            package.verify_image(self.output, self.dist, self.conf, self.base)
        self.assertEqual(package.release_tags("2.1.0", "2026-10-12T08:00:00+08:00")[0], "fatebook:2.1.0-20261012T000000000Z-amd64")


if __name__ == "__main__":
    unittest.main()
