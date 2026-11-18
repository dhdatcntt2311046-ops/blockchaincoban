/*
 * app.js – Điều khiển giao diện MiniChain.
 * Mỗi màn hình (view) có một hàm render trả về HTML và một hàm bind gắn sự kiện.
 */
(function () {
  'use strict';

  const { Blockchain, mineAsync, ZERO_HASH, SYSTEM } = window.MiniChain;
  const STORE_KEY = 'minichain.v1';

  // ---------- Trạng thái ----------
  let bc = load() || Blockchain.create();
  save();

  const ui = {
    view: 'dashboard',
    prefillFrom: '',
    tamper: false,
    query: '',
    focusBlock: null,
    mining: null,       // { block, stop, progress }
    remining: null,     // chỉ số block đang được đào lại
    difficulty: bc.difficulty,
    miner: bc.wallets[0] ? bc.wallets[0].address : ''
  };

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? Blockchain.from(JSON.parse(raw)) : null;
    } catch (e) {
      return null;
    }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(bc)); } catch (e) { /* bỏ qua */ }
  }

  // ---------- Tiện ích ----------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const short = (h, a, b) => (h ? h.slice(0, a || 10) + '…' + h.slice(-(b || 6)) : '');
  const fmtAmt = (n) => Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 4 }) + ' MC';
  const fmtNum = (n) => Number(n).toLocaleString('vi-VN');
  const fmtTime = (t) => new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
  const hue = (address) => (address === SYSTEM ? 230 : parseInt(address.slice(2, 6), 16) % 360);

  function avatar(address, big) {
    const name = bc.nameOf(address);
    const cls = 'avatar' + (big ? ' lg' : '') + (address === SYSTEM ? ' sys' : '');
    const letter = address === SYSTEM ? '⛓' : esc(name.charAt(0).toUpperCase());
    return `<span class="${cls}" style="--h:${hue(address)}">${letter}</span>`;
  }
  function who(address) {
    return `<span class="who">${avatar(address)}<span>${esc(bc.nameOf(address))}</span></span>`;
  }
  function hashHtml(hash) {
    const zeros = (hash.match(/^0*/) || [''])[0];
    return `<span class="hz">${zeros}</span>${hash.slice(zeros.length)}`;
  }

  function toast(msg, type) {
    const el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function copy(text) {
    const done = () => toast('Đã sao chép địa chỉ ví.', 'ok');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => toast(text));
    } else {
      toast(text);
    }
  }

  // ---------- Điều hướng ----------
  const VIEWS = {
    dashboard: { title: 'Tổng quan', sub: 'Tình trạng chuỗi khối, số dư và hoạt động mới nhất.', render: renderDashboard },
    wallets: { title: 'Ví', sub: 'Mỗi ví có một địa chỉ duy nhất được tạo từ hàm băm SHA-256.', render: renderWallets, bind: bindWallets },
    transactions: { title: 'Giao dịch', sub: 'Tạo giao dịch mới – giao dịch nằm trong mempool cho tới khi được đào vào block.', render: renderTransactions, bind: bindTransactions },
    mining: { title: 'Đào block', sub: 'Proof-of-Work: thử lần lượt các nonce cho tới khi hash đạt độ khó.', render: renderMining, bind: bindMining },
    explorer: { title: 'Khám phá chuỗi', sub: 'Xem từng block, cách các block liên kết với nhau và thử sửa dữ liệu.', render: renderExplorer, bind: bindExplorer },
    guide: { title: 'Hướng dẫn', sub: 'Các khái niệm blockchain cơ bản được minh hoạ trong ứng dụng.', render: renderGuide, bind: bindGuide }
  };

  function go(view, opts) {
    ui.view = view;
    Object.assign(ui, opts || {});
    $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function render() {
    const v = VIEWS[ui.view];
    $('#page-title').textContent = v.title;
    $('#page-sub').textContent = v.sub;
    $('#view').innerHTML = v.render();
    if (v.bind) v.bind();
    renderChrome();
  }

  function renderChrome() {
    const ok = bc.isValid();
    const pill = $('#chain-pill');
    pill.className = 'pill ' + (ok ? 'ok' : 'bad');
    pill.textContent = ok ? 'Chuỗi hợp lệ' : 'Chuỗi bị sửa đổi';
    const badge = $('#badge-pending');
    badge.textContent = bc.pending.length;
    badge.classList.toggle('zero', bc.pending.length === 0);
    $('#foot-reward').textContent = fmtAmt(bc.reward);
  }

  // ---------- Thành phần dùng chung ----------
  function statCard(label, value, foot, glow) {
    return `<div class="card stat" style="--glow:${glow}">
      <div class="label">${label}</div>
      <div class="value">${value}</div>
      <div class="foot">${foot}</div>
    </div>`;
  }

  function chainBanner() {
    const status = bc.validate();
    const bad = status.filter((s) => !s.valid);
    if (!bad.length) {
      return `<div class="banner ok"><div class="b-icon">✓</div>
        <div><b>Chuỗi khối hợp lệ</b><p>Tất cả ${status.length} block đều khớp hash, đạt độ khó và liên kết đúng với block trước.</p></div></div>`;
    }
    return `<div class="banner bad"><div class="b-icon">!</div>
      <div><b>Phát hiện ${bad.length} block không hợp lệ</b><p>Block ${bad.map((s) => '#' + s.index).join(', ')} đã bị sửa dữ liệu hoặc mất liên kết.</p></div>
      <button class="btn btn-sm btn-danger" data-go="explorer">Xem chi tiết</button></div>`;
  }

  function txTable(rows, opts) {
    opts = opts || {};
    if (!rows.length) return `<div class="empty">${opts.empty || 'Chưa có giao dịch.'}</div>`;
    return `<div class="table-wrap"><table>
      <thead><tr><th>Mã GD</th>${opts.block ? '<th>Block</th>' : ''}<th>Từ</th><th>Đến</th><th>Ghi chú</th><th class="amt">Số tiền</th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td class="mono muted">${r.tx.id.slice(0, 8)}</td>
        ${opts.block ? `<td><button class="link" data-block="${r.block}">#${r.block}</button></td>` : ''}
        <td>${who(r.tx.from)}</td>
        <td>${who(r.tx.to)}</td>
        <td class="muted">${esc(r.tx.note || '—')}</td>
        <td class="amt">${fmtAmt(r.tx.amount)}</td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  function confirmedTxs() {
    const rows = [];
    bc.chain.forEach((b) => b.transactions.forEach((tx) => rows.push({ tx: tx, block: b.index })));
    return rows.reverse();
  }

  function walletOptions(selected, withBalance) {
    return bc.wallets.map((w) => `<option value="${w.address}" ${w.address === selected ? 'selected' : ''}>
      ${esc(w.name)}${withBalance ? ' — ' + fmtAmt(bc.availableOf(w.address)) : ''}</option>`).join('');
  }

  // ---------- Màn hình: Tổng quan ----------
  function renderDashboard() {
    const s = bc.stats();
    const status = bc.validate();
    const last = bc.chain.slice(-5);
    const maxBal = Math.max(1, ...bc.wallets.map((w) => bc.balanceOf(w.address)));

    const strip = last.map((b, i) => {
      const st = status[b.index];
      const link = i > 0 ? `<div class="mini-link ${st.linkOk ? '' : 'bad'}">${st.linkOk ? '⟶' : '✕'}</div>` : '';
      return `${link}<div class="mini-block ${st.valid ? '' : 'bad'}" data-block="${b.index}">
        <div class="n">#${b.index} ${b.index === 0 ? '<span class="chip accent">Genesis</span>' : ''}</div>
        <div class="h">${hashHtml(short(b.hash, 12, 4))}</div>
        <div class="t">${b.transactions.length} giao dịch · nonce ${fmtNum(b.nonce)}</div>
      </div>`;
    }).join('');

    const balances = bc.wallets.map((w) => {
      const v = bc.balanceOf(w.address);
      return `<div class="bal-row">${who(w.address)}
        <div class="bal-bar"><i style="width:${Math.max(2, (v / maxBal) * 100)}%"></i></div>
        <div class="v">${fmtAmt(v)}</div></div>`;
    }).join('');

    return `
      <div class="grid stats">
        ${statCard('Số block', fmtNum(s.blocks), 'Chiều cao chuỗi hiện tại', 'rgba(124,140,255,.16)')}
        ${statCard('Giao dịch đã xác nhận', fmtNum(s.confirmed), 'Không tính phần thưởng đào', 'rgba(45,212,191,.16)')}
        ${statCard('Giao dịch đang chờ', fmtNum(s.pending), 'Nằm trong mempool', 'rgba(251,191,36,.16)')}
        ${statCard('Tổng cung', fmtAmt(s.supply), s.wallets + ' ví đang hoạt động', 'rgba(52,211,153,.16)')}
      </div>
      ${chainBanner()}
      <div class="grid two">
        <div class="card">
          <div class="card-head"><h3>Block mới nhất</h3><button class="link" data-go="explorer">Xem toàn bộ chuỗi →</button></div>
          <div class="chain-strip">${strip}</div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Số dư các ví</h3><button class="link" data-go="wallets">Quản lý ví →</button></div>
          ${balances}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Giao dịch gần đây</h3><button class="link" data-go="transactions">Tạo giao dịch →</button></div>
        ${txTable(confirmedTxs().slice(0, 6), { block: true })}
      </div>`;
  }

  // ---------- Màn hình: Ví ----------
  function renderWallets() {
    const cards = bc.wallets.map((w) => {
      const bal = bc.balanceOf(w.address);
      const out = bc.pendingOutOf(w.address);
      const txCount = bc.chain.reduce((n, b) => n + b.transactions.filter((t) => t.from === w.address || t.to === w.address).length, 0);
      return `<div class="card wallet-card">
        <div class="wallet-top">${avatar(w.address, true)}
          <div><h4>${esc(w.name)}</h4>
          <div class="addr">${short(w.address, 8, 6)} <button class="copy" data-copy="${w.address}">Sao chép</button></div></div>
        </div>
        <div class="wallet-bal">${fmtNum(bal)} <small>MC</small></div>
        <div class="wallet-meta"><span>${txCount} giao dịch</span><span>${out ? 'Đang chờ gửi: −' + fmtAmt(out) : 'Không có GD chờ'}</span></div>
        <div class="actions">
          <button class="btn btn-sm" data-send="${w.address}">Gửi tiền</button>
          <button class="btn btn-sm btn-ghost" data-mine-as="${w.address}">Đào bằng ví này</button>
        </div>
      </div>`;
    }).join('');

    return `<div class="grid wallets">
      ${cards}
      <form class="card new-wallet" id="form-wallet" autocomplete="off">
        <h3 style="margin-bottom:6px">Tạo ví mới</h3>
        <p class="muted" style="margin:0 0 14px;font-size:13px">Địa chỉ ví được sinh ngẫu nhiên từ SHA-256. Ví mới có số dư 0 MC.</p>
        <div class="field"><label for="w-name">Tên chủ ví</label><input class="input" id="w-name" maxlength="24" placeholder="VD: Minh"></div>
        <div class="form-error" id="w-error"></div>
        <button class="btn btn-block" type="submit">+ Tạo ví</button>
      </form>
    </div>`;
  }

  function bindWallets() {
    $('#form-wallet').addEventListener('submit', (e) => {
      e.preventDefault();
      try {
        const w = bc.addWallet($('#w-name').value);
        save();
        toast('Đã tạo ví "' + w.name + '".', 'ok');
        render();
      } catch (err) {
        $('#w-error').textContent = err.message;
      }
    });
  }

  // ---------- Màn hình: Giao dịch ----------
  function renderTransactions() {
    const from = ui.prefillFrom || (bc.wallets[0] && bc.wallets[0].address);
    const to = (bc.wallets.find((w) => w.address !== from) || {}).address;
    const pool = bc.pending.length
      ? bc.pending.map((tx) => `<div class="pool-item">
          <div class="flow">${who(tx.from)}<span class="arrow">→</span>${who(tx.to)}</div>
          <div class="amt">${fmtAmt(tx.amount)}</div>
          <div class="sub"><span class="mono">#${tx.id.slice(0, 8)}</span><span>${esc(tx.note || 'Không ghi chú')}</span>
            <span>${fmtTime(tx.time)}</span><button class="remove" data-cancel="${tx.id}">Huỷ</button></div>
        </div>`).join('')
      : '<div class="empty">Mempool trống. Hãy tạo giao dịch mới.</div>';

    return `<div class="grid halves">
      <form class="card" id="form-tx" autocomplete="off">
        <div class="card-head"><h3>Tạo giao dịch</h3><span class="hint">Giao dịch chỉ được xác nhận khi có block chứa nó</span></div>
        <div class="field"><label for="tx-from">Ví gửi</label><select class="select" id="tx-from">${walletOptions(from, true)}</select>
          <div class="help" id="tx-avail"></div></div>
        <div class="field"><label for="tx-to">Ví nhận</label><select class="select" id="tx-to">${walletOptions(to)}</select></div>
        <div class="field"><label for="tx-amount">Số tiền (MC)</label><input class="input" id="tx-amount" type="number" min="0" step="any" placeholder="0">
          <div class="amount-chips"><button type="button" data-amt="5">5</button><button type="button" data-amt="10">10</button><button type="button" data-amt="25">25</button><button type="button" data-amt="max">Tối đa</button></div></div>
        <div class="field"><label for="tx-note">Ghi chú</label><input class="input" id="tx-note" maxlength="60" placeholder="VD: Trả tiền ăn trưa"></div>
        <div class="form-error" id="tx-error"></div>
        <button class="btn btn-block" type="submit">Gửi vào mempool</button>
      </form>
      <div class="card">
        <div class="card-head"><h3>Mempool (${bc.pending.length})</h3>
          ${bc.pending.length ? '<button class="btn btn-sm" data-go="mining">Đào block ngay</button>' : ''}</div>
        <div class="pool">${pool}</div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Lịch sử giao dịch đã xác nhận</h3><span class="hint">${confirmedTxs().length} giao dịch</span></div>
      ${txTable(confirmedTxs(), { block: true })}
    </div>`;
  }

  function bindTransactions() {
    const fromSel = $('#tx-from');
    const showAvail = () => {
      const a = fromSel.value;
      $('#tx-avail').innerHTML = `Số dư: <b>${fmtAmt(bc.balanceOf(a))}</b> · Khả dụng: <b>${fmtAmt(bc.availableOf(a))}</b>`;
    };
    fromSel.addEventListener('change', showAvail);
    showAvail();

    $$('[data-amt]').forEach((b) => b.addEventListener('click', () => {
      $('#tx-amount').value = b.dataset.amt === 'max' ? Math.max(0, bc.availableOf(fromSel.value)) : b.dataset.amt;
    }));

    $('#form-tx').addEventListener('submit', (e) => {
      e.preventDefault();
      try {
        bc.addTransaction(fromSel.value, $('#tx-to').value, $('#tx-amount').value, $('#tx-note').value);
        save();
        ui.prefillFrom = fromSel.value;
        toast('Đã thêm giao dịch vào mempool.', 'ok');
        render();
      } catch (err) {
        $('#tx-error').textContent = err.message;
      }
    });

    $$('[data-cancel]').forEach((b) => b.addEventListener('click', () => {
      bc.pending = bc.pending.filter((tx) => tx.id !== b.dataset.cancel);
      save();
      toast('Đã huỷ giao dịch.');
      render();
    }));
  }

  // ---------- Màn hình: Đào block ----------
  function renderMining() {
    const m = ui.mining;
    const valid = bc.isValid();
    const d = ui.difficulty;
    const p = m && m.progress;
    const target = '0'.repeat(d);

    const consoleHtml = `<div class="miner-console">
      <div class="console-row"><span>Block</span><b>#${bc.latest.index + 1}</b></div>
      <div class="console-row"><span>Hash trước</span><b>${short(bc.latest.hash, 16, 8)}</b></div>
      <div class="console-row"><span>Mục tiêu</span><b><span class="hz-target">${target}</span>${'x'.repeat(Math.max(0, 12 - d))}…</b></div>
      <div class="console-row"><span>Nonce</span><b id="m-nonce">${p ? fmtNum(p.nonce) : '—'}</b></div>
      <div class="console-row"><span>Hash</span><b class="hash-big" id="m-hash">${p ? hashHtml(p.hash) : '—'}</b></div>
      <div class="console-row"><span>Tốc độ</span><b id="m-rate">${p ? fmtNum(Math.round(p.hashes / Math.max(p.elapsed, 1) * 1000)) + ' H/s' : '—'}</b></div>
      <div class="console-row"><span>Thời gian</span><b id="m-time">${p ? (p.elapsed / 1000).toFixed(2) + ' giây' : '—'}</b></div>
    </div>`;

    const pool = bc.pending.length
      ? bc.pending.map((tx) => `<div class="pool-item">
          <div class="flow">${who(tx.from)}<span class="arrow">→</span>${who(tx.to)}</div>
          <div class="amt">${fmtAmt(tx.amount)}</div></div>`).join('')
      : '<div class="empty">Không có giao dịch chờ – block mới chỉ chứa phần thưởng cho thợ đào.</div>';

    return `${valid ? '' : `<div class="banner bad"><div class="b-icon">!</div>
        <div><b>Không thể đào khi chuỗi không hợp lệ</b><p>Hãy vào "Khám phá chuỗi" để đào lại các block bị sửa, hoặc đặt lại dữ liệu.</p></div>
        <button class="btn btn-sm btn-danger" data-go="explorer">Sửa chuỗi</button></div>`}
      <div class="grid halves">
        <div class="card">
          <div class="card-head"><h3>Cấu hình</h3><span class="chip accent">Proof-of-Work</span></div>
          <div class="field"><label for="m-miner">Thợ đào nhận thưởng</label>
            <select class="select" id="m-miner" ${m ? 'disabled' : ''}>${walletOptions(ui.miner)}</select></div>
          <div class="field"><label for="m-diff">Độ khó: <b id="m-diff-label">${d}</b> số 0 ở đầu hash</label>
            <input type="range" id="m-diff" min="1" max="5" value="${d}" ${m ? 'disabled' : ''}>
            <div class="diff-scale"><span>1 · rất dễ</span><span>3</span><span>5 · khó</span></div>
            <div class="help" id="m-est">Trung bình cần khoảng <b>${fmtNum(Math.pow(16, d))}</b> lần thử.</div></div>
          <div class="kv"><span>Phần thưởng</span><b>${fmtAmt(bc.reward)}</b></div>
          <div class="kv"><span>Giao dịch sẽ đưa vào block</span><b>${bc.pending.length}</b></div>
          <div style="margin-top:14px">
            ${m ? '<button class="btn btn-block btn-danger" id="m-stop">Dừng đào</button>'
              : `<button class="btn btn-block" id="m-start" ${valid ? '' : 'disabled'}>⛏ Bắt đầu đào block #${bc.latest.index + 1}</button>`}
          </div>
        </div>
        <div class="card">
          <div class="mining-state">${m ? '<div class="spinner"></div><b>Đang tìm nonce hợp lệ…</b>' : '<b>Bảng điều khiển thợ đào</b>'}</div>
          ${consoleHtml}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Giao dịch chờ đưa vào block</h3><span class="hint">+1 giao dịch phần thưởng</span></div>
        <div class="pool">${pool}</div>
      </div>`;
  }

  function bindMining() {
    const diff = $('#m-diff');
    if (diff) {
      diff.addEventListener('input', () => {
        ui.difficulty = Number(diff.value);
        $('#m-diff-label').textContent = diff.value;
        $('#m-est').innerHTML = `Trung bình cần khoảng <b>${fmtNum(Math.pow(16, ui.difficulty))}</b> lần thử.`;
      });
      diff.addEventListener('change', render);
    }
    const minerSel = $('#m-miner');
    if (minerSel) minerSel.addEventListener('change', () => { ui.miner = minerSel.value; });

    const start = $('#m-start');
    if (start) start.addEventListener('click', startMining);
    const stop = $('#m-stop');
    if (stop) stop.addEventListener('click', () => { if (ui.mining) ui.mining.stop = true; });
  }

  function startMining() {
    if (ui.mining || !bc.isValid()) return;
    const block = bc.createCandidate(ui.miner, ui.difficulty);
    const job = { block: block, stop: false, progress: null };
    ui.mining = job;
    render();

    mineAsync(block, {
      shouldStop: () => job.stop,
      onProgress: (p) => {
        job.progress = p;
        if (ui.view !== 'mining') return;
        const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
        set('m-nonce', fmtNum(p.nonce));
        set('m-hash', hashHtml(p.hash));
        set('m-rate', fmtNum(Math.round(p.hashes / Math.max(p.elapsed, 1) * 1000)) + ' H/s');
        set('m-time', (p.elapsed / 1000).toFixed(2) + ' giây');
      }
    }).then((result) => {
      ui.mining = null;
      if (!result) {
        toast('Đã dừng đào block.');
      } else {
        try {
          bc.commitBlock(result);
          save();
          toast(`Đào thành công block #${result.index} sau ${fmtNum(result.nonce + 1)} lần thử! +${bc.reward} MC cho ${bc.nameOf(result.miner)}.`, 'ok');
          ui.focusBlock = result.index;
        } catch (err) {
          toast(err.message, 'bad');
        }
      }
      render();
    });
  }

  // ---------- Màn hình: Khám phá chuỗi ----------
  function blockMatches(b, q) {
    if (!q) return true;
    q = q.toLowerCase().trim();
    if (String(b.index) === q.replace('#', '')) return true;
    if (b.hash.includes(q) || b.previousHash.includes(q)) return true;
    return b.transactions.some((tx) => tx.id.includes(q) || tx.from.toLowerCase().includes(q) || tx.to.toLowerCase().includes(q) ||
      bc.nameOf(tx.from).toLowerCase().includes(q) || bc.nameOf(tx.to).toLowerCase().includes(q));
  }

  function renderBlock(b, st) {
    const txRows = b.transactions.map((tx, ti) => `<tr>
        <td class="mono muted">${tx.id.slice(0, 8)}</td>
        <td>${who(tx.from)}</td><td>${who(tx.to)}</td>
        <td class="muted">${esc(tx.note || '—')}</td>
        <td class="amt">${ui.tamper
          ? `<input class="tamper-input" type="number" step="any" value="${tx.amount}" data-tamper="${b.index}:${ti}">`
          : fmtAmt(tx.amount)}</td></tr>`).join('');

    const busy = ui.remining === b.index;
    return `<div class="card block-card ${st.valid ? '' : 'bad'}" id="block-${b.index}">
      <div class="block-head">
        <div class="block-num">#${b.index}</div>
        <div class="grow"><h3>${b.index === 0 ? 'Block khởi tạo (Genesis)' : 'Block #' + b.index}</h3>
          <div class="muted" style="font-size:12.5px">${fmtTime(b.timestamp)} · đào bởi ${esc(bc.nameOf(b.miner))}</div></div>
        <span class="chip ${st.valid ? 'ok' : 'bad'}">${st.valid ? '✓ Hợp lệ' : '✕ Không hợp lệ'}</span>
      </div>
      <div class="block-fields">
        <div class="bf wide"><label>Hash lưu trong block</label><div class="val">${hashHtml(b.hash)}</div></div>
        ${st.dataOk ? '' : `<div class="bf wide"><label>Hash tính lại từ dữ liệu hiện tại</label><div class="val bad">${st.recomputed}</div></div>`}
        <div class="bf wide"><label>Hash của block trước (previousHash)</label><div class="val ${st.linkOk ? '' : 'bad'}">${b.previousHash}</div></div>
        <div class="bf"><label>Nonce</label><div class="val">${fmtNum(b.nonce)}</div></div>
        <div class="bf"><label>Độ khó</label><div class="val">${b.difficulty} (${'0'.repeat(b.difficulty)}…)</div></div>
      </div>
      ${st.valid ? '' : `<ul class="reasons">${st.reasons.map((r) => `<li>${r}</li>`).join('')}</ul>
        <div class="block-actions"><button class="btn btn-sm btn-ok" data-remine="${b.index}" ${ui.remining !== null ? 'disabled' : ''}>
          ${busy ? '<span class="spinner"></span> Đang đào lại…' : '⛏ Đào lại block này'}</button></div>`}
      <div class="block-txs table-wrap"><table>
        <thead><tr><th>Mã GD</th><th>Từ</th><th>Đến</th><th>Ghi chú</th><th class="amt">Số tiền</th></tr></thead>
        <tbody>${txRows}</tbody></table></div>
    </div>`;
  }

  function renderExplorer() {
    const status = bc.validate();
    const blocks = bc.chain.filter((b) => blockMatches(b, ui.query));
    let html = '';
    blocks.forEach((b, i) => {
      if (i > 0) {
        const linked = blocks[i - 1].index === b.index - 1;
        const ok = status[b.index].linkOk;
        html += `<div class="link-arrow ${ok ? '' : 'bad'}"><div class="line"></div>
          ${linked ? (ok ? 'previousHash khớp với hash block #' + (b.index - 1) : 'Liên kết bị đứt với block #' + (b.index - 1)) : '⋯'}</div>`;
      }
      html += renderBlock(b, status[b.index]);
    });

    return `<div class="toolbar">
        <input class="input" id="ex-search" placeholder="Tìm theo số block, hash, mã giao dịch hoặc tên ví…" value="${esc(ui.query)}">
        <label class="switch ${ui.tamper ? 'on' : ''}"><input type="checkbox" id="ex-tamper" ${ui.tamper ? 'checked' : ''}><i></i>Chế độ thử sửa dữ liệu</label>
        <button class="btn btn-ghost btn-sm" id="ex-check" style="margin-left:auto">Kiểm tra toàn chuỗi</button>
      </div>
      ${ui.tamper ? `<div class="banner bad"><div class="b-icon">✎</div>
        <div><b>Đang bật chế độ thử sửa dữ liệu</b><p>Đổi số tiền của một giao dịch bất kỳ để thấy hash thay đổi và chuỗi phía sau bị phá vỡ.</p></div></div>` : ''}
      <div class="timeline">${html || '<div class="card empty">Không tìm thấy block phù hợp.</div>'}</div>`;
  }

  function bindExplorer() {
    const search = $('#ex-search');
    search.addEventListener('input', () => {
      ui.query = search.value;
      const pos = search.selectionStart;
      render();
      const s = $('#ex-search');
      s.focus();
      s.setSelectionRange(pos, pos);
    });
    $('#ex-tamper').addEventListener('change', (e) => { ui.tamper = e.target.checked; render(); });
    $('#ex-check').addEventListener('click', () => {
      const ok = bc.isValid();
      toast(ok ? 'Đã kiểm tra: toàn bộ chuỗi hợp lệ.' : 'Đã kiểm tra: chuỗi có block không hợp lệ!', ok ? 'ok' : 'bad');
    });

    $$('[data-tamper]').forEach((inp) => inp.addEventListener('change', () => {
      const [bi, ti] = inp.dataset.tamper.split(':').map(Number);
      const val = Number(inp.value);
      if (!isFinite(val)) return;
      bc.chain[bi].transactions[ti].amount = val;
      save();
      ui.focusBlock = bi;
      render();
    }));

    $$('[data-remine]').forEach((btn) => btn.addEventListener('click', () => remine(Number(btn.dataset.remine))));

    if (ui.focusBlock !== null) {
      const el = document.getElementById('block-' + ui.focusBlock);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('highlight');
      }
      ui.focusBlock = null;
    }
  }

  function remine(index) {
    if (ui.remining !== null) return;
    const block = bc.chain[index];
    block.previousHash = index === 0 ? ZERO_HASH : bc.chain[index - 1].hash;
    ui.remining = index;
    render();
    mineAsync(block, {}).then(() => {
      ui.remining = null;
      save();
      ui.focusBlock = index;
      const next = bc.validate()[index + 1];
      toast(next && !next.valid
        ? `Đã đào lại block #${index}. Block #${index + 1} giờ bị đứt liên kết – cần đào lại tiếp!`
        : `Đã đào lại block #${index}.`, next && !next.valid ? 'bad' : 'ok');
      render();
    });
  }

  // ---------- Màn hình: Hướng dẫn ----------
  function renderGuide() {
    const concepts = [
      ['Hàm băm (Hash)', 'SHA-256 biến dữ liệu bất kỳ thành chuỗi 64 ký tự. Chỉ cần đổi 1 ký tự đầu vào, hash thay đổi hoàn toàn.'],
      ['Block', 'Mỗi block chứa: số thứ tự, thời gian, danh sách giao dịch, hash của block trước, nonce và hash của chính nó.'],
      ['Proof-of-Work', 'Thợ đào thử lần lượt nonce = 0, 1, 2… cho tới khi hash bắt đầu bằng đủ số chữ 0 (độ khó). Người tìm ra được thưởng ' + bc.reward + ' MC.'],
      ['Chuỗi liên kết', 'Block sau lưu hash của block trước. Sửa một block làm hash của nó đổi, khiến mọi block phía sau mất liên kết – đó là tính bất biến.']
    ];
    return `<div class="grid halves">
        ${concepts.map((c, i) => `<div class="card concept"><div class="num">${i + 1}</div><div><h3>${c[0]}</h3><p>${c[1]}</p></div></div>`).join('')}
      </div>
      <div class="grid halves">
        <div class="card hash-demo">
          <div class="card-head"><h3>Thử hàm băm SHA-256</h3><span class="hint">Gõ để xem hash thay đổi</span></div>
          <input class="input" id="g-input" value="MiniChain" placeholder="Nhập nội dung bất kỳ">
          <div class="out" id="g-out">${sha256('MiniChain')}</div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Kịch bản demo</h3></div>
          <ol class="steps">
            <li>Vào <b>Giao dịch</b>, gửi 10 MC từ An sang Bình → giao dịch nằm trong mempool.</li>
            <li>Vào <b>Đào block</b>, chọn độ khó 3–4 và bấm đào → giao dịch được xác nhận, thợ đào nhận thưởng.</li>
            <li>Vào <b>Khám phá chuỗi</b>, bật chế độ thử sửa, đổi số tiền trong block #1 → block bị đánh dấu đỏ.</li>
            <li>Bấm <b>Đào lại block</b> → block #1 hợp lệ nhưng block #2 lại đứt liên kết. Muốn gian lận phải đào lại cả chuỗi.</li>
          </ol>
        </div>
      </div>`;
  }

  function bindGuide() {
    const inp = $('#g-input');
    inp.addEventListener('input', () => { $('#g-out').textContent = sha256(inp.value); });
  }

  // ---------- Sự kiện toàn cục ----------
  $('#nav').addEventListener('click', (e) => {
    const b = e.target.closest('.nav-item');
    if (b) go(b.dataset.view, { prefillFrom: '' });
  });

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-go],[data-block],[data-copy],[data-send],[data-mine-as]');
    if (!t) return;
    if (t.dataset.go) go(t.dataset.go);
    else if (t.dataset.block !== undefined) go('explorer', { focusBlock: Number(t.dataset.block), query: '' });
    else if (t.dataset.copy) copy(t.dataset.copy);
    else if (t.dataset.send) go('transactions', { prefillFrom: t.dataset.send });
    else if (t.dataset.mineAs) go('mining', { miner: t.dataset.mineAs });
  });

  $('#btn-reset').addEventListener('click', () => {
    if (!window.confirm('Xoá toàn bộ dữ liệu và tạo lại chuỗi mẫu?')) return;
    if (ui.mining) ui.mining.stop = true;
    bc = Blockchain.create();
    save();
    Object.assign(ui, { mining: null, remining: null, tamper: false, query: '', difficulty: bc.difficulty, miner: bc.wallets[0].address });
    toast('Đã đặt lại dữ liệu mẫu.', 'ok');
    go('dashboard');
  });

  render();
})();
