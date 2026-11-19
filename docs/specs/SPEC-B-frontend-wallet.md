# SPEC-B — Giao diện, đăng nhập ví, các màn hình, dịch vụ tiền tệ, MetaMask, trang quản trị

Đọc kèm `SPEC-00-shared.md`. Người thực hiện: **Đoàn Huy Đạt**.

## Phạm vi sở hữu

- `index.html`, `css/style.css` – khung trang, menu, thanh trên cùng, giao diện tối, responsive.
- `js/app.js` – định tuyến 12 màn hình, phiên đăng nhập, hộp thoại, lưu/đọc `localStorage`, thông báo, đường dẫn `?pay=`.
- `js/services.js` – màn hình Cửa hàng, Thanh toán, Đổi tiền, Tiết kiệm.
- `js/qrcode.js` – tạo mã QR cho hoá đơn.
- `js/metamask.js` – kết nối MetaMask và màn hình "Ví MetaMask".

---

## 1. Bố cục

- **Menu bên trái** (điện thoại: thanh ngang): Tổng quan, Ví, Giao dịch, Đào block, Cửa hàng, Thanh toán, Đổi tiền, Tiết kiệm, Khám phá chuỗi, Ví MetaMask, Hướng dẫn, Quản trị (chỉ admin).
- **Thanh trên cùng**: nút **Đăng nhập ví** (đăng nhập xong hiện tên ví), **Kết nối MetaMask**, nhãn **Chuỗi hợp lệ / Chuỗi bị sửa đổi**, **Đặt lại dữ liệu** (chỉ admin).

## 2. Đăng nhập

### 2.1 Hộp thoại đăng nhập (4 thẻ)
| Thẻ | Nhập | Ghi chú |
|---|---|---|
| Mật khẩu | tên ví hoặc địa chỉ + mật khẩu | ví mẫu An, Bình, Chi, Dũng – `123456` |
| Khoá bí mật | khoá 64 hex | khoá không bị lưu |
| MetaMask | ký thông điệp đăng nhập | chưa có ví thì tự thêm (0 MC) |
| Quản trị | `admin` / `admin123` | nên đổi mật khẩu sau khi đăng nhập |

### 2.2 Phiên
- Lưu ở `minichain.session`, giữ khi tải lại trang; bấm tên ví → xem số dư / **Đăng xuất**.
- Ví bị khoá → tự đăng xuất. Đổi tài khoản trong MetaMask → tự đăng xuất ví MetaMask.

## 3. Các màn hình

### 3.1 Tổng quan
- 4 thẻ: số block, giao dịch đã xác nhận, giao dịch đang chờ, tổng cung.
- Khung trạng thái chuỗi (đỏ khi có block sai, kèm nút xem chi tiết); 5 block mới nhất; số dư các ví; giao dịch gần đây.

### 3.2 Ví
- Thẻ ví: tên, địa chỉ (sao chép), số dư, số giao dịch, tiền đang chờ gửi; nút **🔑 Đăng nhập**; nhãn MetaMask / bị khoá.
- **Tạo ví mới**: tên, mật khẩu, nhập lại → hộp thoại hiện **khoá bí mật đúng một lần** (Sao chép khoá, Tôi đã lưu khoá – vào ví).

### 3.3 Giao dịch
- Ví gửi = ví đang đăng nhập; ví nhận chọn trong danh sách hoặc dán địa chỉ.
- Số tiền (5 / 10 / 25 / Tối đa), phí (Thấp 0,01 / Thường 0,1 / Nhanh 0,5), ghi chú ≤ 60 ký tự; hiện tổng trừ = số tiền + phí.
- Mempool (chỉ huỷ được giao dịch của mình; huỷ giao dịch dịch vụ thì hoàn tác đơn hàng / hoá đơn / lệnh đổi / khoản gửi); lịch sử có cột Block, **Xác nhận** (≥ 6 có ✓), Phí, nhãn loại (🛒 Mua hàng, 🧾 Hoá đơn, 💱 Đổi tiền, 🏦 Tiết kiệm). Danh sách ví nhận không gồm ví hệ thống.

### 3.4 Đào block
- Bảng **Điều kiện đào block**: 6 điều kiện, mỗi điều kiện ✓ / ✕ kèm giá trị hiện tại; chưa đạt hết thì nút đổi thành **Chưa đủ điều kiện đào** và bị khoá.
- Thợ đào = ví đang đăng nhập. Thông số mạng: độ khó, số block tới lần chỉnh độ khó / halving, thưởng, phí, **tổng nhận nếu đào được**.
- Bảng điều khiển: tiêu đề block (hash trước, Merkle root, độ khó, nonce, hash), tốc độ băm, số lần thử / kỳ vọng, các hash vừa thử; **Dừng đào**.
- Mempool xếp theo phí ("Vào block này" / "Chờ block sau"); lịch sử đào. Chuỗi bị sửa → khoá đào.

