# ares `settings.bml` 输入编码：`0x1/0/<id>;;` 到底是什么

> **结论（已由源码逐字确认，ares v148，Debian `148+dfsg-1`）**
>
> `0x1/0/<id>;;` 里 `<id>` 是**十进制**的「Ruby HID 键盘按键表下标」（`ruby/input/keyboard/rawinput.cpp` 里
> `keys.push_back(...)` 的先后顺序，0 起算），**不是** Windows VK，也不是 SDL scancode、不是十六进制。
>
> - `0x1` = 设备 id，十六进制写法；值是 `(pathID<<32) | (vendorID<<16) | productID`
>   = `0 << 32 | 0x0000 << 16 | 0x0001` = `1`（键盘的 GenericVendorID/GenericProductID 是写死的，**跨机器稳定**）。
> - `0` = groupID，键盘只有 `HID::Keyboard::GroupID::Button` = 0。
> - 末尾的 `;;` 不是转义、不是语法糖：每个 input 有 **3 个 mapping 槽**，保存时按 `;` 拼接三个 assignment
>   再 `trimRight(";", 1)` 去掉一个尾分隔符。`0x1/0/57;;` = 槽1 有绑定、槽2/槽3 为空；
>   三个槽全空 = `;;`。**`0x1/0/57`（不带 `;;`）也能被解析**，`;;` 只是 ares 自己写出的规范形式。

## 1. 源码依据（3 段关键代码）

### 1.1 写入格式：`desktop-ui/input/input.cpp`

```cpp
static auto inputAssignment(std::shared_ptr<HID::Device> device, u32 groupID, u32 inputID) -> string {
  if(auto identifier = device->identifier()) return {identifier, "/", groupID, "/", inputID};
  return {"0x", hex(device->id()), "/", groupID, "/", inputID};
}
```

- 设备 `identifier()` 为空（键盘从不 `setIdentifier`），所以走数字分支 → 我们看到的 `0x1/...`。
- 只有 `device->id()` 用 `hex()` 输出；`groupID`、`inputID` **直接 append 整数 → nall 默认十进制**。
- 解析侧：

```cpp
u32 qualifierIndex = 3;
if(token[0].beginsWith("0x")) {
  binding.deviceID = token[0].natural();   // toNatural("0x1") == 1
  binding.groupID  = token[1].natural();
  binding.inputID  = token[2].natural();   // 十进制！"4a" -> 4, "d" -> 0
}
```

`nall/nall/atoi.hpp` 的 `toNatural()`：`0x` 前缀走 hex，否则 `toDecimal_()` 只吃 `'0'..'9'`，
遇到 `a`/`d` 之类的字母**停止**。这正是旧实验只对 W/S 有效的原因（见 §4）。

### 1.2 inputID 的顺序：`ruby/input/keyboard/rawinput.cpp`

`inputID` 就是 `keys` 向量的下标；`HID::Keyboard::Button` 组按同一顺序 `append` 名字，
所以 GUI 显示的键名 = 该下标的名字。Windows 上 ares 用 `ruby/input/sdl.cpp` 的
`#if defined(PLATFORM_WINDOWS) → #include "keyboard/rawinput.cpp"`（即使用 SDL 输入驱动也是它），
所以下表就是本机（Windows）的真值。

### 1.3 设备 id：`nall/nall/hid.hpp` + `rawinput.cpp`

```cpp
hid->setVendorID(HID::Keyboard::GenericVendorID);  // 0x0000
hid->setProductID(HID::Keyboard::GenericProductID); // 0x0001
hid->setPathID(0);
// id => (pathID << 32) | (vendorID << 16) | productID  == 1
```

→ `hex(1)` = `1` → `0x1`。**任何机器上都成立**，不必担心“换机器设备号变”。

## 2. Windows 键盘 inputID 全表（ares v148，0–101）

