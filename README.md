# SkyRoute

SkyRoute は、航空機の運航情報と航空気象情報を **Google Photorealistic 3D Maps** 上で可視化する個人開発のWebアプリです。

便を選択すると、航空機の現在位置・高度・速度・航跡・予定経路などを3D地図上に表示し、出発地・到着地の気象、航路周辺のSIGMET、気象庁のナウキャストもあわせて確認できます。

Geminiによる日本語のAI解説と、Google Cloud Text-to-Speechによる音声読み上げにも対応しています。

公開版:

https://skyroute-331230486346.asia-northeast1.run.app/

---

## SkyRouteでできること

主な機能は次のとおりです。

- 主要空港の出発便一覧
- 飛行中の航空機と今後3時間の出発予定便の表示
- 航空機の現在位置・高度・速度・方位の表示
- Actual Track / Filed Route / Estimated Route の3D表示
- Preview Flight / Replay Track
- 機種・航空会社に応じたGLB航空機モデルの切り替え
- METARによる現在の空港気象
- TAFによる空港気象予報
- SIGMETの3D空域表示
- 気象庁NOWCASTによる降水・雷・竜巻発生確度の表示
- Geminiによる飛行状況・気象情報のAI解説
- AI解説の音声読み上げ
- PC / スマートフォン対応UI

---

## ROUTE

ROUTEはSkyRouteのメイン画面です。

空港を選択して「更新」を押すと、

- 現在飛行中の出発便
- 今後3時間の出発予定便

を取得します。

対応空港は次の7空港です。

| 空港 | IATA | ICAO |
|---|---|---|
| 東京国際空港（羽田） | HND | RJTT |
| 成田国際空港 | NRT | RJAA |
| 関西国際空港 | KIX | RJBB |
| 大阪国際空港（伊丹） | ITM | RJOO |
| 新千歳空港 | CTS | RJCC |
| 福岡空港 | FUK | RJFF |
| 那覇空港 | OKA | ROAH |

初期空港は羽田です。

APIコストを抑えるため、便一覧は自動更新せず、ユーザーが「更新」を押した時に再取得します。

便を選択すると、飛行情報、3D経路、気象情報などを表示します。

---

## LIVE と DEMO

SkyRouteには2つのデータモードがあります。

### LIVE

FlightAware AeroAPIから実際の運航データを取得します。

主な表示項目:

- 便名
- 出発空港 / 到着空港
- 機種
- 現在位置
- 高度
- 対地速度
- 方位
- 上昇 / 巡航 / 下降などの飛行フェーズ
- 残距離
- 残時間の目安
- 出発・到着の予定時刻 / 推定時刻 / 実績時刻
- 遅延
- Filed Route
- Actual Track

現在位置は原則として手動更新です。

「自動更新」をONにした場合のみ、一定間隔で現在位置を再取得します。

### DEMO

AeroAPIが利用できない場合でも、SkyRouteの3D表示や操作を確認できるシミュレーションモードです。

DEMOの機体位置・高度・速度・経路はシミュレーションですが、SIGMETとNOWCASTは現在の実世界データを利用します。

---

## 3種類のルート表示

SkyRouteでは、ルートの種類を区別して表示します。

| 種類 | 意味 |
|---|---|
| ACTUAL | 実際に飛行した航跡 |
| FILED | AeroAPIから取得できた予定経路 |
| ESTIMATED | Filed Routeが使えない場合などにSkyRoute側で生成した推定経路 |

画面の「ルート色」パネルで凡例を確認できます。

Preview Flightでは、現在位置を取得できる飛行中の便については、**現在位置から到着空港まで**を再生します。

Replay TrackではActual Trackを使って過去の航跡を再生します。

経由点では急な直角旋回にならないよう、経路を滑らかに補間しています。

---

## 航空機3Dモデル

航空機はGLBモデルで表示します。

現在は次のモデルを同梱しています。

- Airbus A320 / ANA
- Airbus A320 / Jetstar Japan
- Airbus A320 / Peach
- Airbus A320 / StarFlyer
- Airbus A321 / ANA
- Airbus A350-900 / JAL
- Boeing 737-800 / ANA
- Boeing 737-800 / JAL
- Boeing 737-800 / Skymark
- Boeing 767-300 / JAL
- Boeing 787-8 / JAL
- Boeing 787-9 / ANA
- Boeing 787-10 / SkyRoute

