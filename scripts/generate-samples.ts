/**
 * Generates the sample files in samples/ (3 datasets × Oct–Dec 2025).
 * Deterministic: re-running produces identical files.
 *
 *   bun run samples
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import iconv from "iconv-lite";
import Papa from "papaparse";
import * as XLSX from "xlsx";

const OUT = join(import.meta.dirname, "..", "samples");
const MONTHS = [10, 11, 12] as const;
type Month = (typeof MONTHS)[number];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function weighted<T>(r: () => number, items: [T, number][]): T {
  const total = items.reduce((a, [, w]) => a + w, 0);
  let x = r() * total;
  for (const [v, w] of items) {
    x -= w;
    if (x <= 0) return v;
  }
  return items[items.length - 1][0];
}

const pick = <T>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)];
const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const daysIn = (m: Month) => new Date(2025, m, 0).getDate();
const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

/** Day of month, weighted toward weekdays and (optionally) the end of the month. */
function dayOf(r: () => number, m: Month, endBias = 0): number {
  for (;;) {
    const d = Math.min(daysIn(m), 1 + Math.floor(r() ** (1 - endBias) * daysIn(m)));
    const dow = new Date(2025, m - 1, d).getDay();
    if ((dow === 0 || dow === 6) && r() < 0.6) continue;
    return d;
  }
}

function writeCsv(path: string, rows: (string | number | null)[][], encoding: "utf8-bom" | "sjis") {
  const text = Papa.unparse(rows, { newline: "\r\n" });
  writeFileSync(path, encoding === "sjis" ? iconv.encode(text, "Shift_JIS") : "﻿" + text);
}

// ---------- 1. Sales (UTF-8 CSV) ----------

const PRODUCTS: Record<string, [string, number][]> = {
  文具: [["ボールペン", 120], ["ノート", 180], ["ファイル", 240], ["付箋", 150], ["手帳", 1480]],
  家具: [["オフィスチェア", 24800], ["デスク", 39800], ["書庫", 18600]],
  電化製品: [["モニター", 21800], ["キーボード", 4980], ["マウス", 2480], ["ヘッドセット", 6980], ["加湿器", 8980]],
  消耗品: [["コピー用紙", 520], ["トナー", 8900], ["電池", 640], ["カレンダー", 980]],
};
const SEASONAL: Record<string, Month[]> = { 手帳: [11, 12], 加湿器: [11, 12], カレンダー: [11, 12] };

function sales(m: Month) {
  const r = rng(1000 + m);
  const count = { 10: 860, 11: 940, 12: 1240 }[m];
  const rows: (string | number | null)[][] = [];
  for (let i = 0; i < count; i++) {
    const day = dayOf(r, m, m === 12 ? 0.25 : 0);
    const region = weighted(r, [["関東", 32], ["近畿", 20], ["中部", 15], ["九州", 10], ["東北", 8], ["北海道", 6], ["中国", 5], ["四国", 4]]);
    // EC grows month by month; December is the year-end peak.
    const channel = weighted(r, [["直販", 45], ["EC", m === 10 ? 30 : m === 11 ? 36 : 44], ["代理店", 25]]);
    const category = weighted(r, [["文具", 30], ["家具", 12], ["電化製品", m === 10 ? 22 : 30], ["消耗品", 28]]);
    const options = PRODUCTS[category].filter(([p]) => !SEASONAL[p] || SEASONAL[p].includes(m));
    const [product, price] = pick(r, options);
    const qty = Math.max(1, Math.round((price > 10000 ? 3 : 40) * r() ** 2) + 1);
    const campaign = m === 12 && channel === "EC" && r() < 0.55 ? "年末セール" : m === 12 ? "なし" : null;
    const unit = campaign === "年末セール" ? Math.round(price * 0.9) : price;
    const row: (string | number | null)[] = [
      `ORD-25${m}-${pad(i + 1, 4)}`,
      `2025/${pad(m)}/${pad(day)}`,
      region,
      channel,
      category,
      product,
      yen(unit),
      qty,
      yen(unit * qty),
      pick(r, ["佐藤", "鈴木", "高橋", "田中", "伊藤", "渡辺"]),
      Math.round((3.2 + r() * 1.8) * 10) / 10,
    ];
    if (m === 12) row.push(campaign);
    rows.push(row);
  }
  rows.sort((a, b) => String(a[1]).localeCompare(String(b[1])) || String(a[0]).localeCompare(String(b[0])));
  const header = ["注文ID", "注文日", "地域", "チャネル", "カテゴリ", "商品名", "単価", "数量", "売上金額", "担当者", "満足度"];
  if (m === 12) header.push("キャンペーン");
  return [header, ...rows];
}

