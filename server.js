const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 5000;

// ==========================================
// API SUNWIN TÀI XỈU
// ==========================================
const API_URL = 'https://era-technology-particular-domestic.trycloudflare.com/api/tx';

// ==========================================
// LƯU TRỮ DỮ LIỆU
// ==========================================
let lichSuKetQua = [];
let lichSuTongDiem = [];
let lichSuXucXac = [];
let lichSuDuDoan = [];
let thongKe = { tong: 0, dung: 0, sai: 0, tiLe: '0%' };
let cache = new Map();

// ==========================================
// DATABASE SIÊU ĐIỆN RỘNG (TỪ FILE CAU.TXT)
// ==========================================
let patternDatabase = new Map();
let patternFrequency = new Map();

function loadPatternDatabase() {
  const filePath = path.join(__dirname, 'cau.txt');
  if (!fs.existsSync(filePath)) {
    console.log('⚠️ Không tìm thấy file cau.txt, sử dụng database mẫu');
    return;
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  let count = 0;
  
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    
    if (line.includes(' - ')) {
      let [patternPart, resultPart] = line.split(' - ');
      
      if (patternPart.includes('. ')) {
        patternPart = patternPart.split('. ')[1];
      }
      
      const pattern = patternPart.trim();
      const result = resultPart.trim();
      
      if (/^[TX]+$/.test(pattern)) {
        const binaryPattern = pattern.split('').map(c => c === 'T' ? '1' : '0').join('');
        const target = result === 'T' ? 1 : 0;
        
        if (!patternDatabase.has(binaryPattern)) {
          patternDatabase.set(binaryPattern, target);
          patternFrequency.set(binaryPattern, 1);
          count++;
        } else {
          patternFrequency.set(binaryPattern, patternFrequency.get(binaryPattern) + 1);
        }
      }
    }
  }
  
  console.log(`✅ Đã tải ${count} pattern từ file cau.txt`);
  
  // Mở rộng database với các biến thể
  const entries = [...patternDatabase.entries()];
  for (let [pattern, target] of entries) {
    if (pattern.length < 6) continue;
    
    // Pattern đảo ngược
    const inverted = pattern.split('').map(c => c === '0' ? '1' : '0').join('');
    if (!patternDatabase.has(inverted)) {
      patternDatabase.set(inverted, 1 - target);
    }
    
    // Pattern gương
    const mirrored = pattern.split('').reverse().join('');
    if (!patternDatabase.has(mirrored)) {
      patternDatabase.set(mirrored, target);
    }
    
    // Pattern đảo gương
    const mirroredInverted = inverted.split('').reverse().join('');
    if (!patternDatabase.has(mirroredInverted)) {
      patternDatabase.set(mirroredInverted, 1 - target);
    }
  }
  
  console.log(`✅ Database mở rộng: ${patternDatabase.size} patterns`);
}

loadPatternDatabase();

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
// LẤY DỮ LIỆU
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
// ========== THUẬT TOÁN NÂNG CẤP ==========
// ==========================================

// Hàm chuyển đổi Tài/Xỉu sang số
function toNumber(r) { return r === "Tài" ? 1 : 0; }
function toString(n) { return n === 1 ? "Tài" : "Xỉu"; }

// 1. PHÂN TÍCH CẦU BỆT (Streak Analysis)
function phanTichBet(lichSu) {
  if (lichSu.length < 3) return { diemTai: 0, diemXiu: 0, soPP: 0 };
  let streak = 1;
  for (let i = 1; i < lichSu.length; i++) {
    if (lichSu[i] === lichSu[0]) streak++;
    else break;
  }
  if (streak >= 7) return { diemTai: lichSu[0] === "Tài" ? 0 : 96, diemXiu: lichSu[0] === "Tài" ? 96 : 0, soPP: 1 };
  if (streak >= 6) return { diemTai: lichSu[0] === "Tài" ? 0 : 93, diemXiu: lichSu[0] === "Tài" ? 93 : 0, soPP: 1 };
  if (streak === 5) return { diemTai: lichSu[0] === "Tài" ? 0 : 88, diemXiu: lichSu[0] === "Tài" ? 88 : 0, soPP: 1 };
  if (streak === 4) return { diemTai: lichSu[0] === "Tài" ? 0 : 82, diemXiu: lichSu[0] === "Tài" ? 82 : 0, soPP: 1 };
  if (streak === 3) return { diemTai: lichSu[0] === "Tài" ? 0 : 74, diemXiu: lichSu[0] === "Tài" ? 74 : 0, soPP: 1 };
  return { diemTai: 0, diemXiu: 0, soPP: 0 };
}

