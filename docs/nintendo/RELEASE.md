# 鎵撳寘涓庡彂甯冮』鐭?
> **鐘舵€侊細褰撳墠鍙彂鍏嶅畨瑁呮惡甯︾増**锛堟渶鏂?`Nest-0.4.2-beta.1-portable.zip`锛夆€斺€?鍙傝 `docs/nintendo/DECISIONS.md` D20锛涙柊娴佺▼瑙?`docs/nintendo/RELEASE-RUNBOOK.md`銆?>
> **鏃х姸鎬侊紙2026-10-29锛?*锛氬綋鍓嶅彧鍙?*鍏嶅畨瑁呮惡甯︾増**
> `Nest-0.3.0-portable.zip`锛堣В鍘嬪悗鍙屽嚮 `鍚姩 Nest.bat`锛夛紝涓嶅仛 NSIS 瀹夎鍖呫€?> 涓嬮潰鍏充簬瀹夎鍣ㄣ€佹敞鍐岃〃銆佸嵏杞界殑绔犺妭淇濈暀浣滀负**灏嗘潵闇€瑕佸畨瑁呯増鏃剁殑鍙傝€?*锛屼笉鏄綋鍓嶅彂甯冩祦绋嬨€?> 褰撳墠鍙戝竷娴佺▼瑙?`docs/nintendo/CHANGELOG.md` 鐨勩€屾墦鍖呬笌鍙戝竷銆嶄竴鑺傘€?
> 缁欐湭鏉ョ殑鑷繁/鎺ユ墜鑰呯湅銆?*鐜板湪杩樻病鏈夋墦鍖?*鈥斺€旇繖浠芥枃妗ｆ槸鍔ㄦ墜閭ｅぉ鐨勬竻鍗曪紝涓嶆槸鐜扮姸璇存槑銆?> 鐩爣锛氬儚姝ｅ父 Windows 绋嬪簭涓€鏍峰畨瑁呫€佽兘鍦ㄦ帶鍒堕潰鏉垮嵏杞姐€佸畨瑁呯洰褰曞竷灞€鍥哄畾銆佸紩鎿庢敹绾冲悎鐞嗐€?
## 0. 浠€涔堟墠绠椾竴涓?release

- 鉁?缂栬瘧浜х墿锛堝畨瑁呭寘锛夛紝涓嶆槸浠撳簱蹇収
- 鉁?鐗堟湰璇存槑锛堣繖鐗堟湁浠€涔堛€佹€庝箞瑁呫€佸凡鐭ラ棶棰橈級
- 鉁?SHA-256 鏍￠獙鍊硷紙鏀?Release 姝ｆ枃閲岋級
- 鉁?骞插噣瀹夎楠岃瘉锛氭柊鐢ㄦ埛鐩綍 鈫?瀹夎 鈫?鍚姩 鈫?鎵弿 鈫?鐜╂父鎴?鈫?鍗歌浇

浠撳簱 tag 鍙槸浠ｇ爜閲岀▼纰戯紝涓嶇瓑鍚屼簬 Release銆?
## 1. 鎵撳寘鍓嶅繀椤诲厛淇殑涓ゅ浠ｇ爜

### 1.1 鎶撳睆宸ュ叿鍦?asar 閲屾墽琛屼笉浜?
`src/main/index.ts`锛?
```ts
function captureToolPath(): string {
  const base = app.isPackaged ? process.resourcesPath : app.getAppPath();
  return path.join(base, 'resources', 'tools', 'nest-capture.exe');
}
```

### 1.2 寮曟搸鐩綍蹇呴』瑙ｅ寘

