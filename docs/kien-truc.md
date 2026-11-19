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
        ├── localStorage "minichain.v2"        trạng thái chuỗi (+ "minichain.session": ví đang đăng nhập)
        ├── localStorage "minichain.metamask"  ghi nhớ đã kết nối MetaMask
        └── window.ethereum / EIP-6963         tiện ích MetaMask
```

Thứ tự nạp script: `sha256.js → blockchain.js → metamask.js → app.js`. Mỗi đường dẫn có tham số phiên bản (`?v=…`) để trình duyệt tải bản mới sau mỗi lần cập nhật.

## 2. Các mô-đun

| File | Trách nhiệm | Giao diện công khai |
|---|---|---|
| `sha256.js` | Cài đặt SHA-256 theo chuẩn FIPS 180-4. Hằng số K và H được tính từ các số nguyên tố đầu tiên. Bản đồng bộ, đủ nhanh để thử hàng chục nghìn nonce mỗi giây. | `window.sha256(text) → hex` |
| `blockchain.js` | Mô hình dữ liệu, ví (khoá bí mật, mật khẩu băm), đăng nhập, phí, Merkle root, đào (Proof-of-Work), halving, điều chỉnh độ khó, số dư, mempool, kiểm tra chuỗi. Không phụ thuộc giao diện. | `window.MiniChain = { Blockchain, calcHash, merkleRoot, txHash, rewardAt, RULES, mineAsync, mineSync, ZERO_HASH, SYSTEM, DEMO_PASSWORD, addressFromKey }` |
| `metamask.js` | Tìm ví, kết nối, đọc tài khoản/mạng/số dư, ký thông điệp, đăng nhập bằng chữ ký, ký giao dịch MiniChain, gửi ETH testnet, màn hình "Ví MetaMask". | `window.MetaMaskUI = { install, login, signTransaction, state }` |
| `app.js` | Định tuyến giữa các màn hình, phiên đăng nhập, hộp thoại đăng nhập/tạo ví, dựng HTML, gắn sự kiện, lưu/đọc `localStorage`, thông báo. Gọi `MetaMaskUI.install()` để đăng ký màn hình MetaMask. | (đóng gói trong IIFE) |

## 3. Mô hình dữ liệu

### Ví
```json
{ "name": "An", "address": "0x3f9c…(40 ký tự hex)", "salt": "a1b2…(16 hex)", "pwHash": "…(64 hex)", "created": 1795000000000 }
```
- Khi tạo ví: sinh **khoá bí mật** 32 byte ngẫu nhiên (`crypto.getRandomValues`), `address = "0x" + SHA-256("minichain-pub:" + khoá)[0..40]`. Khoá chỉ hiện cho người dùng một lần, **không lưu**.
- Mật khẩu chỉ lưu dạng `pwHash = SHA-256(salt + ":" + mật khẩu)` với `salt` ngẫu nhiên.
- Ví liên kết từ MetaMask có `"metamask": true`, không có mật khẩu; `address` là địa chỉ Ethereum thật (chữ thường).

### Đăng nhập
| Cách | Kiểm tra |
|---|---|
| Mật khẩu | tìm ví theo tên/địa chỉ, so `SHA-256(salt + mật khẩu)` với `pwHash` |
| Khoá bí mật | khoá đúng 64 hex → tính lại địa chỉ từ khoá → phải trùng một ví |
| MetaMask | `personal_sign` thông điệp đăng nhập (có thời gian + mã ngẫu nhiên) bằng đúng tài khoản; chưa có ví thì tự thêm |

Phiên đăng nhập là địa chỉ ví lưu ở `localStorage["minichain.session"]`. Gửi giao dịch, huỷ giao dịch và đào block đều dùng ví của phiên này.

### Giao dịch
```json
{
  "id": "9b1c2d3e4f5a6b7c",
  "from": "0x…",          // hoặc "SYSTEM" cho cấp vốn / phần thưởng
  "to": "0x…",
  "amount": 10,
  "fee": 0.1,             // phí trả cho thợ đào
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
  "transactions": [ /* coinbase + tối đa 4 giao dịch phí cao nhất */ ],
  "previousHash": "000a94fc…",
  "merkleRoot": "5d2f…",
  "nonce": 5325,
  "hash": "0007042b…",
  "difficulty": 3,
  "miner": "0x…",
  "minedIn": 812,          // thời gian đào (ms) – dùng để điều chỉnh độ khó
  "hashes": 5326           // số lần thử
}
```
Giao dịch coinbase (đầu block) có thêm `reward` và `fees`: `amount = reward + fees`.

### Trạng thái chuỗi (`localStorage["minichain.v2"]`)
```json
{ "chain": [Block], "pending": [Transaction], "wallets": [Wallet], "difficulty": 3, "reward": 50 }
```

### Luật mạng (`RULES`)
| Luật | Giá trị | Bitcoin thật |
|---|---|---|
| Phần thưởng ban đầu | 50 MC | 50 BTC |
| Halving | mỗi 10 block | mỗi 210.000 block |
| Giao dịch tối đa / block | 4 (không tính coinbase) | giới hạn theo dung lượng block |
| Thời gian mục tiêu | ~5 giây / block | ~10 phút / block |
| Điều chỉnh độ khó | mỗi 3 block, độ khó 3–5 | mỗi 2016 block |
| Phí mặc định | 0,1 MC (0 – 10 MC) | do người gửi chọn |

## 4. Thuật toán

### 4.1. Merkle root và hash của block
```
txHash      = SHA-256( JSON(giao dịch) )
merkleRoot  = băm ghép từng cặp txHash lên trên tới khi còn 1 hash (số lẻ thì nhân đôi phần tử cuối)
hash block  = SHA-256( index | previousHash | timestamp | merkleRoot | difficulty | nonce )
```
Mọi trường của giao dịch, kể cả phí và chữ ký, đều nằm trong Merkle root. Sửa một ký tự là Merkle root đổi, kéo theo hash block đổi.

### 4.2. Proof-of-Work
```
nonce = 0
lặp:
    hash = calcHash(block)
    nếu hash bắt đầu bằng `difficulty` chữ số 0 → xong
    nonce = nonce + 1
