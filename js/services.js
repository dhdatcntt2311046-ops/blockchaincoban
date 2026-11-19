/*
 * services.js – Các dịch vụ dùng tiền MC: Cửa hàng, Thanh toán (hoá đơn + mã QR), Đổi tiền, Tiết kiệm.
 * Mọi lần chuyển MC đều là giao dịch thật trên chuỗi (vào mempool, được đào vào block, kiểm tra số dư).
 * app.js gọi ServicesUI.install(api) để đăng ký 4 màn hình.
 */
(function (global) {
  'use strict';

  let api = null;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const FEES = [['0.01', 'Thấp · 0,01'], ['0.1', 'Thường · 0,1'], ['0.5', 'Nhanh · 0,5']];

  const bc = () => api.getBc();
  const fmtFiat = (n, cur) => cur === 'VND'
    ? Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 0 }) + ' ₫'
    : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /** Ký giao dịch nếu ví gửi là ví MetaMask; từ chối ký thì huỷ giao dịch và hoàn tác. */
  async function finalize(tx) {
    const chain = bc();
    const w = chain.wallets.find((x) => x.address === tx.from);
    if (!w || !w.metamask) return;
    chain.pending = chain.pending.filter((t) => t !== tx);
    try {
      if (!global.MetaMaskUI) throw new Error('Không tải được mô-đun MetaMask.');
      const signed = await global.MetaMaskUI.signTransaction(tx);
      tx.signature = signed.signature;
      tx.signedMessage = signed.message;
      chain.pending.push(tx);
    } catch (e) {
      chain.dropPending(tx);
      api.save();
      throw e;
    }
  }

  function txChip(txId) {
    const st = bc().txState(txId);
    if (st.status === 'pending') return '<span class="chip warn">Chờ xác nhận</span>';
    if (st.status === 'confirmed') return `<span class="chip ok">Đã xác nhận · ${st.confirmations}</span>`;
    return '<span class="chip bad">Đã huỷ</span>';
  }

  function feeField(id) {
    return `<div class="field"><label for="${id}">Phí giao dịch (MC)</label>
      <input class="input" id="${id}" type="number" min="0" max="10" step="any" value="${bc().rules.defaultFee}">
      <div class="amount-chips fee-chips">${FEES.map((f) => `<button type="button" data-fee-for="${id}" data-fee="${f[0]}">${f[1]}</button>`).join('')}</div></div>`;
  }
  function bindFeeChips(root) {
    $$('[data-fee-for]', root).forEach((b) => b.addEventListener('click', () => {
      const inp = $('#' + b.dataset.feeFor, root);
      inp.value = b.dataset.fee;
      inp.dispatchEvent(new Event('input'));
    }));
  }

  function table(head, rows, empty) {
    if (!rows.length) return `<div class="empty">${empty}</div>`;
    return `<div class="table-wrap"><table><thead><tr>${head.map((h) => `<th${h.startsWith('$') ? ' class="amt"' : ''}>${h.replace(/^\$/, '')}</th>`).join('')}</tr></thead>
      <tbody>${rows.join('')}</tbody></table></div>`;
  }

  async function run(task, okMsg) {
    try {
      const r = await task();
      api.save();
      if (okMsg) api.toast(typeof okMsg === 'function' ? okMsg(r) : okMsg, 'ok');
    } catch (e) {
      api.toast(e.message, 'bad');
    }
    api.render();
  }

  // =====================================================================
  // 1. CỬA HÀNG
  // =====================================================================
  const ICONS = ['📦', '📘', '👕', '☕', '🎓', '🎮', '🍜', '🎧', '💻', '🖊️'];

  function renderShop() {
    const chain = bc(), me = api.me(), esc = api.esc;
    const products = chain.products.filter((p) => p.active);
    const cards = products.map((p) => {
      const mine = me && me.address === p.seller;
      const action = !me ? '<button class="btn btn-sm" data-login="">Đăng nhập để mua</button>'
        : mine ? `<span class="chip accent">Sản phẩm của bạn</span><button class="btn btn-sm btn-ghost" data-unlist="${p.id}">Gỡ bán</button>`
          : p.stock < 1 ? '<span class="chip bad">Hết hàng</span>'
            : `<button class="btn btn-sm" data-buy="${p.id}">🛒 Mua</button>`;
      return `<div class="card product-card">
        <div class="product-icon">${esc(p.icon)}</div>
        <h4>${esc(p.name)}</h4>
        <p class="muted">${esc(p.desc || '')}</p>
        <div class="product-meta"><b class="product-price">${api.fmtAmt(p.price)}</b><span class="muted">Còn ${p.stock}</span></div>
        <div class="product-seller">Người bán: ${api.who(p.seller)}</div>
        <div class="actions">${action}</div>
      </div>`;
    }).join('');

    const sellForm = me ? `<form class="card" id="sp-form" autocomplete="off" novalidate>
        <div class="card-head"><h3>Đăng bán sản phẩm</h3><span class="hint">Người mua trả MC trực tiếp cho ví của bạn</span></div>
        <div class="field"><label>Biểu tượng</label><div class="icon-pick">${ICONS.map((ic, i) => `<label><input type="radio" name="sp-icon" value="${ic}" ${i ? '' : 'checked'}><span>${ic}</span></label>`).join('')}</div></div>
        <div class="field"><label for="sp-name">Tên sản phẩm</label><input class="input" id="sp-name" maxlength="40" placeholder="VD: Bánh mì"></div>
        <div class="field"><label for="sp-desc">Mô tả</label><input class="input" id="sp-desc" maxlength="100" placeholder="Mô tả ngắn"></div>
        <div class="field-grid">
          <div class="field"><label for="sp-price">Giá (MC)</label><input class="input" id="sp-price" type="number" min="0" step="any" placeholder="10"></div>
          <div class="field"><label for="sp-stock">Số lượng</label><input class="input" id="sp-stock" type="number" min="1" max="999" value="1"></div>
        </div>
        <div class="form-error" id="sp-error"></div>
        <button class="btn btn-block" type="submit">Đăng bán</button>
      </form>` : '';

    let orders = '';
    if (me) {
      const bought = chain.orders.filter((o) => o.buyer === me.address).slice().reverse();
      const sold = chain.orders.filter((o) => o.seller === me.address).slice().reverse();
      const row = (o, other) => `<tr><td class="mono muted">${o.id}</td><td>${api.esc(o.icon)} ${api.esc(o.name)}</td><td>${o.qty}</td>
        <td class="amt">${api.fmtAmt(o.total)}</td><td>${api.who(other)}</td><td>${o.cancelled ? '<span class="chip bad">Đã huỷ</span>' : txChip(o.txId)}</td></tr>`;
      orders = `<div class="grid halves">
        <div class="card"><div class="card-head"><h3>Đơn mua của tôi</h3><span class="hint">${bought.length} đơn</span></div>
          ${table(['Mã đơn', 'Sản phẩm', 'SL', '$Tổng', 'Người bán', 'Trạng thái'], bought.map((o) => row(o, o.seller)), 'Chưa mua gì.')}</div>
        <div class="card"><div class="card-head"><h3>Đơn bán của tôi</h3><span class="hint">${sold.length} đơn</span></div>
          ${table(['Mã đơn', 'Sản phẩm', 'SL', '$Tổng', 'Người mua', 'Trạng thái'], sold.map((o) => row(o, o.buyer)), 'Chưa bán được đơn nào.')}</div>
      </div>`;
    }

    return `<div class="banner info"><div class="b-icon">🛒</div><div><b>Mua bán bằng MC</b>
        <p>Mỗi đơn hàng là một giao dịch từ ví người mua sang ví người bán. Đơn chỉ "Đã xác nhận" khi giao dịch được đào vào block.</p></div></div>
      <div class="grid products">${cards || '<div class="card empty">Chưa có sản phẩm nào.</div>'}</div>
      ${sellForm}
      ${orders}`;
  }

  function bindShop() {
    const chain = bc();
    $$('[data-buy]').forEach((b) => b.addEventListener('click', () => openBuy(b.dataset.buy)));
    $$('[data-unlist]').forEach((b) => b.addEventListener('click', () => run(() => chain.removeProduct(api.me().address, b.dataset.unlist), 'Đã gỡ sản phẩm.')));
    const form = $('#sp-form');
    if (form) form.addEventListener('submit', (e) => {
      e.preventDefault();
      try {
        const p = chain.addProduct(api.me().address, {
          icon: ($('input[name=sp-icon]:checked') || {}).value, name: $('#sp-name').value, desc: $('#sp-desc').value,
          price: $('#sp-price').value, stock: $('#sp-stock').value
        });
        api.save();
        api.toast('Đã đăng bán "' + p.name + '".', 'ok');
        api.render();
      } catch (err) { $('#sp-error').textContent = err.message; }
    });
  }

  function openBuy(id) {
    const chain = bc(), esc = api.esc;
    const p = chain.products.find((x) => x.id === id);
    if (!p) return;
    api.openModal(`<div class="modal-head"><h3>${esc(p.icon)} Mua "${esc(p.name)}"</h3><button class="icon-btn" data-close aria-label="Đóng">✕</button></div>
      <form id="by-form" autocomplete="off" novalidate>
        <div class="kv"><span>Giá</span><b>${api.fmtAmt(p.price)}</b></div>
        <div class="kv"><span>Người bán</span><b>${esc(chain.nameOf(p.seller))}</b></div>
        <div class="field"><label for="by-qty">Số lượng (còn ${p.stock})</label><input class="input" id="by-qty" type="number" min="1" max="${p.stock}" value="1"></div>
        ${feeField('by-fee')}
        <div class="kv total"><span>Tổng trừ khỏi ví</span><b id="by-total">—</b></div>
        <div class="kv"><span>Số dư khả dụng</span><b>${api.fmtAmt(chain.availableOf(api.me().address))}</b></div>
        <div class="form-error" id="by-error"></div>
        <button class="btn btn-block" type="submit">Xác nhận mua</button>
      </form>`, (root) => {
      bindFeeChips(root);
      const total = () => { $('#by-total', root).textContent = api.fmtAmt(p.price * (Number($('#by-qty', root).value) || 0) + (Number($('#by-fee', root).value) || 0)); };
      $('#by-qty', root).addEventListener('input', total);
      $('#by-fee', root).addEventListener('input', total);
      total();
      $('#by-form', root).addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = $('button[type=submit]', root);
        try {
          btn.disabled = true;
          const o = chain.buy(api.me().address, p.id, $('#by-qty', root).value, $('#by-fee', root).value);
          const tx = chain.pending.find((t) => t.id === o.txId);
          if (tx) await finalize(tx);
          api.save();
          api.closeModal();
          api.toast('Đã đặt đơn ' + o.id + ' – chờ đào vào block để xác nhận.', 'ok');
          api.render();
        } catch (err) {
          btn.disabled = false;
          const el = $('#by-error', root);
          if (el) el.textContent = err.message;
          api.render();
        }
      });
    });
  }

  // =====================================================================
  // 2. THANH TOÁN (hoá đơn + mã QR)
  // =====================================================================
  function payLink(inv) {
    const base = global.location.href.split('?')[0].split('#')[0];
    return base + '?pay=' + encodeURIComponent(inv.id);
  }

  function invStatus(inv) {
    if (inv.status === 'open') return '<span class="chip">Chưa thanh toán</span>';
    if (inv.status === 'cancelled') return '<span class="chip bad">Đã huỷ</span>';
    return txChip(inv.txId).replace('Chờ xác nhận', 'Đã trả · chờ xác nhận').replace('Đã xác nhận', 'Đã thanh toán');
  }

  function renderInvoices() {
    const chain = bc(), me = api.me(), esc = api.esc;
    if (!me) return api.loginGate('tạo hoặc thanh toán hoá đơn');
    const others = chain.wallets.filter((w) => w.address !== me.address && !w.system);
    const mine = chain.invoices.filter((i) => i.payee === me.address).slice().reverse();
    const toMe = chain.invoices.filter((i) => i.payer === me.address || i.paidBy === me.address).slice().reverse();
    const prefill = api.ui.payCode || '';

    return `<div class="grid halves">
      <form class="card" id="iv-form" autocomplete="off" novalidate>
        <div class="card-head"><h3>Tạo hoá đơn</h3><span class="hint">Người trả quét mã QR hoặc nhập mã hoá đơn</span></div>
        <div class="field"><label for="iv-amount">Số tiền (MC)</label><input class="input" id="iv-amount" type="number" min="0" step="any" placeholder="10"></div>
        <div class="field"><label for="iv-note">Nội dung</label><input class="input" id="iv-note" maxlength="60" placeholder="VD: Tiền ăn trưa"></div>
        <div class="field"><label for="iv-payer">Người phải trả</label><select class="select" id="iv-payer">
          <option value="">Bất kỳ ai có mã</option>${others.map((w) => `<option value="${w.address}">${esc(w.name)}</option>`).join('')}</select></div>
        <div class="form-error" id="iv-error"></div>
        <button class="btn btn-block" type="submit">Tạo hoá đơn + mã QR</button>
      </form>
      <form class="card" id="pc-form" autocomplete="off" novalidate>
        <div class="card-head"><h3>Thanh toán theo mã</h3></div>
        <div class="field"><label for="pc-code">Mã hoá đơn</label><input class="input mono" id="pc-code" placeholder="HD-XXXXXX" value="${esc(prefill)}"></div>
        <div class="form-error" id="pc-error"></div>
        <button class="btn btn-block" type="submit">Tìm hoá đơn</button>
        <p class="note">Quét mã QR bằng điện thoại sẽ mở MiniChain với mã hoá đơn điền sẵn.</p>
      </form>
    </div>
    <div class="card"><div class="card-head"><h3>Hoá đơn cần tôi trả</h3><span class="hint">${toMe.length} hoá đơn</span></div>
      ${table(['Mã', 'Người nhận', '$Số tiền', 'Nội dung', 'Trạng thái', ''], toMe.map((i) => `<tr><td class="mono">${i.id}</td><td>${api.who(i.payee)}</td>
        <td class="amt">${api.fmtAmt(i.amount)}</td><td class="muted">${esc(i.note || '—')}</td><td>${invStatus(i)}</td>
        <td>${i.status === 'open' ? `<button class="btn btn-sm" data-pay="${i.id}">Thanh toán</button>` : ''}</td></tr>`), 'Không có hoá đơn nào gửi cho bạn.')}</div>
    <div class="card"><div class="card-head"><h3>Hoá đơn tôi đã tạo</h3><span class="hint">${mine.length} hoá đơn</span></div>
      ${table(['Mã', 'Người trả', '$Số tiền', 'Nội dung', 'Trạng thái', ''], mine.map((i) => `<tr><td class="mono">${i.id}</td>
        <td>${i.payer ? api.who(i.payer) : i.paidBy ? api.who(i.paidBy) : '<span class="muted">Bất kỳ ai</span>'}</td>
        <td class="amt">${api.fmtAmt(i.amount)}</td><td class="muted">${esc(i.note || '—')}</td><td>${invStatus(i)}</td>
        <td><div class="row-actions"><button class="btn btn-sm btn-ghost" data-qr="${i.id}">Mã QR</button>
          ${i.status === 'open' ? `<button class="btn btn-sm btn-ghost" data-iv-cancel="${i.id}">Huỷ</button>` : ''}</div></td></tr>`), 'Bạn chưa tạo hoá đơn nào.')}</div>`;
  }

  function bindInvoices() {
    const chain = bc();
    const form = $('#iv-form');
    if (!form) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      try {
        const inv = chain.createInvoice(api.me().address, $('#iv-amount').value, $('#iv-note').value, $('#iv-payer').value);
        api.save();
        api.render();
        openQR(inv.id);
      } catch (err) { $('#iv-error').textContent = err.message; }
    });
    $('#pc-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const inv = chain.findInvoice($('#pc-code').value);
      if (!inv) { $('#pc-error').textContent = 'Không tìm thấy hoá đơn có mã này.'; return; }
      api.ui.payCode = '';
      openPay(inv.id);
    });
    $$('[data-pay]').forEach((b) => b.addEventListener('click', () => openPay(b.dataset.pay)));
    $$('[data-qr]').forEach((b) => b.addEventListener('click', () => openQR(b.dataset.qr)));
    $$('[data-iv-cancel]').forEach((b) => b.addEventListener('click', () => run(() => chain.cancelInvoice(api.me().address, b.dataset.ivCancel), 'Đã huỷ hoá đơn.')));
    if (api.ui.payCode && chain.findInvoice(api.ui.payCode)) {
      const code = api.ui.payCode;
      api.ui.payCode = '';
      openPay(code);
    }
  }

  function openQR(id) {
    const chain = bc(), esc = api.esc;
    const inv = chain.findInvoice(id);
    if (!inv) return;
    const link = payLink(inv);
    let qr = '';
    try { qr = global.QRCode.svg(link, { size: 220 }); } catch (e) { qr = '<p class="muted">Không tạo được mã QR.</p>'; }
    api.openModal(`<div class="modal-head"><h3>Hoá đơn ${inv.id}</h3><button class="icon-btn" data-close aria-label="Đóng">✕</button></div>
      <div class="qr-box">${qr}</div>
      <div class="kv"><span>Người nhận</span><b>${esc(chain.nameOf(inv.payee))}</b></div>
      <div class="kv"><span>Số tiền</span><b>${api.fmtAmt(inv.amount)}</b></div>
      <div class="kv"><span>Nội dung</span><b>${esc(inv.note || '—')}</b></div>
      <div class="kv"><span>Trạng thái</span><b>${invStatus(inv)}</b></div>
      <div class="field" style="margin-top:12px"><label>Đường dẫn thanh toán</label><div class="mm-addr" id="qr-link">${esc(link)}</div></div>
      <div class="btn-row"><button class="btn btn-ghost" type="button" data-copy="${esc(inv.id)}">Sao chép mã ${inv.id}</button></div>
      <p class="note">Mã QR chứa đường dẫn mở MiniChain với hoá đơn này. Dữ liệu MiniChain lưu riêng trong từng trình duyệt, nên người trả cần dùng cùng trình duyệt / máy với dữ liệu chuỗi này.</p>`);
  }

  function openPay(id) {
    const chain = bc(), esc = api.esc, me = api.me();
    const inv = chain.findInvoice(id);
    if (!inv) return;
    const canPay = inv.status === 'open' && me && inv.payee !== me.address && (!inv.payer || inv.payer === me.address);
    api.openModal(`<div class="modal-head"><h3>Thanh toán ${inv.id}</h3><button class="icon-btn" data-close aria-label="Đóng">✕</button></div>
      <form id="pay-form" autocomplete="off" novalidate>
        <div class="kv"><span>Người nhận</span><b>${esc(chain.nameOf(inv.payee))}</b></div>
        <div class="kv"><span>Số tiền</span><b>${api.fmtAmt(inv.amount)}</b></div>
        <div class="kv"><span>Nội dung</span><b>${esc(inv.note || '—')}</b></div>
        <div class="kv"><span>Trạng thái</span><b>${invStatus(inv)}</b></div>
        ${canPay ? feeField('pay-fee') + `<div class="kv"><span>Số dư khả dụng</span><b>${api.fmtAmt(chain.availableOf(me.address))}</b></div>` : ''}
        <div class="form-error" id="pay-error">${canPay ? '' : inv.status !== 'open' ? 'Hoá đơn này không còn chờ thanh toán.' : inv.payee === me.address ? 'Đây là hoá đơn của chính bạn.' : 'Hoá đơn này dành cho ví khác.'}</div>
        ${canPay ? '<button class="btn btn-block" type="submit">Thanh toán</button>' : ''}
      </form>`, (root) => {
      bindFeeChips(root);
      const f = $('#pay-form', root);
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = $('button[type=submit]', root);
        try {
          btn.disabled = true;
          chain.payInvoice(me.address, inv.id, $('#pay-fee', root).value);
          const tx = chain.pending.find((t) => t.id === inv.txId);
          if (tx) await finalize(tx);
          api.save();
          api.closeModal();
          api.toast('Đã thanh toán ' + inv.id + ' – chờ đào vào block để xác nhận.', 'ok');
          api.render();
        } catch (err) {
          btn.disabled = false;
          const el = $('#pay-error', root);
          if (el) el.textContent = err.message;
          api.render();
        }
      });
    });
  }

  // =====================================================================
  // 3. ĐỔI TIỀN MC ↔ VND / USD
  // =====================================================================
  function renderExchange() {
    const chain = bc(), me = api.me();
    const ex = chain.systemWallet('exchange');
    const rateCard = (cur) => `<div class="card stat" style="--glow:rgba(45,212,191,.14)">
        <div class="label">1 MC = ${cur}</div>
        <div class="value">${fmtFiat(chain.fx.rates[cur], cur)}</div>
        <div class="foot">Quầy mua MC: ${fmtFiat(chain.fxPrice('sell', cur), cur)} · Quầy bán MC: ${fmtFiat(chain.fxPrice('buy', cur), cur)}</div>
      </div>`;
    const head = `<div class="grid stats">
        ${rateCard('VND')}${rateCard('USD')}
        ${api.statCard('Dự trữ của quầy', api.fmtAmt(chain.availableOf(ex.address)), 'MC sẵn sàng bán cho bạn', 'rgba(124,140,255,.16)')}
        ${api.statCard('Chênh lệch mua – bán', (chain.fx.spread * 100).toLocaleString('vi-VN') + '%', 'Lợi nhuận của quầy đổi tiền', 'rgba(251,191,36,.16)')}
      </div>`;
    if (!me) return head + api.loginGate('đổi MC lấy VND/USD');
    const fiat = chain.fiatOf(me.address);
    const orders = chain.fxOrders.filter((o) => o.owner === me.address).slice().reverse();
    const stateChip = (o) => o.status === 'done' ? '<span class="chip ok">Hoàn tất</span>' : o.status === 'cancelled' ? '<span class="chip bad">Đã huỷ</span>' : '<span class="chip warn">Chờ xác nhận</span>';

    return `${head}
      <div class="grid halves">
        <div class="card">
          <div class="card-head"><h3>Tài khoản của tôi</h3><span class="hint">VND/USD là tài khoản ngân hàng mô phỏng</span></div>
          <div class="kv"><span>MC khả dụng</span><b>${api.fmtAmt(chain.availableOf(me.address))}</b></div>
          <div class="kv"><span>VND</span><b id="fx-vnd">${fmtFiat(fiat.VND, 'VND')}</b></div>
          <div class="kv"><span>USD</span><b id="fx-usd">${fmtFiat(fiat.USD, 'USD')}</b></div>
          <p class="note">Bán MC: chuyển MC tới "Quầy đổi tiền" trên chuỗi, tiền VND/USD về tài khoản <b>sau khi giao dịch được đào vào block</b>.
            Mua MC: trừ VND/USD ngay, quầy gửi MC cho bạn qua một giao dịch; MC về ví khi giao dịch được xác nhận.</p>
        </div>
        <form class="card" id="fx-form" autocomplete="off" novalidate>
          <div class="card-head"><h3>Đổi tiền</h3></div>
          <div class="tabs two">
            <label class="tab-radio"><input type="radio" name="fx-dir" value="sell" checked><span>Bán MC → nhận tiền</span></label>
            <label class="tab-radio"><input type="radio" name="fx-dir" value="buy"><span>Mua MC bằng tiền</span></label>
          </div>
          <div class="field-grid">
            <div class="field"><label for="fx-mc">Số MC</label><input class="input" id="fx-mc" type="number" min="0" step="any" placeholder="10"></div>
            <div class="field"><label for="fx-cur">Loại tiền</label><select class="select" id="fx-cur"><option value="VND">VND</option><option value="USD">USD</option></select></div>
          </div>
          <div id="fx-fee-wrap">${feeField('fx-fee')}</div>
          <div class="kv total"><span id="fx-est-label">Bạn nhận được</span><b id="fx-est">—</b></div>
          <div class="form-error" id="fx-error"></div>
          <button class="btn btn-block" type="submit">Đổi tiền</button>
        </form>
      </div>
      <div class="card"><div class="card-head"><h3>Lịch sử đổi tiền</h3><span class="hint">${orders.length} lệnh</span></div>
        ${table(['Mã', 'Loại', '$MC', '$Số tiền', '$Giá 1 MC', 'Trạng thái'], orders.map((o) => `<tr><td class="mono">${o.id}</td>
          <td>${o.dir === 'sell' ? 'Bán MC' : 'Mua MC'}</td><td class="amt">${api.fmtAmt(o.mc)}</td><td class="amt">${fmtFiat(o.fiat, o.currency)}</td>
          <td class="amt">${fmtFiat(o.rate, o.currency)}</td><td>${stateChip(o)}</td></tr>`), 'Chưa có lệnh đổi tiền nào.')}</div>`;
  }

  function bindExchange() {
    const chain = bc();
    const form = $('#fx-form');
    if (!form) return;
    bindFeeChips(form);
    const dir = () => ($('input[name=fx-dir]:checked') || {}).value;
    const est = () => {
      const d = dir(), cur = $('#fx-cur').value;
      $('#fx-fee-wrap').hidden = d !== 'sell';
      $('#fx-est-label').textContent = d === 'sell' ? 'Bạn nhận được' : 'Bạn phải trả';
      try { $('#fx-est').textContent = fmtFiat(chain.fxQuote(d, cur, $('#fx-mc').value).fiat, cur); } catch (e) { $('#fx-est').textContent = '—'; }
    };
    $$('input[name=fx-dir]').forEach((r) => r.addEventListener('change', est));
    $('#fx-mc').addEventListener('input', est);
    $('#fx-cur').addEventListener('change', est);
    est();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button[type=submit]', form);
      try {
        btn.disabled = true;
        const me = api.me().address, cur = $('#fx-cur').value, mc = $('#fx-mc').value;
        let o;
        if (dir() === 'sell') {
          o = chain.sellMC(me, cur, mc, $('#fx-fee').value);
          const tx = chain.pending.find((t) => t.id === o.txId);
          if (tx) await finalize(tx);
        } else {
          o = chain.buyMC(me, cur, mc);
        }
        api.save();
        api.toast((o.dir === 'sell' ? 'Đã bán ' : 'Đã mua ') + o.mc + ' MC (' + fmtFiat(o.fiat, o.currency) + ') – chờ đào vào block.', 'ok');
        api.render();
      } catch (err) {
        btn.disabled = false;
        $('#fx-error').textContent = err.message;
      }
    });
  }

  // =====================================================================
  // 4. TIẾT KIỆM
  // =====================================================================
  const STATE = {
    pending: ['warn', 'Chờ xác nhận'], active: ['accent', 'Đang gửi'], matured: ['ok', 'Đến hạn'],
    withdrawing: ['warn', 'Đang rút'], withdrawn: ['', 'Đã rút'], cancelled: ['bad', 'Đã huỷ']
  };

  function renderStaking() {
    const chain = bc(), me = api.me();
    const pool = chain.systemWallet('staking');
    const plans = global.MiniChain.STAKE_PLANS;
    const planCards = plans.map((p, i) => `<label class="card plan-card"><input type="radio" name="st-plan" value="${i}" ${i === 1 ? 'checked' : ''}>
        <div class="plan-name">${p.name}</div><div class="plan-rate">${(p.rate * 100).toLocaleString('vi-VN')}%</div>
        <div class="muted">Khoá ${p.blocks} block</div></label>`).join('');
    const head = `<div class="banner info"><div class="b-icon">🏦</div><div><b>Gửi tiết kiệm theo block</b>
        <p>Gửi MC vào "Quỹ tiết kiệm" trong một số block. Kỳ hạn tính từ block chứa giao dịch gửi. Đến hạn rút được gốc + lãi; rút trước hạn chỉ nhận lại gốc.
        Quỹ đang có ${api.fmtAmt(chain.availableOf(pool.address))} để chi trả.</p></div></div>`;
    if (!me) return head + `<div class="grid plans">${planCards}</div>` + api.loginGate('gửi tiết kiệm');
    const list = chain.stakes.filter((s) => s.owner === me.address).slice().reverse();
    const rows = list.map((s) => {
      const info = chain.stakeInfo(s);
      const [cls, label] = STATE[info.state];
      const progress = info.state === 'active' ? ` · còn ${info.left} block` : '';
      const action = info.state === 'matured' ? `<button class="btn btn-sm" data-unstake="${s.id}">Tất toán</button>`
        : info.state === 'active' ? `<button class="btn btn-sm btn-ghost" data-unstake="${s.id}" data-early="1">Rút trước hạn</button>` : '';
      return `<tr><td class="mono">${s.id}</td><td class="amt">${api.fmtAmt(s.amount)}</td><td>${s.blocks} block · ${(s.rate * 100).toLocaleString('vi-VN')}%</td>
        <td class="amt">${api.fmtAmt(info.interest)}</td><td>${info.start !== undefined ? '#' + info.start + ' → #' + info.maturity : '—'}</td>
        <td><span class="chip ${cls}">${label}${progress}</span>${s.early && info.state !== 'active' ? ' <span class="muted">(trước hạn)</span>' : ''}</td><td>${action}</td></tr>`;
    });
    return `${head}
      <form class="card" id="st-form" autocomplete="off" novalidate>
        <div class="card-head"><h3>Gửi tiết kiệm</h3><span class="hint">Khả dụng: ${api.fmtAmt(chain.availableOf(me.address))}</span></div>
        <div class="grid plans">${planCards}</div>
        <div class="field-grid">
          <div class="field"><label for="st-amount">Số MC gửi</label><input class="input" id="st-amount" type="number" min="1" step="any" placeholder="20"></div>
          <div>${feeField('st-fee')}</div>
        </div>
        <div class="kv total"><span>Lãi khi đến hạn</span><b id="st-est">—</b></div>
        <div class="form-error" id="st-error"></div>
        <button class="btn btn-block" type="submit">Gửi tiết kiệm</button>
      </form>
      <div class="card"><div class="card-head"><h3>Khoản tiết kiệm của tôi</h3><span class="hint">Chiều cao chuỗi hiện tại: #${chain.latest.index}</span></div>
        ${table(['Mã', '$Gốc', 'Kỳ hạn', '$Lãi', 'Block bắt đầu → đáo hạn', 'Trạng thái', ''], rows, 'Bạn chưa gửi tiết kiệm.')}</div>`;
  }

  function bindStaking() {
    const chain = bc();
    const form = $('#st-form');
    if (!form) return;
    bindFeeChips(form);
    const plans = global.MiniChain.STAKE_PLANS;
    const est = () => {
      const p = plans[Number(($('input[name=st-plan]:checked') || {}).value)];
      const a = Number($('#st-amount').value) || 0;
      $('#st-est').textContent = p ? api.fmtAmt(Math.round(a * p.rate * 1e8) / 1e8) + ' sau ' + p.blocks + ' block' : '—';
    };
    $$('input[name=st-plan]').forEach((r) => r.addEventListener('change', est));
    $('#st-amount').addEventListener('input', est);
    est();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button[type=submit]', form);
      try {
        btn.disabled = true;
        const s = chain.stake(api.me().address, $('#st-amount').value, ($('input[name=st-plan]:checked') || {}).value, $('#st-fee').value);
        const tx = chain.pending.find((t) => t.id === s.txId);
        if (tx) await finalize(tx);
        api.save();
        api.toast('Đã gửi tiết kiệm ' + s.id + ' – kỳ hạn bắt đầu khi giao dịch được đào vào block.', 'ok');
        api.render();
      } catch (err) {
        btn.disabled = false;
        $('#st-error').textContent = err.message;
      }
    });
    $$('[data-unstake]').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.early && !global.confirm('Rút trước hạn sẽ không nhận được lãi. Tiếp tục?')) return;
      run(() => chain.withdrawStake(api.me().address, b.dataset.unstake),
        (r) => (r.early ? 'Đã rút trước hạn ' : 'Đã tất toán ') + api.fmtAmt(r.payout) + ' – MC về ví khi giao dịch được đào vào block.');
    }));
  }

  function install(a) {
    api = a;
    Object.assign(a.VIEWS, {
      shop: { title: 'Cửa hàng', sub: 'Mua bán bằng MC – mỗi đơn hàng là một giao dịch trên chuỗi.', render: renderShop, bind: bindShop },
      invoices: { title: 'Thanh toán', sub: 'Tạo hoá đơn kèm mã QR, thanh toán hoá đơn bằng MC.', render: renderInvoices, bind: bindInvoices },
      exchange: { title: 'Đổi tiền', sub: 'Đổi MC lấy VND/USD (và ngược lại) tại quầy đổi tiền theo tỷ giá.', render: renderExchange, bind: bindExchange },
      staking: { title: 'Tiết kiệm', sub: 'Gửi MC có kỳ hạn tính bằng block để nhận lãi.', render: renderStaking, bind: bindStaking }
    });
  }

  global.ServicesUI = { install: install, fmtFiat: fmtFiat };
})(window);
