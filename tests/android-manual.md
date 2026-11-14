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
23. [BỎ Ở v18 — màn Quản lý tag đã xóa, xem case 54.] Quản lý tag: bấm "Quản lý tag" ở đầu danh sách, trang liệt kê mọi tag kèm
    số ghi chú. Bấm Đổi tên một tag: sửa tên rồi Lưu, tên mới hiện ở cả danh
    sách nhóm lẫn chip tag trong note; đổi tên thành tên tag khác (không phân
    biệt hoa thường) thì gộp: hai tag thành một, note của cả hai đều mang tag
    gộp. Tên để trống thì báo lỗi, không lưu. Nút Back quay về danh sách.
24. Xóa tag: bấm Xóa ở tag còn ghi chú, hộp xác nhận ghi rõ sẽ gỡ tag khỏi N
    ghi chú; đồng ý thì tag biến mất nhưng các ghi chú vẫn còn. Tag 0 ghi chú
    xóa thẳng sau xác nhận.
25. [BỎ Ở v18 — kéo tiêu đề nhóm không còn đổi thứ tự nhóm; nhấn giữ tiêu
    đề nhóm giờ là đổi tên tag (xem case 54), xếp note trong nhóm xem
    case 63.] Kéo tiêu đề nhóm đổi thứ tự: nhấn giữ tiêu đề một nhóm tag khoảng nửa
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
28. Thanh điều hướng dưới cùng v18: ở danh sách và sao lưu hiện thanh dưới
    3 mục — Ghi chú (icon nhà 26px) — nút + tròn đỏ 56px nằm gọn trong
    thanh (không nhô lên trên mép) — Sao lưu (icon mây 26px); nền thanh đặc
    #fffdf7 + bóng mờ phía trên, không có nền/viền cũ. Mục đang mở có viên
    thuốc đỏ nhạt 60x36 sau icon + chữ đỏ đậm; mục kia không có viên thuốc.
    Bấm từng mục thì chuyển đúng màn. Nhóm cuối danh sách không bị thanh
    dưới che mất. Đang kéo note thì vùng thùng rác hiện phía trên thanh
    dưới, không bị che. Mở editor thì không có thanh dưới; ở Thùng rác thì
    thanh dưới cũng ẩn (thùng rác có menu riêng của nó). Đang chế độ chọn
    mà bấm mục "Ghi chú" thì thoát chế độ chọn về danh sách.

29. Thêm 5 màu và mặc định trắng: mở editor của một note, hàng chấm màu
    có đủ 15 chấm (10 màu cũ + đào, lavender, xanh biển nhạt, xanh rêu,
    trắng). Chấm trắng nhìn thấy rõ trên nền kem (có viền). Chọn từng màu
    mới thì ô note đổi sang màu đó, viền cạnh trái đổi theo. Bấm + tạo note
    mới thì note mới mặc định màu trắng.
    (v18: bỏ viền cạnh trái ở thẻ note — đổi màu chỉ đổi nền thẻ, xem case 57.)

## Nhắc hẹn native + bảng nhắc trong app (v18)

(Trường hợp 26 vẫn đúng về hành vi nhắc trong app; trường hợp 30 kiểm
thiết kế bảng nhắc mới thay cho bảng cũ.)

30. Bảng nhắc trong app (thiết kế mới): mở một note, đặt nhắc hẹn sau
    2 phút nữa, để app mở. Tới giờ (trong vòng 1 phút) thì bảng "Nhắc hẹn"
    hiện: chuông đỏ trong vòng tròn đỏ nhạt + dòng "1 ghi chú tới giờ nhắc."
    + dòng note có chấm màu, tiêu đề in đậm, dòng "Nhắc lúc HH:MM ngày D/M"
    và dấu ›. Bấm nền mờ hoặc nút Đóng thì bảng tắt. Bấm vào dòng note thì
    mở đúng note đó. Chỉ kêu bíp 1 lần. Mở lại note thì ô nhắc hẹn trống,
    không nhắc lại nữa. Đặt 2 note cùng giờ thì bảng hiện đủ 2 dòng.
