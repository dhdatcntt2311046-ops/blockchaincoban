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
  const ADMIN_USER = 'admin';        // tài khoản quản trị mặc định
  const ADMIN_PASSWORD = 'admin123'; // mật khẩu quản trị mặc định – nên đổi sau khi đăng nhập

  // ---- Luật đồng thuận của mạng MiniChain (giống Bitcoin nhưng thu nhỏ để demo) ----
  const RULES = {
    initialReward: 50,      // phần thưởng block ban đầu (MC)
    halvingInterval: 10,    // cứ 10 block phần thưởng giảm một nửa (Bitcoin: 210.000 block)
    maxTxPerBlock: 4,       // tối đa 4 giao dịch người dùng mỗi block (không tính coinbase)
    targetBlockMs: 5000,    // thời gian đào mục tiêu ~5 giây/block (Bitcoin: 10 phút)
    adjustInterval: 3,      // cứ 3 block điều chỉnh độ khó một lần (Bitcoin: 2016 block)
    minDifficulty: 3,
    maxDifficulty: 5,
    defaultFee: 0.1,        // phí giao dịch đề xuất (MC)
    // Điều kiện để được đào block
    minTxToMine: 1,         // mempool phải có ít nhất 1 giao dịch (không đào block rỗng chỉ để lấy thưởng)
    minMinerBalance: 10,    // ví thợ đào phải có ít nhất 10 MC đã xác nhận (tiền đặt cọc)
    maxConsecutiveBlocks: 3 // một ví không được đào quá 3 block liên tiếp
  };
  // Các gói tiết kiệm: khoá MC trong số block nhất định để nhận lãi
  const STAKE_PLANS = [
    { blocks: 5, rate: 0.02, name: 'Ngắn hạn' },
    { blocks: 10, rate: 0.05, name: 'Trung hạn' },
    { blocks: 20, rate: 0.12, name: 'Dài hạn' }
  ];
  const FIAT = { VND: { digits: 0, symbol: '₫' }, USD: { digits: 2, symbol: '$' } };
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

  /** Phần thưởng của block ở độ cao `height` (halving) theo bộ luật `rules`. */
  function rewardAt(height, rules) {
    const r = rules || RULES;
    return r.initialReward / Math.pow(2, Math.floor(height / r.halvingInterval));
  }

  function makeAdmin(password) {
    const salt = randomHex(8);
    return { username: ADMIN_USER, salt: salt, pwHash: hashPassword(salt, password) };
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
      this.ruleHistory = [{ from: 0, rules: Object.assign({}, RULES) }];  // luật mạng theo từng phiên bản
      this.adminLog = [];
      // Dịch vụ dùng MC
      this.products = [];      // cửa hàng
      this.orders = [];        // đơn mua hàng
      this.invoices = [];      // hoá đơn / yêu cầu thanh toán
      this.fx = { rates: { VND: 23500, USD: 1 }, spread: 0.01 };  // tỷ giá 1 MC = ? VND / USD, chênh lệch mua-bán
      this.fiat = {};          // tài khoản VND/USD mô phỏng của từng ví (ngoài chuỗi)
      this.fxOrders = [];      // lệnh đổi tiền
      this.stakes = [];        // khoản gửi tiết kiệm
      if (data) Object.assign(this, data);
      if (!this.admin) this.admin = makeAdmin(ADMIN_PASSWORD);
    }

    static from(json) {
      return new Blockchain(json);
    }

    /** Tạo chuỗi mới với block khởi tạo (genesis) và một ít dữ liệu mẫu. */
    static create() {
      const bc = new Blockchain();
      ['An', 'Bình', 'Chi', 'Dũng'].forEach(function (n) { bc.wallets.push(makeWallet(n, DEMO_PASSWORD).wallet); });
      const [an, binh, chi, dung] = bc.wallets;
      // Ví hệ thống: không đăng nhập được, do app vận hành
      const exchange = { name: 'Quầy đổi tiền', address: addressFromKey(randomHex(32)), system: 'exchange', created: Date.now() };
      const pool = { name: 'Quỹ tiết kiệm', address: addressFromKey(randomHex(32)), system: 'staking', created: Date.now() };
      bc.wallets.push(exchange, pool);
      const grant = function (w, amount, note) { const t = makeTx(SYSTEM, w.address, amount, note); t.reward = amount; return t; };

      const genesis = {
        index: 0,
        timestamp: Date.now(),
        transactions: [an, binh, chi, dung].map(function (w) { return grant(w, 100, 'Cấp vốn ban đầu'); })
          .concat([grant(exchange, 1000, 'Dự trữ của quầy đổi tiền'), grant(pool, 500, 'Dự trữ trả lãi của quỹ tiết kiệm')]),
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
          makeCoinbase(chi.address, rewardAt(1, RULES), 0.3),
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
      bc.reward = bc.rewardAt(2);
      [an, binh, chi, dung].forEach(function (w) { bc.fiat[w.address] = { VND: 1000000, USD: 50 }; });
      [
        [chi, '📘', 'Sách "Blockchain cơ bản"', 'Sách nhập môn về hash, block và Proof-of-Work.', 20, 5],
        [chi, '👕', 'Áo thun MiniChain', 'Áo cotton in logo MiniChain, size M.', 35, 3],
        [dung, '☕', 'Cà phê sữa', 'Một ly cà phê sữa đá.', 5, 20],
        [dung, '🎓', 'Khoá học Solidity', 'Khoá học trực tuyến viết hợp đồng thông minh.', 60, 2]
      ].forEach(function (p) { bc.products.push({ id: uid().slice(0, 10), seller: p[0].address, icon: p[1], name: p[2], desc: p[3], price: p[4], stock: p[5], active: true, created: Date.now() }); });
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
      return this.pending.slice().sort(function (a, b) {
        return (b.mint ? 1 : 0) - (a.mint ? 1 : 0) || (b.fee || 0) - (a.fee || 0) || a.time - b.time;   // cấp phát của quản trị viên được ưu tiên
      });
    }

    /** Giao dịch sẽ được chọn vào block tiếp theo (tối đa maxTxPerBlock, phí cao trước). */
    selectForBlock() {
      return this.sortedPending().slice(0, this.rulesAt(this.latest.index + 1).maxTxPerBlock);
    }

    /** Bộ luật mạng có hiệu lực tại block `height` (phiên bản mới nhất có from ≤ height). */
    rulesAt(height) {
      let r = this.ruleHistory[0].rules;
      for (const v of this.ruleHistory) if (v.from <= height) r = v.rules;
      return r;
    }

    /** Luật áp dụng cho block kế tiếp. */
    get rules() {
      return this.rulesAt(this.latest.index + 1);
    }

    rewardAt(height) {
      return rewardAt(height, this.rulesAt(height));
    }

    /** Phần thưởng của block kế tiếp. */
    nextReward() {
      return this.rewardAt(this.latest.index + 1);
    }

    /** Số block còn lại tới lần halving tiếp theo. */
    blocksToHalving() {
      const h = this.latest.index + 1;
      const n = this.rules.halvingInterval;
      return n - (h % n);
    }

    /**
     * Điều chỉnh độ khó: sau mỗi `adjustInterval` block, so thời gian đào trung bình với mục tiêu.
     * Đào nhanh hơn một nửa mục tiêu => tăng độ khó; chậm hơn gấp đôi => giảm độ khó.
     */
    retarget() {
      const h = this.latest.index;
      const R = this.rulesAt(h);
      if (h === 0 || h % R.adjustInterval !== 0) return null;
      const recent = this.chain.slice(-R.adjustInterval).filter(function (b) { return b.minedIn > 0; });
      if (recent.length < R.adjustInterval) return null;
      const avg = recent.reduce(function (s, b) { return s + b.minedIn; }, 0) / recent.length;
      const old = this.difficulty;
      if (avg < R.targetBlockMs / 2) this.difficulty = Math.min(R.maxDifficulty, old + 1);
      else if (avg > R.targetBlockMs * 2) this.difficulty = Math.max(R.minDifficulty, old - 1);
      return { avg: avg, from: old, to: this.difficulty };
    }

    /** Số block còn lại tới lần điều chỉnh độ khó tiếp theo. */
    blocksToRetarget() {
      const n = this.rules.adjustInterval;
      return n - (this.latest.index % n);
    }

    // ---------- Quản trị viên ----------
    log(action) {
      this.adminLog.unshift({ time: Date.now(), action: String(action) });
      this.adminLog = this.adminLog.slice(0, 50);
    }

    /** Đăng nhập quản trị viên bằng tên đăng nhập + mật khẩu. */
    loginAdmin(username, password) {
      if (String(username || '').trim().toLowerCase() !== this.admin.username) throw new Error('Sai tên đăng nhập quản trị.');
      if (hashPassword(this.admin.salt, password) !== this.admin.pwHash) throw new Error('Mật khẩu quản trị không đúng.');
      return true;
    }

    changeAdminPassword(oldPw, newPw, confirm) {
      if (hashPassword(this.admin.salt, oldPw) !== this.admin.pwHash) throw new Error('Mật khẩu hiện tại không đúng.');
      newPw = String(newPw || '');
      if (newPw.length < 6) throw new Error('Mật khẩu mới phải có ít nhất 6 ký tự.');
      if (newPw !== String(confirm)) throw new Error('Mật khẩu nhập lại không khớp.');
      this.admin = Object.assign(makeAdmin(newPw), { username: this.admin.username });
      this.log('Đổi mật khẩu quản trị');
    }

    walletOrThrow(address) {
      const w = this.wallets.find(function (x) { return x.address === address; });
      if (!w) throw new Error('Không tìm thấy ví.');
      return w;
    }

    /** Khoá / mở khoá ví: ví bị khoá không đăng nhập, gửi MC hay đào block được (vẫn nhận được MC). */
    setWalletLocked(address, locked) {
      const w = this.walletOrThrow(address);
      w.locked = !!locked;
      if (locked) {
        if (w.system) throw new Error('Không khoá ví hệ thống.');
        const mine = this.pending.filter(function (tx) { return tx.from === address; });
        const self = this;
        mine.forEach(function (tx) { self.dropPending(tx); });
        this.log('Khoá ví "' + w.name + '"' + (mine.length ? ', huỷ ' + mine.length + ' giao dịch chờ' : ''));
      } else {
        this.log('Mở khoá ví "' + w.name + '"');
      }
      return w;
    }

    /** Đặt lại mật khẩu cho ví (khi chủ ví quên mật khẩu). */
    resetWalletPassword(address, newPw, confirm) {
      const w = this.walletOrThrow(address);
      if (w.metamask) throw new Error('Ví MetaMask không dùng mật khẩu.');
      newPw = String(newPw || '');
      if (newPw.length < 6) throw new Error('Mật khẩu mới phải có ít nhất 6 ký tự.');
      if (newPw !== String(confirm)) throw new Error('Mật khẩu nhập lại không khớp.');
      w.salt = randomHex(8);
      w.pwHash = hashPassword(w.salt, newPw);
      this.log('Đặt lại mật khẩu ví "' + w.name + '"');
      return w;
    }

    /** Cấp MC cho ví: tạo giao dịch phát hành từ SYSTEM, được đưa vào block kế tiếp như các giao dịch khác. */
    mint(address, amount, note) {
      const w = this.walletOrThrow(address);
      amount = Number(amount);
      if (!isFinite(amount) || amount <= 0) throw new Error('Số MC cấp phải lớn hơn 0.');
      if (amount > 10000) throw new Error('Mỗi lần cấp tối đa 10.000 MC.');
      const tx = makeTx(SYSTEM, address, round(amount), String(note || '').trim().slice(0, 60) || 'Cấp phát bởi quản trị viên', 0);
      tx.mint = true;
      this.pending.push(tx);
      this.log('Cấp ' + round(amount) + ' MC cho ví "' + w.name + '" (chờ đào vào block)');
      return tx;
    }

    /** Xoá một giao dịch khỏi mempool. */
    removePending(id) {
      const tx = this.pending.find(function (t) { return t.id === id; });
      if (!tx) throw new Error('Giao dịch không còn trong mempool.');
      this.dropPending(tx);
      this.log('Xoá giao dịch ' + id.slice(0, 8) + ' (' + this.nameOf(tx.from) + ' → ' + this.nameOf(tx.to) + ', ' + tx.amount + ' MC) khỏi mempool');
      return tx;
    }

    /**
     * Đổi luật mạng – giống một lần nâng cấp mạng: luật mới chỉ có hiệu lực từ block kế tiếp,
     * các block cũ vẫn được kiểm tra theo luật lúc chúng được đào.
     */
    updateRules(changes, difficulty) {
      const cur = this.rules;
      const next = Object.assign({}, cur);
      const num = function (key, min, max, label) {
        if (changes[key] === undefined || changes[key] === '') return;
        const v = Number(changes[key]);
        if (!isFinite(v) || v < min || v > max) throw new Error(label + ' phải nằm trong khoảng ' + min + '–' + max + '.');
        next[key] = v;
      };
      num('initialReward', 1, 1000, 'Phần thưởng');
      num('halvingInterval', 2, 1000, 'Chu kỳ halving');
      num('maxTxPerBlock', 1, 20, 'Số giao dịch tối đa');
      num('targetBlockMs', 1000, 60000, 'Thời gian mục tiêu');
      num('adjustInterval', 1, 100, 'Chu kỳ chỉnh độ khó');
      num('minDifficulty', 1, 5, 'Độ khó tối thiểu');
      num('maxDifficulty', 1, 5, 'Độ khó tối đa');
      num('minTxToMine', 0, 20, 'Số giao dịch tối thiểu để đào');
      num('minMinerBalance', 0, 100000, 'Số dư tối thiểu của thợ đào');
      num('maxConsecutiveBlocks', 1, 1000, 'Số block liên tiếp tối đa');
      next.initialReward = round(next.initialReward);
      ['halvingInterval', 'maxTxPerBlock', 'adjustInterval', 'minDifficulty', 'maxDifficulty', 'minTxToMine', 'maxConsecutiveBlocks'].forEach(function (k) { next[k] = Math.round(next[k]); });
      next.minMinerBalance = round(next.minMinerBalance);
      if (next.minDifficulty > next.maxDifficulty) throw new Error('Độ khó tối thiểu không được lớn hơn độ khó tối đa.');
      let d = difficulty === undefined || difficulty === '' ? this.difficulty : Math.round(Number(difficulty));
      if (!isFinite(d) || d < next.minDifficulty || d > next.maxDifficulty) {
        throw new Error('Độ khó hiện tại phải nằm trong khoảng ' + next.minDifficulty + '–' + next.maxDifficulty + '.');
      }
      const changed = Object.keys(next).filter(function (k) { return next[k] !== cur[k]; });
      const LABEL = { initialReward: 'thưởng ' + next.initialReward + ' MC', halvingInterval: 'halving mỗi ' + next.halvingInterval + ' block',
        maxTxPerBlock: 'tối đa ' + next.maxTxPerBlock + ' GD/block', targetBlockMs: 'mục tiêu ' + next.targetBlockMs / 1000 + ' giây/block',
        adjustInterval: 'chỉnh độ khó mỗi ' + next.adjustInterval + ' block', minDifficulty: 'độ khó tối thiểu ' + next.minDifficulty,
        maxDifficulty: 'độ khó tối đa ' + next.maxDifficulty, minTxToMine: 'đào khi có ≥ ' + next.minTxToMine + ' giao dịch',
        minMinerBalance: 'thợ đào cần ≥ ' + next.minMinerBalance + ' MC', maxConsecutiveBlocks: 'tối đa ' + next.maxConsecutiveBlocks + ' block liên tiếp' };
      if (!changed.length && d === this.difficulty) throw new Error('Không có thay đổi nào.');
      const from = this.latest.index + 1;
      if (changed.length) {
        this.ruleHistory = this.ruleHistory.filter(function (v) { return v.from < from; });
        this.ruleHistory.push({ from: from, rules: next, time: Date.now() });
      }
      const oldD = this.difficulty;
      this.difficulty = d;
      this.reward = this.nextReward();
      this.log('Đổi luật mạng từ block #' + from + (changed.length ? ': ' + changed.map(function (k) { return LABEL[k] || k; }).join(', ') : '') + (d !== oldD ? ' · độ khó hiện tại ' + oldD + ' → ' + d : ''));
      return { from: from, changed: changed };
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
      if (w.system) throw new Error('"' + w.name + '" là ví hệ thống, không đăng nhập được.');
      if (!w.pwHash || hashPassword(w.salt, password) !== w.pwHash) throw new Error('Mật khẩu không đúng.');
      if (w.locked) throw new Error('Ví này đã bị quản trị viên khoá.');
      return w;
    }

    /** Đăng nhập bằng khoá bí mật: tính lại địa chỉ từ khoá rồi tìm ví khớp. */
    loginWithKey(privateKey) {
      const key = String(privateKey || '').trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(key)) throw new Error('Khoá bí mật phải gồm đúng 64 ký tự hex (0-9, a-f).');
      const address = addressFromKey(key);
      const w = this.wallets.find(function (x) { return x.address === address; });
      if (!w) throw new Error('Khoá bí mật không khớp với ví nào trong MiniChain.');
      if (w.locked) throw new Error('Ví này đã bị quản trị viên khoá.');
      return w;
    }

    addTransaction(from, to, amount, note, fee, extra) {
      const sender = this.wallets.find(function (w) { return w.address === from; });
      if (sender && sender.locked) throw new Error('Ví gửi đã bị quản trị viên khoá.');
      const receiver = this.wallets.find(function (w) { return w.address === to; });
      if (receiver && receiver.system && !extra) throw new Error('Không gửi trực tiếp vào ví hệ thống – hãy dùng chức năng Đổi tiền hoặc Tiết kiệm.');
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
      if (extra) Object.assign(tx, extra);
      this.pending.push(tx);
      return tx;
    }

    /** Trạng thái của một giao dịch: đang chờ, đã xác nhận (ở block nào), hoặc đã bị huỷ. */
    txState(id) {
      if (!id) return { status: 'none' };
      if (this.pending.some(function (t) { return t.id === id; })) return { status: 'pending' };
      for (const b of this.chain) {
        if (b.transactions.some(function (t) { return t.id === id; })) return { status: 'confirmed', block: b.index, confirmations: this.confirmationsOf(b.index) };
      }
      return { status: 'dropped' };
    }

    /** Bỏ một giao dịch khỏi mempool và hoàn tác các tác dụng phụ (tồn kho, hoá đơn, tiền VND/USD, khoản tiết kiệm). */
    dropPending(tx) {
      this.pending = this.pending.filter(function (t) { return t !== tx; });
      const self = this;
      this.orders.forEach(function (o) {
        if (o.txId === tx.id && !o.cancelled) {
          o.cancelled = true;
          const p = self.products.find(function (x) { return x.id === o.productId; });
          if (p) p.stock += o.qty;
        }
      });
      this.invoices.forEach(function (inv) {
        if (inv.txId === tx.id) { inv.status = 'open'; inv.txId = null; inv.paidBy = null; }
      });
      this.fxOrders.forEach(function (o) {
        if (o.txId === tx.id && o.status === 'pending') {
          o.status = 'cancelled';
          if (o.dir === 'buy') self.addFiat(o.owner, o.currency, o.fiat);   // hoàn lại tiền VND/USD
        }
      });
      this.stakes.forEach(function (st) {
        if (st.txId === tx.id) st.status = 'cancelled';
        if (st.withdrawTxId === tx.id) { st.withdrawTxId = null; st.early = false; }
      });
    }

    /** Chủ ví huỷ giao dịch đang chờ của mình. */
    cancelPending(id, by) {
      const tx = this.pending.find(function (t) { return t.id === id; });
      if (!tx) throw new Error('Giao dịch không còn trong mempool.');
      if (tx.from !== by) throw new Error('Bạn chỉ huỷ được giao dịch của chính mình.');
      this.dropPending(tx);
      return tx;
    }

    systemWallet(kind) {
      return this.wallets.find(function (w) { return w.system === kind; }) || null;
    }

    // ---------- Cửa hàng ----------
    addProduct(seller, p) {
      const w = this.walletOrThrow(seller);
      if (w.system) throw new Error('Ví hệ thống không bán hàng.');
      const name = String(p.name || '').trim();
      const price = round(p.price);
      const stock = Math.round(Number(p.stock));
      if (!name) throw new Error('Vui lòng nhập tên sản phẩm.');
      if (name.length > 40) throw new Error('Tên sản phẩm tối đa 40 ký tự.');
      if (!isFinite(price) || price <= 0 || price > 10000) throw new Error('Giá phải lớn hơn 0 và không quá 10.000 MC.');
      if (!isFinite(stock) || stock < 1 || stock > 999) throw new Error('Số lượng phải từ 1 đến 999.');
      const prod = { id: uid().slice(0, 10), seller: seller, icon: String(p.icon || '📦').slice(0, 4), name: name,
        desc: String(p.desc || '').trim().slice(0, 100), price: price, stock: stock, active: true, created: Date.now() };
      this.products.push(prod);
      return prod;
    }

    removeProduct(seller, id) {
      const p = this.products.find(function (x) { return x.id === id; });
      if (!p) throw new Error('Không tìm thấy sản phẩm.');
      if (p.seller !== seller) throw new Error('Bạn chỉ gỡ được sản phẩm của mình.');
      p.active = false;
      return p;
    }

    /** Mua hàng: tạo giao dịch người mua → người bán; người bán nhận MC khi giao dịch được đào vào block. */
    buy(buyer, productId, qty, fee) {
      const p = this.products.find(function (x) { return x.id === productId && x.active; });
      if (!p) throw new Error('Sản phẩm không còn bán.');
      qty = Math.round(Number(qty));
      if (!isFinite(qty) || qty < 1) throw new Error('Số lượng phải từ 1 trở lên.');
      if (qty > p.stock) throw new Error('Chỉ còn ' + p.stock + ' sản phẩm.');
      if (buyer === p.seller) throw new Error('Không thể mua sản phẩm của chính mình.');
      const total = round(p.price * qty);
      const orderId = 'DH-' + uid().slice(0, 6).toUpperCase();
      const tx = this.addTransaction(buyer, p.seller, total, 'Mua: ' + p.name.slice(0, 40) + ' ×' + qty, fee, { kind: 'purchase', ref: orderId });
      p.stock -= qty;
      const order = { id: orderId, txId: tx.id, productId: p.id, name: p.name, icon: p.icon, price: p.price, qty: qty, total: total, buyer: buyer, seller: p.seller, time: Date.now() };
      this.orders.push(order);
      return order;
    }

    // ---------- Hoá đơn / yêu cầu thanh toán ----------
    createInvoice(payee, amount, note, payer) {
      const w = this.walletOrThrow(payee);
      if (w.system) throw new Error('Ví hệ thống không tạo hoá đơn.');
      amount = round(amount);
      if (!isFinite(amount) || amount <= 0 || amount > 100000) throw new Error('Số tiền hoá đơn phải lớn hơn 0.');
      if (payer) {
        const pw = this.walletOrThrow(payer);
        if (pw.system || payer === payee) throw new Error('Người trả không hợp lệ.');
      }
      const inv = { id: 'HD-' + uid().slice(0, 6).toUpperCase(), payee: payee, payer: payer || null, amount: amount,
        note: String(note || '').trim().slice(0, 60), created: Date.now(), status: 'open', txId: null, paidBy: null };
      this.invoices.push(inv);
      return inv;
    }

    findInvoice(id) {
      const q = String(id || '').trim().toUpperCase();
      return this.invoices.find(function (i) { return i.id === q; }) || null;
    }

    payInvoice(payer, id, fee) {
      const inv = this.findInvoice(id);
      if (!inv) throw new Error('Không tìm thấy hoá đơn có mã này.');
      if (inv.status === 'cancelled') throw new Error('Hoá đơn đã bị huỷ.');
      if (inv.status === 'paid') throw new Error('Hoá đơn đã được thanh toán.');
      if (inv.payee === payer) throw new Error('Không thể tự trả hoá đơn của mình.');
      if (inv.payer && inv.payer !== payer) throw new Error('Hoá đơn này dành cho ví khác.');
      const tx = this.addTransaction(payer, inv.payee, inv.amount, 'Thanh toán ' + inv.id + (inv.note ? ': ' + inv.note : ''), fee, { kind: 'invoice', ref: inv.id });
      inv.status = 'paid';
      inv.txId = tx.id;
      inv.paidBy = payer;
      return inv;
    }

    cancelInvoice(payee, id) {
      const inv = this.findInvoice(id);
      if (!inv || inv.payee !== payee) throw new Error('Bạn chỉ huỷ được hoá đơn của mình.');
      if (inv.status !== 'open') throw new Error('Chỉ huỷ được hoá đơn chưa thanh toán.');
      inv.status = 'cancelled';
      return inv;
    }

    // ---------- Đổi tiền MC ↔ VND / USD ----------
    fiatOf(address) {
      return this.fiat[address] || { VND: 0, USD: 0 };
    }

    addFiat(address, currency, amount) {
      const acc = Object.assign({ VND: 0, USD: 0 }, this.fiat[address]);
      const d = FIAT[currency].digits;
      acc[currency] = Math.round((acc[currency] + amount) * Math.pow(10, d)) / Math.pow(10, d);
      this.fiat[address] = acc;
    }

    /** Giá 1 MC: quầy mua MC của bạn rẻ hơn tỷ giá, bán MC cho bạn đắt hơn tỷ giá (chênh lệch = lợi nhuận của quầy). */
    fxPrice(dir, currency) {
      const r = this.fx.rates[currency];
      return dir === 'sell' ? r * (1 - this.fx.spread) : r * (1 + this.fx.spread);
    }

    fxQuote(dir, currency, mc) {
      if (!FIAT[currency]) throw new Error('Loại tiền không hỗ trợ.');
      mc = round(mc);
      if (!isFinite(mc) || mc <= 0) throw new Error('Số MC phải lớn hơn 0.');
      const d = FIAT[currency].digits;
      const fiat = Math.round(this.fxPrice(dir, currency) * mc * Math.pow(10, d)) / Math.pow(10, d);
      return { mc: mc, fiat: fiat };
    }

    /** Bán MC lấy VND/USD: chuyển MC tới quầy; tiền VND/USD về tài khoản khi giao dịch được xác nhận. */
    sellMC(owner, currency, mc, fee) {
      const q = this.fxQuote('sell', currency, mc);
      const ex = this.systemWallet('exchange');
      const id = 'DT-' + uid().slice(0, 6).toUpperCase();
      const tx = this.addTransaction(owner, ex.address, q.mc, 'Bán ' + q.mc + ' MC lấy ' + currency, fee, { kind: 'fx', ref: id });
      const o = { id: id, owner: owner, dir: 'sell', currency: currency, mc: q.mc, fiat: q.fiat, rate: this.fxPrice('sell', currency), txId: tx.id, status: 'pending', time: Date.now() };
      this.fxOrders.push(o);
      return o;
    }

    /** Mua MC bằng VND/USD: trừ VND/USD ngay, quầy gửi MC cho bạn qua một giao dịch trên chuỗi. */
    buyMC(owner, currency, mc) {
      const w = this.walletOrThrow(owner);
      if (w.locked) throw new Error('Ví đã bị quản trị viên khoá.');
      const q = this.fxQuote('buy', currency, mc);
      if (this.fiatOf(owner)[currency] < q.fiat) throw new Error('Tài khoản ' + currency + ' không đủ (cần ' + q.fiat + ').');
      const ex = this.systemWallet('exchange');
      const id = 'DT-' + uid().slice(0, 6).toUpperCase();
      const tx = this.addTransaction(ex.address, owner, q.mc, 'Quầy đổi tiền bán ' + q.mc + ' MC (' + currency + ')', RULES.defaultFee, { kind: 'fx', ref: id });
      this.addFiat(owner, currency, -q.fiat);
      const o = { id: id, owner: owner, dir: 'buy', currency: currency, mc: q.mc, fiat: q.fiat, rate: this.fxPrice('buy', currency), txId: tx.id, status: 'pending', time: Date.now() };
      this.fxOrders.push(o);
      return o;
    }

    setFxRates(vnd, usd, spreadPercent) {
      const v = Number(vnd), u = Number(usd), sp = Number(spreadPercent);
      if (!isFinite(v) || v < 100 || v > 10000000) throw new Error('Tỷ giá VND phải từ 100 đến 10.000.000.');
      if (!isFinite(u) || u < 0.01 || u > 10000) throw new Error('Tỷ giá USD phải từ 0,01 đến 10.000.');
      if (!isFinite(sp) || sp < 0 || sp > 10) throw new Error('Chênh lệch mua–bán phải từ 0% đến 10%.');
      this.fx = { rates: { VND: Math.round(v), USD: Math.round(u * 100) / 100 }, spread: sp / 100 };
      this.log('Đổi tỷ giá: 1 MC = ' + this.fx.rates.VND + ' VND = ' + this.fx.rates.USD + ' USD, chênh lệch ' + sp + '%');
    }

    // ---------- Gửi tiết kiệm ----------
    stake(owner, amount, planIndex, fee) {
      const plan = STAKE_PLANS[Number(planIndex)];
      if (!plan) throw new Error('Gói tiết kiệm không hợp lệ.');
      amount = round(amount);
      if (!isFinite(amount) || amount < 1) throw new Error('Số MC gửi tiết kiệm tối thiểu là 1 MC.');
      const pool = this.systemWallet('staking');
      const id = 'TK-' + uid().slice(0, 6).toUpperCase();
      const tx = this.addTransaction(owner, pool.address, amount, 'Gửi tiết kiệm ' + plan.blocks + ' block (' + plan.rate * 100 + '%)', fee, { kind: 'stake', ref: id });
      const st = { id: id, owner: owner, amount: amount, blocks: plan.blocks, rate: plan.rate, txId: tx.id, status: 'open', withdrawTxId: null, early: false, time: Date.now() };
      this.stakes.push(st);
      return st;
    }

    /** Tình trạng khoản tiết kiệm: chờ xác nhận / đang gửi / đến hạn / đang rút / đã rút / đã huỷ. */
    stakeInfo(st) {
      const interest = round(st.amount * st.rate);
      if (st.status === 'cancelled') return { state: 'cancelled', interest: interest };
      const start = this.txState(st.txId);
      if (start.status === 'pending') return { state: 'pending', interest: interest };
      if (start.status !== 'confirmed') return { state: 'cancelled', interest: interest };
      const maturity = start.block + st.blocks;
      const left = Math.max(0, maturity - this.latest.index);
      if (st.withdrawTxId) {
        const w = this.txState(st.withdrawTxId);
        return { state: w.status === 'confirmed' ? 'withdrawn' : 'withdrawing', start: start.block, maturity: maturity, left: left, interest: interest };
      }
      return { state: left === 0 ? 'matured' : 'active', start: start.block, maturity: maturity, left: left, interest: interest };
    }

    /** Rút tiết kiệm: đến hạn thì nhận gốc + lãi; rút trước hạn chỉ nhận gốc. Quỹ trả MC qua một giao dịch trên chuỗi. */
    withdrawStake(owner, id) {
      const st = this.stakes.find(function (x) { return x.id === id; });
      if (!st || st.owner !== owner) throw new Error('Không tìm thấy khoản tiết kiệm của bạn.');
      const info = this.stakeInfo(st);
      if (info.state === 'pending') throw new Error('Khoản gửi chưa được xác nhận – hãy đợi đào block.');
      if (info.state !== 'active' && info.state !== 'matured') throw new Error('Khoản tiết kiệm này không rút được.');
      const early = info.state === 'active';
      const payout = round(st.amount + (early ? 0 : info.interest));
      const pool = this.systemWallet('staking');
      if (this.availableOf(pool.address) < payout + RULES.defaultFee) throw new Error('Quỹ tiết kiệm tạm thời không đủ MC để chi trả.');
      const tx = this.addTransaction(pool.address, owner, payout, (early ? 'Rút trước hạn ' : 'Tất toán ') + st.id + (early ? '' : ' (gốc + lãi)'), RULES.defaultFee, { kind: 'unstake', ref: st.id });
      st.withdrawTxId = tx.id;
      st.early = early;
      return { stake: st, payout: payout, early: early };
    }

    // ---------- Điều kiện đào block ----------
    /** Danh sách điều kiện để ví `miner` được đào block kế tiếp. */
    miningChecks(miner) {
      const R = this.rules;
      const w = this.wallets.find(function (x) { return x.address === miner; });
      const bal = w ? this.balanceOf(miner) : 0;
      let streak = 0;
      for (let i = this.chain.length - 1; i > 0 && this.chain[i].miner === miner; i--) streak++;
      const minTx = R.minTxToMine || 0, minBal = R.minMinerBalance || 0, maxRun = R.maxConsecutiveBlocks || Infinity;
      return [
        { key: 'login', ok: !!w, label: 'Đã đăng nhập ví', detail: w ? w.name : 'Chưa đăng nhập' },
        { key: 'valid', ok: this.isValid(), label: 'Chuỗi khối hợp lệ', detail: this.isValid() ? 'Mọi block đều đúng' : 'Có block bị sửa' },
        { key: 'locked', ok: !!w && !w.locked && !w.system, label: 'Ví không bị khoá', detail: w && w.locked ? 'Ví bị quản trị viên khoá' : 'Bình thường' },
        { key: 'mempool', ok: this.pending.length >= minTx, label: 'Mempool có ít nhất ' + minTx + ' giao dịch', detail: 'Hiện có ' + this.pending.length },
        { key: 'balance', ok: !!w && bal >= minBal, label: 'Số dư ví ≥ ' + minBal + ' MC (tiền đặt cọc)', detail: 'Hiện có ' + bal + ' MC' },
        { key: 'streak', ok: streak < maxRun, label: 'Không đào quá ' + maxRun + ' block liên tiếp', detail: 'Đã đào liên tiếp ' + streak + ' block' }
      ];
    }

    /**
     * Tạo block ứng viên: coinbase (thưởng + tổng phí) + tối đa maxTxPerBlock giao dịch phí cao nhất.
     * Độ khó do mạng quyết định (this.difficulty), thợ đào không tự chọn.
     */
    createCandidate(minerAddress) {
      const prev = this.latest;
      const minerWallet = this.wallets.find(function (w) { return w.address === minerAddress; });
      if (minerWallet && minerWallet.locked) throw new Error('Ví đã bị quản trị viên khoá – không thể đào.');
      const failed = this.miningChecks(minerAddress).filter(function (c) { return !c.ok; });
      if (failed.length) throw new Error('Chưa đủ điều kiện đào: ' + failed.map(function (c) { return c.label.toLowerCase() + ' (' + c.detail.toLowerCase() + ')'; }).join('; ') + '.');
      const picked = this.selectForBlock().map(function (tx) { return Object.assign({}, tx); });
      const fees = picked.reduce(function (s, tx) { return s + Number(tx.fee || 0); }, 0);
      const reward = this.rewardAt(prev.index + 1);
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
      // Quyết toán lệnh đổi tiền: bán MC thì cộng VND/USD khi giao dịch đã vào block
      const self = this;
      block.transactions.forEach(function (tx) {
        if (tx.kind !== 'fx') return;
        const o = self.fxOrders.find(function (x) { return x.txId === tx.id && x.status === 'pending'; });
        if (!o) return;
        if (o.dir === 'sell') self.addFiat(o.owner, o.currency, o.fiat);
        o.status = 'done';
      });
      return this.retarget();
    }

    /** Kiểm tra từng block: dữ liệu khớp hash, đạt độ khó, và trỏ đúng block trước. */
    validate() {
      const chain = this.chain;
      const self = this;
      const bal = {};   // số dư chạy qua từng block để phát hiện chi tiêu vượt số dư
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
          const R = self.rulesAt(i);
          rulesOk = !!cb && cb.from === SYSTEM && round(cb.amount) <= round(self.rewardAt(i) + fees) &&
            users.every(function (tx) { return tx.from !== SYSTEM || tx.mint; }) && users.length <= R.maxTxPerBlock;
        }
        // Điều kiện đào block (theo luật lúc block được đào)
        let mineOk = true;
        const mineWhy = [];
        if (i > 0) {
          const R2 = self.rulesAt(i);
          const nUser = block.transactions.length - 1;
          if (nUser < (R2.minTxToMine || 0)) { mineOk = false; mineWhy.push('block chỉ có ' + nUser + ' giao dịch (cần ≥ ' + R2.minTxToMine + ')'); }
          if ((bal[block.miner] || 0) < (R2.minMinerBalance || 0)) { mineOk = false; mineWhy.push('thợ đào chỉ có ' + (bal[block.miner] || 0) + ' MC (cần ≥ ' + R2.minMinerBalance + ')'); }
          let run = 0;
          for (let k = i; k > 0 && chain[k].miner === block.miner; k--) run++;
          if (R2.maxConsecutiveBlocks && run > R2.maxConsecutiveBlocks) { mineOk = false; mineWhy.push('thợ đào đã đào ' + run + ' block liên tiếp (tối đa ' + R2.maxConsecutiveBlocks + ')'); }
        }
        // Luật số dư: không ví nào được chi quá số MC đang có
        let overspend = null;
        block.transactions.forEach(function (tx) {
          bal[tx.to] = round((bal[tx.to] || 0) + Number(tx.amount));
          if (tx.from !== SYSTEM) {
            bal[tx.from] = round((bal[tx.from] || 0) - Number(tx.amount) - Number(tx.fee || 0));
            if (bal[tx.from] < 0 && !overspend) overspend = tx.from;
          }
        });
        const balanceOk = !overspend;
        const reasons = [];
        if (!merkleOk) reasons.push('Giao dịch đã bị thay đổi – Merkle root tính lại không khớp Merkle root trong tiêu đề block.');
        else if (!dataOk) reasons.push('Tiêu đề block đã bị thay đổi – hash tính lại không khớp hash lưu trong block.');
        if (!powOk) reasons.push('Hash không bắt đầu bằng ' + block.difficulty + ' số 0 (chưa đạt độ khó).');
        if (!linkOk) reasons.push('"Hash trước" không khớp với hash của block #' + (i - 1) + '.');
        if (!rulesOk) reasons.push('Vi phạm luật đồng thuận: coinbase vượt quá phần thưởng + phí, hoặc block quá ' + self.rulesAt(i).maxTxPerBlock + ' giao dịch.');
        if (!balanceOk) reasons.push('Vi phạm luật số dư: ví ' + self.nameOf(overspend) + ' chi nhiều hơn số MC đang có.');
        if (!mineOk) reasons.push('Vi phạm điều kiện đào block: ' + mineWhy.join('; ') + '.');
        return {
          index: i, valid: dataOk && powOk && linkOk && rulesOk && balanceOk && mineOk, mineOk: mineOk, dataOk: dataOk, merkleOk: merkleOk, powOk: powOk, linkOk: linkOk, rulesOk: rulesOk, balanceOk: balanceOk,
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
        locked: this.wallets.filter(function (w) { return w.locked; }).length,
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
    ADMIN_USER: ADMIN_USER,
    ADMIN_PASSWORD: ADMIN_PASSWORD,
    STAKE_PLANS: STAKE_PLANS,
    FIAT: FIAT,
    addressFromKey: addressFromKey
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.MiniChain;
})(typeof window !== 'undefined' ? window : globalThis);
