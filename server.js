const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 5000;

// ==========================================
// API SUNWIN TÀI XỈU DUY NHẤT
// ==========================================
const API_URL = 'https://era-technology-particular-domestic.trycloudflare.com/api/tx';

// ==========================================
// LƯU TRỮ DỮ LIỆU
// ==========================================
let lichSuKetQua = [];        // Lưu kết quả thực tế các phiên
let lichSuDuDoan = [];        // Lưu lịch sử dự đoán
let thongKe = { tong: 0, dung: 0, sai: 0, tiLe: '0%' };
let cache = new Map();        // Cache để F5 không đổi kết quả

// ==========================================
// CẬP NHẬT THỐNG KÊ
// ==========================================
function capNhatThongKe(thucTe, duDoan) {
  const dung = (thucTe === duDoan);
  if (dung) thongKe.dung++;
  else thongKe.sai++;
  thongKe.tong++;
  thongKe.tiLe = ((thongKe.dung / thongKe.tong) * 100).toFixed(1) + '%';
  return dung;
}

// ==========================================
// LẤY DỮ LIỆU TỪ API NGUỒN
// ==========================================
async function layDuLieu() {
  try {
    const res = await axios.get(API_URL, { timeout: 10000 });
    const data = res.data;
    if (!data || !data.ket_qua) return null;
    
    let ketQua = data.ket_qua;
    if (ketQua === 'tài' || ketQua === 'TAI' || ketQua === 'Tài') ketQua = 'Tài';
    else if (ketQua === 'xiu' || ketQua === 'XIU' || ketQua === 'Xỉu') ketQua = 'Xỉu';
    else return null;
    
    return {
      phien: data.phien,
      ket_qua: ketQua,
      tong: data.tong || (data.xuc_xac_1 + data.xuc_xac_2 + data.xuc_xac_3),
      dice: [data.xuc_xac_1, data.xuc_xac_2, data.xuc_xac_3]
    };
  } catch (err) {
    console.error('Lỗi lấy dữ liệu:', err.message);
    return null;
  }
}

// ==========================================
// THUẬT TOÁN DỰ ĐOÁN (CÂN BẰNG - KHÔNG THIÊN VỊ)
// ==========================================
function duDoan(lichSu) {
  if (lichSu.length < 5) {
    return { du_doan: "Tài", do_tin_cay: 55, giai_thich: "Chưa đủ dữ liệu (cần 5 phiên)" };
  }
  
  let diemTai = 0, diemXiu = 0;
  let soPhuongPhap = 0;
  
  // 1. PHÂN TÍCH CHUỖI BỆT (chỉ bẻ khi bệt dài)
  let bet = 1;
  for (let i = 1; i < lichSu.length; i++) {
    if (lichSu[i] === lichSu[0]) bet++;
    else break;
  }
  soPhuongPhap++;
  if (bet >= 5) {
    if (lichSu[0] === "Tài") diemXiu += 88;
    else diemTai += 88;
  } else if (bet === 4) {
    if (lichSu[0] === "Tài") diemXiu += 80;
    else diemTai += 80;
  } else if (bet === 3) {
    if (lichSu[0] === "Tài") diemXiu += 70;
    else diemTai += 70;
  } else {
    if (lichSu[0] === "Tài") diemTai += 60;
    else diemXiu += 60;
  }
  
  // 2. TẦN SUẤT 10 PHIÊN (bẻ khi quá nóng)
  if (lichSu.length >= 10) {
    soPhuongPhap++;
    const last10 = lichSu.slice(0, 10);
    const tai10 = last10.filter(r => r === "Tài").length;
    if (tai10 >= 8) diemXiu += 85;
    else if (tai10 <= 2) diemTai += 85;
    else if (tai10 >= 7) diemXiu += 78;
    else if (tai10 <= 3) diemTai += 78;
    else if (tai10 >= 6) diemXiu += 70;
    else if (tai10 <= 4) diemTai += 70;
    else { diemTai += 60; diemXiu += 60; }
  }
  
  // 3. CẦU 1-1 (xen kẽ)
  if (lichSu.length >= 5) {
    soPhuongPhap++;
    let zigzag = 0;
    for (let i = 1; i < 5; i++) {
      if (lichSu[i] !== lichSu[i-1]) zigzag++;
    }
    if (zigzag >= 3) {
      if (lichSu[0] === "Tài") diemXiu += 75;
      else diemTai += 75;
    } else {
      if (lichSu[0] === "Tài") diemTai += 60;
      else diemXiu += 60;
    }
  }
  
  // 4. XU HƯỚNG 5 PHIÊN (theo xu hướng)
  soPhuongPhap++;
  const last5 = lichSu.slice(0, 5);
  const tai5 = last5.filter(r => r === "Tài").length;
  if (tai5 >= 3) diemTai += 65;
  else diemXiu += 65;
  
  // KẾT LUẬN
  const duDoanCuoi = diemTai > diemXiu ? "Tài" : "Xỉu";
  let doTinCay = Math.abs(diemTai - diemXiu) / (diemTai + diemXiu) * 100;
  doTinCay = Math.min(92, Math.max(55, doTinCay));
  
  return {
    du_doan: duDoanCuoi,
    do_tin_cay: Math.round(doTinCay),
    giai_thich: `${soPhuongPhap} phương pháp | Điểm Tài:${Math.round(diemTai)} - Xỉu:${Math.round(diemXiu)}`
  };
}