// 2. CẦU 1-1 (Alternating Pattern)
function cau1_1(lichSu) {
  if (lichSu.length < 5) return { diemTai: 0, diemXiu: 0, soPP: 0 };
  let alternating = true;
  for (let i = 1; i < 5; i++) {
    if (lichSu[i] === lichSu[i-1]) { alternating = false; break; }
  }
  if (alternating) {
    const next = lichSu[0] === "Tài" ? "Xỉu" : "Tài";
    return { diemTai: next === "Tài" ? 86 : 0, diemXiu: next === "Xỉu" ? 86 : 0, soPP: 1 };
  }
  return { diemTai: 0, diemXiu: 0, soPP: 0 };
}

// 3. CẦU 2-2 (Parallel Bridge)
function cau2_2(lichSu) {
  if (lichSu.length < 6) return { diemTai: 0, diemXiu: 0, soPP: 0 };
  const last6 = lichSu.slice(0, 6);
  if (last6.join('') === 'TàiTàiXỉuXỉuTàiTài') return { diemTai: 0, diemXiu: 85, soPP: 1 };
  if (last6.join('') === 'XỉuXỉuTàiTàiXỉuXỉu') return { diemTai: 85, diemXiu: 0, soPP: 1 };
  return { diemTai: 0, diemXiu: 0, soPP: 0 };
}

// 4. CẦU 3-3 (Extended Parallel)
function cau3_3(lichSu) {
  if (lichSu.length < 8) return { diemTai: 0, diemXiu: 0, soPP: 0 };
  const last8 = lichSu.slice(0, 8);
  if (last8.join('') === 'TàiTàiTàiXỉuXỉuXỉuTàiTài') return { diemTai: 0, diemXiu: 87, soPP: 1 };
  if (last8.join('') === 'XỉuXỉuXỉuTàiTàiTàiXỉuXỉu') return { diemTai: 87, diemXiu: 0, soPP: 1 };
  return { diemTai: 0, diemXiu: 0, soPP: 0 };
}

// 5. CẦU ĐỐI XỨNG (Mirror Bridge)
function cauDoiXung(lichSu) {
  if (lichSu.length < 7) return { diemTai: 0, diemXiu: 0, soPP: 0 };
  let isMirror = true;
  for (let i = 0; i < 3; i++) {
    if (lichSu[i] !== lichSu[6 - i]) { isMirror = false; break; }
  }
  if (isMirror) {
    const next = lichSu[3] === "Tài" ? "Xỉu" : "Tài";
    return { diemTai: next === "Tài" ? 82 : 0, diemXiu: next === "Xỉu" ? 82 : 0, soPP: 1 };
  }
  return { diemTai: 0, diemXiu: 0, soPP: 0 };
}

// 6. CẦU TAM GIÁC (Triangle Pattern)
function cauTamGiac(lichSu) {
  if (lichSu.length < 7) return { diemTai: 0, diemXiu: 0, soPP: 0 };
  const last7 = lichSu.slice(0, 7);
  if (last7.join('') === 'TàiXỉuTàiXỉuTàiXỉuTài') return { diemTai: 0, diemXiu: 78, soPP: 1 };
  if (last7.join('') === 'XỉuTàiXỉuTàiXỉuTàiXỉu') return { diemTai: 78, diemXiu: 0, soPP: 1 };
  return { diemTai: 0, diemXiu: 0, soPP: 0 };
}

// 7. CẦU VAI-ĐẦU-VAI (Head & Shoulders)
function cauVaiDauVai(lichSu) {
  if (lichSu.length < 7) return { diemTai: 0, diemXiu: 0, soPP: 0 };
  const last7 = lichSu.slice(0, 7);
  if (last7.join('') === 'XỉuTàiXỉuTàiXỉuTàiXỉu') return { diemTai: 80, diemXiu: 0, soPP: 1 };
  if (last7.join('') === 'TàiXỉuTàiXỉuTàiXỉuTài') return { diemTai: 0, diemXiu: 80, soPP: 1 };
  return { diemTai: 0, diemXiu: 0, soPP: 0 };
}

