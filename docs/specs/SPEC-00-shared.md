# SPEC-00 — Phần chung (A và B đều đọc)

Dự án: `minichain` (index.html + css/ + js/ + docs/).
Môn: **Blockchain**. Thực hiện cá nhân: **Đoàn Huy Đạt – MSSV CNTT2311046** (làm cả phần A và phần B).
Demo: https://dhdatcntt2311046-ops.github.io/minichain/ · Mã nguồn: https://github.com/dhdatcntt2311046-ops/minichain

- **Phần A** = lõi blockchain: SHA-256, ví, giao dịch, block, Proof-of-Work, luật mạng, kiểm tra chuỗi, quản trị → file `SPEC-A-chain-core.md`
- **Phần B** = giao diện, đăng nhập, các màn hình, MetaMask, trang quản trị → file `SPEC-B-frontend-wallet.md`

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
| Hash block | `SHA-256(index \| previousHash \| timestamp \| merkleRoot \| difficulty \| nonce)` |
| Độ khó | Số chữ số `0` ở đầu hash. Mạng tự điều chỉnh trong khoảng 3–5 |
| Thời gian | `Date.now()` (mili giây) |
| Lưu trữ | `localStorage`: `minichain.v2` (chuỗi), `minichain.session` (địa chỉ ví đang đăng nhập hoặc `admin`), `minichain.metamask` |
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
├── js/blockchain.js    # A – lõi blockchain
├── js/metamask.js      # B – kết nối MetaMask (EIP-1193, EIP-6963)
├── js/app.js           # B – điều khiển các màn hình
└── docs/specs/         # SPEC-00, SPEC-A, SPEC-B
```

Thứ tự nạp script: `sha256.js → blockchain.js → metamask.js → app.js`. Mỗi lần sửa CSS/JS phải tăng số `?v=` trong `index.html`.

---

## 3. Mô hình dữ liệu (`localStorage["minichain.v2"]`)

```json
{
  "chain": [Block], "pending": [Transaction], "wallets": [Wallet],
  "difficulty": 3, "reward": 50,
  "ruleHistory": [ { "from": 0, "rules": { …RULES } } ],
  "admin": { "username": "admin", "salt": "…", "pwHash": "…" },
  "adminLog": [ { "time": 0, "action": "…" } ]
}
```

| Đối tượng | Trường |
|---|---|
| Wallet | `name`, `address`, `salt`, `pwHash`, `created`, `metamask?`, `locked?` |
| Transaction | `id`, `from`, `to`, `amount`, `fee`, `note`, `time`, `signature?`, `signedMessage?`, `mint?`; coinbase có thêm `reward`, `fees` |
| Block | `index`, `timestamp`, `transactions`, `previousHash`, `merkleRoot`, `nonce`, `hash`, `difficulty`, `miner`, `minedIn`, `hashes` |

Dữ liệu mẫu (genesis + block #1): 4 ví An, Bình, Chi, Dũng mỗi ví 100 MC; block #1 do Chi đào (An → Bình 15 MC, Dũng → Chi 20 MC); 2 giao dịch đang chờ. Tổng cung ban đầu 450 MC.

---

## 4. Giao diện giữa A và B

### 4.1 `window.MiniChain` (A cài, B gọi)

`{ Blockchain, calcHash, merkleRoot, txHash, rewardAt, RULES, mineAsync, mineSync, ZERO_HASH, SYSTEM, DEMO_PASSWORD, ADMIN_USER, ADMIN_PASSWORD, addressFromKey }`

| Nhóm | Hàm của `Blockchain` |
|---|---|
| Tạo / nạp | `Blockchain.create()`, `Blockchain.from(json)` |
| Ví & đăng nhập | `addWallet(name, pw, confirm)`, `loginWithPassword`, `loginWithKey`, `findWallet` |
| Số dư | `balanceOf`, `pendingOutOf`, `availableOf`, `confirmationsOf` |
| Giao dịch & đào | `addTransaction(from, to, amount, note, fee)`, `sortedPending`, `selectForBlock`, `createCandidate(miner)`, `commitBlock(block)` |
| Luật mạng | `rules`, `rulesAt(h)`, `rewardAt(h)`, `nextReward`, `blocksToHalving`, `blocksToRetarget` |
| Kiểm tra | `validate()`, `isValid()`, `stats()` |
| Quản trị | `loginAdmin`, `changeAdminPassword`, `setWalletLocked`, `resetWalletPassword`, `mint`, `removePending`, `updateRules`, `log` |

### 4.2 `window.MetaMaskUI` (B cài trong `metamask.js`, `app.js` gọi)

`{ install(api), login(), signTransaction(tx), state }` – `install` đăng ký màn hình "Ví MetaMask"; `login` ký thông điệp đăng nhập; `signTransaction` ký giao dịch MC gửi từ ví MetaMask.

---

## 5. Mốc thực hiện (theo lịch sử commit)

| Ngày | Nội dung |
|---|---|
| 18/11/2026 | Khung `index.html`, SHA-256, lõi blockchain, CSS, các màn hình; sửa lỗi hiển thị trên điện thoại |
| 19/11/2026 (sáng sớm) | Tích hợp MetaMask: mô-đun kết nối, màn hình Ví MetaMask, ký giao dịch MC |
| 19/11/2026 (buổi sáng) | Sửa lỗi bộ nhớ đệm, tải chuỗi JSON, trang Hướng dẫn; đăng nhập ví; đào block theo luật mạng (phí, Merkle root, halving, độ khó tự điều chỉnh); tài khoản quản trị |

---

## 6. Nghiệm thu E2E

1. Mở demo → Tổng quan báo **Chuỗi hợp lệ**, tổng cung 450 MC.
2. Đăng nhập ví An (`123456`); thử sai mật khẩu → bị chặn.
3. Giao dịch: gửi 10 MC sang Bình, phí 0,5 → vào mempool; gửi vượt số dư → bị chặn.
4. Đào block → An nhận thưởng + phí; giao dịch phí cao được chọn trước; số xác nhận tăng.
5. Khám phá chuỗi → bật **Chế độ thử sửa dữ liệu**, sửa số tiền block #1 → Merkle root lệch, chuỗi báo đỏ, không đào được.
6. **Đào lại** block #1 → block #2 đứt liên kết → muốn gian lận phải đào lại cả chuỗi.
7. Ví MetaMask: đăng nhập bằng chữ ký, đào 1 block, gửi MC → MetaMask yêu cầu ký, giao dịch có nhãn "Đã ký".
8. Quản trị (`admin` / `admin123`): khoá ví → ví đó không đăng nhập được; cấp MC; đổi luật → block cũ vẫn hợp lệ; đặt lại dữ liệu.

Kiểm thử tự động: Playwright (trình duyệt headless) + ví MetaMask giả lập theo EIP-1193; giao diện không tràn ngang ở 1366 / 1024 / 768 / 390 px.
