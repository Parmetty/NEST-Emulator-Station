# Nest 便携版（portable）常规编译手册

> 读者：新接手 Nest 的 AI / 开发者。
> 目标：从当前源码产出一个可解压运行的 `Nest-<version>-portable.zip`。
> 适用：Windows x64，仓库 `E:\workstop\nest`，Electron + electron-builder。
>
> **这不是 NSIS 安装包流程。** `npm run pack` 打的是 `Setup.exe`；便携包是
> `electron-builder --dir` 生成 `dist/win-unpacked` 后，手工组装、清理、压缩出来的。

---

## 0. 先读这些，别直接开跑

1. `README.md` / `docs/ROADMAP.md`：当前版本和功能状态
2. `docs/HANDOFF.local.md`：最近开发上下文（内部文件，不提交）
3. `docs/nintendo/RELEASE-RUNBOOK.md`：历史发布流程，本手册是它的 portable 实操版
4. `package.json`：版本号和 build 配置的唯一来源

当前注意：

- 2026-11-09 前后 `docs/` 有一次编码损坏修复；**不要用 Windows PowerShell 5.1 的
  `Get-Content` / `Set-Content` / `>` 批量改 Markdown**，它们默认不是 UTF-8。
- 构建前先看 `git status --short`。如果工作区有未完成的 docs/修复改动，不要
  `git add -A` 把无关文件混进发布提交。
- `package.json` 当前版本可能是 `0.5.0-beta.1`，而 `package-lock.json` 可能还停在
  `0.4.2-beta.1`。版本号以 `package.json` 为准，但发布前要同步 lock。

---

## 1. 前置条件

### 1.1 工具链

- Node.js（仓库使用 `E:\node\node.exe` / `E:\node\npm.cmd`）
- 已执行过 `npm install`，存在：
  - `node_modules\electron\dist\electron.exe`
  - `node_modules\electron-builder`
  - `node_modules\7zip-bin\win\x64\7za.exe`
- PowerShell（建议 `pwsh` 7；如果只有 Windows PowerShell 5.1，不要用它处理 UTF-8 文本）
- 可写目录：`dist\`、`.cache\`

### 1.2 版本号

`package.json` 的 `version` 是唯一来源，目录名、zip 名、Release 标题都从它取。

推荐用：

```powershell
Set-Location E:\workstop\nest
npm version 0.5.0-beta.1 --no-git-tag-version
```

或者手工同时改：

- `package.json` → `"version"`
- `package-lock.json` → 顶层 `"version"` 和 `packages[""].version`

不要只改 `package.json` 就让 lock 长期落后。

---

## 2. 构建前检查

```powershell
Set-Location E:\workstop\nest

