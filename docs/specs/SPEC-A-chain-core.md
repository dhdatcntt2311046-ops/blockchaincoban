# SPEC-A — Lõi blockchain: SHA-256, ví, giao dịch, Proof-of-Work, luật mạng, điều kiện đào, dịch vụ tiền tệ, kiểm tra chuỗi, quản trị

Đọc kèm `SPEC-00-shared.md`. Người thực hiện: **Đoàn Huy Đạt**.

## Phạm vi sở hữu

- `js/sha256.js` – hàm băm SHA-256.
- `js/blockchain.js` – toàn bộ dữ liệu và thuật toán (kể cả dịch vụ tiền tệ và điều kiện đào); không phụ thuộc giao diện (chạy được cả trong Node.js).
- Hằng số luật mạng `RULES`, dữ liệu mẫu `Blockchain.create()`.

---

## 1. SHA-256

- Cài đặt theo chuẩn FIPS 180-4; hằng số K và H tính từ căn bậc hai / bậc ba của các số nguyên tố đầu tiên.
- `window.sha256(text) → hex`. Bản đồng bộ, đủ nhanh để thử hàng trăm nghìn nonce mỗi giây.

## 2. Ví

### 2.1 Tạo ví
- `addWallet(name, password, confirm)` → `{ wallet, privateKey }`.
- Tên 1–24 ký tự, không trùng (không phân biệt hoa thường); mật khẩu ≥ 6 ký tự, nhập lại phải khớp.
- Khoá bí mật 32 byte từ `crypto.getRandomValues`; `address = "0x" + SHA-256("minichain-pub:" + khoá)[0..40]`.

### 2.2 Đăng nhập
| Cách | Kiểm tra |
|---|---|
| Mật khẩu | tìm ví theo tên/địa chỉ, so `SHA-256(salt + ":" + mật khẩu)` với `pwHash` |
| Khoá bí mật | đúng 64 hex → tính lại địa chỉ → phải trùng một ví |
| MetaMask | do phần B ký `personal_sign`; ví MetaMask không có mật khẩu |

Ví `locked` không đăng nhập được, không gửi MC, không đào.

## 3. Giao dịch và mempool

- `addTransaction(from, to, amount, note, fee)`: số tiền > 0, phí 0–10 MC (mặc định 0,1), ví gửi ≠ ví nhận, `amount + fee ≤ availableOf(from)`.
- `balanceOf(a)` = tổng nhận − tổng (số tiền + phí) đã gửi, chỉ tính giao dịch trong block.
- `availableOf(a)` = `balanceOf(a)` − tổng (số tiền + phí) đang chờ → chống chi tiêu hai lần trong mempool.
- `confirmationsOf(i)` = chiều cao chuỗi − i + 1.

## 4. Block và Proof-of-Work

### 4.1 Merkle root và hash
```
txHash     = SHA-256( JSON(giao dịch) )
merkleRoot = băm ghép từng cặp txHash lên trên tới khi còn 1 hash (số lẻ thì nhân đôi phần tử cuối)
hash block = SHA-256( index | previousHash | timestamp | merkleRoot | difficulty | nonce )
```

### 4.2 Block ứng viên – `createCandidate(miner)`
- Chỉ tạo được khi mọi điều kiện của `miningChecks(miner)` đều đạt (mục 5.1); nếu không, báo lỗi "Chưa đủ điều kiện đào: …".
- Giao dịch đầu tiên là **coinbase** `SYSTEM → thợ đào`, `amount = reward + fees`.
- Sau đó tối đa `maxTxPerBlock` giao dịch, ưu tiên cấp phát của quản trị viên, rồi phí cao, rồi giao dịch cũ.

### 4.3 Đào – `mineAsync(block, { shouldStop, onProgress })`
- Thử `nonce = 0, 1, 2…` tới khi hash bắt đầu bằng `difficulty` chữ số 0.
- Chia thành lát ~25 ms (`setTimeout`) để giao diện không đứng; báo nonce, hash, số hash/giây; dừng được giữa chừng.
- Ghi `minedIn` (ms) và `hashes` (số lần thử) vào block.

### 4.4 Thêm block – `commitBlock(block)`
- `previousHash` phải khớp đỉnh chuỗi; xoá các giao dịch đã vào block khỏi mempool; cập nhật phần thưởng; gọi `retarget()`.

