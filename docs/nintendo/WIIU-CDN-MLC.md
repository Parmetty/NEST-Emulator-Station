# Wii U 系统菜单：CDN 系统 title + 手工组装 MLC 的实践结论

> 时间：2026-11-01。目的：不下载 30 GB kiosk MLC 的前提下，用任天堂 CDN 的系统 title 拼出 Cemu 可启动的 mlc01。
> 结论：**能启动 Wii U Menu（60 FPS、渲染正常），但停在用户选择背景，UI 出不来**——根因是 Cemu 2.6 未实现 `nn_act.LoadConsoleAccount`，与 MLC 是否手工组装无关。

## 一、做了什么

1. **下载系统 title**（WiiUDownloader，区域 Japan，搜索 16 位十六进制 title id）
   - `00050010` 系统应用：Wii U Menu(10040000)、Version data(10041000)、DRC firmware/atlas(10043000/10044000)、
     System Settings(10047000)、Parental Controls(10048000)、User Settings(10049000)、Mii Maker(1004A000)、
     Account Settings(1004B000)、Daily Log(1004C000)、Notifications(1004D000)、Health&Safety(1004E000)、Wii U Chat(1005A000)
   - `0005001B` 共享数据：memoryclear(10042300)、Fonts(10042400)、SWKBD(1004F000)、DeviceEula(10050000)、
     ErrEula(10051000)、Country(10052000)、key/cert(10054000)、mii_resource(10056000)、startup_data(10057000)、
     DRMApp resources(10058000)
2. **组装 mlc01**（脚本 `tools/wiiu/install-title.mjs`）
   - WiiUDownloader 会产出两份：原始 WUP（含 `title.tmd/tik/cert` + `.app`）与 `decrypted/`（FST 树 `code/content/meta`）
   - Cemu 的 title 目录 = **FST 树 + title.tmd/title.tik**：
     `mlc01/sys/title/<hi>/<lo>/{code,content,meta,title.tmd,title.tik}`
3. **修复缺失依赖**（迭代定位，全量日志 `logflag=2147483647`）
   - `FFLResMiddleLG.dat` 缺失 → 装 `0005001B-10056000`（mii_resource）
   - `DeviceEula.msbt` 缺失 → 装 `0005001B-10050000`
   - 之后无文件缺失错误
4. **验证**
   - Wii U Menu：加载成功，`TitleRegion: JP v226`，Vulkan 60 FPS，背景动画正常
   - Mii Maker（1004A000）：完整渲染、教程、可捏 Mii（键盘 A 可操作）
   - User Settings（10049000）：GamePad 画面可显示（需 `open_pad=true`），但保存 Mii 关联时白屏卡死

## 二、卡点与根因

全量日志里菜单启动后唯一相关的失败调用：

```
Unsupported lib call: nn_act.LoadConsoleAccount__Q2_2nn3actFUc13ACTLoadOptionPCcb
Unsupported lib call: nn_act.LoadConsoleAccount__Q2_2nn3actFUc13ACTLoadOptionPCcb
```

- 菜单通过 `nn_act.LoadConsoleAccount` 读取本机账号（用户列表 + Mii 关联）
- Cemu 2.6 没有实现这个 HLE 函数（返回失败），菜单拿到的用户列表为空
- 表现：TV/GamePad 都只有背景动画，无用户选择项；按 A 无效
- **Cemu 2.6 是当前最新官方版**（GitHub Releases 最新 tag = v2.6），没有可用的 2.7 构建

补充：`User Settings` 白屏是 Cemu 对系统 applet 的已知不完整（wiki 也写「system applets can't be launched」类限制），
与 MLC 组装无关。

## 三、结论与后续选项

| 方案 | 可行性 | 说明 |
|---|---|---|
| 继续用 CDN MLC 开菜单 | ❌ | 缺 `LoadConsoleAccount` 实现，UI 不出 |
| 换 kiosk NAND（29.7 GB） | ❓ | 同样要过 `nn_act` 这一关，大概率同样卡在用户列表；不建议现在下 |
| 等 Cemu 2.7+ | ✅ 最现实 | wiki 提到 2.7 修复 demo/账号相关问题；发布后直接换 dll 即可复用现有 MLC |
| 回头做游戏直读 | ✅ | 有 `.wua` 就能验证；系统菜单功能保持「引擎已接入、等待引擎修复」 |

## 四、当前仓库/工作区状态

- 引擎：`resources/engines/cemu/`（Cemu 2.6，MPL-2.0），manifest 已支持 `-t 0005001010040000`
- MLC：`resources/engines/cemu/portable/mlc01`（358.6 MB / 846 文件，**不进 git**，打包前由 `clean-engines` 清理）
- keys：`resources/engines/cemu/portable/keys.txt`（common key，gitignore）
- 辅助脚本：`tools/wiiu/install-title.mjs`、`tools/wiiu/enable-pad.mjs`、`tools/wiiu/analyze-log.mjs`
- 设置：`open_pad` 建议保持 `true`（不然系统应用看不到 GamePad 画面）

## 五、可复用的经验

1. WiiUDownloader 搜系统 title 必须用**完整 16 位十六进制**（如 `0005001B10056000`），带横杠搜不到
2. 它同时输出「原始 WUP」和「decrypted FST」两份，组装 MLC 需要把两者合并
3. Cemu 全量日志（`logflag=2147483647`）单次启动可达 100–200 MB，排查完记得改回 `0` 并删日志
4. Cemu 进程若由外部工具（PowerShell 子进程）启动，工具退出时可能被连带杀掉；用 WMI `Win32_Process.Create` 可脱离进程树