git status --short
npm run typecheck
npm test
node tools/clean-engines.mjs --check
```

基线期望：

- `typecheck` 通过
- `test` 全绿（当前约 117 条，具体以实际输出为准）
- `clean-engines --check` 返回 **exit 0**；如果有输出 `local paths still present`，先修配置

### 2.1 `clean-engines` 会删东西

`tools/clean-engines.mjs` 是**破坏性清理**，会从 `resources/engines` 删除：

- melonDS 的 `melonDS.toml`、`wfcsettings.bin`
- Cemu `portable/` 下的 keys/MLC/settings
- PPSSPP 的 `memstick/`、`portable.txt`、flash0 junction
- Xenia 的 cache/profile/config
- RPCS3 的 `dev_flash*`、`dev_hdd0*`、`config/`、缓存等
- 所有 `.nest-controls-*`、`*.before-nest` 标记

因此：

- **不要在准备本地继续测试前运行它**，否则固件/配置会被清掉
- 需要时从 `nest-assets\firmware\...` 恢复用户固件
- 发布包本来就不应该带这些用户数据

---

## 3. 生成未打包目录 `dist\win-unpacked`

### 3.1 设置缓存环境变量

受限账户/系统代理环境下，electron-builder 下载或解压 winCodeSign/NSIS 可能失败：

```powershell
$env:ELECTRON_BUILDER_CACHE = 'E:\workstop\nest\.cache\electron-builder'
$env:ELECTRON_CACHE         = 'E:\workstop\nest\.cache\electron'
$env:TEMP                   = 'E:\workstop\nest\.cache\tmp'
$env:TMP                    = $env:TEMP
$env:ELECTRON_SKIP_BINARY_DOWNLOAD = '1'
New-Item -ItemType Directory -Force -Path $env:ELECTRON_BUILDER_CACHE,$env:ELECTRON_CACHE,$env:TEMP | Out-Null
```

`electronDist` 已经在 `package.json` 里指向 `node_modules/electron/dist`，正常不需要重新下载 Electron。

### 3.2 构建

```powershell
npm run build
node tools\clean-engines.mjs
Remove-Item 'dist\win-unpacked','dist\portable' -Recurse -Force -ErrorAction SilentlyContinue
npx electron-builder --win --x64 --dir
```

注意：

- `npm run build` 只生成 `out/`，不是最终包
- `npx electron-builder --dir` 才生成 `dist/win-unpacked`
- 不要用 `npm run pack`：那是 NSIS `Setup.exe`
- `npm run pack:dir` 会先 build+clean 再 `--dir`，但不会帮你组装 portable，仍要执行后面的步骤

### 3.2.1 组装后必须跑泄漏校验（MLC 事故教训）

2026-11-12 的 0.6.0/v0.5.0 曾把 `resources/engines/cemu/portable/mlc01`（开发机 Wii U NAND）
打进便携包。打包前必须：

```powershell
node tools\verify-package.mjs "dist\portable\Nest-$ver"
# 期望输出：package verify ok: no user data, no local paths
```

`tools/clean-engines.mjs` 也会做同样的目录扫描，发现固件/NAND 会以非零码退出。

### 3.3 验证 `win-unpacked`

```powershell
Test-Path 'dist\win-unpacked\Nest.exe'
Test-Path 'dist\win-unpacked\resources\engines'
Test-Path 'dist\win-unpacked\resources\tools'
```

`resources\engines` 和 `resources\tools` 来自 `package.json` 的 `extraResources`。

---

## 4. 组装便携目录

```powershell
$ver = (Get-Content package.json -Raw | ConvertFrom-Json).version
$stage = "dist\portable\Nest-$ver"

Remove-Item 'dist\portable' -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $stage | Out-Null

# 不要直接 Copy-Item win-unpacked $stage，避免多套一层目录
Copy-Item 'dist\win-unpacked\*' $stage -Recurse -Force

# 便携模式入口/说明
Copy-Item 'tools\portable\*' $stage -Force
```

结果应包含：

```
dist\portable\Nest-<ver>\
├─ Nest.exe
├─ resources\engines\...
├─ resources\tools\...
├─ 启动 Nest.bat
├─ 便携数据模式.bat
└─ 使用说明.txt
```

两个 bat 的区别：

- `启动 Nest.bat`：`--user-data-dir="%~dp0data"`，数据留在便携目录
- `便携数据模式.bat`：同样使用本地 `data`，但不额外加 `--no-sandbox`
- 直接双击 `Nest.exe`：使用 `%APPDATA%\Nest`，不是便携数据模式

---

## 5. 打包后二次清理（关键）

`clean-engines` 清的是源目录 `resources/engines`；`win-unpacked` 是复制品。
如果构建期间引擎又被运行过，打包目录里仍可能写回运行时状态。

**打包后不要再启动 `$stage\Nest.exe`**，否则会再写配置。

### 5.1 手工清理 staging

```powershell
$eng = Join-Path $stage 'resources\engines'

Get-ChildItem $eng -Recurse -Force -File -ErrorAction SilentlyContinue |
  Where-Object {
    $_.Name -like '.nest-controls-*' -or
    $_.Name -like '*.before-nest'
  } | Remove-Item -Force

$runtime = @(
  'melonds\melonDS.toml','melonds\melonDS.ini','melonds\wfcsettings.bin',
  'cemu\portable\keys.txt','cemu\portable\settings.xml',
  'xenia\xconfig.settings','xenia\xenia.log','xenia\recent.toml',
  'xenia\xenia-canary.config.toml',
  'rpcs3\config'
)
foreach ($rel in $runtime) {
  $p = Join-Path $eng $rel
  if (Test-Path $p) { Remove-Item $p -Recurse -Force }
}

# RPCS3 用户固件/HDD 绝不能进包
foreach ($rel in @('rpcs3\dev_flash','rpcs3\dev_flash2','rpcs3\dev_flash3',
                   'rpcs3\dev_hdd0','rpcs3\dev_hdd1','rpcs3\dev_bdvd',
                   'rpcs3\dev_usb000','rpcs3\cache','rpcs3\log',
                   'rpcs3\captures','rpcs3\savestates','rpcs3\games',
                   'rpcs3\shaderlog','rpcs3\ppu_progs','rpcs3\spu_progs')) {
  $p = Join-Path $eng $rel
  if (Test-Path $p) { Remove-Item $p -Recurse -Force }
}