31. Thông báo khi app đóng: đặt nhắc hẹn sau 2 phút, tắt app hẳn (vuốt
    khỏi đa nhiệm). Tới giờ thì thông báo hiện: kêu đúng âm chuông vừa nhẹ
    đã chọn, tiêu đề là tiêu đề note, nội dung thu gọn là 1 dòng + "…",
    chỉ có 1 icon sổ ghi chú trắng (không có icon lớn thứ hai), không có
    đường kẻ ngang trên dãy nút bấm.
32. Dạng mở rộng của thông báo: kéo thông báo ở trường hợp 31 xuống thì
    thấy đủ nội dung tới khoảng 10 dòng; note dài hơn 10 dòng thì nội dung
    bị cắt và có "…" ở cuối. Bấm vào thân thông báo thì mở app tới đúng
    note đó (không về danh sách chung).
33. Ba nút bấm: mở rộng thông báo thì thấy đúng 3 nút "Mở ghi chú" /
    "Nhắc lại 15 phút" / "Đã xong". Bấm "Mở ghi chú" thì mở app tới đúng
    note và thông báo biến khỏi thanh trạng thái.
34. Nhắc lại 15 phút: đặt nhắc hẹn, tắt app, tới giờ bấm "Nhắc lại 15 phút"
    thì thông báo biến mất; đúng 15 phút sau chuông kêu lại với cùng tiêu
    đề và nội dung. Mở app trong lúc chờ thì bảng nhắc trong app không hiện
    (giờ hẹn đã dời đi 15 phút).
35. Đã xong: đặt nhắc hẹn, tắt app, tới giờ bấm "Đã xong" thì thông báo và
    báo thức biến mất; mở app lên thì note đó không còn nhắc hẹn và bảng
    nhắc trong app không hiện lại nữa.
36. Từ chối quyền thông báo (Android 13 trở lên): gỡ app, cài lại, đặt
    nhắc hẹn lần đầu thì hệ thống hỏi quyền thông báo — chọn Từ chối.
    Nhắc hẹn vẫn đặt được; tới giờ khi app đóng thì không có thông báo
    nhưng mở app lên bảng nhắc trong app vẫn hiện. Đặt nhắc hẹn lần sau
    không hỏi quyền lại nữa. Bật lại quyền trong Cài đặt app rồi đặt nhắc
    mới thì thông báo hiện bình thường.

## Editor v18

37. Bấm + rồi bấm ngay nút Tạo (không gõ gì): toast đỏ "Chưa nhập nội
    dung.", vẫn ở trong editor, về danh sách thì không có note trống nào
    mới. Bấm + rồi gõ tiêu đề, bấm Tạo: toast "Đã tạo ghi chú.", về danh
    sách, note đó nằm trong danh sách.
38. Mở một note cũ, sửa chữ rồi bấm Lưu: toast "Đã lưu.", về danh sách,
    nội dung mới vẫn còn khi mở lại. Gõ rồi chờ 800ms không gõ nữa: dòng
    dưới hai thẻ đổi thành "Đã lưu".
39. Bấm + rồi bấm Bỏ (không gõ gì): về danh sách im lặng, không hộp thoại,
    không có note trống mới. Bấm + rồi gõ vài chữ, bấm Bỏ: hộp thoại "Bỏ
    ghi chú này?" (chữ "không được lưu" đỏ đậm); bấm nền mờ thì ở lại
    editor; bấm "Bỏ ghi chú" thì về danh sách và note nháp biến mất.
40. Mở một note cũ, bấm mục Thùng rác ở menu dưới: hộp thoại ghi tên note
    in đậm + "sẽ được giữ trong thùng rác 30 ngày."; đồng ý thì hai thẻ
    mờ dần + co lại, toast "Đã cho ghi chú vào thùng rác.", về danh sách,
    note đó nằm trong Thùng rác (khôi phục được).
41. Editor có 2 thẻ riêng: thẻ tiêu đề trắng, thẻ nội dung mang màu note;
    đổi màu thì chỉ thẻ nội dung đổi màu, thẻ tiêu đề vẫn trắng. Dòng dưới
    thẻ ghi "Đã sửa … · N từ", gõ thêm chữ thì số từ nhảy ngay.
42. Menu dưới của editor có 5 mục (Màu / Tag / Nhắc hẹn / Ghim / Bỏ hoặc
    Thùng rác), không có thanh điều hướng chung. Bấm Ghim: ghim đỏ đặc +
    chữ đỏ, note lên đầu danh sách; bấm lại thì bỏ ghim.