LIVEでは取得した機種・航空会社に応じて対応モデルを自動選択します。

起動時は、同梱モデルの中からランダムに1機を羽田空港付近へ表示します。

---

## カメラ

カメラは次の5種類です。

| モード | 内容 |
|---|---|
| CLOSE | 機体のすぐ後方から追従 |
| FOLLOW | 後方斜め上から追従 |
| COCKPIT | 操縦席に近い視点 |
| OVERVIEW | 航路全体を把握しやすい俯瞰表示 |
| FREE | 自由操作 |

方位、回転、TILTも変更できます。

地図モードは、

- HYBRID
- SATELLITE

を切り替えられます。

---

# 航空気象

SkyRouteでは、1つのAPIだけに依存せず、複数の情報源を組み合わせています。

| 情報 | 主な取得元 | 用途 |
|---|---|---|
| METAR | FlightAware AeroAPI | 出発・到着空港の現在観測 |
| TAF | FlightAware AeroAPI | 出発・到着空港の気象予報 |
| SIGMET | NOAA Aviation Weather Center | 航路周辺の危険気象 |
| 降水NOWCAST | 気象庁 | 現在～約60分後の降水 |
| 雷NOWCAST | 気象庁 | 雷活動度 |
| 竜巻発生確度NOWCAST | 気象庁 | 激しい突風の発生しやすさ |

SIGMETとNOWCASTはデフォルトでONです。

便や航路が選択されると、自動的に必要なデータを取得します。

---

## METAR

METARは空港の現在の気象観測です。

SkyRouteではAeroAPIの空港気象観測APIから、出発空港と到着空港の最新観測を取得します。

主にAI解説で、

- 風
- 視程
- 雲
- 気温
- 気圧
- 現在の気象

などを説明するために利用します。

取得結果は5分間キャッシュします。

---

## TAF

TAFは空港の将来の気象予報です。

SkyRouteではAeroAPIの

`/airports/{ICAO}/weather/forecast`

から取得します。

AI解説ではMETARとTAFを区別し、

- METAR = 現在の観測
- TAF = この先の予報

として説明します。

これにより、「現在は良好だが、到着予定時間帯には視程低下が予報されている」といった時間軸を含む解説が可能になります。

---

## SIGMET

SIGMETは、航空機の運航に影響する可能性のある重要な気象現象を知らせる航空向け情報です。

SkyRouteではNOAA Aviation Weather CenterのInternational SIGMET APIを利用しています。

日本の福岡FIR（RJJJ）のSIGMETについては、

- 発表元: JMA（気象庁 / RJTD）
- 対象: Fukuoka FIR（RJJJ）
- 配信・取得経路: NOAA Aviation Weather Center

という関係を画面にも表示します。

つまり、日本周辺のSIGMETをNOAAから取得していても、日本の福岡FIRについては気象庁が発表した情報をNOAA経由で受け取る形になります。

### 航路周辺だけを抽出

取得したSIGMETすべてを表示するのではなく、現在の航路からおおむね250km以内にあるものを抽出します。

### 3D空域表示

高度情報を取得できたSIGMETは、下限高度・上限高度を使って**3Dの空域ボリューム**として表示します。

これにより、平面上で「どこにあるか」だけでなく、「どの高度帯の現象か」も把握しやすくしています。

### SIGMETの色

WEATHERパネルに色凡例を表示します。

| 色 | 主な意味 |
|---|---|
| オレンジ | 乱気流 |
| 青 | 着氷 |
| 紫 | 火山灰 |
| ピンク | 台風 / 熱帯低気圧 |
| 黄土色 | 山岳波 |
| 赤 | その他 / 雷雨など |

SIGMETは5分間キャッシュし、定期的に再取得します。

---

## 気象庁 NOWCAST

NOWCASTでは、出発空港と到着空港について気象庁の情報を表示します。

現在と約60分後を比較できます。

### 降水

空港直上と周辺約10kmについて、降水強度を構造化して表示します。

例:

```text
現在 12:25
空港直上      降水域なし
周辺10km最大  弱い雨 1-5 mm/h

約60分後 13:20
空港直上      弱い雨 1-5 mm/h
周辺10km最大  やや強い雨 10-20 mm/h
```

雨雲画像も同時に表示します。

### 雷

雷ナウキャストの活動度を表示します。

- 活動度1: 雷の可能性
- 活動度2: 雷あり
- 活動度3: やや激しい雷
- 活動度4: 激しい雷

空港直上と周辺約10kmの最大値を確認できます。

### 竜巻発生確度

気象庁の竜巻発生確度ナウキャストも利用します。

ここで表示する値は、「竜巻が実際に発生した」という意味ではありません。

竜巻やダウンバーストなど、激しい突風が発生しやすい状況を示す予測情報として扱います。

NOWCASTの構造化データはAI解説にも渡します。

---

# AI飛行解説

飛行情報画面の「AI解説」を押した時にGemini APIを呼びます。

現在のモデル設定:

`gemini-3.5-flash-lite`

AIには主に次の情報を渡します。

- 便情報
- 現在位置
- 高度
- 速度
- 進行方向
- 飛行フェーズ
- 残距離
- Filed Route
- Actual Track
- METAR
- TAF
- SIGMET
- 降水NOWCAST
- 雷NOWCAST
- 竜巻発生確度NOWCAST

専門知識がない人にも分かる日本語で、おおむね800文字以内にまとめます。

AIには次の点を明示しています。

- METARとTAFを混同しない
- 空港の気象を航空機現在位置の気象と誤認しない
- SIGMETが0件でも「安全」と断定しない
- 竜巻発生確度を実際の竜巻発生と断定しない
- データ欠損や位置更新停止だけから事故・緊急事態を推測しない
- 入力にない事実を作らない

DEMOでは、飛行データがシミュレーションであることと、SIGMET/NOWCASTが実データであることを区別して解説します。

---

## 音声読み上げ

AI解説はGoogle Cloud Text-to-Speechで音声再生できます。

現在の音声:

`ja-JP-Wavenet-A`

Cloud RunバックエンドでMP3を生成し、

- 音声
- 停止

ボタンで操作できます。

---

# スマートフォンUI

スマートフォンでは画面が限られるため、情報パネルを下部の縦スクロール領域へまとめています。

現在のパネル:

1. 便一覧
2. 飛行情報
3. カメラ
4. 再生バー
5. 高度・時間
6. ルート色
7. NOWCAST

「操作」ボタンから各パネルを個別に表示・非表示できます。

PCでは従来どおり、3D地図上に各情報パネルを配置します。

---

# INFO

INFO画面では、

- SkyRouteの概要
- 基本的な使い方
- AeroAPIの今月の利用状況

を確認できます。

AeroAPI利用状況は

`GET /account/usage`

を使って取得します。

表示内容:

- 参考利用額
- API呼出回数
- Result pages
- 利用額が大きいAPI
- 月5ドル無料枠を前提とした残額の目安

FlightAware側の利用統計は即時反映ではないため、最終的な請求額とは異なる場合があります。

---

# データ構成

```text
FlightAware AeroAPI
 ├─ 出発便
 ├─ 便詳細
 ├─ 現在位置
 ├─ Actual Track
 ├─ Filed Route
 ├─ 空港情報
 ├─ METAR
 ├─ TAF
 └─ Account Usage

NOAA Aviation Weather Center
 └─ International SIGMET
      └─ 日本(RJJJ)はJMA発表情報を含む

気象庁
 ├─ 高解像度降水NOWCAST
 ├─ 雷NOWCAST
 └─ 竜巻発生確度NOWCAST

             ↓

        Cloud Run backend

             ↓

Google Photorealistic 3D Maps
 ├─ 航空機GLB
 ├─ 3Dルート
 └─ 3D SIGMET空域

             ↓

Gemini AI解説
             ↓
Google Cloud Text-to-Speech
```

---

# 主なSkyRoute API