## 5. Luật mạng

| Luật (`RULES`) | Giá trị | Bitcoin thật |
|---|---|---|
| `initialReward` | 50 MC | 50 BTC |
| `halvingInterval` | 10 block | 210.000 block |
| `maxTxPerBlock` | 4 (không tính coinbase) | theo dung lượng block |
| `targetBlockMs` | 5.000 ms | ~10 phút |
| `adjustInterval` | 3 block | 2.016 block |
| `minDifficulty` – `maxDifficulty` | 3 – 5 | – |
| `defaultFee` | 0,1 MC | người gửi tự chọn |
| `minTxToMine` | 1 giao dịch | Bitcoin cho phép block rỗng |
| `minMinerBalance` | 10 MC | (giống tiền đặt cọc của Proof-of-Stake) |
| `maxConsecutiveBlocks` | 3 block | – |

- `rewardAt(h) = initialReward / 2^floor(h / halvingInterval)`.
- `retarget()`: sau mỗi `adjustInterval` block, trung bình `minedIn` < ½ mục tiêu → độ khó +1; > 2× mục tiêu → −1.
- Luật lưu theo phiên bản `ruleHistory = [{ from, rules }]`; `rulesAt(h)` trả luật áp dụng cho block `h`. Luật mới chỉ có hiệu lực từ block kế tiếp.

### 5.1 Điều kiện đào block – `miningChecks(miner)`

Trả về danh sách `{ key, ok, label, detail }`; giao diện hiện thành bảng kiểm.

| `key` | Điều kiện | Mục đích |
|---|---|---|
| `login` | Có ví thợ đào | Phần thưởng phải có chủ |
| `valid` | Chuỗi hiện tại hợp lệ | Không nối block vào chuỗi sai |
| `locked` | Ví không bị khoá, không phải ví hệ thống | Quản trị viên chặn được ví vi phạm |
| `mempool` | Mempool có ≥ `minTxToMine` giao dịch | Block phải chở giao dịch, không đào block rỗng lấy thưởng |
| `balance` | Số dư thợ đào ≥ `minMinerBalance` | Tiền đặt cọc: chống tạo ví rác để đào |
| `streak` | Ví chưa đào liên tiếp `maxConsecutiveBlocks` block | Chống một ví độc chiếm việc đào |

## 6. Kiểm tra chuỗi – `validate()`

Block `i` hợp lệ khi thoả cả 6 điều kiện:

| # | Điều kiện | Lý do báo khi sai |
|---|---|---|
| 1 | Merkle root tính lại = `merkleRoot`, hash tính lại = `hash` | Giao dịch / tiêu đề block đã bị thay đổi |
| 2 | `hash` bắt đầu bằng `difficulty` chữ số 0 | Chưa đạt độ khó |
| 3 | `previousHash` = hash block `i−1` (genesis: 64 số 0) | Liên kết bị đứt |
| 4 | Coinbase ≤ `rewardAt(i)` + tổng phí; chỉ coinbase / `mint` được từ `SYSTEM`; ≤ `maxTxPerBlock` | Vi phạm luật đồng thuận |
| 5 | Cộng dồn số dư từ block #0, không ví nào chi quá số MC đang có | Vi phạm luật số dư |
| 6 | Block có ≥ `minTxToMine` giao dịch người dùng; thợ đào có ≥ `minMinerBalance` trước block; chuỗi block liên tiếp của một ví ≤ `maxConsecutiveBlocks` (theo `rulesAt(i)`) | Vi phạm điều kiện đào block |

Bất biến: tổng số dư mọi ví = tổng MC phát hành (cấp vốn + thưởng + cấp phát); phí chỉ chuyển từ người gửi sang thợ đào.

## 7. Quản trị viên

| Hàm | Chức năng |
|---|---|
| `loginAdmin(user, pw)` / `changeAdminPassword(old, new, confirm)` | Mặc định `admin` / `admin123`, mật khẩu lưu dạng băm có muối |
| `setWalletLocked(addr, locked)` | Khoá ví (huỷ giao dịch chờ của ví) / mở khoá |
| `resetWalletPassword(addr, pw, confirm)` | Đặt mật khẩu mới (không áp dụng ví MetaMask) |
| `mint(addr, amount, note)` | Giao dịch `SYSTEM → ví`, `mint: true`, tối đa 10.000 MC/lần |
| `removePending(id)` | Xoá giao dịch khỏi mempool |
| `updateRules(changes, difficulty)` | Thêm phiên bản luật từ block kế tiếp, kiểm tra khoảng giá trị |

