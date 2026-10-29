# 0.3.1 方案评审（只读调查阶段产出）

> 状态：**待用户批准，未动任何代码**。本文件汇总三个只读调查的结论与方案，批准后按「执行顺序」串行落地。
> 约束：本机单屏，任何 GUI 验证只能串行、由 Lead 执行；agent 只准在锁定的写入范围内改文件，不许跑 GUI、不许 git。

---

## 0. 背景：0.3.0 便携包的缺陷（已确认）

`dist/Nest-0.3.0-portable.zip`（已交付手工版）里混入了打包后又跑测试写回的运行时状态：

```
resources/engines/melonds/melonDS.toml
  [Emu] ExternalBIOSEnable = true
        DirectBoot = false
  [DS]  BIOS7Path = "E:/workstop/nest-portable/data/melonds/bios/bios7.bin"   ← 制造者机器路径
resources/engines/mgba/.nest-controls-v1
resources/engines/mgba/config.ini.before-nest
resources/engines/mgba/qt.ini          ← [mru] 里残留 E:\workstop\nest-assets\roms\...
```

**后果**：别人解压后 NDS **直读**会走“外部 BIOS + 不直接启动游戏”的分支，而 BIOS 路径不存在 → 很可能固件报错/黑屏，而不是直接跑 ROM。
**根因**：`clean-engines` 只在打包前跑；之后又在便携目录里启动验证，引擎把配置写回 `resources/engines` 后才压缩。
**修复**：组装顺序改为「先清、后组装、再从组装结果打包」，压缩前对 zip 成员做断言（无 `.toml/.ini/.nest-controls-*/before-nest`、无 `E:\workstop` 字符串）；验证在**解压副本**里做，不碰待压缩目录。

---

## 1. 封面黑帧（COV-2）— nest-cover 方案

### 现状机制（已核实）

1. supervisor 发出 `running` → `index.ts` 的 `boot()` 回调先 `clearShots()` 清 `<userData>/shots/*.png`，再 `startShotHelper()` 启动 `resources/tools/nest-capture.exe`（`--pid --out --interval 5000 --max 60 --log` + 清单里的 `capture*` 裁剪参数）
2. 抓屏工具每 5 s 轮询目标 pid 的 `MainWindowHandle`：窗口须可见、非最小化、前台且未被遮挡，否则 `skipped frame`
3. 抓到的画面按顺序裁剪：DPI 缩放 → `captureCropTop/Bottom`（去掉菜单/状态栏）→ `captureAspect`+`captureAnchor` → `captureContentAspect`（居中裁黑边）→ `captureTopOnly`（高度减半），存 `shot-*.png`，最多留 60 帧
4. 引擎 close → `finishCoverCapture()`：kill helper → `newestShot()`（**只按 mtime 取最新一张**）→ `copyFile` 到 `covers/<gameId>.png` → `store.updateGame({cover, coverAt})` → `clearShots()`

### 黑帧根因

选帧**没有任何内容判据**：最后一帧落在黑过渡/纯白初始化帧时就原样成为封面。NDS GTA 那次 906 B / 317×237、全通道 `mean=std=0`；`capture.log` 显示同一会话其实存过 3 帧可用画面，全被丢弃。窗口就绪前还会产生 61×46 纯白帧，也会被选中。

### 方案

**C# 侧（`NestCapture.cs`）**：每帧保存时顺带算统计（bitmap 已在内存，成本≈0）并追加 sidecar JSONL（`--stats <shots>/stats-<sessionId>.jsonl`）：

```
{file, w, h, mean, stddev, nonblack(占比), colorful(max-min>24 占比), t}
```

**Nest 侧（`index.ts`）**：`pickBestShot()` 评分选帧

```
score = 0.55*nonblack + 0.30*min(stddev/48, 1) + 0.15*colorful
```

排除“空白帧”：纯黑（nonblack<2% 且 std<4）、近均匀（std<1.5）、纯白（mean>245 且 std<6）、过小窗口（<160×120）；同分取新。

**兜底**：全部空白 → 不 `copyFile`、不 `updateGame`，保留旧封面，日志写 `cover kept: all N frames blank`；sidecar 缺失（旧 exe / 旧包）→ 回退现有 `newestShot`，行为完全不变。

**清理**：sidecar 按 sessionId 隔离，在 `finishCoverCapture` 的 finally 里随 `clearShots()` 一起删（`clearShots` 现在只删 `.png`，需扩展）。

### 验证（不靠前台截屏）

- 纯函数 `pickBestShot` 用固定 stats 数组做单测（需批准新增 `tests/cover.test.ts`）
- 对 `covers/*.png` 用 Pillow 算 `mean/std/nonblack/colorful`，与 sidecar 断言“选中帧得分最高”
- 真机两次串行验证：NDS GTA（黑场景 → 封面非全黑）+ GBA（正常场景回归）

### 风险

- 行为从“最后一帧”变成“最佳帧”，属改善；mGBA/GBA 正常帧分数高，必被选中
- “全黑保旧图”只在异常时生效，不删任何图
- Dolphin 124px 警告弹窗本来就被 `captureMinHeight` 跳过
- 并发多开共用 `shots` 目录是既有问题，不恶化

