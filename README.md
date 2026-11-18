# MiniChain – Ứng dụng Blockchain cơ bản

Giao diện web mô phỏng một blockchain đơn giản cho môn **Blockchain**: ví, giao dịch, đào block bằng Proof-of-Work và khám phá chuỗi khối.

## Cách chạy

Không cần cài đặt gì. Mở file `index.html` bằng trình duyệt (Chrome, Edge, Firefox).

Dữ liệu được lưu trong `localStorage` của trình duyệt. Bấm **Đặt lại dữ liệu** để tạo lại chuỗi mẫu.

## Các màn hình

| Màn hình | Chức năng |
|---|---|
| Tổng quan | Thống kê chuỗi, trạng thái hợp lệ, block mới nhất, số dư các ví, giao dịch gần đây |
| Ví | Danh sách ví (địa chỉ sinh từ SHA-256), số dư, tạo ví mới |
| Giao dịch | Tạo giao dịch (kiểm tra số dư khả dụng), mempool, lịch sử giao dịch đã xác nhận |
| Đào block | Chọn thợ đào và độ khó (1–5), xem nonce/hash/tốc độ đào theo thời gian thực |
| Khám phá chuỗi | Xem từng block và liên kết `previousHash`, tìm kiếm, chế độ thử sửa dữ liệu, đào lại block |
| Hướng dẫn | Giải thích khái niệm, thử hàm băm SHA-256, kịch bản demo |

## Khái niệm được minh hoạ

- **Hàm băm SHA-256**: cài đặt thuần JavaScript (`js/sha256.js`), kết quả khớp chuẩn.
- **Block**: `index`, `timestamp`, `transactions`, `previousHash`, `nonce`, `hash`, `difficulty`.
- **Proof-of-Work**: tìm `nonce` sao cho hash bắt đầu bằng `difficulty` số 0. Thợ đào nhận thưởng 50 MC.
- **Tính bất biến**: sửa dữ liệu một block làm hash thay đổi → block đó và các block phía sau mất hiệu lực.

## Cấu trúc thư mục

```
minichain/
├── index.html          # Khung giao diện, thanh điều hướng
├── css/style.css       # Toàn bộ giao diện (dark theme, responsive)
├── js/sha256.js        # Hàm băm SHA-256
├── js/blockchain.js    # Lõi blockchain: giao dịch, block, đào, kiểm tra chuỗi
└── js/app.js           # Điều khiển giao diện các màn hình
```

## Kịch bản demo

1. **Giao dịch** → gửi 10 MC từ An sang Bình (giao dịch vào mempool).
2. **Đào block** → chọn độ khó 3–4, bấm đào → giao dịch được xác nhận.
3. **Khám phá chuỗi** → bật *Chế độ thử sửa dữ liệu*, đổi số tiền trong block #1 → block chuyển đỏ.
4. Bấm **Đào lại block** → block #1 hợp lệ nhưng block #2 đứt liên kết → phải đào lại cả chuỗi phía sau.
