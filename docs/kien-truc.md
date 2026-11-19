# Kiến trúc và thiết kế MiniChain

> Sinh viên thực hiện: **Đoàn Huy Đạt** – MSSV **CNTT2311046** (thực hiện cá nhân) · Môn: Blockchain

## 1. Tổng quan

MiniChain là ứng dụng web một trang (single-page), viết bằng **HTML, CSS và JavaScript thuần**, không dùng thư viện hay framework, không có máy chủ. Toàn bộ logic blockchain chạy trong trình duyệt. Mã nguồn được triển khai tĩnh qua GitHub Pages.

```
Trình duyệt
├── index.html            khung trang, menu, thanh trên cùng
├── css/style.css         giao diện (dark theme, responsive)
├── js/sha256.js          hàm băm SHA-256 (tự cài đặt)
├── js/blockchain.js      lõi blockchain: dữ liệu + thuật toán
├── js/metamask.js        kết nối ví MetaMask (EIP-1193, EIP-6963)
└── js/app.js             điều khiển giao diện, các màn hình
        │
        ├── localStorage "minichain.v1"        trạng thái chuỗi
        ├── localStorage "minichain.metamask"  ghi nhớ đã kết nối MetaMask
        └── window.ethereum / EIP-6963         tiện ích MetaMask
```

Thứ tự nạp script: `sha256.js → blockchain.js → metamask.js → app.js`. Mỗi đường dẫn có tham số phiên bản (`?v=…`) để trình duyệt tải bản mới sau mỗi lần cập nhật.

## 2. Các mô-đun

| File | Trách nhiệm | Giao diện công khai |
|---|---|---|
| `sha256.js` | Cài đặt SHA-256 theo chuẩn FIPS 180-4. Hằng số K và H được tính từ các số nguyên tố đầu tiên. Bản đồng bộ, đủ nhanh để thử hàng chục nghìn nonce mỗi giây. | `window.sha256(text) → hex` |
| `blockchain.js` | Mô hình dữ liệu, tính hash block, đào (Proof-of-Work), số dư, mempool, kiểm tra chuỗi. Không phụ thuộc giao diện. | `window.MiniChain = { Blockchain, calcHash, mineAsync, mineSync, ZERO_HASH, SYSTEM }` |
| `metamask.js` | Tìm ví, kết nối, đọc tài khoản/mạng/số dư, ký thông điệp, ký giao dịch MiniChain, gửi ETH testnet, màn hình "Ví MetaMask". | `window.MetaMaskUI = { install, signTransaction, state }` |
| `app.js` | Định tuyến giữa các màn hình, dựng HTML, gắn sự kiện, lưu/đọc `localStorage`, thông báo. Gọi `MetaMaskUI.install()` để đăng ký màn hình MetaMask. | (đóng gói trong IIFE) |

## 3. Mô hình dữ liệu

### Ví
```json
{ "name": "An", "address": "0x3f9c…(40 ký tự hex)", "created": 1795000000000 }
```
Ví liên kết từ MetaMask có thêm `"metamask": true`, và `address` là địa chỉ Ethereum thật (chữ thường).

### Giao dịch
```json
{
  "id": "9b1c2d3e4f5a6b7c",
  "from": "0x…",          // hoặc "SYSTEM" cho cấp vốn / phần thưởng
  "to": "0x…",
  "amount": 10,
  "note": "Trả tiền in tài liệu",
  "time": 1795000000000,
  "signature": "0x…",      // chỉ có khi gửi từ ví MetaMask
  "signedMessage": "…"     // nội dung đã ký
}
```

### Block
```json
{
  "index": 2,
  "timestamp": 1795000000000,
  "transactions": [ /* giao dịch thưởng + giao dịch từ mempool */ ],
  "previousHash": "000a94fc…",
  "nonce": 5325,
  "hash": "0007042b…",
  "difficulty": 3,
  "miner": "0x…"
}
```

### Trạng thái chuỗi (`localStorage["minichain.v1"]`)
```json
{ "chain": [Block], "pending": [Transaction], "wallets": [Wallet], "difficulty": 3, "reward": 50 }
```

## 4. Thuật toán

### 4.1. Hash của block
```
hash = SHA-256( index | previousHash | timestamp | JSON(transactions) | nonce )
```
Mọi trường của giao dịch, kể cả chữ ký, đều nằm trong hash. Chỉ cần sửa một ký tự là hash đổi.

### 4.2. Proof-of-Work
```
nonce = 0
lặp:
    hash = calcHash(block)
    nếu hash bắt đầu bằng `difficulty` chữ số 0 → xong
    nonce = nonce + 1
```
- `mineAsync` chia vòng lặp thành từng lát khoảng 25 ms (`setTimeout`), nên giao diện không bị đứng, và báo tiến độ (nonce, hash, số hash/giây) để hiển thị trực tiếp. Hàm hỗ trợ dừng giữa chừng.
- Độ khó được lưu **trong từng block**, nên đổi độ khó không làm các block cũ mất hiệu lực.
- Phần thưởng: block mới luôn bắt đầu bằng giao dịch `SYSTEM → thợ đào`, trị giá 50 MC.