`enginesDir()` 宸茬粡鎸?`app.isPackaged` 鍒嗘敮鍒?`process.resourcesPath`锛屼笉鐢ㄦ敼锛涗絾瑕佸湪 electron-builder 閲岀敤 `extraResources` 鎶婂畠鎷峰嚭鍘伙紙瑙佺 3 鑺傦級銆?
鍙﹀ `startLaunch()` 閲岀粰 node 鍨嬪紩鎿庢嫾鑴氭湰璺緞鐢ㄧ殑鏄?`app.getAppPath()`銆傛墦鍖呭悗 fake 寮曟搸涓嶄細闅忓寘锛岃繖鏉″垎鏀彧褰卞搷寮€鍙戯紝鍙互涓嶅姩锛屼絾**涓嶈**鍦ㄦ墦鍖呯増閲岀暀鈥滄壘涓嶅埌鑴氭湰鈥濈殑闈欓粯澶辫触銆?
## 2. 瀹夎鍚庣殑鐩綍甯冨眬锛堝畾姝伙紝鍒殢鎰忔敼锛?
```
%LOCALAPPDATA%\Programs\Nest\
鈹溾攢 Nest.exe
鈹溾攢 Uninstall Nest.exe
鈹溾攢 resources\
鈹? 鈹溾攢 app.asar            鈫?搴旂敤浠ｇ爜
鈹? 鈹溾攢 engines\            鈫?鍐呯疆寮曟搸锛堟湰鐗堝彧鏈?mgba锛?鈹? 鈹? 鈹斺攢 mgba\mGBA.exe 鈥?鈹? 鈹斺攢 tools\
鈹?    鈹斺攢 nest-capture.exe
鈹斺攢 locales\ 鈥?            鈫?Electron 鑷甫
```

鐢ㄦ埛鏁版嵁锛?*涓嶉殢鍗歌浇鍒犻櫎**锛夛細

```
%APPDATA%\Nest\
鈹溾攢 library.json
鈹溾攢 covers\
鈹溾攢 shots\
鈹溾攢 nest.log
鈹斺攢 engines\               鈫?鐢ㄦ埛鑷/鏇存柊鐨勫紩鎿庯紙鍙啓锛?```

## 3. electron-builder 閰嶇疆锛坄electron-builder.yml`锛?
```yaml
appId: com.parmetty.nest
productName: Nest
copyright: Copyright 漏 2026 Nest contributors

directories:
  output: release
  buildResources: build

files:
  - out/**
  - package.json

extraResources:
  - from: resources/engines
    to: engines
  - from: resources/tools
    to: tools

asar: true
asarUnpack:
  - "**/*.node"

win:
  target:
    - target: nsis
      arch: [x64]
  icon: build/icon.ico
  # 鏆備笉绛惧悕锛氳绗?9 鑺?
nsis:
  oneClick: false
  perMachine: false                     # 瑁呭埌 %LOCALAPPDATA%锛屼笉闇€瑕佺鐞嗗憳
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: Nest
  uninstallDisplayName: Nest
  deleteAppDataOnUninstall: false       # 榛樿淇濈暀搴撳拰灏侀潰
  artifactName: Nest-${version}-Setup.${ext}
```

`npm scripts`锛?
```json
{
  "build:capture": "powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-capture.ps1",
  "dist": "npm run build:capture && npm run build && electron-builder --win",
  "dist:dir": "npm run build:capture && npm run build && electron-builder --win --dir"
}
```

`dist:dir` 鍙骇鍑鸿В鍖呯洰褰曪紝鐢ㄦ潵蹇€熼獙璇佽矾寰勯棶棰橈紝涓嶆墦瀹夎鍖呫€?
## 4. 娉ㄥ唽琛ㄤ笌瀹夎琛屼负

electron-builder 鐨?NSIS 浼氳嚜鍔ㄥ鐞嗭細

| 鍐呭 | 浣嶇疆 |
| --- | --- |
| 鍗歌浇鍏ュ彛锛堟帶鍒堕潰鏉垮彲瑙侊級 | `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\<appId>` |
| 瀹夎璺緞銆佺増鏈€佸彂甯冭€?| 鍚屼笂锛屼綔涓洪敭鍊?|
| 寮€濮嬭彍鍗?/ 妗岄潰蹇嵎鏂瑰紡 | `%APPDATA%\Microsoft\Windows\Start Menu\Programs` / 妗岄潰 |

**鏂囦欢鍏宠仈榛樿涓嶅仛**銆傚鏋滀互鍚庤鍋氾紙鍙屽嚮 `.gba` 杩?Nest锛夛細

```yaml
fileAssociations:
  - ext: gba
    name: Game Boy Advance ROM
    role: Editor
```

浠ｄ环锛氫細鎶㈣蛋鐢ㄦ埛宸叉湁鐨勫叧鑱旓紝鍗歌浇瑕佸共鍑€鎽橀櫎锛岃€屼笖瑕佸鐞嗏€滅敤鎴蜂笉鎯冲叧鑱斺€濈殑閫夐」銆傝瘎鍒嗭細鏀剁泭灏忋€侀夯鐑﹀ぇ锛?*寤鸿鍋氭垚瀹夎鍚戝閲岀殑鍙€夊嬀閫?*锛屽埆榛樿寮€銆?
## 5. 寮曟搸鏀剁撼绛栫暐

