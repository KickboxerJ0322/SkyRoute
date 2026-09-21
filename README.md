# SkyRoute

SkyRoute は、航空機の運航データを Google Photorealistic 3D Maps 上で可視化する個人開発のWebアプリです。

FlightAware AeroAPI から取得した便情報・現在位置・高度・速度・航跡を3D地図上に表示し、Geminiによる飛行状況の解説や音声読み上げも利用できます。

公開版:

https://skyroute-331230486346.asia-northeast1.run.app/

---

## 主な機能

### ROUTE

主要空港の出発便を選択して追跡します。

対応空港:

| 空港 | IATA | ICAO |
|---|---|---|
| 羽田 | HND | RJTT |
| 成田 | NRT | RJAA |
| 関西 | KIX | RJBB |
| 伊丹 | ITM | RJOO |
| 新千歳 | CTS | RJCC |
| 福岡 | FUK | RJFF |
| 那覇 | OKA | ROAH |

初期値は羽田です。

一覧には、

- 現在飛行中の出発便
- 今後3時間の出発予定便

を各最大20便表示します。

便一覧は自動更新せず、上部の **更新** ボタンを押した時だけAeroAPIへ再取得します。

便を選択すると、

- 現在位置
- 高度
- 対地速度
- 方位
- 上昇・下降
- 出発・到着予定時刻
- 実績時刻
- 遅延
- Actual Track
- Filed Route（取得できる場合）
- 出発地・到着地の天候
- Preview Flight
- Replay Track

などを表示します。

現在位置も原則手動更新です。

**現在位置更新** を押した時だけ再取得します。  
**自動更新 OFF / ON** をONにした場合のみ1分ごとに現在位置を取得します。

---

## FINDER

「空に見えている飛行機はどこへ行くのか」を調べる機能です。

検索方法は2種類あります。

- ブラウザの現在地
- 住所・地名入力

例:

- 東京駅
- 横浜市
- 成田空港
- さいたま市

指定地点の周辺80kmを対象に、AeroAPIの airborne flight search を使って旅客機を検索します。

検索結果には、

- 便名
- 出発地
- 目的地
- 検索地点からの距離
- 高度
- 速度
- 方角

を表示します。

各航空機には、

- **3D表示**
- **飛行情報**

のボタンがあります。

「飛行情報」を押すと、ROUTEと同じ詳細表示・AI解説・位置更新・Preview/Replayを利用できます。

FINDER検索はAeroAPIの比較的高価な検索APIを使用するため、自動更新は行いません。

---

## INFO

SkyRouteの概要、使い方、AeroAPIの今月の利用状況を表示します。

AeroAPIの利用状況は FlightAware の無料API:

`GET /account/usage`

から取得します。

表示内容:

- 今月の参考利用額
- API呼出回数
- Result pages
- 利用額が大きいAPI
- Personalプランの月5ドル無料枠を前提にした残額目安

FlightAware側の利用統計は約10分ごとに更新されるため、リアルタイムの請求額ではありません。

---

## AI飛行解説

飛行情報画面の **AI解説** を押した時だけGemini APIを呼びます。

モデル:

`gemini-3.5-flash-lite`

解説では主に、

- 現在どの地域上空を飛んでいるか
- 高度
- 速度
- 進行方向
- 上昇・下降
- 目的地までの距離
- 実際の航跡
- 出発・到着の遅延
- 出発地・到着地の天候

を、航空の専門知識がない人にも分かる日本語で説明します。

Filed Routeが取得できない場合は、欠損していることを無理に説明しません。

事故・緊急事態・安全性について、AeroAPIの公開データだけから断定しないようにしています。

AI解説はおおむね800文字以内です。

AI解説は位置情報を更新しても保持され、作成時刻も表示します。

---

## 音声読み上げ

AI解説は Google Cloud Text-to-Speech を使って音声再生できます。

現在の音声:

`ja-JP-Wavenet-A`

ブラウザ標準TTSではなく、Cloud RunバックエンドからMP3を生成します。

- 音声
- 停止

ボタンで操作できます。

---

## Google Photorealistic 3D Maps

Google Maps JavaScript API の `maps3d` ライブラリを利用しています。