| id | 名字 | id | 名字 | id | 名字 | id | 名字 |
|---|---|---|---|---|---|---|---|
| 0 | Escape（**保留，不能绑定**） | 26 | Dash | 52 | R | 78 | Keypad0 |
| 1 | F1 | 27 | Equal | 53 | S | 79 | Point |
| 2 | F2 | 28 | Backspace | 54 | T | 80 | Enter（小键盘） |
| 3 | F3 | 29 | Insert | 55 | U | 81 | Add |
| 4 | F4 | 30 | Delete | 56 | V | 82 | Subtract |
| 5 | F5 | 31 | Home | 57 | W | 83 | Multiply |
| 6 | F6 | 32 | End | 58 | X | 84 | Divide |
| 7 | F7 | 33 | PageUp | 59 | Y | 85 | CapsLock |
| 8 | F8 | 34 | PageDown | 60 | Z | 86 | Up |
| 9 | F9 | 35 | A | 61 | LeftBracket | 87 | Down |
| 10 | F10 | 36 | B | 62 | RightBracket | 88 | Left |
| 11 | F11 | 37 | C | 63 | Backslash | 89 | Right |
| 12 | F12 | 38 | D | 64 | Semicolon | 90 | Tab |
| 13 | PrintScreen | 39 | E | 65 | Apostrophe | 91 | Return（主 Enter） |
| 14 | ScrollLock | 40 | F | 66 | Comma | 92 | Spacebar |
| 15 | Tilde | 41 | G | 67 | Period | 93 | LeftShift |
| 16 | Num1 | 42 | H | 68 | Slash | 94 | RightShift |
| 17 | Num2 | 43 | I | 69 | Keypad1 | 95 | LeftControl |
| 18 | Num3 | 44 | J | 70 | Keypad2 | 96 | RightControl |
| 19 | Num4 | 45 | K | 71 | Keypad3 | 97 | LeftAlt |
| 20 | Num5 | 46 | L | 72 | Keypad4 | 98 | RightAlt |
| 21 | Num6 | 47 | M | 73 | Keypad5 | 99 | LeftSuper |
| 22 | Num7 | 48 | N | 74 | Keypad6 | 100 | RightSuper |
| 23 | Num8 | 49 | O | 75 | Keypad7 | 101 | Menu |
| 24 | Num9 | 50 | P | 76 | Keypad8 | | |
| 25 | Num0 | 51 | Q | 77 | Keypad9 | | |

（共 102 项；`Pause`、`NumLock` 在源码里被注释掉，因此**不在表内**，无法绑定。）

## 3. Nest 默认键位对应的正确写法

| 动作 | 键 | `KeyboardEvent.code` | ares 名字 | inputID | 写入值 |
|---|---|---|---|---|---|
| Up | W | `KeyW` | W | 57 | `0x1/0/57;;` |
| Down | S | `KeyS` | S | 53 | `0x1/0/53;;` |
| Left | A | `KeyA` | A | 35 | `0x1/0/35;;` |
| Right | D | `KeyD` | D | 38 | `0x1/0/38;;` |
| A 按钮 | J | `KeyJ` | J | 44 | `0x1/0/44;;` |
| B 按钮 | K | `KeyK` | K | 45 | `0x1/0/45;;` |
| X（SFC） | U | `KeyU` | U | 55 | `0x1/0/55;;` |
| Y（SFC） | I | `KeyI` | I | 43 | `0x1/0/43;;` |
| L | Q | `KeyQ` | Q | 51 | `0x1/0/51;;` |
| R | E | `KeyE` | E | 39 | `0x1/0/39;;` |
| Start | Enter | `Enter` | **Return** | **91** | `0x1/0/91;;` |
| Select | 右 Shift | `ShiftRight` | RightShift | 94 | `0x1/0/94;;` |
| Z（N64） | Space | `Space` | Spacebar | 92 | `0x1/0/92;;` |

对照表里 `A`=35、`D`=38、`J`=44、`K`=45、`M`=47、`Return`=91 与
`ares-probe/settings.ares-manual-bound.bml` 里 ares 亲手写出的值 **逐字节一致**——
这就是最终验证（不是推测）。

## 4. 旧实验为什么“只有 W/S 对”：`natural()` 是十进制解析

旧代码把 VK 码的**十六进制字符串**写进去，ares 却按**十进制**读：

