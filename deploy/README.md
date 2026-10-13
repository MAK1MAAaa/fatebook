# 命运之书：1Panel 完整 Docker 镜像部署

推荐使用 `fatebook-docker-应用版本-时间戳-架构.tar.gz`。它是经 gzip 压缩的完整 Docker 镜像，包含 Nginx、构建好的网页和全部剧情；服务器导入后即可创建容器，无需拉取其他镜像、安装 Node.js 或数据库。宿主机和容器端口均为 **6657/TCP**，无需目录挂载。

2.1应用继续使用2.0剧情与原存储键，兼容读取容器格式2与3，首次有效写入升级为3。旧卡牌人生继续原规则，可在地区主动确认更新；旧文字版人生仍只读。游戏存档在玩家浏览器的 localStorage 中，镜像及服务器备份不包含个人存档。建议在正式游玩前确定长期使用的域名、协议和端口。

## 1. 选择架构并上传

在服务器终端运行 `uname -m`，选择对应镜像包：

| 服务器输出 | 选择的文件后缀 | 常见服务器 |
| --- | --- | --- |
| `x86_64` | `-amd64.tar.gz` | Intel／AMD 的 x86 云服务器 |
| `aarch64` 或 `arm64` | `-arm64.tar.gz` | ARM64 云服务器 |

每个架构独立打包，只需上传对应的一个镜像包。架构以服务器为准，不以本地开发电脑为准。

1. 在 1Panel **文件** 中进入一个方便保存发布包的目录，例如 `/opt/fatebook-images`，上传 `.tar.gz`。单文件发布不需要其他文件；如果发布包附带 `.sha256` 或 `.metadata.json`，可一起保存。
2. 如果收到同名 `.sha256` 文件，可在服务器终端切换到上传目录进行校验。将下面文件名替换为实际名称：

   ```bash
   cd /opt/fatebook-images
   sha256sum -c fatebook-docker-2.1.0-实际时间戳-amd64.tar.gz.sha256
   ```

   应显示 `OK`。本次单文件发布可跳过这一步；镜像标签可在导入完成后查看。

3. 进入 **容器 → 镜像 → 导入**，选择服务器上已上传的 `.tar.gz` 文件，等待导入完成。无需先解压，也不要将压缩包当作网页目录部署。
4. 导入后镜像列表应出现 `fatebook` 的时间戳版本标签，以及 `fatebook:2.1.0-amd64` 或 `fatebook:2.1.0-arm64` 别名。具体名称以随包 JSON 和导入日志为准。

