# GBA 金手指（mGBA .cheats）

Nest 在 GBA 游戏卡的右键菜单里提供「金手指…」入口，把代码写进 mGBA 会自动加载的 `.cheats` 文件。

## 文件位置

| 情况 | 路径 |
|---|---|
| ROM 所在文件夹可写（默认） | `<ROM 名去掉扩展名>.cheats`，与 ROM 同目录 |
| ROM 文件夹只读（回退） | `<Nest 数据目录>/cheats/<rom 路径 hash>.cheats`，启动时用 `-c` 传给 mGBA |

mGBA 会自动加载 ROM 旁边的 `.cheats`；回退文件则由 Nest 在启动参数里加 `-c <文件>`。

## 文件格式

纯文本，一行一条，mGBA 自动识别：

```
# 注释以 # 开头
# GameShark（冒号分隔）
02025BC4:000F423F
# CodeBreaker（空格分隔）
82000000 0000
# PARv3
!PARv3
C518E259 5ADBAF5B
```

支持 mGBA 的 `!PARv3`、`!disabled` 等指令；`!disabled` 后面的代码默认不启用。

## 注意

- 金手指码是**按游戏版本**写的：例如 `BPEE` 是美版绿宝石，改版（386/中文修正版等）基址可能不同，加载成功也可能没有效果
- mGBA 对不匹配的代码**不会报错**，只是不生效——这是正常的
- 不匹配时 Nest 无法自动判断，需要你确认代码对应的 ROM 版本
- 修改保存后，下一次启动游戏时生效；游戏运行中也可以直接在 mGBA 的 `工具 → 作弊码` 里临时改

## 相关

- 引擎内入口：mGBA 菜单 `工具 → 作弊码`
- 格式解析参考：mGBA 源码 `src/core/cheats.c`（`mCheatParseFile`）
