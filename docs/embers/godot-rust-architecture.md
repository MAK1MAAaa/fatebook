# 余烬来信 Godot 与 Rust 架构规划

《余烬来信》的唯一开发路线为 **Godot 4 稳定标准版＋Rust＋GDExtension**。Godot 提供可视化场景、地图、动画、音频与界面；Rust 管理游戏规则和唯一的领域状态。地图 RPG 的七章内容、2D 正交探索、四人回合战斗和既定试玩范围继续采用现有内容规划。

本文件冻结模块职责、调用接口、状态流转与内容制作边界。它是未来工程的架构输入，不代表已经建立工程或实现绑定；本轮不安装开发资源、编译或运行游戏。具体 Windows 工具链与打包流程见 [Windows 开发交接](windows-development.md)，玩法与数值见 [系统与数据规格](systems-and-data.md)。

## 一 技术选择与职责

### 技术基线

| 项目 | 确定方案 |
| --- | --- |
| 引擎 | Godot 4 稳定标准版，使用支持 TileMapLayer 的 4.3 或以上 API |
| 玩法语言 | Rust stable，以 `rust-toolchain.toml` 锁定实际工具链 |
| 引擎绑定 | godot-rust 的 gdext 项目，Cargo 包 `godot`，通过 GDExtension 接入 |
| 图形 | 原生 2D、Compatibility 渲染；48×48 地图格，1280×720 布局基准 |
| 可视化制作 | TileMapLayer、TileSet、场景实例、Inspector、Control、AnimationPlayer 与音频节点 |
| 薄展示脚本 | 少量类型化 GDScript，承担输入、布局、碰撞反馈、动画和信号连接 |
| 首发目标 | Windows x86_64，Rust 目标 `x86_64-pc-windows-msvc` |
| 内容文件 | UTF-8 JSON 定义与稳定内容 ID；场景、贴图、声音使用 Godot 原生资源 |
| 玩法范围 | 传统指令回合 JRPG；不因引擎迁移增加 3D 地形、Sprite3D 或 HD-2D 工作包 |

