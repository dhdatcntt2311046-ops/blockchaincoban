/*
 * qrcode.js – Tạo mã QR (chuẩn ISO/IEC 18004) bằng JavaScript thuần, không dùng thư viện.
 * Hỗ trợ chế độ byte (UTF-8), mức sửa lỗi M, phiên bản 1–10 (tối đa ~213 byte).
 * Dùng: QRCode.svg('nội dung', { size: 200 }) → chuỗi <svg>; QRCode.matrix('nội dung') → mảng 2 chiều true/false.
 */
(function (global) {
  'use strict';

  // [tổng số codeword, số codeword sửa lỗi mỗi khối, số khối] – mức sửa lỗi M
  const TABLE = [null,
    [26, 10, 1], [44, 16, 1], [70, 26, 1], [100, 18, 2], [134, 24, 2],
    [172, 16, 4], [196, 18, 4], [242, 22, 4], [292, 22, 5], [346, 26, 5]];
  const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

  // ---------- Reed–Solomon trên GF(256), đa thức 0x11D ----------
  function gfMul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xff;
  }
  function rsDivisor(degree) {
    const result = new Array(degree).fill(0);
    result[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < result.length; j++) {
        result[j] = gfMul(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = gfMul(root, 0x02);
    }
    return result;
  }
  function rsRemainder(data, divisor) {
    const result = new Array(divisor.length).fill(0);
    for (const b of data) {
      const factor = b ^ result.shift();
      result.push(0);
      for (let i = 0; i < divisor.length; i++) result[i] ^= gfMul(divisor[i], factor);
    }
    return result;
  }

  function utf8(text) {
    return Array.from(new TextEncoder().encode(String(text)));
  }

  // ---------- Mã hoá dữ liệu thành các codeword ----------
  function encodeData(bytes) {
    for (let v = 1; v <= 10; v++) {
      const [total, ec, blocks] = TABLE[v];
      const dataCw = total - ec * blocks;
      const countBits = v <= 9 ? 8 : 16;
      if (4 + countBits + bytes.length * 8 > dataCw * 8) continue;
      const bits = [];
      const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
      put(0b0100, 4);                       // chế độ byte
      put(bytes.length, countBits);
      bytes.forEach((b) => put(b, 8));
      put(0, Math.min(4, dataCw * 8 - bits.length)); // terminator
      while (bits.length % 8) bits.push(0);
      const cw = [];
      for (let i = 0; i < bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(''), 2));
      for (let pad = 0xec; cw.length < dataCw; pad ^= 0xec ^ 0x11) cw.push(pad);
      return { version: v, data: cw, total: total, ec: ec, blocks: blocks };
    }
    throw new Error('Nội dung quá dài để tạo mã QR.');
  }

  function interleave(info) {
    const { data, ec, blocks } = info;
    const shortLen = Math.floor(data.length / blocks);
    const longCount = data.length % blocks;
    const dataBlocks = [];
    let k = 0;
    for (let b = 0; b < blocks; b++) {
      const len = shortLen + (b >= blocks - longCount ? 1 : 0);
      dataBlocks.push(data.slice(k, k + len));
      k += len;
    }
    const div = rsDivisor(ec);
    const ecBlocks = dataBlocks.map((d) => rsRemainder(d, div));
    const out = [];
    for (let i = 0; i <= shortLen; i++) dataBlocks.forEach((d) => { if (i < d.length) out.push(d[i]); });
    for (let i = 0; i < ec; i++) ecBlocks.forEach((e) => out.push(e[i]));
    return out;
  }

  // ---------- Dựng ma trận ----------
  function build(text) {
    const info = encodeData(utf8(text));
    const v = info.version;
    const size = v * 4 + 17;
    const mod = [];
    const fn = [];
    for (let y = 0; y < size; y++) { mod.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
    const set = (x, y, dark) => { mod[y][x] = dark; fn[y][x] = true; };

    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }   // timing
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          const x = cx + dx, y = cy + dy;
          if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
        }
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const al = ALIGN[v];
    for (let i = 0; i < al.length; i++) {
      for (let j = 0; j < al.length; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
    drawFormat(0);   // giữ chỗ cho thông tin định dạng
    if (v >= 7) {
      let rem = v;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const bits = (v << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const dark = ((bits >>> i) & 1) === 1;
        const a = size - 11 + (i % 3), b = Math.floor(i / 3);
        set(a, b, dark); set(b, a, dark);
      }
    }

    // Đặt các bit dữ liệu theo đường zigzag
    const cw = interleave(info);
    let bit = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!fn[y][x] && bit < cw.length * 8) {
            mod[y][x] = ((cw[bit >>> 3] >>> (7 - (bit & 7))) & 1) === 1;
            bit++;
          }
        }
      }
    }

    // Chọn mặt nạ có điểm phạt thấp nhất
    let best = 0, bestScore = Infinity;
    for (let m = 0; m < 8; m++) {
      applyMask(m); drawFormat(m);
      const s = penalty();
      if (s < bestScore) { bestScore = s; best = m; }
      applyMask(m);   // XOR lần nữa để trả lại như cũ
    }
    applyMask(best); drawFormat(best);
    return mod;

    function drawFormat(mask) {
      const data = (0 << 3) | mask;    // mức M = 00
      let rem = data;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const bits = ((data << 10) | rem) ^ 0x5412;
      const b = (i) => ((bits >>> i) & 1) === 1;
      for (let i = 0; i <= 5; i++) set(8, i, b(i));
      set(8, 7, b(6)); set(8, 8, b(7)); set(7, 8, b(8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, b(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, b(i));
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, b(i));
      set(8, size - 8, true);
    }
    function applyMask(m) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (fn[y][x]) continue;
          let inv;
          switch (m) {
            case 0: inv = (x + y) % 2 === 0; break;
            case 1: inv = y % 2 === 0; break;
            case 2: inv = x % 3 === 0; break;
            case 3: inv = (x + y) % 3 === 0; break;
            case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
            case 5: inv = (x * y) % 2 + (x * y) % 3 === 0; break;
            case 6: inv = ((x * y) % 2 + (x * y) % 3) % 2 === 0; break;
            default: inv = ((x + y) % 2 + (x * y) % 3) % 2 === 0;
          }
          if (inv) mod[y][x] = !mod[y][x];
        }
      }
    }
    function penalty() {
      let score = 0, dark = 0;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (mod[y][x]) dark++;
          if (x < size - 1 && y < size - 1) {
            const c = mod[y][x];
            if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) score += 3;
          }
        }
      }
      for (let pass = 0; pass < 2; pass++) {
        for (let a = 0; a < size; a++) {
          let run = 1;
          for (let b = 1; b < size; b++) {
            const cur = pass ? mod[b][a] : mod[a][b];
            const prev = pass ? mod[b - 1][a] : mod[a][b - 1];
            if (cur === prev) { run++; if (run === 5) score += 3; else if (run > 5) score++; } else run = 1;
          }
        }
      }
      score += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
      return score;
    }
  }

  function svg(text, opts) {
    opts = opts || {};
    const m = build(text);
    const n = m.length, q = 4, total = n + q * 2;
    let path = '';
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) if (m[y][x]) path += 'M' + (x + q) + ' ' + (y + q) + 'h1v1h-1z';
    }
    const size = opts.size || 200;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total + '" width="' + size + '" height="' + size +
      '" shape-rendering="crispEdges" role="img" aria-label="Mã QR"><rect width="100%" height="100%" fill="#fff"/><path d="' + path + '" fill="#000"/></svg>';
  }

  global.QRCode = { matrix: build, svg: svg };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.QRCode;
})(typeof window !== 'undefined' ? window : globalThis);
