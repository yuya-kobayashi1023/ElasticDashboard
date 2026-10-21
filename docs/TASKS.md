# 改善タスク

完了した項目は [archive/TASKS-done.md](archive/TASKS-done.md) に移しました。

## 2026-10-21 公開データでの動作確認

公開されている CSV を読み込み、読み込みから HTML の書き出しまでを確認した結果です。ソースコードは変更していません。

### 確認の条件

- 開発サーバー: `http://localhost:5391/`（`bun node_modules/.bin/vite --port 5391 --strictPort`）
- ブラウザ: Playwright（playwright-core 1.64）の headless Chromium、画面幅 1440px。一部は 390px でも確認
- `bun run test`: 66 件すべて成功。`bun run typecheck`: エラーなし
- スクリーンショットは作業用の一時フォルダ `/tmp/claude-1000/-home-yuya-Projects-elastic-dashboard/1e46f7b7-18e3-4501-ac16-29f706c5e7b6/scratchpad/shots/` にあります（以下「shots/」と略します）。セッションが終わると消える可能性があります

| データ | URL | サイズ・行数 | 文字コード |
|---|---|---|---|
| palmerpenguins | https://raw.githubusercontent.com/allisonhorst/palmerpenguins/main/inst/extdata/penguins.csv | 14.9 KB、344 行 × 8 列、欠損は `NA` | UTF-8 |
| 気象庁 最高気温の観測値（最新） | https://www.data.jma.go.jp/stats/data/mdrr/tem_rct/alltable/mxtemsadext00_rct.csv | 130 KB、914 行 × 37 列 | Shift_JIS |
| 厚労省 新規陽性者数（日別） | https://covid19.mhlw.go.jp/public/opendata/newly_confirmed_cases_daily.csv | 198 KB、1,209 行 × 49 列（都道府県が列の横持ち） | UTF-8（BOM 付き） |
| Our World in Data CO2 | https://raw.githubusercontent.com/owid/co2-data/master/owid-co2-data.csv | 13.7 MB、50,411 行 × 79 列 | UTF-8 |
| 内閣府 国民の祝日 | https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv | 21 KB、1,067 行 × 2 列 | Shift_JIS（CRLF） |

- 日本郵便の KEN_ALL（`ken_all.zip`）は、配布ページのリンク先が 404 を返したため使えませんでした。代わりに、祝日と気象庁のデータから見出し行を除いたファイルを作り、見出しのないファイルの読み込みを確認しました
- 更新の確認には、同じデータを分けたファイルを使いました。ペンギンは 2007 年と 2008〜2009 年、陽性者数は先頭 600 日と残り、OWID は 2000 年より前と 2000 年以降です

### 問題がなかった項目

- Shift_JIS の判定（気象庁、祝日）、BOM 付き UTF-8 の読み込み、値の後ろの空白（`"0 "`）の数値としての扱い
- 計算列 `[body_mass_g] / [flipper_length_mm]` の追加。Adelie で絞り込んだときの平均 19.47 は、Python で計算した値と一致した
- ウィジェットの編集（集計方法・列・種類の変更）、棒グラフのクリックによる絞り込み、日付のプリセットの絞り込み結果
- 「差し替える」、同じファイルを 2 回追加したときの重複の通知
- HTML の書き出し（データあり、テンプレート）。書き出したファイルを開いて表示でき、別のファイルを読み込み直せた。OWID では 6.3 MB のファイルが 0.75 秒で作られた
- 画面幅 390px で横方向のスクロールが出ないこと
- 確認中、アプリと書き出した HTML のどちらでもコンソールのエラーと警告は出なかった
