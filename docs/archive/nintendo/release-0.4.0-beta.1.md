# Nest 0.4.0 Beta 路 鑷啓 libretro 瀹夸富 + Wii U 鎺ュ叆

> **历史文档 / 已归档。** 这里的“待接入、未支持、已知问题”只描述当时版本，不代表当前状态。当前状态见 `docs/README.md` 与 `docs/ROADMAP.md`。

> Windows 鍏嶅畨瑁呮惡甯︾増銆備笅杞?`Nest-0.4.0-beta.1-portable.zip`锛岃В鍘嬪弻鍑?**`鍚姩 Nest.bat`** 鍗冲彲銆?
## 杩欎釜鐗堟湰鏈変粈涔?
### 鑷啓 libretro 瀹夸富锛圵ii 绯荤粺鑿滃崟鍘?UIA锛?
- 鏂板 `nest-libretro.exe`锛堣嚜鍐?C# 瀹夸富锛屾墭绠″畼鏂?`dolphin_libretro.dll`锛屼笉渚濊禆 RetroArch/RetroArch 鍓嶇锛?- **Wii Menu 涓嶅啀璧?Dolphin Qt 鐨?GUI 鑷姩鍖?*锛氱洿鎺ュ姞杞?`wii-menu.wad` 杩涜彍鍗?- 閿紶鏄犲皠锛氶紶鏍?= Wiimote 鍏夋爣锛堢粷瀵瑰畾浣嶏紝鎸夊睆骞曞綍鍍忔爣瀹氾級锛屽乏閿?= A
- 鍚屼竴濂楀涓讳篃鐢ㄤ簬灏侀潰鍙栧抚锛堣烦杩囬粦甯э級

### Wii U锛圕emu 2.6锛?
- 鍐呯疆 Cemu 2.6锛圡PL 2.0锛?- 鏀寔 `.wua / .wud / .wux` 鎵弿涓庣洿璇?- 璁剧疆 鈫掋€岀郴缁熸枃浠讹紙鑷锛夈€嶆柊澧烇細Cemu keys.txt 瀵煎叆銆乄ii U NAND锛圡LC锛夌洰褰?- **Wii U Menu 鏍囪涓哄疄楠屾€?*锛欳emu 2.6 灏氭湭瀹炵幇 `nn_act.LoadConsoleAccount`锛屽嵆浣?MLC 姝ｇ‘鑿滃崟鐩墠涔熷彧鍋滃湪鑳屾櫙锛涚洿璇讳笉鍙楀奖鍝?
### 閿綅

- mGBA / ares / Dolphin / Azahar / melonDS 浜斿紩鎿庨敭鐩樼粦瀹氾紙鍒嗗紩鎿庡啓閰嶇疆锛屼笉瑕嗙洊鑷畾涔夛級
- ares 閲囩敤婧愮爜纭鐨勫崄杩涘埗 index 缂栫爜
- Wii 绯荤粺鑿滃崟閫氳繃瀹夸富鍐呯疆榛樿 + Nest `--keys` 浼犻€?
### 鍏跺畠

- 鍚姩鑷姩鎵弿銆乣.cia` 鏀寔銆佺鐩樺ご magic 鍒ゆ柇 GC/Wii
- 鍥轰欢涓績銆佸皝闈€佽繍琛屼腑楂樹寒銆佽繘鍏ュ墠纭
- 渚挎惡妯″紡锛氬簱/灏侀潰/鏃ュ織/寮曟搸閰嶇疆閮藉湪瑙ｅ帇鐩綍 `data\`

## 涓嬭浇淇℃伅

| 椤?| 鍊?|
|---|---|
| 鏂囦欢 | `Nest-0.4.0-beta.1-portable.zip` |
| 澶у皬 | 268 MB锛堣В鍘?640 MB / 3172 鏂囦欢锛?|
| SHA256 | `235753F404CCFF3494D6A4C25861265C23B624F99BE5DAC4CA0DAD504D99CA22` |

## 棣栨浣跨敤

1. 瑙ｅ帇鍒颁换鎰忕洰褰?2. 鍙屽嚮 `鍚姩 Nest.bat`
3. 鐐广€屾壂鎻忔枃浠跺す銆嶆寚鍚?ROM 鐩綍锛堜箣鍚庢瘡娆″惎鍔ㄨ嚜鍔ㄩ噸鎵級
4. 鍥轰欢/瀵嗛挜锛氳缃?鈫掋€岀郴缁熸枃浠讹紙鑷锛夈€?
## 宸茬煡闄愬埗

- Wii U Menu 瀹為獙鎬э紙Cemu 2.6 璐﹀彿 API 鏈疄鐜帮級
- Wii 鐩磋灏氭棤鐪熷疄闀滃儚楠岃瘉
- NGC 绯荤粺鑿滃崟浠嶆槸 Qt+UIA锛坙ibretro 鏍稿績鏃犳硶鏃犲唴瀹瑰惎鍔級
- 鏃犳暟瀛楃鍚嶏細棣栨杩愯 SmartScreen 鎻愮ず锛岄€夈€屾洿澶氫俊鎭?鈫?浠嶈杩愯銆?- Cemu 閿綅灏氭湭鎺ュ叆 Nest 閿綅闈㈡澘锛堝彲鍦?Cemu 鑷韩 GUI 閰嶇疆锛?
瀹屾暣鏀瑰姩瑙?`docs/nintendo/CHANGELOG.md` 鐨?0.4.0-beta.1 鑺傘€?