Mọi thao tác ghi vào `adminLog` (50 mục gần nhất).

## 8. Dịch vụ tiền tệ

Mọi dịch vụ chuyển MC bằng **giao dịch thật** (`addTransaction(…, extra)` gắn `kind`, `ref`), đi qua mempool, được đào vào block và kiểm tra số dư như giao dịch thường. Trạng thái dịch vụ suy ra từ `txState(txId)`: `pending` / `confirmed` (kèm số xác nhận) / `dropped`.

| Dịch vụ | Luồng MC | Ghi chú |
|---|---|---|
| Cửa hàng – `buy` | người mua → người bán, `price × qty` | Trừ tồn kho ngay; không mua hàng của chính mình |
| Hoá đơn – `payInvoice` | người trả → người tạo hoá đơn | Hoá đơn có thể chỉ định người trả; huỷ được khi chưa trả |
| Bán MC – `sellMC` | ví → Quầy đổi tiền | VND/USD cộng vào tài khoản **khi giao dịch được xác nhận** (`commitBlock`) |
| Mua MC – `buyMC` | Quầy đổi tiền → ví | Trừ VND/USD ngay; giá có chênh lệch `spread` (mặc định 1%) |
| Gửi tiết kiệm – `stake` | ví → Quỹ tiết kiệm | Kỳ hạn tính từ block chứa giao dịch gửi |
| Rút – `withdrawStake` | Quỹ tiết kiệm → ví | Đến hạn: gốc + lãi; trước hạn: chỉ gốc |

Gói tiết kiệm `STAKE_PLANS`: 5 block 2%, 10 block 5%, 20 block 12%.

**Hoàn tác** – `dropPending(tx)` (khi chủ ví huỷ, quản trị viên xoá giao dịch hoặc khoá ví): trả lại tồn kho và đánh dấu đơn huỷ, mở lại hoá đơn, hoàn VND/USD của lệnh mua MC, huỷ khoản gửi hoặc lệnh rút tiết kiệm.

## 9. Giới hạn

- Một nút mạng duy nhất (trình duyệt), không có mạng ngang hàng.
- Khoá bí mật chỉ dùng để đăng nhập (địa chỉ = hash của khoá), không phải chữ ký ECDSA.
- `minedIn` là dữ liệu đi kèm, không nằm trong tiêu đề block.

## 10. Tiến độ thực tế (A)

### Ngày 18/11 — Nền
- SHA-256, giao dịch, block, Proof-of-Work, kiểm tra chuỗi, dữ liệu mẫu.

### Ngày 19/11 — Mở rộng
- Ví có khoá bí mật & mật khẩu, đăng nhập; phí giao dịch, Merkle root, halving, độ khó tự điều chỉnh.
- Tài khoản quản trị, luật mạng theo phiên bản, khoá ví, cấp MC, luật số dư.
- Ví hệ thống, cửa hàng, hoá đơn, đổi tiền, tiết kiệm; điều kiện đào block trong `miningChecks` và `validate()`.

## 11. Tiêu chí hoàn thành của A

- [x] `Blockchain.create()` cho chuỗi hợp lệ, tổng cung 1.950 MC, tổng số dư = tổng cung.
- [x] Sửa bất kỳ giao dịch nào → `validate()` báo đúng block và lý do.
- [x] Đào lại block bị sửa → block kế tiếp đứt liên kết; chi vượt số dư vẫn bị phát hiện sau khi đào lại cả chuỗi.
- [x] Đổi luật mạng không làm block cũ mất hiệu lực.
- [x] Mempool trống, ví 0 MC, ví đã đào 3 block liên tiếp → không tạo được block; block rỗng ép vào chuỗi bị `validate()` báo vi phạm.
- [x] Mỗi dịch vụ chỉ được xác nhận khi giao dịch vào block; huỷ giao dịch thì dịch vụ được hoàn tác; tổng số dư vẫn = tổng cung.
- [x] Chạy được trong Node.js để kiểm thử độc lập với giao diện.
