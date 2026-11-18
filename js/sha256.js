/*
 * sha256.js – Cài đặt hàm băm SHA-256 thuần JavaScript (đồng bộ).
 * Dùng bản đồng bộ để có thể thử hàng nghìn nonce mỗi giây khi đào block.
 */
(function (global) {
  'use strict';

  // Hằng số K và giá trị khởi tạo H được tính từ các số nguyên tố đầu tiên
  // (phần thập phân của căn bậc ba / căn bậc hai), đúng theo chuẩn FIPS 180-4.
  const K = new Uint32Array(64);
  const H0 = new Uint32Array(8);
  (function initConstants() {
    let n = 2;
    let found = 0;
    const frac = (x) => ((x - Math.floor(x)) * 0x100000000) >>> 0;
    while (found < 64) {
      let isPrime = true;
      for (let f = 2; f * f <= n; f++) {
        if (n % f === 0) { isPrime = false; break; }
      }
      if (isPrime) {
        if (found < 8) H0[found] = frac(Math.pow(n, 1 / 2));
        K[found] = frac(Math.pow(n, 1 / 3));
        found++;
      }
      n++;
    }
  })();

  const encoder = new TextEncoder();
  const W = new Uint32Array(64);

  function sha256(message) {
    const bytes = encoder.encode(String(message));
    const len = bytes.length;
    const paddedLen = ((len + 9 + 63) >> 6) << 6;
    const buf = new Uint8Array(paddedLen);
    buf.set(bytes);
    buf[len] = 0x80;
    const view = new DataView(buf.buffer);
    const bitLen = len * 8;
    view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000));
    view.setUint32(paddedLen - 4, bitLen >>> 0);

    let h0 = H0[0], h1 = H0[1], h2 = H0[2], h3 = H0[3];
    let h4 = H0[4], h5 = H0[5], h6 = H0[6], h7 = H0[7];

    for (let off = 0; off < paddedLen; off += 64) {
      for (let i = 0; i < 16; i++) W[i] = view.getUint32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const x = W[i - 15];
        const y = W[i - 2];
        const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
      }

      let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (let i = 0; i < 64; i++) {
        const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[i] + W[i]) | 0;
        const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0;
        d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
      h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
    }

    let out = '';
    for (const v of [h0, h1, h2, h3, h4, h5, h6, h7]) {
      out += (v >>> 0).toString(16).padStart(8, '0');
    }
    return out;
  }

  global.sha256 = sha256;
  if (typeof module !== 'undefined' && module.exports) module.exports = sha256;
})(typeof window !== 'undefined' ? window : globalThis);
