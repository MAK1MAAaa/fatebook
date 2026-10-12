# 卡牌收藏与移动界面设计参考

调研日期：2026-10-10。资料用于信息架构参考，本游戏不复制其他游戏素材或经济系统。

## 已核对的官方资料

- [Hearthstone：Managing the Collection Manager](https://hearthstone.blizzard.com/en-us/news/21790299)：收藏支持费用、拥有数量、缺失卡与卡牌关键词组合检索。这里转化为中文筛选控件及机制关键词搜索，不要求输入命令。
- [MTG Arena Reprint and Card Style Improvements](https://magic.wizards.com/en/news/mtg-arena/upcoming-improvements-to-reprints)：同名卡使用折叠堆叠，展开时区分不同版本并显示编入数量。这里借鉴展示方式，普通与强化仍是独立实体卡，保留原 UID 和真实牌效。
- [MTG Arena：Dev Diary: Improving Reprints](https://magic.wizards.com/en/news/mtg-arena/dev-diary-improving-reprints)：改动收藏表示时需要兼顾库存、牌组验证与界面。这里采用展示层聚合，不转换现有存档库存结构。
- [Legends of Runeterra：The Path of Champions](https://playruneterra.com/en-us/news/game-updates/the-path-of-champions-in-depth-look/)：官方 PvE 设计结合遭遇、盟友、卡牌奖励和地区入口。这里用于组织任务／组牌／同伴入口，保留现有七章流程。
- [无职转生动画官方人物资料](https://mushokutensei.jp/character/?chara=4&series=1st)：原作人物外貌和年代的核对入口。立绘为原创同人绘制，普通敌人与考官形象为原创 IF。

## 本次应用

收藏默认以基础卡 ID 聚合；牌组数量与拥有数量分别展示。卡牌详情可对比普通和强化版本、实际效果、机制及获得条件。当前牌组与收藏分别有独立入口，手机一次聚焦一个列表；费用分布和构筑预设按需查看。

完整图鉴列出96种卡牌，未获得／其他身份专属卡可查看但不能编入。解锁条件以正式引擎为准，不使用原卡牌背景文案推断不存在的任务。

只折叠长文、历史和维护信息；当前目标、费用、核心牌效、敌方意图、条件、保存错误与不可逆警告直接显示。默认列表不逐副本展开，也不嵌套三层折叠。

立绘采用统一暖色动漫风，以注册表绑定固定人物、年龄和敌人 ID；按实际显示尺寸选择缩略图／大图，图片失败时保留原 SVG。生成服务仅用于开发素材，部署后游戏不调用在线生成接口。
