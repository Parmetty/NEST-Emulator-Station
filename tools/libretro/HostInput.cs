using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace NestLibretro
{
    /// <summary>
    /// Input sink: keyboard, one SDL3 gamepad and the mouse, translated into the
    /// libretro input_state contract.
    ///
    /// The joypad ids are NOT guessed: they are taken from the descriptors the
    /// core publishes with RETRO_ENVIRONMENT_SET_INPUT_DESCRIPTORS (for the
    /// Dolphin core: A=8, B=0, X=9, Y=1, L=12, R=13, Z=11, Start=3 on GameCube;
    /// A=8, B=0, 1=9, 2=1, +=3, -=2, Home=15, Shake=13 on Wii).
    ///
    /// Analog sticks use RETRO_DEVICE_ANALOG (5) with
    /// RETRO_DEVICE_INDEX_ANALOG_LEFT/RIGHT and RETRO_DEVICE_ID_ANALOG_X/Y,
    /// returning -32767..32767. Wii IR (dolphin_ir_mode=1, the default) is driven
    /// by the right analog stick, so relative mouse movement is mapped there.
    ///
    /// Keyboard defaults (same layout Nest already uses for Dolphin):
    ///   d-pad .......... W/A/S/D
    ///   left stick ..... arrow keys (full deflection)
    ///   A/B/X/Y/L/R/Z .. J/K/U/I/Q/E/Space
    ///   Start/Select ... Enter / right Shift
    ///   C stick ........ T/G/F/H
    /// </summary>
    internal static class HostInput
    {
        // ---- libretro device constants (libretro.h) ----
        private const uint DEVICE_JOYPAD = 1;
        private const uint DEVICE_MOUSE = 2;
        private const uint DEVICE_KEYBOARD = 3;
        private const uint DEVICE_ANALOG = 5;
        private const uint DEVICE_POINTER = 6;

        private const uint INDEX_ANALOG_LEFT = 0;
        private const uint INDEX_ANALOG_RIGHT = 1;
        private const uint INDEX_ANALOG_BUTTON = 2;

        private const uint ID_ANALOG_X = 0;
        private const uint ID_ANALOG_Y = 1;

        private const uint ID_MOUSE_X = 0;
        private const uint ID_MOUSE_Y = 1;
        private const uint ID_MOUSE_LEFT = 2;
        private const uint ID_MOUSE_RIGHT = 3;

        private const uint ID_POINTER_X = 0;
        private const uint ID_POINTER_Y = 1;
        private const uint ID_POINTER_PRESSED = 2;

        private const uint ID_JOYPAD_MASK = 256;

        // Joypad ids used by the Dolphin core (confirmed by its descriptors).
        private const int ID_B = 0;
        private const int ID_Y = 1;
        private const int ID_SELECT = 2;
        private const int ID_START = 3;
        private const int ID_UP = 4;
        private const int ID_DOWN = 5;
        private const int ID_LEFT = 6;
        private const int ID_RIGHT = 7;
        private const int ID_A = 8;
        private const int ID_X = 9;
        private const int ID_L = 12;
        private const int ID_R = 13;
        private const int ID_Z = 11;
        private const int ID_L3 = 14;
        private const int ID_R3 = 15;

        // SDL scancodes
        private const int SC_A = 4;
        private const int SC_D = 7;
        private const int SC_E = 8;
        private const int SC_F = 9;
        private const int SC_G = 10;
        private const int SC_H = 11;
        private const int SC_I = 12;
        private const int SC_J = 13;
        private const int SC_K = 14;
        private const int SC_Q = 20;
        private const int SC_S = 22;
        private const int SC_T = 23;
        private const int SC_U = 24;
        private const int SC_W = 26;
        private const int SC_RETURN = 40;
        private const int SC_SPACE = 44;
        private const int SC_F1 = 58;
        private const int SC_F2 = 59;
        private const int SC_RIGHT = 79;
        private const int SC_LEFT = 80;
        private const int SC_DOWN = 81;
        private const int SC_UP = 82;
        private const int SC_RSHIFT = 229;

        private const int AnalogFull = 32767;
        private const int AnalogThreshold = 4000; // gamepad deadzone

        private static readonly LibretroCore.InputPollFn PollCallback = OnPoll;
        private static readonly LibretroCore.InputStateFn StateCallback = OnState;

        private static bool _headless;
        private static IntPtr _event;
        private static IntPtr _keyState;
        private static int _keyCount;

        private static IntPtr _gamepad;
        private static int _gamepadProbeCountdown = 300;
        private static bool _gamepadLogged;

        private static readonly Dictionary<string, int> LayoutIds = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        private static readonly Dictionary<string, int> Bindings = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

        private static ushort _mask;
        private static int _leftX;
        private static int _leftY;
        private static int _rightX;
        private static int _rightY;
        private static int _mouseDeltaX;
        private static int _mouseDeltaY;
        private static float _pointerX;
        private static float _pointerY;
        private static bool _pointerPressed;
        private static bool _mouseEnabled = true;
        private static bool _wiiMode;

        public static bool QuitRequested;

        public static IntPtr PollPointer
        {
            get { return Marshal.GetFunctionPointerForDelegate(PollCallback); }
        }

        public static IntPtr StatePointer
        {
            get { return Marshal.GetFunctionPointerForDelegate(StateCallback); }
        }

        public static void Init(bool headless)
        {
            _headless = headless;
            _event = Marshal.AllocHGlobal(256);

            ResetLayoutDefaults();
            ResetBindings();
            if (!headless) ProbeGamepad();
        }

        private static void ResetLayoutDefaults()
        {
            LayoutIds.Clear();
            LayoutIds["UP"] = ID_UP;
            LayoutIds["DOWN"] = ID_DOWN;
            LayoutIds["LEFT"] = ID_LEFT;
            LayoutIds["RIGHT"] = ID_RIGHT;
            LayoutIds["A"] = ID_A;
            LayoutIds["B"] = ID_B;
            LayoutIds["X"] = ID_X;
            LayoutIds["Y"] = ID_Y;
            LayoutIds["L"] = ID_L;
            LayoutIds["R"] = ID_R;
            LayoutIds["Z"] = ID_Z;
            LayoutIds["START"] = ID_START;
            LayoutIds["SELECT"] = ID_SELECT;
            LayoutIds["PLUS"] = ID_START;
            LayoutIds["MINUS"] = ID_SELECT;
            LayoutIds["HOME"] = ID_R3;
            LayoutIds["SHAKE"] = ID_R;
            LayoutIds["L3"] = ID_L3;
            LayoutIds["R3"] = ID_R3;
        }

        private static void ResetBindings()
        {
            Bindings.Clear();
            Bindings["UP"] = SC_W;
            Bindings["DOWN"] = SC_S;
            Bindings["LEFT"] = SC_A;
            Bindings["RIGHT"] = SC_D;
            Bindings["LU"] = SC_UP;
            Bindings["LD"] = SC_DOWN;
            Bindings["LL"] = SC_LEFT;
            Bindings["LR"] = SC_RIGHT;
            Bindings["A"] = SC_J;
            Bindings["B"] = SC_K;
            Bindings["X"] = SC_U;
            Bindings["Y"] = SC_I;
            Bindings["L"] = SC_Q;
            Bindings["R"] = SC_E;
            Bindings["Z"] = SC_SPACE;
            Bindings["START"] = SC_RETURN;
            Bindings["SELECT"] = SC_RSHIFT;
            Bindings["PLUS"] = SC_RETURN;
            Bindings["MINUS"] = SC_RSHIFT;
            Bindings["HOME"] = SC_F1;
            Bindings["SHAKE"] = SC_F2;
            Bindings["L2"] = SC_Q;
            Bindings["R2"] = SC_E;
            Bindings["RU"] = SC_T;
            Bindings["RD"] = SC_G;
            Bindings["RL"] = SC_F;
            Bindings["RR"] = SC_H;
        }

        // ------------------------------------------------------------------
        // configuration
        // ------------------------------------------------------------------

        /// <summary>--keys "A=J,B=K,LX=LEFT" style overrides.</summary>
        public static void Configure(string spec, bool mouseEnabled)
        {
            _mouseEnabled = mouseEnabled;

            if (string.IsNullOrEmpty(spec)) return;

            string[] items = spec.Split(',');
            for (int i = 0; i < items.Length; i++)
            {
                string item = items[i].Trim();
                if (item.Length == 0) continue;

                int equals = item.IndexOf('=');
                if (equals <= 0 || equals == item.Length - 1)
                {
                    Log.Write("keys: ignoring malformed entry '" + item + "' (expected Action=Key)");
                    continue;
                }

                string name = NormalizeAction(item.Substring(0, equals).Trim());
                string key = item.Substring(equals + 1).Trim();

                if (!Bindings.ContainsKey(name))
                {
                    Log.Write("keys: unknown action '" + name + "' (known: A,B,X,Y,Z,L,R,START,SELECT,UP,DOWN,LEFT,RIGHT,LU,LD,LL,LR,RU,RD,RL,RR,HOME,SHAKE,PLUS,MINUS)");
                    continue;
                }

                int scancode;
                if (!TryParseKey(key, out scancode))
                {
                    Log.Write("keys: unknown key '" + key + "' for action " + name);
                    continue;
                }

                Bindings[name] = scancode;
                Log.Write("keys: " + name + " = " + key + " (scancode " + scancode + ")");
            }
        }

        private static string NormalizeAction(string name)
        {
            string upper = name.ToUpperInvariant();
            switch (upper)
            {
                case "LX": return "LL"; // alias: left stick X (negative direction)
                case "LY": return "LU"; // alias: left stick Y (negative direction)
                case "RX": return "RL";
                case "RY": return "RU";
                default: return upper;
            }
        }

        private static bool TryParseKey(string name, out int scancode)
        {
            scancode = 0;
            string key = name.Trim().ToUpperInvariant();
            if (key.Length == 0) return false;

            switch (key)
            {
                case "SPACE": scancode = SC_SPACE; return true;
                case "ENTER":
                case "RETURN": scancode = SC_RETURN; return true;
                case "ESC":
                case "ESCAPE": scancode = 41; return true;
                case "TAB": scancode = 43; return true;
                case "BACKSPACE": scancode = 42; return true;
                case "UP": scancode = SC_UP; return true;
                case "DOWN": scancode = SC_DOWN; return true;
                case "LEFT": scancode = SC_LEFT; return true;
                case "RIGHT": scancode = SC_RIGHT; return true;
                case "LSHIFT": scancode = 225; return true;
                case "RSHIFT": scancode = SC_RSHIFT; return true;
            }

            if (key.Length == 1)
            {
                char c = key[0];
                if (c >= 'A' && c <= 'Z')
                {
                    scancode = SC_A + (c - 'A');
                    return true;
                }
                if (c >= '1' && c <= '9')
                {
                    scancode = 30 + (c - '1');
                    return true;
                }
                if (c == '0')
                {
                    scancode = 39;
                    return true;
                }
            }

            if (key.Length >= 2 && key[0] == 'F')
            {
                int n;
                if (int.TryParse(key.Substring(1), out n) && n >= 1 && n <= 12)
                {
                    scancode = SC_F1 + n - 1;
                    return true;
                }
            }

            return false;
        }

        /// <summary>
        /// Rebuilds the joypad-id table from the descriptors published by the
        /// core. Values not declared keep the Dolphin defaults.
        /// </summary>
        public static void ApplyDescriptors(List<HostEnvironment.InputDescriptorInfo> descriptors)
        {
            // Only the joypad id table is rebuilt; --keys bindings stay intact.
            ResetLayoutDefaults();
            if (descriptors == null || descriptors.Count == 0)
            {
                Log.Write("input: core declared no descriptors; using built-in Dolphin defaults");
                return;
            }

            bool wii = false;
            for (int i = 0; i < descriptors.Count; i++)
            {
                HostEnvironment.InputDescriptorInfo info = descriptors[i];
                if ((info.Device & 0xFF) != DEVICE_JOYPAD || info.Port != 0 || info.Index != 0) continue;

                string description = (info.Description ?? string.Empty).Trim();
                string lower = description.ToLowerInvariant();
                if (lower.IndexOf("wiimote", StringComparison.Ordinal) >= 0 ||
                    lower.IndexOf("tilt", StringComparison.Ordinal) >= 0 ||
                    lower.IndexOf("shake", StringComparison.Ordinal) >= 0)
                {
                    wii = true;
                }

                string action = null;
                switch (lower)
                {
                    case "a": action = "A"; break;
                    case "b": action = "B"; break;
                    case "x": action = "X"; break;
                    case "y": action = "Y"; break;
                    case "z": action = "Z"; break;
                    case "l": action = "L"; break;
                    case "r": action = "R"; break;
                    case "start": action = "START"; break;
                    case "select": action = "SELECT"; break;
                    case "up": action = "UP"; break;
                    case "down": action = "DOWN"; break;
                    case "left": action = "LEFT"; break;
                    case "right": action = "RIGHT"; break;
                    case "+": action = "PLUS"; break;
                    case "-": action = "MINUS"; break;
                    case "home": action = "HOME"; break;
                    case "shake wiimote": action = "SHAKE"; break;
                    case "1": action = "X"; break; // Wii remote "1" sits on joypad id 9
                    case "2": action = "Y"; break; // Wii remote "2" sits on joypad id 1
                    case "l-analog": action = "L3"; break;
                    case "r-analog": action = "R3"; break;
                }

                if (action != null)
                {
                    LayoutIds[action] = (int)info.Id;
                }
            }

            _wiiMode = wii;
            Log.Write("input: descriptors applied, wii mode = " + wii);
        }

        public static bool WiiMode { get { return _wiiMode; } }

        public static string DescribeMapping()
        {
            System.Text.StringBuilder sb = new System.Text.StringBuilder();
            sb.Append("input host mapping:").Append(Environment.NewLine);
            sb.Append("  d-pad        Up=").Append(KeyName("UP")).Append(" Down=").Append(KeyName("DOWN"))
              .Append(" Left=").Append(KeyName("LEFT")).Append(" Right=").Append(KeyName("RIGHT"))
              .Append("  (joypad ids ").Append(IdOf("UP")).Append("/").Append(IdOf("DOWN"))
              .Append("/").Append(IdOf("LEFT")).Append("/").Append(IdOf("RIGHT")).Append(")").Append(Environment.NewLine);
            sb.Append("  left stick   Up=").Append(KeyName("LU")).Append(" Down=").Append(KeyName("LD"))
              .Append(" Left=").Append(KeyName("LL")).Append(" Right=").Append(KeyName("LR"))
              .Append("  -> ANALOG left, full deflection").Append(Environment.NewLine);
            sb.Append("  right stick  Up=").Append(KeyName("RU")).Append(" Down=").Append(KeyName("RD"))
              .Append(" Left=").Append(KeyName("RL")).Append(" Right=").Append(KeyName("RR"))
              .Append("  -> ANALOG right");
            if (_wiiMode) sb.Append(" (+ mouse when enabled)");
            sb.Append(Environment.NewLine);
            sb.Append("  buttons      A=").Append(KeyName("A")).Append("(").Append(IdOf("A")).Append(")")
              .Append(" B=").Append(KeyName("B")).Append("(").Append(IdOf("B")).Append(")")
              .Append(" X=").Append(KeyName("X")).Append("(").Append(IdOf("X")).Append(")")
              .Append(" Y=").Append(KeyName("Y")).Append("(").Append(IdOf("Y")).Append(")")
              .Append(" L=").Append(KeyName("L")).Append("(").Append(IdOf("L")).Append(")")
              .Append(" R=").Append(KeyName("R")).Append("(").Append(IdOf("R")).Append(")")
              .Append(" Z=").Append(KeyName("Z")).Append("(").Append(IdOf("Z")).Append(")")
              .Append(Environment.NewLine);
            sb.Append("  start/select Start=").Append(KeyName("START")).Append("(").Append(IdOf("START")).Append(")")
              .Append(" Select=").Append(KeyName("SELECT")).Append("(").Append(IdOf("SELECT")).Append(")")
              .Append(Environment.NewLine);
            sb.Append("  wii extras   Home=").Append(KeyName("HOME")).Append("(").Append(IdOf("HOME")).Append(")")
              .Append(" Shake=").Append(KeyName("SHAKE")).Append("(").Append(IdOf("SHAKE")).Append(")")
              .Append(" Plus=").Append(KeyName("PLUS")).Append("(").Append(IdOf("PLUS")).Append(")")
              .Append(" Minus=").Append(KeyName("MINUS")).Append("(").Append(IdOf("MINUS")).Append(")")
              .Append(Environment.NewLine);
            sb.Append("  triggers     L/R digital -> JOYPAD; ANALOG button index 2 -> ").Append(Environment.NewLine);
            sb.Append("  mouse        ").Append(_mouseEnabled ? "enabled (Wii IR / pointer)" : "disabled").Append(Environment.NewLine);
            return sb.ToString();
        }

        private static string KeyName(string action)
        {
            int scancode;
            if (!Bindings.TryGetValue(action, out scancode)) return "?";
            return ScancodeName(scancode);
        }

        private static int IdOf(string action)
        {
            int id;
            return LayoutIds.TryGetValue(action, out id) ? id : -1;
        }

        private static string ScancodeName(int scancode)
        {
            if (scancode >= SC_A && scancode < SC_A + 26) return ((char)('A' + (scancode - SC_A))).ToString();
            switch (scancode)
            {
                case 30: return "1";
                case 31: return "2";
                case 32: return "3";
                case 33: return "4";
                case 34: return "5";
                case 35: return "6";
                case 36: return "7";
                case 37: return "8";
                case 38: return "9";
                case 39: return "0";
                case SC_RETURN: return "Enter";
                case SC_SPACE: return "Space";
                case SC_UP: return "Up";
                case SC_DOWN: return "Down";
                case SC_LEFT: return "Left";
                case SC_RIGHT: return "Right";
                case SC_RSHIFT: return "RShift";
                case 225: return "LShift";
                case 41: return "Esc";
                case 43: return "Tab";
                case 42: return "Backspace";
            }
            if (scancode >= SC_F1 && scancode <= SC_F1 + 11) return "F" + (scancode - SC_F1 + 1);
            return "sc" + scancode;
        }

        // ------------------------------------------------------------------
        // per-frame polling
        // ------------------------------------------------------------------

        public static void Pump()
        {
            if (_event != IntPtr.Zero)
            {
                while (Sdl3.SDL_PollEvent(_event))
                {
                    uint type = (uint)Marshal.ReadInt32(_event);
                    if (type == Sdl3.SDL_EVENT_QUIT)
                    {
                        QuitRequested = true;
                        Log.Write("window close requested");
                    }
                    else if (type == Sdl3.SDL_EVENT_KEY_DOWN)
                    {
                        int scancode = Marshal.ReadInt32(_event, 24);
                        if (scancode == Sdl3.SDL_SCANCODE_ESCAPE)
                        {
                            QuitRequested = true;
                            Log.Write("ESC pressed");
                        }
                        else if (scancode == Sdl3.SDL_SCANCODE_F11)
                        {
                            HostVideo.ToggleFullscreen();
                        }
                    }
                }
            }

            _keyState = Sdl3.SDL_GetKeyboardState(out _keyCount);

            UpdateGamepad();

            UpdateMaskAndSticks();
        }

        private static void UpdateGamepad()
        {
            if (_gamepad == IntPtr.Zero && !_headless)
            {
                if (--_gamepadProbeCountdown <= 0)
                {
                    _gamepadProbeCountdown = 300;
                    ProbeGamepad();
                }
            }

            if (_gamepad != IntPtr.Zero) Sdl3.SDL_UpdateGamepads();
        }

        private static void ProbeGamepad()
        {
            int count;
            IntPtr ids = Sdl3.SDL_GetGamepads(out count);
            if (ids == IntPtr.Zero) return;

            try
            {
                if (count > 0)
                {
                    int id = Marshal.ReadInt32(ids, 0);
                    _gamepad = Sdl3.SDL_OpenGamepad(id);
                    if (_gamepad != IntPtr.Zero && !_gamepadLogged)
                    {
                        _gamepadLogged = true;
                        Log.Write("gamepad: " + Native.Utf8ToString(Sdl3.SDL_GetGamepadName(_gamepad)) +
                                  " (left/right sticks mapped to ANALOG left/right)");
                    }
                }
            }
            finally
            {
                Sdl3.SDL_free(ids);
            }
        }

        private static void UpdateMaskAndSticks()
        {
            ushort mask = 0;
            mask |= Pressed("UP", ID_UP);
            mask |= Pressed("DOWN", ID_DOWN);
            mask |= Pressed("LEFT", ID_LEFT);
            mask |= Pressed("RIGHT", ID_RIGHT);
            mask |= Pressed("A", ID_A);
            mask |= Pressed("B", ID_B);
            mask |= Pressed("X", ID_X);
            mask |= Pressed("Y", ID_Y);
            mask |= Pressed("Z", ID_Z);
            mask |= Pressed("L", ID_L);
            mask |= Pressed("R", ID_R);
            mask |= Pressed("START", ID_START);
            mask |= Pressed("SELECT", ID_SELECT);
            mask |= Pressed("PLUS", ID_START);
            mask |= Pressed("MINUS", ID_SELECT);
            mask |= Pressed("HOME", ID_R3);
            mask |= Pressed("SHAKE", ID_R);

            int leftX = AxisFromKeys("LL", "LR");
            int leftY = AxisFromKeys("LU", "LD");
            int rightX = AxisFromKeys("RL", "RR");
            int rightY = AxisFromKeys("RU", "RD");

            if (_gamepad != IntPtr.Zero)
            {
                mask |= PadPressed("UP", Sdl3.SDL_GAMEPAD_BUTTON_DPAD_UP);
                mask |= PadPressed("DOWN", Sdl3.SDL_GAMEPAD_BUTTON_DPAD_DOWN);
                mask |= PadPressed("LEFT", Sdl3.SDL_GAMEPAD_BUTTON_DPAD_LEFT);
                mask |= PadPressed("RIGHT", Sdl3.SDL_GAMEPAD_BUTTON_DPAD_RIGHT);
                mask |= PadPressed("A", Sdl3.SDL_GAMEPAD_BUTTON_SOUTH);
                mask |= PadPressed("B", Sdl3.SDL_GAMEPAD_BUTTON_EAST);
                mask |= PadPressed("Y", Sdl3.SDL_GAMEPAD_BUTTON_WEST);
                mask |= PadPressed("X", Sdl3.SDL_GAMEPAD_BUTTON_NORTH);
                mask |= PadPressed("L", Sdl3.SDL_GAMEPAD_BUTTON_LEFT_SHOULDER);
                mask |= PadPressed("R", Sdl3.SDL_GAMEPAD_BUTTON_RIGHT_SHOULDER);
                mask |= PadPressed("START", Sdl3.SDL_GAMEPAD_BUTTON_START);
                mask |= PadPressed("SELECT", Sdl3.SDL_GAMEPAD_BUTTON_BACK);
                mask |= PadPressed("HOME", Sdl3.SDL_GAMEPAD_BUTTON_GUIDE);

                short axis = Sdl3.SDL_GetGamepadAxis(_gamepad, Sdl3.SDL_GAMEPAD_AXIS_LEFTX);
                if (Math.Abs((int)axis) > AnalogThreshold) leftX = axis;
                axis = Sdl3.SDL_GetGamepadAxis(_gamepad, Sdl3.SDL_GAMEPAD_AXIS_LEFTY);
                if (Math.Abs((int)axis) > AnalogThreshold) leftY = axis;
                axis = Sdl3.SDL_GetGamepadAxis(_gamepad, Sdl3.SDL_GAMEPAD_AXIS_RIGHTX);
                if (Math.Abs((int)axis) > AnalogThreshold) rightX = axis;
                axis = Sdl3.SDL_GetGamepadAxis(_gamepad, Sdl3.SDL_GAMEPAD_AXIS_RIGHTY);
                if (Math.Abs((int)axis) > AnalogThreshold) rightY = axis;
            }

            if (_mouseEnabled)
            {
                float dx;
                float dy;
                uint buttons = Sdl3.SDL_GetRelativeMouseState(out dx, out dy);

                _mouseDeltaX = ClampToShort((int)(dx * 1200.0f));
                _mouseDeltaY = ClampToShort((int)(dy * 1200.0f));

                if (Math.Abs(dx) > 0.001f || Math.Abs(dy) > 0.001f)
                {
                    _pointerX = ClampFloat(_pointerX + dx * 1800.0f);
                    _pointerY = ClampFloat(_pointerY + dy * 1800.0f);
                }
                else
                {
                    _pointerX *= 0.85f;
                    _pointerY *= 0.85f;
                }

                if ((buttons & 1) != 0) _pointerPressed = true;
                else _pointerPressed = false;

                // Wii IR (dolphin_ir_mode=1) reads the right analog stick as a
                // relative pointer; only feed the mouse there in Wii mode so the
                // GameCube C stick is not moved by cursor motion.
                if (_wiiMode)
                {
                    if (Math.Abs(_mouseDeltaX) > 0) rightX = _mouseDeltaX;
                    if (Math.Abs(_mouseDeltaY) > 0) rightY = _mouseDeltaY;
                }
            }
            else
            {
                _mouseDeltaX = 0;
                _mouseDeltaY = 0;
            }

            _mask = mask;
            _leftX = ClampToShort(leftX);
            _leftY = ClampToShort(leftY);
            _rightX = ClampToShort(rightX);
            _rightY = ClampToShort(rightY);
        }

        private static int AxisFromKeys(string negativeAction, string positiveAction)
        {
            int value = 0;
            if (KeyDown(negativeAction)) value -= AnalogFull;
            if (KeyDown(positiveAction)) value += AnalogFull;
            return value;
        }

        private static ushort Pressed(string action, int defaultId)
        {
            int id = IdOf(action);
            if (id < 0) id = defaultId;
            if (!KeyDown(action)) return 0;
            return (ushort)(1 << id);
        }

        private static ushort PadPressed(string action, int sdlButton)
        {
            if (_gamepad == IntPtr.Zero) return 0;
            if (!Sdl3.SDL_GetGamepadButton(_gamepad, sdlButton)) return 0;

            int id = IdOf(action);
            if (id < 0) return 0;
            return (ushort)(1 << id);
        }

        private static bool KeyDown(string action)
        {
            int scancode;
            if (!Bindings.TryGetValue(action, out scancode)) return false;
            if (_keyState == IntPtr.Zero) return false;
            return Marshal.ReadByte(_keyState, scancode) != 0;
        }

        private static int ClampToShort(int value)
        {
            if (value > AnalogFull) return AnalogFull;
            if (value < -AnalogFull) return -AnalogFull;
            return value;
        }

        private static float ClampFloat(float value)
        {
            if (value > AnalogFull) return AnalogFull;
            if (value < -AnalogFull) return -AnalogFull;
            return value;
        }

        // ------------------------------------------------------------------
        // libretro callbacks
        // ------------------------------------------------------------------

        private static void OnPoll()
        {
            // The state is refreshed by Pump() right before retro_run().
        }

        private static short OnState(uint port, uint device, uint index, uint id)
        {
            if (port != 0) return 0;

            uint baseDevice = device & 0xFF;
            switch (baseDevice)
            {
                case DEVICE_JOYPAD:
                    if (index != 0) return 0;
                    if (id == ID_JOYPAD_MASK) return unchecked((short)_mask);
                    if (id > 15) return 0;
                    return (short)((_mask >> (int)id) & 1);

                case DEVICE_ANALOG:
                    if (index == INDEX_ANALOG_LEFT)
                    {
                        if (id == ID_ANALOG_X) return (short)_leftX;
                        if (id == ID_ANALOG_Y) return (short)_leftY;
                    }
                    else if (index == INDEX_ANALOG_RIGHT)
                    {
                        if (id == ID_ANALOG_X) return (short)_rightX;
                        if (id == ID_ANALOG_Y) return (short)_rightY;
                    }
                    else if (index == INDEX_ANALOG_BUTTON)
                    {
                        if (id == (uint)ID_L) return (short)(KeyDown("L") || PadL() ? AnalogFull : 0);
                        if (id == (uint)ID_R) return (short)(KeyDown("R") || PadR() ? AnalogFull : 0);
                    }
                    return 0;

                case DEVICE_MOUSE:
                    if (id == ID_MOUSE_X) return (short)_mouseDeltaX;
                    if (id == ID_MOUSE_Y) return (short)_mouseDeltaY;
                    if (id == ID_MOUSE_LEFT) return (short)(_pointerPressed ? 1 : 0);
                    return 0;

                case DEVICE_POINTER:
                    if (index > 3) return 0;
                    if (id == ID_POINTER_X) return index == 0 ? (short)_pointerX : (short)0;
                    if (id == ID_POINTER_Y) return index == 0 ? (short)_pointerY : (short)0;
                    if (id == ID_POINTER_PRESSED) return index == 0 ? (short)(_pointerPressed ? 1 : 0) : (short)0;
                    return 0;

                case DEVICE_KEYBOARD:
                    return 0;
            }

            return 0;
        }

        private static bool PadL()
        {
            return _gamepad != IntPtr.Zero && Sdl3.SDL_GetGamepadButton(_gamepad, Sdl3.SDL_GAMEPAD_BUTTON_LEFT_SHOULDER);
        }

        private static bool PadR()
        {
            return _gamepad != IntPtr.Zero && Sdl3.SDL_GetGamepadButton(_gamepad, Sdl3.SDL_GAMEPAD_BUTTON_RIGHT_SHOULDER);
        }

        public static void Close()
        {
            if (_gamepad != IntPtr.Zero)
            {
                Sdl3.SDL_CloseGamepad(_gamepad);
                _gamepad = IntPtr.Zero;
            }
            if (_event != IntPtr.Zero)
            {
                Marshal.FreeHGlobal(_event);
                _event = IntPtr.Zero;
            }
        }
    }
}
