# 当前状态

> 新会话开场只需读这一份，再读 `PLAN.md` 与 `DECISIONS.md`。

## 进度

| 阶段 | 状态 |
| --- | --- |
| P0 骨架 | ✅ 完成 |
| P1 扫描器 + GBA 全链路 | ✅ 完成 |
| P2 多系统闭环 | 下一步 |
| P3–P5 | 未开始 |

## P1 交付

- `src/main/scanner.ts`：递归扫描、扩展名映射、sha1 流式计算、标题清洗
- `Store`：`games[]`、按哈希去重、`recordSession(systemId, at, gameId)`
- IPC：`nest:games`、`nest:scan`（可选目录对话框）、`launch` 带 `rom`
- 游戏库界面：卡片墙、键盘网格导航、空状态、扫描按钮
- 端到端自检：`--selftest`（扫描 → 启动 → 引擎退出 0 → 最近游玩写入）

验收命令：

```bash
npm run build
NEST_FAKE_ENGINE=1 node tools/run.mjs . --no-sandbox --user-data-dir=.profile \
  --scan=.testroms --selftest
# -> [nest] selftest ok: launched "Advance Wars", engine exited 0, lastPlayed recorded
```

## 已完成

- Electron 外壳：窗口、preload、IPC（zod 校验）、单实例数据目录
- 15 份引擎清单（9 台任天堂 + 6 个预留平台）
- 进程监管：启动 / 运行 / 正常退出 / 崩溃 / 强杀，全部有事件
- JSON 库：原子写、收藏、最近游玩
- 首页：四区布局、时间线排序、平台切换标尺、确认框、键鼠双通道（接真实 IPC）
- 诊断开关：`--smoke`、`--shot`、`--dump`
- 视觉基准：`docs/mock-v1/`
- 测试 10 条 + 类型检查 + 构建

## 下一步（P2）

1. FC / SFC / N64 的扫描与启动闭环（引擎清单已就绪，缺固件校验）
2. DAT 匹配（No-Intro SHA-1）与标题修正
3. 每游戏覆盖设置（分辨率 / 滤镜 / 控制器）
4. 存档备份：电池存档与即时存档的目录约定

## 环境坑（本机）

| 现象 | 处理 |
| --- | --- |
| 开窗口即 `0xC0000005` | 数据目录不能落 `%APPDATA%`，用 `--user-data-dir=.profile`（`npm run start:here`） |
| electron 当 node 跑 | 全局 `ELECTRON_RUN_AS_NODE=1`，`tools/run.mjs` 负责清掉 |
| 截图里动画没走完 | 用 `--shot`，先切 `.still` 静止帧再 `capturePage` |
| `npm install` 卡在 Electron 下载 | 设 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` |

## 验证命令

```bash
npm run typecheck
npm test
npm run build
npm run smoke        # 退 0 且打印 "smoke ok: renderer rendered"
npm run shot         # 产出 shots/app.png
```

## 未决问题

- 系统模式启动参数（Dolphin `-b`、Cemu 菜单）尚未在真引擎上验证，等有 NAND/MLC 的机器
- 封面抓取源（ScreenScraper / IGDB）未选型，P5 再定
- 打包与自动更新（P5）：NSIS + 便携版，注意引擎不随包