// 8. DATABASE TRA CỨU SIÊU ĐIỆN RỘNG
function traCuuDatabase(lichSu) {
  if (lichSu.length < 8 || patternDatabase.size === 0) return { diemTai: 0, diemXiu: 0, soPP: 0 };
  
  const windowSizes = [14, 12, 10, 8];
  for (let ws of windowSizes) {
    if (lichSu.length >= ws) {
      const pattern = lichSu.slice(0, ws).map(r => r === "Tài" ? "1" : "0").join('');
      
      if (patternDatabase.has(pattern)) {
        const target = patternDatabase.get(pattern);
        const freq = patternFrequency.get(pattern) || 1;
        let conf = ws >= 14 ? 94 : 90 - (14 - ws);
        conf = Math.min(96, conf + Math.min(5, freq / 20));
        return { diemTai: target === 1 ? conf : 0, diemXiu: target === 0 ? conf : 0, soPP: 1 };
      }
      
      const inverted = pattern.split('').map(c => c === '0' ? '1' : '0').join('');
      if (patternDatabase.has(inverted)) {
        const target = 1 - patternDatabase.get(inverted);
        const conf = ws >= 14 ? 92 : 88 - (14 - ws);
        return { diemTai: target === 1 ? conf : 0, diemXiu: target === 0 ? conf : 0, soPP: 1 };
      }
    }
  }
  
  // Fuzzy matching
  const longest = lichSu.slice(0, 14).map(r => r === "Tài" ? "1" : "0").join('');
  let bestSim = 0, bestTarget = null;
  for (let [dbPattern, target] of [...patternDatabase.entries()].slice(0, 500)) {
    if (dbPattern.length === longest.length) {
      let sim = 0;
      for (let i = 0; i < longest.length; i++) {
        if (longest[i] === dbPattern[i]) sim++;
      }
      sim = sim / longest.length;
      if (sim > bestSim && sim >= 0.75) {
        bestSim = sim;
        bestTarget = target;
      }
    }
  }
  if (bestTarget !== null) {
    const conf = 70 + (bestSim - 0.75) * 80;
    return { diemTai: bestTarget === 1 ? conf : 0, diemXiu: bestTarget === 0 ? conf : 0, soPP: 1 };
  }
  
  return { diemTai: 0, diemXiu: 0, soPP: 0 };
}

// 9. CHUỖI MARKOV BẬC CAO
function markovChain(lichSu) {
  if (lichSu.length < 6) return { diemTai: 0, diemXiu: 0, soPP: 0 };
  
  const nums = lichSu.map(r => r === "Tài" ? 1 : 0);
  const order = 4;
  const transitions = new Map();
  
  for (let i = 0; i < nums.length - order; i++) {
    const state = nums.slice(i, i + order).join(',');
    const next = nums[i + order];
    if (!transitions.has(state)) transitions.set(state, [0, 0]);
    const arr = transitions.get(state);
    arr[next]++;
  }
  
  const currentState = nums.slice(-order).join(',');
  if (transitions.has(currentState)) {
    const [count0, count1] = transitions.get(currentState);
    const total = count0 + count1;
    if (total >= 2) {
      const prob1 = count1 / total;
      const conf = Math.min(90, 60 + total * 2);
      if (prob1 >= 0.6) return { diemTai: conf, diemXiu: 0, soPP: 1 };
      if (prob1 <= 0.4) return { diemTai: 0, diemXiu: conf, soPP: 1 };
    }
  }
  
  return { diemTai: 0, diemXiu: 0, soPP: 0 };
}

