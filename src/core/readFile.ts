import type { ParseResult } from "./parse";
import type { WorkerResponse } from "./parse.worker";

export const ACCEPT = ".csv,.tsv,.txt,.xlsx,.xlsm,.xls,.ods,.json,.html,.htm";
const SUPPORTED = /\.(csv|tsv|txt|xlsx|xlsm|xlsb|xls|ods|json)$/i;

/** Parses a file off the main thread. Throws an Error with a user-facing Japanese message. */
export async function readDataFile(file: File): Promise<ParseResult> {
  if (!SUPPORTED.test(file.name)) {
    throw new Error(`「${file.name}」は読み込めない形式です。CSV・TSV・Excel・JSON か、書き出した HTML を選んでください。`);
  }
  const buffer = await file.arrayBuffer();
  const worker = new Worker(new URL("./parse.worker.ts", import.meta.url), { type: "module" });
  try {
    const res = await new Promise<WorkerResponse>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => resolve(e.data);
      worker.onerror = () => reject(new Error("ファイルの解析中にエラーが発生しました。"));
      worker.postMessage({ name: file.name, buffer }, [buffer]);
    });
    if (!res.ok) throw new Error(res.message);
    return res.result;
  } finally {
    worker.terminate();
  }
}