43. Sheet Màu: đủ 15 chấm theo thứ tự cầu vồng; bấm một chấm thì sheet
    đóng ngay, thẻ nội dung đổi sang màu đó. Bấm nền mờ hoặc ✕ thì đóng
    sheet, màu không đổi.
44. Sheet Tag: chip tag hiện icon + tên, nền màu riêng của tag; bấm × thì
    tag rời khỏi note. Gõ tên mới rồi bấm Thêm: chip hiện ngay, sheet vẫn
    mở. Gõ tên đã có sẵn thì toast đỏ "Tên tag này đã có rồi.". Để trống
    ô rồi bấm Thêm thì toast "Gõ tên tag trước đã.". Bấm vào một chip:
    ô nhập + hàng icon/màu hiện đúng tên/icon/màu của tag đó, nút đổi
    thành Lưu; đổi tên/icon/màu rồi bấm Lưu thì tag đổi theo ở cả danh
    sách nhóm. Tag mới tạo mang đúng icon/màu đã chọn (mặc định icon tag
    + kem). Hàng icon có đủ 21 lựa chọn, "không icon" đứng đầu; hàng màu
    có 16 ô, kem đứng đầu.
45. Sheet Nhắc hẹn: 4 chip nhanh — bấm "15 phút nữa" thì ô giờ điền đúng
    giờ hiện tại + 15 phút; "1 giờ nữa" thì + 1 giờ; "Tối nay 20:00" thì
    hôm nay 20:00; "Sáng mai 8:00" thì ngày mai 8:00. Gõ tay vào ô giờ
    thì chip nhanh hết chọn. Để trống ô rồi bấm Đặt thì toast đỏ "Chưa
    chọn thời gian.". Bấm Đặt thì toast "Đã đặt nhắc hẹn." và hiện dòng
    "Nhắc lúc HH:MM ngày D/M" kèm nút Gỡ; bấm Gỡ thì toast "Đã gỡ nhắc
    hẹn." và dòng đó biến mất.
46. Nhắc hẹn qua đêm (chỉ kiểm khi có máy thật + thông báo native):
    đặt nhắc hẹn rồi tắt app hẳn, tới giờ thì thông báo vẫn hiện; bấm
    thông báo thì mở đúng ghi chú đó.
47. Gõ tiếng Việt Telex trong editor (Gboard): đang gõ dở âm tiết thì chữ
    không bị mất hay nhảy, ngừng gõ 800ms thì tự lưu, thoát editor rồi mở
    lại vẫn đủ chữ.
48. Xoay màn hình / mở bàn phím trong editor: menu 5 mục ở đáy không che
    thẻ nội dung (cuộn xuống vẫn thấy hết), sheet mở lên vẫn thấy đủ ô
    nhập và nút Đặt/Thêm.

## Thùng rác + sao lưu v18