// 10. RSI CHUẨN HÓA
function rsiIndicator(lichSu) {
  if (lichSu.length < 14) return { diemTai: 0, diemXiu: 0, soPP: 0 };
  const nums = lichSu.slice(0, 14).map(r => r === "Tài" ? 1 : 0);
  let gains = 0, losses = 0;
  for (let i = 1; i < nums.length; i++) {
    const diff = nums[i] - nums[i-1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const rsi = losses === 0 ? 100 : 100 - (100 / (1 + gains / losses));
  if (rsi >= 80) return { diemTai: 0, diemXiu: 86, soPP: 1 };
  if (rsi <= 20) return { diemTai: 86, diemXiu: 0, soPP: 1 };
  if (rsi >= 70) return { diemTai: 0, diemXiu: 80, soPP: 1 };
  if (rsi <= 30) return { diemTai: 80, diemXiu: 0, soPP: 1 };
  return { diemTai: 0, diemXiu: 0, soPP: 0 };
}

// 11. MACD
function macdIndicator(lichSu) {
  if (lichSu.length < 26) return { diemTai: 0, diemXiu: 0, soPP: 0 };
  const nums = lichSu.map(r => r === "Tài" ? 1 : 0);
  const ema12 = nums.slice(-12).reduce((a, b) => a + b, 0) / 12;
  const ema26 = nums.slice(-26).reduce((a, b) => a + b, 0) / 26;
  const macd = ema12 - ema26;
  if (macd > 0.12) return { diemTai: 0, diemXiu: 76, soPP: 1 };
  if (macd < -0.12) return { diemTai: 76, diemXiu: 0, soPP: 1 };
  return { diemTai: 0, diemXiu: 0, soPP: 0 };
}

// 12. BOLLINGER BANDS
function bollingerBands(lichSu) {
  if (lichSu.length < 20) return { diemTai: 0, diemXiu: 0, soPP: 0 };
  const nums = lichSu.slice(0, 20).map(r => r === "Tài" ? 1 : 0);
  const mean = nums.reduce((a, b) => a + b, 0) / 20;
  const variance = nums.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / 20;
  const std = Math.sqrt(variance);
  const last = nums[19];
  if (last > mean + 1.5 * std) return { diemTai: 0, diemXiu: 78, soPP: 1 };
  if (last < mean - 1.5 * std) return { diemTai: 78, diemXiu: 0, soPP: 1 };
  return { diemTai: 0, diemXiu: 0, soPP: 0 };
}

// 13. STOCHASTIC OSCILLATOR
function stochasticOsc(lichSu) {
  if (lichSu.length < 14) return { diemTai: 0, diemXiu: 0, soPP: 0 };
  const nums = lichSu.slice(0, 14).map(r => r === "Tài" ? 1 : 0);
  const highest = Math.max(...nums), lowest = Math.min(...nums);
  if (highest === lowest) return { diemTai: 0, diemXiu: 0, soPP: 0 };
  const k = (nums[13] - lowest) / (highest - lowest) * 100;
  if (k > 85) return { diemTai: 0, diemXiu: 78, soPP: 1 };
  if (k < 15) return { diemTai: 78, diemXiu: 0, soPP: 1 };
  return { diemTai: 0, diemXiu: 0, soPP: 0 };
}

// 14. WILLIAMS %R
function williamsR(lichSu) {
  if (lichSu.length < 14) return { diemTai: 0, diemXiu: 0, soPP: 0 };
  const nums = lichSu.slice(0, 14).map(r => r === "Tài" ? 1 : 0);
  const highest = Math.max(...nums), lowest = Math.min(...nums);
  if (highest === lowest) return { diemTai: 0, diemXiu: 0, soPP: 0 };
  const wr = (highest - nums[13]) / (highest - lowest) * -100;
  if (wr < -85) return { diemTai: 78, diemXiu: 0, soPP: 1 };
  if (wr > -15) return { diemTai: 0, diemXiu: 78, soPP: 1 };
  return { diemTai: 0, diemXiu: 0, soPP: 0 };
}

// 15. CCI
function cciIndicator(lichSu) {
  if (lichSu.length < 14) return { diemTai: 0, diemXiu: 0, soPP: 0 };
  const nums = lichSu.slice(0, 14).map(r => r === "Tài" ? 1 : 0);
  const mean = nums.reduce((a, b) => a + b, 0) / 14;
  const mad = nums.reduce((sum, x) => sum + Math.abs(x - mean), 0) / 14;
  if (mad === 0) return { diemTai: 0, diemXiu: 0, soPP: 0 };
  const cci = (nums[13] - mean) / (0.015 * mad);
  if (cci > 120) return { diemTai: 0, diemXiu: 76, soPP: 1 };
  if (cci < -120) return { diemTai: 76, diemXiu: 0, soPP: 1 };
  return { diemTai: 0, diemXiu: 0, soPP: 0 };
}

// 16. WAVELET (Phân tích chu kỳ)
function waveletAnalysis(lichSu) {
  if (lichSu.length < 16) return { diemTai: 0, diemXiu: 0, soPP: 0 };
  const recent = lichSu.slice(0, 16);
  let changes = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i] !== recent[i-1]) changes++;
  }
  const stability = 1 - changes / 15;
  if (stability > 0.65) {
    const trend = recent.filter(r => r === "Tài").length / 16;
    if (trend > 0.55) return { diemTai: 72, diemXiu: 0, soPP: 1 };
    if (trend < 0.45) return { diemTai: 0, diemXiu: 72, soPP: 1 };
  }
  return { diemTai: 0, diemXiu: 0, soPP: 0 };
}

