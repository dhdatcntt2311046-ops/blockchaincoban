# SPEC-00 — Phần chung (A và B đều đọc)

Dự án: `minichain` (index.html + css/ + js/ + docs/).
Môn: **Blockchain**. Thực hiện cá nhân: **Đoàn Huy Đạt – MSSV CNTT2311046** (làm cả phần A và phần B).
Demo: https://dhdatcntt2311046-ops.github.io/minichain/ · Mã nguồn: https://github.com/dhdatcntt2311046-ops/minichain

- **Phần A** = lõi blockchain: SHA-256, ví, giao dịch, block, Proof-of-Work, luật mạng, điều kiện đào, dịch vụ tiền tệ, kiểm tra chuỗi, quản trị → file `SPEC-A-chain-core.md`
- **Phần B** = giao diện, đăng nhập, các màn hình, cửa hàng / thanh toán QR / đổi tiền / tiết kiệm, MetaMask, trang quản trị → file `SPEC-B-frontend-wallet.md`

---

## 1. Quy ước bắt buộc

| Mục | Quy ước |
|---|---|
| Đơn vị tiền | **MC**. Số tiền là số thực, làm tròn 8 chữ số thập phân |
| Hàm băm | SHA-256 tự cài đặt (`js/sha256.js`), kết quả dạng hex chữ thường 64 ký tự |
| Địa chỉ ví | `"0x" + SHA-256("minichain-pub:" + khoá bí mật)[0..40]`. Ví MetaMask dùng địa chỉ Ethereum thật, **lowercase** |
| Khoá bí mật | 32 byte ngẫu nhiên (64 hex). Chỉ hiện cho người dùng một lần, **không lưu** |
| Mật khẩu | Chỉ lưu `SHA-256(salt + ":" + mật khẩu)`, `salt` ngẫu nhiên. Tối thiểu 6 ký tự |
| `SYSTEM` | Địa chỉ đặc biệt phát hành MC: cấp vốn genesis, coinbase, cấp phát của quản trị viên |
| Ví hệ thống | **Quầy đổi tiền** (`system: "exchange"`) và **Quỹ tiết kiệm** (`system: "staking"`): không đăng nhập được, không nhận chuyển khoản trực tiếp, chỉ dùng qua dịch vụ |
| Mã dịch vụ | Đơn hàng `DH-xxxxxx`, hoá đơn `HD-xxxxxx`, lệnh đổi tiền `DT-xxxxxx`, khoản tiết kiệm `TK-xxxxxx` |
| Tiền pháp định | VND (0 chữ số thập phân), USD (2 chữ số) – tài khoản ngân hàng mô phỏng, không nằm trên chuỗi |
| Hash block | `SHA-256(index \| previousHash \| timestamp \| merkleRoot \| difficulty \| nonce)` |
| Độ khó | Số chữ số `0` ở đầu hash. Mạng tự điều chỉnh trong khoảng 3–5 |
| Thời gian | `Date.now()` (mili giây) |
| Lưu trữ | `localStorage`: `minichain.v3` (chuỗi), `minichain.session` (địa chỉ ví đang đăng nhập hoặc `admin`), `minichain.metamask` |
| Ngôn ngữ UI | Tiếng Việt |
| Tài khoản demo | Ví An, Bình, Chi, Dũng – mật khẩu `123456`. Quản trị – `admin` / `admin123` |
| An toàn | Không bao giờ hỏi/lưu seed phrase hay khoá MetaMask. Mọi chuỗi người dùng nhập đều escape trước khi chèn HTML |

---

## 2. Cấu trúc thư mục

```
minichain/
├── index.html          # khung trang, menu, thanh trên cùng; nạp CSS/JS kèm ?v=…
├── css/style.css       # giao diện tối, hộp thoại, responsive
├── js/sha256.js        # A – hàm băm SHA-256
├── js/qrcode.js        # B – tạo mã QR (tự cài đặt, Reed–Solomon)
├── js/blockchain.js    # A – lõi blockchain + dịch vụ tiền tệ + điều kiện đào
├── js/metamask.js      # B – kết nối MetaMask (EIP-1193, EIP-6963)
├── js/services.js      # B – màn hình Cửa hàng, Thanh toán, Đổi tiền, Tiết kiệm
├── js/app.js           # B – điều khiển các màn hình
└── docs/specs/         # SPEC-00, SPEC-A, SPEC-B
```

Thứ tự nạp script: `sha256.js → qrcode.js → blockchain.js → metamask.js → services.js → app.js`. Mỗi lần sửa CSS/JS phải tăng số `?v=` trong `index.html`.

