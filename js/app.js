/*
 * app.js – Điều khiển giao diện MiniChain.
 * Mỗi màn hình (view) có một hàm render trả về HTML và một hàm bind gắn sự kiện.
 */
(function () {
  'use strict';

  const { Blockchain, mineAsync, ZERO_HASH, SYSTEM, DEMO_PASSWORD, ADMIN_USER, ADMIN_PASSWORD } = window.MiniChain;
  const STORE_KEY = 'minichain.v3';          // v3: thêm cửa hàng, hoá đơn, đổi tiền, tiết kiệm, điều kiện đào
  const SESSION_KEY = 'minichain.session';   // địa chỉ ví đang đăng nhập, hoặc "admin"

  // ---------- Trạng thái ----------
  let bc = load() || Blockchain.create();
  save();

  const ui = {
    view: 'dashboard',
    me: loadSession(),  // địa chỉ ví đang đăng nhập (null = chưa đăng nhập)
    admin: readSession() === 'admin',   // đang đăng nhập bằng tài khoản quản trị viên
    tamper: false,
    query: '',
    focusBlock: null,
    mining: null,       // { block, stop, progress }
    remining: null,     // chỉ số block đang được đào lại
    payCode: ''         // mã hoá đơn mở từ đường dẫn ?pay=HD-…
  };
  (function readPayLink() {
    try {
      const code = new URLSearchParams(window.location.search).get('pay');
      if (code) {
        ui.payCode = code.toUpperCase();
        ui.view = 'invoices';
        history.replaceState(null, '', window.location.pathname + window.location.hash);
      }
    } catch (e) { /* bỏ qua */ }
  })();

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

  // ---------- Phiên đăng nhập ----------
  function readSession() {
    try { return localStorage.getItem(SESSION_KEY); } catch (e) { return null; }
  }
  function writeSession(v) {
    try {
      if (v) localStorage.setItem(SESSION_KEY, v);
      else localStorage.removeItem(SESSION_KEY);
    } catch (e) { /* bỏ qua */ }
  }
  function loadSession() {
    const a = readSession();
    return a && a !== 'admin' && bc.wallets.some((w) => w.address === a && !w.locked) ? a : null;
  }
  function me() {
    return ui.me ? bc.wallets.find((w) => w.address === ui.me) || null : null;
  }
  function login(wallet, how) {
    if (wallet.locked) throw new Error('Ví "' + wallet.name + '" đã bị quản trị viên khoá.');
    ui.me = wallet.address;
    ui.admin = false;
    writeSession(wallet.address);
    closeModal();
    toast('Đã đăng nhập ví "' + wallet.name + '"' + (how ? ' bằng ' + how : '') + '.', 'ok');
    if (ui.view === 'admin') ui.view = 'dashboard';
    render();
  }
  function loginAsAdmin() {
    if (ui.mining) ui.mining.stop = true;
    ui.me = null;
    ui.admin = true;
    writeSession('admin');
    closeModal();
    toast('Đã đăng nhập quản trị viên.', 'ok');
    go('admin');
  }
  function logout(silent) {
    if (ui.mining) ui.mining.stop = true;
    const wasAdmin = ui.admin;
    ui.me = null;
    ui.admin = false;
    writeSession(null);
    if (!silent) toast(wasAdmin ? 'Đã đăng xuất quản trị viên.' : 'Đã đăng xuất ví.');
    render();
  }

  // ---------- Tiện ích ----------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const short = (h, a, b) => (h ? h.slice(0, a || 10) + '…' + h.slice(-(b || 6)) : '');
  const fmtAmt = (n) => Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 4 }) + ' MC';
  const fmtNum = (n) => Number(n).toLocaleString('vi-VN');
  const fmtMs = (ms) => (ms < 1000 ? Math.max(1, Math.round(ms)) + ' ms' : (ms / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' giây');
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
    wallets: { title: 'Ví', sub: 'Mỗi ví có khoá bí mật riêng; địa chỉ ví được tính từ khoá bằng SHA-256.', render: renderWallets, bind: bindWallets },
    transactions: { title: 'Giao dịch', sub: 'Gửi MC từ ví đang đăng nhập – giao dịch chờ trong mempool tới khi vào block.', render: renderTransactions, bind: bindTransactions },
    mining: { title: 'Đào block', sub: 'Proof-of-Work: ví đang đăng nhập đào block và nhận phần thưởng.', render: renderMining, bind: bindMining },
    explorer: { title: 'Khám phá chuỗi', sub: 'Xem từng block, cách các block liên kết với nhau và thử sửa dữ liệu.', render: renderExplorer, bind: bindExplorer },
    guide: { title: 'Hướng dẫn', sub: 'Các khái niệm blockchain cơ bản được minh hoạ trong ứng dụng.', render: renderGuide, bind: bindGuide },
    admin: { title: 'Quản trị', sub: 'Chỉ quản trị viên: quản lý ví, luật mạng, mempool, hệ thống.', render: renderAdmin, bind: bindAdmin }
  };

  function go(view, opts) {
    ui.view = view;
    Object.assign(ui, opts || {});
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function render() {
    if (ui.me && (!me() || me().locked)) {
      // Ví đang dùng bị khoá (hoặc không còn) => tự đăng xuất
      ui.me = null;
      writeSession(null);
      toast('Ví của bạn đã bị quản trị viên khoá – đã đăng xuất.', 'bad');
    }
    if (!VIEWS[ui.view]) ui.view = 'dashboard';
    const v = VIEWS[ui.view];
    $$('.nav-item').forEach((b) => {
      const on = b.dataset.view === ui.view;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
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
    $('#foot-reward').textContent = fmtAmt(bc.nextReward());
    const fd = $('#foot-diff');
    if (fd) fd.textContent = bc.difficulty;

    const acc = $('#btn-account');
    const w = me();
    if (acc) {
      acc.classList.toggle('on', !!w);
      acc.classList.toggle('admin', ui.admin);
      acc.innerHTML = ui.admin ? '<span class="lock">🛡</span><span>Quản trị viên</span>'
        : w ? `${avatar(w.address)}<span>${esc(w.name)}</span>` : '<span class="lock">🔒</span><span>Đăng nhập ví</span>';
      acc.title = ui.admin ? 'Đang đăng nhập quản trị viên' : w ? 'Đang đăng nhập: ' + w.address : 'Đăng nhập vào ví để gửi giao dịch và đào block';
    }
    // Chức năng chỉ quản trị viên mới thấy
    const navAdmin = $('.nav-item[data-view=admin]');
    if (navAdmin) navAdmin.hidden = !ui.admin;
    const reset = $('#btn-reset');
    if (reset) reset.hidden = !ui.admin;
  }

  /** Thẻ yêu cầu đăng nhập, hiện ở các màn hình cần ví. */
  function loginGate(what) {
    return `<div class="card login-gate">
      <div class="gate-icon">🔒</div>
      <h3>Bạn chưa đăng nhập ví</h3>
      <p class="muted">Hãy đăng nhập vào ví của bạn để ${what}. Chỉ chủ ví (biết mật khẩu hoặc khoá bí mật) mới dùng được ví.</p>
      <div class="btn-row"><button class="btn" data-login="">Đăng nhập ví</button>
        <button class="btn btn-ghost" data-go="wallets">Tạo ví mới</button></div>
      ${ui.admin ? '<p class="note">Bạn đang đăng nhập quản trị viên. Quản trị viên không có ví – hãy đăng xuất rồi đăng nhập ví để dùng chức năng này.</p>'
        : `<p class="note">Ví mẫu An, Bình, Chi, Dũng có mật khẩu <b class="mono">${DEMO_PASSWORD}</b>.</p>`}
    </div>`;
  }

  /** Thẻ "ví của tôi" ở đầu màn hình Giao dịch / Đào block. */
  function meCard(w) {
    return `<div class="me-card">${avatar(w.address, true)}
      <div class="me-info"><div class="me-label">Đang đăng nhập</div><b>${esc(w.name)}</b>${w.metamask ? ' <span class="chip accent">MetaMask</span>' : ''}
        <div class="addr">${short(w.address, 10, 6)} <button class="copy" type="button" data-copy="${w.address}">Sao chép</button></div></div>
      <div class="me-bal"><div class="me-label">Khả dụng</div><b>${fmtAmt(bc.availableOf(w.address))}</b></div>
    </div>`;
  }

  // ---------- Hộp thoại (modal) ----------
  const modal = { tab: 'password', prefill: '', created: null };

  function openModal(html, bind) {
    closeModal();
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.id = 'modal';
    wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || e.target.closest('[data-close]')) closeModal();
    });
    if (bind) bind(wrap);
    const first = wrap.querySelector('input,textarea,button.btn');
    if (first) first.focus();
  }
  function closeModal() {
    const m = $('#modal');
    if (m) m.remove();
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  function openLogin(prefill, tab) {
    modal.prefill = prefill || '';
    if (tab) modal.tab = tab;
    const t = modal.tab;
    const tabBtn = (id, label) => `<button type="button" class="tab ${t === id ? 'active' : ''}" data-tab="${id}">${label}</button>`;
    let body = '';
    if (t === 'password') {
      body = `<form id="lg-form" autocomplete="off">
        <div class="field"><label for="lg-name">Tên ví hoặc địa chỉ ví</label>
          <input class="input" id="lg-name" maxlength="64" placeholder="VD: An hoặc 0x…" value="${esc(modal.prefill)}"></div>
        <div class="field"><label for="lg-pass">Mật khẩu</label>
          <input class="input" id="lg-pass" type="password" placeholder="••••••"></div>
        <div class="form-error" id="lg-error"></div>
        <button class="btn btn-block" type="submit">Đăng nhập</button>
        <p class="note">Ví mẫu: An, Bình, Chi, Dũng – mật khẩu <b class="mono">${DEMO_PASSWORD}</b>.</p>
      </form>`;
    } else if (t === 'key') {
      body = `<form id="lg-form" autocomplete="off">
        <div class="field"><label for="lg-key">Khoá bí mật (64 ký tự hex)</label>
          <textarea class="input textarea mono" id="lg-key" rows="3" placeholder="Dán khoá bí mật được cấp khi tạo ví"></textarea>
          <div class="help">MiniChain tính lại địa chỉ ví từ khoá bí mật rồi tìm ví khớp – khoá không bị lưu lại.</div></div>
        <div class="form-error" id="lg-error"></div>
        <button class="btn btn-block" type="submit">Đăng nhập bằng khoá bí mật</button>
      </form>`;
    } else if (t === 'admin') {
      body = `<form id="lg-form" autocomplete="off">
        <div class="field"><label for="lg-admin-user">Tên đăng nhập quản trị</label>
          <input class="input" id="lg-admin-user" maxlength="32" placeholder="admin"></div>
        <div class="field"><label for="lg-admin-pass">Mật khẩu</label>
          <input class="input" id="lg-admin-pass" type="password" placeholder="••••••"></div>
        <div class="form-error" id="lg-error"></div>
        <button class="btn btn-block" type="submit">🛡 Đăng nhập quản trị</button>
        <p class="note">Tài khoản mặc định: <b class="mono">${ADMIN_USER}</b> / <b class="mono">${ADMIN_PASSWORD}</b> – nên đổi mật khẩu trong trang Quản trị.</p>
      </form>`;
    } else {
      body = `<div>
        <p class="muted" style="margin-top:0">MetaMask sẽ yêu cầu bạn <b>ký một thông điệp đăng nhập</b> để chứng minh bạn là chủ địa chỉ. Ký thông điệp không tốn phí và không gửi tiền.</p>
        <p class="muted">Nếu địa chỉ MetaMask chưa có trong MiniChain, ví sẽ được tự động thêm vào (số dư 0 MC).</p>
        <div class="form-error" id="lg-error"></div>
        <button class="btn btn-block" id="lg-mm" type="button">🦊 Đăng nhập bằng MetaMask</button>
      </div>`;
    }
    openModal(`<div class="modal-head"><h3>${t === 'admin' ? 'Đăng nhập quản trị' : 'Đăng nhập ví'}</h3><button class="icon-btn" data-close aria-label="Đóng">✕</button></div>
      <div class="tabs four">${tabBtn('password', 'Mật khẩu')}${tabBtn('key', 'Khoá bí mật')}${tabBtn('metamask', 'MetaMask')}${tabBtn('admin', 'Quản trị')}</div>
      ${body}
      <p class="modal-foot">Chưa có ví? <button class="link" type="button" id="lg-new">Tạo ví mới</button></p>`, (root) => {
      root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
        const nameEl = root.querySelector('#lg-name');
        openLogin(nameEl ? nameEl.value : modal.prefill, b.dataset.tab);
      }));
      root.querySelector('#lg-new').addEventListener('click', () => { closeModal(); go('wallets'); setTimeout(() => { const n = $('#w-name'); if (n) n.focus(); }, 50); });
      const err = (m) => { root.querySelector('#lg-error').textContent = m; };
      const form = root.querySelector('#lg-form');
      if (form) form.addEventListener('submit', (e) => {
        e.preventDefault();
        try {
          if (t === 'password') login(bc.loginWithPassword(root.querySelector('#lg-name').value, root.querySelector('#lg-pass').value), 'mật khẩu');
          else if (t === 'admin') { bc.loginAdmin(root.querySelector('#lg-admin-user').value, root.querySelector('#lg-admin-pass').value); loginAsAdmin(); }
          else login(bc.loginWithKey(root.querySelector('#lg-key').value), 'khoá bí mật');
        } catch (ex) {
          err(ex.message);
        }
      });
      const mmBtn = root.querySelector('#lg-mm');
      if (mmBtn) mmBtn.addEventListener('click', async () => {
        if (!window.MetaMaskUI) return err('Không tải được mô-đun MetaMask.');
        mmBtn.disabled = true;
        mmBtn.innerHTML = '<span class="spinner"></span> Đang chờ MetaMask…';
        try {
          const w = await window.MetaMaskUI.login();
          login(w, 'MetaMask');
        } catch (ex) {
          if (!$('#lg-mm')) return;
          err(ex.message);
          mmBtn.disabled = false;
          mmBtn.textContent = '🦊 Đăng nhập bằng MetaMask';
        }
      });
    });
  }

  function openAccount() {
    if (ui.admin) {
      return openModal(`<div class="modal-head"><h3>🛡 Quản trị viên</h3><button class="icon-btn" data-close aria-label="Đóng">✕</button></div>
        <div class="kv"><span>Tên đăng nhập</span><b class="mono">${esc(bc.admin.username)}</b></div>
        <div class="kv"><span>Số ví đang bị khoá</span><b>${bc.stats().locked}</b></div>
        <div class="kv"><span>Giao dịch trong mempool</span><b>${bc.pending.length}</b></div>
        <div class="btn-row" style="margin-top:16px">
          <button class="btn" type="button" data-close data-go="admin">Mở trang Quản trị</button>
          <button class="btn btn-danger" type="button" id="acc-logout">Đăng xuất</button>
        </div>`, (root) => {
        root.querySelector('#acc-logout').addEventListener('click', () => { closeModal(); logout(); });
      });
    }
    const w = me();
    if (!w) return openLogin();
    openModal(`<div class="modal-head"><h3>Ví của tôi</h3><button class="icon-btn" data-close aria-label="Đóng">✕</button></div>
      <div class="acc-top">${avatar(w.address, true)}<div><b>${esc(w.name)}</b>${w.metamask ? ' <span class="chip accent">MetaMask</span>' : ''}
        <div class="addr mono">${esc(w.address)}</div></div></div>
      <div class="kv"><span>Số dư</span><b>${fmtAmt(bc.balanceOf(w.address))}</b></div>
      <div class="kv"><span>Khả dụng (trừ GD chờ)</span><b>${fmtAmt(bc.availableOf(w.address))}</b></div>
      <div class="kv"><span>Cách xác thực</span><b>${w.metamask ? 'Chữ ký MetaMask' : 'Mật khẩu / khoá bí mật'}</b></div>
      <div class="btn-row" style="margin-top:16px">
        <button class="btn" type="button" data-close data-go="transactions">Gửi MC</button>
        <button class="btn btn-ghost" type="button" data-close data-go="mining">Đào block</button>
        <button class="btn btn-ghost" type="button" data-copy="${w.address}">Sao chép địa chỉ</button>
        <button class="btn btn-danger" type="button" id="acc-logout">Đăng xuất</button>
      </div>`, (root) => {
      root.querySelector('#acc-logout').addEventListener('click', () => { closeModal(); logout(); });
    });
  }

  /** Hiện khoá bí mật của ví vừa tạo – chỉ hiện đúng một lần. */
  function openNewKey(made) {
    openModal(`<div class="modal-head"><h3>Đã tạo ví "${esc(made.wallet.name)}"</h3></div>
      <div class="banner warn"><div class="b-icon">!</div><div><b>Lưu lại khoá bí mật ngay bây giờ</b>
        <p>Khoá chỉ hiện <b>một lần</b>. Ai có khoá này có thể đăng nhập ví mà không cần mật khẩu. MiniChain không lưu khoá.</p></div></div>
      <div class="field"><label>Địa chỉ ví</label><div class="mm-addr">${esc(made.wallet.address)}</div></div>
      <div class="field"><label>Khoá bí mật</label><div class="mm-addr key" id="nk-key">${esc(made.privateKey)}</div></div>
      <div class="btn-row">
        <button class="btn btn-ghost" type="button" id="nk-copy">Sao chép khoá</button>
        <button class="btn" type="button" id="nk-ok">Tôi đã lưu khoá – vào ví</button>
      </div>`, (root) => {
      root.querySelector('#nk-copy').addEventListener('click', () => {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(made.privateKey).then(() => toast('Đã sao chép khoá bí mật.', 'ok'));
      });
      root.querySelector('#nk-ok').addEventListener('click', () => login(made.wallet));
    });
    // Bấm ra ngoài vẫn đăng nhập để không mất ví vừa tạo
    const m = $('#modal');
    m.addEventListener('click', (e) => { if (e.target === m && !ui.me) login(made.wallet); }, true);
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
      <thead><tr><th>Mã GD</th>${opts.block ? '<th>Block</th><th>Xác nhận</th>' : ''}<th>Từ</th><th>Đến</th><th>Ghi chú</th><th class="amt">Phí</th><th class="amt">Số tiền</th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td class="mono muted">${r.tx.id.slice(0, 8)}</td>
        ${opts.block ? `<td><button class="link" data-block="${r.block}">#${r.block}</button></td><td>${confChip(bc.confirmationsOf(r.block))}</td>` : ''}
        <td>${who(r.tx.from)}</td>
        <td>${who(r.tx.to)}</td>
        <td class="muted">${kindChip(r.tx)}${esc(r.tx.note || '—')}${r.tx.signature ? ' <span class="chip ok" title="Đã ký bằng MetaMask">✍ Đã ký</span>' : ''}</td>
        <td class="amt muted">${r.tx.from === SYSTEM ? '—' : fmtAmt(r.tx.fee || 0)}</td>
        <td class="amt">${fmtAmt(r.tx.amount)}</td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  /** Nhãn loại giao dịch dịch vụ (mua hàng, hoá đơn, đổi tiền, tiết kiệm). */
  const KINDS = { purchase: ['🛒', 'Mua hàng'], invoice: ['🧾', 'Hoá đơn'], fx: ['💱', 'Đổi tiền'], stake: ['🏦', 'Gửi tiết kiệm'], unstake: ['🏦', 'Rút tiết kiệm'] };
  function kindChip(tx) {
    const k = KINDS[tx.kind];
    return k ? `<span class="chip kind" title="${k[1]}${tx.ref ? ' · ' + tx.ref : ''}">${k[0]} ${k[1]}</span> ` : '';
  }

  /** Số xác nhận: ≥ 6 coi như chắc chắn (giống quy ước của Bitcoin). */
  function confChip(n) {
    return `<span class="chip ${n >= 6 ? 'ok' : n >= 2 ? 'accent' : 'warn'}" title="Số block đã xây trên block chứa giao dịch">${n}${n >= 6 ? '+ ✓' : ''}</span>`;
  }

  function confirmedTxs() {
    const rows = [];
    bc.chain.forEach((b) => b.transactions.forEach((tx) => rows.push({ tx: tx, block: b.index })));
    return rows.reverse();
  }

  /** Danh sách ví nhận (không gồm ví của chính mình). */
  function recipientOptions(exclude) {
    return bc.wallets.filter((w) => w.address !== exclude && !w.system).map((w) => `<option value="${w.address}">${esc(w.name)} · ${short(w.address, 6, 4)}</option>`).join('');
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
          <div><h4>${esc(w.name)}${w.metamask ? ' <span class="chip accent">MetaMask</span>' : ''}</h4>
          <div class="addr">${short(w.address, 8, 6)} <button class="copy" data-copy="${w.address}">Sao chép</button></div></div>
        </div>
        <div class="wallet-bal">${fmtNum(bal)} <small>MC</small></div>
        <div class="wallet-meta"><span>${txCount} giao dịch</span><span>${out ? 'Đang chờ gửi: −' + fmtAmt(out) : 'Không có GD chờ'}</span></div>
        <div class="actions">
          ${w.system ? `<span class="chip accent">⚙ Ví hệ thống · ${w.system === 'exchange' ? 'đổi tiền' : 'tiết kiệm'}</span>`
            : w.locked ? '<span class="chip bad">🔒 Bị khoá bởi quản trị viên</span>' : w.address === ui.me
            ? '<span class="chip ok">● Đang đăng nhập</span><button class="btn btn-sm btn-ghost" data-logout>Đăng xuất</button>'
            : `<button class="btn btn-sm btn-ghost" data-login="${esc(w.name)}" ${w.metamask ? 'data-login-tab="metamask"' : ''}>🔑 Đăng nhập</button>`}
        </div>
      </div>`;
    }).join('');

    return `<div class="grid wallets">
      ${cards}
      <form class="card new-wallet" id="form-wallet" autocomplete="off">
        <h3 style="margin-bottom:6px">Tạo ví mới</h3>
        <p class="muted" style="margin:0 0 14px;font-size:13px">MiniChain sinh khoá bí mật ngẫu nhiên, địa chỉ ví = SHA-256(khoá). Ví mới có số dư 0 MC.</p>
        <div class="field"><label for="w-name">Tên chủ ví</label><input class="input" id="w-name" maxlength="24" placeholder="VD: Minh"></div>
        <div class="field"><label for="w-pass">Mật khẩu (ít nhất 6 ký tự)</label><input class="input" id="w-pass" type="password" autocomplete="new-password"></div>
        <div class="field"><label for="w-pass2">Nhập lại mật khẩu</label><input class="input" id="w-pass2" type="password" autocomplete="new-password"></div>
        <div class="form-error" id="w-error"></div>
        <button class="btn btn-block" type="submit">+ Tạo ví</button>
      </form>
    </div>`;
  }

  function bindWallets() {
    $('#form-wallet').addEventListener('submit', (e) => {
      e.preventDefault();
      try {
        const made = bc.addWallet($('#w-name').value, $('#w-pass').value, $('#w-pass2').value);
        save();
        render();
        openNewKey(made);
      } catch (err) {
        $('#w-error').textContent = err.message;
      }
    });
  }

  // ---------- Màn hình: Giao dịch ----------
  function renderTransactions() {
    const w = me();
    const pool = bc.pending.length
      ? bc.pending.map((tx) => `<div class="pool-item">
          <div class="flow">${who(tx.from)}<span class="arrow">→</span>${who(tx.to)}</div>
          <div class="amt">${fmtAmt(tx.amount)}<small class="fee">phí ${fmtAmt(tx.fee || 0)}</small></div>
          <div class="sub"><span class="mono">#${tx.id.slice(0, 8)}</span><span>${kindChip(tx)}${esc(tx.note || 'Không ghi chú')}</span>${tx.signature ? '<span class="chip ok">✍ Đã ký bằng MetaMask</span>' : ''}
            <span>${fmtTime(tx.time)}</span>${tx.from === ui.me ? `<button class="remove" data-cancel="${tx.id}">Huỷ</button>` : ''}</div>
        </div>`).join('')
      : '<div class="empty">Mempool trống. Hãy tạo giao dịch mới.</div>';

    const form = !w ? loginGate('gửi MC') : `<form class="card" id="form-tx" autocomplete="off">
        <div class="card-head"><h3>Tạo giao dịch</h3><span class="hint">Giao dịch chỉ được xác nhận khi có block chứa nó</span></div>
        <div class="field"><label>Ví gửi (ví của bạn)</label>${meCard(w)}</div>
        <div class="field"><label for="tx-to">Ví nhận</label><select class="select" id="tx-to">${recipientOptions(w.address)}</select>
          <div class="help">Hoặc dán địa chỉ ví nhận: <input class="input input-sm mono" id="tx-to-addr" placeholder="0x…" maxlength="42"></div></div>
        <div class="field"><label for="tx-amount">Số tiền (MC)</label><input class="input" id="tx-amount" type="number" min="0" step="any" placeholder="0">
          <div class="amount-chips"><button type="button" data-amt="5">5</button><button type="button" data-amt="10">10</button><button type="button" data-amt="25">25</button><button type="button" data-amt="max">Tối đa</button></div></div>
        <div class="field"><label for="tx-fee">Phí giao dịch (MC) – trả cho thợ đào</label>
          <input class="input" id="tx-fee" type="number" min="0" max="10" step="any" value="${bc.rules.defaultFee}">
          <div class="amount-chips fee-chips"><button type="button" data-fee="0.01">Thấp · 0,01</button><button type="button" data-fee="0.1">Thường · 0,1</button><button type="button" data-fee="0.5">Nhanh · 0,5</button></div>
          <div class="help">Mỗi block chỉ chứa tối đa ${bc.rules.maxTxPerBlock} giao dịch; thợ đào ưu tiên phí cao. Tổng trừ khỏi ví: <b id="tx-total">—</b></div></div>
        <div class="field"><label for="tx-note">Ghi chú</label><input class="input" id="tx-note" maxlength="60" placeholder="VD: Trả tiền ăn trưa"></div>
        <div class="form-error" id="tx-error"></div>
        <button class="btn btn-block" type="submit">${w.metamask ? 'Ký bằng MetaMask & gửi' : 'Gửi vào mempool'}</button>
      </form>`;

    return `<div class="grid halves">
      ${form}
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
    $$('[data-cancel]').forEach((b) => b.addEventListener('click', () => {
      if (ui.mining && ui.mining.block.transactions.some((t) => t.id === b.dataset.cancel)) {
        toast('Giao dịch đang được đào vào block – không thể huỷ.', 'bad');
        return;
      }
      try {
        const tx = bc.cancelPending(b.dataset.cancel, ui.me);
        save();
        toast(tx.kind ? 'Đã huỷ giao dịch và hoàn tác ' + (KINDS[tx.kind] ? KINDS[tx.kind][1].toLowerCase() : 'dịch vụ') + ' ' + (tx.ref || '') + '.' : 'Đã huỷ giao dịch.');
      } catch (err) { toast(err.message, 'bad'); }
      render();
    }));

    const form = $('#form-tx');
    if (!form) return;
    const sender = ui.me;

    const feeOf = () => { const f = Number($('#tx-fee').value); return isFinite(f) && f >= 0 ? f : 0; };
    const showTotal = () => {
      const a = Number($('#tx-amount').value) || 0;
      $('#tx-total').textContent = fmtAmt(a + feeOf());
    };
    $$('[data-amt]').forEach((b) => b.addEventListener('click', () => {
      $('#tx-amount').value = b.dataset.amt === 'max' ? Math.max(0, Math.floor((bc.availableOf(sender) - feeOf()) * 1e4) / 1e4) : b.dataset.amt;
      showTotal();
    }));
    $$('[data-fee]').forEach((b) => b.addEventListener('click', () => { $('#tx-fee').value = b.dataset.fee; showTotal(); }));
    $('#tx-amount').addEventListener('input', showTotal);
    $('#tx-fee').addEventListener('input', showTotal);
    showTotal();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#form-tx button[type=submit]');
      const chain = bc;
      let tx = null;
      try {
        if (!me() || ui.me !== sender) throw new Error('Phiên đăng nhập đã thay đổi – hãy thử lại.');
        const typed = $('#tx-to-addr').value.trim().toLowerCase();
        let to = $('#tx-to').value;
        if (typed) {
          const target = bc.wallets.find((x) => x.address.toLowerCase() === typed);
          if (!target) throw new Error('Không tìm thấy ví có địa chỉ này trong MiniChain.');
          to = target.address;
        }
        if (!to) throw new Error('Chưa có ví nhận – hãy tạo thêm ví.');
        tx = chain.addTransaction(sender, to, $('#tx-amount').value, $('#tx-note').value, $('#tx-fee').value);
        const fromWallet = chain.wallets.find((w) => w.address === tx.from);
        if (fromWallet && fromWallet.metamask) {
          // Ví MetaMask: rút giao dịch khỏi mempool cho tới khi người dùng ký xong
          chain.pending = chain.pending.filter((t) => t !== tx);
          if (!window.MetaMaskUI) throw new Error('Không tải được mô-đun MetaMask.');
          $('#tx-error').textContent = '';
          btn.disabled = true;
          btn.textContent = 'Đang chờ ký trong MetaMask…';
          const signed = await window.MetaMaskUI.signTransaction(tx);
          if (chain !== bc) throw new Error('Dữ liệu đã được đặt lại trong lúc ký.');
          if (tx.amount + tx.fee > chain.availableOf(tx.from)) throw new Error('Số dư khả dụng không còn đủ.');
          tx.signature = signed.signature;
          tx.signedMessage = signed.message;
          chain.pending.push(tx);
        }
        save();
        toast(tx.signature ? 'Đã ký bằng MetaMask và thêm giao dịch vào mempool.' : 'Đã thêm giao dịch vào mempool.', 'ok');
        render();
      } catch (err) {
        if (tx) chain.pending = chain.pending.filter((t) => t !== tx);
        btn.disabled = false;
        btn.textContent = 'Gửi vào mempool';
        const errEl = $('#tx-error');
        if (errEl) errEl.textContent = err.message;
      }
    });
  }

  // ---------- Màn hình: Đào block ----------
  function renderMining() {
    const m = ui.mining;
    const valid = bc.isValid();
    const w = me();
    const R = bc.rules;
    const d = m ? m.block.difficulty : bc.difficulty;
    const p = m && m.progress;
    const target = '0'.repeat(d);
    const expected = Math.pow(16, d);

    // Block ứng viên: đang đào thì dùng block thật, chưa đào thì xem trước
    const checks = bc.miningChecks(w ? w.address : null);
    const canMine = checks.every((c) => c.ok);
    let cand = m ? m.block : null;
    if (!cand && w && canMine) { try { cand = bc.createCandidate(w.address); } catch (e) { cand = null; } }
    const picked = bc.selectForBlock();
    const pickedIds = new Set((m ? m.block.transactions : picked).map((t) => t.id));
    const fees = picked.reduce((s, t) => s + Number(t.fee || 0), 0);
    const reward = bc.nextReward();
    const cb = cand ? cand.transactions[0] : null;

    const row = (label, html, id) => `<div class="console-row"><span>${label}</span><b${id ? ` id="${id}"` : ''}>${html}</b></div>`;
    const pct = p ? Math.min(100, p.hashes / expected * 100) : 0;
    const consoleHtml = `<div class="miner-console">
      <div class="console-title">Tiêu đề block #${bc.latest.index + 1}</div>
      ${row('Hash trước', short(bc.latest.hash, 16, 8))}
      ${row('Merkle root', cand ? short(cand.merkleRoot, 16, 8) : '—')}
      ${row('Thời gian', cand ? fmtTime(cand.timestamp) : '—')}
      ${row('Độ khó', `${d} · mục tiêu <span class="hz-target">${target}</span>${'x'.repeat(Math.max(0, 12 - d))}…`)}
      ${row('Nonce', p ? fmtNum(p.nonce) : '—', 'm-nonce')}
      ${row('Hash', p ? hashHtml(p.hash) : '—', 'm-hash')}
      <div class="console-title">Hiệu suất</div>
      ${row('Tốc độ băm', p ? fmtNum(Math.round(p.hashes / Math.max(p.elapsed, 1) * 1000)) + ' H/s' : '—', 'm-rate')}
      ${row('Thời gian đào', p ? (p.elapsed / 1000).toFixed(2) + ' giây' : '—', 'm-time')}
      ${row('Số lần thử / kỳ vọng', `<span id="m-tries">${p ? fmtNum(p.hashes) : 0}</span> / ~${fmtNum(expected)}`)}
      <div class="progress"><i id="m-bar" style="width:${pct}%"></i></div>
      <div class="help" style="margin-top:6px">Mỗi lần thử có xác suất 1/${fmtNum(expected)} trúng. Có thể may mắn tìm ra sớm, hoặc phải thử nhiều hơn kỳ vọng.</div>
      <div class="hash-log" id="m-log">${(m && m.log || []).map((h) => `<div>${hashHtml(h)}</div>`).join('')}</div>
    </div>`;

    const sorted = bc.sortedPending();
    const pool = sorted.length
      ? `<div class="table-wrap"><table>
          <thead><tr><th>#</th><th>Từ</th><th>Đến</th><th class="amt">Số tiền</th><th class="amt">Phí</th><th>Trạng thái</th></tr></thead>
          <tbody>${sorted.map((tx, i) => `<tr>
            <td class="muted">${i + 1}</td><td>${who(tx.from)}</td><td>${who(tx.to)}</td>
            <td class="amt">${fmtAmt(tx.amount)}</td><td class="amt">${fmtAmt(tx.fee || 0)}</td>
            <td>${pickedIds.has(tx.id) ? '<span class="chip ok">Vào block này</span>' : '<span class="chip warn">Chờ block sau</span>'}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="empty">${R.minTxToMine > 0 ? 'Mempool trống – cần ít nhất ' + R.minTxToMine + ' giao dịch chờ thì mới đào được block.' : 'Mempool trống – block mới chỉ chứa giao dịch coinbase (phần thưởng).'}</div>`;

    const history = bc.chain.slice(1).reverse().slice(0, 8);
    const historyHtml = history.length
      ? `<div class="table-wrap"><table>
          <thead><tr><th>Block</th><th>Thợ đào</th><th>Độ khó</th><th class="amt">Lần thử</th><th class="amt">Thời gian đào</th><th class="amt">Thưởng + phí</th></tr></thead>
          <tbody>${history.map((b) => {
            const c = b.transactions[0] || {};
            return `<tr><td><button class="link" data-block="${b.index}">#${b.index}</button></td><td>${who(b.miner)}</td>
              <td>${b.difficulty}</td><td class="amt">${b.hashes ? fmtNum(b.hashes) : fmtNum(b.nonce + 1)}</td>
              <td class="amt">${b.minedIn !== undefined && b.index > 1 ? fmtMs(b.minedIn) : '—'}</td>
              <td class="amt">${c.reward !== undefined ? fmtAmt(c.reward) + (c.fees ? ' + ' + fmtAmt(c.fees) : '') : fmtAmt(c.amount || 0)}</td></tr>`;
          }).join('')}</tbody></table></div>`
      : '<div class="empty">Chưa có block nào được đào.</div>';

    const minerHtml = w ? meCard(w)
      : `<div class="me-card empty-me"><span>🔒 Chưa đăng nhập ví</span><button class="btn btn-sm" data-login="">Đăng nhập</button></div>`;

    return `${valid ? '' : `<div class="banner bad"><div class="b-icon">!</div>
        <div><b>Không thể đào khi chuỗi không hợp lệ</b><p>Các nút trong mạng sẽ từ chối block nối vào một chuỗi sai. Hãy vào "Khám phá chuỗi" để đào lại các block bị sửa, hoặc đặt lại dữ liệu.</p></div>
        <button class="btn btn-sm btn-danger" data-go="explorer">Sửa chuỗi</button></div>`}
      <div class="card" id="m-checks">
        <div class="card-head"><h3>Điều kiện đào block</h3>
          <span class="chip ${canMine ? 'ok' : 'warn'}">${checks.filter((c) => c.ok).length}/${checks.length} đạt</span></div>
        <div class="checklist">${checks.map((c) => `<div class="check ${c.ok ? 'ok' : 'bad'}" data-check="${c.key}">
          <span class="ck">${c.ok ? '✓' : '✕'}</span><div><b>${esc(c.label)}</b><small>${esc(c.detail)}</small></div></div>`).join('')}</div>
        <p class="note">Mạng chỉ chấp nhận block thoả các điều kiện: block có ít nhất ${R.minTxToMine} giao dịch của người dùng, thợ đào có số dư ≥ ${fmtAmt(R.minMinerBalance)} trước block đó (tiền đặt cọc, chống tạo ví rác để đào), và một ví không đào quá ${R.maxConsecutiveBlocks} block liên tiếp (chống độc chiếm). Vi phạm thì block bị đánh dấu không hợp lệ.</p>
      </div>
      <div class="grid halves">
        <div class="card">
          <div class="card-head"><h3>Thông số mạng</h3><span class="chip accent">Proof-of-Work</span></div>
          <div class="field"><label>Thợ đào (ví đang đăng nhập)</label>${minerHtml}</div>
          <div class="kv"><span>Độ khó mạng</span><b>${d} số 0 ở đầu hash</b></div>
          <div class="kv"><span>Điều chỉnh độ khó</span><b>sau ${bc.blocksToRetarget()} block nữa</b></div>
          <div class="kv"><span>Thời gian mục tiêu</span><b>~${R.targetBlockMs / 1000} giây / block</b></div>
          <div class="kv"><span>Phần thưởng block</span><b>${fmtAmt(reward)}</b></div>
          <div class="kv"><span>Halving (thưởng giảm ½)</span><b>sau ${bc.blocksToHalving()} block nữa</b></div>
          <div class="kv"><span>Phí giao dịch thu được</span><b>${fmtAmt(m && cb ? cb.fees : fees)}</b></div>
          <div class="kv total"><span>Tổng nhận nếu đào được</span><b>${fmtAmt(m && cb ? cb.amount : reward + fees)}</b></div>
          <div class="kv"><span>Giao dịch đưa vào block</span><b>${m ? m.block.transactions.length - 1 : picked.length} / tối đa ${R.maxTxPerBlock}</b></div>
          <div style="margin-top:14px">
            ${m ? '<button class="btn btn-block btn-danger" id="m-stop">Dừng đào</button>'
              : `<button class="btn btn-block" id="m-start" ${canMine ? '' : 'disabled'}>⛏ ${!w ? 'Đăng nhập ví để đào' : canMine ? 'Bắt đầu đào block #' + (bc.latest.index + 1) : 'Chưa đủ điều kiện đào'}</button>`}
          </div>
          <p class="note">Độ khó do mạng quyết định, không do thợ đào tự chọn: cứ ${R.adjustInterval} block, nếu thời gian đào trung bình nhanh hơn ${fmtMs(R.targetBlockMs / 2)} thì độ khó tăng, chậm hơn ${fmtMs(R.targetBlockMs * 2)} thì giảm (trong khoảng ${R.minDifficulty}–${R.maxDifficulty}).</p>
        </div>
        <div class="card">
          <div class="mining-state">${m ? '<div class="spinner"></div><b>Đang tìm nonce hợp lệ…</b>' : '<b>Bảng điều khiển thợ đào</b>'}</div>
          ${consoleHtml}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Mempool – xếp theo phí</h3><span class="hint">Thợ đào chọn tối đa ${R.maxTxPerBlock} giao dịch trả phí cao nhất</span></div>
        ${pool}
      </div>
      <div class="card">
        <div class="card-head"><h3>Lịch sử đào gần đây</h3><span class="hint">Thời gian đào giúp mạng điều chỉnh độ khó</span></div>
        ${historyHtml}
      </div>`;
  }

  function bindMining() {
    const start = $('#m-start');
    if (start) start.addEventListener('click', startMining);
    const stop = $('#m-stop');
    if (stop) stop.addEventListener('click', () => { if (ui.mining) ui.mining.stop = true; });
  }

  function startMining() {
    if (ui.mining || !bc.isValid()) return;
    if (!me()) { openLogin(); return; }
    let block;
    try { block = bc.createCandidate(ui.me); } catch (err) { toast(err.message, 'bad'); render(); return; }
    const job = { block: block, stop: false, progress: null, log: [] };
    ui.mining = job;
    render();

    const expected = Math.pow(16, block.difficulty);
    mineAsync(block, {
      shouldStop: () => job.stop,
      onProgress: (p) => {
        job.progress = p;
        job.log.unshift(p.hash);
        job.log = job.log.slice(0, 6);
        if (ui.view !== 'mining') return;
        const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
        set('m-nonce', fmtNum(p.nonce));
        set('m-hash', hashHtml(p.hash));
        set('m-rate', fmtNum(Math.round(p.hashes / Math.max(p.elapsed, 1) * 1000)) + ' H/s');
        set('m-time', (p.elapsed / 1000).toFixed(2) + ' giây');
        set('m-tries', fmtNum(p.hashes));
        set('m-log', job.log.map((h) => `<div>${hashHtml(h)}</div>`).join(''));
        const bar = document.getElementById('m-bar');
        if (bar) bar.style.width = Math.min(100, p.hashes / expected * 100) + '%';
      }
    }).then((result) => {
      ui.mining = null;
      if (!result) {
        toast('Đã dừng đào block.');
      } else {
        try {
          const cb = result.transactions[0];
          const rewardBefore = bc.nextReward();
          const adj = bc.commitBlock(result);
          save();
          toast(`Đào thành công block #${result.index} sau ${fmtNum(result.hashes)} lần thử (${fmtMs(result.minedIn)})! +${fmtAmt(cb.amount)} cho ${bc.nameOf(result.miner)}.`, 'ok');
          if (adj && adj.to !== adj.from) {
            toast(`Mạng điều chỉnh độ khó ${adj.from} → ${adj.to} (trung bình ${fmtMs(adj.avg)}/block).`, '');
          }
          if (bc.nextReward() < rewardBefore) {
            toast(`Halving! Phần thưởng block giảm còn ${fmtAmt(bc.reward)}.`, '');
          }
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
        <td class="muted">${esc(tx.note || '—')}${tx.signature ? ' <span class="chip ok" title="Đã ký bằng MetaMask">✍ Đã ký</span>' : ''}</td>
        <td class="amt muted">${tx.from === SYSTEM ? '—' : fmtAmt(tx.fee || 0)}</td>
        <td class="amt">${ui.tamper
          ? `<input class="tamper-input" type="number" step="any" value="${tx.amount}" data-tamper="${b.index}:${ti}">`
          : fmtAmt(tx.amount)}</td></tr>`).join('');

    const busy = ui.remining === b.index;
    return `<div class="card block-card ${st.valid ? '' : 'bad'}" id="block-${b.index}">
      <div class="block-head">
        <div class="block-num">#${b.index}</div>
        <div class="grow"><h3>${b.index === 0 ? 'Block khởi tạo (Genesis)' : 'Block #' + b.index}</h3>
          <div class="muted" style="font-size:12.5px">${fmtTime(b.timestamp)} · đào bởi ${esc(bc.nameOf(b.miner))}${b.minedIn !== undefined && b.index > 1 ? ' trong ' + fmtMs(b.minedIn) : ''} · ${bc.confirmationsOf(b.index)} xác nhận</div></div>
        <span class="chip ${st.valid ? 'ok' : 'bad'}">${st.valid ? '✓ Hợp lệ' : '✕ Không hợp lệ'}</span>
      </div>
      <div class="block-fields">
        <div class="bf wide"><label>Hash lưu trong block</label><div class="val">${hashHtml(b.hash)}</div></div>
        ${st.dataOk ? '' : `<div class="bf wide"><label>Hash tính lại từ dữ liệu hiện tại</label><div class="val bad">${st.recomputed}</div></div>`}
        <div class="bf wide"><label>Merkle root (tóm tắt ${b.transactions.length} giao dịch)</label><div class="val ${st.merkleOk ? '' : 'bad'}">${esc(b.merkleRoot || '')}</div></div>
        ${st.merkleOk ? '' : `<div class="bf wide"><label>Merkle root tính lại từ giao dịch hiện tại</label><div class="val bad">${st.merkle}</div></div>`}
        <div class="bf wide"><label>Hash của block trước (previousHash)</label><div class="val ${st.linkOk ? '' : 'bad'}">${b.previousHash}</div></div>
        <div class="bf"><label>Nonce</label><div class="val">${fmtNum(b.nonce)}</div></div>
        <div class="bf"><label>Độ khó</label><div class="val">${b.difficulty} (${'0'.repeat(b.difficulty)}…)</div></div>
      </div>
      ${st.valid ? '' : `<ul class="reasons">${st.reasons.map((r) => `<li>${r}</li>`).join('')}</ul>
        <div class="block-actions"><button class="btn btn-sm btn-ok" data-remine="${b.index}" ${ui.remining !== null ? 'disabled' : ''}>
          ${busy ? '<span class="spinner"></span> Đang đào lại…' : '⛏ Đào lại block này'}</button></div>`}
      <div class="block-txs table-wrap"><table>
        <thead><tr><th>Mã GD</th><th>Từ</th><th>Đến</th><th>Ghi chú</th><th class="amt">Phí</th><th class="amt">Số tiền</th></tr></thead>
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
        <button class="btn btn-ghost btn-sm" id="ex-export">Tải chuỗi (JSON)</button>
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
    $('#ex-export').addEventListener('click', () => {
      const data = JSON.stringify({
        exportedAt: new Date().toISOString(),
        valid: bc.isValid(),
        ruleHistory: bc.ruleHistory,
        difficulty: bc.difficulty,
        nextReward: bc.nextReward(),
        wallets: bc.wallets,
        chain: bc.chain,
        pending: bc.pending
      }, null, 2);
      const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'minichain-' + bc.chain.length + '-blocks.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Đã tải xuống chuỗi khối dạng JSON.', 'ok');
    });
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

  // ---------- Màn hình: Quản trị (chỉ quản trị viên) ----------
  function renderAdmin() {
    if (!ui.admin) {
      return `<div class="card login-gate">
        <div class="gate-icon">🛡</div>
        <h3>Chỉ quản trị viên mới vào được trang này</h3>
        <p class="muted">Đăng nhập bằng tài khoản quản trị để quản lý ví, luật mạng, mempool và dữ liệu hệ thống.</p>
        <div class="btn-row"><button class="btn" data-login="" data-login-tab="admin">🛡 Đăng nhập quản trị</button></div>
      </div>`;
    }
    const s = bc.stats();
    const R = bc.rules;
    const next = bc.latest.index + 1;

    const walletRows = bc.wallets.map((w) => `<tr>
        <td>${who(w.address)}${w.metamask ? ' <span class="chip accent">MetaMask</span>' : ''}${w.system ? ' <span class="chip accent">⚙ Hệ thống</span>' : ''}</td>
        <td class="mono muted">${short(w.address, 8, 6)}</td>
        <td class="amt">${fmtAmt(bc.balanceOf(w.address))}</td>
        <td>${w.locked ? '<span class="chip bad">🔒 Bị khoá</span>' : '<span class="chip ok">Hoạt động</span>'}</td>
        <td><div class="row-actions">
          ${w.system ? '' : w.locked ? `<button class="btn btn-sm btn-ghost" data-adm-unlock="${w.address}">Mở khoá</button>`
            : `<button class="btn btn-sm btn-ghost" data-adm-lock="${w.address}">Khoá</button>`}
          <button class="btn btn-sm btn-ghost" data-adm-pw="${w.address}" ${w.metamask || w.system ? 'disabled title="Ví này không dùng mật khẩu"' : ''}>Đặt lại mật khẩu</button>
          <button class="btn btn-sm" data-adm-mint="${w.address}">+ Cấp MC</button>
        </div></td></tr>`).join('');

    const pool = bc.sortedPending();
    const poolHtml = pool.length
      ? `<div class="table-wrap"><table><thead><tr><th>Mã GD</th><th>Từ</th><th>Đến</th><th class="amt">Số tiền</th><th class="amt">Phí</th><th></th></tr></thead>
        <tbody>${pool.map((tx) => `<tr><td class="mono muted">${tx.id.slice(0, 8)}${tx.mint ? ' <span class="chip accent">Cấp phát</span>' : ''}</td>
          <td>${who(tx.from)}</td><td>${who(tx.to)}</td><td class="amt">${fmtAmt(tx.amount)}</td><td class="amt">${fmtAmt(tx.fee || 0)}</td>
          <td><button class="btn btn-sm btn-danger" data-adm-del="${tx.id}" ${ui.mining && ui.mining.block.transactions.some((t) => t.id === tx.id) ? 'disabled title="Đang được đào"' : ''}>Xoá</button></td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty">Mempool trống.</div>';

    const versions = bc.ruleHistory.slice().reverse().map((v) => `<tr>
        <td>#${v.from}${v.from === 0 ? ' <span class="chip">Ban đầu</span>' : ''}</td>
        <td class="amt">${fmtAmt(v.rules.initialReward)}</td><td class="amt">${v.rules.halvingInterval} block</td>
        <td class="amt">${v.rules.maxTxPerBlock}</td><td class="amt">${v.rules.targetBlockMs / 1000} giây</td>
        <td class="amt">${v.rules.adjustInterval} block</td><td class="amt">${v.rules.minDifficulty}–${v.rules.maxDifficulty}</td>
        <td class="amt">${v.rules.minTxToMine || 0} GD · ${fmtNum(v.rules.minMinerBalance || 0)} MC · ${v.rules.maxConsecutiveBlocks || '∞'} liên tiếp</td></tr>`).join('');

    const logHtml = bc.adminLog.length
      ? `<div class="mm-log">${bc.adminLog.map((l) => `<div><time>${fmtTime(l.time)}</time><span>${esc(l.action)}</span></div>`).join('')}</div>`
      : '<div class="empty">Chưa có thao tác quản trị nào.</div>';

    const field = (id, label, value, attrs) => `<div class="field"><label for="${id}">${label}</label><input class="input" id="${id}" type="number" value="${value}" ${attrs || ''}></div>`;

    return `<div class="grid stats">
        ${statCard('Số ví', fmtNum(s.wallets), s.locked + ' ví đang bị khoá', 'rgba(124,140,255,.16)')}
        ${statCard('Giao dịch chờ', fmtNum(s.pending), 'Trong mempool', 'rgba(251,191,36,.16)')}
        ${statCard('Chiều cao chuỗi', '#' + bc.latest.index, 'Luật mới áp dụng từ #' + next, 'rgba(45,212,191,.16)')}
        ${statCard('Tổng cung', fmtAmt(s.supply), 'Gồm cả MC do quản trị viên cấp', 'rgba(52,211,153,.16)')}
      </div>
      <div class="card">
        <div class="card-head"><h3>Quản lý ví</h3><span class="hint">Ví bị khoá không đăng nhập, gửi MC hay đào được, nhưng vẫn nhận MC</span></div>
        <div class="table-wrap"><table><thead><tr><th>Ví</th><th>Địa chỉ</th><th class="amt">Số dư</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
          <tbody>${walletRows}</tbody></table></div>
      </div>
      <div class="grid rules-grid">
        <form class="card" id="adm-rules" autocomplete="off">
          <div class="card-head"><h3>Luật mạng</h3><span class="chip warn">Áp dụng từ block #${next}</span></div>
          <p class="muted" style="margin:0 0 14px;font-size:13px">Giống một lần nâng cấp mạng: luật mới chỉ áp dụng cho block kế tiếp trở đi, các block cũ vẫn được kiểm tra theo luật lúc chúng được đào.</p>
          <div class="field-grid">
            ${field('adm-reward', 'Phần thưởng ban đầu (MC)', R.initialReward, 'min="1" max="1000" step="any"')}
            ${field('adm-halving', 'Halving sau mỗi (block)', R.halvingInterval, 'min="2" max="1000"')}
            ${field('adm-maxtx', 'Giao dịch tối đa / block', R.maxTxPerBlock, 'min="1" max="20"')}
            ${field('adm-target', 'Thời gian mục tiêu (giây)', R.targetBlockMs / 1000, 'min="1" max="60"')}
            ${field('adm-adjust', 'Chỉnh độ khó sau mỗi (block)', R.adjustInterval, 'min="1" max="100"')}
            ${field('adm-diff', 'Độ khó hiện tại', bc.difficulty, 'min="1" max="5"')}
            ${field('adm-dmin', 'Độ khó tối thiểu', R.minDifficulty, 'min="1" max="5"')}
            ${field('adm-dmax', 'Độ khó tối đa', R.maxDifficulty, 'min="1" max="5"')}
            ${field('adm-mintx', 'Số GD tối thiểu để đào', R.minTxToMine, 'min="0" max="20"')}
            ${field('adm-minbal', 'Số dư tối thiểu của thợ đào (MC)', R.minMinerBalance, 'min="0" max="100000" step="any"')}
            ${field('adm-maxrun', 'Số block liên tiếp tối đa / ví', R.maxConsecutiveBlocks, 'min="1" max="1000"')}
          </div>
          <div class="form-error" id="adm-rules-error"></div>
          <button class="btn btn-block" type="submit" ${ui.mining ? 'disabled' : ''}>Áp dụng luật mới</button>
        </form>
        <div class="card">
          <div class="card-head"><h3>Lịch sử phiên bản luật</h3><span class="hint">${bc.ruleHistory.length} phiên bản</span></div>
          <div class="table-wrap"><table class="compact"><thead><tr><th>Từ block</th><th class="amt">Thưởng</th><th class="amt">Halving</th><th class="amt">GD / block</th><th class="amt">Mục tiêu</th><th class="amt">Chỉnh độ khó</th><th class="amt">Độ khó</th><th class="amt">Điều kiện đào</th></tr></thead>
            <tbody>${versions}</tbody></table></div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Mempool (${pool.length})</h3><span class="hint">Quản trị viên xoá được mọi giao dịch đang chờ</span></div>
        ${poolHtml}
      </div>
      <div class="grid halves">
        <form class="card" id="adm-fx" autocomplete="off" novalidate>
          <div class="card-head"><h3>Tỷ giá đổi tiền</h3><span class="hint">Quầy đổi tiền: ${fmtAmt(bc.availableOf(bc.systemWallet('exchange').address))} dự trữ</span></div>
          <div class="field-grid">
            ${field('adm-vnd', '1 MC = ? VND', bc.fx.rates.VND, 'min="100" max="10000000"')}
            ${field('adm-usd', '1 MC = ? USD', bc.fx.rates.USD, 'min="0.01" max="10000" step="any"')}
            ${field('adm-spread', 'Chênh lệch mua–bán (%)', Math.round(bc.fx.spread * 10000) / 100, 'min="0" max="10" step="any"')}
          </div>
          <div class="form-error" id="adm-fx-error"></div>
          <button class="btn btn-block" type="submit">Cập nhật tỷ giá</button>
          <p class="note">Lệnh đổi tiền đã tạo giữ nguyên giá lúc đặt. Muốn tăng dự trữ của quầy hoặc quỹ tiết kiệm, dùng "+ Cấp MC" cho ví hệ thống.</p>
        </form>
        <div class="card">
          <div class="card-head"><h3>Dịch vụ tiền tệ</h3></div>
          <div class="kv"><span>Sản phẩm đang bán</span><b>${bc.products.filter((p) => p.active).length}</b></div>
          <div class="kv"><span>Đơn hàng</span><b>${bc.orders.length}</b></div>
          <div class="kv"><span>Hoá đơn (chưa trả / tổng)</span><b>${bc.invoices.filter((i) => i.status === 'open').length} / ${bc.invoices.length}</b></div>
          <div class="kv"><span>Lệnh đổi tiền</span><b>${bc.fxOrders.length}</b></div>
          <div class="kv"><span>Khoản tiết kiệm</span><b>${bc.stakes.length}</b></div>
          <div class="kv"><span>Quỹ tiết kiệm</span><b>${fmtAmt(bc.availableOf(bc.systemWallet('staking').address))}</b></div>
        </div>
      </div>
      <div class="grid halves">
        <form class="card" id="adm-pw" autocomplete="off">
          <div class="card-head"><h3>Đổi mật khẩu quản trị</h3></div>
          <div class="field"><label for="adm-old">Mật khẩu hiện tại</label><input class="input" id="adm-old" type="password"></div>
          <div class="field"><label for="adm-new">Mật khẩu mới (ít nhất 6 ký tự)</label><input class="input" id="adm-new" type="password" autocomplete="new-password"></div>
          <div class="field"><label for="adm-new2">Nhập lại mật khẩu mới</label><input class="input" id="adm-new2" type="password" autocomplete="new-password"></div>
          <div class="form-error" id="adm-pw-error"></div>
          <button class="btn btn-block" type="submit">Đổi mật khẩu</button>
        </form>
        <div class="card">
          <div class="card-head"><h3>Hệ thống</h3></div>
          <div class="kv"><span>Tài khoản quản trị</span><b class="mono">${esc(bc.admin.username)}</b></div>
          <div class="kv"><span>Dữ liệu lưu tại</span><b class="mono">localStorage</b></div>
          <div class="banner bad" style="margin-top:14px"><div class="b-icon">!</div>
            <div><b>Đặt lại dữ liệu</b><p>Xoá mọi ví, block, giao dịch và nhật ký; tạo lại chuỗi mẫu. Không thể hoàn tác.</p></div>
            <button class="btn btn-sm btn-danger" type="button" id="adm-reset">Đặt lại</button></div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Nhật ký quản trị</h3><span class="hint">50 thao tác gần nhất</span></div>
        ${logHtml}
      </div>`;
  }

  function bindAdmin() {
    if (!ui.admin) return;
    const done = (msg) => { save(); toast(msg, 'ok'); render(); };
    const fail = (err) => toast(err.message, 'bad');

    $$('[data-adm-lock]').forEach((b) => b.addEventListener('click', () => {
      const w = bc.walletOrThrow(b.dataset.admLock);
      if (ui.mining && ui.mining.block.miner === w.address) { toast('Ví này đang đào block – hãy đợi đào xong.', 'bad'); return; }
      if (!window.confirm('Khoá ví "' + w.name + '"? Các giao dịch đang chờ của ví này sẽ bị huỷ.')) return;
      try { bc.setWalletLocked(w.address, true); done('Đã khoá ví "' + w.name + '".'); } catch (err) { fail(err); }
    }));
    $$('[data-adm-unlock]').forEach((b) => b.addEventListener('click', () => {
      try { const w = bc.setWalletLocked(b.dataset.admUnlock, false); done('Đã mở khoá ví "' + w.name + '".'); } catch (err) { fail(err); }
    }));
    $$('[data-adm-pw]').forEach((b) => b.addEventListener('click', () => {
      const w = bc.walletOrThrow(b.dataset.admPw);
      openModal(`<div class="modal-head"><h3>Đặt lại mật khẩu ví "${esc(w.name)}"</h3><button class="icon-btn" data-close aria-label="Đóng">✕</button></div>
        <form id="ap-form" autocomplete="off">
          <div class="field"><label for="ap-new">Mật khẩu mới (ít nhất 6 ký tự)</label><input class="input" id="ap-new" type="password" autocomplete="new-password"></div>
          <div class="field"><label for="ap-new2">Nhập lại mật khẩu mới</label><input class="input" id="ap-new2" type="password" autocomplete="new-password"></div>
          <div class="form-error" id="ap-error"></div>
          <button class="btn btn-block" type="submit">Đặt lại mật khẩu</button>
          <p class="note">Khoá bí mật của ví không đổi – chủ ví vẫn đăng nhập được bằng khoá cũ.</p>
        </form>`, (root) => {
        root.querySelector('#ap-form').addEventListener('submit', (e) => {
          e.preventDefault();
          try {
            bc.resetWalletPassword(w.address, root.querySelector('#ap-new').value, root.querySelector('#ap-new2').value);
            closeModal();
            done('Đã đặt lại mật khẩu ví "' + w.name + '".');
          } catch (err) { root.querySelector('#ap-error').textContent = err.message; }
        });
      });
    }));
    $$('[data-adm-mint]').forEach((b) => b.addEventListener('click', () => {
      const w = bc.walletOrThrow(b.dataset.admMint);
      openModal(`<div class="modal-head"><h3>Cấp MC cho ví "${esc(w.name)}"</h3><button class="icon-btn" data-close aria-label="Đóng">✕</button></div>
        <form id="am-form" autocomplete="off">
          <div class="field"><label for="am-amount">Số MC (tối đa 10.000)</label><input class="input" id="am-amount" type="number" min="0" step="any" placeholder="100"></div>
          <div class="field"><label for="am-note">Ghi chú</label><input class="input" id="am-note" maxlength="60" placeholder="Cấp phát bởi quản trị viên"></div>
          <div class="form-error" id="am-error"></div>
          <button class="btn btn-block" type="submit">Cấp MC</button>
          <p class="note">Giao dịch cấp phát đi từ "Hệ thống", được ưu tiên đưa vào block kế tiếp. Ví chỉ nhận được MC sau khi block đó được đào.</p>
        </form>`, (root) => {
        root.querySelector('#am-form').addEventListener('submit', (e) => {
          e.preventDefault();
          try {
            const tx = bc.mint(w.address, root.querySelector('#am-amount').value, root.querySelector('#am-note').value);
            closeModal();
            done('Đã tạo giao dịch cấp ' + fmtAmt(tx.amount) + ' cho "' + w.name + '" – chờ đào vào block.');
          } catch (err) { root.querySelector('#am-error').textContent = err.message; }
        });
      });
    }));
    $$('[data-adm-del]').forEach((b) => b.addEventListener('click', () => {
      try { bc.removePending(b.dataset.admDel); done('Đã xoá giao dịch khỏi mempool.'); } catch (err) { fail(err); }
    }));

    $('#adm-rules').addEventListener('submit', (e) => {
      e.preventDefault();
      if (ui.mining) { toast('Đang đào block – hãy đợi đào xong rồi đổi luật.', 'bad'); return; }
      try {
        const v = (id) => $('#' + id).value;
        const target = v('adm-target');
        const r = bc.updateRules({
          initialReward: v('adm-reward'), halvingInterval: v('adm-halving'), maxTxPerBlock: v('adm-maxtx'),
          targetBlockMs: target === '' ? '' : Number(target) * 1000, adjustInterval: v('adm-adjust'),
          minDifficulty: v('adm-dmin'), maxDifficulty: v('adm-dmax'),
          minTxToMine: v('adm-mintx'), minMinerBalance: v('adm-minbal'), maxConsecutiveBlocks: v('adm-maxrun')
        }, v('adm-diff'));
        done(r.changed.length ? 'Đã áp dụng luật mới từ block #' + r.from + '.' : 'Đã đổi độ khó hiện tại.');
      } catch (err) {
        $('#adm-rules-error').textContent = err.message;
      }
    });
    $('#adm-fx').addEventListener('submit', (e) => {
      e.preventDefault();
      try {
        bc.setFxRates($('#adm-vnd').value, $('#adm-usd').value, $('#adm-spread').value);
        done('Đã cập nhật tỷ giá.');
      } catch (err) {
        $('#adm-fx-error').textContent = err.message;
      }
    });
    $('#adm-pw').addEventListener('submit', (e) => {
      e.preventDefault();
      try {
        bc.changeAdminPassword($('#adm-old').value, $('#adm-new').value, $('#adm-new2').value);
        done('Đã đổi mật khẩu quản trị.');
      } catch (err) {
        $('#adm-pw-error').textContent = err.message;
      }
    });
    $('#adm-reset').addEventListener('click', resetData);
  }

  // ---------- Màn hình: Hướng dẫn ----------
  function renderGuide() {
    const concepts = [
      ['Hàm băm (Hash)', 'SHA-256 biến dữ liệu bất kỳ thành chuỗi 64 ký tự. Chỉ cần đổi 1 ký tự đầu vào, hash thay đổi hoàn toàn.'],
      ['Block & Merkle root', 'Tiêu đề block gồm: số thứ tự, hash block trước, thời gian, Merkle root, độ khó và nonce. Merkle root là hash tóm tắt mọi giao dịch – sửa 1 giao dịch là Merkle root đổi.'],
      ['Proof-of-Work', 'Thợ đào thử lần lượt nonce = 0, 1, 2… cho tới khi hash tiêu đề bắt đầu bằng đủ số chữ 0. Với độ khó d, trung bình cần 16^d lần thử.'],
      ['Phần thưởng, phí & halving', 'Giao dịch đầu tiên của block (coinbase) trả cho thợ đào phần thưởng + tổng phí. Phần thưởng giảm một nửa sau mỗi ' + bc.rules.halvingInterval + ' block (hiện tại ' + bc.nextReward() + ' MC).'],
      ['Độ khó tự điều chỉnh', 'Cứ ' + bc.rules.adjustInterval + ' block, mạng so thời gian đào trung bình với mục tiêu ~' + bc.rules.targetBlockMs / 1000 + ' giây: đào quá nhanh thì tăng độ khó, quá chậm thì giảm.'],
      ['Chuỗi liên kết', 'Block sau lưu hash của block trước. Sửa một block làm hash của nó đổi, khiến mọi block phía sau mất liên kết – đó là tính bất biến.'],
      ['Mempool & xác nhận', 'Giao dịch mới nằm chờ trong mempool. Mỗi block chỉ chứa tối đa ' + bc.rules.maxTxPerBlock + ' giao dịch, ưu tiên phí cao. Mỗi block xây thêm phía sau là thêm 1 xác nhận; từ 6 xác nhận coi như chắc chắn.'],
      ['Quản trị viên', 'Blockchain công khai thật không có quản trị viên. MiniChain thêm vai trò này để quản lý bản demo và mô phỏng chuỗi có cấp phép: khoá ví, cấp MC, đổi luật mạng (chỉ có hiệu lực từ block kế tiếp, giống một lần nâng cấp mạng).'],
      ['Đăng nhập ví', 'Mỗi ví có khoá bí mật; địa chỉ ví = SHA-256(khoá). Chỉ ai biết mật khẩu hoặc khoá bí mật mới gửi được MC hay nhận thưởng đào bằng ví đó.'],
      ['Điều kiện đào block', 'Ngoài Proof-of-Work, mạng còn đặt điều kiện cho thợ đào: block phải có ít nhất ' + bc.rules.minTxToMine + ' giao dịch, thợ đào phải có ≥ ' + bc.rules.minMinerBalance + ' MC và không được đào quá ' + bc.rules.maxConsecutiveBlocks + ' block liên tiếp. Block vi phạm bị các nút từ chối.'],
      ['Dùng MC: mua hàng, hoá đơn, đổi tiền, tiết kiệm', 'Mọi dịch vụ đều là giao dịch thật trên chuỗi: mua hàng chuyển MC cho người bán, hoá đơn kèm mã QR, quầy đổi tiền đổi MC ↔ VND/USD theo tỷ giá, quỹ tiết kiệm trả lãi khi đủ số block. Chỉ khi được đào vào block, đơn hàng / hoá đơn / lệnh đổi / khoản gửi mới được xác nhận.'],
      ['Ví MetaMask & chữ ký số', 'MetaMask giữ khoá bí mật của bạn. Khi gửi MC từ ví MetaMask, ứng dụng yêu cầu ký (personal_sign); chữ ký chứng minh chủ ví đã đồng ý mà không làm lộ khoá.']
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
            <li>Bấm <b>Đăng nhập ví</b>, đăng nhập ví An (mật khẩu <b class="mono">${DEMO_PASSWORD}</b>).</li>
            <li>Vào <b>Giao dịch</b>, gửi 10 MC sang Bình với phí 0,5 → giao dịch nằm trong mempool.</li>
            <li>Vào <b>Đào block</b>, bấm đào → nhận phần thưởng + phí; giao dịch phí cao được chọn trước, số xác nhận tăng dần.</li>
            <li>Vào <b>Khám phá chuỗi</b>, bật chế độ thử sửa, đổi số tiền trong block #1 → block bị đánh dấu đỏ.</li>
            <li>Bấm <b>Đào lại block</b> → block #1 hợp lệ nhưng block #2 lại đứt liên kết. Muốn gian lận phải đào lại cả chuỗi.</li>
            <li>Vào <b>Cửa hàng</b> mua một cuốn sách của Chi, vào <b>Thanh toán</b> tạo hoá đơn có mã QR, rồi đào block → đơn hàng và hoá đơn chuyển sang "Đã xác nhận".</li>
            <li>Vào <b>Tiết kiệm</b> gửi 20 MC kỳ hạn 5 block, đào thêm vài block rồi tất toán để nhận gốc + lãi; vào <b>Đổi tiền</b> bán MC lấy VND.</li>
            <li>Vào <b>Ví MetaMask</b>, kết nối ví và bấm <b>Thêm vào MiniChain</b>, rồi gửi MC từ ví đó → MetaMask yêu cầu ký giao dịch.</li>
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
    if (b) go(b.dataset.view);
  });

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-go],[data-block],[data-copy],[data-login],[data-logout]');
    if (!t) return;
    if (t.dataset.go) { if (t.hasAttribute('data-close')) closeModal(); go(t.dataset.go); }
    else if (t.dataset.block !== undefined) go('explorer', { focusBlock: Number(t.dataset.block), query: '' });
    else if (t.dataset.copy) copy(t.dataset.copy);
    else if (t.dataset.login !== undefined) openLogin(t.dataset.login, t.dataset.loginTab || 'password');
    else if (t.hasAttribute('data-logout')) logout();
  });

  $('#btn-account').addEventListener('click', () => (ui.me || ui.admin ? openAccount() : openLogin()));

  /** Đặt lại dữ liệu – chỉ quản trị viên. */
  function resetData() {
    if (!ui.admin) { toast('Chỉ quản trị viên mới được đặt lại dữ liệu.', 'bad'); return; }
    if (!window.confirm('Xoá toàn bộ dữ liệu và tạo lại chuỗi mẫu? Mật khẩu quản trị cũng trở về mặc định.')) return;
    if (ui.mining) ui.mining.stop = true;
    bc = Blockchain.create();
    bc.log('Đặt lại dữ liệu mẫu');
    save();
    Object.assign(ui, { me: null, mining: null, remining: null, tamper: false, query: '' });
    toast('Đã đặt lại dữ liệu mẫu.', 'ok');
    render();
  }
  $('#btn-reset').addEventListener('click', resetData);

  // Đăng ký 4 màn hình dịch vụ tiền tệ (js/services.js)
  if (window.ServicesUI) {
    window.ServicesUI.install({
      VIEWS: VIEWS, getBc: () => bc, save: save, render: render, toast: toast, go: go, esc: esc, ui: ui, me: me,
      fmtAmt: fmtAmt, who: who, statCard: statCard, loginGate: loginGate, openModal: openModal, closeModal: closeModal
    });
  }

  // Đăng ký màn hình "Ví MetaMask" (js/metamask.js)
  if (window.MetaMaskUI) {
    window.MetaMaskUI.install({
      VIEWS: VIEWS, getBc: () => bc, save: save, render: render, toast: toast, go: go, esc: esc, fmtNum: fmtNum, ui: ui,
      login: (w) => login(w, 'MetaMask'),
      // Đổi tài khoản trong MetaMask => đăng xuất ví MetaMask đang dùng
      onAccountChanged: (account) => {
        const w = me();
        if (w && w.metamask && w.address !== account) { logout(true); toast('Tài khoản MetaMask đã thay đổi – đã đăng xuất ví.', 'bad'); }
      }
    });
  }

  render();
})();