1Panel 镜像导入对应 `docker load`；Docker 可直接读取 gzip 压缩的镜像包并恢复镜像及标签。参见 [1Panel 镜像文档](https://1panel.pro/docs/v2/user_manual/containers/image/) 和 [Docker load 文档](https://docs.docker.com/reference/cli/docker/image/load/)。

## 2. 在 1Panel 创建容器

进入 **容器 → 容器 → 创建容器**，按以下参数配置；不同版本的面板文字可能略有不同：

| 项目 | 设置 |
| --- | --- |
| 容器名称 | `fatebook` |
| 镜像 | 选择刚导入、与服务器架构一致的 `fatebook` 时间戳版本标签 |
| 镜像拉取 | 使用本地镜像；若有强制拉取选项，关闭它 |
| 网络 | 默认 `bridge` |
| 端口 | 宿主机 `6657` → 容器 `6657`，协议 `TCP` |
| 重启策略 | `unless-stopped`（除非手动停止，否则自动重启） |
| 挂载、环境变量 | 留空 |
| 启动命令、入口点 | 保持镜像默认值 |

创建并启动后，等待健康状态变为 `healthy`，访问 `http://服务器IP:6657/`。外网直接访问时，在云安全组和适用的主机／Docker 防火墙规则中允许 TCP `6657`。容器管理入口参见 [1Panel 容器文档](https://1panel.pro/docs/v2/user_manual/containers/container/)。

服务器终端可验证：

```bash
curl -fsS http://127.0.0.1:6657/healthz
docker exec fatebook nginx -t
docker logs --tail=100 fatebook
```

健康接口应返回 `ok`。再从浏览器检查首页、创建角色、接取任务、出牌、刷新后继续当前回合。健康检查只确认服务和入口文件可用，不能替代玩法验收。

## 3. 可选：通过编排部署

镜像导入后，也可在 **容器 → 编排 → 创建 → 编辑** 中粘贴源码里的 `deploy/docker-compose.yml`，或上传该文件后用“路径选择”。这与上一节创建容器二选一，避免重复占用端口。

编排默认使用本地 `fatebook:2.1.0-amd64`，设置 `pull_policy: never`，不会访问镜像仓库。ARM 服务器应将 `image` 改为导入的 `fatebook:2.1.0-arm64`；需要固定版本时，直接填写时间戳标签。也可通过编排环境变量 `FATEBOOK_IMAGE` 指定完整镜像名。

纯命令行备用方式如下；不要同时在面板和终端重复创建同一服务。先替换为实际包名，再执行：

```bash
docker load -i fatebook-docker-2.1.0-实际时间戳-amd64.tar.gz
docker run -d --name fatebook --pull=never \
  --restart unless-stopped -p 6657:6657 \
  --log-opt max-size=10m --log-opt max-file=3 \
  fatebook:2.1.0-amd64
```

已通过面板创建的容器或编排继续由面板管理。

## 4. 域名、HTTPS 与存档

若要使用域名，在 1Panel 网站功能中配置反向代理，代理根路径 `/` 到游戏的 `6657` 端口，再申请或导入证书，启用 HTTPS。

| OpenResty 网络模式 | 代理地址 |
| --- | --- |
| `host`，与宿主机共用网络 | `http://127.0.0.1:6657` |
| `bridge` 等独立容器网络 | `http://宿主机可达地址:6657`，使用从 OpenResty 容器内能访问的内网／网关地址 |

独立容器里的 `127.0.0.1` 指向它自身。先确认代理容器可以访问游戏，再保存配置。HTML 不应在反向代理额外长期缓存。

使用 `host` 网络的 OpenResty 且仅通过域名提供服务时，可把游戏端口绑定改为 `127.0.0.1:6657:6657`。桥接网络需要保留代理能够访问的监听地址。

`http://IP:6657`、`http://域名` 和 `https://域名` 是不同的浏览器站点来源；从原端口切到 `6657` 也会改变来源。存档不会自动迁移或跨设备同步，旧地址的数据不会因部署而删除。当前游戏没有存档导出／导入功能；不要通过清除站点数据解决资源缓存问题。

## 5. 更新与回滚

1. 导入对应架构的新镜像包，保留旧的时间戳版本镜像和发布包。
2. 记录当前容器／编排使用的完整镜像标签、端口及代理配置。
3. 在 1Panel 将镜像改为新时间戳标签，并**重建容器**。若面板没有修改镜像入口，停止并删除旧容器，再按原配置创建新容器；服务会短暂停止。仅点击“重启”不会切换到新镜像。
4. 检查健康状态、日志和正式访问地址；提示玩家刷新已打开的游戏标签页，使页面和新资源一致。

如更新异常，将镜像标签改回保留的旧版本并重建容器。不要依赖 `2.1.0-amd64` 等稳定别名回滚，它会随同应用版本的新打包被更新；历史时间戳标签才对应固定构建。

只要访问地址不变，正常替换容器不会清空浏览器存档。但剧情版本或存档格式变化需要兼容处理，服务器回滚也不会回滚浏览器已经写入的数据。2.1写入格式3后，2.0客户端会拒绝继续写入，因此旧镜像回滚不能作为存档降级；需要保留兼容格式3的2.1构建。规则迁移也不能回退。镜像内只保留本次构建资源，更新后仍打开旧页面的客户端应刷新。

## 6. 从源码重新打包

2026-10-13 更新包含全部96张卡的出牌特效，应用2.1.0、剧情2.0.0、存档容器格式3保持；旧2.0规则可继续，主动迁移仅允许地区且没有战局或奖励。最新单文件为 [fatebook-docker-2.1.0-20261013T022420000Z-amd64.tar.gz](../release/fatebook-docker-2.1.0-20261013T022420000Z-amd64.tar.gz)，约36.80MiB。导入后选 `fatebook:2.1.0-20261013T022420000Z-amd64` 重建，映射6657:6657。实际检查结果见 [2.1验证记录](../docs/rpg-verification.md)。已完成出牌特效本地浏览器视口验收与归档结构／构建字节核对，本轮没有启动游戏容器、冷导入或实体手机验收。旧发布包保留。

本机没有运行Docker服务时，可用已有完整AMD64归档复用相同Nginx/Alpine运行层，替换网页与配置后输出新的完整镜像包：

```bash
npm run lint
npm test
npm run build
python3 scripts/package-docker-offline.py \
  --base release/fatebook-docker-2.0.0-20261010T082644734Z-amd64.tar.gz \
  --created-at 2026-10-13T02:24:20.000Z \
  --output release/fatebook-docker-2.1.0-20261013T022420000Z-amd64.tar.gz
```

离线方式校验原镜像配置与全部运行层、生成新镜像配置和标签，并核对网页与配置逐字节一致；不启动或修改任何现有容器。此命令拒绝覆盖已存在的包，再次发布时更换时间和输出文件名。把 `--output` 换成 `--verify` 可只复核成品。成品仍需在服务器导入验收。

Linux/AMD64 单文件发布使用 `npm run package:amd64`：执行静态检查、自动测试和生产构建，只生成完整镜像的 `.tar.gz`，不会启动验证容器，也不会生成额外的校验文件或清单。仅重新导出已经构建好的网页时可执行 `node scripts/package-docker.mjs --arch=amd64 --archive-only`。

本地需要 Node.js 22.12+、npm、已运行的 Docker，以及支持目标架构的 Docker Buildx。默认分别构建 `linux/amd64`、`linux/arm64`；Docker Desktop 通常提供跨架构构建所需环境，其他环境需要相应的构建器支持。首次构建需要联网获取基础镜像；服务器导入成品包无需拉取镜像。

```bash
npm ci
npm run package:1panel
```

只构建一种架构：

```bash
npm run package:1panel -- --arch=amd64
# ARM64 服务器使用：
npm run package:1panel -- --arch=arm64
```

命令依次执行 lint、测试、生产构建及镜像打包，产物保存在 `release/`。镜像包由 Docker 镜像导出后 gzip 压缩，附 `.tar.gz.sha256` 校验文件和 `.tar.gz.metadata.json` 清单。开发服务、预览服务和部署端口均为 `6657`，同时运行时会冲突，请先停止占用端口的服务。

## 7. 可选：静态文件发布包

`npm run package:static` 保留了轻量的静态发布方式，生成 `fatebook-1panel-时间戳.tar.gz` 及其校验文件。此包**不是 Docker 镜像**，不能通过镜像导入功能载入；它需要服务器联网拉取官方 Nginx 镜像。

将静态包解压到 `/opt`，得到 `/opt/fatebook/`，其中包含 `site/`、`nginx.conf`、`docker-compose.yml`、`SHA256SUMS` 和 `release.json`。先校验外层 `.sha256`，再在该目录执行 `sha256sum -c SHA256SUMS`，随后在 1Panel 通过该 `docker-compose.yml` 创建编排。源码中对应的是 `deploy/docker-compose.static.yml`，打包时重命名为 `docker-compose.yml`。端口同样为 `6657:6657`。

静态编排的挂载路径固定为 `/opt/fatebook/site` 和 `/opt/fatebook/nginx.conf`。修改安装位置时须同步改两处路径；更新时先备份整个旧目录，将新包部署为完整目录，再重建容器，避免旧的 bind 挂载继续使用被替换的目录。需回滚时恢复完整备份及对应编排并重建。不要同时启动静态版和完整镜像版占用同一端口。

## 8. 常见问题

| 现象 | 检查方法 |
| --- | --- |
| 手机 HTTP 页面提示 `crypto.randomUUID is not a function` | 2026-10-09 修复了 2.0 开局对该 API 的直接调用。导入本次修复镜像，用新时间戳标签重建容器，再刷新页面。HTTP 下可以正常创建人生，访问地址不变时现有 2.0 存档继续兼容；不要清除站点数据。 |
| 导入失败、压缩包损坏 | 先核对 `.sha256`；确认导入的是 `fatebook-docker-*.tar.gz`，而非静态包。终端也可用 `docker load -i 文件名.tar.gz`。 |
| `exec format error` | 导入了错误架构；运行 `uname -m`，选择对应包重新导入并重建。 |
| 尝试从仓库拉取 `fatebook` | 确认镜像已导入，名称／标签完全一致，关闭强制拉取；编排保留 `pull_policy: never`。 |
| `port is already allocated` | `6657` 已被其他容器、开发服务或预览服务占用；先查明并停止旧的同一游戏服务。 |
| 服务器本机能打开，外网打不开 | 检查端口映射是否为 `6657:6657`、云安全组和主机／Docker 防火墙规则。 |
| 域名返回 502 | 检查容器健康状态，并从 OpenResty 网络验证上游地址；桥接容器的 localhost 不是宿主机。 |
| 更新后白屏或资源 404 | 刷新页面，检查是否已重建为新镜像；清除代理中的 HTML 缓存，保留浏览器站点数据。 |
| 存档不见了 | 核对协议、域名／IP、端口、设备及浏览器是否与原来一致。容器重建不会自动删除 localStorage。 |

本文提供操作和验收步骤；具体构建与运行验证结果以项目验证记录及本次交付说明为准。
