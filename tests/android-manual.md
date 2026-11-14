# Test thủ công trên điện thoại thật (chưa làm — cần máy Windows + điện thoại của kha)

Chạy sau khi có APK từ `docs/android-build.md`.

1. Cài APK, mở app: vào thẳng danh sách, không màn hình trắng, không crash.
2. Bấm +: tạo ghi chú mới, gõ tiêu đề + nội dung tiếng Việt (Gboard Telex),
   đang gõ dở không bị mất chữ, thoát editor rồi mở lại vẫn đủ chữ.
3. Đổi màu, ghim/bỏ ghim: ghim lên đầu danh sách, bỏ ghim về đúng thứ tự.
4. Tìm "đà nẵng" ra ghi chú "Đà Nẵng"; tìm từ không có ra danh sách trống.
5. Nút Back: ở editor về danh sách; ở danh sách thoát app.
6. Tắt app hẳn, mở lại: ghi chú vẫn còn (WAL + persist).
7. Xoay màn hình / mở bàn phím: toolbar không bị che, ô nhập không bị bàn phím đè.
8. Vuốt danh sách dài (tạo ~50 ghi chú): không giật rõ, không crash.

## Tag và kéo thả (thêm ở bản v2)

9. Trong editor, ô tag: gõ "Học" rồi bấm nút Thêm thì chip Học hiện; gõ lại "học"
   thì không tạo tag trùng; thoát editor rồi mở lại vẫn đủ tag.
   (Bấm Enter mà đang gõ Telex thì phím Enter bị bàn phím nuốt để chốt âm tiết
   nên tag không thêm được — đó là lỗi bản v2, nút Thêm mới thay cho Enter.)
10. Nhóm tag: note có tag Học và Thi hiện ở cả hai nhóm; note không có tag
    nằm ở nhóm Chưa gắn tag.
11. Kéo thả bằng tay: nhấn giữ một note khoảng nửa giây thì note nhấc lên
    (bản sao bay theo tay), kéo tới nhóm tag khác thì nhóm đó sáng lên,
    thả ra thì note mang tag đó. Cuộn danh sách bằng tay vẫn bình thường
    (vuốt nhanh không nhấc note lên).
12. Kéo một note vào nhóm Chưa gắn tag thì gỡ hết tag của note đó.
13. Đóng app hẳn, mở lại: tag và nhóm vẫn còn (migration v2 không mất
    dữ liệu cũ).
14. Gõ tag bằng Gboard Telex trong một note mới tạo: gõ xong bấm nút Thêm
    (không bấm Enter), chip tag hiện ngay; thoát editor rồi mở lại, note
    nằm đúng nhóm tag đó.
15. Thêm tag trong editor rồi bấm Quay lại ngay: danh sách hiện nhóm tag mới
    và số lượng đúng luôn, không cần tắt mở lại app (bản cũ nhóm mới chỉ
    hiện sau khi mở lại app vì danh sách không tải lại tag).
16. Thẻ note hình vuông: danh sách xếp lưới 2 cột trên điện thoại, mỗi thẻ
    là một ô vuông; tiêu đề dài cắt còn 2 dòng, nội dung dài cắt còn 4 dòng
    rồi "...", chip tag dồn xuống đáy ô. Kéo thả note vào nhóm tag vẫn làm
    được như cũ (nhấn giữ rồi kéo, nhóm sáng lên khi kéo tới).
17. Thu gọn nhóm tag rồi mở một note, quay lại danh sách: nhóm vẫn thu gọn
    như cũ (không mở hết lại). Tắt app hẳn, mở lại: trạng thái thu gọn/mở
    của từng nhóm vẫn giữ nguyên (lưu trong DB, migration v3).
18. Mở editor: dãy chấm màu có 10 màu (vàng, xanh lá, xanh dương, hồng, tím,
    cam, đỏ san hô, xanh mint, nâu giấy, xám) xếp 2 hàng, không tràn màn hình.
    Chọn từng màu mới: thẻ note đổi màu nền + viền trái đúng màu, note cũ giữ
    nguyên màu cũ.
19. Kéo một note vào thùng rác: nhấn giữ note, vùng thùng rác hiện ở đáy màn
    hình, kéo tới đó thì vùng sáng lên, thả ra thì note biến khỏi danh sách.
    Bấm nút Thùng rác ở đầu trang: note đó nằm trong thùng rác, hiện ngày xóa
    và số ngày còn lại. Tìm kiếm tên note đó ngoài danh sách không ra nữa.