// 17. MOMENTUM (Động lượng)
function momentumAnalysis(lichSu) {
  if (lichSu.length < 10) return { diemTai: 0, diemXiu: 0, soPP: 0 };
  const last5 = lichSu.slice(0, 5).filter(r => r === "Tài").length;
  const prev5 = lichSu.slice(5, 10).filter(r => r === "Tài").length;
  const diff = last5 - prev5;
  if (diff >= 3) return { diemTai: 0, diemXiu: 74, soPP: 1 };
  if (diff <= -3) return { diemTai: 74, diemXiu: 0, soPP: 1 };
  return { diemTai: 0, diemXiu: 0, soPP: 0 };
}

// 18. TẦN SUẤT TỔNG ĐIỂM
function tanSuatTongDiem(tongData) {
  if (!tongData || tongData.length < 10) return { diemTai: 0, diemXiu: 0, soPP: 0 };
  const avg = tongData.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
  if (avg > 12) return { diemTai: 0, diemXiu: 78, soPP: 1 };
  if (avg < 9) return { diemTai: 78, diemXiu: 0, soPP: 1 };
  return { diemTai: 0, diemXiu: 0, soPP: 0 };
}

// ==========================================
// TỔNG HỢP TẤT CẢ THUẬT TOÁN
// ==========================================
function tongHopDuDoan(lichSu, tongData) {
  if (lichSu.length < 6) {
    return { du_doan: "Tài", do_tin_cay: 55, giai_thich: "Chưa đủ dữ liệu (cần 6 phiên)" };
  }
  
  const cacPhuongPhap = [
    phanTichBet(lichSu), cau1_1(lichSu), cau2_2(lichSu), cau3_3(lichSu),
    cauDoiXung(lichSu), cauTamGiac(lichSu), cauVaiDauVai(lichSu),
    traCuuDatabase(lichSu), markovChain(lichSu), rsiIndicator(lichSu),
    macdIndicator(lichSu), bollingerBands(lichSu), stochasticOsc(lichSu),
    williamsR(lichSu), cciIndicator(lichSu), waveletAnalysis(lichSu),
    momentumAnalysis(lichSu), tanSuatTongDiem(tongData)
  ];
  
  let diemTai = 0, diemXiu = 0, soPhuongPhap = 0;
  
  for (let p of cacPhuongPhap) {
    if (p.soPP > 0) {
      soPhuongPhap++;
      diemTai += p.diemTai;
      diemXiu += p.diemXiu;
    }
  }
  
  if (soPhuongPhap === 0) {
    const last3 = lichSu.slice(0, 3);
    const tai3 = last3.filter(r => r === "Tài").length;
    return {
      du_doan: tai3 >= 2 ? "Tài" : "Xỉu",
      do_tin_cay: 58,
      giai_thich: "Theo xu hướng 3 phiên"
    };
  }
  
  const finalPred = diemTai > diemXiu ? "Tài" : "Xỉu";
  let doTinCay = Math.abs(diemTai - diemXiu) / (diemTai + diemXiu) * 100;
  doTinCay = Math.min(96, Math.max(55, doTinCay));
  
  return {
    du_doan: finalPred,
    do_tin_cay: Math.round(doTinCay),
    giai_thich: `${soPhuongPhap}/18 phương pháp | Tài:${Math.round(diemTai)} - Xỉu:${Math.round(diemXiu)}`
  };
}

