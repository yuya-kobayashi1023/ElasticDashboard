/** gzip + base64 helpers built on the platform CompressionStream (browsers and Node 18+). */

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  // Chunked to stay under the argument limit of String.fromCharCode.
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function gzipBase64(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return bytesToBase64(new Uint8Array(await new Response(stream).arrayBuffer()));
}

export async function gunzipBase64(b64: string): Promise<string> {
  const bin = atob(b64.trim());
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
}

/**
 * Inline loader for compressed exports: unpacks the data and the viewer, then inserts them as
 * the same <script id="ed-data"> / <script id="ed-app"> elements an uncompressed export has.
 */
export const GZIP_LOADER = `(async()=>{const g=async(i)=>{const b=atob(document.getElementById(i).textContent.trim());const u=new Uint8Array(b.length);for(let k=0;k<b.length;k++)u[k]=b.charCodeAt(k);return new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream("gzip"))).text()};const d=document.createElement("script");d.type="application/json";d.id="ed-data";d.textContent=await g("ed-data-gz");document.body.appendChild(d);const s=document.createElement("script");s.id="ed-app";s.textContent=await g("ed-app-gz");document.body.appendChild(s)})().catch(()=>{document.getElementById("root").innerHTML='<p style="padding:24px">このブラウザでは表示できません。最新の Chrome・Edge・Firefox・Safari で開いてください。</p>'})`;