20. Trong Thùng rác: bấm Khôi phục thì note quay lại danh sách đúng nhóm tag
    cũ; bấm Xóa hẳn thì note mất luôn; bấm Dọn sạch thì thùng rác trống.
    Mở một note rồi bấm Xóa trong editor: note vào thùng rác (không mất hẳn),
    quay về danh sách, vẫn khôi phục được từ Thùng rác.
21. Đóng app hẳn, mở lại: note trong thùng rác vẫn còn (migration v4 không
    mất dữ liệu cũ).
22. Chọn nhiều rồi kéo một lượt: bấm nút Chọn ở đầu trang, bấm 3 thẻ note
    (ô tick hiện, đầu trang ghi "Đã chọn 3"), nhấn giữ một thẻ đã chọn rồi
    kéo: bản sao bay theo tay ghi "3 ghi chú"; thả vào một nhóm tag thì cả
    3 note đều mang tag đó. Bấm Chọn rồi chọn 2 note khác, kéo cả 2 xuống
    thùng rác: cả 2 đều vào thùng rác. Bấm Hủy hoặc nút Back thì thoát chế
    độ chọn. Ngoài chế độ chọn, kéo 1 note vẫn như cũ (nhóm tag / thùng rác).
23. Quản lý tag: bấm "Quản lý tag" ở đầu danh sách, trang liệt kê mọi tag kèm
    số ghi chú. Bấm Đổi tên một tag: sửa tên rồi Lưu, tên mới hiện ở cả danh
    sách nhóm lẫn chip tag trong note; đổi tên thành tên tag khác (không phân
    biệt hoa thường) thì gộp: hai tag thành một, note của cả hai đều mang tag
    gộp. Tên để trống thì báo lỗi, không lưu. Nút Back quay về danh sách.
24. Xóa tag: bấm Xóa ở tag còn ghi chú, hộp xác nhận ghi rõ sẽ gỡ tag khỏi N
    ghi chú; đồng ý thì tag biến mất nhưng các ghi chú vẫn còn. Tag 0 ghi chú
    xóa thẳng sau xác nhận.
25. Kéo tiêu đề nhóm đổi thứ tự: nhấn giữ tiêu đề một nhóm tag khoảng nửa
    giây rồi kéo lên/xuống — vạch chèn hiện giữa các nhóm ở chỗ sẽ thả, thả
    ra thì nhóm đổi chỗ ngay. Bấm thường vào tiêu đề vẫn thu gọn/mở nhóm
    như cũ, kéo note vào nhóm/thùng rác vẫn như cũ. Tắt app hẳn, mở lại:
    thứ tự nhóm vẫn giữ nguyên. Nhóm "Chưa gắn tag" luôn ở cuối cùng, không
    kéo được. Tag đổi tên sẽ rơi xuống cuối danh sách nhóm (thứ tự lưu theo
    tên cũ).
26. Nhắc hẹn: mở một note, chọn ngày giờ sau 2 phút nữa rồi bấm "Đặt nhắc
    hẹn", quay về danh sách, để app mở — tới giờ (trong vòng 1 phút kể từ
    giờ hẹn vì app kiểm mỗi 60 giây) thì bảng nhắc hiện + kêu một tiếng bíp,
    bấm tên note trong bảng thì mở đúng note đó. Chỉ nhắc 1 lần: bảng nhắc
    đã đóng thì mở lại note, ô nhắc hẹn trống, không nhắc lại nữa. Tắt app
    rồi mới tới giờ hẹn thì không nhắc (chỉ nhắc khi app đang mở).
27. Sao lưu: bấm nút "Sao lưu" ở đầu danh sách, bấm "Chia sẻ bản sao lưu" —
    máy hiện bảng chia sẻ của Android (hoặc ô JSON để sao chép tay nếu máy
    không hỗ trợ chia sẻ). Xóa một note bất kỳ, rồi dán bản sao lưu vừa xuất
    vào ô Nhập, bấm "Nhập bản sao lưu", xác nhận: note vừa xóa về đủ, tag và
    trạng thái thu gọn nhóm cũng về như cũ. Nhập JSON sai hoặc sai version
    thì báo lỗi, dữ liệu không đổi.