// ==========================================
// API CHÍNH
// ==========================================
app.get('/sunwin-tx', async (req, res) => {
  try {
    const data = await layDuLieu();
    if (!data) {
      return res.status(503).json({ error: 'Không lấy được dữ liệu từ API nguồn' });
    }
    
    const duDoanTruoc = cache.get(data.phien - 1);
    
    if (duDoanTruoc && duDoanTruoc.du_doan) {
      const dung = capNhatThongKe(data.ket_qua, duDoanTruoc.du_doan);
      lichSuDuDoan.unshift({
        phien: duDoanTruoc.phien_du_doan,
        du_doan: duDoanTruoc.du_doan,
        do_tin_cay: duDoanTruoc.do_tin_cay,
        thuc_te: data.ket_qua,
        ket_qua: dung ? 'ĐÚNG' : 'SAI',
        thoi_gian: new Date().toISOString()
      });
      if (lichSuDuDoan.length > 100) lichSuDuDoan.pop();
    }
    
    lichSuKetQua.unshift(data.ket_qua);
    if (lichSuKetQua.length > 500) lichSuKetQua.pop();
    
    lichSuTongDiem.unshift(data.tong);
    if (lichSuTongDiem.length > 500) lichSuTongDiem.pop();
    
    lichSuXucXac.unshift(data.dice);
    if (lichSuXucXac.length > 500) lichSuXucXac.pop();
    
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
        lich_su_du_doan: lichSuDuDoan.slice(0, 30),
        thong_ke: thongKe,
        author: '@tranhoang2286'
      });
    }
    
    const duDoanMoi = tongHopDuDoan(lichSuKetQua, lichSuTongDiem);
    
    cache.set(data.phien, {
      phien_du_doan: data.phien + 1,
      du_doan: duDoanMoi.du_doan,
      do_tin_cay: duDoanMoi.do_tin_cay,
      giai_thich: duDoanMoi.giai_thich
    });
    
    if (cache.size > 50) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }
    
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
      lich_su_du_doan: lichSuDuDoan.slice(0, 30),
      thong_ke: thongKe,
      author: '@tranhoang2286'
    });
    
  } catch (err) {
    console.error('Lỗi:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/lich-su', (req, res) => {
  res.json({
    lich_su_du_doan: lichSuDuDoan.slice(0, 50),
    lich_su_ket_qua: lichSuKetQua.slice(0, 50),
    thong_ke: thongKe
  });
});

app.get('/thong-ke', (req, res) => {
  res.json({ thong_ke: thongKe });
});

app.get('/', (req, res) => {
  res.json({
    name: '🔥 SUNWIN TÀI XỈU - HỆ THỐNG SIÊU ĐIỆN RỘNG 🔥',
    author: '@tranhoang2286',
    version: '50.0 - CỰC MẠNH',
    database: `${patternDatabase.size} patterns từ file cau.txt`,
    endpoints: {
      'Dự đoán chính': '/sunwin-tx',
      'Lịch sử dự đoán': '/lich-su',
      'Thống kê': '/thong-ke'
    },
    danh_sach_thuat_toan: [
      '1. Phân tích bệt (cấp 3-4-5-6-7+)',
      '2. Cầu 1-1 (Alternating)',
      '3. Cầu 2-2 (Song hành)',
      '4. Cầu 3-3 (Song hành mở rộng)',
      '5. Cầu đối xứng (Mirror)',
      '6. Cầu tam giác (Triangle)',
      '7. Cầu vai-đầu-vai (Head & Shoulders)',
      '8. DATABASE SIÊU ĐIỆN RỘNG (từ file cau.txt)',
      '9. Chuỗi Markov bậc 4',
      '10. RSI (Chỉ báo sức mạnh)',
      '11. MACD (Hội tụ phân kỳ)',
      '12. Bollinger Bands',
      '13. Stochastic Oscillator',
      '14. Williams %R',
      '15. CCI (Commodity Channel Index)',
      '16. Wavelet Analysis (Phân tích chu kỳ)',
      '17. Momentum Analysis (Động lượng)',
      '18. Phân tích tổng điểm trung bình'
    ]
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🔥 SUNWIN TÀI XỈU - HỆ THỐNG SIÊU ĐIỆN RỘNG 🔥`);
  console.log(`✅ Tác giả: @tranhoang2286`);
  console.log(`✅ Database: ${patternDatabase.size} patterns`);
  console.log(`✅ Port: ${PORT}`);
  console.log(`✅ Endpoint: http://localhost:${PORT}/sunwin-tx\n`);
});
