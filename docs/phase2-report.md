# Phase 2 作業報告（2026-09-06）

実装とMOCKによる検証を完了。AEROAPI_KEY未設定のため、FlightAwareへの実接続検証は未実施です。

## 1. 変更したファイル

- `.env.example`, `.gitignore`
- `package.json`, `package-lock.json`, `vite.config.ts`
- `src/main.ts`
- `src/flight/types.ts`
- `src/map/AircraftController.ts`, `src/map/RouteRenderer.ts`
- `src/styles/main.css`

## 2. 新規ファイル

- `server/index.mjs`: HTTP APIとproduction静的配信
- `server/aeroApi.mjs`: AeroAPI v4、キャッシュ設定、利用上限
- `server/cache.mjs`: メモリキャッシュ、同時取得共有、失敗抑制
- `server/normalize.mjs`: 独自データ形式、単位変換、trackクリーニング
- `server/mock.mjs`, `server/recordedFixture.mjs`, `server/fixtures/scenarios.json`
- `src/flight/liveTypes.ts`, `src/flight/liveGeometry.ts`
- `src/flight/AeroApiFlightProvider.ts`, `src/flight/LiveFlightInterpolator.ts`, `src/flight/FlightExperience.ts`
- `src/ui/LiveFlightView.ts`
- `scripts/dev.mjs`, `scripts/capture-fixture.mjs`
- `tests/phase2.test.mjs`, `tests/phase2.browser.spec.mjs`, `tests/browser-check.mjs`
- `playwright.config.mjs`, `Dockerfile`, `.dockerignore`, `README.md`, 本報告

## 3. Backend構成

Node.js標準HTTPサーバー。ブラウザ→同一オリジン `/api` →バックエンド→AeroAPI v4。実行時の外部npm依存なし。開発時はVite proxy、productionではNodeがdistとAPIをまとめて配信します。

## 4. APIキーの設定場所

プロジェクト直下の `.env.local` に `AEROAPI_KEY=...` と `SKYROUTE_DATA_MODE=live` を追加し、再起動します。Google Mapsの `VITE_GOOGLE_MAPS_API_KEY` は既存値を維持します。AeroAPIキーはブラウザへ渡しません。

## 5–6. 外部endpointとキャッシュ時間

| 外部endpoint | キャッシュ |
|---|---|
| `/airports/RJTT/flights/scheduled_departures` | 180秒 |
| `/flights/{fa_flight_id}` | 60秒 |
| `/flights/{fa_flight_id}/route` | 30分 |
| `/flights/{fa_flight_id}/track` | 180秒 |
| `/flights/{fa_flight_id}/position` | 45秒 |
| `/airports/{id}` | 24時間 |

認証はx-apikey、一覧は今後3時間・max_pages=1。開発作業中に実際のAeroAPIへ送ったリクエスト数は0件です。HTTP契約は差し替えfetchで検証しました。

## 7. 出発便取得件数

MOCKで12件。実AeroAPIの取得件数は未確認。最大表示件数20件。全ページは自動取得しません。

## 8. 選択したテスト便

MOCKの `mock-ana53`（ANA53）。サーバー起動1分後に出発する検証シナリオです。実際のANA便の運航を示すものではありません。ブラウザテストでは `test-ana` / `test-jal` の独立した契約データも使用しました。

## 9–12. Route / track / position / GLB

- route: MOCK取得とFILED表示、空データ時のACTUAL/ESTIMATED fallbackを検証。
- track: MOCK取得、時刻順整列・異常点除去・高度補間を検証。
- position: MOCK取得、100フィート→メートル、knots→km/h、45秒更新を検証。
- GLB: Model3DElementへ正規化位置を渡す経路、orientation維持、カメラ追従をテストで検証。
- FlightAwareの実在便の位置にGLBを配置する最終確認は、AEROAPI_KEY未設定のため未実施。
- 実Google Mapsスクリプトを読み込んだChromeでMOCK一覧と既存UIを起動でき、ページ内JavaScript例外は0件。ブラウザ自動テストの地図部分は代替オブジェクトのため、3Dタイル・GLBの見た目を保証するテストではありません。

## 13. Polling interval

選択便のENROUTE位置は45秒。詳細も45秒ループ（サーバー60秒キャッシュ）。trackは初回＋180秒。一覧は180秒。API更新間は描画専用の補間処理を使います。選択変更、DEMO、PREVIEW、REPLAYで古い追跡処理を中断します。

## 14. mock/live切替

`.env.local` の `SKYROUTE_DATA_MODE=mock|live` を変更してサーバー再起動。画面のLIVEはバックエンドデータ、DEMOは既存の4ルート。MOCK時は架空データであることを明示します。実位置、PREVIEW、REPLAYも分けて表示します。

## 15. ローカル起動

`npm.cmd run dev` でフロントとバックエンドを同時起動。ターミナルのLocal URLを開いてください。詳細はREADME参照。

## 16. Production環境変数

ビルド時: `VITE_GOOGLE_MAPS_API_KEY`

実行時: `AEROAPI_KEY`, `SKYROUTE_DATA_MODE=live`, `PORT`。任意で `AEROAPI_MAX_CALLS_PER_MINUTE=20`。

Dockerfileを追加済み。Cloud Runへのデプロイは未実施。メモリキャッシュと利用制限はインスタンス単位のため、初期運用は最大1インスタンスを想定します。

## 17. ビルド・テスト結果

- `npm.cmd run build`: 成功、TypeScriptエラー0。
- `npm.cmd test`: 既存Phase 1回帰テスト＋Phase 2の10テスト成功。
- `npm.cmd run test:browser`: 6テスト成功（desktop/mobile、表示切替、フィルター、航路fallback、PREVIEW/DEMO、Heading/Tilt、古い応答の破棄、位置補間、選択便だけのpolling、DEMO切替時の停止、API障害）。
- 配信JavaScriptにAeroAPI接続先、x-apikey、VITE_AEROAPI_KEYが含まれないことを確認。
- Phase 1はGitコミット `c610f36` に保存済み。

## 18. 残っている確認事項・制限

1. 実キー設定後、実際のRJTT出発一覧・利用プランでのroute/track/position可用性を確認してください。
2. 実在するENROUTE便で、実位置・高度・GLB描画を最後に照合する必要があります。
3. APIデータが存在しない場合の推定航路・高度は実際の飛行を表しません。UIとデータ型で推定を区別しています。
4. Replayはtrack形状を既存アニメーターで再生する簡易方式で、元の全timestampに厳密同期する再生ではありません。
5. 複数Cloud Runインスタンスの共有キャッシュ・全便同時追跡等は今回の範囲外です。

公式仕様: https://www.flightaware.com/commercial/aeroapi/resources/aeroapi-openapi.yml
