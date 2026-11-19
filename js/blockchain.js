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
        const before = this.pending.length;
        this.pending = this.pending.filter(function (tx) { return tx.from !== address; });
        this.log('Khoá ví "' + w.name + '"' + (before > this.pending.length ? ', huỷ ' + (before - this.pending.length) + ' giao dịch chờ' : ''));
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
      this.pending = this.pending.filter(function (t) { return t !== tx; });
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
      next.initialReward = round(next.initialReward);
      ['halvingInterval', 'maxTxPerBlock', 'adjustInterval', 'minDifficulty', 'maxDifficulty'].forEach(function (k) { next[k] = Math.round(next[k]); });
      if (next.minDifficulty > next.maxDifficulty) throw new Error('Độ khó tối thiểu không được lớn hơn độ khó tối đa.');
      let d = difficulty === undefined || difficulty === '' ? this.difficulty : Math.round(Number(difficulty));
      if (!isFinite(d) || d < next.minDifficulty || d > next.maxDifficulty) {
        throw new Error('Độ khó hiện tại phải nằm trong khoảng ' + next.minDifficulty + '–' + next.maxDifficulty + '.');
      }
      const changed = Object.keys(next).filter(function (k) { return next[k] !== cur[k]; });
      const LABEL = { initialReward: 'thưởng ' + next.initialReward + ' MC', halvingInterval: 'halving mỗi ' + next.halvingInterval + ' block',
        maxTxPerBlock: 'tối đa ' + next.maxTxPerBlock + ' GD/block', targetBlockMs: 'mục tiêu ' + next.targetBlockMs / 1000 + ' giây/block',
        adjustInterval: 'chỉnh độ khó mỗi ' + next.adjustInterval + ' block', minDifficulty: 'độ khó tối thiểu ' + next.minDifficulty,
        maxDifficulty: 'độ khó tối đa ' + next.maxDifficulty };
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

    addTransaction(from, to, amount, note, fee) {
      const sender = this.wallets.find(function (w) { return w.address === from; });
      if (sender && sender.locked) throw new Error('Ví gửi đã bị quản trị viên khoá.');
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
      const minerWallet = this.wallets.find(function (w) { return w.address === minerAddress; });
      if (minerWallet && minerWallet.locked) throw new Error('Ví đã bị quản trị viên khoá – không thể đào.');
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
        return {
          index: i, valid: dataOk && powOk && linkOk && rulesOk && balanceOk, dataOk: dataOk, merkleOk: merkleOk, powOk: powOk, linkOk: linkOk, rulesOk: rulesOk, balanceOk: balanceOk,
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
    addressFromKey: addressFromKey
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.MiniChain;
})(typeof window !== 'undefined' ? window : globalThis);