GDExtension 是 Godot 的原生扩展机制；Rust 接入使用社区维护的 gdext，而不是引擎内置 Rust 脚本语言。实际启动开发时固定 Godot 编辑器、导出模板、GDExtension API、`godot` crate 与 Rust 工具链组合。编译目标 API 不得高于运行版本，不自动跟随主分支或新版依赖。[godot-rust 兼容规则](https://godot-rust.github.io/book/toolchain/compatibility.html)、[API 版本选择](https://godot-rust.github.io/book/toolchain/godot-version.html)

### 分层职责

| 层 | 负责内容 | 不承担的内容 |
| --- | --- | --- |
| Godot 场景与编辑器 | 绘图、碰撞、角色插值、UI、镜头、动画、音频、输入焦点 | 伤害、任务资格、奖励发放、结局条件和存档状态复制 |
| `embers-core` | 战斗、属性、培养、资源、装备、剧情、任务、事实、结局、域状态与序列化 | Godot 类型、文件 IO、帧更新、渲染和节点生命周期 |
| `embers-godot` | GDExtension 注册、JSON 边界、会话协调、主线程信号、资源读取与 SaveRepository | 第二套规则、未经 core 确认的奖励或直接改写剧情 |
| `embers-tools` | 内容合并、引用整理、发布目录清单、未来可自动执行的内容检查 | 正式玩家状态、运行中的场景操作和玩法结算 |

Rust 核心是普通领域库，保持可单独调用，不引入第二个游戏引擎或 ECS。GDScript 中允许保存光标位置、展开页签和动画队列；角色实际 HP、金币、人物生死和任务事实只来自 Rust。

## 二 工作区与依赖方向

### 未来工程目录

```text
EmbersLetter/
  design/                         冻结的设定与规格
  content/json/                   人工编辑的 JSON 内容定义
  game/
    project.godot                 Godot 工程入口
    scenes/                       世界、战斗、菜单与自动加载场景
    scripts/                      展示和交互薄脚本
    assets/                       正式导入的图像、声音、字体
    content/                      内容工具生成的运行目录
    extensions/
      embers.gdextension          原生扩展加载配置
      bin/windows/debug/          调试 DLL staging
      bin/windows/release/        发布 DLL staging
  rust/
    Cargo.toml                    workspace
    Cargo.lock                    实际依赖锁定
    rust-toolchain.toml            Rust 工具链锁定
    crates/
      embers-core/                lib
      embers-godot/               cdylib
      embers-tools/               CLI
  source-assets/                  素材源文件
  asset-register/                 素材来源与使用记录
  releases/                       Windows 发布包
```

上述目录是未来交接结构，本轮不创建其中的工程文件。现有 React 仓库继续保存历史原型与规划；正式 Godot 工程建立独立版本库。

依赖只沿 `embers-godot → embers-core`、`embers-tools → embers-core` 方向。`embers-core` 使用 `serde`／`serde_json` 表达内容与保存 DTO；只有 `embers-godot` 依赖 `godot`。初版不引入异步运行时、联网库、自制渲染器或第三方战斗框架。

`game/content/` 是从根 `content/json/` 生成的只读运行资料，不在两处分别维护同一选项或数值。内容工具与 core 使用相同类型定义，避免工具接受、游戏拒绝的两套格式。

## 三 唯一状态与命令结算

### 状态结构

| 状态 | 内容 | 是否存档 |
| --- | --- | --- |
| `ContentCatalog` | 章节、地图元数据、人物、技能、装备、敌群、任务、选择、结局、文本与资源引用 | 随游戏内容发布，存档只记版本与必要引用 |
| `CampaignState` | 人物、队伍、属性、培养、装备、背包、钱币、补给、药品、地图位置、任务、事实、奖励收据和年表 | 是，构成持久进度 |
| `BattleState` | 当前回合、角色战斗状态、敌方计划、目标计量、结果与临时回合回执 | 否，初版不恢复活动战局 |
| `RetryContext` | 战前角色与资源快照、遭遇定义、目标初值、准备点 | 否，活动挑战内存中保留 |
| `PendingCommit` | 已算出的候选状态、固定保存字节、目标槽、提交后待发布事件 | 否，仅处理本次保存失败 |
| Godot 展示状态 | 焦点、页签、角色视觉位置、音频和动画队列 | 不进入人生存档；偏好另存设置文件 |

Godot 的场景树不是玩家进度数据库，存档不包含 Node、RID、Gd、Callable 或运行中的动画对象。场景切换和读档后，根据 `CampaignState` 重建表现。

### 规则入口

核心采用 `resolve(previous, command, catalog)` 的单次结算语义：核对身份与前置 → 产生候选状态 → 生成领域事件与检查点意图。非法命令返回具体错误，原状态不变。

核心内部可以有分工明确的战斗、任务、资源与成长模块，但只有会话入口能够发布新状态。阶段变更、奖励和人物加入都使用内容登记的 ID；界面不能传入任意金额、属性或事实要求 core 接受。

| 命令类别 | 对外操作 | 内部效果 |
| --- | --- | --- |
| 会话 | `StartCampaign`、`ReturnToTitle` | 初始化独立 demo／full 人生，或丢弃未保存进度返回标题 |
| 地图 | `RecordPosition`、`MoveToMap`、`Interact` | 更新已完成步行的位置，核验出口与交互节点 |
| 对话与剧情 | `ChooseOption`、`AdvanceChapter` | 按登记内容写事实、推进任务、加入人物与跳时 |
| 战斗 | `StartBattle`、`SubmitTurn`、`RetryBattle`、`ReturnToPreparation` | 确定回合计划与目标结果，恢复一次战前快照 |
| 整备 | `AllocateTraining`、`SetParty`、`Equip`、`Buy`、`Rest` | 验证据点、费用、成员和学习资格后操作 |
| 收束 | `SelectWorldEnding`、`SelectLifeEnding` | 读取真实资格，产生世界与事业结果 |
| 仅 core 内部 | 推进任务、设置人物状态、发奖励、追加年表、记录事实 | 从已通过核验的剧情或遭遇定义导出，不作为界面任意写入 API |

普通位置或整备命令结算后即可发布。重大选择、危险区入口、章节交接与指定任务结算需要检查点：先将候选持久状态写入自动槽，成功后再替换当前状态并发出信号。保存失败保留 `PendingCommit`，显示失败原因并冻结领域推进；重试只写同一份字节，不重新调用规则入口。

手动保存以已发布状态创建固定快照。失败不回滚当前内存状态，也不覆盖上次有效存档；同样暂停新的领域操作直到重试成功，或玩家确认读旧档／返回标题。放弃待保存内容不被解释成已经撤销剧情，而是放弃未保存进度。

## 四 Godot 与 Rust 的统一接口

### 自动加载节点

Rust 注册一个继承 `Node` 的 `EmbersSession` 类，通过场景 `scenes/autoload/game_session.tscn` 自动加载为 `GameSession`。所有场景调用此节点，不各自建立规则库实例。[gdext 类注册](https://godot-rust.github.io/book/register/classes.html)

初版跨语言边界固定为 UTF-8 JSON 字符串，由桥接层在 `GString` 与 Rust DTO 之间转换。当前命令频率是交互、停格和回合结算，不在每帧发送完整人生；只有后续实际性能记录证明有问题才调整 FFI 形态。

### 公共方法

| 方法 | 参数 | 输出与作用 |
| --- | --- | --- |
| `initialize` | `catalog_json` | 装入已生成运行内容、核对结构与引用；不创建人生或读写存档 |
| `dispatch` | `command_json` | 核验封套和领域命令，返回接受、拒绝或待保存状态 |
| `get_view` | `view_kind` | 返回只读 DTO；允许 `session`、`world`、`battle`、`party`、`journal`、`endings` |
| `list_saves` | 无 | 返回五个手动槽与自动槽的元信息、兼容或损坏说明 |
| `save_slot` | `slot_id` | 保存当前人生至 `manual-1` 至 `manual-5`；不允许手动覆盖自动槽 |
| `load_slot` | `slot_id` | 读取合法 `manual-1` 至 `manual-5` 或 `auto`；完整核验后一次替换会话 |
| `retry_pending_save` | 无 | 重写尚未提交的固定保存内容，成功后发布一次 |

所有方法返回 JSON 字符串。`get_view` 与 `list_saves` 在保存失败期间仍可读取；`load_slot` 和 `ReturnToTitle` 是经界面明确确认后放弃未保存进度的恢复出口。活动战斗中禁用保存、读档和新人生；保存失败窗口不提供继续推进按钮。

### 命令封套

以下示例只说明协议，不是可执行代码。字段采用 snake_case，命令类型使用表中 PascalCase：

```json
{
  "protocol_version": 1,
  "session_id": "session-token",
  "command_id": "unique-action-id",
  "expected_revision": 12,
  "command": {
    "type": "ChooseOption",
    "choice_id": "c2-choice-sample",
    "option_id": "registered-option-id"
  }
}
```

`session_id` 在启动、新人生和读档时更新，隔离旧场景的过期动作；不把它作为人物或内容 ID。`command_id` 在一次用户操作中保持唯一，重复提交同一操作只返回原收据、不再次结算。`expected_revision` 防止使用已失效菜单操作当前状态。

响应最小字段为 `protocol_version`、`status`、`session_id`、`revision`、`data`、`error`。`status` 取 `accepted`、`pending_save`、`rejected`；`data` 承载请求的只读视图、槽位列表或初始化元信息，命令响应无额外数据时为 `null`；`error` 为 `null` 或含 `code` 与中文 `message` 的对象。读视图返回当前会话 ID 和版本，供展示层生成下一条命令。

错误区分协议不兼容、无效内容 ID、过期会话、过期版本、条件不足、保存待处理、存档不兼容和 IO 失败；不通过 panic 表示正常玩家错误。

### 信号

| 信号 | 内容 | 展示层行为 |
| --- | --- | --- |
| `state_changed(revision)` | 已正式发布的版本 | 请求当前页 DTO，更新 HUD、任务与角色状态 |
| `presentation_events(events_json)` | 有序事件批次，带会话、版本与事件 ID | 播放对话、伤害、防护、目标变化、结果和场景切换 |
| `save_status_changed(status_json)` | 保存中、成功、失败与待处理原因 | 锁定或恢复操作，显示保存反馈 |
| `content_error(error_json)` | 内容结构或引用错误 | 开发环境指明 ID 与来源；玩家环境停止进入无效内容 |

领域事件只经 `presentation_events` 发布一次，方法返回值不再复制一份可播放事件列表。读档发状态通知并重建当前场景，不重播历史战斗、奖励或关键选择。[gdext 信号注册](https://godot-rust.github.io/book/register/signals.html)

## 五 地图与可视化内容制作

### 地图场景

每张地图使用 Node2D 根节点、按地面／遮挡／装饰区分的 TileMapLayer、交互节点、出生点与出口。TileSet 维护碰撞和图块属性；Node2D 的排序与层级处理人物遮挡，不编写另一套瓦片渲染器。[TileMapLayer](https://docs.godotengine.org/en/stable/classes/class_tilemaplayer.html)

`WorldActor` 用 CharacterBody2D 完成四向格子移动与碰撞，Sprite2D 或 AnimatedSprite2D 表现角色，AnimationPlayer 表现场景变化。每步到达格中心后提交 `RecordPosition(map_id, grid_x, grid_y)`，core 核对当前地图、边界、相邻格与剧情封路条件后记录位置；不每帧跨语言同步。

普通墙体和场景碰撞归 Godot；任务封路、危险区准入和章节出口归 core。地图切换提交 `MoveToMap(exit_id)`，出口定义决定目标地图与出生点，界面不能通过任意 map_id 绕过剧情。

交互和存档只能在人物停格且位置已提交时执行。Godot 如遇位置提交被拒绝，以 core 最后合法位置恢复显示。存档保存 `CampaignState` 中的位置，不从临时节点读取未确认坐标。

### 交互场景

门、NPC、资源点和任务敌人通过可复用场景制作。Inspector 填写稳定 `interaction_id`、资源引用和表现参数；同一交互的前置、文本、选项、效果和首胜条件来自 JSON。

事件作者在 Godot 摆放对象与演出，在内容文件写 `StoryAction` 行动序列与条件。初版剧情行动包括显示文本、提供选择、开始遭遇、记录事实、推进任务、登记奖励、改变人物状态、请求演出、要求检查点和使用已登记出口；战斗中的 `ActionKind` 则定义攻击、防御、技能、物品及任务动作，两类定义分开。只允许有限的 `all`／`any`／`not` 条件组合，不将任意脚本字符串交给 Rust 执行。

过场请求带稳定演出 ID，Godot 播放动画与镜头；动画结束只返回演出结束通知，不重新发奖励。不可跳过的事实变更在 core 行动序列中执行，跳过动画不会跳过业务结果。文本、图像和声音引用可变，稳定 ID 与已发布的任务成果不得复用。

## 六 战斗状态与演出

### 从探索进入战斗

1. core 核验遭遇前置、人员、准备和首胜记录，按规则捕获战前快照。
2. 危险入口检查点成功保存后，建立内存中的 BattleState，发布战斗场景请求。
3. Godot 实例化 BattleScene，读取角色、敌人、背景、目标和意图 DTO。
4. 玩家为每名可行动角色选择动作；确认前允许修改指令。

保存的检查点仍是安全入口的人生状态。退出程序再读档时重新进入任务，不恢复半场战局或半回合动画。

### 一回合单次结算

`SubmitTurn` 包含本回合所有可行动角色的动作：actor_id、动作类别、技能／物品 ID 与目标 ID。core 核验次数与费用，按系统规格执行确定性顺序、状态、目标侧效与胜负，再生成有序事件批次。

救援、推进和抑制属于 `ActionKind` 的任务动作，不是三项隐藏可学技能。玩家技艺定义仍为 48 基础＋5 协作。协作技能的双人行动和费用检查在 core 进行，UI 不能让两个角色各自再行动一次。

Godot 根据事件顺序展示中间 HP、目标计量和效果。战局已由 Rust 结算，动画回调不再减血；暂时显示的中间数值是演出 DTO，不是第二份权威状态。演出期间展示层锁定新一回合提交，快速或减少动画模式只缩短播放。

敌方预告由当前 BattleState 的只读视图生成。场景只格式化标签，不根据动画猜测敌人将采取什么行动。伤害、状态时长、护送 HP、压力增长顺序和同回合失败优先级以系统规格为准。

### 战斗结束与恢复

普通失败保持活动 RetryContext，可以免费重试或返回准备，恢复同一次开战的人员、资源与目标初值。主动撤退按既定规则保留消耗并清除上下文；不把撤退当作免费资源恢复。

胜利在 core 一次结算等级补足、奖励、人物结果与年表；桥接层只提交一次检查点。失败重试、奖励窗口或保存重试都不能重新执行胜利。读档和离开战斗后不保留演出队列。

## 七 内容和资源的权威来源

`ContentCatalog` 使用剧情目录与系统目录中的规范 ID：地图 `c1-home`，遭遇 `c2-main-06`，技能 `fire-04`，装备 `weapon-01`，事实 `contact-address-kept`。不引入引擎数字槽位和第二套前缀别名。

地图目录保存稳定 map_id、场景资源键、合法出口、网格边界、交互引用和章节阶段。贴图、动画和声音通过资源键解析到 `res://` 路径；存档只保存稳定 ID，不保存可移动的磁盘绝对路径或 Godot 资源 UID。

源 JSON 人工编辑，未来内容工具输出运行 catalog、资源引用目录和结构报告。非法条件、缺失引用、错误人物阶段或重复奖励 ID 都指出原内容位置；加载失败不默认为空目录继续游戏。

导出后的 `res://` 可能位于 PCK 中。运行 catalog 由桥接层使用 Godot FileAccess 读取后交给 core，不能用 Rust `std::fs` 将 PCK 内资源当作普通目录打开。`std::fs` 只处理已转换为 OS 路径的玩家保存数据。[Godot 资源与用户目录](https://docs.godotengine.org/en/stable/tutorials/io/data_paths.html)

## 八 存档持久化与恢复

### DTO 和逻辑槽位

保存封套包含项目标识、`campaign_type`、`schema_version`、`content_version`、逻辑槽 ID、`save_generation`、保存时间与完整 durable CampaignState。玩家偏好独立保存，不随读取旧人生回退。

仍为 `manual-1` 至 `manual-5` 和 `auto` 六个逻辑槽位。demo 与 full 分目录，不能互相载入；网页历史存档不迁移。

SaveRepository 位于 `embers-godot`，启动时在 Godot 主线程通过 ProjectSettings 将 `user://saves/` 转成原生路径。core 只生成、解析并核验 DTO，不访问 Godot 路径或文件系统。

### 双代保存

每个逻辑槽保留 A／B 两个代际文件，例如 `manual-1.a.json` 和 `manual-1.b.json`。它们是同一槽位的当前记录与上一成功记录，不增加界面槽位。

1. 读取有效、兼容文件的 generation，确定当前代；缺失或损坏原文件保留其诊断信息。
2. 将新 DTO 固定为字节，generation 加一，只选择非当前代作为写入目标。
3. 在同目录写临时文件并完成 `sync_all`，此时不修改当前有效代。
4. 替换非当前代文件；只有这一过程成功才报告保存成功并发布候选人生。
5. 加载时选择完整、兼容的最高 generation；清理中断临时文件不被解释为载入其中进度。

该方案避免先删掉唯一有效存档，也不依赖 Windows 上把普通 rename 当作覆盖现有文件的跨平台保证。写失败不清除上一有效代；下一次重试仍使用同一候选字节。两个文件均损坏时隔离该逻辑槽，不覆盖其他槽。

发现较新结构或未知内容版本时提示不兼容，不通过忽略它、读取较旧一代后自动写回而覆盖新格式。发布补丁需要显式兼容规则和迁移步骤；原格式备份保留。

保存只在地图安全状态进行。手动存档失败时当前内存进度仍在，但后续命令暂停；旧手动档、自动档和有效代都保留。玩家确认读旧档或返回标题后清除 PendingCommit，重新建立 session_id，清除待播放事件。

## 九 线程和生命周期

首版在主线程调用 GameSession，短回合结算与小型存档同步完成；不为了目前规模增加多线程战斗。Godot 节点、信号、资源和窗口只在主线程访问。

派发回调不能立即递归调用新的 dispatch；展示层排队到下一次事件循环，桥接层保持一次提交标志。发布信号前释放 core 的可变借用，再允许监听者读取视图，避免信号回调重新借用会话。任何错误只返回错误 DTO，不能让正常内容错误或保存失败越过 FFI 触发 panic。

未来若将内容检查或重计算移到线程，只允许传递 owned Rust 数据；结果回主线程后发布，不把 Gd／Node 引用传进工作线程。编辑器 Inspector 预览只读内容，不初始化玩家人生、推进任务或触发保存。

首版关闭 DLL 热重载。重建扩展前关闭正在加载它的 Godot 编辑器与游戏，生成对应 debug／release DLL后放入 `res://extensions/bin/`，再启动工程；不将保留旧 DLL 的成功启动算作使用了最新规则。[扩展加载与二进制配置](https://docs.godotengine.org/en/stable/engine_details/engine_api/gdextension/gdextension_file.html)

## 十 实施顺序与未来验收

先冻结内容 ID 与领域类型，再完成纯 Rust 规则切片、DLL 加载和信号闭环，接着制作地图与战斗场景、剧情行动解释、菜单与保存，最后扩展为既定六图试玩。原有“两插件适配现成 RPG”的工作包由自建规则和场景工作包取代，需要在试玩后用实际投入重新估算完整制作量。

后续验收分别覆盖：core 的确定性和合法命令；桥接的 DTO、过期动作、单次事件与主线程；内容与场景引用；双代存档和失败恢复；DLL staging 与离线 Windows 包。具体命令与阶段交付见开发交接，本轮不执行。

架构迁移不改变 40 张地图、42 场主线、14 场可选、14 场关键包含在主线、48＋5 技能、30 装备、人物加入、悲剧风险与结局资格。需要调整业务规格时单独修改对应规划，不能将规则差异隐藏在 Godot 动画或桥接层中。