| 寮曟搸 | 鏀惧摢 | 涓轰粈涔?|
| --- | --- | --- |
| mGBA锛堝唴缃紝MPL 2.0锛?| 瀹夎鐩綍 `resources/engines/mgba/` | 闅忕増鏈蛋锛屽紑绠卞嵆鐢紝绾?41.5 MB |
| ares锛堝唴缃紝ISC锛?| 瀹夎鐩綍 `resources/engines/ares/` | FC/SFC/N64 涓夊悎涓€锛岀害 42.6 MB锛堝凡鍘绘帀 `Shaders/`锛?|
| Dolphin锛堝唴缃紝GPLv2+锛?| 瀹夎鐩綍 `resources/engines/dolphin/` | NGC/Wii锛岀害 57 MB锛涘繀椤婚殢鍖呭甫 VC++ 14.51 鐨?4 涓?DLL |
| Cemu锛堥棴婧愶紝閲嶏級 | 鐢ㄦ埛鐩綍 `%APPDATA%\Nest\engines\` | 涓嶉殢鍖呭垎鍙戯紝閬垮紑璁稿彲鍜屼綋绉?|
| 鐢ㄦ埛鎸囧畾璺緞 | 璁板湪 `library.json` 鐨?settings 閲?| 鍏滃簳 |

鎺㈡祴椤哄簭锛坄EngineRegistry`锛夛細**鐢ㄦ埛鐩綍 鈫?瀹夎鐩綍 鈫?绯荤粺瀹夎璺緞**銆?
### 5.1 鍏抽敭鍧戯細寮曟搸鐩綍鍙啓鎬?
mGBA 鏄究鎼烘ā寮忥紙`portable.ini`锛夛紝閰嶇疆鍐欏湪 exe 鏃佽竟鐨?`config.ini`銆傚鏋滅敤鎴锋妸 Nest 瑁呭埌 `C:\Program Files`锛坧erMachine + 鑷畾涔夎矾寰勶級锛?*寮曟搸鐩綍涓嶅彲鍐欙紝mGBA 浼氫繚瀛樹笉浜嗚缃拰瀛樻。閰嶇疆**銆?
涓や釜瑙ｆ硶锛岄€変竴涓細

- **A锛堟帹鑽愶級**锛氶娆¤繍琛屾椂鎶?`resources/engines/mgba/` 鏁翠釜澶嶅埗鍒?`%APPDATA%\Nest\engines\mgba\`锛屼箣鍚庝竴寰嬩粠鐢ㄦ埛鐩綍鍚姩銆傚畨瑁呯洰褰曚繚鎸佸彧璇伙紝鐢ㄦ埛杩樿兘鏀归厤缃拰鐫€鑹插櫒銆?- **B**锛氬己鍒?per-user 瀹夎锛堥粯璁ら厤缃氨鏄繖鏍凤級锛屽苟鍦ㄦ枃妗ｉ噷鍐欌€滃埆瑁呭埌闇€瑕佺鐞嗗憳鐨勭洰褰曗€濄€?
閫?A 鏇寸ǔ锛屼絾瑕佸鐞嗏€滅増鏈崌绾ф椂鎬庝箞鏇存柊寮曟搸鍓湰鈥濓紙姣旇緝鐗堟湰鍙凤紝鎴栨瘡娆″惎鍔ㄦ牎楠屽搱甯岋級銆?
### 5.2 瀛樻。浣嶇疆

mGBA 榛樿鎶?`.sav` 鍐欏湪 ROM 鏃佽竟锛屼笉鏄?Nest 鐨勬暟鎹洰褰曘€傚彂甯冭鏄庨噷瑕佽娓呮锛?*瀛樻。璺熺潃 ROM 璧?*銆備互鍚庤鍋氣€滅粺涓€瀛樻。绠＄悊鈥濓紝灏卞緱鍦ㄥ惎鍔ㄥ墠鎶?ROM 鎵€鍦ㄧ洰褰曠撼鍏ュ浠界瓥鐣ワ紝鎴栬€呯敤 mGBA 鐨?`-C savegamePath=` 瑕嗙洊銆?
## 6. 鏋勫缓娴佺▼

```powershell
npm ci
npm run build:capture      # 闇€瑕?.NET Framework 4.x 鐨?csc.exe
npm run typecheck
npm test
npm run dist               # 浜у嚭 release\Nest-<version>-Setup.exe
```

绗竴娆℃瀯寤哄墠鍏堟竻骞插噣锛歚rm -rf out release`锛岄伩鍏嶆棫浜х墿娣疯繘鍘汇€?
## 7. 浣撶Н棰勪及

