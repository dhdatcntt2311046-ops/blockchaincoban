# Hướng dẫn sử dụng MiniChain

> Sinh viên thực hiện: **Đoàn Huy Đạt** – MSSV **CNTT2311046** (thực hiện cá nhân) · Môn: Blockchain

MiniChain là ứng dụng web mô phỏng một **blockchain cơ bản**, xây dựng cho môn Blockchain. Ứng dụng cho phép tạo ví, gửi giao dịch, đào block bằng Proof-of-Work, xem cấu trúc chuỗi khối, thử sửa dữ liệu để thấy tính bất biến, và kết nối ví **MetaMask** thật để ký số.

- Demo trực tuyến: https://dhdatcntt2311046-ops.github.io/minichain/
- Mã nguồn: https://github.com/dhdatcntt2311046-ops/minichain

---

## 1. Mở ứng dụng

| Cách mở | Khi nào dùng | Ghi chú |
|---|---|---|
| Link GitHub Pages ở trên | Dùng hằng ngày, trình bày, chấm bài | Đầy đủ chức năng, kể cả MetaMask |
| Mở file `index.html` trên máy | Không có mạng | Mọi chức năng chạy được **trừ MetaMask** (MetaMask không hoạt động với file cục bộ) |

Ứng dụng không cần cài đặt, không có máy chủ riêng. Toàn bộ chạy trong trình duyệt (Chrome, Edge, Firefox, Brave…), máy tính hoặc điện thoại.

## 2. Bố cục giao diện

- **Menu bên trái** (trên điện thoại là thanh ngang phía trên): Tổng quan, Ví, Giao dịch, Đào block, Khám phá chuỗi, Ví MetaMask, Hướng dẫn. Số nhỏ cạnh "Giao dịch" là số giao dịch đang chờ. Chấm cam cạnh "Ví MetaMask" nghĩa là đang kết nối MetaMask.
- **Thanh trên cùng**:
  - Nút **Kết nối MetaMask**. Khi đã kết nối, nút hiện địa chỉ ví rút gọn.
  - Nhãn trạng thái **Chuỗi hợp lệ** (xanh) hoặc **Chuỗi bị sửa đổi** (đỏ).
  - Nút **Đặt lại dữ liệu**: xoá toàn bộ và tạo lại dữ liệu mẫu.

## 3. Dữ liệu mẫu ban đầu

Lần đầu mở (hoặc sau khi đặt lại), ứng dụng tự tạo:

- 4 ví: **An, Bình, Chi, Dũng**, mỗi ví được cấp 100 MC trong block khởi tạo (Genesis, #0).
- Block #1: Chi nhận 50 MC thưởng đào, An gửi Bình 15 MC, Dũng gửi Chi 20 MC.
- 1 giao dịch đang chờ: Bình gửi An 5 MC.

Đơn vị tiền trong MiniChain là **MC**. Tổng cung ban đầu là 450 MC.

---

## 4. Các chức năng theo từng màn hình

### 4.0. Đăng nhập ví
Gửi MC và đào block đều cần **đăng nhập vào ví** – ứng dụng không cho chọn ví của người khác.

- Bấm **Đăng nhập ví** ở thanh trên cùng (hoặc nút **🔑 Đăng nhập** trên thẻ ví). Hộp thoại có 3 cách:
  - **Mật khẩu**: nhập tên ví (hoặc địa chỉ) và mật khẩu. Ví mẫu An, Bình, Chi, Dũng có mật khẩu `123456`.
  - **Khoá bí mật**: dán khoá 64 ký tự hex được cấp khi tạo ví. Ứng dụng tính lại địa chỉ từ khoá rồi tìm ví khớp; khoá không bị lưu.
  - **MetaMask**: MetaMask yêu cầu ký một thông điệp đăng nhập (không tốn phí). Nếu địa chỉ chưa có trong MiniChain, ví được tự thêm vào.
- Sau khi đăng nhập, nút trên thanh trên cùng hiện tên ví. Bấm vào để xem số dư, sao chép địa chỉ hoặc **Đăng xuất**.
- Phiên đăng nhập được giữ khi tải lại trang. Đổi tài khoản trong MetaMask sẽ tự đăng xuất ví MetaMask. **Đặt lại dữ liệu** cũng đăng xuất.
- Sai mật khẩu, khoá sai định dạng hoặc không khớp ví nào đều được báo lỗi rõ ràng.

### 4.1. Tổng quan
- 4 thẻ thống kê: số block, số giao dịch đã xác nhận, số giao dịch đang chờ, tổng cung MC.
- Khung trạng thái chuỗi. Nếu có block bị sửa, khung chuyển đỏ, ghi rõ block nào, kèm nút **Xem chi tiết**.
- **Block mới nhất**: 5 block cuối, nối với nhau bằng mũi tên. Bấm vào một block để mở trang Khám phá chuỗi tại đúng block đó.
- **Số dư các ví** dạng thanh ngang, và bảng **Giao dịch gần đây**.

### 4.2. Ví
- Mỗi thẻ ví có tên, địa chỉ (dạng `0x…`, sinh từ SHA-256), số dư, số giao dịch đã tham gia và số tiền đang chờ gửi.
- **Sao chép**: chép địa chỉ ví.
- **🔑 Đăng nhập**: mở hộp thoại đăng nhập, điền sẵn tên ví. Ví đang dùng có nhãn **● Đang đăng nhập** và nút **Đăng xuất**.
- **Tạo ví mới**: nhập tên (tối đa 24 ký tự, không trùng), mật khẩu (ít nhất 6 ký tự) và nhập lại mật khẩu. Ứng dụng sinh **khoá bí mật** ngẫu nhiên, địa chỉ ví = SHA-256(khoá), và hiện khoá **đúng một lần** để bạn lưu lại. Bấm **Tôi đã lưu khoá – vào ví** để đăng nhập ngay. Ví mới có 0 MC.
- Mật khẩu không được lưu trực tiếp mà chỉ lưu dạng băm SHA-256 có muối (salt).
- Ví liên kết từ MetaMask có nhãn **MetaMask**.

### 4.3. Giao dịch
Chưa đăng nhập thì form gửi bị khoá và hiện nút **Đăng nhập ví**.

1. **Ví gửi** luôn là ví đang đăng nhập, kèm số dư khả dụng (đã trừ giao dịch đang chờ và phí).
2. Chọn **Ví nhận** trong danh sách (không gồm ví của bạn) hoặc dán **địa chỉ ví nhận**.
3. Nhập **Số tiền** (nút nhanh 5 / 10 / 25 / Tối đa) và **Phí giao dịch** (Thấp 0,01 / Thường 0,1 / Nhanh 0,5; mặc định 0,1 MC, tối đa 10 MC). Ứng dụng hiện **tổng trừ khỏi ví** = số tiền + phí.
4. Thêm **Ghi chú** nếu muốn (tối đa 60 ký tự) rồi bấm **Gửi vào mempool**.

Ứng dụng từ chối và báo lỗi khi: số tiền ≤ 0, phí âm hoặc quá 10 MC, số tiền + phí vượt số dư khả dụng, hoặc địa chỉ nhận không có trong MiniChain.

Giao dịch hợp lệ vào **Mempool** bên phải (hiện cả phí). Bạn chỉ **Huỷ** được giao dịch của chính mình, và không huỷ được giao dịch đang được đào. Bảng **Lịch sử giao dịch đã xác nhận** có cột **Block**, **Xác nhận** (số block đã xây sau block đó; từ 6 trở lên có dấu ✓) và **Phí**.

Nếu ví gửi là **ví MetaMask**, MetaMask sẽ hiện cửa sổ yêu cầu ký trước khi giao dịch vào mempool (xem mục 4.6).

### 4.4. Đào block (Proof-of-Work)
Phần đào block mô phỏng các luật của Bitcoin ở quy mô nhỏ:

- **Thợ đào** là ví đang đăng nhập (chưa đăng nhập thì nút đào bị khoá).
- **Độ khó do mạng quyết định**, không tự chọn: cứ 3 block, mạng tính thời gian đào trung bình; nhanh hơn 2,5 giây thì độ khó +1, chậm hơn 10 giây thì −1 (trong khoảng 3–5), để giữ khoảng 5 giây/block.
- **Phần thưởng** bắt đầu 50 MC và **giảm một nửa sau mỗi 10 block** (halving: 50 → 25 → 12,5…). Màn hình hiện số block còn lại tới lần halving và lần điều chỉnh độ khó.
- **Phí giao dịch**: mỗi block chứa **tối đa 4 giao dịch**, thợ đào chọn giao dịch **phí cao nhất** trước. Bảng *Mempool – xếp theo phí* đánh dấu giao dịch nào "Vào block này", giao dịch nào "Chờ block sau".
- **Coinbase**: giao dịch đầu tiên của block trả cho thợ đào **phần thưởng + tổng phí**. Ô *Tổng nhận nếu đào được* hiện con số này.
- **Độ khó** là số chữ số 0 bắt buộc ở đầu hash:

| Độ khó | Hash phải bắt đầu bằng | Số lần thử trung bình |
|---|---|---|
| 1 | `0` | 16 |
| 2 | `00` | 256 |
| 3 | `000` | 4.096 |
| 4 | `0000` | 65.536 |
| 5 | `00000` | 1.048.576 |

- Bấm **Bắt đầu đào block**. Bảng điều khiển hiện **tiêu đề block** (hash trước, Merkle root, thời gian, độ khó, nonce, hash), **tốc độ băm** (H/s), thời gian đào, **số lần thử so với kỳ vọng** kèm thanh tiến độ, và các hash vừa thử gần nhất. Mỗi lần thử có xác suất 1/16^d, nên có lúc may mắn tìm ra sớm, có lúc phải thử nhiều hơn kỳ vọng.
- Có thể **Dừng đào** giữa chừng. Khi đó không block nào được thêm.
- Đào xong: block mới chứa coinbase và tối đa 4 giao dịch; giao dịch còn lại tiếp tục chờ. Ứng dụng báo số lần thử, thời gian đào, số MC nhận được, và thông báo khi mạng đổi độ khó hoặc khi halving.
- Bảng **Lịch sử đào gần đây** liệt kê từng block: thợ đào, độ khó, số lần thử, thời gian đào, thưởng + phí.
- Có thể chuyển sang màn hình khác trong lúc đào. Việc đào vẫn chạy và hoàn tất.
- Nếu chuỗi đang **bị sửa đổi**, ứng dụng không cho đào. Phải sửa chuỗi trước.

### 4.5. Khám phá chuỗi
- Mỗi block hiển thị số thứ tự, thời gian, người đào, thời gian đào, số xác nhận, **hash**, **hash của block trước (previousHash)**, **Merkle root**, nonce, độ khó và bảng giao dịch (có cột phí).
- Giữa hai block có đường nối kèm ghi chú "previousHash khớp với hash block #…". Liên kết bị đứt thì đường nối chuyển đỏ.
- **Tìm kiếm** theo số block (`#1`), một phần hash, mã giao dịch hoặc tên ví.
- **Kiểm tra toàn chuỗi**: kiểm tra lại mọi block và báo kết quả.
- **Tải chuỗi (JSON)**: tải toàn bộ dữ liệu (ví, block, mempool) về máy dưới dạng file JSON.
- **Chế độ thử sửa dữ liệu**: số tiền của mọi giao dịch thành ô nhập, sửa được. Sau khi sửa:
  - Block bị sửa chuyển đỏ. Ứng dụng hiện **Merkle root tính lại** (khác Merkle root trong tiêu đề) và lý do không hợp lệ.
  - Nếu sửa giao dịch coinbase cho thợ đào nhận nhiều hơn thưởng + phí, block vi phạm **luật đồng thuận** và vẫn không hợp lệ kể cả khi đào lại.
  - Nút **Đào lại block này** tìm nonce mới cho block đó. Block đó hợp lệ trở lại, nhưng **block kế tiếp đứt liên kết** vì hash đã đổi. Muốn che giấu việc sửa, phải đào lại toàn bộ các block phía sau. Đây là cách minh hoạ tính bất biến của blockchain.
- Giao dịch được ký bằng MetaMask có nhãn **✍ Đã ký**.

### 4.6. Ví MetaMask
Chỉ hoạt động khi mở ứng dụng qua link web và trình duyệt đã cài MetaMask. Trên điện thoại, cần mở link bên trong ứng dụng MetaMask.

1. **Kết nối**: bấm **Kết nối MetaMask** (ở thanh trên cùng hoặc trong màn hình này), rồi chọn tài khoản và xác nhận trong cửa sổ MetaMask.
2. **Thông tin tài khoản**: địa chỉ đầy đủ, mạng đang dùng (Ethereum, Sepolia, Polygon…), số dư ETH, link xem trên trình khám phá khối (Etherscan). Có các nút **Làm mới số dư**, **Chuyển sang Sepolia** và **Ngắt kết nối**.
3. **Liên kết & đăng nhập MiniChain**: bấm **Thêm vào MiniChain & đăng nhập** (hoặc **Đăng nhập MiniChain bằng ví này** nếu đã liên kết). MetaMask yêu cầu ký thông điệp đăng nhập; địa chỉ trở thành ví MiniChain (tên dạng "MetaMask ABCD", số dư ban đầu 0 MC) và bạn được đăng nhập bằng ví đó. Sau đó có thể:
   - **Đào block** để nhận MC thưởng.
   - **Gửi MC**. Mỗi giao dịch phải được **ký số** trong MetaMask (nội dung ký gồm người nhận, số tiền, phí, mã giao dịch). Chữ ký được lưu kèm giao dịch trong block.
4. **Ký thông điệp**: nhập nội dung bất kỳ rồi bấm **Ký bằng MetaMask** để nhận chữ ký số. Thao tác này chứng minh quyền sở hữu ví và không tốn phí.
5. **Gửi ETH thử nghiệm**: chỉ bật trên mạng thử nghiệm (Sepolia, Holesky, localhost) để tránh mất tiền thật. Nhập địa chỉ nhận và số lượng, xác nhận trong MetaMask, ứng dụng hiện mã giao dịch kèm link Etherscan.
6. **Nhật ký kết nối**: ghi lại các sự kiện kết nối, đổi tài khoản, đổi mạng, ký và gửi.

Ứng dụng tự cập nhật khi bạn đổi tài khoản hoặc đổi mạng trong MetaMask, và tự kết nối lại khi tải lại trang (trừ khi bạn đã bấm Ngắt kết nối).

> MiniChain **không bao giờ** hỏi cụm từ khôi phục (seed phrase) hay khoá bí mật. Mọi thao tác ký đều do bạn xác nhận trong MetaMask.

### 4.7. Hướng dẫn
- Giải thích 9 khái niệm: hàm băm, block & Merkle root, Proof-of-Work, phần thưởng – phí – halving, độ khó tự điều chỉnh, chuỗi liên kết, mempool & xác nhận, đăng nhập ví, ví MetaMask & chữ ký số.
- Ô **Thử hàm băm SHA-256**: gõ nội dung để thấy hash thay đổi hoàn toàn khi chỉ đổi 1 ký tự.
- Các bước kịch bản demo.

---

## 5. Kịch bản trình bày gợi ý (khoảng 5 phút)

1. **Tổng quan**: giới thiệu số block, tổng cung, trạng thái chuỗi hợp lệ.
2. **Đăng nhập ví** An (mật khẩu `123456`). Thử sai mật khẩu để thấy ứng dụng chặn.
3. **Giao dịch**: gửi 10 MC sang Bình với phí 0,5. Thử gửi vượt số dư để thấy ứng dụng chặn.
4. **Đào block**: bấm đào, giải thích tiêu đề block, nonce, hash có các số 0 ở đầu; chỉ ra coinbase = thưởng + phí. Đào thêm vài block để thấy độ khó tự tăng.
5. **Khám phá chuỗi**: chỉ ra `previousHash` của block sau trùng với `hash` của block trước.
6. Bật **Chế độ thử sửa dữ liệu**, đổi số tiền trong block #1: Merkle root lệch, block chuyển đỏ, nhãn trên cùng báo "Chuỗi bị sửa đổi", trang Đào block bị khoá.
7. Bấm **Đào lại** block #1: block #2 đứt liên kết. Kết luận: muốn gian lận phải đào lại cả chuỗi.
8. **Ví MetaMask**: đăng nhập bằng MetaMask (ký thông điệp đăng nhập), đào 1 block, rồi gửi MC. MetaMask hiện yêu cầu ký, giao dịch có nhãn "Đã ký".
9. Bấm **Đặt lại dữ liệu** để quay về trạng thái ban đầu.

## 6. Lưu trữ và đặt lại dữ liệu

- Dữ liệu lưu trong bộ nhớ trình duyệt (`localStorage`), nên tải lại trang vẫn giữ nguyên. Mỗi trình duyệt (hoặc mỗi máy) có dữ liệu riêng.
- **Đặt lại dữ liệu** xoá chuỗi hiện tại và tạo lại dữ liệu mẫu.
- Nếu dữ liệu lưu bị hỏng, ứng dụng tự tạo lại dữ liệu mẫu.

## 7. Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| Màn hình Ví MetaMask báo "Chưa tìm thấy MetaMask" | Cài tiện ích MetaMask, tải lại trang rồi bấm **Thử lại**. Nếu đang mở file `index.html`, hãy dùng link GitHub Pages. |
| "Bạn đã từ chối yêu cầu trong MetaMask" | Bạn đã bấm Từ chối trong MetaMask. Thực hiện lại thao tác và bấm Xác nhận. |
| "MetaMask đang có một yêu cầu chờ xử lý" | Mở biểu tượng MetaMask trên trình duyệt và xử lý yêu cầu đang chờ. |
| "Hãy chuyển sang 0x… để ký" khi gửi MC | Trong MetaMask, chọn đúng tài khoản đã liên kết với ví MiniChain. |
| Không gửi được ETH | Chức năng chỉ bật trên mạng thử nghiệm. Bấm **Chuyển sang Sepolia**. |
| Nhãn "Chuỗi bị sửa đổi", không đào được | Vào Khám phá chuỗi, **Đào lại** lần lượt các block đỏ, hoặc bấm **Đặt lại dữ liệu**. |
| Trang hiển thị bản cũ sau khi cập nhật | Nhấn `Ctrl + F5` (Windows) hoặc `Cmd + Shift + R` (macOS) để tải lại hoàn toàn. |