| ares 写出的真实值 | 旧代码写入 | ares 读成 | GUI 显示 | 现象 |
|---|---|---|---|---|
| A → `35` | `41` (VK 0x41) | 41 | **G** | ❌ 显示 G |
| D → `38` | `44` (VK 0x44) | 44 | **J** | ❌ 显示 J |
| J → `44` | `4a` (VK 0x4A) | **4** | **F4** | ❌ |
| K → `45` | `4b` (VK 0x4B) | **4** | **F4** | ❌ |
| Enter → `91` | `d` (VK 0x0D) | **0** | **Escape** | ❌ |
| W → `57` | `57` (VK 0x57) | 57 | W | ✅ 巧合 |
| S → `53` | `53` (VK 0x53) | 53 | S | ✅ 巧合 |

W/S 的 VK 十六进制刚好等于它们的十进制下标（0x57=87 只是我们误读，文件里是十进制 57），
所以只有这两个“碰巧”正确。VK 假设至此彻底排除。

## 5. 跨平台警告

下标顺序来自**各平台自己的键盘表**，三套表长度和顺序都不同：

- Windows / SDL：`ruby/input/keyboard/rawinput.cpp`（本节 §2 表，102 项）。
- Linux X11：`ruby/input/keyboard/xlib.cpp`——有 `Pause`、无 `PrintScreen`/`CapsLock`；
  `Num0` 在 `Num1` 前；小键盘段是 `Keypad0..9`（Windows 是 `Keypad1..9,0`）；
  `Tab`=88、`Return`=89、`Spacebar`=90、`LeftShift`=95、`RightShift`=96。
- macOS：`ruby/input/keyboard/quartz.cpp`——含 F13–F20，字母从 **40** 起，
  `Return`=97、`Spacebar`=98，完全另一套。

Nest 只发 Windows，按 §2 写即可；若将来支持别的平台，需要按平台切换表（或干脆用 ares GUI 里绑一次的值）。

## 6. 建议的代码改法（`src/main/controls/keymap.ts`）

把 `ARES_NAMED_VK` / `codeToAresVk` / `aresAssignmentToCode` 换成「下标表 + 十进制」：

```ts
/** ares v148 Windows: inputID = decimal index into ruby/input/keyboard/rawinput.cpp keys[] */
const ARES_KEY_INDEX: Record<string, number> = {
  // 0 Escape 被 ares 保留，不要映射
  F1: 1, F2: 2, F3: 3, F4: 4, F5: 5, F6: 6, F7: 7, F8: 8, F9: 9, F10: 10, F11: 11, F12: 12,
  PrintScreen: 13, ScrollLock: 14, Backquote: 15,
  Digit1: 16, Digit2: 17, Digit3: 18, Digit4: 19, Digit5: 20,
  Digit6: 21, Digit7: 22, Digit8: 23, Digit9: 24, Digit0: 25,
  Minus: 26, Equal: 27, Backspace: 28,
  Insert: 29, Delete: 30, Home: 31, End: 32, PageUp: 33, PageDown: 34,
  KeyA: 35, KeyB: 36, KeyC: 37, KeyD: 38, KeyE: 39, KeyF: 40, KeyG: 41, KeyH: 42,
  KeyI: 43, KeyJ: 44, KeyK: 45, KeyL: 46, KeyM: 47, KeyN: 48, KeyO: 49, KeyP: 50,
  KeyQ: 51, KeyR: 52, KeyS: 53, KeyT: 54, KeyU: 55, KeyV: 56, KeyW: 57, KeyX: 58,
  KeyY: 59, KeyZ: 60,
  BracketLeft: 61, BracketRight: 62, Backslash: 63, Semicolon: 64,
  Quote: 65, Comma: 66, Period: 67, Slash: 68,
  Numpad1: 69, Numpad2: 70, Numpad3: 71, Numpad4: 72, Numpad5: 73,
  Numpad6: 74, Numpad7: 75, Numpad8: 76, Numpad9: 77, Numpad0: 78,
  NumpadDecimal: 79, NumpadEnter: 80, NumpadAdd: 81, NumpadSubtract: 82,
  NumpadMultiply: 83, NumpadDivide: 84,
  CapsLock: 85, ArrowUp: 86, ArrowDown: 87, ArrowLeft: 88, ArrowRight: 89,
  Tab: 90, Enter: 91, Space: 92,
  ShiftLeft: 93, ShiftRight: 94,
  ControlLeft: 95, ControlRight: 96,
  AltLeft: 97, AltRight: 98,
  MetaLeft: 99, MetaRight: 100, ContextMenu: 101,
};

export function codeToAresAssignment(code: string): string | null {
  const index = ARES_KEY_INDEX[code];
  return index == null ? null : `0x1/0/${index};;`;   // 十进制，不加前导零
}

export function aresAssignmentToCode(assignment: string): string | null {
  const bare = assignment.trim().replace(/;;$/, '');
  const tokens = bare.split('/');
  if (tokens.length !== 3) return null;
  const index = Number.parseInt(tokens[2], 10);        // 十进制！
  return Number.isNaN(index) ? null : (ARES_INDEX_TO_CODE.get(index) ?? null);
}
```

