# Nest 0.6.2

本次更新把 PS Vita 正式接进 Nest，同时带来主题包系统、3DS 直读改进和大批扫描/打包稳定性修复。

## 下载

- 便携包：`Nest-0.6.2-portable.zip`
- 解压后运行 `启动 Nest.bat`（便携数据模式）或 `Nest.exe`

SHA256：`0C5AB86AB369E33AAAB138E9FB3920F566BA4F83D4A3DBE388F533B716AF1400`

## 新增

### PS Vita（Vita3K）

- 新增 PSV 系统、Vita3K 引擎和主机墙条目
- VPK 扫描与 `sce_sys/param.sfo` 标题/区域识别
- PS Vita 固件 PUP 导入；首次启动自动安装
- 启动改为 SDL 前端：首次安装，之后从 `ux0/app` 直启
- VPK 先解压为文件夹再安装，兼容 Vita3K 的 VPK 安装问题
- 散装游戏文件夹会**剪切**进 Vita3K 的 `ux0/app`，避免容量翻倍
- Vita3K 键盘映射适配（方向键、✕○□△、L/R、Start/Select）
- 修复直接选择游戏文件夹作为扫描根时识别不到
- PSV 主机图换成真实机器抠图

### 主题包系统

- 新增主题包规范、JSON Schema、默认主题和校验工具
- 设置 → Nest → 外观主题：主题列表、预览、即时切换
- 支持导入主题包 zip
- 字体与背景图按主题包加载
- 主题只改样式，不改布局

### 3DS

- CIA 解密、健康检查、安装与启动流程
- 修复 ExeFS `.code` 被二次解密的问题
- 支持直接启动解密后的 NCCH
- boot9 查找与缺失提示
- 解密期间保持界面响应

### 扫描与库

- 大文件改用头尾指纹，避免整文件哈希
- 嵌套扫描根目录去重，启动扫描延后 4 秒
- 手动重扫清空黑名单
- 设置内可恢复单个被移除的游戏

### PSP / Xbox / 打包

- PSP：等 VSH 启动后再插 UMD；拒绝加密 CIA
- Xenia：清理引擎时把存档/配置移到 `%LOCALAPPDATA%\Nest\xenia-backup\`，不再删除；窗口关闭后等待 5 秒再停进程
- 修复打包时把开发机 Cemu NAND 带进发布包的问题；发布前强制泄漏校验
- 新增 `tools/make-console-art.py` 主机图抠图工具

## 注意

- PSV 需要自备 PS Vita 固件（PUP）；部分 Vitamin 等非标准 dump 仍可能不受支持
- Wii U 系统菜单仍受 Cemu 的 EULA/ACT 实现限制，可能卡在协议页；Mii 工作室和游戏直读不受影响
- 3DS 部分汉化/重打包 CIA 本身损坏，Nest 无法修复
- 主题系统目前内置默认暗色主题；更多主题需通过主题包导入

完整变更见仓库 `docs/nintendo/CHANGELOG.md`。
