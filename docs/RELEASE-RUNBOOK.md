# 发布打包 Runbook（交给发布负责人执行）

> 读者：负责发版的子代理（当前是 `nest-release`）。
> 目的：把「从代码到 GitHub Release」的全过程固化成可复现步骤，避免每次重敲命令时漏步骤。
> 原则：**先问再发**。任何 `git tag` / Release 上传动作都必须等用户或 Lead 明确同意。

---

## 0. 角色边界

- 你负责：打便携包、跑验证、创建 Release、上传资产、更新发布文档。
- 你不负责：改应用功能代码（除非 Lead 明确授权）、合并别人分支、改 `resources/engines/**` 的内容。
- 任何一步失败：停下来记录命令 + 原始输出，报告 Lead，不要连着重试破坏现场。

---

## 1. 发版前检查

```powershell
cd E:\workstop\nest
git status --short          # 必须干净（或只剩本次要提交的发布文档）
npm run typecheck
npm test                    # 当前基线：40 passed
node tools/clean-engines.mjs --check   # exit 0 = 引擎配置里没有本地路径
```

版本号：`package.json` 的 `version` 是唯一来源。目录名、zip 名、checksums 都从它取。
同时在 `docs/CHANGELOG.md` 顶部加一个 `## <version> — <日期> · <主题>` 段落。

---

## 2. 构建免安装目录

```powershell
$env:ELECTRON_BUILDER_CACHE = 'E:\workstop\nest\.cache\electron-builder'
$env:ELECTRON_CACHE         = 'E:\workstop\nest\.cache\electron'
$env:TEMP = 'E:\workstop\nest\.cache\tmp'
$env:TMP  = $env:TEMP
$env:ELECTRON_SKIP_BINARY_DOWNLOAD = '1'

npm run build
node tools/clean-engines.mjs
Remove-Item 'dist\win-unpacked','dist\portable' -Recurse -Force -ErrorAction SilentlyContinue
npx electron-builder --win --x64 --dir
```

为什么必须设这 4 个环境变量：受限账户写不了 `%LOCALAPPDATA%`/系统 TEMP，electron-builder 解 winCodeSign/nsis 会失败；
`.cache` 已在 `.gitignore` 里。`electronDist` 已指向 `node_modules/electron/dist`，不需要下载 Electron。

---

## 3. 组装便携目录

```powershell
$ver = (Get-Content package.json -Raw | ConvertFrom-Json).version
$out = "dist\portable\Nest-$ver"
New-Item -ItemType Directory -Force -Path (Split-Path $out) | Out-Null
Copy-Item 'dist\win-unpacked' $out -Recurse
Copy-Item 'tools\portable\启动 Nest.bat'        $out -Force
Copy-Item 'tools\portable\便携数据模式.bat'      $out -Force
Copy-Item 'tools\portable\使用说明.txt'          $out -Force
```

> `启动 Nest.bat` 的内容是 `Nest.exe --no-sandbox --user-data-dir="%~dp0data"`。
> **不要**在 Electron 里运行期改 userData（会崩，见 DECISIONS D20）。

---

## 4. 组装后二次清理（关键，别漏）

打包前 clean 过，但**打包命令本身和测试会再次写回运行时状态**：

```powershell
$eng = "$out\resources\engines"
Get-ChildItem $eng -Recurse -Force -File |
  Where-Object { $_.Name -like '.nest-controls-*' -or $_.Name -like '*.before-nest' } |
  Remove-Item -Force
Remove-Item "$eng\melonds\melonDS.toml","$eng\melonds\wfcsettings.bin" -Force -ErrorAction SilentlyContinue
```

检查（必须为空）：

```powershell
Get-ChildItem $eng -Recurse -Force -File |
  Where-Object { $_.Name -like '.nest-controls-*' -or $_.Name -like '*.before-nest' -or
                 $_.Name -eq 'melonDS.toml' -or $_.Name -eq 'wfcsettings.bin' }
Get-ChildItem $out -Recurse -File -Include '*.ini','*.toml','*.json','*.bml' |
  Where-Object { Select-String -Path $_.FullName -Pattern 'E:\\?workstop|E:/workstop' -Quiet }
```

---