49. Thùng rác đổi kiểu xem: vào Thùng rác, mặc định là danh sách hàng ngang
    (mỗi thẻ: tiêu đề, nội dung 2 dòng, dòng "Đã xóa X ngày trước · còn Y
    ngày", 2 nút chữ Khôi phục / Xóa hẳn). Bấm nút đổi kiểu xem ở đầu trang
    thì chuyển sang lưới 2 cột, thẻ nhỏ gọn, mỗi ô chỉ còn 2 nút tròn
    (hoàn tác / thùng rác) ghim sát đáy ô; nội dung dài vẫn cắt "..." chứ
    không đẩy nút lệch. Bấm lại thì về danh sách. Thẻ giữ đúng màu gốc của
    note (màu nhạt, bo góc to, bóng mềm).
50. Thùng rác: menu ngữ cảnh + khôi phục nhanh. Vào Thùng rác: cuối trang
    chỉ có menu [Chọn] [Dọn sạch], không có nút + và không có Ghi chú /
    Sao lưu. Bấm [Chọn] thì toast ngắn "Chạm thẻ để chọn." hiện đúng 1 lần,
    mỗi thẻ hiện ô tick tròn, đầu trang ghi "Đã chọn N". Chạm 2 thẻ rồi bấm
    [Khôi phục nhanh]: cả 2 note về danh sách ngay, không hỏi xác nhận.
    Bấm [Chọn] rồi bấm nút ✕ tròn ở giữa (hoặc nút Back): thoát chế độ chọn
    im lặng, không toast. Bấm [Chọn], chọn 2 thẻ, bấm [Xóa hẳn]: hộp xác
    nhận giữa màn hình ghi "Xóa hẳn 2 ghi chú?" và "xóa vĩnh viễn" đỏ đậm;
    đồng ý thì 2 thẻ mờ + thu nhỏ rồi biến mất. Bấm [Xóa hẳn] trên 1 thẻ:
    hộp xác nhận ghi rõ tiêu đề note đó. Bấm [Dọn sạch]: hộp xác nhận ghi
    "Dọn sạch thùng rác?" và số ghi chú. Note nào còn nhắc hẹn mà xóa hẳn
    thì tới giờ hẹn không nhắc nữa. Vẫn còn [Dọn sạch] trong menu, không
    còn nút Dọn sạch ở đầu trang.
51. Sao lưu: bản mẫu + kiểm tra nhập. Vào Sao lưu: nút [Xuất bản sao lưu]
    đỏ đặc, nút [Nhập bản sao lưu] viền đỏ, dưới ô nhập có dòng "Bản mẫu —
    xóa rồi dán bản của bạn vào, hoặc bấm Nhập luôn để thử." (nút xuất đổi
    tên từ "Chia sẻ bản sao lưu" ở case 27). Ô nhập đã điền sẵn bản JSON mẫu
    in đẹp (version 1, 2 ghi chú, tag "Mẫu"). Bấm [Nhập bản sao lưu] luôn:
    hộp xác nhận ghi đúng số ghi chú hiện tại và "Bản sao lưu có 2 ghi chú.";
    đồng ý thì toast "Đã nhập 2 ghi chú." và danh sách chỉ còn 2 ghi chú
    mẫu. Xóa hết ô nhập rồi bấm Nhập: toast đỏ "Chưa dán bản sao lưu.".
    Dán chữ không phải JSON rồi bấm Nhập: toast đỏ "Bản JSON không đúng
    định dạng.", dữ liệu không đổi. Bấm [Xuất bản sao lưu]: máy hiện bảng
    chia sẻ của Android (hoặc ô JSON để sao chép tay nếu máy không hỗ trợ).
52. Toast + dialog: vào Thùng rác bấm [Chọn]: toast "Chạm thẻ để chọn."
    chỉ hiện 1 lần; bấm ✕ hoặc Back thì thoát im lặng, không toast nào hiện.
    Mọi thao tác xóa hẳn / dọn sạch / nhập sao lưu đều dùng hộp thoại nổi
    giữa màn hình, bấm nền mờ thì hủy; không còn hộp xác nhận của hệ thống
    (window.confirm) ở hai màn Thùng rác và Sao lưu. Bấm nền mờ của hộp
    nhập sao lưu thì hủy, dữ liệu không đổi.

## Trang chính v18 (chip lọc, đổi tên tag inline, xếp note, menu chọn)

53. Chip lọc: dưới ô tìm kiếm có hàng chip "Tất cả" (mặc định đang chọn) +
    một chip cho mỗi tag + chip "Chưa gắn tag". Bấm chip một tag thì chỉ
    hiện đúng nhóm đó (kể cả khi đang tìm kiếm, chip vẫn lọc trong kết quả
    tìm). Bấm "Tất cả" thì về đủ nhóm. Chip của tag có icon thì hiện icon
    trước tên; tag không icon thì chỉ hiện tên. Chip không mang màu tag:
    chip chưa chọn nền trắng viền nhạt, chip đang chọn nền hồng nhạt + chữ
    đỏ đậm. Note không có tag chỉ hiện ở nhóm "Chưa gắn tag", không lọt
    vào nhóm tag nào.
