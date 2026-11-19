/*
 * metamask.js – Kết nối ví MetaMask cho MiniChain.
 * Dùng chuẩn EIP-1193 (provider.request) và EIP-6963 (tìm ví khi có nhiều tiện ích).
 * Ứng dụng KHÔNG BAO GIỜ yêu cầu cụm từ khôi phục hay khoá bí mật: mọi thao tác ký
 * đều do người dùng xác nhận trong cửa sổ MetaMask.
 */
(function (global) {
  'use strict';

  const STORE_KEY = 'minichain.metamask';
  const SEPOLIA = '0xaa36a7';
  // Chỉ cho phép gửi ETH trên các mạng thử nghiệm để tránh mất tiền thật.
  const TESTNETS = { '0xaa36a7': true, '0x4268': true, '0x539': true, '0x7a69': true };
  const NETWORKS = {
    '0x1': { name: 'Ethereum Mainnet', symbol: 'ETH', explorer: 'https://etherscan.io' },
    '0xaa36a7': { name: 'Sepolia Testnet', symbol: 'SepoliaETH', explorer: 'https://sepolia.etherscan.io' },
    '0x4268': { name: 'Holesky Testnet', symbol: 'ETH', explorer: 'https://holesky.etherscan.io' },
    '0x89': { name: 'Polygon', symbol: 'POL', explorer: 'https://polygonscan.com' },
    '0x38': { name: 'BNB Smart Chain', symbol: 'BNB', explorer: 'https://bscscan.com' },
    '0x2105': { name: 'Base', symbol: 'ETH', explorer: 'https://basescan.org' },
    '0xe708': { name: 'Linea', symbol: 'ETH', explorer: 'https://lineascan.build' },
    '0x539': { name: 'Localhost 1337', symbol: 'ETH' },
    '0x7a69': { name: 'Hardhat 31337', symbol: 'ETH' }
  };

  const state = {
    provider: null,
    providerName: '',
    account: null,
    chainId: null,
    balanceWei: null,
    busy: '',
    msgDraft: 'Tôi xác nhận là chủ sở hữu ví này – MiniChain',
    lastSignature: null,
    sendTo: '',
    sendAmt: '',
    lastTxHash: null,
    log: []
  };
  let api = null;          // các hàm của app.js, truyền vào qua install()
  let listenersBound = false;

  // ---------- Tìm provider (EIP-6963, dự phòng window.ethereum) ----------
  const announced = [];
  global.addEventListener('eip6963:announceProvider', function (e) {
    if (e.detail && e.detail.provider && !announced.some(function (d) { return d.provider === e.detail.provider; })) {
      announced.push(e.detail);
    }
  });
  global.dispatchEvent(new Event('eip6963:requestProvider'));

  function pickProvider() {
    const mm = announced.find(function (d) { return d.info && d.info.rdns === 'io.metamask'; });
    if (mm) return { provider: mm.provider, name: mm.info.name || 'MetaMask' };
    const eth = global.ethereum;
    if (eth) {
      if (Array.isArray(eth.providers)) {
        const p = eth.providers.find(function (x) { return x.isMetaMask; });
        if (p) return { provider: p, name: 'MetaMask' };
      }
      return { provider: eth, name: eth.isMetaMask ? 'MetaMask' : 'Ví Ethereum của trình duyệt' };
    }
    if (announced.length) return { provider: announced[0].provider, name: announced[0].info.name || 'Ví Ethereum' };
    return null;
  }

  function ensureProvider() {
    if (!state.provider) {
      const p = pickProvider();
      if (p) {
        state.provider = p.provider;
        state.providerName = p.name;
        bindListeners();
      }
    }
    return state.provider;
  }

  function bindListeners() {
    if (listenersBound || !state.provider || typeof state.provider.on !== 'function') return;
    listenersBound = true;
    state.provider.on('accountsChanged', function (accounts) {
      const a = accounts && accounts[0] ? String(accounts[0]).toLowerCase() : null;
      if (a === state.account) return;
      state.account = a;
      state.lastSignature = null;
      if (a) {
        log('Đổi sang tài khoản ' + short(a));
        refreshBalance();
      } else {
        state.balanceWei = null;
        remember(false);
        log('MetaMask đã ngắt kết nối.', 'bad');
      }
      update();
    });
    state.provider.on('chainChanged', function (chainId) {
      state.chainId = chainId;
      state.lastTxHash = null;
      log('Đổi mạng: ' + netName(chainId));
      refreshBalance();
      update();
    });
  }

  // ---------- Tiện ích ----------
  function short(a) { return a ? a.slice(0, 6) + '…' + a.slice(-4) : ''; }
  function netName(id) { return NETWORKS[id] ? NETWORKS[id].name : 'Mạng có Chain ID ' + parseInt(id, 16); }
  function symbolOf(id) { return NETWORKS[id] ? NETWORKS[id].symbol : 'ETH'; }
  function isAddress(a) { return /^0x[0-9a-fA-F]{40}$/.test(a); }

  function formatEth(wei) {
    const base = BigInt('1000000000000000000');
    const whole = wei / base;
    const frac = (wei % base).toString().padStart(18, '0').slice(0, 5).replace(/0+$/, '');
    return whole.toLocaleString('vi-VN') + (frac ? ',' + frac : '');
  }

  function parseEth(text) {
    const s = String(text || '').trim().replace(',', '.');
    if (!/^\d+(\.\d{1,18})?$/.test(s)) throw new Error('Số lượng không hợp lệ (ví dụ: 0.001).');
    const parts = s.split('.');
    const frac = ((parts[1] || '') + '000000000000000000').slice(0, 18);
    return BigInt(parts[0]) * BigInt('1000000000000000000') + BigInt(frac);
  }

  function utf8ToHex(text) {
    return '0x' + Array.from(new TextEncoder().encode(text)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  function errMsg(err) {
    if (!err) return 'Lỗi không xác định.';
    if (err.code === 4001) return 'Bạn đã từ chối yêu cầu trong MetaMask.';
    if (err.code === -32002) return 'MetaMask đang có một yêu cầu chờ xử lý – hãy mở tiện ích MetaMask để xác nhận.';
    if (err.code === 4902) return 'Mạng này chưa được thêm vào MetaMask.';
    return err.message || String(err);
  }

  function log(msg, type) {
    state.log.unshift({ msg: msg, type: type || '', time: Date.now() });
    state.log = state.log.slice(0, 10);
  }

  function remember(on) { try { localStorage.setItem(STORE_KEY, on ? '1' : ''); } catch (e) { /* bỏ qua */ } }
  function wasConnected() { try { return localStorage.getItem(STORE_KEY) === '1'; } catch (e) { return false; } }

  // ---------- Thao tác với MetaMask ----------
  async function loadAccount(accounts) {
    state.account = accounts && accounts[0] ? String(accounts[0]).toLowerCase() : null;
    state.chainId = await state.provider.request({ method: 'eth_chainId' });
    await refreshBalance(true);
  }

  async function refreshBalance(silent) {
    if (!state.provider || !state.account) return;
    try {
      const hex = await state.provider.request({ method: 'eth_getBalance', params: [state.account, 'latest'] });
      state.balanceWei = BigInt(hex);
    } catch (e) {
      state.balanceWei = null;
    }
    if (!silent) update();
  }

  async function connect() {
    if (!ensureProvider()) throw new Error('Không tìm thấy MetaMask trong trình duyệt này.');
    state.busy = 'connect';
    update();
    try {
      const accounts = await state.provider.request({ method: 'eth_requestAccounts' });
      await loadAccount(accounts);
      remember(true);
      log('Đã kết nối tài khoản ' + short(state.account), 'ok');
      if (api) api.toast('Đã kết nối MetaMask: ' + short(state.account), 'ok');
    } finally {
      state.busy = '';
      update();
    }
  }

  async function silentReconnect() {
    if (!wasConnected() || !ensureProvider()) return;
    try {
      const accounts = await state.provider.request({ method: 'eth_accounts' });
      if (accounts && accounts.length) {
        await loadAccount(accounts);
        log('Tự động kết nối lại ' + short(state.account), 'ok');
        update();
      }
    } catch (e) { /* bỏ qua */ }
  }

  async function disconnect() {
    try {
      await state.provider.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] });
    } catch (e) { /* ví cũ không hỗ trợ – chỉ ngắt ở phía ứng dụng */ }
    state.account = null;
    state.balanceWei = null;
    state.lastSignature = null;
    state.lastTxHash = null;
    remember(false);
    log('Đã ngắt kết nối MetaMask.');
    update();
  }

  async function switchToSepolia() {
    try {
      await state.provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: SEPOLIA }] });
    } catch (e) {
      if (!e || e.code !== 4902) throw e;
      await state.provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: SEPOLIA,
          chainName: 'Sepolia',
          nativeCurrency: { name: 'Sepolia Ether', symbol: 'SepoliaETH', decimals: 18 },
          rpcUrls: ['https://rpc.sepolia.org'],
          blockExplorerUrls: ['https://sepolia.etherscan.io']
        }]
      });
    }
  }

  function signMessage(text) {
    return state.provider.request({ method: 'personal_sign', params: [utf8ToHex(text), state.account] });
  }

  async function sendEth(to, amountText) {
    if (!TESTNETS[state.chainId]) throw new Error('Chỉ được gửi ETH trên mạng thử nghiệm để tránh mất tiền thật.');
    if (!isAddress(to)) throw new Error('Địa chỉ nhận không hợp lệ (phải có dạng 0x + 40 ký tự hex).');
    const wei = parseEth(amountText);
    if (wei <= BigInt(0)) throw new Error('Số lượng phải lớn hơn 0.');
    if (state.balanceWei !== null && wei > state.balanceWei) throw new Error('Số dư ETH không đủ.');
    return state.provider.request({
      method: 'eth_sendTransaction',
      params: [{ from: state.account, to: to, value: '0x' + wei.toString(16) }]
    });
  }

  // ---------- Liên kết với MiniChain ----------
  function linkedWallet() {
    if (!api || !state.account) return null;
    return api.getBc().wallets.find(function (w) { return w.address.toLowerCase() === state.account; }) || null;
  }

  function linkToMiniChain() {
    if (!state.account) throw new Error('Hãy kết nối MetaMask trước.');
    if (linkedWallet()) throw new Error('Địa chỉ này đã có trong MiniChain.');
    const w = {
      name: 'MetaMask ' + state.account.slice(2, 6).toUpperCase(),
      address: state.account,
      created: Date.now(),
      metamask: true
    };
    api.getBc().wallets.push(w);
    api.save();
    return w;
  }

  /** Gọi từ app.js: ký một giao dịch MiniChain gửi từ ví MetaMask. */
  async function signTransaction(tx) {
    const from = String(tx.from).toLowerCase();
    if (!state.account) throw new Error('Ví gửi là ví MetaMask – hãy kết nối MetaMask (tài khoản ' + short(from) + ') để ký giao dịch.');
    if (state.account !== from) throw new Error('MetaMask đang chọn tài khoản ' + short(state.account) + ' – hãy chuyển sang ' + short(from) + ' để ký.');
    const bc = api.getBc();
    const message = [
      'MiniChain – Xác nhận giao dịch',
      'Từ: ' + tx.from,
      'Đến: ' + tx.to + ' (' + bc.nameOf(tx.to) + ')',
      'Số tiền: ' + tx.amount + ' MC',
      'Ghi chú: ' + (tx.note || '—'),
      'Mã giao dịch: ' + tx.id
    ].join('\n');
    const signature = await signMessage(message);
    log('Đã ký giao dịch ' + tx.id.slice(0, 8), 'ok');
    return { message: message, signature: signature };
  }

  // ---------- Giao diện ----------
  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7H5a2 2 0 0 1 0-4h13v4"/><path d="M3 5v14a2 2 0 0 0 2 2h15V7"/><circle cx="16" cy="14" r="1.5"/></svg>';

  function renderTop() {
    const btn = document.getElementById('btn-mm');
    if (btn) {
      btn.classList.toggle('on', !!state.account);
      btn.innerHTML = state.account
        ? '<span class="mm-dot on"></span>' + short(state.account)
        : '<span class="mm-dot"></span>Kết nối MetaMask';
      btn.title = state.account ? 'Đã kết nối MetaMask – ' + netName(state.chainId) : 'Kết nối ví MetaMask';
    }
    const dot = document.getElementById('mm-dot');
    if (dot) dot.classList.toggle('on', !!state.account);
  }

  function update() {
    renderTop();
    if (api && api.ui.view === 'metamask') api.render();
  }

  function logHtml() {
    if (!state.log.length) return '';
    return `<div class="card">
      <div class="card-head"><h3>Nhật ký kết nối</h3></div>
      <div class="mm-log">${state.log.map(function (l) {
        return `<div><time>${new Date(l.time).toLocaleTimeString('vi-VN')}</time><span class="${l.type}">${api.esc(l.msg)}</span></div>`;
      }).join('')}</div>
    </div>`;
  }

  function noProviderHtml() {
    const isFile = location.protocol === 'file:';
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const deepLink = 'https://metamask.app.link/dapp/' + location.host + location.pathname;
    const text = isFile
      ? 'Bạn đang mở ứng dụng trực tiếp từ file trên máy (file://). MetaMask không hoạt động với file cục bộ – hãy mở ứng dụng qua đường link GitHub Pages của dự án.'
      : mobile
        ? 'Trên điện thoại, hãy mở trang này bên trong trình duyệt của ứng dụng MetaMask.'
        : 'Trình duyệt này chưa cài tiện ích MetaMask. Cài xong, tải lại trang hoặc bấm "Thử lại".';
    const action = isFile ? ''
      : mobile ? `<a class="btn" href="${api.esc(deepLink)}">Mở trong ứng dụng MetaMask</a>`
        : '<a class="btn" href="https://metamask.io/download/" target="_blank" rel="noopener">Cài MetaMask</a>';
    return `<div class="card"><div class="mm-hero"><div class="mm-icon">${ICON}</div>
      <div class="grow"><h2>Chưa tìm thấy MetaMask</h2><p>${text}</p>
        <div class="btn-row">${action}<button class="btn btn-ghost" id="mm-retry">Thử lại</button></div>
      </div></div></div>`;
  }

  function connectHtml() {
    const busy = state.busy === 'connect';
    return `<div class="card">
      <div class="mm-hero"><div class="mm-icon">${ICON}</div>
        <div class="grow"><h2>Kết nối ví MetaMask</h2>
          <p>Liên kết tài khoản Ethereum của bạn với MiniChain. Ứng dụng chỉ đọc địa chỉ ví và xin chữ ký khi cần – MiniChain <b>không bao giờ</b> hỏi cụm từ khôi phục (seed phrase) hay khoá bí mật.</p></div>
        <button class="btn" id="mm-connect" ${state.busy ? 'disabled' : ''}>${busy ? '<span class="spinner"></span> Đang chờ MetaMask…' : 'Kết nối MetaMask'}</button>
      </div>
      <div class="mm-features">
        <div class="mm-feature"><b>Xem tài khoản</b>Địa chỉ ví, mạng đang dùng và số dư ETH.</div>
        <div class="mm-feature"><b>Ký số</b>Ký thông điệp và ký giao dịch MiniChain bằng khoá bí mật nằm trong MetaMask.</div>
        <div class="mm-feature"><b>Dùng trong MiniChain</b>Thêm địa chỉ MetaMask thành một ví để nhận MC và đào block.</div>
      </div>
      <p class="note">Ví phát hiện được: ${api.esc(state.providerName)}</p>
    </div>${logHtml()}`;
  }

  function connectedHtml() {
    const esc = api.esc;
    const bc = api.getBc();
    const net = NETWORKS[state.chainId] || {};
    const testnet = !!TESTNETS[state.chainId];
    const linked = linkedWallet();
    const balance = state.balanceWei === null ? '—' : formatEth(state.balanceWei);
    const explorer = net.explorer
      ? `<a class="link" href="${net.explorer}/address/${state.account}" target="_blank" rel="noopener">Xem trên trình khám phá khối ↗</a>` : '';

    const linkCard = linked
      ? `<p class="muted" style="margin:0">Địa chỉ MetaMask đang là ví <b>${esc(linked.name)}</b> trong MiniChain.</p>
        <div class="mm-bal">${api.fmtNum(bc.balanceOf(linked.address))} <small>MC</small></div>
        <p class="note">Mỗi giao dịch gửi MC từ ví này phải được ký bằng MetaMask. Chữ ký được lưu kèm giao dịch trong block.</p>
        <div class="btn-row"><button class="btn btn-sm" data-send="${linked.address}">Gửi MC từ ví này</button>
          <button class="btn btn-sm btn-ghost" data-mine-as="${linked.address}">Đào bằng ví này</button></div>`
      : `<p class="muted" style="margin:0 0 14px">Thêm địa chỉ MetaMask thành một ví trong MiniChain. Ví mới có 0 MC – hãy đào block bằng ví này hoặc nhận MC từ ví khác.</p>
        <button class="btn" id="mm-link">+ Thêm vào MiniChain</button>`;

    const sendCard = testnet
      ? `<div class="field"><label for="mm-to">Địa chỉ nhận</label><input class="input mono" id="mm-to" placeholder="0x…" value="${esc(state.sendTo)}"></div>
        <div class="field"><label for="mm-amt">Số lượng (${esc(symbolOf(state.chainId))})</label><input class="input" id="mm-amt" inputmode="decimal" placeholder="0.001" value="${esc(state.sendAmt)}"></div>
        <button class="btn btn-sm" id="mm-send" ${state.busy ? 'disabled' : ''}>${state.busy === 'send' ? '<span class="spinner"></span> Đang chờ xác nhận…' : 'Gửi qua MetaMask'}</button>
        ${state.lastTxHash ? `<div class="mm-out"><label>Mã giao dịch (tx hash)</label>${esc(state.lastTxHash)}
          ${net.explorer ? `<br><a class="link" href="${net.explorer}/tx/${esc(state.lastTxHash)}" target="_blank" rel="noopener">Xem trên trình khám phá khối ↗</a>` : ''}</div>` : ''}`
      : `<p class="muted" style="margin:0 0 12px">Bạn đang ở mạng <b>${esc(netName(state.chainId))}</b>. Để tránh mất tiền thật, chức năng gửi ETH chỉ bật trên mạng thử nghiệm.</p>
        <button class="btn btn-sm" id="mm-sepolia2">Chuyển sang Sepolia</button>`;

    return `<div class="grid halves">
      <div class="card">
        <div class="card-head"><h3>Tài khoản MetaMask</h3><span class="chip ${testnet ? 'warn' : 'accent'}">${esc(netName(state.chainId))}</span></div>
        <div class="field"><label>Địa chỉ</label><div class="mm-addr">${state.account} <button class="copy" data-copy="${state.account}">Sao chép</button></div></div>
        <label class="muted" style="font-size:12.5px">Số dư</label>
        <div class="mm-bal" id="mm-balance">${balance} <small>${esc(symbolOf(state.chainId))}</small></div>
        ${explorer}
        <div class="btn-row">
          <button class="btn btn-sm btn-ghost" id="mm-refresh">Làm mới số dư</button>
          ${state.chainId !== SEPOLIA ? '<button class="btn btn-sm btn-ghost" id="mm-sepolia">Chuyển sang Sepolia</button>' : ''}
          <button class="btn btn-sm btn-danger" id="mm-disconnect">Ngắt kết nối</button>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Liên kết với MiniChain</h3>${linked ? '<span class="chip ok">Đã liên kết</span>' : ''}</div>
        ${linkCard}
      </div>
    </div>
    <div class="grid halves">
      <div class="card">
        <div class="card-head"><h3>Ký thông điệp</h3><span class="hint">personal_sign</span></div>
        <textarea class="input textarea" id="mm-msg" maxlength="500">${esc(state.msgDraft)}</textarea>
        <div class="btn-row"><button class="btn btn-sm" id="mm-sign" ${state.busy ? 'disabled' : ''}>${state.busy === 'sign' ? '<span class="spinner"></span> Đang chờ ký…' : '✍ Ký bằng MetaMask'}</button></div>
        ${state.lastSignature ? `<div class="mm-out"><label>Chữ ký</label>${esc(state.lastSignature)}</div>` : ''}
        <p class="note">Chữ ký chứng minh bạn sở hữu khoá bí mật của địa chỉ này mà không cần tiết lộ khoá. Ký thông điệp không tốn phí gas.</p>
      </div>
      <div class="card">
        <div class="card-head"><h3>Gửi ETH thử nghiệm</h3><span class="chip warn">Chỉ testnet</span></div>
        ${sendCard}
        <p class="note">Mọi giao dịch đều phải được bạn xác nhận trong MetaMask. SepoliaETH có thể nhận miễn phí từ các faucet của mạng Sepolia.</p>
      </div>
    </div>
    ${logHtml()}`;
  }

  function renderView() {
    if (!ensureProvider()) return noProviderHtml();
    return state.account ? connectedHtml() : connectHtml();
  }

  async function run(task, okMessage) {
    try {
      await task();
      if (okMessage) api.toast(okMessage, 'ok');
    } catch (e) {
      const m = errMsg(e);
      log(m, 'bad');
      api.toast(m, 'bad');
      update();
    }
  }

  function bindView() {
    const on = function (id, fn) { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };

    on('mm-retry', function () {
      global.dispatchEvent(new Event('eip6963:requestProvider'));
      setTimeout(function () {
        if (ensureProvider()) silentReconnect();
        else api.toast('Vẫn chưa tìm thấy MetaMask.', 'bad');
        update();
      }, 300);
    });
    on('mm-connect', function () { run(connect); });
    on('mm-refresh', function () { run(function () { return refreshBalance(); }, 'Đã cập nhật số dư.'); });
    on('mm-sepolia', function () { run(switchToSepolia); });
    on('mm-sepolia2', function () { run(switchToSepolia); });
    on('mm-disconnect', function () { run(disconnect); });
    on('mm-link', function () {
      run(async function () {
        const w = linkToMiniChain();
        log('Đã thêm ví "' + w.name + '" vào MiniChain', 'ok');
        update();
      }, 'Đã liên kết ví MetaMask với MiniChain.');
    });

    const msg = document.getElementById('mm-msg');
    if (msg) msg.addEventListener('input', function () { state.msgDraft = msg.value; });
    on('mm-sign', function () {
      run(async function () {
        if (!state.msgDraft.trim()) throw new Error('Hãy nhập nội dung cần ký.');
        state.busy = 'sign';
        update();
        try {
          state.lastSignature = await signMessage(state.msgDraft);
          log('Đã ký thông điệp', 'ok');
        } finally {
          state.busy = '';
          update();
        }
      }, 'Đã ký thông điệp.');
    });

    const to = document.getElementById('mm-to');
    const amt = document.getElementById('mm-amt');
    if (to) to.addEventListener('input', function () { state.sendTo = to.value.trim(); });
    if (amt) amt.addEventListener('input', function () { state.sendAmt = amt.value.trim(); });
    on('mm-send', function () {
      run(async function () {
        state.busy = 'send';
        update();
        try {
          state.lastTxHash = await sendEth(state.sendTo, state.sendAmt);
          log('Đã gửi giao dịch ETH ' + short(state.lastTxHash), 'ok');
          setTimeout(function () { refreshBalance(); }, 5000);
        } finally {
          state.busy = '';
          update();
        }
      }, 'Đã gửi giao dịch – chờ mạng xác nhận.');
    });
  }

  /** app.js gọi hàm này để đăng ký màn hình "Ví MetaMask". */
  function install(appApi) {
    api = appApi;
    api.VIEWS.metamask = {
      title: 'Ví MetaMask',
      sub: 'Kết nối ví Ethereum qua tiện ích MetaMask: xem tài khoản, ký số và dùng trong MiniChain.',
      render: renderView,
      bind: bindView
    };
    const btn = document.getElementById('btn-mm');
    if (btn) {
      btn.addEventListener('click', function () {
        api.go('metamask');
        if (!state.account && !state.busy && ensureProvider()) run(connect);
      });
    }
    ensureProvider();
    renderTop();
    silentReconnect();
    // Một số tiện ích nạp provider chậm – thử lại sau khi trang tải xong.
    if (!state.provider) {
      setTimeout(function () {
        if (ensureProvider()) {
          silentReconnect();
          update();
        }
      }, 800);
    }
  }

  global.MetaMaskUI = {
    install: install,
    signTransaction: async function (tx) {
      try {
        return await signTransaction(tx);
      } catch (e) {
        throw new Error(errMsg(e));
      }
    },
    state: state
  };
})(window);
