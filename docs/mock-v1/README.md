# Nest · 首页静态样张

用来看构图和动效的**单文件样张**，不是工程代码。不依赖构建、不依赖本地服务器。

## 打开

双击 `index.html`，或用浏览器打开。

想直接看某个状态，加查询参数：

```
index.html?sel=wiiu       # 选中 Wii U
index.html?sel=xbox       # 选中 Xbox（预留平台空状态）
index.html?dialog=1       # 直接弹出进入确认框
index.html?dialog=1&mode=system   # 弹出系统模式确认框
index.html?launch=1       # 播放一次启动过渡
```

## 交互（每个选项都有鼠标和键盘两条路）

| 操作 | 键盘 | 鼠标 |
|---|---|---|
| 选择主机 | `↑` / `↓` | 悬停即选中 |
| 展开 / 收起平台 | `←` / `→` / `Enter` | 点击分组标题 |
| 进入主机 | `A` 或 `Enter` | 点击「进入」按钮，或双击主机行 |
| 系统模式 | `X` | 点击「系统模式」按钮 |
| 收藏 | `Y` | 点击「收藏」按钮 |
| 取消 / 关闭 | `B` 或 `Esc` | 点击「取消」或遮罩 |
| 按年代跳转 | `Tab` 聚焦后 `Enter` | 点击底部年份 |

**进入前一定弹确认框**：`注意！您即将进入 XXX（的 XX 模式）`，`A` 确认、`B` 取消。
这样鼠标只是滑过列表时不会误启动。

## 画面对应关系

- **①** 左上：logo + `NEST` 字标 + 副标
- **②** 左侧：树状两级菜单（平台 → 主机），按发售年份排列，黑色马赛克底，Switch 式排版
- **③** 右下：当前项信息卡，切换时淡出→换字→淡入
- **④** 全屏：当前主机的照片，黑白、褪色、模糊、边缘渐隐
- 右上角是超大号发售年份水印（选中平台分组时自动隐藏），左下是年代标尺：**跟着当前平台切换**，Nintendo / Xbox / PlayStation 各一条

## 资产管线

```
fetch-assets.ps1   # 从 Wikimedia Commons 抓主机照 + 授权信息
process.py         # 去白底 → 灰度 → 压暗 → 边缘收边 → WebP
assets/processed/  # 样张实际引用的图
```

`process.py` 做了三件事：PNG 直接用它自带的 alpha；JPEG 从四角 flood fill 抠白底；
统一走一条提黑压白的曲线，得到“褪色”的灰度质感。

## 图片版权

全部来自 Wikimedia Commons，作者 **Evan-Amos**，**Public Domain**：

| 主机 | 原始文件 |
|---|---|
| GBA | `Nintendo-Game-Boy-Advance-Purple-FL.png` |
| FC | `NES-Console-Set.jpg` |
| SFC | `SNES-Model-2-Set.jpg` |
| N64 | `N64-Console-Set.png` |
| NGC | `GameCube-Silver-Optional-Set.jpg` |
| NDS | `Nintendo-DS-Fat-Blue.jpg` |
| Wii | `Wii-Console.png` |
| 3DS | `Nintendo-3DS-AquaOpen.jpg` |
| Wii U | `Nintendo-Wii-U-Console-FL.jpg` |

样张里已经做了大幅模糊、灰度化与压暗，只作为**占位图**。正式版设计上允许用户替换
`media/consoles/<system>.jpg`，内置图不入安装包。

## 字体

Nunito（SIL Open Font License 1.1），已 base64 内嵌进 HTML，所以 `file://` 下也不会回退。

## 限制

- 数据全是假的（主机名、游戏数、最近游玩）
- 没有真实引擎、没有音频、没有存档逻辑
- 只实现首页这一屏；系统页、游戏页还没有

## 下一步

视觉确认后，这套布局和动效移植进 Electron 渲染层：DOM 结构保留，`data` 换成 IPC 拉取的真实库数据。