---

## 3. Mô hình dữ liệu (`localStorage["minichain.v3"]`)

```json
{
  "chain": [Block], "pending": [Transaction], "wallets": [Wallet],
  "difficulty": 3, "reward": 50,
  "ruleHistory": [ { "from": 0, "rules": { …RULES } } ],
  "admin": { "username": "admin", "salt": "…", "pwHash": "…" },
  "adminLog": [ { "time": 0, "action": "…" } ],
  "products": [Product], "orders": [Order], "invoices": [Invoice],
  "fx": { "rates": { "VND": 23500, "USD": 1 }, "spread": 0.01 },
  "fiat": { "<địa chỉ>": { "VND": 0, "USD": 0 } }, "fxOrders": [FxOrder], "stakes": [Stake]
}
```

| Đối tượng | Trường |
|---|---|
| Wallet | `name`, `address`, `salt`, `pwHash`, `created`, `metamask?`, `locked?`, `system?` |
| Transaction | `id`, `from`, `to`, `amount`, `fee`, `note`, `time`, `signature?`, `signedMessage?`, `mint?`, `kind?` (`purchase` / `invoice` / `fx` / `stake` / `unstake`), `ref?` (mã dịch vụ); coinbase có thêm `reward`, `fees` |
| Block | `index`, `timestamp`, `transactions`, `previousHash`, `merkleRoot`, `nonce`, `hash`, `difficulty`, `miner`, `minedIn`, `hashes` |
| Product | `id`, `seller`, `icon`, `name`, `desc`, `price`, `stock`, `active` |
| Order | `id`, `txId`, `productId`, `name`, `qty`, `total`, `buyer`, `seller`, `cancelled?` |
| Invoice | `id`, `payee`, `payer?`, `amount`, `note`, `status` (`open` / `paid` / `cancelled`), `txId`, `paidBy` |
| FxOrder | `id`, `owner`, `dir` (`sell` / `buy`), `currency`, `mc`, `fiat`, `rate`, `txId`, `status` (`pending` / `done` / `cancelled`) |
| Stake | `id`, `owner`, `amount`, `blocks`, `rate`, `txId`, `withdrawTxId`, `early`, `status` |

