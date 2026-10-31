# 补丁规格：给 dolphin_libretro 加 GC 主菜单（无内容 IPL 启动）

> 依据：`docs/LIBRETRO-CORE-FINDINGS.md`（源码核查，commit `c386bd3b95b610ee4e7538891fc57112090498f7`）。
> 目标：让 `retro_load_game(NULL)` / `path==""` 时启动 GameCube IPL 主菜单，而不是崩溃或直接返回 false。
> 不改 Nest 宿主（宿主已支持传空内容；正式菜单参数由 Nest 决定）。

## 一、要改的文件

`Source/Core/DolphinLibretro/Boot.cpp`，`retro_load_game()`（函数起始在 183 行）。

### 改动 1：入口加 no_content 判定（在 691 行使用 `game->path` 之前）

```cpp
  const bool no_content = !game || !game->path || game->path[0] == '\0';
```

### 改动 2：路径归一化改为条件执行

原（691 行）：

```cpp
  normalized_game_paths.push_back(Libretro::VFile::NormalizePath(game->path));
```

改为：

```cpp
  if (!no_content)
    normalized_game_paths.push_back(Libretro::VFile::NormalizePath(game->path));
```

### 改动 3：boot_params 选择（原 742 行）

原：

```cpp
  std::unique_ptr<BootParameters> boot_params = BootParameters::GenerateFromFile(normalized_game_paths);
```

改为：

```cpp
  std::unique_ptr<BootParameters> boot_params;
  if (no_content)
  {
    // Frontends asking for "no content" get the GameCube IPL menu. Region comes
    // from the fallback region setting so the IPL dump that exists in
    // <system>/dolphin-emu/Sys/GC/<REGION>/IPL.bin is the one that boots.
    // BootParameters::IPL takes a DiscIO::Region; MAIN_FALLBACK_REGION is already that type.
    const DiscIO::Region region = Config::Get(Config::MAIN_FALLBACK_REGION);
    INFO_LOG_FMT(BOOT, "No content supplied, booting GameCube IPL");
    boot_params = std::make_unique<BootParameters>(BootParameters::IPL{region});
  }
  else
  {
    boot_params = BootParameters::GenerateFromFile(normalized_game_paths);
  }
```

### 改动 4：无内容时不要走 m3u / Wii 菜单分支

- m3u 分支（713 行）用 `normalized_game_paths.front()`，空 vector 会 UB：把整个 `if (extension == ".m3u" ...)` 块包进 `if (!no_content) { ... }`，或直接 `if (!no_content && (extension == ".m3u" || extension == ".m3u8"))`。
- `disc_based_games_boot_to_wii_menu` 分支（741-766 行）依赖 `normalized_game_paths.front()`：加 `if (!no_content && disc_based_games_boot_to_wii_menu) { ... }`。
- `Libretro::disk_paths.push_back(...)` 循环（723-724 行）在 no_content 时跳过（空 vector 本来就不进循环，安全，但请确认 `disk_paths` 为空时后续逻辑不炸）。
- 结尾 `generate_cht_from_ini(filename_str)`（781 行）在 no_content 时 `filename_str` 为空，包一层 `if (!no_content)` 或确认空名安全。

### 可选（只为 RetroArch 兼容）

在 `Main.cpp` 初始化 environment 时调用：

```cpp
  bool no_game = true;
  Libretro::environ_cb(RETRO_ENVIRONMENT_SET_SUPPORT_NO_GAME, &no_game);
```

我们自写宿主不需要，但加上对 RetroArch 用户更友好。

## 二、编译

Dolphin 需要 MSVC（项目用 C++20）+ Windows SDK + CMake。参考命令（以实际 CMake 选项为准，先 `grep -rn "LIBRETRO" CMakeLists.txt Source/CMakeLists.txt`）：

```powershell
git clone https://github.com/dolphin-emu/dolphin.git E:\workstop\dolphin-src
cd E:\workstop\dolphin-src
git checkout c386bd3b95b610ee4e7538891fc57112090498f7
git submodule update --init --depth 1
cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DENABLE_LIBRETRO=ON -DENABLE_QT=OFF -DENABLE_TESTS=OFF -DENABLE_ANALYTICS=OFF
cmake --build build --target dolphin_libretro
```

- 若没有 Ninja 也可以用 `-G "Visual Studio 17 2022" -A x64`
- 输出一般在 `build/Binaries/dolphin_libretro.dll`（以实际为准）
- 务必确认产物是 **x86_64**

## 三、验收（Lead 做）

1. 产物替换到 `resources/engines/dolphin/dolphin_libretro.dll`
2. 把 GC IPL 放到 `<userData>/libretro/sys/dolphin-emu/Sys/GC/USA/IPL.bin`（`nest-assets/firmware/gc/gc-ntsc-12.bin`）
3. 无内容启动：
   ```
   nest-libretro.exe --core <新 dll> --headless --frames 600 --shot .cache\gc-menu.png \
     --system-dir <userData>/libretro/sys --save-dir <userData>/libretro/save --log .cache\gc-menu.log
   ```
   期望：exit 0、日志有 `booting GameCube IPL`、截图是 GC 主菜单（非黑）
4. 回归：带 GC 镜像 600 帧、Wii Menu WAD 900 帧仍 exit 0
5. 通过后才允许 Nest 侧切 NGC 系统菜单到宿主（当前仍 Qt+UIA）

## 四、交付

- 产物：`dolphin_libretro.dll`（x64，含补丁）
- 补丁文件：`E:\workstop\engines-src\patch\gc-menu.patch`（`git diff` 生成，能直接 `git apply`）
- 构建日志摘要：编译器版本、CMake 选项、耗时
