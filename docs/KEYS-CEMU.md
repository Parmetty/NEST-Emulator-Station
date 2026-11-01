# Cemu 键位（Wii U GamePad）

Nest 现在可以在「设置 → 键位」里改 **Wii U（Cemu）** 的键盘绑定，保存后写入 Cemu 的控制器配置文件：

```
resources/engines/cemu/portable/controllerProfiles/controller0.xml
```

## 映射规则

Cemu 的 profile 里每个按键是一条：

```xml
<entry>
  <mapping>1</mapping>   <!-- 模拟手柄的按钮 ID -->
  <button>32</button>    <!-- Windows 虚拟键码（VK） -->
</entry>
```

按钮 ID 来自 Cemu 源码 `src/input/emulated/VPADController.h`：

| ID | 按键 | Nest 动作 |
|---|---|---|
| 1 | A | `a` |
| 2 | B | `b` |
| 3 | X | `x` |
| 4 | Y | `y` |
| 5 | L | `l` |
| 6 | R | `r` |
| 7 | ZL | 固定 `1` 键 |
| 8 | ZR | 固定 `2` 键 |
| 9 | +（Plus） | `start` |
| 10 | −（Minus） | `select` |
| 11–14 | 十字键 上/下/左/右 | `up/down/left/right` |
| 17–20 | 左摇杆 上/下/左/右 | 与十字键共用同一组方向键 |
| 21–24 | 右摇杆 上/下/左/右 | 同上 |

## 行为约定

- **首次启动**（没有 `controller0.xml`）：Nest 写一份默认键盘布局，并确保
  `portable/settings.xml` 里 `<ControllerProfiles>true</ControllerProfiles>`
- **已有手配 profile**：启动时不覆盖；只有在键位面板点「保存/恢复默认」时才重写
  （重写前会生成 `controller0.xml.before-nest`）
- 键位面板里显示的是**当前 profile 里的实际绑定**，不是硬编码默认值

## 限制

- 目前只管理 **controller0（Wii U GamePad）**；Pro Controller / 经典手柄 / 遥控器 profile 还没做
- ZL/ZR 与两个摇杆没有独立动作，跟随十字键（沿用参考 profile 的布局）
- 触屏、麦克风、体感没有键盘映射
