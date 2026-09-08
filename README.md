# SkyRoute Phase 2

現在のPhase 1 UI・Google Maps初期化・787-10モデルとorientation補正を維持し、AeroAPI v4用のバックエンドを追加しました。

## ローカル起動

Node.js 22.6以降（検証環境は24.13.1）が必要です。

```powershell
cd "E:\外付けHDDデスクトップ\潤平勉強\●SkyRoute"
npm.cmd install
npm.cmd run dev
```

フロントエンドとバックエンドを同時起動します。ターミナルの `Local:` に表示されるURLを開いてください。通常は http://localhost:5173 、使用中なら5174等になります。バックエンドの開発ポートは8787です。終了はCtrl+Cです。

## 実データの設定

既存の `.env.local` のGoogle Mapsキーを残し、次の2行を追加してください。キーはチャットへ貼り付ける必要はありません。

```dotenv
AEROAPI_KEY=取得したFlightAwareのAPIキー
SKYROUTE_DATA_MODE=live
```

変更後はサーバーを再起動してください。`VITE_AEROAPI_KEY` は使用しません。AEROAPI_KEYはバックエンドのみが読み込み、ブラウザは同一オリジンの `/api/` にアクセスします。`.env.local` はGitとDockerビルドコンテキストから除外します。

開発中の初期値は `SKYROUTE_DATA_MODE=mock` です。MOCKでは付属JSONから生成する架空の12便を表示し、外部AeroAPIは一切呼びません。画面のMOCK表示は実際の運航情報ではありません。最初のANA53検証便はサーバー起動の1分後にENROUTEへ変化します。出発前に選択しておけば、次の更新で位置追跡を確認できます。

画面上のLIVEはバックエンドデータを選ぶタブです。実際のデータソースは隣の `MOCK` / `● LIVE` 表示で確認してください。DEMOはPhase 1の固定4ルートです。

## 操作

- 左一覧は羽田発の飛行中の便と今後3時間の出発予定便を表示（各最大20便）。飛行中を先頭に表示し、すべての便／飛行中／出発予定で切り替えられます。JST表示。ALL/ANA/JALと目的地検索は取得済みデータのみを絞り込みます。
- 便を選ぶと便詳細・提出航路・実trackを取得。未出発便は空港付近に静止し、欠損情報は `--` と表示します。
- `Times (JST)` を開くと出発・到着それぞれの予定／推定／実績時刻が表示されます。
- `Preview Flight` は推定高度を含む予定経路の仮想飛行です。`Replay track` は記録済みtrackの簡易再生です。実位置とは明確に表示を分けています。
- LIVE中の再生バーは無効です。Preview/ReplayまたはDEMOで再生・逆再生・シーク・速度調整を利用します。
- 既存の便一覧／飛行情報／カメラ／再生バー表示切替を維持。モバイルではカメラバーの便一覧ボタンでドロワーを開きます。
- 開発時は `?debug=1` で選択ID・航路種別・位置時刻等を表示します。productionビルドでは表示しません。

飛行中の便は、過去24時間の出発済み便を1ページ取得し、離陸済み・未到着の便を抽出します。到着済み便と欠航便は除外します。取得ページ内の便のみが対象のため、飛行中の全便を網羅しません。出発前に選択した便は一覧から消えても追跡を継続し、ENROUTEになった時点で位置を取得します。未選択の便の位置は追跡しません。

## バックエンド

Node.js標準HTTPサーバーを使用しています。Expressなどの実行時依存はありません。

| SkyRoute API | AeroAPI v4 | キャッシュ |
|---|---|---|
| GET /api/flights/departures | /airports/RJTT/flights/scheduled_departures と /airports/RJTT/flights/departures | 各180秒 |
| GET /api/flights/:id | /flights/{fa_flight_id} | 60秒 |
| GET /api/flights/:id/route | /flights/{fa_flight_id}/route | 30分 |
| GET /api/flights/:id/track | /flights/{fa_flight_id}/track | 180秒 |
| GET /api/flights/:id/position | /flights/{fa_flight_id}/position | 45秒 |
| GET /api/airports/:id | /airports/{id} | 24時間 |
| GET /api/health | 外部呼び出しなし | なし |