Dữ liệu mẫu (genesis + block #1): 4 ví An, Bình, Chi, Dũng mỗi ví 100 MC, Quầy đổi tiền 1.000 MC, Quỹ tiết kiệm 500 MC; block #1 do Chi đào (An → Bình 15 MC, Dũng → Chi 20 MC); 2 giao dịch đang chờ. Tổng cung ban đầu 1.950 MC. Mỗi ví người dùng có 1.000.000 ₫ và $50; 4 sản phẩm mẫu (Chi bán sách, áo; Dũng bán cà phê, khoá học).

---

## 4. Giao diện giữa A và B

### 4.1 `window.MiniChain` (A cài, B gọi)

`{ Blockchain, calcHash, merkleRoot, txHash, rewardAt, RULES, mineAsync, mineSync, ZERO_HASH, SYSTEM, DEMO_PASSWORD, ADMIN_USER, ADMIN_PASSWORD, STAKE_PLANS, FIAT, addressFromKey }`

| Nhóm | Hàm của `Blockchain` |
|---|---|
| Tạo / nạp | `Blockchain.create()`, `Blockchain.from(json)` |
| Ví & đăng nhập | `addWallet(name, pw, confirm)`, `loginWithPassword`, `loginWithKey`, `findWallet` |
| Số dư | `balanceOf`, `pendingOutOf`, `availableOf`, `confirmationsOf` |
| Giao dịch & đào | `addTransaction(from, to, amount, note, fee, extra)`, `txState(id)`, `cancelPending(id, by)`, `dropPending(tx)`, `sortedPending`, `selectForBlock`, `miningChecks(miner)`, `createCandidate(miner)`, `commitBlock(block)` |
| Cửa hàng | `addProduct(seller, p)`, `removeProduct(seller, id)`, `buy(buyer, productId, qty, fee)` |
| Hoá đơn | `createInvoice(payee, amount, note, payer)`, `findInvoice(id)`, `payInvoice(payer, id, fee)`, `cancelInvoice(payee, id)` |
| Đổi tiền | `fiatOf`, `fxPrice(dir, cur)`, `fxQuote(dir, cur, mc)`, `sellMC(owner, cur, mc, fee)`, `buyMC(owner, cur, mc)`, `setFxRates(vnd, usd, spread%)` |
| Tiết kiệm | `stake(owner, amount, plan, fee)`, `stakeInfo(stake)`, `withdrawStake(owner, id)`, `systemWallet(kind)` |
| Luật mạng | `rules`, `rulesAt(h)`, `rewardAt(h)`, `nextReward`, `blocksToHalving`, `blocksToRetarget` |
| Kiểm tra | `validate()`, `isValid()`, `stats()` |
| Quản trị | `loginAdmin`, `changeAdminPassword`, `setWalletLocked`, `resetWalletPassword`, `mint`, `removePending`, `updateRules`, `log` |

### 4.2 `window.MetaMaskUI` (B cài trong `metamask.js`, `app.js` gọi)

`{ install(api), login(), signTransaction(tx), state }` – `install` đăng ký màn hình "Ví MetaMask"; `login` ký thông điệp đăng nhập; `signTransaction` ký giao dịch MC gửi từ ví MetaMask.

### 4.3 `window.ServicesUI` và `window.QRCode` (B)

- `ServicesUI.install(api)` đăng ký 4 màn hình `shop`, `invoices`, `exchange`, `staking`. Giao dịch dịch vụ gửi từ ví MetaMask cũng phải ký qua `MetaMaskUI.signTransaction`; từ chối ký → `dropPending` hoàn tác.
- `QRCode.svg(text, { size })` / `QRCode.matrix(text)` – mã QR byte mode, mức sửa lỗi M, phiên bản 1–10.

---

## 5. Mốc thực hiện (theo lịch sử commit)

| Ngày | Nội dung |
|---|---|
| 18/11/2026 | Khung `index.html`, SHA-256, lõi blockchain, CSS, các màn hình; sửa lỗi hiển thị trên điện thoại |
| 19/11/2026 (sáng sớm) | Tích hợp MetaMask: mô-đun kết nối, màn hình Ví MetaMask, ký giao dịch MC |
| 19/11/2026 (buổi sáng) | Sửa lỗi bộ nhớ đệm, tải chuỗi JSON, trang Hướng dẫn; đăng nhập ví; đào block theo luật mạng (phí, Merkle root, halving, độ khó tự điều chỉnh); tài khoản quản trị |
| 19/11/2026 (trưa) | Dịch vụ tiền tệ: cửa hàng, hoá đơn có mã QR, đổi MC ↔ VND/USD, gửi tiết kiệm có lãi; điều kiện đào block |

---

## 6. Nghiệm thu E2E

1. Mở demo → Tổng quan báo **Chuỗi hợp lệ**, tổng cung 1.950 MC.
2. Đăng nhập ví An (`123456`); thử sai mật khẩu → bị chặn.
3. Giao dịch: gửi 10 MC sang Bình, phí 0,5 → vào mempool; gửi vượt số dư → bị chặn.
4. Đào block → An nhận thưởng + phí; giao dịch phí cao được chọn trước; số xác nhận tăng. Mempool trống / ví dưới 10 MC / đào quá 3 block liên tiếp → nút đào bị khoá, bảng **Điều kiện đào block** chỉ rõ điều kiện chưa đạt.
5. Khám phá chuỗi → bật **Chế độ thử sửa dữ liệu**, sửa số tiền block #1 → Merkle root lệch, chuỗi báo đỏ, không đào được.
6. **Đào lại** block #1 → block #2 đứt liên kết → muốn gian lận phải đào lại cả chuỗi.
7. Ví MetaMask: đăng nhập bằng chữ ký, đào 1 block, gửi MC → MetaMask yêu cầu ký, giao dịch có nhãn "Đã ký".
8. Cửa hàng: mua sách của Chi → đơn "Chờ xác nhận"; huỷ giao dịch → tồn kho trả lại; đào block → đơn "Đã xác nhận", Chi nhận MC.
9. Thanh toán: An tạo hoá đơn 15 MC cho Bình → mã QR chứa `?pay=HD-…`; Bình mở đường dẫn → thanh toán → đào → "Đã thanh toán".
10. Đổi tiền: bán 10 MC → +232.650 ₫ sau khi đào; mua 2 MC → trừ $2,02 ngay, MC về ví sau khi đào.
11. Tiết kiệm: gửi 20 MC gói 5 block (2%) → đào 6 block → **Tất toán** nhận 20,4 MC.
12. Quản trị (`admin` / `admin123`): khoá ví → ví đó không đăng nhập được; cấp MC; đổi luật và điều kiện đào → block cũ vẫn hợp lệ; đổi tỷ giá; đặt lại dữ liệu.

Kiểm thử tự động: Playwright (trình duyệt headless) + ví MetaMask giả lập theo EIP-1193; giao diện không tràn ngang ở 1366 / 1024 / 768 / 390 px.
