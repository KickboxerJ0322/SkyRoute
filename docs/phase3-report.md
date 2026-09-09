# SkyRoute Phase 3 — PLATEAU INSIGHT 作業報告

検証日: 2026-09-09。既存Phase 2を保ち、独立したPLATEAUモジュールを追加。

## 実装

- INSIGHT → PLATEAUのON/OFF。初期OFF、ON時だけGeoJSONを取得しメモリキャッシュ。
- Polygon3DInteractiveElement、gmp-click、path / innerPathsを使用。25%塗り、選択時35%、濃い境界線。RELATIVE_TO_MESH + 1.5 m、extruded=false。
- 建物クリックで名称（存在する場合のみ）、カテゴリ、用途、主要用途、高さ、地上階数、gmlId、データ年度、自治体を表示。別建物・フィルター・OFFで選択解除。
- 公共・交通＝青、商業＝黄、医療＝紫、その他＝灰。その他は初期非表示。
- 最大400棟・750ポリゴン・50,000頂点。20棟ずつ追加し、OFFで描画を中断・全除去。
- PCでは右側、モバイルではカメラと飛行情報の間に収める。内容はスクロール可能で出典リンクを固定表示。
- PLATEAU未取得・不正データ・描画非対応時は「PLATEAU data unavailable」。航空機、カメラ、LIVE/MOCK/DEMO、Preview/Replayとは独立。
- Cloud Runは生成済みGeoJSONを静的配信。PLATEAU API・CityGMLパーサーは本番実行時依存ではない。

## データ取得元・変換

