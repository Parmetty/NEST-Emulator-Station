# 键位设置（B 路线）设计说明

> 目标：① 所有引擎首次启动都有可用的键盘默认值（补齐 ares / melonDS）；② Nest 内提供键位编辑界面，用户不必进各引擎 GUI。

## 1. 数据模型

```ts
// contract.ts
export const PAD_ACTIONS = ['up','down','left','right','a','b','x','y','l','r','start','select'] as const;
export type PadAction = typeof PAD_ACTIONS[number];

/** KeyboardEvent.code 规范名：KeyW / ArrowUp / Space / Enter / ShiftRight / Digit1 … */
export type KeyCode = string;

export type KeyboardBindings = Partial<Record<PadAction, KeyCode>>;

export interface EngineControls {
  mode?: 'keyboard' | 'gamepad';   // Azahar 已有键盘/手柄二选一
  keyboard?: KeyboardBindings;     // 用户覆盖值；缺省用引擎默认
  updatedAt?: number;
}

// Settings 增加
controls?: Record<string, EngineControls>;   // key = engine id: mgba | ares | dolphin | azahar | melonds
```

约定：**保存的是用户覆盖值**，`keyboard` 缺某个 action 时用该引擎默认值；`reset` 直接删除该引擎条目。

## 2. 默认键位（统一布局）

| action | KeyCode | 说明 |
|---|---|---|
| up/down/left/right | KeyW / KeyS / KeyA / KeyD | 与 Dolphin/现有一致 |
| a | KeyJ | |
| b | KeyK | |
| x | KeyU | |
| y | KeyI | |
| l | KeyQ | |
| r | KeyE | |
| start | Enter | |
| select | ShiftRight | |

引擎已有默认值（mGBA Space/J/Q/E、Dolphin X/…、Azahar code 32/74/…）作为该引擎的 `DEFAULT_KEYBOARD`，不强行统一，避免破坏已验证行为；**编辑界面显示引擎当前实际绑定**。

## 3. 每引擎编码

| 引擎 | 文件 | 键 → 值 |
|---|---|---|
| mGBA | `mgba/config.ini` `[gba.input.QT_K]` | `keyA=88`（Qt key int） |
| Dolphin | `<dolphinUserDir>/Config/GCPadNew.ini` | `Buttons/A = \`X\``、`Main Stick/Up = \`UP\``（Dolphin 键名） |
| Azahar | `<azaharRoot>/config/qt-config.ini` `[Controls]` | `profiles\1\button_a = "code:32,engine:keyboard"` |
| melonDS | `melonds/melonDS.toml` `[Instance0.Keyboard]` | `A = 88`（Qt key int，`-1` 表示未绑定） |
| ares | `ares/settings.bml` | **格式待实验确定**，模块先返回 `unsupported` |

Qt key int 表（`codeToQtKey`）：字母用 ASCII 大写；`Enter` 16777220、`ShiftRight` 16777248、`Space` 32、`Backspace` 16777219、`Tab` 16777217、`Escape` 16777216、`ArrowUp` 16777235、`ArrowDown` 16777237、`ArrowLeft` 16777234、`ArrowRight` 16777236、`F1..F12` 16777264…。

Dolphin 名字表（`codeToDolphinName`）：字母直接大写单字、`Enter→Return`、`ShiftRight→Shift`、`Space→Space`、`ArrowUp→UP` 等。

## 4. 模块结构（`src/main/controls/`）

```
controls/
├─ keymap.ts      PAD_ACTIONS、canonical↔Qt int / Dolphin name 转换、DEFAULT_KEYBOARD（按引擎）
├─ mgba.ts        applyMgbaControls(engineDir, bindings, force)
├─ dolphin.ts     applyDolphinControls(configDir, bindings, force)
├─ azahar.ts      applyAzaharControls(root, bindings, gamepads, force)
├─ melonds.ts     applyMelondsControls(engineDir, bindings, force)
├─ ares.ts        applyAresControls(...) -> 'unsupported'（待格式）
└─ index.ts       applyEngineControls(engineId, dirs, bindings, force) / readEngineControls()
```

规则（沿用现有已验证行为）：
- 未传 `force` 时不覆盖用户自定义（marker 文件 + “看起来是默认值”判断）
- `force=true`（用户在 Nest 里改键/恢复默认）时直接重写
- 写前备份 `<file>.before-nest`（仅首次）
- 迁移完成后 `ipc.ts` 里旧的 `ensureMgbaControls` / `seedDolphinInputDefaults` / `ensureAzaharControls` 逻辑删掉，改为调用模块

## 5. IPC

```
CH.controls        → { engines: Record<engineId, { supported, mode, current: KeyboardBindings, isCustom }> }
CH.saveControls    { engineId, controls: EngineControls } → { ok, applied: string[] }
CH.resetControls   { engineId } → { ok }
```

保存后**立即应用**（用户不用重启即可试键）。

## 6. 界面（设置面板「键位」区块）

- 主机选择：GBA / FC / SFC / N64 / NDS / NGC / Wii / 3DS（按系统分组，同一引擎共用键位时注明）
- 每个 action 一行：名称 + 当前键（badge）+「改」按钮
- 点「改」进入捕获态：提示“请按键…”，`keydown` 读 `event.code`，Esc 取消，重复键提示冲突
- 底部：「恢复默认」+「保存」
- ares 未支持时整组置灰并提示“该引擎键位格式尚未支持，先用手柄或进 ares 设置”

## 7. 任务拆分与写入范围

| 任务 | 写入范围 | 依赖 |
|---|---|---|
| LEAD | `src/shared/contract.ts`、`docs/PLAN-CONTROLS.md` | — |
| nest-keys-core | `src/main/controls/**`、`src/main/ipc.ts` | contract 已就绪 |
| nest-keys-ui | `src/renderer/src/App.tsx`、`styles.css`、`env.d.ts`、`mock.ts`、`preload/index.ts` | contract 已就绪 |
| LEAD | ares 格式实验 → 给 core 补 `ares.ts` | GUI 独占 |

## 8. 验证（不靠前台截屏）

1. `npm run typecheck` + `npm test`
2. 单元测试：`keymap` 转换、`applyEngineControls` 写文件后读回（临时目录）
3. 真机：`--trylaunch=gba` 后读 `mgba/config.ini` 的 `keyA` 是否等于覆盖值；melonDS 同理读 toml
4. 界面：`--settings --shot=` 离屏截图确认新区块渲染