### 3.5 Cửa hàng
- Thẻ sản phẩm (biểu tượng, tên, mô tả, giá, tồn kho, người bán); **Mua** mở hộp thoại chọn số lượng + phí, hiện tổng trừ khỏi ví.
- **Đăng bán sản phẩm** (biểu tượng, tên, mô tả, giá, số lượng); **Gỡ bán** sản phẩm của mình.
- Bảng **Đơn mua** / **Đơn bán**: Chờ xác nhận → Đã xác nhận · n, hoặc Đã huỷ.

### 3.6 Thanh toán
- **Tạo hoá đơn** (số tiền, nội dung, người phải trả hoặc bất kỳ ai) → hộp thoại **mã QR** + đường dẫn `…/?pay=HD-xxxxxx` + sao chép mã.
- **Thanh toán theo mã**; mở đường dẫn QR → vào thẳng hộp thoại thanh toán (đường dẫn được xoá khỏi thanh địa chỉ).
- Bảng hoá đơn cần trả / đã tạo: Chưa thanh toán, Đã trả · chờ xác nhận, Đã thanh toán, Đã huỷ.

### 3.7 Đổi tiền
- Thẻ tỷ giá VND, USD (giá quầy mua / quầy bán), dự trữ của quầy, chênh lệch.
- Tài khoản MC / VND / USD; biểu mẫu **Bán MC → nhận tiền** / **Mua MC bằng tiền** có báo giá tức thì; lịch sử lệnh.

### 3.8 Tiết kiệm
- 3 gói (Ngắn hạn 5 block 2%, Trung hạn 10 block 5%, Dài hạn 12% 20 block), ước tính lãi.
- Bảng khoản gửi: gốc, kỳ hạn, lãi, block bắt đầu → đáo hạn, trạng thái (Chờ xác nhận, Đang gửi · còn n block, Đến hạn, Đang rút, Đã rút); **Tất toán** / **Rút trước hạn** (hỏi xác nhận, không có lãi).

### 3.9 Khám phá chuỗi
- Từng block: hash, previousHash, Merkle root, nonce, độ khó, thời gian đào, số xác nhận, giao dịch có phí.
- Tìm kiếm (số block, hash, mã giao dịch, tên ví); **Kiểm tra toàn chuỗi**; **Tải chuỗi (JSON)**.
- **Chế độ thử sửa dữ liệu** → sửa số tiền → block đỏ kèm lý do → **Đào lại block này**.

### 3.10 Ví MetaMask
- Kết nối, xem địa chỉ / mạng / số dư ETH, link Etherscan, **Chuyển sang Sepolia**, **Ngắt kết nối**.
- **Thêm vào MiniChain & đăng nhập**; **Ký thông điệp**; **Gửi ETH** (chỉ testnet); nhật ký kết nối.

### 3.11 Quản trị (chỉ admin)
- Quản lý ví: **Khoá / Mở khoá**, **Đặt lại mật khẩu**, **+ Cấp MC** (kể cả nạp thêm cho ví hệ thống).
- Luật mạng (thưởng, halving, GD/block, thời gian mục tiêu, chu kỳ chỉnh độ khó, độ khó, **số GD tối thiểu, số dư tối thiểu của thợ đào, số block liên tiếp tối đa**) + lịch sử phiên bản luật.
- **Tỷ giá đổi tiền** (VND, USD, chênh lệch %) và thống kê dịch vụ tiền tệ.
- Xoá giao dịch trong mempool; đổi mật khẩu quản trị; **Đặt lại dữ liệu**; nhật ký quản trị.

### 3.12 Hướng dẫn
- 12 khái niệm (hàm băm, block & Merkle root, PoW, thưởng – phí – halving, độ khó, chuỗi liên kết, mempool & xác nhận, quản trị viên, đăng nhập ví, điều kiện đào block, dùng MC cho dịch vụ, MetaMask); ô thử SHA-256; kịch bản demo.

## 4. MetaMask

### 4.1 Tìm ví
1. EIP-6963: phát `eip6963:requestProvider`, nhận `eip6963:announceProvider`, ưu tiên `rdns = io.metamask`.
2. Không có thì dùng `window.ethereum` (hoặc `window.ethereum.providers`).