| API | 用途 |
|---|---|
| `GET /api/flights/departures?airport=RJTT` | 飛行中＋今後3時間の出発便 |
| `GET /api/flights/:id` | 便詳細 |
| `GET /api/flights/:id/position` | 現在位置 |
| `GET /api/flights/:id/track` | Actual Track |
| `GET /api/flights/:id/route` | Filed Route |
| `GET /api/airports/:id` | 空港情報 |
| `GET /api/airports/:id/weather` | METAR相当の空港観測 |
| `GET /api/airports/:id/forecast` | TAF空港予報 |
| `GET /api/weather/sigmet` | International SIGMET |
| `GET /api/weather/nowcast/times` | JMA NOWCAST時刻情報 |
| `GET /api/weather/nowcast/point` | 空港周辺NOWCAST構造化データ |
| `GET /api/account/usage` | AeroAPI利用状況 |
| `POST /api/ai/flight-commentary` | Gemini AI解説 |
| `POST /api/tts` | AI解説音声生成 |
| `GET /api/health` | ヘルスチェック |

AeroAPIキーやGemini APIキーはブラウザ側へ直接公開せず、Cloud Runバックエンドから利用します。

Google MapsのブラウザキーだけはViteビルド時に組み込みます。

---

# APIコストを抑える設計

SkyRouteは個人開発のため、有料APIを無制限に自動呼び出ししない設計にしています。

主な方針:

- 便一覧は原則手動更新
- 現在位置は原則手動更新
- 自動位置更新はユーザーがONにした場合のみ
- METAR / TAFは必要時に取得し、キャッシュ
- SIGMETは5分キャッシュ
- NOWCASTは短時間キャッシュ
- AI解説はボタンを押した時だけ実行
- 音声生成もボタンを押した時だけ実行
- AeroAPI UsageはINFO画面で確認

---

# Google Photorealistic 3D Maps

Google Maps JavaScript APIの `maps3d` ライブラリを利用しています。

ロードチャンネル:

`weekly`

利用にはGoogle Cloud側でMaps JavaScript APIと3D Maps関連機能を利用できる設定が必要です。

---

# Cloud Run

本番環境はGoogle Cloud Runです。

- region: `asia-northeast1`
- service: `skyroute`
- GitHub `main` へのpushを起点にCloud BuildでDockerイメージを作成
- Artifact Registryへpush
- Cloud Runへデプロイ

Cloud Runは現在、

- 512MiB memory
- 1 CPU
- min instances 0
- max instances 1
- concurrency 40
- timeout 60秒

で構成しています。

Google MapsブラウザキーとAeroAPIキーはSecret Managerを利用します。

AI解説を利用する場合は、Cloud Run実行環境へ `GEMINI_API_KEY` を設定する必要があります。

---

# ローカル開発

必要環境:

- Node.js 22.6以上
- npm

インストール:

```powershell
npm install
npm run dev
```

`.env.local` の例:

```dotenv
VITE_GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY
AEROAPI_KEY=YOUR_FLIGHTAWARE_AEROAPI_KEY
SKYROUTE_DATA_MODE=live
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
GEMINI_MODEL=gemini-3.5-flash-lite
```

APIキーや認証情報をGitへコミットしないでください。

---

# テスト

```powershell
npm test
npm run build
```

現在のテストには、

- フライト表示
- ルート生成
- SIGMET
- JMA NOWCAST
- 雷 / 竜巻NOWCAST
- Phase 2機能
- PLATEAU関連

などが含まれています。

---

# データ利用上の注意

SkyRouteは航空情報を分かりやすく可視化するための個人開発アプリです。

表示される位置・高度・速度・時刻・経路・気象情報には、

- 更新遅延
- 推定値
- データ欠損
- API側の取得失敗
- 画像タイルから構造化した値の誤差

などが含まれる可能性があります。

SIGMET、METAR、TAF、NOWCASTを含め、SkyRouteの表示だけを実際の航空運航や航空安全上の判断には使用しないでください。

---

# 使用技術

- TypeScript
- Vite
- Node.js
- Google Maps JavaScript API / Photorealistic 3D Maps
- Google Cloud Run
- Google Cloud Build
- Google Cloud Text-to-Speech
- Gemini API
- FlightAware AeroAPI
- NOAA Aviation Weather Center
- 気象庁防災情報 / JMA Tile
- GLB / glTF

---

## License / Data

各外部データ・API・地図・航空機モデルについては、それぞれの提供元の利用条件に従ってください。
