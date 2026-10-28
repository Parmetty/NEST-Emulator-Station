using System;
using System.Runtime.InteropServices;

/// <summary>
/// Prints how many controllers SDL sees, using the SDL3 runtime that ships with
/// ares. Nest uses it to decide whether the 3DS engine should bind a gamepad or
/// the keyboard.
///
///   nest-pads.exe
///   -> count=1
///   -> pad[0]=Xbox Wireless Controller
///
/// Needs SDL3.dll next to this exe.
/// </summary>
internal static class Program
{
    [DllImport("SDL3.dll", CallingConvention = CallingConvention.Cdecl)]
    private static extern bool SDL_Init(uint flags);

    [DllImport("SDL3.dll", CallingConvention = CallingConvention.Cdecl)]
    private static extern IntPtr SDL_GetGamepads(out int count);

    [DllImport("SDL3.dll", CallingConvention = CallingConvention.Cdecl)]
    private static extern IntPtr SDL_GetGamepadNameForID(int id);

    [DllImport("SDL3.dll", CallingConvention = CallingConvention.Cdecl)]
    private static extern void SDL_free(IntPtr mem);

    [DllImport("SDL3.dll", CallingConvention = CallingConvention.Cdecl)]
    private static extern void SDL_Quit();

    private const uint SDL_INIT_GAMEPAD = 0x00002000;

    private static int Main()
    {
        try
        {
            if (!SDL_Init(SDL_INIT_GAMEPAD))
            {
                Console.WriteLine("count=-1");
                return 1;
            }

            int count;
            IntPtr pads = SDL_GetGamepads(out count);
            Console.WriteLine("count=" + count);

            if (pads != IntPtr.Zero && count > 0)
            {
                for (int i = 0; i < count; i++)
                {
                    int id = Marshal.ReadInt32(pads, i * 4);
                    IntPtr namePtr = SDL_GetGamepadNameForID(id);
                    string name = namePtr == IntPtr.Zero ? "?" : Marshal.PtrToStringAnsi(namePtr);
                    Console.WriteLine("pad[" + i + "]=" + (name ?? "?"));
                }
                SDL_free(pads);
            }

            SDL_Quit();
            return count > 0 ? 0 : 2;
        }
        catch (DllNotFoundException)
        {
            Console.WriteLine("count=-2");
            return 3;
        }
        catch (EntryPointNotFoundException)
        {
            Console.WriteLine("count=-3");
            return 4;
        }
    }
}