| 缁勬垚 | 澶у皬 |
| --- | --- |
| Electron 杩愯鏃?| ~90 MB |
| mGBA 0.10.5 | 41.5 MB |
| ares v148锛團C/SFC/N64锛?| 42.6 MB |
| Dolphin 2609a锛圢GC/Wii锛?| 57 MB |
| 搴旂敤浠ｇ爜 + 璧勬簮 | ~5 MB |
| **瀹夎鍖咃紙LZMA 鍘嬬缉鍚庯級** | **绾?190鈥?20 MB** |

濡傛灉瀚屽ぇ锛歮GBA 鐨?`shaders/`銆乣scripts/`銆乣licenses/` 鍙湁鍑?MB锛屽彲绮剧畝锛涗絾 `licenses/` **涓嶈兘鍒?*锛圡PL 2.0 瑕佹眰淇濈暀锛夈€?
## 8. 鐗堟湰涓?Release 娴佺▼

1. 鏀?`package.json` 鐨?`version`锛坰emver锛?.3.0銆?.3.1鈥︼級
2. 鏇存柊 `docs/nintendo/STATE.md` 鐨勫彂甯冪姸鎬?3. `git tag -a v0.3.0 -m "..."`锛屾帹 tag
4. 鏋勫缓瀹夎鍖咃紝绠?SHA-256锛歚Get-FileHash release\Nest-0.3.0-Setup.exe -Algorithm SHA256`
5. GitHub Release锛?   - Title锛歚Nest 0.3.0`
   - 闄勫畨瑁呭寘 + SHA-256
   - 姝ｆ枃鐢ㄤ笅闈㈢殑妯℃澘