// ==========================================
// API CHÍNH
// ==========================================
app.get('/sunwin-tx', async (req, res) => {
  try {
    // Lấy dữ liệu mới nhất
    const data = await layDuLieu();
    if (!data) {
      return res.status(503).json({ error: 'Không lấy được dữ liệu từ API nguồn' });
    }
    
    // Lấy dự đoán của phiên trước (đã lưu trong cache)
    const duDoanTruoc = cache.get(data.phien - 1);
    
    // Nếu có dự đoán trước, cập nhật kết quả đúng/sai
    if (duDoanTruoc && duDoanTruoc.du_doan) {
      const dung = capNhatThongKe(data.ket_qua, duDoanTruoc.du_doan);
      
      // Lưu vào lịch sử dự đoán
      lichSuDuDoan.unshift({
        phien: duDoanTruoc.phien_du_doan,
        du_doan: duDoanTruoc.du_doan,
        do_tin_cay: duDoanTruoc.do_tin_cay,
        thuc_te: data.ket_qua,
        ket_qua: dung ? 'ĐÚNG' : 'SAI',
        thoi_gian: new Date().toISOString()
      });
      // Giữ lịch sử tối đa 50 phiên
      if (lichSuDuDoan.length > 50) lichSuDuDoan.pop();
    }
    
    // Lưu kết quả thực tế vào lịch sử
    lichSuKetQua.unshift(data.ket_qua);
    if (lichSuKetQua.length > 200) lichSuKetQua.pop();
    
    // Kiểm tra cache: nếu đã dự đoán phiên này rồi thì trả lại kết quả cũ (F5 không đổi)
    if (cache.has(data.phien)) {
      const cached = cache.get(data.phien);
      return res.json({
        success: true,
        game: 'SUNWIN TÀI XỈU',
        phien_hien_tai: data.phien,
        ket_qua_truoc: {
          phien: data.phien,
          ket_qua: data.ket_qua,
          dice: data.dice,
          tong: data.tong
        },
        du_doan: {
          phien_tiep_theo: data.phien + 1,
          du_doan: cached.du_doan,
          do_tin_cay: cached.do_tin_cay + '%',
          giai_thich: cached.giai_thich
        },
        lich_su_du_doan: lichSuDuDoan.slice(0, 20),
        thong_ke: thongKe,
        author: '@tranhoang2286'
      });
    }
    
    // Dự đoán cho phiên tiếp theo
    const duDoanMoi = duDoan(lichSuKetQua);
    
    // Lưu vào cache
    cache.set(data.phien, {
      phien_du_doan: data.phien + 1,
      du_doan: duDoanMoi.du_doan,
      do_tin_cay: duDoanMoi.do_tin_cay,
      giai_thich: duDoanMoi.giai_thich
    });
    
    // Giới hạn cache (giữ 20 phiên)
    if (cache.size > 20) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }
    
    // Trả về kết quả
    res.json({
      success: true,
      game: 'SUNWIN TÀI XỈU',
      phien_hien_tai: data.phien,
      ket_qua_truoc: {
        phien: data.phien,
        ket_qua: data.ket_qua,
        dice: data.dice,
        tong: data.tong
      },
      du_doan: {
        phien_tiep_theo: data.phien + 1,
        du_doan: duDoanMoi.du_doan,
        do_tin_cay: duDoanMoi.do_tin_cay + '%',
        giai_thich: duDoanMoi.giai_thich
      },
      lich_su_du_doan: lichSuDuDoan.slice(0, 20),
      thong_ke: thongKe,
      author: '@tranhoang2286'
    });
    
  } catch (err) {
    console.error('Lỗi:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// API XEM LỊCH SỬ RIÊNG
// ==========================================
app.get('/lich-su', (req, res) => {
  res.json({
    lich_su_du_doan: lichSuDuDoan.slice(0, 30),
    lich_su_ket_qua: lichSuKetQua.slice(0, 30),
    thong_ke: thongKe
  });
});

// ==========================================
// API XEM THỐNG KÊ
// ==========================================
app.get('/thong-ke', (req, res) => {
  res.json({ thong_ke: thongKe });
});

// ==========================================
// ROOT
// ==========================================
app.get('/', (req, res) => {
  res.json({
    name: '🎲 SUNWIN TÀI XỈU - API DỰ ĐOÁN 🎲',
    author: '@tranhoang2286',
    version: '1.0 - GỌN NHẸ',
    endpoints: {
      'Dự đoán chính': '/sunwin-tx',
      'Lịch sử dự đoán': '/lich-su',
      'Thống kê': '/thong-ke'
    },
    huong_dan: 'Gọi /sunwin-tx để nhận dự đoán phiên tiếp theo'
  });
});

// ==========================================
// KHỞI ĐỘNG SERVER
// ==========================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎲 SUNWIN TÀI XỈU API - PORT ${PORT}`);
  console.log(`✅ Endpoint chính: http://localhost:${PORT}/sunwin-tx`);
  console.log(`✅ Lịch sử: http://localhost:${PORT}/lich-su`);
  console.log(`✅ Thống kê: http://localhost:${PORT}/thong-ke`);
});