## 5. 打 zip（路径必须是绝对的）

```powershell
$zip = "E:\workstop\nest\dist\Nest-$ver-portable.zip"
Remove-Item $zip -Force -ErrorAction SilentlyContinue
Push-Location "E:\workstop\nest\dist\portable\Nest-$ver"   # cwd 必须在便携目录里，zip 才会平铺
& 'E:\workstop\nest\node_modules\7zip-bin\win\x64\7za.exe' a -tzip -mx=1 -bb0 $zip
Pop-Location
Get-Item $zip | Select-Object Name,Length
(Get-FileHash $zip -Algorithm SHA256).Hash
```

**坑**：`7za` 的输出路径若写相对路径，会在当前目录下再建一层 `dist\...`，zip 里就多套一层文件夹。

---

## 6. 验证（不回前台、不靠人工看）

```powershell
$dest = 'E:\workstop\nest-verify'
Remove-Item $dest -Recurse -Force -ErrorAction SilentlyContinue
& 'E:\workstop\nest\node_modules\7zip-bin\win\x64\7za.exe' x $zip "-o$dest" -bb0
cmd /c "`"$dest\Nest.exe`" --no-sandbox --user-data-dir=`"$dest\data`" --smoke"
# 期望 exit 0，日志出现 smoke ok: renderer rendered
cmd /c "`"$dest\Nest.exe`" --no-sandbox --user-data-dir=`"$dest\data`" --scan=E:\workstop\nest-assets\roms\gba --trylaunch=gba --hold=9000"
# 期望日志出现 spawned gba / trylaunch ok，且 $dest\data\covers 下生成 png
```

另外检查 zip 成员里没有运行时状态：

```powershell
& 'E:\workstop\nest\node_modules\7zip-bin\win\x64\7za.exe' l $zip | Select-String 'melonDS.toml|wfcsettings|nest-controls|before-nest'
# 必须无输出
```

记录：zip 大小、解压后文件数、SHA256，写进 CHANGELOG。

---

## 7. 发布到 GitHub（需要用户/Lead 同意）

```powershell
git tag -a "v$ver" -m "Nest $ver - <主题>"
git push origin "v$ver"
powershell -NoProfile -ExecutionPolicy Bypass -File tools\release-gh.ps1
```

`tools/release-gh.ps1` 的要点（已经踩过的坑，别改坏）：

- 凭据来自 `git credential fill`（`Parmetty` 账号），**不要打印 token**
- Release JSON 用 UTF-8 **无 BOM** 保存（`--data-binary` 会带上 BOM 导致 422 "Problems parsing JSON"）
- `make_latest` 是**字符串** `"true"`，不是布尔
- curl 必须加 `--ssl-no-revoke`（本机代理链导致 `CRYPT_E_NO_REVOCATION_CHECK`）
- 发布后核对：`GET /repos/Parmetty/NEST-Emulator-Station/releases` 里 `draft:false` 且 assets 含 zip
- 诊断时留下的 draft 测试 release 要删掉，别让 Releases 页出现两个 v0.3.x

---

## 8. 收尾

- `docs/CHANGELOG.md`：版本段 + zip 大小 + SHA256 + Release 链接
- `docs/PROGRESS.md`：当天进度里补「发布」小节
- `docs/release-<ver>.md`：Release 正文（给用户看的下载说明、限制）
- 提交并推送 `main`；标签保持在发布提交上
- 报告 Lead：版本、zip 大小/哈希、验证结果、Release URL

---

## 9. 历史事故（每次发版前读一遍）

| 事故 | 原因 | 现在的防法 |
|---|---|---|
| 0.3.0 zip 里带 `melonDS.toml`（`ExternalBIOSEnable=true` + 本机 BIOS 路径） | 清完引擎配置后又从便携目录跑测试，配置被写回再压缩 | 第 4 步二次清理 + 第 6 步 zip 成员检查 |
| zip 里多一层 `dist/` | `7za` 输出写了相对路径 | 第 5 步绝对路径 |
| Release 422 "Problems parsing JSON" | JSON 文件带 BOM | 无 BOM 写入 |
| Release 401 | `Authorization` 头重复（`"Authorization: token …"` 塞进 header value） | header 值为 `"token <token>"` |