54. Đổi tên tag ngay trên tiêu đề nhóm: nhấn giữ tên một tag khoảng nửa giây
    thì viên thuốc tên biến thành ô nhập ngay tại chỗ, kèm nút ✓ (lưu) và
    ✕ (hủy); bấm Enter thì lưu, Esc thì hủy. Sửa tên rồi bấm ✓: tên mới
    hiện ngay ở đầu nhóm (và ở chip tag trong note sau khi mở lại editor),
    icon/màu đã chọn trong cùng lần sửa cũng đổi theo (lưu chung 1 lần).
    Đổi tên thành tên tag khác (không phân biệt hoa thường) thì toast đỏ
    "Tên tag này đã có rồi." và ở lại form sửa, không lưu, không gộp.
    Tên để trống thì toast đỏ, không lưu. Nhóm "Chưa gắn tag" nhấn giữ
    tên không mở form đổi tên (không đổi được). Khi đang lọc đúng một tag
    thì đầu nhóm đó có thêm nút bút chì ✎ để mở cùng form đổi tên; bấm nút
    đó ở nhóm khác (không lọc) thì không có. Trong chế độ chọn, nhấn giữ
    tên tag không mở form đổi tên và nút bút chì cũng ẩn.
55. Icon tag: trong form đổi tên, hàng chọn icon có đủ 21 lựa chọn, lựa
    chọn đầu là "Không" (không hiện icon). Chọn một icon rồi lưu: icon
    hiện trước tên tag ở viên thuốc đầu nhóm và ở chip lọc; chọn "Không"
    rồi lưu thì viên thuốc và chip chỉ còn tên. Đổi icon mà không đổi tên
    vẫn lưu được (bấm ✓ là lưu cả tên + icon + màu).
56. Màu tag và nền khung nhóm: trong form đổi tên, hàng chấm màu có đủ 16
    chấm tròn 28px — kem đứng đầu, sau đó 15 màu theo thứ tự cầu vồng;
    chấm đang chọn có vòng đỏ + dấu ✓ đậm bên trong. Chọn một màu rồi lưu:
    viên thuốc tên tag đổi sang màu đó, và khung nhóm nhuộm nhạt theo màu
    tag (nền nhạt hơn màu tag, viền cũng nhạt theo). Tag màu kem thì khung
    về nền kem nhạt mặc định. Đổi màu mà không đổi tên vẫn lưu được.