/** Master table for the lookup feature: joins on 担当者. */
function salesStaff() {
  return [
    ["担当者", "チーム", "拠点", "月間目標"],
    ["佐藤", "法人営業1課", "東京", "¥7,000,000"],
    ["鈴木", "法人営業1課", "東京", "¥6,500,000"],
    ["高橋", "法人営業2課", "大阪", "¥6,000,000"],
    ["田中", "法人営業2課", "大阪", "¥5,500,000"],
    ["伊藤", "EC推進課", "東京", "¥6,000,000"],
    ["渡辺", "EC推進課", "福岡", "¥4,500,000"],
  ];
}

// ---------- 2. Support inquiries (Shift_JIS CSV with title and total rows) ----------

function inquiries(m: Month) {
  const r = rng(2000 + m);
  const count = { 10: 420, 11: 560, 12: 360 }[m];
  const rows: (string | number | null)[][] = [];
  let seq = { 10: 3100, 11: 3520, 12: 4080 }[m];
  for (let i = 0; i < count; i++) {
    const day = dayOf(r, m);
    const hour = 9 + Math.floor(r() * 9);
    const minute = Math.floor(r() * 60);
    // November: release of クラウド会計 v3 causes a spike of bug reports.
    const product = weighted(r, [["クラウド会計", m === 11 ? 50 : 35], ["勤怠ナビ", 35], ["請求書メーカー", 30]]);
    const kind = weighted(r, [["質問", 45], ["不具合", m === 11 && product === "クラウド会計" ? 55 : 18], ["要望", 15], ["契約・請求", 12]]);
    const priority = kind === "不具合" ? weighted(r, [["高", 40], ["中", 45], ["低", 15]]) : weighted(r, [["高", 8], ["中", 52], ["低", 40]]);
    const channel = weighted(r, [["メール", 38], ["電話", 22], ["チャット", m === 10 ? 25 : 32], ["フォーム", 15]]);
    const team = kind === "不具合" ? "技術サポート" : kind === "契約・請求" ? "カスタマーサクセス" : pick(r, ["一次窓口", "一次窓口", "技術サポート"]);
    const firstResponse = Math.round((channel === "電話" ? 2 : channel === "チャット" ? 6 : 45) * (0.4 + r() * 1.6) * (priority === "高" ? 0.6 : 1));
    const late = day > daysIn(m) - 3;
    const status = late && r() < 0.5 ? "対応中" : r() < 0.05 ? "保留" : "完了";
    const hours = status === "完了" ? Math.round((kind === "不具合" ? 6 : 1.5) * (0.3 + r() * 2.5) * 10) / 10 : null;
    const satisfaction = status === "完了" && r() < 0.7 ? `${Math.round(55 + r() * 45 - (kind === "不具合" ? 12 : 0))}%` : null;
    rows.push([
      `INQ-${pad(++seq, 6)}`,
      `2025/${pad(m)}/${pad(day)} ${pad(hour)}:${pad(minute)}`,
      channel,
      product,
      kind,
      priority,
      team,
      firstResponse,
      hours,
      status,
      satisfaction,
    ]);
  }
  rows.sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  const header = ["問い合わせ番号", "受付日時", "受付チャネル", "製品", "種別", "優先度", "担当チーム", "初回応答(分)", "対応時間(時間)", "ステータス", "満足度"];
  const blank = header.map(() => null);
  const title = [`サポート問い合わせ一覧（2025年${m}月分）`, ...header.slice(1).map(() => null)];
  const exported = [`出力日時: 2025/${m === 12 ? "01" : pad(m + 1)}/01 09:00`, ...header.slice(1).map(() => null)];
  const total = ["合計", `${count}件`, ...header.slice(2).map(() => null)];
  return [title, exported, blank, header, ...rows, total];
}

// ---------- 3. Expense claims (Excel with a cover sheet) ----------

const EXPENSES: [string, [string, number, number][]][] = [
  ["交通費", [["客先訪問（電車）", 320, 1200], ["タクシー", 1500, 4800], ["新幹線（出張）", 13000, 28000]]],
  ["宿泊費", [["出張宿泊", 8000, 14000]]],
  ["会議費", [["打ち合わせ飲料", 300, 2400], ["会議室利用料", 3000, 12000]]],
  ["交際費", [["取引先との会食", 8000, 45000], ["手土産", 2000, 6000]]],
  ["消耗品費", [["文具購入", 300, 3000], ["PC 周辺機器", 2000, 15000]]],
  ["通信費", [["モバイル通信", 2000, 6000], ["郵送費", 200, 2500]]],
];

