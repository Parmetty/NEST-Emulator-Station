# ares（FC / SFC / N64）键盘绑定

> **状态：已启用（2026-10-30）。** 编码由 ares 148 源码逐字确认（见 `docs/KEYS-ARES-FORMAT.md`），
> 并与 ares 亲手写出的 `settings.bml` 逐字节比对通过。

## 1. 文件与格式

ares 是便携引擎，配置写在 `resources/engines/ares/settings.bml`（BML：缩进表达层级，`键: 值`）。

输入绑定写在各自系统的 `Input → Controller.Port.1 → Gamepad` 段：

```
Famicom
  Input
    Controller.Port.1
      Gamepad
        Up: 0x1/0/57;;
```

`0x1/0/57;;` 的含义：

| 段 | 值 | 说明 |
|---|---|---|
| `0x1` | 设备 id（十六进制） | 键盘 = `(pathID<<32) \| (vendorID<<16) \| productID` = `0 \| 0x0000<<16 \| 0x0001` = **1，跨机器稳定** |
| `0` | groupID | 键盘只有 `HID::Keyboard::GroupID::Button` = 0 |
| `57` | inputID（**十进制**） | ruby Windows 键盘表下标（`ruby/input/keyboard/rawinput.cpp` 的 `keys[]` 顺序）；**不是 VK、不是 scancode、不是十六进制** |
| `;;` | 三个 mapping 槽 | ares 保存时把 3 个槽用 `;` 拼起来再去掉一个尾分隔符；两槽空 → `;;`。裸写 `0x1/0/57` 也能解析 |

## 2. 默认键位（Nest 写入）

| 动作 | 键 | `KeyboardEvent.code` | ares 名字 | inputID | 写入值 |
|---|---|---|---|---|---|
| Up | W | `KeyW` | W | 57 | `0x1/0/57;;` |
| Down | S | `KeyS` | S | 53 | `0x1/0/53;;` |
| Left | A | `KeyA` | A | 35 | `0x1/0/35;;` |
| Right | D | `KeyD` | D | 38 | `0x1/0/38;;` |
| A 键 | J | `KeyJ` | J | 44 | `0x1/0/44;;` |
| B 键 | K | `KeyK` | K | 45 | `0x1/0/45;;` |
| X（SFC） | U | `KeyU` | U | 55 | `0x1/0/55;;` |
| Y（SFC） | I | `KeyI` | I | 43 | `0x1/0/43;;` |
| L | Q | `KeyQ` | Q | 51 | `0x1/0/51;;` |
| R | E | `KeyE` | E | 39 | `0x1/0/39;;` |
| Start | Enter | `Enter` | Return | 91 | `0x1/0/91;;` |
| Select | 右 Shift | `ShiftRight` | RightShift | 94 | `0x1/0/94;;` |
| Z（N64） | Space | `Space` | Spacebar | 92 | `0x1/0/92;;` |

写入范围：`Famicom` / `FamicomDiskSystem` / `SuperFamicom` / `Nintendo64` 的 `Controller.Port.1 → Gamepad`。
Port 2–4、Mouse、其它系统不动。

## 3. 保护规则（与其它引擎一致）

- `force=false`（启动前自动 seed）：目标字段全是 `;;` 才写；发现任何非空值视为用户自定义，只留 marker 并跳过
- `force=true`（Nest 设置里保存/恢复默认）：无条件重写
- 写前首次备份 `settings.bml.before-nest`；marker `.nest-controls-v1`
- 用户在 ares 里手动改过键 → Nest 永久让位，直到在 Nest 里点「恢复默认」

## 4. 已知限制

- Windows 专用：各平台键盘表不同（Linux 的 Return=89、macOS 字母从 40 起）。Nest 只发 Windows。
- `Escape` 被 ares 保留（index 0 不可绑定）；`Pause`、`NumLock` 不在表内。
- ares 版本升级若改表，映射会失效——届时以 `docs/KEYS-ARES-FORMAT.md` 的源码为准重新生成。