同时要改：`tests/controls.test.ts` 里所有 `codeToAresAssignment`/`aresAssignmentToCode` 的期望值
（例如 `KeyJ` 应为 `0x1/0/44;;` 而不是 `0x1/0/4a;;`、`Enter` 应为 `0x1/0/91;;`），
以及 `docs/KEYS-ARES.md` / `docs/DECISIONS.md` 里“VK 码”的旧结论。

## 7. 真机验证清单

1. 直接改 `resources/engines/ares/settings.bml`：
   `Famicom → Input → Controller.Port.1 → Gamepad` 写
   `Up: 0x1/0/57;;`、`Left: 0x1/0/35;;`、`A: 0x1/0/44;;`、`Start: 0x1/0/91;;`。
2. 启动 ares → Settings → Input：四行应分别显示 **W / A / J / Return**（不是 G/J/F4/Escape）。
3. 进游戏实测：SMB3 能进地图、Start 有效。
4. 反向验证：在 GUI 里手动绑一个键（例如 Left→A），退出后 diff `settings.bml`，应看到 `0x1/0/35`。

## 8. 来源

- Debian 源码包 `ares 148+dfsg-1`（与随包的 ares.exe v148 对应；exe 里的
  “Virtual Gamepads / System mappings override Virtual Gamepad defaults”等字符串与该版本 UI 完全一致）：
  <https://sources.debian.org/src/ares/148+dfsg-1/>
- `desktop-ui/input/input.cpp`（assignment 读写）：
  <https://sources.debian.org/src/ares/148+dfsg-1/desktop-ui/input/input.cpp/>
- `desktop-ui/settings/settings.cpp`（3 槽 `;` 拼接 + `trimRight(";",1)` → `;;`）：
  <https://sources.debian.org/src/ares/148+dfsg-1/desktop-ui/settings/settings.cpp/>
- `ruby/input/keyboard/rawinput.cpp`（Windows 键盘表 → inputID 顺序）：
  <https://sources.debian.org/src/ares/148+dfsg-1/ruby/input/keyboard/rawinput.cpp/>
- `ruby/input/sdl.cpp`（Windows 下 SDL 驱动仍用 rawinput 键盘）：
  <https://sources.debian.org/src/ares/148+dfsg-1/ruby/input/sdl.cpp/>
- `ruby/input/keyboard/xlib.cpp`、`ruby/input/keyboard/quartz.cpp`（其它平台表）：
  <https://sources.debian.org/src/ares/148+dfsg-1/ruby/input/keyboard/xlib.cpp/> ·
  <https://sources.debian.org/src/ares/148+dfsg-1/ruby/input/keyboard/quartz.cpp/>
- `nall/nall/hid.hpp`（设备 id 打包 / Keyboard ProductID=0x0001）、`nall/nall/atoi.hpp`（`natural()` 十进制）：
  <https://sources.debian.org/src/ares/148+dfsg-1/nall/nall/hid.hpp/> ·
  <https://sources.debian.org/src/ares/148+dfsg-1/nall/nall/atoi.hpp/>