function expenses(m: Month) {
  const r = rng(3000 + m);
  const count = { 10: 230, 11: 290, 12: 330 }[m];
  const people: [string, string][] = [
    ["営業部", "佐藤"], ["営業部", "中村"], ["営業部", "小林"], ["営業部", "加藤"],
    ["開発部", "山本"], ["開発部", "吉田"], ["開発部", "山田"],
    ["マーケティング部", "松本"], ["マーケティング部", "井上"],
    ["管理部", "木村"], ["管理部", "林"],
  ];
  const rows: (string | number | Date | null)[][] = [];
  for (let i = 0; i < count; i++) {
    const [dept, name] = pick(r, people);
    // November: trade show trips. December: year-end parties.
    const category = weighted(r, [
      ["交通費", 40],
      ["宿泊費", m === 11 ? 14 : 5],
      ["会議費", 15],
      ["交際費", m === 12 ? 22 : dept === "営業部" ? 10 : 3],
      ["消耗品費", 12],
      ["通信費", 8],
    ]);
    const [, items] = EXPENSES.find(([c]) => c === category)!;
    const [content, lo, hi] = pick(r, items);
    let amount = Math.round((lo + r() * (hi - lo)) / 10) * 10;
    let note = content;
    if (r() < 0.015) {
      amount = -amount;
      note = `${content}（返金）`;
    }
    const day = dayOf(r, m, 0.2);
    const late = day > daysIn(m) - 5;
    const status = late ? weighted(r, [["申請中", 6], ["承認済", 3], ["差戻し", 1]]) : weighted(r, [["承認済", 90], ["差戻し", 6], ["申請中", 4]]);
    const paid = status === "承認済" ? new Date(Date.UTC(2025, m, 10)) : null; // paid on the 10th of the next month
    rows.push([
      `EXP-25${m}-${pad(i + 1, 4)}`,
      new Date(Date.UTC(2025, m - 1, day)),
      dept,
      name,
      category,
      note,
      amount,
      category === "交際費" || category === "会議費" ? "課税（軽減なし）" : "課税",
      category === "交通費" && r() < 0.6 ? "交通系IC" : pick(r, ["立替（現金）", "立替（カード）", "法人カード"]),
      status,
      paid,
    ]);
  }
  rows.sort((a, b) => (a[1] as Date).getTime() - (b[1] as Date).getTime());
  const header = ["申請番号", "申請日", "部署", "申請者", "費目", "内容", "金額", "税区分", "支払方法", "承認状況", "精算日"];
  return [header, ...rows];
}

function writeExpenseBook(path: string, m: Month) {
  const wb = XLSX.utils.book_new();
  const cover = XLSX.utils.aoa_to_sheet([
    [`経費精算明細（2025年${m}月分）`],
    [],
    ["作成部署", "管理部 経理課"],
    ["対象期間", `2025/${pad(m)}/01 〜 2025/${pad(m)}/${daysIn(m)}`],
    ["備考", "明細シートを参照してください。金額は税込です。"],
  ]);
  const detail = XLSX.utils.aoa_to_sheet(expenses(m), { cellDates: true, dateNF: "yyyy/mm/dd" });
  detail["!cols"] = [14, 12, 16, 10, 10, 22, 10, 16, 14, 10, 12].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, cover, "表紙");
  XLSX.utils.book_append_sheet(wb, detail, "明細");
  writeFileSync(path, XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellDates: true, compression: true }));
}

// ---------- write ----------

for (const dir of ["売上", "問い合わせ", "経費精算"]) mkdirSync(join(OUT, dir), { recursive: true });
for (const m of MONTHS) {
  const tag = `2025-${pad(m)}`;
  writeCsv(join(OUT, "売上", `売上_${tag}.csv`), sales(m), "utf8-bom");
  writeCsv(join(OUT, "問い合わせ", `問い合わせ_${tag}.csv`), inquiries(m), "sjis");
  writeExpenseBook(join(OUT, "経費精算", `経費精算_${tag}.xlsx`), m);
}
writeCsv(join(OUT, "売上", "担当者マスタ.csv"), salesStaff(), "utf8-bom");
console.log(`samples written to ${OUT}`);