### 4.2 Lệnh EIP-1193
| Lệnh | Mục đích |
|---|---|
| `eth_requestAccounts` / `eth_accounts` | Kết nối / tự kết nối lại khi tải trang |
| `eth_chainId`, `eth_getBalance` | Mạng đang dùng, số dư ETH |
| `wallet_switchEthereumChain` / `wallet_addEthereumChain` | Chuyển (hoặc thêm) Sepolia |
| `personal_sign` | Ký thông điệp, đăng nhập, ký giao dịch MC |
| `eth_sendTransaction` | Gửi ETH (chỉ testnet) |
| `wallet_revokePermissions` | Ngắt kết nối |

Lắng nghe `accountsChanged`, `chainChanged` để cập nhật ngay.

### 4.3 Ký giao dịch MC
```
Gửi vào mempool → kiểm tra hợp lệ → tạm giữ ngoài mempool
  → personal_sign("MiniChain – Xác nhận giao dịch\nTừ…\nĐến…\nSố tiền…\nPhí…\nGhi chú…\nMã giao dịch…")
       ├─ từ chối → huỷ, báo lỗi
       └─ ký      → kiểm tra lại số dư → gắn signature + signedMessage → vào mempool
```

## 5. Chạy và triển khai

| Cách | Ghi chú |
|---|---|
| GitHub Pages (tự cập nhật khi đẩy lên `main`) | Đầy đủ chức năng, kể cả MetaMask |
| Mở trực tiếp `index.html` | Mọi chức năng trừ MetaMask |

Trang hiện bản cũ → `Ctrl + F5`.

## 6. Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| "Chưa tìm thấy MetaMask" | Cài MetaMask, tải lại trang, bấm **Thử lại**; dùng link GitHub Pages |
| "Bạn đã từ chối yêu cầu trong MetaMask" | Làm lại và bấm Xác nhận |
| "Hãy chuyển sang 0x… để ký" | Chọn đúng tài khoản MetaMask đã liên kết |
| Không gửi được ETH | Bấm **Chuyển sang Sepolia** |
| "Chuỗi bị sửa đổi", không đào được | Đào lại các block đỏ, hoặc admin **Đặt lại dữ liệu** |
| "Ví này đã bị quản trị viên khoá" | Admin → Quản trị → **Mở khoá** |
| Không thấy menu Quản trị / Đặt lại dữ liệu | Đăng nhập thẻ **Quản trị** |
| "Chưa đủ điều kiện đào" | Xem bảng **Điều kiện đào block**: tạo giao dịch, nhận thêm MC, hoặc đổi sang ví khác nếu đã đào 3 block liên tiếp |
| Quét mã QR trên máy khác không thấy hoá đơn | Dữ liệu lưu riêng từng trình duyệt – mở trên cùng trình duyệt có chuỗi đó, hoặc nhập mã hoá đơn |

## 7. Tiến độ thực tế (B)

### Ngày 18/11 — Giao diện
- Khung trang, CSS (dark theme, responsive), các màn hình Tổng quan, Ví, Giao dịch, Đào block, Khám phá chuỗi, Hướng dẫn.

### Ngày 19/11 — Ví và quản trị
- Màn hình Ví MetaMask, ký giao dịch MC; tải JSON; đăng nhập ví thay cho chọn ví; màn hình đào theo luật mạng; trang Quản trị.
- Màn hình Cửa hàng, Thanh toán (mã QR), Đổi tiền, Tiết kiệm; bảng điều kiện đào block; nhãn loại giao dịch.

## 8. Tiêu chí hoàn thành của B

- [x] Mọi màn hình chạy không lỗi console; không tràn ngang ở 1366 / 1024 / 768 / 390 px.
- [x] Chưa đăng nhập thì không gửi MC / không đào; chỉ admin thấy Quản trị và Đặt lại dữ liệu.
- [x] MetaMask: kết nối, đổi mạng / tài khoản, ký đăng nhập, ký giao dịch (đồng ý / từ chối), gửi ETH testnet.
- [x] Cửa hàng, hoá đơn QR (mở bằng đường dẫn), đổi tiền, tiết kiệm chạy đủ vòng: tạo → chờ → đào → xác nhận; huỷ → hoàn tác.
- [x] Mã QR giải được bằng trình đọc QR chuẩn (OpenCV).
- [x] Kiểm thử tự động Playwright với ví MetaMask giả lập đạt toàn bộ.