[PLATEAU Data Catalog API](https://api.plateauview.mlit.go.jp/datacatalog/citygml/r:139.75,35.535,139.805,35.57?types=bldg) を使用。大田区（13111）の2025年CityGML建築物モデルを選択。カタログで同時に見つかる川崎市は対象外。

対象範囲は経度139.75〜139.805、緯度35.535〜35.57。元の提案範囲では取得量が多いため、羽田空港を中心に縮小した。羽田基準点は既存config.tsの35.5494,139.7798を使用。

20メッシュ、約99 MBを開発時だけ取得し、2,399棟を解析。718棟は外形が矩形からはみ出すため除外、1,681棟を候補とし、既知カテゴリを優先して羽田からの距離順で500棟を保存した。範囲境界で形状を切断せず、建物単位で保持する。ジオメトリ不正・LOD0欠損によるスキップは0件。

LOD0 FootPrint優先、RoofEdgeへフォールバック。EPSG:6697をsrsNameで検査し、緯度・経度・高さから経度・緯度へ変換。座標を小数7桁に丸め、閉鎖点重複・向き・内周・MultiPolygonを扱う。未知CRSはエラー。名称や高さを座標・周辺施設から推測しない。

元CityGML配信URL、コードリストURL、SHA-256、件数、欠損数、年度、生成時刻は [haneda-meta.json](../public/data/plateau/haneda-meta.json) に記録した。

- 出典: Source: Project PLATEAU / MLIT
- [国土交通省 Project PLATEAU](https://www.mlit.go.jp/plateau/)
- [Data Catalog API仕様](https://docs.plateauview.mlit.go.jp/api/rest/operations/datacatalogcitygmlconditions/)
- [Google Maps Polygon3DInteractiveElement仕様](https://developers.google.com/maps/documentation/javascript/reference/3d-map-draw#Polygon3DInteractiveElement)

## 実際の件数と属性

GeoJSON: **500棟 / 583,931 bytes（約570.2 KiB）**。

| カテゴリ | 件数 |
|---|---:|
| 公共・交通 | 227 |
| 商業 | 41 |
| 医療 | 0 |
| その他 | 232 |

初期表示はその他を除く268棟。医療0件は、今回の抽出データの属性から医療と判定できたものがないという意味であり、現実の医療施設の不存在を示さない。

| 属性 | 取得できた棟数 | 欠損・不明の棟数 |
|---|---:|---:|
| gmlId | 500 | 0 |
| 名称 | 11 | 489 |
| 用途（解決済み） | 500 | 0 |
| majorUsage | 0 | 500 |
| 高さ | 461 | 39 |
| 地上階数 | 275 | 225 |
| 自治体・カタログ年度 | 500 | 0 |

用途431は参照コードリストの「運輸倉庫施設」として解決し、公共・交通に分類。空港区域の外形（例: bldg_1ef85eef-02b7-49ab-8a04-63074fdd7b36、高さ32.7 m、地上6階）もこの分類になることを実データで検証。名称が無いためターミナル名等は付け足していない。

分類はSkyRouteによる表示分類で、公式カテゴリではない。文教厚生施設だけでは医療と断定しない。9999などの不明値はnullとし、元数値文字列を別プロパティへ保存。解決不能コードは元コードを保持する。dataYearはカタログの2025であり、建築年・個別の調査年を意味しない。**実データに存在しない属性を推測して表示していない。**

## 変更ファイル

- .gitignore / .dockerignore / .gcloudignore: .cacheを除外
- package.json / package-lock.json: 生成コマンド、開発用saxes、追加テスト
- src/main.ts: 独立モジュールと専用CSSの初期化
- src/map/initMap3D.ts: Polygon3DInteractiveElement型
- src/ui/MapControls.ts: INSIGHTグループ
- server/index.mjs: GeoJSON/JSONのMIME追加のみ（AeroAPI処理は変更なし）
- tests/phase2.browser.spec.mjs: 共通テストセットアップをhelpersへ移動、既存6ケースを維持
- tests/production-check.mjs: 任意のPLATEAU本番確認
- README.md: Phase 3の使い方・生成方法・制約

## 新規ファイル

- scripts/build-plateau-haneda.mjs
- scripts/plateau-citygml.mjs
- public/data/plateau/haneda-buildings.geojson
- public/data/plateau/haneda-meta.json
- src/plateau/types.ts
- src/plateau/classifyBuilding.ts
- src/plateau/PlateauDataProvider.ts
- src/plateau/PlateauInsight.ts
- src/map/PlateauInsightRenderer.ts
- src/ui/PlateauInsightPanel.ts
- src/styles/plateau.css
- tests/helpers/phase2-browser.mjs
- tests/plateau.test.mjs
- tests/plateau.browser.spec.mjs
- tests/plateau-visual-check.mjs
- docs/phase3-report.md

## 検証結果

- npm run build:plateau: 成功。実CityGMLから500棟を生成、コードリスト取得警告0件。
- npm test: Phase 1回帰テストおよび18テスト成功（既存12＋追加6）。
- npm run build: TypeScript/Vite成功。JS 79.50 kB（gzip 23.55 kB）。XMLパーサーはフロントバンドルに含まない。
- npm run test:browser: 12件成功（既存6＋追加6）。
- 新規ブラウザ検証: lazy load、同時読込共有、ON/OFF途中の応答破棄、再ONキャッシュ、カテゴリ、クリック、XSS文字列の文字表示、欠損値、障害・再試行、400棟上限、PC/モバイルの非重複。
- 実Google MapsのChrome検証: 268ポリゴン描画、建物外形の青い半透明重畳・属性カードを画像で確認。ページ・Mapsエラー0件。Googleの内周配列は空配列を拒否するため、内周が存在するときだけ設定することも検証済み。
- 実Maps検証時の航空便はMOCK。AeroAPIの外部呼び出しなし。実便通信は既存経路を維持。

## 残る制限

- 空港周辺の選択済み500棟のみ。大田区全域・すべての建物・医療施設を網羅するものではない。
- 名称・主要用途・階数等の欠損が多く、用途分類の粒度は元データに依存する。
- PLATEAUとGoogleの取得年度や形状が違うため、外形のずれや屋根への重なり方は場所・カメラ角度により異なる。
- 既存アプリと同じGoogle Maps alphaチャネルを維持。今後のAPI変更で再確認が必要になる場合がある。
- モバイルの詳細カードは利用可能な空間内でスクロール表示する。
- 生成物を更新するときのみ開発環境でPLATEAU APIが必要。CityGMLのLOD1+、BuildingPart、外部参照のみのLOD0、未知CRSは変換対象外（今回取得データのLOD0はすべて変換できた）。