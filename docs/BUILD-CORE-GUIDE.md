# 自编译 dolphin_libretro（GC 主菜单补丁）· 下载与构建指南

> 目的：编译一个打了 GC 主菜单补丁的 `dolphin_libretro.dll`，替换仓库里官方 buildbot 的版本。
> 为什么要自己编：官方 core 不支持「无内容启动」，`BootParameters::IPL` 在 libretro 代码里从没被构造过（见
> `docs/LIBRETRO-CORE-FINDINGS.md`）。补丁只改 `Source/Core/DolphinLibretro/Boot.cpp`，已生成可直接 apply 的
> `docs/patches/gc-menu.patch`（基于 commit `c386bd3b95b610ee4e7538891fc57112090498f7`）。

## 0. 需要下载/安装的东西（按顺序）

| # | 东西 | 体积 | 链接 |
|---|---|---|---|
| 1 | **Visual Studio 2022 Build Tools**（只要 C++ 工作负载，不要 IDE） | 下载 ~4 GB，安装后 ~5–7 GB | https://aka.ms/vs/17/release/vs_BuildTools.exe |
| 2 | **CMake** 便携 zip（免安装） | ~50 MB | https://github.com/Kitware/CMake/releases/download/v3.31.5/cmake-3.31.5-windows-x86_64.zip |
| 3 | **Dolphin 源码**（git 克隆，含 submodule） | ~1–1.5 GB | https://github.com/dolphin-emu/dolphin.git |
| 4 | 本项目已有：Git、Python、node（不用再装） | — | — |

磁盘建议：

| 位置 | 用途 | 需要 |
|---|---|---|
| **E:**（或 D:） | VS 工具链主体 + CMake + Dolphin 源码 + 编译目录 | **≥ 20 GB** |
| C: | 仅 Windows SDK（约 2–3 GB） | ≥ 8 GB 空闲 |

> C: 装 SDK 时若仍报磁盘满，可在安装器加 `--nocache` 减少包缓存。

## 1. 安装 VS Build Tools（装到 E:，避免 C: 继续红）

用**管理员 PowerShell**执行：

```powershell
# 让安装器的临时/缓存都去 E:
New-Item -ItemType Directory -Force E:\vs-temp | Out-Null
$env:TEMP = 'E:\vs-temp'; $env:TMP = 'E:\vs-temp'

E:\下载\vs_BuildTools.exe --wait --quiet --nocache `
  --installPath E:\VS2022BuildTools `
  --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended `
  --add Microsoft.VisualStudio.Component.Windows11SDK.22621
```

装完验证（在普通 PowerShell 里）：

```powershell
& 'E:\VS2022BuildTools\VC\Auxiliary\Build\vcvars64.bat'   # 或直接看 cl 是否存在
Get-ChildItem 'E:\VS2022BuildTools\VC\Tools\MSVC'          # 应有版本目录
```

如果这一步还是报错，把**完整安装器输出**贴给我，我按错误码判断（不要反复重试）。

## 2. 解压 CMake（便携）

```powershell
Expand-Archive -Path E:\下载\cmake-3.31.5-windows-x86_64.zip -DestinationPath E:\tools
$env:PATH = 'E:\tools\cmake-3.31.5-windows-x86_64\bin;' + $env:PATH
cmake --version
```

## 3. 克隆 Dolphin 并切到指定 commit

```powershell
cd E:\workstop
git clone --filter=blob:none https://github.com/dolphin-emu/dolphin.git dolphin-src
cd E:\workstop\dolphin-src
git checkout c386bd3b95b610ee4e7538891fc57112090498f7
git submodule update --init --depth 1
```

> 网络慢就等；**不要**同时开多个 clone。若 `git submodule` 卡住，先停下报告。

## 4. 打补丁

```powershell
cd E:\workstop\dolphin-src
git apply --check "E:\workstop\nest\docs\patches\gc-menu.patch"   # 只检查
git apply "E:\workstop\nest\docs\patches\gc-menu.patch"
git diff --stat                                                    # 应只有 Boot.cpp
```

补丁做了什么（4 处）：
1. `no_content = !game || !game->path || !*path`
2. 空内容时不归一化路径、不 `SplitPath(front())`
3. `no_content` 时构造 `BootParameters::IPL{Config::Get(MAIN_FALLBACK_REGION)}`（booting GameCube IPL）
4. 空内容时跳过 m3u / cheats 导入；失败日志不再解引用空 `game`

## 5. 配置 + 编译

```powershell
cd E:\workstop\dolphin-src
# 先确认开关名：
Select-String -Path CMakeLists.txt,Source\CMakeLists.txt -Pattern 'LIBRETRO' -SimpleMatch

cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release `
  -DENABLE_LIBRETRO=ON -DENABLE_QT=OFF -DENABLE_TESTS=OFF
cmake --build build --target dolphin_libretro -j 8
```

- 没有 Ninja 就用 `-G "Visual Studio 17 2022" -A x64`，然后 `cmake --build build --config Release --target dolphin_libretro`
- 首次编译约 **20–60 分钟**
- 产物位置以实际为准（常见 `build\Binaries\dolphin_libretro.dll` 或 `build\Source\Core\DolphinLibretro\dolphin_libretro.dll`）

确认 64 位：

```powershell
& 'E:\VS2022BuildTools\VC\Tools\MSVC\<版本>\bin\Hostx64\x64\dumpbin.exe' /headers build\...\dolphin_libretro.dll | Select-String 'machine'
# 应含 x64
```

## 6. 交付给我验收

把 DLL 复制到：

```
E:\workstop\engines-src\build\dolphin_libretro-patched.dll
```

然后告诉我。我会：
1. 备份并替换 `resources/engines/dolphin/dolphin_libretro.dll`
2. 把 IPL 放到 `<userData>/libretro/sys/dolphin-emu/Sys/GC/USA/IPL.bin`
3. 跑无内容 600 帧，截图确认是 GC 主菜单
4. 回归 GC 直读（600 帧）与 Wii Menu（900 帧）
5. 都通过后才继续 Nest 侧接线（NGC 系统菜单切宿主）

## 7. 失败兜底

- CMake 找不到 MSVC：先手动 `& '...\vcvars64.bat'` 再开新 PowerShell 跑 cmake
- submodule 下载失败：`git submodule sync --recursive` 后重试一次；仍失败报告
- 编译错误：把**前 30 行错误**贴给我；不要反复重试
- 想放弃：直接说，我们回到「Wii 用宿主 + NGC 用 Qt/UIA」的方案