```
- `mineAsync` chia vòng lặp thành từng lát khoảng 25 ms (`setTimeout`), nên giao diện không bị đứng, và báo tiến độ (nonce, hash, số hash/giây) để hiển thị trực tiếp. Hàm hỗ trợ dừng giữa chừng.
- Độ khó được lưu **trong từng block** (nằm trong tiêu đề), nên đổi độ khó không làm các block cũ mất hiệu lực.
- Block ứng viên: coinbase `SYSTEM → thợ đào` trị giá `rewardAt(độ cao) + tổng phí`, rồi tới tối đa 4 giao dịch phí cao nhất trong mempool (cùng phí thì giao dịch cũ hơn trước).
- `rewardAt(h) = 50 / 2^floor(h / 10)` (halving).
- **Điều chỉnh độ khó** (`retarget`, chạy sau khi thêm block có độ cao chia hết cho 3): lấy trung bình `minedIn` của 3 block gần nhất; < 2,5 giây → độ khó +1, > 10 giây → độ khó −1, giới hạn 3–5.

### 4.3. Kiểm tra tính hợp lệ của chuỗi
Block thứ *i* hợp lệ khi thoả cả 4 điều kiện:
1. **Dữ liệu nguyên vẹn**: Merkle root tính lại từ giao dịch bằng `block.merkleRoot`, và `calcHash(block) === block.hash`.
2. **Đạt độ khó**: `block.hash` bắt đầu bằng `block.difficulty` chữ số 0.
3. **Liên kết đúng**: `block.previousHash === chain[i-1].hash` (block genesis có `previousHash` là 64 chữ số 0).
4. **Đúng luật đồng thuận**: coinbase không vượt `rewardAt(i) + tổng phí`, chỉ coinbase được từ `SYSTEM`, tối đa 4 giao dịch người dùng.

Chuỗi hợp lệ khi mọi block hợp lệ. Khi chuỗi không hợp lệ, ứng dụng khoá chức năng đào.

### 4.4. Số dư và mempool
- `balanceOf(addr)` bằng tổng tiền nhận trừ tổng (số tiền + phí) đã gửi, tính trên các block đã xác nhận.
- `availableOf(addr)` bằng `balanceOf(addr)` trừ tổng (số tiền + phí) đang chờ trong mempool. Cách này chống chi tiêu hai lần trong mempool.
- Giao dịch bị từ chối nếu: ví gửi trùng ví nhận, số tiền ≤ 0, phí âm hoặc > 10, hoặc số tiền + phí vượt số dư khả dụng.
- `confirmationsOf(i) = chiều cao chuỗi − i + 1`.
- Bất biến: tổng số dư mọi ví luôn bằng tổng MC mới phát hành (cấp vốn + phần thưởng); phí chỉ chuyển từ người gửi sang thợ đào.

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
- Số tiền dùng kiểu số của JavaScript (làm tròn 8 chữ số thập phân). Độ khó tối đa là 5 để phù hợp với việc đào trên trình duyệt.
- Khoá bí mật của MiniChain chỉ dùng để đăng nhập (địa chỉ = hash của khoá), không phải chữ ký số ECDSA như Bitcoin.
- Thời gian đào (`minedIn`) là dữ liệu đi kèm, không nằm trong tiêu đề block.

## 7. Kiểm thử

Ứng dụng được kiểm thử tự động bằng trình duyệt headless (Playwright). MetaMask được thay bằng một provider giả lập theo chuẩn EIP-1193. Các nhóm kịch bản:
- Khởi tạo dữ liệu, bảo toàn tổng tiền, tạo ví (tên trống, trùng tên, chống chèn HTML).
- Đăng nhập: sai mật khẩu, ví không tồn tại, khoá sai định dạng/không khớp, tạo ví (mật khẩu ngắn, nhập lại sai), khoá chỉ hiện một lần và không bị lưu, giữ phiên khi tải lại, đăng xuất, đăng nhập MetaMask bằng chữ ký, từ chối ký, đổi tài khoản MetaMask.
- Giao dịch: chưa đăng nhập bị khoá, ví nhận không gồm chính mình, địa chỉ nhận lạ, số tiền + phí vượt số dư, chỉ huỷ giao dịch của mình.
- Đào block: chọn 4 giao dịch phí cao nhất, coinbase = thưởng + phí, độ khó tự tăng, halving, Merkle root, dừng giữa chừng.
- Sửa dữ liệu, rồi đào lại từng block cho tới khi chuỗi hợp lệ trở lại.
- Lưu trữ, dữ liệu hỏng, đặt lại dữ liệu.
- MetaMask: không có ví, từ chối kết nối, kết nối, đổi mạng, đổi tài khoản, ký thông điệp, ký giao dịch MC (đồng ý/từ chối/sai tài khoản), gửi ETH testnet, ngắt kết nối, tự kết nối lại, EIP-6963.
- Giao diện không tràn ngang ở các độ rộng 1366, 1024, 768 và 390 px.
