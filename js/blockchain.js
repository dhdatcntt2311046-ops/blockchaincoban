/*
 * blockchain.js – Lõi blockchain của MiniChain.
 * Gồm: ví (khoá bí mật + mật khẩu), giao dịch có phí, block có Merkle root,
 * đào block bằng Proof-of-Work, độ khó tự điều chỉnh, halving phần thưởng, kiểm tra chuỗi.
 */
(function (global) {
  'use strict';

  const sha256 = global.sha256;
  const ZERO_HASH = '0'.repeat(64);
  const SYSTEM = 'SYSTEM';
  const now = () => (global.performance ? global.performance.now() : Date.now());
  const DEMO_PASSWORD = '123456';   // mật khẩu của 4 ví mẫu, để demo

  // ---- Luật đồng thuận của mạng MiniChain (giống Bitcoin nhưng thu nhỏ để demo) ----
  const RULES = {
    initialReward: 50,      // phần thưởng block ban đầu (MC)
    halvingInterval: 10,    // cứ 10 block phần thưởng giảm một nửa (Bitcoin: 210.000 block)
    maxTxPerBlock: 4,       // tối đa 4 giao dịch người dùng mỗi block (không tính coinbase)
    targetBlockMs: 5000,    // thời gian đào mục tiêu ~5 giây/block (Bitcoin: 10 phút)
    adjustInterval: 3,      // cứ 3 block điều chỉnh độ khó một lần (Bitcoin: 2016 block)
    minDifficulty: 3,
    maxDifficulty: 5,
    defaultFee: 0.1         // phí giao dịch đề xuất (MC)
  };
  const round = (n) => Math.round(Number(n) * 1e8) / 1e8;

  function uid() {
    return sha256(Date.now() + ':' + Math.random()).slice(0, 16);
  }

  /** Hash của một giao dịch = SHA-256(nội dung giao dịch). */
  function txHash(tx) {
    return sha256(JSON.stringify(tx));
  }

  /**
   * Merkle root: băm từng giao dịch, rồi băm ghép từng cặp lên trên cho tới khi còn 1 hash.
   * Sửa bất kỳ giao dịch nào => Merkle root đổi => hash block đổi.
   */
  function merkleRoot(transactions) {
    if (!transactions.length) return ZERO_HASH;
    let level = transactions.map(txHash);
    while (level.length > 1) {
      const next = [];
      for (let i = 0; i < level.length; i += 2) {
        next.push(sha256(level[i] + (level[i + 1] || level[i])));   // số lẻ: nhân đôi phần tử cuối
      }
      level = next;
    }
    return level[0];
  }

  /** Hash của block = SHA-256(tiêu đề block): chỉ số | hash trước | thời gian | Merkle root | độ khó | nonce */
  function calcHash(block) {
    return sha256(
      block.index + '|' + block.previousHash + '|' + block.timestamp + '|' +
      block.merkleRoot + '|' + block.difficulty + '|' + block.nonce
    );
  }

  /** Phần thưởng của block ở độ cao `height` (halving). */
  function rewardAt(height) {
    return RULES.initialReward / Math.pow(2, Math.floor(height / RULES.halvingInterval));
  }

  function makeTx(from, to, amount, note, fee) {
    return { id: uid(), from, to, amount: Number(amount), fee: round(fee || 0), note: note || '', time: Date.now() };
  }

  /** Giao dịch coinbase: giao dịch đầu tiên của block, tạo ra phần thưởng + gom phí cho thợ đào. */
  function makeCoinbase(miner, reward, fees) {
    const vn = (n) => String(round(n)).replace('.', ',');
    const tx = makeTx(SYSTEM, miner, round(reward + fees), 'Coinbase: thưởng ' + vn(reward) + ' MC' + (fees ? ' + phí ' + vn(fees) + ' MC' : ''));
    tx.reward = reward;
    tx.fees = round(fees);
    return tx;
  }

  /** Chuỗi hex ngẫu nhiên an toàn (crypto.getRandomValues) dùng cho khoá bí mật và muối mật khẩu. */
  function randomHex(bytes) {
    const a = new Uint8Array(bytes);
    if (global.crypto && global.crypto.getRandomValues) global.crypto.getRandomValues(a);
    else for (let i = 0; i < bytes; i++) a[i] = Math.floor(Math.random() * 256);
    return Array.from(a, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  /** Địa chỉ ví = '0x' + 40 ký tự đầu của SHA-256(khoá bí mật): ai giữ khoá mới chứng minh được mình là chủ ví. */
  function addressFromKey(privateKey) {
    return '0x' + sha256('minichain-pub:' + String(privateKey).trim().toLowerCase()).slice(0, 40);
  }

  /** Mật khẩu không lưu trực tiếp: chỉ lưu SHA-256(muối + mật khẩu). */
  function hashPassword(salt, password) {
    return sha256(salt + ':' + String(password));
  }

  /** Tạo ví mới: sinh khoá bí mật 64 ký tự hex, tính địa chỉ từ khoá, băm mật khẩu kèm muối. */
  function makeWallet(name, password) {
    const privateKey = randomHex(32);
    const salt = randomHex(8);
    return {
      wallet: { name: name, address: addressFromKey(privateKey), salt: salt, pwHash: hashPassword(salt, password), created: Date.now() },
      privateKey: privateKey
    };
  }

  /** Đào đồng bộ – chỉ dùng khi khởi tạo dữ liệu mẫu với độ khó thấp. */
  function mineSync(block) {
    const target = '0'.repeat(block.difficulty);
    block.merkleRoot = merkleRoot(block.transactions);
    block.nonce = 0;
    block.hash = calcHash(block);
    while (!block.hash.startsWith(target)) {
      block.nonce++;
      block.hash = calcHash(block);
    }
    return block;
  }

  /**
   * Đào bất đồng bộ: thử nonce theo từng lát ~25ms để giao diện không bị đứng,
   * báo tiến độ qua onProgress. Trả về null nếu bị dừng giữa chừng.
   */
  function mineAsync(block, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      const target = '0'.repeat(block.difficulty);
      const start = now();
      let hashes = 0;
      block.merkleRoot = merkleRoot(block.transactions);
      block.nonce = 0;

      function report() {
        if (opts.onProgress) {
          opts.onProgress({ nonce: block.nonce, hash: block.hash, hashes: hashes, elapsed: now() - start });
        }
      }

      function step() {
        if (opts.shouldStop && opts.shouldStop()) return resolve(null);
        const sliceStart = now();
        while (now() - sliceStart < 25) {
          block.hash = calcHash(block);
          hashes++;
          if (block.hash.startsWith(target)) {
            block.minedIn = Math.round(now() - start);   // thời gian đào thực tế (ms)
            block.hashes = hashes;
            report();
            return resolve(block);
          }
          block.nonce++;
        }
        report();
        setTimeout(step, 0);
      }
      step();
    });
  }

  class Blockchain {
    constructor(data) {
      this.chain = [];
      this.pending = [];
      this.wallets = [];
      this.difficulty = 3;
      this.reward = RULES.initialReward;
      if (data) Object.assign(this, data);
    }

    static from(json) {
      return new Blockchain(json);
    }

    /** Tạo chuỗi mới với block khởi tạo (genesis) và một ít dữ liệu mẫu. */
    static create() {
      const bc = new Blockchain();
      ['An', 'Bình', 'Chi', 'Dũng'].forEach(function (n) { bc.wallets.push(makeWallet(n, DEMO_PASSWORD).wallet); });
      const [an, binh, chi, dung] = bc.wallets;

      const genesis = {
        index: 0,
        timestamp: Date.now(),
        transactions: bc.wallets.map(function (w) { const t = makeTx(SYSTEM, w.address, 100, 'Cấp vốn ban đầu'); t.reward = 100; return t; }),
        previousHash: ZERO_HASH,
        nonce: 0,
        hash: '',
        difficulty: bc.difficulty,
        miner: SYSTEM
      };
      mineSync(genesis);
      bc.chain.push(genesis);

      const b1 = {
        index: 1,
        timestamp: Date.now() + 1,
        transactions: [
          makeCoinbase(chi.address, rewardAt(1), 0.3),
          makeTx(an.address, binh.address, 15, 'Trả tiền in tài liệu', 0.1),
          makeTx(dung.address, chi.address, 20, 'Góp quỹ nhóm', 0.2)
        ],
        previousHash: genesis.hash,
        nonce: 0,
        hash: '',
        difficulty: bc.difficulty,
        miner: chi.address
      };
      mineSync(b1);
      bc.chain.push(b1);

      b1.minedIn = 0;
      bc.pending.push(makeTx(binh.address, an.address, 5, 'Tiền cà phê', 0.1));
      bc.pending.push(makeTx(chi.address, dung.address, 12, 'Mua sách', 0.5));
      bc.reward = rewardAt(2);
      return bc;
    }

    get latest() {
      return this.chain[this.chain.length - 1];
    }

    nameOf(address) {
      if (address === SYSTEM) return 'Hệ thống';
      const w = this.wallets.find(function (x) { return x.address === address; });
      return w ? w.name : address.slice(0, 10) + '…';
    }

    /** Số dư đã xác nhận (chỉ tính giao dịch nằm trong block). */
    balanceOf(address) {
      let bal = 0;
      for (const block of this.chain) {
        for (const tx of block.transactions) {
          if (tx.to === address) bal += Number(tx.amount);
          if (tx.from === address) bal -= Number(tx.amount) + Number(tx.fee || 0);
        }
      }
      return round(bal);
    }

    /** Tổng tiền (kể cả phí) đang chờ gửi đi trong mempool. */
    pendingOutOf(address) {
      return round(this.pending
        .filter(function (tx) { return tx.from === address; })
        .reduce(function (s, tx) { return s + Number(tx.amount) + Number(tx.fee || 0); }, 0));
    }

    availableOf(address) {
      return round(this.balanceOf(address) - this.pendingOutOf(address));
    }

    /** Số xác nhận của block: số block tính từ block đó tới đỉnh chuỗi. */
    confirmationsOf(blockIndex) {
      return this.latest.index - blockIndex + 1;
    }

    /** Mempool xếp theo phí giảm dần (thợ đào ưu tiên giao dịch trả phí cao). */
    sortedPending() {
      return this.pending.slice().sort(function (a, b) { return (b.fee || 0) - (a.fee || 0) || a.time - b.time; });
    }

    /** Giao dịch sẽ được chọn vào block tiếp theo (tối đa maxTxPerBlock, phí cao trước). */
    selectForBlock() {
      return this.sortedPending().slice(0, RULES.maxTxPerBlock);
    }

    /** Phần thưởng của block kế tiếp. */
    nextReward() {
      return rewardAt(this.latest.index + 1);
    }

    /** Số block còn lại tới lần halving tiếp theo. */
    blocksToHalving() {
      const h = this.latest.index + 1;
      return RULES.halvingInterval - (h % RULES.halvingInterval);
    }

    /**
     * Điều chỉnh độ khó: sau mỗi `adjustInterval` block, so thời gian đào trung bình với mục tiêu.
     * Đào nhanh hơn một nửa mục tiêu => tăng độ khó; chậm hơn gấp đôi => giảm độ khó.
     */
    retarget() {
      const h = this.latest.index;
      if (h === 0 || h % RULES.adjustInterval !== 0) return null;
      const recent = this.chain.slice(-RULES.adjustInterval).filter(function (b) { return b.minedIn > 0; });
      if (recent.length < RULES.adjustInterval) return null;
      const avg = recent.reduce(function (s, b) { return s + b.minedIn; }, 0) / recent.length;
      const old = this.difficulty;
      if (avg < RULES.targetBlockMs / 2) this.difficulty = Math.min(RULES.maxDifficulty, old + 1);
      else if (avg > RULES.targetBlockMs * 2) this.difficulty = Math.max(RULES.minDifficulty, old - 1);
      return { avg: avg, from: old, to: this.difficulty };
    }

    /** Số block còn lại tới lần điều chỉnh độ khó tiếp theo. */
    blocksToRetarget() {
      return RULES.adjustInterval - (this.latest.index % RULES.adjustInterval);
    }

    /** Tạo ví mới có mật khẩu. Trả về { wallet, privateKey } – khoá bí mật chỉ hiện cho người dùng một lần. */
    addWallet(name, password, confirm) {
      name = String(name || '').trim();
      password = String(password || '');
      if (!name) throw new Error('Vui lòng nhập tên ví.');
      if (name.length > 24) throw new Error('Tên ví tối đa 24 ký tự.');
      if (this.findWallet(name)) throw new Error('Tên ví đã tồn tại.');
      if (password.length < 6) throw new Error('Mật khẩu phải có ít nhất 6 ký tự.');
      if (confirm !== undefined && password !== String(confirm)) throw new Error('Mật khẩu nhập lại không khớp.');
      const made = makeWallet(name, password);
      this.wallets.push(made.wallet);
      return made;
    }

    /** Tìm ví theo tên (không phân biệt hoa thường) hoặc theo địa chỉ. */
    findWallet(nameOrAddress) {
      const q = String(nameOrAddress || '').trim().toLowerCase();
      if (!q) return null;
      return this.wallets.find(function (w) { return w.name.toLowerCase() === q || w.address.toLowerCase() === q; }) || null;
    }

    /** Đăng nhập bằng tên ví (hoặc địa chỉ) + mật khẩu. */
    loginWithPassword(nameOrAddress, password) {
      const w = this.findWallet(nameOrAddress);
      if (!w) throw new Error('Không tìm thấy ví có tên hoặc địa chỉ này.');
      if (w.metamask) throw new Error('Ví này liên kết với MetaMask – hãy đăng nhập bằng MetaMask.');
      if (!w.pwHash || hashPassword(w.salt, password) !== w.pwHash) throw new Error('Mật khẩu không đúng.');
      return w;
    }

    /** Đăng nhập bằng khoá bí mật: tính lại địa chỉ từ khoá rồi tìm ví khớp. */
    loginWithKey(privateKey) {
      const key = String(privateKey || '').trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(key)) throw new Error('Khoá bí mật phải gồm đúng 64 ký tự hex (0-9, a-f).');
      const address = addressFromKey(key);
      const w = this.wallets.find(function (x) { return x.address === address; });
      if (!w) throw new Error('Khoá bí mật không khớp với ví nào trong MiniChain.');
      return w;
    }

    addTransaction(from, to, amount, note, fee) {
      amount = Number(amount);
      fee = fee === undefined || fee === '' ? RULES.defaultFee : Number(fee);
      if (!from || !to) throw new Error('Vui lòng chọn ví gửi và ví nhận.');
      if (from === to) throw new Error('Ví gửi và ví nhận phải khác nhau.');
      if (!isFinite(amount) || amount <= 0) throw new Error('Số tiền phải lớn hơn 0.');
      if (!isFinite(fee) || fee < 0) throw new Error('Phí giao dịch không hợp lệ.');
      if (fee > 10) throw new Error('Phí giao dịch tối đa 10 MC.');
      const available = this.availableOf(from);
      if (round(amount + fee) > available) {
        throw new Error('Số dư khả dụng không đủ cho số tiền + phí (còn ' + Math.round(available * 10000) / 10000 + ' MC).');
      }
      const tx = makeTx(from, to, amount, String(note || '').trim().slice(0, 60), fee);
      this.pending.push(tx);
      return tx;
    }

    /**
     * Tạo block ứng viên: coinbase (thưởng + tổng phí) + tối đa maxTxPerBlock giao dịch phí cao nhất.
     * Độ khó do mạng quyết định (this.difficulty), thợ đào không tự chọn.
     */
    createCandidate(minerAddress) {
      const prev = this.latest;
      const picked = this.selectForBlock().map(function (tx) { return Object.assign({}, tx); });
      const fees = picked.reduce(function (s, tx) { return s + Number(tx.fee || 0); }, 0);
      const reward = rewardAt(prev.index + 1);
      const block = {
        index: prev.index + 1,
        timestamp: Date.now(),
        transactions: [makeCoinbase(minerAddress, reward, fees)].concat(picked),
        previousHash: prev.hash,
        merkleRoot: '',
        nonce: 0,
        hash: '',
        difficulty: this.difficulty,
        miner: minerAddress
      };
      block.merkleRoot = merkleRoot(block.transactions);
      return block;
    }

    /** Thêm block đã đào vào chuỗi, xoá giao dịch đã vào block, cập nhật thưởng và độ khó. */
    commitBlock(block) {
      if (block.previousHash !== this.latest.hash) {
        throw new Error('Block không còn nối đúng vào cuối chuỗi.');
      }
      const ids = new Set(block.transactions.map(function (tx) { return tx.id; }));
      this.pending = this.pending.filter(function (tx) { return !ids.has(tx.id); });
      this.chain.push(block);
      this.reward = this.nextReward();
      return this.retarget();
    }

    /** Kiểm tra từng block: dữ liệu khớp hash, đạt độ khó, và trỏ đúng block trước. */
    validate() {
      const chain = this.chain;
      return chain.map(function (block, i) {
        const merkle = merkleRoot(block.transactions);
        const merkleOk = merkle === block.merkleRoot;
        const recomputed = calcHash(Object.assign({}, block, { merkleRoot: merkle }));
        const dataOk = merkleOk && recomputed === block.hash;
        const powOk = block.hash.startsWith('0'.repeat(block.difficulty));
        const linkOk = i === 0 ? block.previousHash === ZERO_HASH : block.previousHash === chain[i - 1].hash;
        // Luật coinbase: thợ đào chỉ được nhận đúng phần thưởng + tổng phí
        let rulesOk = true;
        if (i > 0) {
          const cb = block.transactions[0];
          const users = block.transactions.slice(1);
          const fees = users.reduce(function (s, tx) { return s + Number(tx.fee || 0); }, 0);
          rulesOk = !!cb && cb.from === SYSTEM && round(cb.amount) <= round(rewardAt(i) + fees) &&
            users.every(function (tx) { return tx.from !== SYSTEM; }) && users.length <= RULES.maxTxPerBlock;
        }
        const reasons = [];
        if (!merkleOk) reasons.push('Giao dịch đã bị thay đổi – Merkle root tính lại không khớp Merkle root trong tiêu đề block.');
        else if (!dataOk) reasons.push('Tiêu đề block đã bị thay đổi – hash tính lại không khớp hash lưu trong block.');
        if (!powOk) reasons.push('Hash không bắt đầu bằng ' + block.difficulty + ' số 0 (chưa đạt độ khó).');
        if (!linkOk) reasons.push('"Hash trước" không khớp với hash của block #' + (i - 1) + '.');
        if (!rulesOk) reasons.push('Vi phạm luật đồng thuận: coinbase vượt quá phần thưởng + phí, hoặc block quá ' + RULES.maxTxPerBlock + ' giao dịch.');
        return {
          index: i, valid: dataOk && powOk && linkOk && rulesOk, dataOk: dataOk, merkleOk: merkleOk, powOk: powOk, linkOk: linkOk, rulesOk: rulesOk,
          merkle: merkle, recomputed: recomputed, reasons: reasons
        };
      });
    }

    isValid() {
      return this.validate().every(function (s) { return s.valid; });
    }

    stats() {
      let confirmed = 0;
      let supply = 0;
      for (const block of this.chain) {
        for (const tx of block.transactions) {
          if (tx.from === SYSTEM) supply += Number(tx.reward !== undefined ? tx.reward : tx.amount);
          else confirmed++;
        }
      }
      return {
        blocks: this.chain.length,
        confirmed: confirmed,
        pending: this.pending.length,
        wallets: this.wallets.length,
        supply: round(supply),
        fees: round(this.chain.reduce(function (s, b) { return s + (b.transactions[0] && b.transactions[0].fees || 0); }, 0))
      };
    }
  }

  global.MiniChain = {
    Blockchain: Blockchain,
    calcHash: calcHash,
    merkleRoot: merkleRoot,
    txHash: txHash,
    rewardAt: rewardAt,
    RULES: RULES,
    mineAsync: mineAsync,
    mineSync: mineSync,
    ZERO_HASH: ZERO_HASH,
    SYSTEM: SYSTEM,
    DEMO_PASSWORD: DEMO_PASSWORD,
    addressFromKey: addressFromKey
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.MiniChain;
})(typeof window !== 'undefined' ? window : globalThis);
