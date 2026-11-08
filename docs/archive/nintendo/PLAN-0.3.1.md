# 0.3.1 鏂规璇勫锛堝彧璇昏皟鏌ラ樁娈典骇鍑猴級

> **历史文档 / 已归档。** 这里的“待接入、未支持、已知问题”只描述当时版本，不代表当前状态。当前状态见 `docs/README.md` 与 `docs/ROADMAP.md`。

> 鐘舵€侊細**寰呯敤鎴锋壒鍑嗭紝鏈姩浠讳綍浠ｇ爜**銆傛湰鏂囦欢姹囨€讳笁涓彧璇昏皟鏌ョ殑缁撹涓庢柟妗堬紝鎵瑰噯鍚庢寜銆屾墽琛岄『搴忋€嶄覆琛岃惤鍦般€?> 绾︽潫锛氭湰鏈哄崟灞忥紝浠讳綍 GUI 楠岃瘉鍙兘涓茶銆佺敱 Lead 鎵ц锛沘gent 鍙噯鍦ㄩ攣瀹氱殑鍐欏叆鑼冨洿鍐呮敼鏂囦欢锛屼笉璁歌窇 GUI銆佷笉璁?git銆?
---

## 0. 鑳屾櫙锛?.3.0 渚挎惡鍖呯殑缂洪櫡锛堝凡纭锛?
`dist/Nest-0.3.0-portable.zip`锛堝凡浜や粯鎵嬪伐鐗堬級閲屾贩鍏ヤ簡鎵撳寘鍚庡張璺戞祴璇曞啓鍥炵殑杩愯鏃剁姸鎬侊細

```
resources/engines/melonds/melonDS.toml
  [Emu] ExternalBIOSEnable = true
        DirectBoot = false
  [DS]  BIOS7Path = "E:/workstop/nest-portable/data/melonds/bios/bios7.bin"   鈫?鍒堕€犺€呮満鍣ㄨ矾寰?resources/engines/mgba/.nest-controls-v1
resources/engines/mgba/config.ini.before-nest
resources/engines/mgba/qt.ini          鈫?[mru] 閲屾畫鐣?E:\workstop\nest-assets\roms\...
```

