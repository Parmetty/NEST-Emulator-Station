# Nest

一台“组装起来的虚拟主机”：把各世代主机的照片、游戏库、模拟器引擎、存档和手柄收进一个
Electron 外壳里，交互按主机系统的逻辑来，而不是按桌面文件的逻辑来。

当前处于 **P0（骨架）**：窗口、IPC、引擎清单、进程监管、假引擎、单元测试已经跑通，
首页 UI 已经接真实数据。

## 快速开始

```bash
npm install
npm run build
npm run start          # 正常机器
```

在**写入受限的环境**（比如 DSH 沙箱，进程无法写 %APPDATA%）里，用工作区内的数据目录：

```bash
npm run start:here     # electron . --no-sandbox --user-data-dir=.profile
npm run smoke          # 无头自检：窗口 + IPC + 渲染是否就绪
npm run shot           # 把窗口截成 shots/app.png（不依赖桌面）
```

## 目录

```
src/
  shared/       纯数据与契约（system 目录、zod schema、IPC 通道名）
  main/         主进程：窗口、IPC、JSON 库、引擎清单、进程监管
  preload/      contextBridge 暴露的 window.nest
  renderer/     React 首页（照片墙 + 时间线 + 信息卡 + 确认框）
resources/engines/*.json   引擎清单（加一台主机 = 加一份 JSON）
tools/
  fake-engine.mjs         假引擎：不需要 ROM 也能跑通启动/崩溃/挂起三条路径
  run.mjs                 启动器：清掉 ELECTRON_RUN_AS_NODE 再拉起 electron
  mini-electron.cjs       最小窗口探针，排查环境问题用
  diagnose.ps1            环境诊断（系统信息 + 4 组启动参数 + 分段日志）
docs/mock-v1/              视觉基准（首版样张，冻结）
tests/                     引擎清单、参数构建、进程生命周期
```

## 设计约定

- **引擎是数据**：`resources/engines/<id>.json` 描述路径、参数、能力。加主机不改代码。
- **进程外运行**：模拟器永远是子进程，UI 不会被它拖死；退出/崩溃都有事件。
- **IPC 全量校验**：渲染进程只拿到 `window.nest`，所有入参走 zod。
- **库先落 JSON**：`userData/library.json`，原子写（tmp + rename）。P1 换扫描器和 sqlite 时接口不变。
- **不内置版权物**：没有 ROM、BIOS、NAND、密钥；引擎也只做探测 + 官方链接。

## 测试

```bash
npm test        # 10 个用例：清单校验、参数替换、启动/崩溃/系统模式/强杀
npm run typecheck
```

## 已知环境坑

| 现象 | 原因 | 处理 |
|---|---|---|
| `electron --version` 正常，但一开窗口就 `0xC0000005` | 默认 userData 在 `%APPDATA%`，沙箱内写不进去 | 用 `--user-data-dir` 指到工作区（`npm run start:here`） |
| 窗口起来了但什么都不显示 | 全局 `ELECTRON_RUN_AS_NODE=1`，electron 当 node 跑了 | `tools/run.mjs` 会清掉它 |
| 截图里动画没走完（照片/面板透明） | 窗口未真正显示时合成器被节流 | 用 `--shot`，它会先切到静止帧再截 |