```markdown
## Nest 0.3.0

### 鏂板
- FC / SFC / N64 鎵弿涓庡惎鍔?- 瀛樻。澶囦唤

### 淇
- 鈥?
### 宸茬煡闂
- 鏈鍚嶏紝棣栨杩愯浼氬脊 SmartScreen锛氱偣銆屾洿澶氫俊鎭€嶁啋銆屼粛瑕佽繍琛屻€?- 鍙敮鎸?Windows x64

### 瀹夎
涓嬭浇 `Nest-0.3.0-Setup.exe`锛屽弻鍑诲畨瑁呫€傛暟鎹湪 `%APPDATA%\Nest`锛屽嵏杞戒笉浼氬垹闄ゃ€?SHA-256: `鈥
```

## 9. 绛惧悕锛堟殏鏃朵笉鍋氾級

鏈鍚嶇殑鍚庢灉锛氶娆¤繍琛?Windows SmartScreen 鎷︿竴涓嬶紝鐢ㄦ埛鐐广€屾洿澶氫俊鎭?鈫?浠嶈杩愯銆嶅嵆鍙€?浠ｇ爜绛惧悕璇佷功锛圤V 绾?$200/骞达紝EV 鏇磋吹锛夌瓑鏈夌湡瀹炵敤鎴峰啀璇淬€?*涓嶈鍦?README 閲岄殣鐬掕繖浠朵簨**銆?
## 10. 瀹夎鍚庡啋鐑熸竻鍗?
瑁呭畬鍦ㄤ竴鍙板共鍑€鏈哄櫒锛堟垨鍒犳帀 `%APPDATA%\Nest` 鐨勮櫄鎷熸満锛変笂閫愭潯杩囷細

- [ ] 瀹夎鍚戝鑳介€夎矾寰勶紝瑁呭畬妗岄潰/寮€濮嬭彍鍗曟湁鍥炬爣
- [ ] 鍙屽嚮鍚姩锛屼富绐楀彛姝ｅ父鍑虹幇锛堜笉鏄櫧灞忋€佷笉鏄竴闂€岃繃锛?- [ ] 宸︿晶涔濆彴涓绘満閮藉湪锛孏BA 鑳借繘娓告垙搴?- [ ] 鎵弿涓€涓惈 `.gba` 鐨勭洰褰曪紝鍗＄墖鍑虹幇
- [ ] 鍚姩娓告垙 鈫?mGBA 寮瑰嚭 鈫?Nest 鏈€灏忓寲 鈫?閫€鍑哄悗杩樺師
- [ ] 灏侀潰鐢熸垚锛坄%APPDATA%\Nest\covers\<id>.png`锛屽昂瀵?480脳320 宸﹀彸锛?- [ ] 鍙抽敭鍗＄墖 鈫?浠庡簱涓Щ闄わ紝ROM 鏂囦欢浠嶅湪
- [ ] 璁剧疆閲屼袱涓紑鍏宠兘鏀广€侀噸鍚悗淇濇寔
- [ ] 鍗歌浇锛氭帶鍒堕潰鏉胯兘鐪嬪埌銆佽兘鍗稿共鍑€锛沗%APPDATA%\Nest` 鎸夐鏈熶繚鐣?- [ ] 瀹夎鐩綍閲屾病鏈夋贩杩?`.roms`銆乣.profile`銆乣diag` 杩欑被寮€鍙戞畫鐣?- [ ] **寮曟搸閰嶇疆鏂囦欢閲屾病鏈夋湰鍦拌矾寰?*锛坅res 鐨?`settings.bml` 浼氬啓 `Path:` 鍜?`Recent`锛?      mGBA 鐨?`qt.ini` 浼氬啓绐楀彛浣嶇疆鍜屾渶杩戞墦寮€锛汧CEUX 鐨?`fceux.cfg` 浼氬啓 `recent_files`锛夈€?      鎵撳寘鍓嶇敤浠撳簱閲岀殑骞插噣鐗堟湰瑕嗙洊锛屽埆鎶婅嚜宸辨満鍣ㄤ笂鐨勮矾寰勫甫杩涘彂琛屽寘銆?
## 11. 甯歌鍧戯紙閮借俯杩囷級

| 鐜拌薄 | 鍘熷洜 | 澶勭悊 |
| --- | --- | --- |
| 鎵撳寘鐗堝惎鍔ㄥ嵆宕?| 榛樿 userData 鍦?`%APPDATA%` 涓斿啓鍏ュけ璐?| 姝ｅ父鏈哄櫒涓嶄細锛涘彈闄愮幆澧冪敤 `--user-data-dir` |
| exe 涓€闂€岃繃銆佹棤绐楀彛 | 瀛愯繘绋?`windowsHide: true` 鎶?GUI 棣栦釜绐楀彛钘忎簡 | 鍘熺敓寮曟搸涓€寰?`windowsHide: false`锛堝凡鍦?supervisor 閲屽尯鍒嗭級 |
| 鎶撳睆涓嶅伐浣?| exe 鍦?asar 閲?| 瑙?1.1 |
| 寮曟搸鈥滄湭鎵惧埌鈥?| `extraResources` 璺緞涓嶅锛屾垨娓呭崟閲岀殑 `{engines}` 娌¤В鏋?| 妫€鏌?`process.resourcesPath\engines` 鏄惁瀛樺湪 |
| `npm install` 鍗″湪 Electron 涓嬭浇 | 缃戠粶 | 璁?`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` |
| 棣栨杩愯娌″皝闈?| 娓告垙杩愯鏃堕棿 < 鎶撳睆闂撮殧锛? 绉掞級 | 姝ｅ父锛岀帺涔呬竴鐐瑰氨鏈変簡 |
| 鍗歌浇鍚庨厤缃繕鍦?| `deleteAppDataOnUninstall: false` | 璁捐濡傛锛屾枃妗ｉ噷璇存槑 |

## 12. 浠ュ悗鍙互鍋氱殑

- **鑷姩鏇存柊**锛歚electron-updater` + GitHub Releases锛堥渶瑕佺鍚嶆墠骞插噣锛?- **CI 鍑哄寘**锛欸itHub Actions `windows-latest`锛屾墦 tag 鏃惰嚜鍔ㄦ瀯寤哄苟涓婁紶 artifact锛堜笉闇€瑕佺鍚嶄篃鑳借窇锛?- **渚挎惡鐗?*锛歚target: portable`锛屼竴涓?exe锛岄€傚悎鏀?U 鐩橈紱鍜屽畨瑁呯増鍏辩敤鍚屼竴浠?`%APPDATA%` 鏁版嵁
- **澶氳瑷€**锛歚build/installer.nsh` 鍔犱腑鏂囪瑷€鍖?- **浠撳簱鐦﹁韩**锛歚resources/engines/` 41MB 杩?Git LFS锛屾垨鏀规垚棣栨杩愯涓嬭浇锛堜細鐗虹壊寮€绠卞嵆鐢級