**鍚庢灉**锛氬埆浜鸿В鍘嬪悗 NDS **鐩磋**浼氳蛋鈥滃閮?BIOS + 涓嶇洿鎺ュ惎鍔ㄦ父鎴忊€濈殑鍒嗘敮锛岃€?BIOS 璺緞涓嶅瓨鍦?鈫?寰堝彲鑳藉浐浠舵姤閿?榛戝睆锛岃€屼笉鏄洿鎺ヨ窇 ROM銆?**鏍瑰洜**锛歚clean-engines` 鍙湪鎵撳寘鍓嶈窇锛涗箣鍚庡張鍦ㄤ究鎼虹洰褰曢噷鍚姩楠岃瘉锛屽紩鎿庢妸閰嶇疆鍐欏洖 `resources/engines` 鍚庢墠鍘嬬缉銆?**淇**锛氱粍瑁呴『搴忔敼涓恒€屽厛娓呫€佸悗缁勮銆佸啀浠庣粍瑁呯粨鏋滄墦鍖呫€嶏紝鍘嬬缉鍓嶅 zip 鎴愬憳鍋氭柇瑷€锛堟棤 `.toml/.ini/.nest-controls-*/before-nest`銆佹棤 `E:\workstop` 瀛楃涓诧級锛涢獙璇佸湪**瑙ｅ帇鍓湰**閲屽仛锛屼笉纰板緟鍘嬬缉鐩綍銆?
---

## 1. 灏侀潰榛戝抚锛圕OV-2锛夆€?nest-cover 鏂规

### 鐜扮姸鏈哄埗锛堝凡鏍稿疄锛?
1. supervisor 鍙戝嚭 `running` 鈫?`index.ts` 鐨?`boot()` 鍥炶皟鍏?`clearShots()` 娓?`<userData>/shots/*.png`锛屽啀 `startShotHelper()` 鍚姩 `resources/tools/nest-capture.exe`锛坄--pid --out --interval 5000 --max 60 --log` + 娓呭崟閲岀殑 `capture*` 瑁佸壀鍙傛暟锛?2. 鎶撳睆宸ュ叿姣?5 s 杞鐩爣 pid 鐨?`MainWindowHandle`锛氱獥鍙ｉ』鍙銆侀潪鏈€灏忓寲銆佸墠鍙颁笖鏈閬尅锛屽惁鍒?`skipped frame`
3. 鎶撳埌鐨勭敾闈㈡寜椤哄簭瑁佸壀锛欴PI 缂╂斁 鈫?`captureCropTop/Bottom`锛堝幓鎺夎彍鍗?鐘舵€佹爮锛夆啋 `captureAspect`+`captureAnchor` 鈫?`captureContentAspect`锛堝眳涓榛戣竟锛夆啋 `captureTopOnly`锛堥珮搴﹀噺鍗婏級锛屽瓨 `shot-*.png`锛屾渶澶氱暀 60 甯?4. 寮曟搸 close 鈫?`finishCoverCapture()`锛歬ill helper 鈫?`newestShot()`锛?*鍙寜 mtime 鍙栨渶鏂颁竴寮?*锛夆啋 `copyFile` 鍒?`covers/<gameId>.png` 鈫?`store.updateGame({cover, coverAt})` 鈫?`clearShots()`

### 榛戝抚鏍瑰洜

閫夊抚**娌℃湁浠讳綍鍐呭鍒ゆ嵁**锛氭渶鍚庝竴甯ц惤鍦ㄩ粦杩囨浮/绾櫧鍒濆鍖栧抚鏃跺氨鍘熸牱鎴愪负灏侀潰銆侼DS GTA 閭ｆ 906 B / 317脳237銆佸叏閫氶亾 `mean=std=0`锛沗capture.log` 鏄剧ず鍚屼竴浼氳瘽鍏跺疄瀛樿繃 3 甯у彲鐢ㄧ敾闈紝鍏ㄨ涓㈠純銆傜獥鍙ｅ氨缁墠杩樹細浜х敓 61脳46 绾櫧甯э紝涔熶細琚€変腑銆?
### 鏂规

**C# 渚э紙`NestCapture.cs`锛?*锛氭瘡甯т繚瀛樻椂椤哄甫绠楃粺璁★紙bitmap 宸插湪鍐呭瓨锛屾垚鏈増0锛夊苟杩藉姞 sidecar JSONL锛坄--stats <shots>/stats-<sessionId>.jsonl`锛夛細

```
{file, w, h, mean, stddev, nonblack(鍗犳瘮), colorful(max-min>24 鍗犳瘮), t}
```

**Nest 渚э紙`index.ts`锛?*锛歚pickBestShot()` 璇勫垎閫夊抚

```
score = 0.55*nonblack + 0.30*min(stddev/48, 1) + 0.15*colorful
```

鎺掗櫎鈥滅┖鐧藉抚鈥濓細绾粦锛坣onblack<2% 涓?std<4锛夈€佽繎鍧囧寑锛坰td<1.5锛夈€佺函鐧斤紙mean>245 涓?std<6锛夈€佽繃灏忕獥鍙ｏ紙<160脳120锛夛紱鍚屽垎鍙栨柊銆?
**鍏滃簳**锛氬叏閮ㄧ┖鐧?鈫?涓?`copyFile`銆佷笉 `updateGame`锛屼繚鐣欐棫灏侀潰锛屾棩蹇楀啓 `cover kept: all N frames blank`锛泂idecar 缂哄け锛堟棫 exe / 鏃у寘锛夆啋 鍥為€€鐜版湁 `newestShot`锛岃涓哄畬鍏ㄤ笉鍙樸€?
**娓呯悊**锛歴idecar 鎸?sessionId 闅旂锛屽湪 `finishCoverCapture` 鐨?finally 閲岄殢 `clearShots()` 涓€璧峰垹锛坄clearShots` 鐜板湪鍙垹 `.png`锛岄渶鎵╁睍锛夈€?
### 楠岃瘉锛堜笉闈犲墠鍙版埅灞忥級

- 绾嚱鏁?`pickBestShot` 鐢ㄥ浐瀹?stats 鏁扮粍鍋氬崟娴嬶紙闇€鎵瑰噯鏂板 `tests/cover.test.ts`锛?- 瀵?`covers/*.png` 鐢?Pillow 绠?`mean/std/nonblack/colorful`锛屼笌 sidecar 鏂█鈥滈€変腑甯у緱鍒嗘渶楂樷€?- 鐪熸満涓ゆ涓茶楠岃瘉锛歂DS GTA锛堥粦鍦烘櫙 鈫?灏侀潰闈炲叏榛戯級+ GBA锛堟甯稿満鏅洖褰掞級

### 椋庨櫓

- 琛屼负浠庘€滄渶鍚庝竴甯р€濆彉鎴愨€滄渶浣冲抚鈥濓紝灞炴敼鍠勶紱mGBA/GBA 姝ｅ父甯у垎鏁伴珮锛屽繀琚€変腑
- 鈥滃叏榛戜繚鏃у浘鈥濆彧鍦ㄥ紓甯告椂鐢熸晥锛屼笉鍒犱换浣曞浘
- Dolphin 124px 璀﹀憡寮圭獥鏈潵灏辫 `captureMinHeight` 璺宠繃
- 骞跺彂澶氬紑鍏辩敤 `shots` 鐩綍鏄棦鏈夐棶棰橈紝涓嶆伓鍖?
**鍐欏叆鑼冨洿**锛歚src/main/index.ts`銆乣tools/capture/NestCapture.cs`銆乣tools/build-capture.ps1`锛? 鍙€?`tests/cover.test.ts`锛夈€?
---

## 2. 鍏嶅畨瑁呯増涓€閿瀯寤?+ 鑷姩楠岃瘉 鈥?nest-release 鏂规

### 姝ラ搴忓垪

```
npm run build                          src/ 鈫?out/
node tools/clean-engines.mjs           娓?resources/engines 杩愯鏃剁姸鎬侊紱鍙戠幇鏈湴璺緞鍒?exit 1
electron-builder --win --x64 --dir     out/+package.json 鈫?dist/win-unpacked/
                                       锛圢est.exe銆乺esources/app.asar銆乺esources/engines銆乺esources/tools锛?rm -rf dist/win-unpacked dist/portable 鏃т骇鐗?  鈫?蹇呴』鍏堟竻锛?za 鏄閲忔洿鏂?cp -r dist/win-unpacked dist/portable/Nest-<version>/
   + 3 涓ā鏉匡紙鍚姩 Nest.bat銆佷究鎼烘暟鎹ā寮?bat銆佷娇鐢ㄨ鏄?txt锛?7za a -tzip -mx=1 -y dist/Nest-<version>-portable.zip *   锛坈wd 鍦ㄤ究鎼虹洰褰曞唴锛屼繚璇佽В鍘嬪钩閾猴級
sha256 鈫?dist/checksums.txt
```

### 蹇呴』鐨勭幆澧?
```
ELECTRON_BUILDER_CACHE=E:\workstop\nest\.cache\electron-builder
ELECTRON_CACHE=E:\workstop\nest\.cache\electron
TEMP=鈥.cache\tmp   TMP=鈥.cache\tmp
```

鍘熷洜锛氬彈闄愯处鎴峰啓涓嶄簡 `%LOCALAPPDATA%`/绯荤粺 TEMP锛宔lectron-builder 瑙?winCodeSign/nsis銆乤pp-builder 涓存椂鏂囦欢浼氬け璐ワ紱`electronDist` 宸叉寚鏈湴 Electron锛屾棤闇€鑱旂綉銆傚瓙杩涚▼瑕佹竻 `ELECTRON_RUN_AS_NODE`锛堟湰鏈哄叏灞€=1锛屽惁鍒?Electron 琚綋 node 璺戯級銆?
### 鎵撳寘鍐呭鏂█锛堟柊澧烇紝闃叉湰娆′簨鏁呭鐜帮級

- 蹇呴』鍚細`Nest.exe`銆乣resources/app.asar`銆? 涓紩鎿庣洰褰?+ 5 浠?`*.json` 娓呭崟銆乣resources/tools`锛? 涓?exe + SDL3.dll锛夈€? 涓惎鍔?璇存槑鏂囦欢
- 蹇呴』鎺掗櫎锛歚data/`銆乣*.toml`/`*.ini` 杩愯鏃剁姸鎬併€乣.nest-controls-*`銆乣*.before-nest`銆佷换浣曞惈 `E:\workstop` 鐨勬枃鏈枃浠?- 鐗堟湰鍙峰敮涓€鏉ユ簮 `package.json` 鐨?`version`锛涚洰褰曞悕 / zip 鍚?/ checksums 涓夎€呬竴鑷存柇瑷€

### 鑷姩楠岃瘉锛坄tools/verify-portable.mjs`锛?
1. 瑙ｅ帇 zip 鍒颁复鏃剁洰褰?2. `Nest.exe --no-sandbox --user-data-dir=<tmp>\data --smoke` 鈫?鏂█閫€鍑虹爜 0 + 鏃ュ織 `smoke ok: renderer rendered`
3. `--scan=E:\workstop\nest-assets\roms\gba --trylaunch=gba --hold=10000` 鈫?鏂█閫€鍑虹爜 0 + `trylaunch ok`
4. 鏂█ `data/covers/*.png` 鈮? 涓?`library.json` 瀵瑰簲 cover 闈炵┖锛堢函榛戝抚 906 B 浣滀负 warning锛屽儚绱犺川閲忓綊 COV-2锛?5. 缁撴潫鍚?`taskkill` 娓呯悊 Nest/mGBA 娈嬬暀

### 椋庨櫓

- 閲嶅鏋勫缓娈嬬暀浼氭贩鍖咃紙蹇呴』 rm -rf 鏃х洰褰?鏃?zip锛?- 鍏ㄦ祦绋嬬害 3鈥? min锛宒ist 闇€ ~1 GB 浣欓噺锛堝綋鍓嶇┖闂?53 GB锛?- 姝ｅ紡鍑哄寘蹇呴』绛夊叾浠栦唬鐮佹敼鍔ㄦ敹灏惧悗閲嶈窇锛堜笉鑳芥墦杩涗腑闂存€侊級

**鍐欏叆鑼冨洿**锛歚tools/build-portable.mjs`銆乣tools/verify-portable.mjs`銆乣tools/portable/**`銆乣package.json` scripts銆?
---

## 3. ares 閿洏缁戝畾锛圛NP-2锛夆€?寰呰ˉ

nest-eng 灏氭湭浜ゅ洖瀹屾暣鏂规锛堝彧瀹屾垚浜嗙幆澧冩帰閽堬紝鏈骇鍑虹粨璁猴級銆傚凡鐭ヤ簨瀹烇細

- ares 婧愮爜 `desktop-ui/input/input.cpp`锛歚assignment = identifier + "/" + groupID + "/" + inputID`锛泃oken[0] 涓嶄互 `0x` 寮€澶存椂蹇呴』 **4 娈?*锛坕dentifier 鑷韩鍚?`/`锛夛紝鎵€浠?`Keyboard/0/40`锛? 娈碉級琚洿鎺ュ拷鐣?- 宸茶瘯鍊欓€?`0x0/0/40`锛坉eviceID=0銆乬roup=0銆丼DL scancode Enter锛夊疄娴嬫棤鏁?- 鏈€鍙潬璺緞锛氬湪涓€娆″彈鎺?GUI 瀹為獙閲岀敤 ares 鑷繁鐨勮缃晫闈㈡墜鍔ㄧ粦涓€缁勯敭 鈫?閫€鍑?鈫?diff `settings.bml` 寰楀埌鐪熷疄缂栫爜
- 璇ュ疄楠岄渶瑕佺嫭鍗犳闈紝鍙兘鐢?Lead 鎵ц

**璁″垝**锛歀ead 鍏堝仛瀹為獙鎷挎牸寮?鈫?鍐嶆妸銆屽啓 settings.bml 鐨?`ensureAresControls`銆嶄氦缁?nest-eng 瀹炵幇锛堝啓鍏?`src/main/ipc.ts`锛屽弬鐓?`ensureMgbaControls` 鐨勨€滃彧鍐欎竴娆?+ `.before-nest` 澶囦唤鈥濇ā寮忥級銆?
---

## 4. 鎵ц椤哄簭锛堝緟鎵瑰噯锛?
| # | 浠诲姟 | 鍐欏叆鑰?| 楠岃瘉鑰?| 闇€瑕?GUI |
|---|---|---|---|---|
| 1 | 閲嶆墦骞插噣渚挎惡 zip锛堜慨 NDS 闅愭偅 + 鍐呭鏂█锛?| nest-release | Lead | 鍚?|
| 2 | 鎵撳寘鑷姩鍖?`npm run portable` / `verify:portable` | nest-release | Lead | 鍚?|
| 3 | 灏侀潰榛戝抚淇 | nest-cover | Lead锛堜覆琛?2 娆★級 | 鏄?|
| 4 | ares 閿綅锛氬疄楠?鈫?瀹炵幇 鈫?鏂囨。 | Lead 瀹為獙 鈫?nest-eng 鍐?| Lead | 鏄紙1 娆★級 |

绾緥锛氭瘡涓换鍔″紑濮嬪墠鐢?Lead 鍦ㄤ换鍔℃澘涓婇攣瀹氬啓鍏ヨ寖鍥达紱agent 涓嶈窇 GUI銆佷笉鍋?git锛涘畬鎴愬悗 Lead 缁熶竴 typecheck + test + 鏋勫缓 + 鎵撴柊鍖?+ 鎻愪氦銆?
