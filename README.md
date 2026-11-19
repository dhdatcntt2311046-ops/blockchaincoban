# MiniChain – Ứng dụng Blockchain cơ bản

Giao diện web mô phỏng một blockchain đơn giản cho môn **Blockchain**: ví, giao dịch, đào block bằng Proof-of-Work, khám phá chuỗi khối và kết nối ví MetaMask.

- **Demo trực tuyến:** https://dhdatcntt2311046-ops.github.io/minichain/
- **Mã nguồn:** https://github.com/dhdatcntt2311046-ops/minichain
- **Hướng dẫn sử dụng:** [docs/huong-dan-su-dung.md](docs/huong-dan-su-dung.md)
- **Kiến trúc & thiết kế:** [docs/kien-truc.md](docs/kien-truc.md)

## Thông tin dự án

| | |
|---|---|
| Môn học | Blockchain |
| Đề tài | MiniChain – Ứng dụng Blockchain cơ bản |
| Sinh viên thực hiện | **Đoàn Huy Đạt** |
| MSSV | **CNTT2311046** |
| Hình thức | Cá nhân (một thành viên) |

## Cách chạy

Không cần cài đặt gì. Mở file `index.html` bằng trình duyệt (Chrome, Edge, Firefox).

Dữ liệu được lưu trong `localStorage` của trình duyệt. Bấm **Đặt lại dữ liệu** để tạo lại chuỗi mẫu.

**Đăng nhập ví:** bấm **Đăng nhập ví** ở thanh trên cùng. Ví mẫu An, Bình, Chi, Dũng có mật khẩu `123456`. Có thể tạo ví mới (đặt mật khẩu, nhận khoá bí mật) hoặc đăng nhập bằng MetaMask.

## Các màn hình

| Màn hình | Chức năng |
|---|---|
| Tổng quan | Thống kê chuỗi, trạng thái hợp lệ, block mới nhất, số dư các ví, giao dịch gần đây |
| Đăng nhập ví | Đăng nhập bằng mật khẩu, khoá bí mật hoặc chữ ký MetaMask; đăng xuất; phiên được lưu khi tải lại trang |
| Ví | Danh sách ví, số dư, đăng nhập từng ví, tạo ví mới có mật khẩu (khoá bí mật hiện một lần) |
| Giao dịch | Gửi MC từ ví đang đăng nhập, chọn phí giao dịch, mempool, lịch sử kèm số xác nhận |
| Đào block | Ví đang đăng nhập đào block: độ khó do mạng tự điều chỉnh, thưởng + phí, halving, giới hạn 4 GD/block, tiêu đề block (Merkle root), tốc độ băm, lịch sử đào |
| Khám phá chuỗi | Xem từng block và liên kết `previousHash`, tìm kiếm, chế độ thử sửa dữ liệu, đào lại block, tải chuỗi về dạng JSON |
| Ví MetaMask | Kết nối MetaMask, xem địa chỉ/mạng/số dư ETH, ký thông điệp, liên kết ví vào MiniChain, gửi ETH trên testnet |
| Hướng dẫn | Giải thích khái niệm (hash, block, PoW, chuỗi liên kết, mempool, chữ ký số), thử hàm băm SHA-256, kịch bản demo |

## Khái niệm được minh hoạ

- **Hàm băm SHA-256**: cài đặt thuần JavaScript (`js/sha256.js`), kết quả khớp chuẩn.
- **Ví & đăng nhập**: mỗi ví có khoá bí mật 64 ký tự hex; địa chỉ = SHA-256(khoá). Mật khẩu chỉ lưu dạng băm có muối.
- **Block**: tiêu đề gồm `index`, `previousHash`, `timestamp`, `merkleRoot`, `difficulty`, `nonce`; hash block = SHA-256(tiêu đề).
- **Merkle root**: hash tóm tắt toàn bộ giao dịch – sửa 1 giao dịch là Merkle root đổi.
- **Proof-of-Work**: tìm `nonce` sao cho hash bắt đầu bằng `difficulty` số 0 (trung bình 16^d lần thử).
- **Luật mạng** (thu nhỏ từ Bitcoin): phần thưởng 50 MC, giảm một nửa sau mỗi 10 block (halving); tối đa 4 giao dịch/block, ưu tiên phí cao; coinbase = thưởng + tổng phí; cứ 3 block điều chỉnh độ khó (3–5) để giữ ~5 giây/block.
- **Xác nhận**: số block đã xây sau block chứa giao dịch; từ 6 xác nhận coi như chắc chắn.
- **Tính bất biến**: sửa dữ liệu một block làm hash thay đổi → block đó và các block phía sau mất hiệu lực.

## Kết nối MetaMask

MetaMask chỉ hoạt động khi ứng dụng được mở qua web (http/https), không hoạt động khi mở file `index.html` trực tiếp. Dùng link GitHub Pages: https://dhdatcntt2311046-ops.github.io/minichain/

1. Cài tiện ích MetaMask cho trình duyệt (trên điện thoại: mở link trong ứng dụng MetaMask).
2. Vào màn hình **Ví MetaMask** → bấm **Kết nối MetaMask** và xác nhận trong cửa sổ MetaMask.
3. Bấm **Đăng nhập ví → MetaMask** (hoặc **Thêm vào MiniChain & đăng nhập**): MetaMask yêu cầu ký một thông điệp đăng nhập để chứng minh bạn là chủ địa chỉ; địa chỉ được thêm thành ví MiniChain (nhận MC, đào block).
4. Giao dịch gửi MC từ ví MetaMask phải được **ký số** bằng MetaMask (`personal_sign`); chữ ký được lưu kèm giao dịch trong block.
5. Chức năng gửi ETH chỉ bật trên mạng thử nghiệm (Sepolia, Holesky, localhost) để tránh mất tiền thật.

Ứng dụng không bao giờ yêu cầu cụm từ khôi phục (seed phrase) hay khoá bí mật.

## Cấu trúc thư mục

```
minichain/
├── index.html          # Khung giao diện, thanh điều hướng
├── css/style.css       # Toàn bộ giao diện (dark theme, responsive)
├── js/sha256.js        # Hàm băm SHA-256
├── js/blockchain.js    # Lõi blockchain: giao dịch, block, đào, kiểm tra chuỗi
├── js/metamask.js      # Kết nối ví MetaMask (EIP-1193, EIP-6963)
├── js/app.js           # Điều khiển giao diện các màn hình
└── docs/
    ├── huong-dan-su-dung.md  # Hướng dẫn sử dụng chi tiết
    └── kien-truc.md          # Kiến trúc, mô hình dữ liệu, thuật toán
```

## Kịch bản demo

1. **Đăng nhập ví** An (mật khẩu `123456`).
2. **Giao dịch** → gửi 10 MC sang Bình với phí 0,5 (giao dịch vào mempool).
3. **Đào block** → bấm đào → An nhận thưởng + phí; giao dịch phí cao được chọn trước; đào vài block để thấy độ khó tự tăng.
4. **Khám phá chuỗi** → bật *Chế độ thử sửa dữ liệu*, đổi số tiền trong block #1 → Merkle root lệch, block chuyển đỏ.
5. Bấm **Đào lại block** → block #1 hợp lệ nhưng block #2 đứt liên kết → phải đào lại cả chuỗi phía sau.
