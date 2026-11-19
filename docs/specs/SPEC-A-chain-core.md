# SPEC-A — Lõi blockchain: SHA-256, ví, giao dịch, Proof-of-Work, luật mạng, kiểm tra chuỗi, quản trị

Đọc kèm `SPEC-00-shared.md`. Người thực hiện: **Đoàn Huy Đạt**.

## Phạm vi sở hữu

- `js/sha256.js` – hàm băm SHA-256.
- `js/blockchain.js` – toàn bộ dữ liệu và thuật toán; không phụ thuộc giao diện (chạy được cả trong Node.js).
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

- `rewardAt(h) = initialReward / 2^floor(h / halvingInterval)`.
- `retarget()`: sau mỗi `adjustInterval` block, trung bình `minedIn` < ½ mục tiêu → độ khó +1; > 2× mục tiêu → −1.
- Luật lưu theo phiên bản `ruleHistory = [{ from, rules }]`; `rulesAt(h)` trả luật áp dụng cho block `h`. Luật mới chỉ có hiệu lực từ block kế tiếp.

## 6. Kiểm tra chuỗi – `validate()`

Block `i` hợp lệ khi thoả cả 5 điều kiện:

| # | Điều kiện | Lý do báo khi sai |
|---|---|---|
| 1 | Merkle root tính lại = `merkleRoot`, hash tính lại = `hash` | Giao dịch / tiêu đề block đã bị thay đổi |
| 2 | `hash` bắt đầu bằng `difficulty` chữ số 0 | Chưa đạt độ khó |
| 3 | `previousHash` = hash block `i−1` (genesis: 64 số 0) | Liên kết bị đứt |
| 4 | Coinbase ≤ `rewardAt(i)` + tổng phí; chỉ coinbase / `mint` được từ `SYSTEM`; ≤ `maxTxPerBlock` | Vi phạm luật đồng thuận |
| 5 | Cộng dồn số dư từ block #0, không ví nào chi quá số MC đang có | Vi phạm luật số dư |

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

## 8. Giới hạn

- Một nút mạng duy nhất (trình duyệt), không có mạng ngang hàng.
- Khoá bí mật chỉ dùng để đăng nhập (địa chỉ = hash của khoá), không phải chữ ký ECDSA.
- `minedIn` là dữ liệu đi kèm, không nằm trong tiêu đề block.

## 9. Tiến độ thực tế (A)

### Ngày 18/11 — Nền
- SHA-256, giao dịch, block, Proof-of-Work, kiểm tra chuỗi, dữ liệu mẫu.

### Ngày 19/11 — Mở rộng
- Ví có khoá bí mật & mật khẩu, đăng nhập; phí giao dịch, Merkle root, halving, độ khó tự điều chỉnh.
- Tài khoản quản trị, luật mạng theo phiên bản, khoá ví, cấp MC, luật số dư.

## 10. Tiêu chí hoàn thành của A

- [x] `Blockchain.create()` cho chuỗi hợp lệ, tổng cung 450 MC, tổng số dư = tổng cung.
- [x] Sửa bất kỳ giao dịch nào → `validate()` báo đúng block và lý do.
- [x] Đào lại block bị sửa → block kế tiếp đứt liên kết; chi vượt số dư vẫn bị phát hiện sau khi đào lại cả chuỗi.
- [x] Đổi luật mạng không làm block cũ mất hiệu lực.
- [x] Chạy được trong Node.js để kiểm thử độc lập với giao diện.
