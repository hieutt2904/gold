# Dự báo giá vàng XAU

Web tĩnh dự báo xu hướng giá vàng ngắn hạn (1-5 ngày) bằng tổ hợp chỉ báo kỹ thuật,
chạy hoàn toàn ở frontend — phù hợp triển khai trên GitHub Pages.

## Tính năng

- Giá XAU/USD theo thời gian thực từ [GoldAPI.io](https://www.goldapi.io).
- Quy đổi linh hoạt: **USD / VND**, đơn vị **ounce / gram / lượng (37.5g)**.
- Biểu đồ tương tác (Chart.js): giá + SMA 7/21 + Bollinger Bands; RSI(14); MACD(12,26,9).
- **Dự báo xu hướng** tổng hợp từ 5 chỉ báo: SMA crossover, EMA crossover, RSI, MACD, Bollinger Bands — kèm điểm tin cậy.
- Cache localStorage để tiết kiệm request (free tier GoldAPI giới hạn).
- Bảng lịch sử giá, thay đổi theo ngày.

## Cấu trúc

```
gold/
├── index.html
├── css/style.css
├── js/
│   ├── api.js          # Gọi GoldAPI, FX, quản lý cache
│   ├── indicators.js   # SMA, EMA, RSI, MACD, Bollinger, slope
│   ├── predictor.js    # Tổng hợp tín hiệu, tính điểm tin cậy
│   ├── charts.js       # Render Chart.js
│   └── app.js          # Điều phối UI, state, sự kiện
└── .nojekyll
```

## Logic dự báo

Mỗi chỉ báo trả về một điểm số trong [-1, +1]:

| Chỉ báo | Tăng (+1) | Giảm (-1) |
|---|---|---|
| SMA 7/21 | SMA nhanh cắt lên SMA chậm | Cắt xuống |
| EMA 12/26 | EMA nhanh cắt lên EMA chậm | Cắt xuống |
| RSI(14) | < 30 (quá bán) | > 70 (quá mua) |
| MACD | MACD cắt lên signal | Cắt xuống |
| Bollinger Bands | Giá chạm dải dưới | Chạm dải trên |

**Composite score** = trung bình có trọng số (MACD và EMA có trọng số cao hơn).
**Confidence** = 0.5 × |composite| + 0.3 × tỷ lệ đồng thuận + 0.2 × xác nhận trend (slope hồi quy tuyến tính 7 ngày).

Ngưỡng phân loại nhãn:
- composite > 0.35 → **TĂNG**
- 0.12 < composite ≤ 0.35 → **TĂNG NHẸ**
- |composite| ≤ 0.12 → **ĐI NGANG**
- ... đối xứng cho phía giảm.

## Chạy local

Cần serve qua HTTP (không mở file:// vì dùng ES modules):

```bash
cd gold
python3 -m http.server 8080
# truy cập http://localhost:8080
```

## Triển khai GitHub Pages

1. Push thư mục `gold/` lên repository.
2. Settings → Pages → Source: branch `main` (root hoặc `/docs`).
3. File `.nojekyll` đã có sẵn để bỏ qua Jekyll.

## Lưu ý request

- Lần load đầu tiên backfill ~30-45 ngày làm việc (~30 request GoldAPI).
- Sau đó mỗi ngày chỉ tốn ~1 request (giá hiện tại) + bù các ngày thiếu nếu có.
- Nút **↻** cho phép làm mới (kèm xác nhận để tránh hết quota).

## Disclaimer

Đây là công cụ phân tích kỹ thuật, **không phải lời khuyên đầu tư**. Thị trường vàng chịu ảnh hưởng của
nhiều yếu tố vĩ mô (lãi suất, USD index, tin tức địa chính trị) mà các chỉ báo kỹ thuật không phản ánh hết.
