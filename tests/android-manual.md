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