認証は `x-apikey`。出発予定は現在から3時間先、飛行中の抽出元は過去24時間の出発便です。それぞれ `max_pages=1` とし、一覧更新で最大2回の外部リクエストが発生します（キャッシュヒット時は呼び出しなし）。日時は秒単位のUTC形式で送信します。ページの自動巡回はしません。FlightAwareのフィルタはscheduled_off基準で、取得後にSkyRouteの予定出発（scheduled_out優先）でも出発予定リストの過去便を除外します。

一覧の自動更新は180秒。選択便詳細は45秒間隔のループ＋60秒キャッシュ。ENROUTEの選択1便だけ位置を45秒間隔で取得し、trackは初回と180秒間隔です。非同期完了後に次のタイマーを予約するためリクエストが重なりません。選択変更とPreview/DEMO切替でAbortControllerとタイマーを解除します。

外部呼び出しはインスタンス全体で既定20回/分まで (`AEROAPI_MAX_CALLS_PER_MINUTE`)。同時リクエストを共有し、失敗は60秒抑制、タイムアウトは10秒。認証・429・障害のクールダウンを設けています。直近キャッシュがある場合はstaleとして返し、UIにキャッシュ表示を出します。キャッシュもない場合はエラー表示を保ち、DEMOへ切り替えられます。

AeroAPIのposition/track高度は**100フィート単位**のため、`altitude * 100 * 0.3048` でメートルへ変換します。速度はknots×1.852。変換は `server/normalize.mjs` に集約しています。位置異常・重複・時刻逆転を除去し、欠損track高度のみ周辺の測定値から補間します。位置補間はAPI取得と独立した描画ループで実行します。

航路はFiled→Actual track→大圏経路の順で採用します。Filedの高度と大圏経路の高度は推定として保持。Actualは水色、Filedは青、Estimatedは半透明青です。実位置以降は残りの予定経路、Filedがなければ推定経路を表示します。

## 検証

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:browser
```

ブラウザテストはインストール済みChromeを使い、5180番に検証用Viteを起動します。AeroAPIとGoogle Mapsは契約に合わせた代替オブジェクトで検証するため、料金は発生しません。実際の3D地図描画とは別の検証です。

`node tests/browser-check.mjs` は実際のGoogle Mapsを読み込み、MOCKバックエンドとUIを確認する手動検証スクリプトです。こちらはGoogle Mapsへの通信が発生します。AeroAPIは呼びません。

## 保存済みレスポンス

`npm.cmd run capture:fixture` は出発一覧を外部APIへ1回だけ問い合わせ、許可したフィールドのみ `server/fixtures/captured.json` に保存します。`npm.cmd run capture:fixture -- fa_flight_id` は指定便の詳細・route・track・positionを取得します。実API課金対象なので、通常開発は付属MOCKを使用してください。保存ファイルはGitから除外しています。

`SKYROUTE_DATA_MODE=mock` と `SKYROUTE_FIXTURE_FILE=server/fixtures/captured.json` で保存データを使用できます。保存済み時刻は変更しないため、古い出発便は今後の出発一覧に表示されません。

## Production / Cloud Run

```powershell
npm.cmd run build
npm.cmd start
```

NodeサーバーがdistとAPIを同一オリジンで配信します。Cloud Run向けDockerfileを追加済みです。ビルド時に公開用 `VITE_GOOGLE_MAPS_API_KEY`、実行時に秘密の `AEROAPI_KEY`、`SKYROUTE_DATA_MODE=live` を設定してください。`PORT` はCloud Runが提供する値を使い、任意で `AEROAPI_MAX_CALLS_PER_MINUTE` を設定します。Google Mapsキーの参照元制限に配信ドメインを追加してください。AeroAPIキーはSecret Manager等で実行時に注入します。

現在のキャッシュと利用制限はインスタンス単位です。Cloud Runは最大インスタンス数1に設定します。公開・継続デプロイ設定は [deployment.md](docs/deployment.md) を参照してください。

仕様確認元: [FlightAware AeroAPI v4公式OpenAPI](https://www.flightaware.com/commercial/aeroapi/resources/aeroapi-openapi.yml)
