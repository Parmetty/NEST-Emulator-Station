# Nest 0.4.1 Beta · NDS/DSi 整条线 + 设置拆分 + GBA 金手指

> Windows 免安装携带版。下载 `Nest-0.4.1-beta.1-portable.zip`，解压双击 **`启动 Nest.bat`** 即可。

## 这个版本有什么

### NDS 家族（DS / DS Lite / DSi / DSi XL）

- 主机墙合并成一个 **NDS** 入口，信息卡里切换机型；四台机器各配一张插图
- 内置引擎换成 **melonDS master CI 构建**（1.1 正式版的 `preloadROMs` 有 bug：`-b always` 不进固件菜单）
- **NDS 系统模式改为命令行 `-b always`**，不再依赖 UIA 菜单自动化
- **DSi / DSi XL 系统菜单可用**：保留 NAND 尾部 64 字节 nocash footer，`[DSi] ExternalBIOSEnable` 必须写布尔 `true`
- 默认窗口从 256×384 调到 **512×768（2 倍整数缩放）**
- **系统菜单插卡**：进菜单时自动把最近玩的 NDS 游戏插进 Slot-1，菜单能识别游戏卡；设置 → Nintendo 可关

### Cemu 键位接入面板

- 设置 → Nintendo → 键位新增 **Wii U**，可改 Cemu 的 Wii U GamePad 键盘绑定
- 写入 `portable/controllerProfiles/controller0.xml`（Windows VK 码），并确保 Cemu 读取该 profile
- 已有手配 profile 不会被启动覆盖，保存时保留 `.before-nest` 备份

### GBA 金手指

- GBA 游戏卡右键「金手指…」：直接编辑 mGBA `.cheats`
- 默认写 ROM 旁的 `<游戏名>.cheats`（mGBA 自动加载）；目录只读时回退到 Nest 数据目录并 `-c` 传入
- 支持 GameShark / Action Replay / CodeBreaker / PARv3

### 设置拆分

- 设置窗口拆成 **Nest / Nintendo / Xbox / PlayStation** 四个子页
- Nest：启动与画面、游戏文件夹
- Nintendo：系统文件（GC IPL、Wii WAD、NDS/DSi 固件、Cemu keys、Wii U MLC、3DS 说明）、键位
- Xbox / PlayStation：预留页，列出待接入机型

### 其它

- **NGC 系统模式提速**：去掉固定 3 秒等待，spawn 到点中菜单约 **2.8 秒**（原先 5 秒以上）
- DSi 固件导入修正：不再裁掉 NAND 尾部元数据
- 键位面板、封面、运行中高亮等既有功能保持不变

## 下载信息

| 项 | 值 |
|---|---|
| 文件 | `Nest-0.4.1-beta.1-portable.zip` |
| 大小 | 264 MB（解压 633 MB / 3171 文件） |
| SHA256 | `0C38660097C310BCC296A4B051D09096E1591111B88314A4A1E4C4BAEE246308` |

## 首次使用

1. 解压到任意目录
2. 双击 `启动 Nest.bat`
3. 点「扫描文件夹」指向 ROM 目录（之后每次启动自动重扫）
4. 固件/密钥：设置 → Nintendo →「系统文件（自备）」

## 已知限制

- **3DS 系统模式未接入**：需要 Azahar 的 nand/sysdata 系统文件（真机 + Artic Setup Tool）
- Wii U Menu 仍为实验性（Cemu 2.6 `nn_act.LoadConsoleAccount` 未实现）
- NGC / Wii 系统菜单里还不能自动插盘；Wii U 菜单只显示 MLC 里已安装的 title
- Xbox / PlayStation 家族尚未接入，游戏库为空
- 无数字签名：首次运行 SmartScreen 提示，选「更多信息 → 仍要运行」

完整改动见 `docs/CHANGELOG.md` 的 0.4.1-beta.1 节。