現在は開発専用のalpha channelではなく、

`weekly`

チャンネルを使用しています。

地図モード:

- HYBRID
- SATELLITE

カメラ:

- CLOSE
- FOLLOW
- COCKPIT
- OVERVIEW
- FREE

方位・TILTも変更できます。

---

## 再生速度

Preview / Replay の再生速度は実際の距離を基準にしています。

`1x ≒ 900 km/h`

プリセット:

- 0.2x
- 1x
- 3x
- 10x
- 50x

近距離便と長距離便で極端に再生速度が変わらないようにしています。

---

## データ構成

```text
FlightAware AeroAPI
 ├ 主要空港の出発便
 ├ 現在位置
 ├ 高度・速度・方位
 ├ Actual Track
 ├ Filed Route
 ├ 空港天候
 ├ 周辺航空機検索
 └ Account Usage
        ↓
Cloud Run backend
        ↓
Google Photorealistic 3D Maps
        ↓
Gemini AI 解説
        ↓
Google Cloud Text-to-Speech
```

---

## 主なバックエンドAPI

| SkyRoute API | 用途 |
|---|---|
| `GET /api/flights/departures?airport=RJTT` | 選択空港の飛行中＋今後3時間の出発便 |
| `GET /api/flights/nearby` | FINDER周辺航空機検索 |
| `GET /api/flights/:id` | 便詳細 |
| `GET /api/flights/:id/position` | 現在位置 |
| `GET /api/flights/:id/track` | Actual Track |
| `GET /api/flights/:id/route` | Filed Route |
| `GET /api/airports/:id/weather` | 空港気象 |
| `GET /api/account/usage` | AeroAPI利用状況 |
| `POST /api/ai/flight-commentary` | Gemini AI解説 |
| `POST /api/tts` | AI解説の音声生成 |
| `GET /api/health` | ヘルスチェック |

AeroAPIキー、Gemini APIキーはブラウザへ公開せずCloud Runバックエンドから利用します。

Google MapsのブラウザキーのみViteビルド時に組み込みます。

---

## APIコストを抑える設計

SkyRouteは個人開発のため、APIの自動ポーリングをできるだけ避けています。

現在の方針:

- 便一覧: 原則手動更新
- 現在位置: 原則手動更新
- 現在位置の自動更新: ユーザーがONにした時だけ1分間隔
- FINDER: ユーザーが検索した時だけ
- AI解説: AI解説ボタンを押した時だけ
- 天候: AI解説時など必要な時だけ
- 音声: 音声ボタンを押した時だけ
- AeroAPI Usage: INFO表示時、10分キャッシュ

AeroAPI Personalプランには月5ドル分の無料利用枠があります。

特に `/flights/search` を使うFINDERは他のAPIより単価が高いため、自動更新しません。

---

## Google Maps / Geocoding

FINDERの住所・地名検索にはGoogle Maps JavaScript APIのGeocoderを利用します。

Google Cloudプロジェクトでは、

- Maps JavaScript API
- Geocoding API

を有効にしてください。

公開用MapsキーはWebサイト制限とAPI制限を設定することを推奨します。

---

## Cloud Run

本番環境:

- Google Cloud Run
- region: `asia-northeast1`
- service: `skyroute`
- GitHub `main` push → Cloud Build → Cloud Run 自動デプロイ

Cloud Build:

`cloudbuild.yaml`

Google Mapsキー:

`skyroute-maps-browser-key`

AeroAPIキー:

`skyroute-aeroapi-key`

Gemini APIキー:

`skyroute-gemini-api-key`

Secret Managerを使用します。

---

## ローカル開発

Node.js 24系を推奨します。

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

秘密キーをGitへコミットしないでください。

---

## テスト

```powershell
npm test
npm run build
```

Cloud BuildでもDockerイメージ作成前にテストとViteビルドを実行します。

---

## データに関する注意

SkyRouteはFlightAware等から取得した公開・提供データを可視化するアプリです。

表示される位置・時刻・高度・速度・天候などは、更新遅延、推定値、欠損を含む可能性があります。

SkyRouteの表示だけを、航空安全上の判断や実際の運航判断には使用しないでください。