57. Thứ tự màu + bảng màu nhạt: mở editor của một note, hàng chấm màu xếp
    đúng thứ tự cầu vồng (đỏ, cam, đào, vàng, xanh lá, xanh rêu, xanh
    mint, xanh biển nhạt, xanh dương, tím, lavender, hồng, nâu, xám,
    trắng). Thẻ note trên danh sách dùng đúng 15 màu pastel nhạt này (đỏ
    #f9c8c8 ... trắng #fffdf7), không còn màu đậm bản cũ; thẻ không có
    viền cạnh trái, không có kẻ dòng, bo góc 22 + bóng mờ nhẹ. Note mới
    mặc định màu trắng.
58. Chấm màu khi thu gọn nhóm: tạo một nhóm có note đủ màu (vd đỏ, vàng,
    xanh lá, hồng), thu gọn nhóm lại — bên phải viên thuốc tên tag hiện
    các chấm tròn nhỏ 12px, mỗi màu note khác nhau một chấm, xếp theo thứ
    tự bảng màu (đỏ trước vàng trước xanh lá trước hồng), không theo thứ
    tự note xuất hiện trong nhóm. Mở nhóm ra thì các chấm biến mất.
59. Đổi kiểu xem: đầu trang có nút đổi kiểu xem; bấm 1 lần thì danh sách
    đổi từ lưới ô vuông sang danh sách hàng ngang (mỗi note một hàng, vẫn
    đủ tiêu đề + nội dung); bấm nữa thì về lưới ô vuông. Kéo thả và chọn
    nhiều vẫn làm được ở cả hai kiểu xem.
60. Nút Thùng rác ở đầu trang: đầu trang danh sách có nút icon thùng rác
    (nét mảnh, tròn, không khung, không còn chữ "Thùng rác" như bản cũ);
    bấm thì mở màn Thùng rác. Nút xem lưới/danh sách và nút Chọn ở đầu
    trang cũng là nút icon tròn trơn như vậy.
61. Menu chọn ở màn chính: bấm nút Chọn (icon ✓ trong vòng tròn) ở đầu
    trang thì vào chế độ chọn — đầu trang ghi "Đã chọn N", thanh dưới đổi
    thành menu chọn: [Chọn tất cả] [✕ tròn kem ở giữa] [Thùng rác].
    Bấm "Chọn tất cả" thì chọn hết note đang hiện (đúng nhóm đang lọc +
    đúng từ đang tìm; note không khớp tìm kiếm thì không chọn). Note trong
    nhóm đang thu gọn vẫn được chọn (vì "Chọn tất cả" tính theo chip lọc
    + tìm kiếm, không tính trạng thái thu gọn); bấm lại thì thành "Bỏ chọn
    hết". Bấm "Thùng rác" thì
    toàn bộ note đã chọn vào thùng rác ngay (không hỏi lại), thoát chế
    độ chọn, toast "Đã cho N ghi chú vào thùng rác.". Bấm ✕ ở giữa thanh
    hoặc "Hủy" ở đầu trang thì thoát chế độ chọn im lặng, không xóa gì.
    Trong chế độ chọn, số "N note" ở đầu mỗi nhóm thành nút bấm: bấm thì
    chọn hết note đang hiện trong nhóm đó, nút đổi sang nền đỏ chữ trắng
    có "✓"; bấm lại thì bỏ chọn cả nhóm. Bấm nút Back cũng thoát chế độ
    chọn.
62. Đầu nhóm một hàng: mỗi nhóm tag chỉ có đúng một hàng đầu — bên trái
    là viên thuốc tên tag (nền là màu tag, chữ đậm 13px, có icon 14px),
    bên phải là "N note" (chữ đậm 12px, không có mũi tên ▾/▸). Bấm viên
    thuốc thì thu gọn/mở nhóm (không còn mũi tên chỉ trạng thái). Nhóm
    "Chưa gắn tag" cũng cùng một hàng như vậy, viên thuốc nền kem.
63. Kéo xếp lại thứ tự note trong nhóm: nhấn giữ một thẻ note khoảng nửa
    giây thì thẻ nhấc lên (bản sao bay theo tay, xoay nhẹ, bóng đậm; ô cũ
    thành khe viền đứt nét đỏ), kéo lên/xuống trong cùng nhóm rồi thả thì
    note đổi chỗ ngay trong nhóm đó. Note đã ghim chỉ xếp được giữa các
    note ghim (kéo xuống quá vùng ghim thì nó dừng ở cuối vùng ghim);
    note thường cũng vậy, không leo lên trên note ghim. Đang tìm kiếm
    (chỉ hiện vài note trong nhóm) mà kéo xếp thì các note không hiện
    vẫn giữ nguyên chỗ cũ. Tắt app hẳn, mở lại: thứ tự mới vẫn giữ
    nguyên. Kéo note sang nhóm khác vẫn gắn tag như cũ (không đổi thứ tự
    nhóm cũ); kéo note đã ghim sang nhóm khác thì note vẫn ghim.
64. Hiệu ứng xóa: kéo một note vào vùng thùng rác thì note mờ dần + co
    nhỏ lại (~350ms) rồi mới biến khỏi danh sách, kèm toast "Đã cho 1 ghi
    chú vào thùng rác.". Chọn nhiều note rồi bấm "Thùng rác" ở menu chọn
    thì tất cả các note đã chọn cùng mờ + co lại rồi biến, toast "Đã cho
    N ghi chú vào thùng rác.".
65. Ô tick chọn mềm: vào chế độ chọn, mỗi thẻ note hiện ô tick tròn ở góc
    trên-phải — chưa chọn thì viền nhạt (#d8cfba), nền trắng, trống;
    đã chọn thì nền đỏ, dấu ✓ trắng. Ô tick ở màn Thùng rác cũng cùng
    viền nhạt đó. Chip "Ghim" không hiện trong chế độ chọn (thẻ đã ghim
    vẫn ghim, chỉ ẩn chip lúc đang chọn).

66. Mở app: thấy ngay màn chờ (nền kem + icon sổ vàng + vòng xoay đỏ xoay
    đều), rồi mới vào danh sách — không có màn trắng ở bất cứ lúc nào
    (kể cả lần mở đầu tiên sau khi cài). Màn chờ biến mất ngay khi danh
    sách hiện, không kẹt lại, không che mất danh sách. Tắt app hẳn rồi mở
    lại thì màn chờ vẫn hiện như vậy.