# 便携数据/测试产物
Remove-Item (Join-Path $stage 'data') -Recurse -Force -ErrorAction SilentlyContinue
```

### 5.2 必须为空的检查

```powershell
Get-ChildItem $eng -Recurse -Force -File |
  Where-Object {
    $_.Name -like '.nest-controls-*' -or
    $_.Name -like '*.before-nest' -or
    $_.Name -in @('melonDS.toml','wfcsettings.bin','keys.txt','xconfig.settings')
  }
```

RPCS3 的 `seed\` 要保留；`config\`、`dev_flash\`、`dev_hdd0\` 不能出现。

### 5.3 本地路径/用户数据检查

用 Node 读 UTF-8 检查，不要用 PowerShell 5.1 文本管线：

```powershell
@'
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
const root = process.argv[2];
const bad = /[A-Za-z]:[\\/]+workstop|[A-Za-z]:[\\/]+Users[\\/]+/i;
const exts = /\.(ini|bml|toml|cfg|conf|json|txt|xml|yml|yaml)$/i;
const hits=[];
function walk(d){
  for(const e of readdirSync(d,{withFileTypes:true})){
    const p=join(d,e.name);
    if(e.isDirectory()) walk(p);
    else if(exts.test(e.name)){
      try{ if(bad.test(readFileSync(p,"utf8"))) hits.push(p); }catch{}
    }
  }
}
walk(root);
console.log(hits.length ? hits.join("\n") : "no local paths");
'@ | Set-Content tools\_check-paths.mjs -Encoding UTF8
node tools\_check-paths.mjs $stage
Remove-Item tools\_check-paths.mjs -Force
```

（如果系统里只有 PowerShell 5.1，注意 `Set-Content -Encoding UTF8` 仍可能写 BOM；更稳的是用 `write` 工具/Node 直接写脚本。）

---

## 6. 打 zip

**cwd 必须在 staging 根目录里**，输出 zip 必须用绝对路径，否则 7za 会多套一层 `dist\`。

```powershell
$ver = (Get-Content package.json -Raw | ConvertFrom-Json).version
$zip = "E:\workstop\nest\dist\Nest-$ver-portable.zip"
$seven = "E:\workstop\nest\node_modules\7zip-bin\win\x64\7za.exe"

Remove-Item $zip -Force -ErrorAction SilentlyContinue
Push-Location "E:\workstop\nest\dist\portable\Nest-$ver"
& $seven a -tzip -mx=1 -bb0 $zip
Pop-Location

Get-Item $zip | Select-Object Name,Length
Get-FileHash $zip -Algorithm SHA256
```

检查 zip 顶层：

```powershell
& $seven l $zip | Select-Object -First 30
```

应看到 `Nest.exe` 在根目录，而不是 `Nest-<ver>\Nest.exe` 或 `dist\...\Nest.exe`。

---

## 7. 解压验证

不要只信“zip 能打开”，必须解压到一个干净目录做 smoke。

```powershell
$dest = 'E:\workstop\nest-verify'
Remove-Item $dest -Recurse -Force -ErrorAction SilentlyContinue
& $seven x $zip "-o$dest" -bb0

# 1) 基础 renderer smoke
cmd /c "`"$dest\Nest.exe`" --no-sandbox --user-data-dir=`"$dest\data`" --smoke"
# 期望 exit 0，日志出现 smoke ok: renderer rendered