### 4.3. Kiểm tra tính hợp lệ của chuỗi
Block thứ *i* hợp lệ khi thoả cả 3 điều kiện:
1. **Dữ liệu nguyên vẹn**: `calcHash(block) === block.hash`.
2. **Đạt độ khó**: `block.hash` bắt đầu bằng `block.difficulty` chữ số 0.
3. **Liên kết đúng**: `block.previousHash === chain[i-1].hash` (block genesis có `previousHash` là 64 chữ số 0).

Chuỗi hợp lệ khi mọi block hợp lệ. Khi chuỗi không hợp lệ, ứng dụng khoá chức năng đào.

### 4.4. Số dư và mempool
- `balanceOf(addr)` bằng tổng tiền nhận trừ tổng tiền gửi, tính trên các block đã xác nhận.
- `availableOf(addr)` bằng `balanceOf(addr)` trừ tổng tiền đang chờ gửi trong mempool. Cách này chống chi tiêu hai lần trong mempool.
- Giao dịch bị từ chối nếu: ví gửi trùng ví nhận, số tiền ≤ 0, hoặc vượt số dư khả dụng.
- Bất biến: tổng số dư mọi ví luôn bằng tổng MC do `SYSTEM` phát hành.

## 5. Tích hợp MetaMask

### 5.1. Tìm ví
1. Theo chuẩn **EIP-6963**: phát sự kiện `eip6963:requestProvider`, nhận `eip6963:announceProvider`, ưu tiên ví có `rdns = io.metamask`.
2. Nếu không có, dùng `window.ethereum` (hoặc `window.ethereum.providers` khi trình duyệt cài nhiều ví).

### 5.2. Các lệnh EIP-1193 sử dụng

| Lệnh | Mục đích |
|---|---|
| `eth_requestAccounts` | Xin quyền kết nối, lấy địa chỉ |
| `eth_accounts` | Tự kết nối lại khi tải trang (không hiện cửa sổ) |
| `eth_chainId` | Xác định mạng đang dùng |
| `eth_getBalance` | Đọc số dư ETH |
| `wallet_switchEthereumChain` / `wallet_addEthereumChain` | Chuyển sang (hoặc thêm) mạng Sepolia |
| `personal_sign` | Ký thông điệp và ký giao dịch MiniChain |
| `eth_sendTransaction` | Gửi ETH (chỉ trên testnet) |
| `wallet_revokePermissions` | Ngắt kết nối |

Ứng dụng lắng nghe các sự kiện `accountsChanged` và `chainChanged` để cập nhật giao diện ngay khi người dùng đổi tài khoản hoặc đổi mạng trong MetaMask.

### 5.3. Ký giao dịch MC từ ví MetaMask
```
Người dùng bấm "Gửi vào mempool"
  → kiểm tra hợp lệ (số dư, ví nhận…)
  → tạm giữ giao dịch ngoài mempool
  → MetaMask: personal_sign("MiniChain – Xác nhận giao dịch\nTừ…\nĐến…\nSố tiền…\nGhi chú…\nMã giao dịch…")
       ├─ người dùng từ chối → huỷ giao dịch, báo lỗi
       └─ người dùng ký     → kiểm tra lại số dư → gắn signature + signedMessage → đưa vào mempool
```
Giao dịch chỉ được ký khi tài khoản đang chọn trong MetaMask đúng là ví gửi.

### 5.4. Nguyên tắc an toàn
- Không bao giờ yêu cầu hay lưu cụm từ khôi phục hoặc khoá bí mật.
- Mọi thao tác ký và gửi đều do người dùng xác nhận trong MetaMask.
- Gửi ETH chỉ bật trên mạng thử nghiệm (Sepolia, Holesky, localhost 1337, Hardhat 31337).
- Mọi chuỗi do người dùng nhập (tên ví, ghi chú) đều được escape trước khi chèn vào HTML.

## 6. Giới hạn của mô phỏng

- Chỉ có **một nút mạng** (trình duyệt hiện tại). Không có mạng ngang hàng và không có cơ chế đồng thuận giữa nhiều máy.
- Chữ ký MetaMask được lưu kèm giao dịch để minh hoạ, nhưng ứng dụng **không tự xác minh** chữ ký (cần thư viện secp256k1).
- Số tiền dùng kiểu số của JavaScript. Độ khó tối đa là 5 để phù hợp với việc đào trên trình duyệt.

## 7. Kiểm thử

Ứng dụng được kiểm thử tự động bằng trình duyệt headless (Playwright). MetaMask được thay bằng một provider giả lập theo chuẩn EIP-1193. Các nhóm kịch bản:
- Khởi tạo dữ liệu, bảo toàn tổng tiền, tạo ví (tên trống, trùng tên, chống chèn HTML).
- Giao dịch: tự gửi cho mình, số 0, số âm, vượt số dư, nút "Tối đa", huỷ giao dịch.
- Đào block: dừng giữa chừng, đào khi chuyển màn hình, độ khó, phần thưởng.
- Sửa dữ liệu, rồi đào lại từng block cho tới khi chuỗi hợp lệ trở lại.
- Lưu trữ, dữ liệu hỏng, đặt lại dữ liệu.
- MetaMask: không có ví, từ chối kết nối, kết nối, đổi mạng, đổi tài khoản, ký thông điệp, ký giao dịch MC (đồng ý/từ chối/sai tài khoản), gửi ETH testnet, ngắt kết nối, tự kết nối lại, EIP-6963.
- Giao diện không tràn ngang ở các độ rộng 1366, 1024, 768 và 390 px.
