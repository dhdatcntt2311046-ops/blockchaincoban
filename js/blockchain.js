/*
 * blockchain.js – Lõi blockchain của MiniChain.
 * Gồm: giao dịch, block, đào block bằng Proof-of-Work, kiểm tra tính hợp lệ của chuỗi.
 */
(function (global) {
  'use strict';

  const sha256 = global.sha256;
  const ZERO_HASH = '0'.repeat(64);
  const SYSTEM = 'SYSTEM';
  const now = () => (global.performance ? global.performance.now() : Date.now());

  function uid() {
    return sha256(Date.now() + ':' + Math.random()).slice(0, 16);
  }

  /** Hash của block = SHA-256(chỉ số | hash trước | thời gian | giao dịch | nonce) */
  function calcHash(block) {
    return sha256(
      block.index + '|' + block.previousHash + '|' + block.timestamp + '|' +
      JSON.stringify(block.transactions) + '|' + block.nonce
    );
  }

  function makeTx(from, to, amount, note) {
    return { id: uid(), from, to, amount: Number(amount), note: note || '', time: Date.now() };
  }

  function makeWallet(name) {
    return {
      name: name,
      address: '0x' + sha256(name + ':' + Date.now() + ':' + Math.random()).slice(0, 40),
      created: Date.now()
    };
  }

  /** Đào đồng bộ – chỉ dùng khi khởi tạo dữ liệu mẫu với độ khó thấp. */
  function mineSync(block) {
    const target = '0'.repeat(block.difficulty);
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
      this.reward = 50;
      if (data) Object.assign(this, data);
    }

    static from(json) {
      return new Blockchain(json);
    }

    /** Tạo chuỗi mới với block khởi tạo (genesis) và một ít dữ liệu mẫu. */
    static create() {
      const bc = new Blockchain();
      ['An', 'Bình', 'Chi', 'Dũng'].forEach(function (n) { bc.wallets.push(makeWallet(n)); });
      const [an, binh, chi, dung] = bc.wallets;

      const genesis = {
        index: 0,
        timestamp: Date.now(),
        transactions: bc.wallets.map(function (w) { return makeTx(SYSTEM, w.address, 100, 'Cấp vốn ban đầu'); }),
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
          makeTx(SYSTEM, chi.address, bc.reward, 'Phần thưởng đào block'),
          makeTx(an.address, binh.address, 15, 'Trả tiền in tài liệu'),
          makeTx(dung.address, chi.address, 20, 'Góp quỹ nhóm')
        ],
        previousHash: genesis.hash,
        nonce: 0,
        hash: '',
        difficulty: bc.difficulty,
        miner: chi.address
      };
      mineSync(b1);
      bc.chain.push(b1);

      bc.pending.push(makeTx(binh.address, an.address, 5, 'Tiền cà phê'));
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
          if (tx.from === address) bal -= Number(tx.amount);
        }
      }
      return bal;
    }

    /** Tổng tiền đang chờ gửi đi trong mempool. */
    pendingOutOf(address) {
      return this.pending
        .filter(function (tx) { return tx.from === address; })
        .reduce(function (s, tx) { return s + Number(tx.amount); }, 0);
    }

    availableOf(address) {
      return this.balanceOf(address) - this.pendingOutOf(address);
    }

    addWallet(name) {
      name = String(name || '').trim();
      if (!name) throw new Error('Vui lòng nhập tên ví.');
      if (name.length > 24) throw new Error('Tên ví tối đa 24 ký tự.');
      if (this.wallets.some(function (w) { return w.name.toLowerCase() === name.toLowerCase(); })) {
        throw new Error('Tên ví đã tồn tại.');
      }
      const w = makeWallet(name);
      this.wallets.push(w);
      return w;
    }

    addTransaction(from, to, amount, note) {
      amount = Number(amount);
      if (!from || !to) throw new Error('Vui lòng chọn ví gửi và ví nhận.');
      if (from === to) throw new Error('Ví gửi và ví nhận phải khác nhau.');
      if (!isFinite(amount) || amount <= 0) throw new Error('Số tiền phải lớn hơn 0.');
      const available = this.availableOf(from);
      if (amount > available) {
        throw new Error('Số dư khả dụng không đủ (còn ' + Math.round(available * 10000) / 10000 + ' MC).');
      }
      const tx = makeTx(from, to, amount, String(note || '').trim().slice(0, 60));
      this.pending.push(tx);
      return tx;
    }

    /** Tạo block ứng viên chứa phần thưởng cho thợ đào + các giao dịch đang chờ. */
    createCandidate(minerAddress, difficulty) {
      const prev = this.latest;
      return {
        index: prev.index + 1,
        timestamp: Date.now(),
        transactions: [makeTx(SYSTEM, minerAddress, this.reward, 'Phần thưởng đào block')]
          .concat(this.pending.map(function (tx) { return Object.assign({}, tx); })),
        previousHash: prev.hash,
        nonce: 0,
        hash: '',
        difficulty: difficulty || this.difficulty,
        miner: minerAddress
      };
    }

    /** Thêm block đã đào vào chuỗi và xoá các giao dịch đã được đưa vào block. */
    commitBlock(block) {
      if (block.previousHash !== this.latest.hash) {
        throw new Error('Block không còn nối đúng vào cuối chuỗi.');
      }
      const ids = new Set(block.transactions.map(function (tx) { return tx.id; }));
      this.pending = this.pending.filter(function (tx) { return !ids.has(tx.id); });
      this.chain.push(block);
    }

    /** Kiểm tra từng block: dữ liệu khớp hash, đạt độ khó, và trỏ đúng block trước. */
    validate() {
      const chain = this.chain;
      return chain.map(function (block, i) {
        const recomputed = calcHash(block);
        const dataOk = recomputed === block.hash;
        const powOk = block.hash.startsWith('0'.repeat(block.difficulty));
        const linkOk = i === 0 ? block.previousHash === ZERO_HASH : block.previousHash === chain[i - 1].hash;
        const reasons = [];
        if (!dataOk) reasons.push('Dữ liệu đã bị thay đổi – hash tính lại không khớp hash lưu trong block.');
        if (!powOk) reasons.push('Hash không bắt đầu bằng ' + block.difficulty + ' số 0 (chưa đạt độ khó).');
        if (!linkOk) reasons.push('"Hash trước" không khớp với hash của block #' + (i - 1) + '.');
        return { index: i, valid: dataOk && powOk && linkOk, dataOk: dataOk, powOk: powOk, linkOk: linkOk, recomputed: recomputed, reasons: reasons };
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
          if (tx.from === SYSTEM) supply += Number(tx.amount);
          else confirmed++;
        }
      }
      return {
        blocks: this.chain.length,
        confirmed: confirmed,
        pending: this.pending.length,
        wallets: this.wallets.length,
        supply: supply
      };
    }
  }

  global.MiniChain = {
    Blockchain: Blockchain,
    calcHash: calcHash,
    mineAsync: mineAsync,
    mineSync: mineSync,
    ZERO_HASH: ZERO_HASH,
    SYSTEM: SYSTEM
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.MiniChain;
})(typeof window !== 'undefined' ? window : globalThis);
