# Nest 0.4.1-beta.1

> **历史文档 / 已归档。** 这里的“待接入、未支持、已知问题”只描述当时版本，不代表当前状态。当前状态见 `docs/README.md` 与 `docs/ROADMAP.md`。

> **NDS/DSi 鏁存潯绾?+ 璁剧疆鎷嗗垎 + GBA 閲戞墜鎸?*銆俉indows 鍏嶅畨瑁呮惡甯︾増銆備笅杞?`Nest-0.4.1-beta.1-portable.zip`锛岃В鍘嬪弻鍑?**`鍚姩 Nest.bat`** 鍗冲彲銆?
## 杩欎釜鐗堟湰鏈変粈涔?
### NDS 瀹舵棌锛圖S / DS Lite / DSi / DSi XL锛?
- 涓绘満澧欏悎骞舵垚涓€涓?**NDS** 鍏ュ彛锛屼俊鎭崱閲屽垏鎹㈡満鍨嬶紱鍥涘彴鏈哄櫒鍚勯厤涓€寮犳彃鍥?- 鍐呯疆寮曟搸鎹㈡垚 **melonDS master CI 鏋勫缓**锛?.1 姝ｅ紡鐗堢殑 `preloadROMs` 鏈?bug锛歚-b always` 涓嶈繘鍥轰欢鑿滃崟锛?- **NDS 绯荤粺妯″紡鏀逛负鍛戒护琛?`-b always`**锛屼笉鍐嶄緷璧?UIA 鑿滃崟鑷姩鍖?- **DSi / DSi XL 绯荤粺鑿滃崟鍙敤**锛氫繚鐣?NAND 灏鹃儴 64 瀛楄妭 nocash footer锛宍[DSi] ExternalBIOSEnable` 蹇呴』鍐欏竷灏?`true`
- 榛樿绐楀彛浠?256脳384 璋冨埌 **512脳768锛? 鍊嶆暣鏁扮缉鏀撅級**
- **绯荤粺鑿滃崟鎻掑崱**锛氳繘鑿滃崟鏃惰嚜鍔ㄦ妸鏈€杩戠帺鐨?NDS 娓告垙鎻掕繘 Slot-1锛岃彍鍗曡兘璇嗗埆娓告垙鍗★紱璁剧疆 鈫?Nintendo 鍙叧

### Cemu 閿綅鎺ュ叆闈㈡澘

- 璁剧疆 鈫?Nintendo 鈫?閿綅鏂板 **Wii U**锛屽彲鏀?Cemu 鐨?Wii U GamePad 閿洏缁戝畾
- 鍐欏叆 `portable/controllerProfiles/controller0.xml`锛圵indows VK 鐮侊級锛屽苟纭繚 Cemu 璇诲彇璇?profile
- 宸叉湁鎵嬮厤 profile 涓嶄細琚惎鍔ㄨ鐩栵紝淇濆瓨鏃朵繚鐣?`.before-nest` 澶囦唤

### GBA 閲戞墜鎸?
- GBA 娓告垙鍗″彸閿€岄噾鎵嬫寚鈥︺€嶏細鐩存帴缂栬緫 mGBA `.cheats`
- 榛樿鍐?ROM 鏃佺殑 `<娓告垙鍚?.cheats`锛坢GBA 鑷姩鍔犺浇锛夛紱鐩綍鍙鏃跺洖閫€鍒?Nest 鏁版嵁鐩綍骞?`-c` 浼犲叆
- 鏀寔 GameShark / Action Replay / CodeBreaker / PARv3

### 璁剧疆鎷嗗垎

- 璁剧疆绐楀彛鎷嗘垚 **Nest / Nintendo / Xbox / PlayStation** 鍥涗釜瀛愰〉
- Nest锛氬惎鍔ㄤ笌鐢婚潰銆佹父鎴忔枃浠跺す
- Nintendo锛氱郴缁熸枃浠讹紙GC IPL銆乄ii WAD銆丯DS/DSi 鍥轰欢銆丆emu keys銆乄ii U MLC銆?DS 璇存槑锛夈€侀敭浣?- Xbox / PlayStation锛氶鐣欓〉锛屽垪鍑哄緟鎺ュ叆鏈哄瀷

### 鍏跺畠

- **NGC 绯荤粺妯″紡鎻愰€?*锛氬幓鎺夊浐瀹?3 绉掔瓑寰咃紝spawn 鍒扮偣涓彍鍗曠害 **2.8 绉?*锛堝師鍏?5 绉掍互涓婏級
- DSi 鍥轰欢瀵煎叆淇锛氫笉鍐嶈鎺?NAND 灏鹃儴鍏冩暟鎹?- 閿綅闈㈡澘銆佸皝闈€佽繍琛屼腑楂樹寒绛夋棦鏈夊姛鑳戒繚鎸佷笉鍙?
## 涓嬭浇淇℃伅

| 椤?| 鍊?|
|---|---|
| 鏂囦欢 | `Nest-0.4.1-beta.1-portable.zip` |
| 澶у皬 | 264 MB锛堣В鍘?633 MB / 3171 鏂囦欢锛?|
| SHA256 | `0C38660097C310BCC296A4B051D09096E1591111B88314A4A1E4C4BAEE246308` |

## 棣栨浣跨敤

1. 瑙ｅ帇鍒颁换鎰忕洰褰?2. 鍙屽嚮 `鍚姩 Nest.bat`
3. 鐐广€屾壂鎻忔枃浠跺す銆嶆寚鍚?ROM 鐩綍锛堜箣鍚庢瘡娆″惎鍔ㄨ嚜鍔ㄩ噸鎵級
4. 鍥轰欢/瀵嗛挜锛氳缃?鈫?Nintendo 鈫掋€岀郴缁熸枃浠讹紙鑷锛夈€?
## 宸茬煡闄愬埗

- **3DS 绯荤粺妯″紡鏈帴鍏?*锛氶渶瑕?Azahar 鐨?nand/sysdata 绯荤粺鏂囦欢锛堢湡鏈?+ Artic Setup Tool锛?- Wii U Menu 浠嶄负瀹為獙鎬э紙Cemu 2.6 `nn_act.LoadConsoleAccount` 鏈疄鐜帮級
- NGC / Wii 绯荤粺鑿滃崟閲岃繕涓嶈兘鑷姩鎻掔洏锛沇ii U 鑿滃崟鍙樉绀?MLC 閲屽凡瀹夎鐨?title
- Xbox / PlayStation 瀹舵棌灏氭湭鎺ュ叆锛屾父鎴忓簱涓虹┖
- 鏃犳暟瀛楃鍚嶏細棣栨杩愯 SmartScreen 鎻愮ず锛岄€夈€屾洿澶氫俊鎭?鈫?浠嶈杩愯銆?
瀹屾暣鏀瑰姩瑙?`docs/nintendo/CHANGELOG.md` 鐨?0.4.1-beta.1 鑺傘€?
