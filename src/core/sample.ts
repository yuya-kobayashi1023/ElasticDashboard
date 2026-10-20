import type { RawTable } from "./types";

/** Deterministic sales sample used for the "try with sample data" action. */
export function sampleSales(rows = 1200): RawTable {
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const regions = ["関東", "近畿", "中部", "九州", "東北", "北海道", "中国", "四国"];
  const regionWeight = [0.32, 0.2, 0.15, 0.1, 0.08, 0.06, 0.05, 0.04];
  const categories: Record<string, [string, number][]> = {
    文具: [["ボールペン", 120], ["ノート", 180], ["ファイル", 240], ["付箋", 150]],
    家具: [["オフィスチェア", 24800], ["デスク", 39800], ["書庫", 18600]],
    電化製品: [["モニター", 21800], ["キーボード", 4980], ["マウス", 2480], ["ヘッドセット", 6980]],
    消耗品: [["コピー用紙", 520], ["トナー", 8900], ["電池", 640]],
  };
  const staff = ["佐藤", "鈴木", "高橋", "田中", "伊藤", "渡辺"];
  const channels = ["直販", "EC", "代理店"];
  const out: (string | number | null)[][] = [];
  const start = Date.UTC(2025, 0, 1);
  for (let i = 0; i < rows; i++) {
    const day = Math.floor(rand() ** 0.85 * 365);
    const d = new Date(start + day * 86400000);
    const r = rand();
    let acc = 0;
    let region = regions[0];
    for (let k = 0; k < regions.length; k++) {
      acc += regionWeight[k];
      if (r <= acc) {
        region = regions[k];
        break;
      }
    }
    const category = pick(Object.keys(categories));
    const [product, price] = pick(categories[category]);
    const qty = Math.max(1, Math.round((price > 10000 ? 3 : 40) * rand() ** 2) + 1);
    const amount = qty * price;
    const ymd = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`;
    out.push([
      `ORD-${String(i + 1).padStart(5, "0")}`,
      ymd,
      region,
      pick(channels),
      category,
      product,
      `¥${price.toLocaleString("ja-JP")}`,
      qty,
      `¥${amount.toLocaleString("ja-JP")}`,
      pick(staff),
      Math.round((3 + rand() * 2) * 10) / 10,
    ]);
  }
  out.sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  return {
    headers: ["注文ID", "注文日", "地域", "チャネル", "カテゴリ", "商品名", "単価", "数量", "売上金額", "担当者", "満足度"],
    rows: out,
  };
}