**写入范围**：`src/main/index.ts`、`tools/capture/NestCapture.cs`、`tools/build-capture.ps1`（+ 可选 `tests/cover.test.ts`）。

---

## 2. 免安装版一键构建 + 自动验证 — nest-release 方案

### 步骤序列

```
npm run build                          src/ → out/
node tools/clean-engines.mjs           清 resources/engines 运行时状态；发现本地路径则 exit 1
electron-builder --win --x64 --dir     out/+package.json → dist/win-unpacked/
                                       （Nest.exe、resources/app.asar、resources/engines、resources/tools）
rm -rf dist/win-unpacked dist/portable 旧产物   ← 必须先清，7za 是增量更新
cp -r dist/win-unpacked dist/portable/Nest-<version>/
   + 3 个模板（启动 Nest.bat、便携数据模式.bat、使用说明.txt）
7za a -tzip -mx=1 -y dist/Nest-<version>-portable.zip *   （cwd 在便携目录内，保证解压平铺）
sha256 → dist/checksums.txt
```

### 必须的环境

```
ELECTRON_BUILDER_CACHE=E:\workstop\nest\.cache\electron-builder
ELECTRON_CACHE=E:\workstop\nest\.cache\electron
TEMP=…\.cache\tmp   TMP=…\.cache\tmp
```

原因：受限账户写不了 `%LOCALAPPDATA%`/系统 TEMP，electron-builder 解 winCodeSign/nsis、app-builder 临时文件会失败；`electronDist` 已指本地 Electron，无需联网。子进程要清 `ELECTRON_RUN_AS_NODE`（本机全局=1，否则 Electron 被当 node 跑）。

### 打包内容断言（新增，防本次事故复现）

- 必须含：`Nest.exe`、`resources/app.asar`、5 个引擎目录 + 5 份 `*.json` 清单、`resources/tools`（5 个 exe + SDL3.dll）、3 个启动/说明文件
- 必须排除：`data/`、`*.toml`/`*.ini` 运行时状态、`.nest-controls-*`、`*.before-nest`、任何含 `E:\workstop` 的文本文件
- 版本号唯一来源 `package.json` 的 `version`；目录名 / zip 名 / checksums 三者一致断言

### 自动验证（`tools/verify-portable.mjs`）

1. 解压 zip 到临时目录
2. `Nest.exe --no-sandbox --user-data-dir=<tmp>\data --smoke` → 断言退出码 0 + 日志 `smoke ok: renderer rendered`
3. `--scan=E:\workstop\nest-assets\roms\gba --trylaunch=gba --hold=10000` → 断言退出码 0 + `trylaunch ok`
4. 断言 `data/covers/*.png` ≥1 且 `library.json` 对应 cover 非空（纯黑帧 906 B 作为 warning，像素质量归 COV-2）
5. 结束后 `taskkill` 清理 Nest/mGBA 残留

### 风险

- 重复构建残留会混包（必须 rm -rf 旧目录/旧 zip）
- 全流程约 3–6 min，dist 需 ~1 GB 余量（当前空闲 53 GB）
- 正式出包必须等其他代码改动收尾后重跑（不能打进中间态）

**写入范围**：`tools/build-portable.mjs`、`tools/verify-portable.mjs`、`tools/portable/**`、`package.json` scripts。

---

## 3. ares 键盘绑定（INP-2）— 待补

nest-eng 尚未交回完整方案（只完成了环境探针，未产出结论）。已知事实：

- ares 源码 `desktop-ui/input/input.cpp`：`assignment = identifier + "/" + groupID + "/" + inputID`；token[0] 不以 `0x` 开头时必须 **4 段**（identifier 自身含 `/`），所以 `Keyboard/0/40`（3 段）被直接忽略
- 已试候选 `0x0/0/40`（deviceID=0、group=0、SDL scancode Enter）实测无效
- 最可靠路径：在一次受控 GUI 实验里用 ares 自己的设置界面手动绑一组键 → 退出 → diff `settings.bml` 得到真实编码
- 该实验需要独占桌面，只能由 Lead 执行

**计划**：Lead 先做实验拿格式 → 再把「写 settings.bml 的 `ensureAresControls`」交给 nest-eng 实现（写入 `src/main/ipc.ts`，参照 `ensureMgbaControls` 的“只写一次 + `.before-nest` 备份”模式）。

---

## 4. 执行顺序（待批准）

| # | 任务 | 写入者 | 验证者 | 需要 GUI |
|---|---|---|---|---|
| 1 | 重打干净便携 zip（修 NDS 隐患 + 内容断言） | nest-release | Lead | 否 |
| 2 | 打包自动化 `npm run portable` / `verify:portable` | nest-release | Lead | 否 |
| 3 | 封面黑帧修复 | nest-cover | Lead（串行 2 次） | 是 |
| 4 | ares 键位：实验 → 实现 → 文档 | Lead 实验 → nest-eng 写 | Lead | 是（1 次） |

纪律：每个任务开始前由 Lead 在任务板上锁定写入范围；agent 不跑 GUI、不做 git；完成后 Lead 统一 typecheck + test + 构建 + 打新包 + 提交。