# 2) 扫描 + 启动一条真实链路（按当前测试资产选）
cmd /c "`"$dest\Nest.exe`" --no-sandbox --user-data-dir=`"$dest\data`" --scan=E:\workstop\nest-assets\roms\gba --trylaunch=gba --hold=9000"
# 期望日志出现 spawned gba / trylaunch ok，$dest\data\covers 下有 png
```

再查 zip 成员没有运行时状态：

```powershell
& $seven l $zip | Select-String 'melonDS.toml|wfcsettings|nest-controls|before-nest|dev_flash|dev_hdd0'
# 期望无输出
```

记录：

- zip 大小
- 解压后文件数/体积
- SHA256
- smoke 结果

---

## 8. 文档/版本收尾

发布前（需要用户/Lead 明确同意）：

1. `docs/nintendo/CHANGELOG.md` 顶部加本版本段落
2. 新增/更新 `docs/nintendo/RELEASE-<version>.md`（下载说明、版本亮点、已知问题）
3. `README.md` 更新版本/下载名（如果用户要发布）
4. git 提交并推送
5. `git tag -a v<version>` 并推送
6. 用 `tools\release-gh.ps1` 创建 GitHub Release

**不要在没有明确授权时打 tag 或上传 Release。**

---

## 9. 常见坑

| 坑 | 现象 | 防法 |
|---|---|---|
| PowerShell 5.1 编码 | 中文变 `锛/鐨`，文档损坏 | 文本处理只用 Node/`write` 工具；不要 `Get-Content`/`Set-Content` 批量改 UTF-8 |
| `cmd /c ... > file` | 输出 UTF-16 或截断 | 用 Node `execFileSync(..., { encoding: null })` 取原始字节 |
| `ELECTRON_RUN_AS_NODE` 残留 | Electron 当 Node 跑，窗口不出现 | 启动前 `Remove-Item Env:ELECTRON_RUN_AS_NODE` |
| `npm run pack` | 生成 `Setup.exe`，不是 portable | portable 用 `--dir` + 手工 staging |
| `7za` 相对路径 | zip 里多一层 `dist/` | zip 用绝对路径，cwd 在 staging 根目录 |
| `Copy-Item win-unpacked $stage` | 多一层 `win-unpacked/` | `Copy-Item "dist\win-unpacked\*" $stage` |
| clean-engines 跑太早 | 本地固件/配置被删，测试无法继续 | build 前才 clean；需要时从 `nest-assets\firmware` 恢复 |
| 只 clean 源目录 | staging 里还有运行时文件 | 第 5 步再清一遍 staging |
| 打包后启动 staging | 配置被写回，包不干净 | 压缩前不要再启动 `$stage\Nest.exe` |
| 版本号不同步 | zip 名/Release 和 package 不一致 | 改 `package.json` + `package-lock.json`，从 package 取 `$ver` |
| 带用户固件/游戏 | 包体异常大/合规问题 | 不打包 `dev_flash`、`dev_hdd0`、BIOS、PUP、ROM、`nest-assets` |
| `TEMP` 不可写 | electron-builder 解包失败 | 设置 `.cache\tmp` 到可写目录 |

---

## 10. 最短可复制流程

```powershell
Set-Location E:\workstop\nest

# 版本/检查
$ver = (Get-Content package.json -Raw | ConvertFrom-Json).version
npm run typecheck
npm test
node tools\clean-engines.mjs --check

# 构建
$env:ELECTRON_BUILDER_CACHE = 'E:\workstop\nest\.cache\electron-builder'
$env:ELECTRON_CACHE         = 'E:\workstop\nest\.cache\electron'
$env:TEMP                   = 'E:\workstop\nest\.cache\tmp'
$env:TMP                    = $env:TEMP
$env:ELECTRON_SKIP_BINARY_DOWNLOAD = '1'
New-Item -ItemType Directory -Force -Path $env:ELECTRON_BUILDER_CACHE,$env:ELECTRON_CACHE,$env:TEMP | Out-Null
npm run build
node tools\clean-engines.mjs
Remove-Item 'dist\win-unpacked','dist\portable' -Recurse -Force -ErrorAction SilentlyContinue
npx electron-builder --win --x64 --dir

# 组装
$stage = "dist\portable\Nest-$ver"
New-Item -ItemType Directory -Force -Path $stage | Out-Null
Copy-Item 'dist\win-unpacked\*' $stage -Recurse -Force
Copy-Item 'tools\portable\*' $stage -Force

# 二次清理（示例；按第 5 节完整执行）
Remove-Item (Join-Path $stage 'data') -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem "$stage\resources\engines" -Recurse -Force -File |
  Where-Object { $_.Name -like '.nest-controls-*' -or $_.Name -like '*.before-nest' } |
  Remove-Item -Force

# zip
$zip = "E:\workstop\nest\dist\Nest-$ver-portable.zip"
$seven = "E:\workstop\nest\node_modules\7zip-bin\win\x64\7za.exe"
Remove-Item $zip -Force -ErrorAction SilentlyContinue
Push-Location "E:\workstop\nest\dist\portable\Nest-$ver"
& $seven a -tzip -mx=1 -bb0 $zip
Pop-Location
Get-FileHash $zip -Algorithm SHA256
```

完整校验、zip 成员检查和 smoke 见第 6、7 节，不要省略。
