// งบประมาณโรงเรียนในเกม (แยกจาก EXP): กระเป๋าเงินหลายประเภท ร้านค้า เควสระดมทรัพยากร การเติบโต และภาวะวิกฤต
// ตัวเลขเงินทั้งหมดเป็น "บาทในเกม" กำหนดเพื่อการเล่น ไม่ใช่อัตราจริงของ สพฐ.
// การตัดสินแหล่งเงินใช้ 3 ค่า: ok = ใช้ได้ตามหลักฐาน, bad = ขัดระเบียบตามหลักฐานที่ยืนยันแล้ว, unv = ยังยืนยันไม่ได้ (ไม่ตัดสิน ไม่เสียเงิน)
import * as St from './state.js';

const SRC = {
  guide2568: 'https://www.korat3.go.th/wp-content/uploads/2024/11/%E0%B9%81%E0%B8%99%E0%B8%A7%E0%B8%97%E0%B8%B2%E0%B8%87%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B8%94%E0%B8%B3%E0%B9%80%E0%B8%99%E0%B8%B4%E0%B8%99%E0%B8%87%E0%B8%B2%E0%B8%99-2568.pdf',
  sea12: 'https://www.sea12.go.th/asset/images/stories/form/2.5.67/2.1.pdf',
  capital2560: 'https://www.kkzone1.go.th/administrator-control/data/003/26-10-2015-11-05-21_1288239535.pdf',
  vehicle: 'https://www.opsmoac.go.th/km-km_org_center-files-401891791801',
  computer: 'https://www.yotathai.com/yotanews/rakaklang-computer68',
  eef: 'https://www.matichon.co.th/local/education/news_5738799',
  edonation: 'https://www.pptvhd36.com/wealth/economic/277739',
  fundraise: 'https://thaipublica.org/2015/12/uttayan-rajabhakti-11-12-2558/',
};
export { SRC };

export const WALLETS = {
  perhead:  { th: 'ค่าจัดการเรียนการสอน (เงินอุดหนุนรายหัว)', short: 'รายหัว', color: '#5B8DD6' },
  activity: { th: 'เงินอุดหนุนกิจกรรมพัฒนาคุณภาพผู้เรียน', short: 'กิจกรรม', color: '#E07A9B' },
  income:   { th: 'เงินรายได้สถานศึกษา', short: 'รายได้', color: '#6FAF7A' },
  donation: { th: 'เงินบริจาคที่ระบุวัตถุประสงค์', short: 'บริจาคเฉพาะ', color: '#D9A441' },
  capital:  { th: 'งบลงทุนที่ได้รับจัดสรร', short: 'งบลงทุน', color: '#9B7BC8' },
  student:  { th: 'เงินอุดหนุนที่จ่ายให้นักเรียน (ค่าหนังสือ อุปกรณ์ เครื่องแบบ ปัจจัยพื้นฐานนักเรียนยากจน)', short: 'เงินของนักเรียน', color: '#8C8C7A' },
};

const R_PERHEAD_OK = { v: 'ok', why: 'แนวทางการใช้เงินอุดหนุน ปี 2568 จัดค่าซ่อมแซม ครุภัณฑ์ และสิ่งก่อสร้างไว้ในค่าจัดการเรียนการสอน โดยต้องอยู่ในแผนปฏิบัติการที่คณะกรรมการสถานศึกษาเห็นชอบ', src: SRC.guide2568 };
const R_INCOME_OK = { v: 'ok', why: 'เงินรายได้สถานศึกษาใช้ได้กับกิจการที่เกี่ยวเนื่องกับการจัดการศึกษาตามแผนปฏิบัติการ', src: SRC.sea12 };
const R_ACTIVITY_BAD = { v: 'bad', why: 'เงินกิจกรรมพัฒนาคุณภาพผู้เรียนผูกกับกิจกรรม 5 ประเภท (วิชาการ คุณธรรม/ลูกเสือ ทัศนศึกษา ICT และการเรียนการสอนทางไกล) ไม่ใช่แหล่งเงินสำหรับครุภัณฑ์หรือสิ่งก่อสร้าง', src: SRC.sea12 };
const R_STUDENT_BAD = { v: 'bad', why: 'เงินค่าหนังสือ อุปกรณ์ เครื่องแบบ และปัจจัยพื้นฐานนักเรียนยากจน เป็นเงินที่ผูกกับตัวนักเรียน นำไปใช้รายการอื่นไม่ได้ กรณีจริงมีผู้บริหารถูกดำเนินคดีจากการนำเงินอุดหนุนไปใช้ผิดวัตถุประสงค์', src: SRC.guide2568 };
const R_DON = purpose => ({ v: 'don', purpose, why: 'เงินบริจาคที่ระบุวัตถุประสงค์ใช้ได้เฉพาะกิจการที่ผู้บริจาคระบุ', src: SRC.sea12 });
const R_CAP_ONLY = { v: 'unv', why: 'งบลงทุนต้องได้รับจัดสรรเป็นรายการ จึงใช้กับรายการอื่นที่ไม่ได้ขอไว้ไม่ได้', src: SRC.capital2560 };
const UNV = why => ({ v: 'unv', why: why || 'ยังไม่พบตัวบทที่ยืนยันได้ว่าแหล่งเงินนี้ใช้กับรายการนี้ได้หรือไม่ เกมจึงไม่ตัดสิน และยังไม่ดำเนินการซื้อ', src: null });

// รายการในร้านค้า: cat ใช้จับคู่กับวัตถุประสงค์ของเงินบริจาค, facility = สิ่งที่ปรากฏในเมือง
export const ITEMS = [
  { id: 'reno', group: 'building', th: 'ปรับปรุงห้องเรียน 10 ห้อง', price: 60000, cat: 'building', facility: 'reno', rep: 3, keng: 2,
    desc: 'ทาสี เปลี่ยนพัดลม ซ่อมหน้าต่างและพื้นห้องเรียน',
    rules: { perhead: R_PERHEAD_OK, income: R_INCOME_OK, donation: R_DON('building'), activity: R_ACTIVITY_BAD, student: R_STUDENT_BAD, capital: R_CAP_ONLY } },
  { id: 'water', group: 'building', th: 'ระบบน้ำดื่มสะอาดและเครื่องกรองน้ำ', price: 40000, cat: 'building', facility: 'water', rep: 3, suk: 3,
    desc: 'จุดบริการน้ำดื่มพร้อมเครื่องกรองและการตรวจคุณภาพน้ำ',
    rules: { perhead: { ...R_PERHEAD_OK, note: 'อนุมานจากหมวดครุภัณฑ์และค่าซ่อมแซมระบบประปา (แหล่งรอง)' }, income: R_INCOME_OK, donation: R_DON('building'), activity: R_ACTIVITY_BAD, student: R_STUDENT_BAD, capital: R_CAP_ONLY } },
  { id: 'cctv', group: 'equipment', th: 'กล้องวงจรปิดรอบโรงเรียน', price: 80000, cat: 'safety', facility: 'cctv', rep: 2, dee: 3,
    desc: 'กล้อง 16 จุด พร้อมระบบบันทึกภาพ (ต้องจัดทำประกาศการใช้ข้อมูลตาม PDPA)',
    rules: { perhead: { ...R_PERHEAD_OK, note: 'อนุมานจากหมวดครุภัณฑ์ (แหล่งรอง)' }, income: R_INCOME_OK, donation: R_DON('safety'), activity: R_ACTIVITY_BAD, student: R_STUDENT_BAD, capital: R_CAP_ONLY } },
  { id: 'library', group: 'equipment', th: 'ห้องสมุดมีชีวิต', price: 150000, cat: 'learning', facility: 'library', rep: 5, keng: 4,
    desc: 'หนังสือใหม่ มุมอ่าน และพื้นที่เรียนรู้ร่วมกัน',
    rules: { perhead: R_PERHEAD_OK, income: R_INCOME_OK, donation: R_DON('learning'), activity: R_ACTIVITY_BAD, capital: R_CAP_ONLY,
      student: { v: 'bad', why: 'ค่าหนังสือเรียนเป็นเงินที่ผูกกับหนังสือเรียนของนักเรียนแต่ละคน ไม่ใช่หนังสือห้องสมุด', src: SRC.sea12 } } },
  { id: 'ict', group: 'equipment', th: 'ห้องปฏิบัติการคอมพิวเตอร์', price: 300000, cat: 'learning', facility: 'ict', rep: 6, keng: 5,
    desc: 'คอมพิวเตอร์ 40 เครื่อง ตามเกณฑ์ราคากลางและคุณลักษณะพื้นฐานคอมพิวเตอร์',
    rules: { perhead: R_PERHEAD_OK, income: R_INCOME_OK, donation: R_DON('learning'), capital: R_CAP_ONLY, student: R_STUDENT_BAD,
      activity: { v: 'bad', why: 'กิจกรรม ICT ในเงินกิจกรรมพัฒนาคุณภาพผู้เรียนใช้จัดกิจกรรมให้นักเรียน ไม่ใช่ซื้อครุภัณฑ์คอมพิวเตอร์', src: SRC.sea12 } } },
  { id: 'teacher', group: 'people', th: 'จ้างครูอัตราจ้างวิชาขาดแคลน 1 อัตรา (1 ปี)', price: 120000, cat: 'people', facility: null, rep: 4, keng: 5, oneTime: false,
    desc: 'ลดภาระสอนของครูคณิตศาสตร์และวิทยาศาสตร์',
    rules: { perhead: { v: 'ok', why: 'แนวทางปี 2568 ให้จ่ายค่าจ้างชั่วคราว เช่น ครูอัตราจ้าง จากค่าจัดการเรียนการสอนได้', src: SRC.guide2568 }, income: { v: 'unv', why: 'การจ้างจากเงินรายได้สถานศึกษาต้องตรวจวงเงินอำนาจอนุมัติตามประกาศ สพฐ. 2551 ซึ่งยังตรวจตัวบทไม่ได้', src: null },
      activity: R_ACTIVITY_BAD, student: R_STUDENT_BAD, donation: R_DON('people'), capital: R_CAP_ONLY } },
  { id: 'camp', group: 'activity', th: 'ค่ายวิชาการและทัศนศึกษา ม.4', price: 50000, cat: 'activity', facility: null, rep: 3, keng: 2, suk: 3, oneTime: false,
    desc: 'ค่าพาหนะ ที่พัก และวิทยากร สำหรับนักเรียน 120 คน',
    rules: { activity: { v: 'ok', why: 'ทัศนศึกษาและกิจกรรมวิชาการเป็น 2 ใน 5 กิจกรรม จ่ายค่าพาหนะ ที่พัก และวิทยากรได้ โดยต้องไม่เรียกเก็บเงินผู้ปกครองเพิ่ม', src: SRC.sea12 },
      perhead: UNV(), income: UNV(), donation: R_DON('activity'), student: R_STUDENT_BAD, capital: R_CAP_ONLY } },
  { id: 'scholar', group: 'welfare', th: 'ทุนการศึกษานักเรียนขาดแคลน 20 ทุน', price: 30000, cat: 'scholar', facility: null, rep: 3, suk: 4, oneTime: false,
    desc: 'ทุนละ 1,500 บาท สำหรับนักเรียนที่ครอบครัวมีรายได้น้อย',
    rules: { donation: R_DON('scholar'), student: R_STUDENT_BAD, perhead: UNV('ยังไม่พบตัวบทที่ระบุว่าจ่ายทุนการศึกษาจากค่าจัดการเรียนการสอนได้'), activity: UNV(), income: UNV('ยังไม่พบตัวบทที่ระบุว่าเงินรายได้สถานศึกษาจ่ายทุนการศึกษาได้'), capital: R_CAP_ONLY } },
  { id: 'solar', group: 'building', th: 'แผงโซลาร์เซลล์บนหลังคาอาคาร', price: 350000, cat: 'building', facility: 'solar', rep: 4, saving: 8000,
    desc: 'ลดค่าไฟฟ้าของโรงเรียนในระยะยาว',
    rules: { perhead: UNV('ไม่พบกฎเฉพาะสำหรับแผงโซลาร์เซลล์'), income: UNV('ไม่พบกฎเฉพาะสำหรับแผงโซลาร์เซลล์'), donation: R_DON('building'), activity: R_ACTIVITY_BAD, student: R_STUDENT_BAD, capital: R_CAP_ONLY } },
  { id: 'dome', group: 'building', needLand: 1, th: 'โดมอเนกประสงค์และลานกีฬา', price: 500000, cat: 'building', facility: 'dome', rep: 6, suk: 4, capitalOk: true,
    desc: 'ลานกีฬามีหลังคาสำหรับกิจกรรมและการเข้าแถวช่วงฝนตก',
    rules: { perhead: { ...R_PERHEAD_OK, note: 'สิ่งก่อสร้างวงเงิน 500,000 บาท ต้องจัดจ้างตามวิธีเฉพาะเจาะจงหรือวิธีที่ระเบียบกำหนด' }, income: UNV('การก่อสร้างจากเงินรายได้สถานศึกษายังตรวจวงเงินอำนาจอนุมัติไม่ได้'), donation: R_DON('building'), activity: R_ACTIVITY_BAD, student: R_STUDENT_BAD, capital: { v: 'cap', item: 'dome', why: 'ใช้งบลงทุนได้หากได้รับจัดสรรสำหรับรายการนี้', src: SRC.capital2560 } } },
  { id: 'newbldg', group: 'building', needLand: 1, th: 'อาคารเรียนหลังใหม่ (แบบมาตรฐาน)', price: 4500000, cat: 'building', facility: 'newbldg', rep: 12, keng: 3, capitalOnly: true, capacity: 400,
    desc: 'รองรับนักเรียนเพิ่ม 400 คน ต้องยื่นคำขอตั้งงบลงทุนผ่านสำนักงานเขตพื้นที่',
    rules: { capital: { v: 'cap', item: 'newbldg', why: 'อาคารเรียนใช้แบบมาตรฐานและงบลงทุนที่โรงเรียนยื่นคำขอผ่านเขตพื้นที่ โดยเขตจัดลำดับตามความขาดแคลนห้องเรียน', src: SRC.capital2560 },
      perhead: UNV('ยังไม่พบตัวบทที่ระบุว่าใช้เงินรายหัวสร้างอาคารเรียนทั้งหลังได้'), income: UNV('ยังไม่พบตัวบทเรื่องการสร้างอาคารเรียนจากเงินรายได้สถานศึกษา'), donation: R_DON('building'), activity: R_ACTIVITY_BAD, student: R_STUDENT_BAD } },
  { id: 'van', group: 'building', th: 'รถตู้โรงเรียน', price: 1400000, cat: 'vehicle', facility: 'van', rep: 3, locked: true,
    desc: 'รายการนี้ยังเปิดซื้อไม่ได้ เพราะการจัดหายานพาหนะมีระเบียบเฉพาะ',
    lockNote: 'คู่มือการจัดตั้งงบลงทุนของ สพฐ. (2560) กำหนดให้สำนักงานเขตพื้นที่เป็นผู้ขอรถตู้ ใช้ทดแทนรถที่ชำรุดหรือมีอายุเกิน 10 ปี และไม่พบรายการยานพาหนะสำหรับโรงเรียน ส่วนการซื้อรถด้วยเงินรายหัว เงินรายได้ หรือการรับบริจาครถ ยังต้องตรวจระเบียบว่าด้วยรถราชการก่อน เกมจึงไม่เปิดให้ซื้อ',
    rules: {} },
];

// รายการเพิ่มเติม (รอบที่ 3)
const R_REPAIR = { v: 'ok', why: 'แนวทางการใช้เงินอุดหนุน ปี 2568 ระบุค่าซ่อมแซมระบบไฟฟ้า ประปา และสิ่งปลูกสร้างไว้ในค่าจัดการเรียนการสอน โดยต้องอยู่ในแผนปฏิบัติการที่คณะกรรมการสถานศึกษาเห็นชอบ', src: SRC.guide2568 };
const R_EQUIP = { ...R_PERHEAD_OK, note: 'อนุมานจากหมวดครุภัณฑ์ในงบลงทุนของค่าจัดการเรียนการสอน (แหล่งรอง) ต้องเทียบราคามาตรฐานครุภัณฑ์ก่อนจัดซื้อ' };
const R_ACT = type => ({ v: 'ok', why: `${type}เป็นหนึ่งใน 5 กิจกรรมที่จ่ายจากเงินอุดหนุนกิจกรรมพัฒนาคุณภาพผู้เรียนได้ โดยต้องไม่เรียกเก็บเงินผู้ปกครองเพิ่ม`, src: SRC.sea12 });
const ACT_RULES = type => ({ activity: R_ACT(type), perhead: UNV(), income: UNV(), donation: R_DON('activity'), student: R_STUDENT_BAD, capital: R_CAP_ONLY });
const BLD_RULES = (extra = {}) => ({ perhead: R_REPAIR, income: R_INCOME_OK, donation: R_DON('building'), activity: R_ACTIVITY_BAD, student: R_STUDENT_BAD, capital: R_CAP_ONLY, ...extra });
const EQ_RULES = (purpose = 'learning', extra = {}) => ({ perhead: R_EQUIP, income: R_INCOME_OK, donation: R_DON(purpose), activity: R_ACTIVITY_BAD, student: R_STUDENT_BAD, capital: R_CAP_ONLY, ...extra });
ITEMS.push(
  // อาคารสถานที่
  { id: 'roof', group: 'building', th: 'ซ่อมหลังคาโรงอาหารที่รั่ว', price: 45000, cat: 'building', facility: 'roof', rep: 2, suk: 2, desc: 'เปลี่ยนแผ่นหลังคาและรางน้ำฝน', rules: BLD_RULES() },
  { id: 'toiletReno', group: 'building', th: 'ปรับปรุงห้องน้ำนักเรียนทั้งหลัง', price: 180000, cat: 'building', facility: 'toiletReno', rep: 5, suk: 4, desc: 'เปลี่ยนสุขภัณฑ์ ระบบระบายอากาศ และทางลาดสำหรับผู้พิการ', rules: BLD_RULES() },
  { id: 'electric', group: 'building', th: 'ปรับปรุงระบบไฟฟ้าและเปลี่ยนเป็นหลอด LED', price: 90000, cat: 'building', facility: 'electric', rep: 2, dee: 2, saving: 3000, desc: 'ลดความเสี่ยงไฟฟ้าลัดวงจรและลดค่าไฟฟ้า', rules: BLD_RULES() },
  { id: 'bikepark', group: 'building', th: 'ลานจอดรถจักรยานมีหลังคา', price: 70000, cat: 'building', facility: 'bikepark', rep: 2, suk: 2, desc: 'รองรับจักรยาน 80 คัน ส่งเสริมการเดินทางที่ปลอดภัย', rules: BLD_RULES({ perhead: { ...R_PERHEAD_OK, note: 'สิ่งก่อสร้างในงบลงทุนของค่าจัดการเรียนการสอน' } }) },
  { id: 'garden', group: 'building', th: 'สวนเกษตรและโรงเรือนเพื่อการเรียนรู้', price: 85000, cat: 'learning', facility: 'garden', rep: 3, keng: 2, suk: 2, desc: 'แปลงผัก โรงเรือน และระบบน้ำหยด สำหรับการเรียนรู้แบบโครงงาน', rules: BLD_RULES({ donation: R_DON('learning'), perhead: { ...R_PERHEAD_OK, note: 'สิ่งก่อสร้างขนาดเล็กในงบลงทุนของค่าจัดการเรียนการสอน (อนุมาน)' } }) },
  // ครุภัณฑ์และสื่อ
  { id: 'smartboard', group: 'equipment', th: 'จอสัมผัสอัจฉริยะ 10 ห้องเรียน', price: 450000, cat: 'learning', facility: 'smartboard', rep: 5, keng: 4, desc: 'จอแสดงผลแบบสัมผัสสำหรับการสอนแบบมีปฏิสัมพันธ์', rules: EQ_RULES() },
  { id: 'scilab', group: 'equipment', th: 'วัสดุและอุปกรณ์ห้องปฏิบัติการวิทยาศาสตร์', price: 120000, cat: 'learning', facility: null, oneTime: false, rep: 3, keng: 3, desc: 'สารเคมี เครื่องแก้ว และชุดทดลองสำหรับหนึ่งปีการศึกษา (ห้ามแบ่งซื้อเป็นรายห้องปฏิบัติการ)', rules: EQ_RULES('learning', { perhead: { ...R_PERHEAD_OK, note: 'วัสดุการเรียนการสอนในค่าจัดการเรียนการสอน จัดซื้อรวมครั้งเดียว ห้ามแบ่งซื้อตามข้อ 20 ของระเบียบพัสดุ' } }) },
  { id: 'band', group: 'equipment', th: 'เครื่องดนตรีวงโยธวาทิต', price: 250000, cat: 'learning', facility: 'band', rep: 4, suk: 3, desc: 'เครื่องเป่าและเครื่องกระทบสำหรับวงโยธวาทิตของโรงเรียน', rules: EQ_RULES() },
  { id: 'sports', group: 'equipment', th: 'อุปกรณ์กีฬาครบชุด', price: 40000, cat: 'learning', facility: null, oneTime: false, rep: 2, suk: 3, desc: 'ลูกบอล ตาข่าย และอุปกรณ์กรีฑาสำหรับหนึ่งปีการศึกษา', rules: EQ_RULES('learning', { perhead: { ...R_PERHEAD_OK, note: 'อุปกรณ์กีฬาจัดอยู่ในค่าจัดการเรียนการสอน (แหล่งรอง)' } }) },
  { id: 'nurse', group: 'equipment', th: 'ปรับปรุงห้องพยาบาลและเวชภัณฑ์', price: 35000, cat: 'safety', facility: 'nurse', rep: 2, suk: 3, desc: 'เตียงพยาบาล ตู้ยา และเวชภัณฑ์พื้นฐาน', rules: EQ_RULES('safety', { perhead: UNV('ยังไม่พบตัวบทเรื่องการจัดซื้อเวชภัณฑ์จากค่าจัดการเรียนการสอน') }) },
  // บุคลากร
  { id: 'janitor', group: 'people', th: 'จ้างนักการภารโรงเพิ่ม 1 อัตรา (1 ปี)', price: 108000, cat: 'people', facility: null, oneTime: false, rep: 2, suk: 3, desc: 'ช่วยดูแลความสะอาดและซ่อมบำรุงร่วมกับลุงบุญมี',
    rules: { perhead: { v: 'ok', why: 'แนวทางปี 2568 ยกตัวอย่างค่าจ้างนักการภารโรงไว้ในค่าจ้างชั่วคราวที่จ่ายจากค่าจัดการเรียนการสอนได้', src: SRC.guide2568 }, income: UNV('การจ้างจากเงินรายได้สถานศึกษาต้องตรวจวงเงินอำนาจอนุมัติตามประกาศ สพฐ. 2551 ซึ่งยังตรวจตัวบทไม่ได้'), activity: R_ACTIVITY_BAD, student: R_STUDENT_BAD, donation: R_DON('people'), capital: R_CAP_ONLY } },
  { id: 'foreign', group: 'people', th: 'จ้างครูชาวต่างประเทศสอนภาษาอังกฤษ (1 ปี)', price: 300000, cat: 'people', facility: null, oneTime: false, rep: 4, keng: 4, desc: 'ครูเจ้าของภาษาสอนสัปดาห์ละ 20 คาบ',
    rules: { perhead: UNV('แนวทางปี 2568 ยกตัวอย่างครูอัตราจ้างไว้ แต่ยังไม่พบตัวบทที่กล่าวถึงครูชาวต่างประเทศโดยตรง'), income: UNV('การจ้างจากเงินรายได้สถานศึกษาต้องตรวจวงเงินอำนาจอนุมัติ'), donation: R_DON('people'), activity: R_ACTIVITY_BAD, student: R_STUDENT_BAD, capital: R_CAP_ONLY } },
  { id: 'pd', group: 'people', th: 'เชิญวิทยากรอบรมครูเรื่องการวัดผลแนว PISA', price: 25000, cat: 'people', facility: null, oneTime: false, rep: 2, keng: 3, desc: 'อบรมเชิงปฏิบัติการ 2 วัน สำหรับครูทุกกลุ่มสาระ',
    rules: { perhead: UNV('ยังไม่พบตัวบทเรื่องค่าพัฒนาครูในค่าจัดการเรียนการสอน'), income: UNV(), activity: UNV('เงินกิจกรรมพัฒนาคุณภาพผู้เรียนผูกกับกิจกรรมของนักเรียน 5 ประเภท ยังไม่พบตัวบทที่ระบุเรื่องการอบรมครู'), donation: R_DON('people'), student: R_STUDENT_BAD, capital: R_CAP_ONLY } },
  // กิจกรรมนักเรียน
  { id: 'scout', group: 'activity', th: 'ค่ายลูกเสือ-เนตรนารี ม.1', price: 40000, cat: 'activity', facility: null, oneTime: false, rep: 2, suk: 3, desc: 'เข้าค่ายพักแรม 2 วัน 1 คืน', rules: ACT_RULES('กิจกรรมคุณธรรม/ลูกเสือ') },
  { id: 'coding', group: 'activity', th: 'ค่ายโค้ดดิ้งและเทคโนโลยี', price: 30000, cat: 'activity', facility: null, oneTime: false, rep: 2, keng: 3, desc: 'กิจกรรมเรียนรู้เทคโนโลยีสารสนเทศสำหรับนักเรียน ม.2', rules: ACT_RULES('กิจกรรมบริการสารสนเทศ (ICT)') },
  { id: 'museum', group: 'activity', th: 'ทัศนศึกษาพิพิธภัณฑ์วิทยาศาสตร์ ม.1', price: 45000, cat: 'activity', facility: null, oneTime: false, rep: 2, keng: 2, suk: 2, desc: 'ไป-กลับภายในวัน นักเรียน 200 คน (ต้องขออนุญาตตามระเบียบการพานักเรียนไปนอกสถานศึกษา)', rules: ACT_RULES('กิจกรรมทัศนศึกษา') },
  { id: 'moral', group: 'activity', th: 'ค่ายคุณธรรมจริยธรรม', price: 25000, cat: 'activity', facility: null, oneTime: false, rep: 2, suk: 3, desc: 'กิจกรรมพัฒนาคุณธรรมร่วมกับวัดในชุมชน', rules: ACT_RULES('กิจกรรมคุณธรรม') },
  // ทุนและสวัสดิการ
  { id: 'lunchSec', group: 'welfare', th: 'อาหารกลางวันสำหรับนักเรียน ม.ต้น ที่ขาดแคลน', price: 60000, cat: 'scholar', facility: null, oneTime: false, rep: 3, suk: 4, desc: 'อาหารกลางวันหนึ่งภาคเรียนสำหรับนักเรียน 60 คน',
    rules: { student: { v: 'bad', why: 'เงินอุดหนุนค่าอาหารกลางวันตามมติคณะรัฐมนตรีครอบคลุมเฉพาะระดับอนุบาลถึง ป.6 ส่วนเงินของนักเรียนประเภทอื่นผูกกับวัตถุประสงค์เฉพาะ จึงนำมาใช้ไม่ได้', src: SRC.guide2568 },
      donation: R_DON('scholar'), perhead: UNV('ยังไม่พบตัวบทที่ระบุว่าค่าจัดการเรียนการสอนจ่ายค่าอาหารนักเรียนมัธยมได้'), income: UNV(), activity: R_ACTIVITY_BAD, capital: R_CAP_ONLY } },
  { id: 'uniform', group: 'welfare', th: 'จ่ายค่าเครื่องแบบนักเรียนตามสิทธิ', price: 50000, cat: 'student', facility: null, oneTime: false, rep: 2, suk: 3, desc: 'จ่ายเงินค่าเครื่องแบบให้นักเรียนตามสิทธิเรียนฟรี 15 ปี',
    rules: { student: { v: 'ok', why: 'ค่าเครื่องแบบนักเรียนเป็นเงินอุดหนุนที่จัดสรรเพื่อนักเรียนโดยตรง ใช้ตามวัตถุประสงค์นี้ได้ และต้องจ่ายถึงตัวนักเรียนหรือผู้ปกครอง', src: SRC.guide2568 },
      perhead: { v: 'bad', why: 'ค่าเครื่องแบบมีเงินอุดหนุนแยกไว้แล้ว การใช้ค่าจัดการเรียนการสอนแทนทำให้เงินผิดหมวดและซ้ำซ้อน', src: SRC.guide2568 }, income: UNV(), activity: R_ACTIVITY_BAD, donation: R_DON('scholar'), capital: R_CAP_ONLY } },
);
// รายการเพิ่มเติม (รอบที่ 4): เปิดซื้อตามจำนวนด่านที่ผ่าน (minLv) บางรายการช่วยลดความเสียหายจากการ์ดวิกฤต (guards)
ITEMS.push(
  { id: 'treecare', group: 'building', minLv: 1, th: 'ตัดแต่งและค้ำยันต้นไม้ใหญ่โดยรุกขกร', price: 30000, cat: 'safety', facility: 'treecare', rep: 1, dee: 1, guards: 'tree', desc: 'ตัดกิ่งที่เสี่ยงหักและค้ำยันต้นไม้ริมทางเดิน ลดความเสียหายเมื่อเกิดพายุ', rules: BLD_RULES() },
  { id: 'pump', group: 'building', minLv: 2, th: 'ระบบสูบน้ำและคันกั้นน้ำรอบอาคาร', price: 220000, cat: 'safety', facility: 'pump', rep: 2, dee: 2, guards: 'flood', desc: 'บ่อพักน้ำ เครื่องสูบน้ำ และคันกั้นน้ำแนวอาคารเรียน ลดความเสียหายเมื่อน้ำท่วม', rules: BLD_RULES() },
  { id: 'generator', group: 'equipment', minLv: 2, th: 'เครื่องกำเนิดไฟฟ้าสำรอง', price: 180000, cat: 'safety', facility: 'generator', rep: 1, dee: 2, guards: 'blackout', desc: 'จ่ายไฟให้ห้องพยาบาล ห้องคอมพิวเตอร์ และไฟฉุกเฉินเมื่อไฟดับ', rules: EQ_RULES('safety') },
  { id: 'wifi', group: 'equipment', minLv: 3, th: 'ระบบอินเทอร์เน็ตไร้สายทั่วโรงเรียน', price: 160000, cat: 'learning', facility: 'wifi', rep: 3, keng: 2, desc: 'จุดกระจายสัญญาณทุกอาคาร รองรับการเรียนออนไลน์และการสอบด้วยคอมพิวเตอร์', rules: EQ_RULES() },
  { id: 'airpurifier', group: 'equipment', minLv: 4, th: 'ห้องปลอดฝุ่นพร้อมเครื่องฟอกอากาศ', price: 120000, cat: 'safety', facility: 'airpurifier', rep: 2, suk: 3, guards: 'haze', desc: 'ห้องเรียนปิดพร้อมเครื่องฟอกอากาศสำหรับนักเรียนกลุ่มเสี่ยงช่วงฝุ่นสูง', rules: EQ_RULES('safety') },
  { id: 'fire', group: 'equipment', minLv: 5, th: 'ระบบสัญญาณเตือนและอุปกรณ์ดับเพลิง', price: 95000, cat: 'safety', facility: 'fire', rep: 2, dee: 3, desc: 'สัญญาณเตือนอัคคีภัยทุกอาคาร ถังดับเพลิง และป้ายทางหนีไฟ', rules: EQ_RULES('safety') },
  { id: 'langlab', group: 'equipment', minLv: 6, th: 'ศูนย์การเรียนรู้ภาษาและวัฒนธรรมต่างประเทศ', price: 380000, cat: 'learning', facility: 'langlab', rep: 5, keng: 4, desc: 'ห้องปฏิบัติการภาษา มุมวัฒนธรรม และระบบเชื่อมต่อห้องเรียนกับโรงเรียนต่างประเทศ', rules: EQ_RULES() },
  { id: 'maker', group: 'equipment', minLv: 8, needLand: 1, th: 'ห้อง STEM และเมกเกอร์สเปซ', price: 350000, cat: 'learning', facility: 'maker', rep: 5, keng: 4, desc: 'เครื่องพิมพ์สามมิติ ชุดหุ่นยนต์ และโต๊ะปฏิบัติการสำหรับงานโครงงาน (สร้างบนที่ดินแปลงที่ 1)', rules: EQ_RULES() },
  { id: 'hall', group: 'building', minLv: 12, needLand: 2, th: 'หอประชุมอเนกประสงค์', price: 2800000, cat: 'building', facility: 'hall', rep: 8, suk: 4, capitalOk: true, desc: 'หอประชุมขนาด 800 ที่นั่ง ใช้จัดกิจกรรมและเป็นที่พักพิงชั่วคราวยามภัยพิบัติ (ต้องมีที่ดินแปลงที่ 2)',
    rules: { capital: { v: 'cap', why: 'สิ่งก่อสร้างวงเงินสูงต้องได้รับจัดสรรงบลงทุนเป็นรายการ', src: SRC.capital2560 }, perhead: UNV('วงเงินระดับนี้เป็นงบลงทุน ยังไม่พบตัวบทที่ให้ใช้ค่าจัดการเรียนการสอน'), income: UNV(), donation: R_DON('building'), activity: R_ACTIVITY_BAD, student: R_STUDENT_BAD } },
  { id: 'counselor', group: 'people', minLv: 9, th: 'จ้างนักจิตวิทยาประจำโรงเรียน (1 ปี)', price: 240000, cat: 'people', facility: null, oneTime: false, rep: 3, suk: 5, desc: 'ดูแลสุขภาพจิตนักเรียนและทำงานร่วมกับครูแนะแนว',
    rules: { perhead: UNV('ยังไม่พบตัวบทที่ระบุค่าจ้างนักจิตวิทยาในค่าจัดการเรียนการสอน'), income: UNV(), donation: R_DON('scholar'), activity: R_ACTIVITY_BAD, student: R_STUDENT_BAD, capital: R_CAP_ONLY } },
  { id: 'plcnet', group: 'people', minLv: 7, th: 'วัน PLC ข้ามโรงเรียนในเครือข่าย', price: 20000, cat: 'people', facility: null, oneTime: false, rep: 2, keng: 2, desc: 'ครูแลกเปลี่ยนแผนการสอนและสังเกตชั้นเรียนกับโรงเรียนเครือข่าย 1 วัน',
    rules: { perhead: UNV('ยังไม่พบตัวบทเรื่องค่าพัฒนาครูในค่าจัดการเรียนการสอน'), income: UNV(), activity: R_ACTIVITY_BAD, donation: R_DON('learning'), student: R_STUDENT_BAD, capital: R_CAP_ONLY } },
  { id: 'langcamp', group: 'activity', minLv: 5, th: 'ค่ายภาษาและวัฒนธรรมนานาชาติ', price: 60000, cat: 'activity', facility: null, oneTime: false, rep: 3, keng: 2, suk: 2, desc: 'นักเรียนฝึกสื่อสารกับเพื่อนต่างวัฒนธรรมผ่านกิจกรรมและโครงงาน 2 วัน', rules: ACT_RULES('กิจกรรมวิชาการ') },
  { id: 'eyes', group: 'welfare', minLv: 3, th: 'ตรวจสายตาและแว่นตาสำหรับนักเรียนขาดแคลน', price: 40000, cat: 'scholar', facility: null, oneTime: false, rep: 2, suk: 3, keng: 1, desc: 'ร่วมกับหน่วยบริการสาธารณสุขตรวจสายตาและมอบแว่นตา 80 อัน',
    rules: { donation: R_DON('scholar'), perhead: UNV(), income: UNV(), activity: R_ACTIVITY_BAD, student: R_STUDENT_BAD, capital: R_CAP_ONLY } },
);
// รายการเพิ่มเติม (รอบที่ 5): อาคารบนที่ดินแปลงที่ 3–4 ใช้งบลงทุนเป็นรายการ
const CAP_RULES = (id, why) => ({ capital: { v: 'cap', item: id, why: why || 'สิ่งก่อสร้างวงเงินสูงต้องได้รับจัดสรรงบลงทุนเป็นรายการผ่านเขตพื้นที่', src: SRC.capital2560 },
  perhead: UNV('วงเงินระดับนี้เป็นงบลงทุน ยังไม่พบตัวบทที่ให้ใช้ค่าจัดการเรียนการสอน'), income: UNV(), donation: R_DON('building'), activity: R_ACTIVITY_BAD, student: R_STUDENT_BAD });
ITEMS.push(
  { id: 'newbldg2', group: 'building', minLv: 14, needLand: 3, th: 'อาคารเรียนหลังที่ 2 (แบบมาตรฐาน)', price: 5200000, cat: 'building', facility: 'newbldg2', rep: 12, keng: 3, capitalOnly: true, capacity: 400, desc: 'รองรับนักเรียนเพิ่ม 400 คน สร้างบนที่ดินแปลงที่ 3', rules: CAP_RULES('newbldg2') },
  { id: 'gym', group: 'building', minLv: 18, needLand: 3, th: 'โรงยิมเนเซียม', price: 3600000, cat: 'building', facility: 'gym', rep: 7, suk: 4, capitalOnly: true, desc: 'สนามกีฬาในร่ม ใช้สอนพลศึกษาช่วงฝนและฝุ่น สร้างบนที่ดินแปลงที่ 3', rules: CAP_RULES('gym') },
  { id: 'scibldg', group: 'building', minLv: 24, needLand: 4, th: 'อาคารปฏิบัติการวิทยาศาสตร์', price: 4200000, cat: 'learning', facility: 'scibldg', rep: 9, keng: 5, capitalOnly: true, desc: 'ห้องปฏิบัติการ 6 ห้องพร้อมระบบความปลอดภัย สร้างบนที่ดินแปลงที่ 4', rules: CAP_RULES('scibldg') },
  { id: 'housing', group: 'building', minLv: 20, needLand: 4, th: 'บ้านพักครู 8 หน่วย', price: 2400000, cat: 'building', facility: 'housing', rep: 4, suk: 4, capitalOnly: true, desc: 'ช่วยครูที่บ้านไกลและครูบรรจุใหม่ สร้างบนที่ดินแปลงที่ 4', rules: CAP_RULES('housing') },
);
export const SHOP_GROUPS = { building: 'อาคารสถานที่', equipment: 'ครุภัณฑ์และสื่อ', people: 'บุคลากรและการพัฒนาครู', activity: 'กิจกรรมนักเรียน', welfare: 'ทุนและสวัสดิการ' };
for (const it of ITEMS) if (it.oneTime !== false && !it.facility) it.facility = it.id;
export const ITEM = Object.fromEntries(ITEMS.map(i => [i.id, i]));

// เควสระดมทรัพยากร
export const QUESTS = [
  { id: 'phapa', th: 'ทอดผ้าป่าการศึกษากับสมาคมศิษย์เก่า', reward: { wallet: 'income', amount: 180000 }, by: 'soonthorn', minTier: 1,
    steps: [
      { q: 'สมาคมศิษย์เก่าเสนอจัดผ้าป่าการศึกษาเพื่อหารายได้ให้โรงเรียน ท่านจะเริ่มอย่างไร',
        opts: [
          { t: 'เสนอโครงการต่อคณะกรรมการสถานศึกษาให้เห็นชอบก่อน แล้วตรวจว่าการเรี่ยไรต้องได้รับอนุมัติตามระเบียบสำนักนายกรัฐมนตรีหรือไม่', v: 'ok', why: 'การระดมทรัพยากรต้องได้รับความเห็นชอบจากคณะกรรมการสถานศึกษา และการเรี่ยไรของหน่วยงานรัฐอยู่ภายใต้ระเบียบสำนักนายกรัฐมนตรีว่าด้วยการเรี่ยไร พ.ศ. 2544', src: SRC.fundraise },
          { t: 'ให้สมาคมศิษย์เก่าดำเนินการเองทั้งหมด โรงเรียนรอรับเงินอย่างเดียว', v: 'warn', why: 'ไม่ผิดระเบียบโดยตรง แต่โรงเรียนจะไม่มีบันทึกรับเงินที่โปร่งใส และอาจเกิดข้อร้องเรียนภายหลัง' },
          { t: 'ประกาศในกลุ่มผู้ปกครองว่ากำหนดให้นักเรียนร่วมทำบุญคนละ 200 บาท', v: 'bad', why: 'การกำหนดจำนวนเงินจากผู้ปกครองเป็นการบังคับเรี่ยไร ขัดกับหลักการรับบริจาคโดยสมัครใจ', src: SRC.sea12 },
        ] },
      { q: 'ได้รับเงินจากงานผ้าป่าแล้ว ท่านจะจัดการเงินอย่างไร',
        opts: [
          { t: 'ออกใบเสร็จรับเงินในนามโรงเรียน นำเข้าบัญชีเงินรายได้สถานศึกษา และรายงานคณะกรรมการสถานศึกษา', v: 'ok', why: 'เงินที่ได้จากการระดมทรัพยากรเป็นเงินรายได้สถานศึกษา ต้องมีหลักฐานการรับและรายงานต่อคณะกรรมการ', src: SRC.sea12 },
          { t: 'ฝากไว้ในบัญชีของสมาคมศิษย์เก่าก่อน เพื่อความคล่องตัว', v: 'bad', why: 'เงินที่บริจาคให้โรงเรียนต้องนำเข้าบัญชีของโรงเรียน ป.ป.ช. เคยตั้งข้อสังเกตเรื่องการรับเงินผ่านสมาคมแทนโรงเรียน' },
        ] },
    ] },
  { id: 'company', th: 'ขอรับบริจาคจากบริษัทในพื้นที่', reward: { wallet: 'donation', purpose: 'learning', amount: 300000 }, by: 'janpen', minTier: 2,
    steps: [
      { q: 'บริษัทแห่งหนึ่งยินดีบริจาค 300,000 บาท เพื่อห้องเรียนรู้ด้านเทคโนโลยี ท่านจะดำเนินการอย่างไร',
        opts: [
          { t: 'รับบริจาคผ่านระบบ e-Donation ระบุวัตถุประสงค์ว่าใช้พัฒนาห้องเรียนรู้ และแจ้งสิทธิลดหย่อนภาษีให้บริษัททราบ', v: 'ok', why: 'การบริจาคให้สถานศึกษาของรัฐผ่าน e-Donation ใช้สิทธิลดหย่อนภาษีได้ (คณะรัฐมนตรีอนุมัติให้ขยายสิทธิถึงสิ้นปี 2570 ต้องตรวจการประกาศในราชกิจจานุเบกษา)', src: SRC.edonation },
          { t: 'รับเป็นเงินสดและใช้เป็นงบทั่วไปของโรงเรียน', v: 'warn', why: 'เมื่อผู้บริจาคระบุวัตถุประสงค์ โรงเรียนต้องใช้ตามวัตถุประสงค์นั้น การนำไปใช้ทั่วไปไม่สอดคล้องกับเจตนาผู้บริจาค', src: SRC.sea12 },
        ] },
      { q: 'บริษัทขอให้โรงเรียนซื้อคอมพิวเตอร์จากบริษัทในเครือ เป็นเงื่อนไขของการบริจาค ท่านจะตอบอย่างไร',
        opts: [
          { t: 'ขอบคุณและชี้แจงว่าการจัดซื้อต้องเป็นไปตามระเบียบพัสดุอย่างเปิดเผย จึงรับเงื่อนไขนี้ไม่ได้', v: 'ok', why: 'การจัดซื้อจัดจ้างต้องโปร่งใสและแข่งขันอย่างเป็นธรรมตาม พ.ร.บ.การจัดซื้อจัดจ้างฯ 2560 การรับบริจาคพร้อมเงื่อนไขกำหนดผู้ขายขัดหลักนี้' },
          { t: 'รับเงื่อนไข เพราะอย่างไรโรงเรียนก็ได้ประโยชน์', v: 'bad', why: 'การกำหนดผู้ขายล่วงหน้าเป็นการล็อกผู้ขาย ขัดหลักการจัดซื้อจัดจ้างที่โปร่งใส คดีจริงเรื่องล็อกสเปกมีผู้บริหารถูกลงโทษ' },
        ] },
    ] },
  { id: 'rent', th: 'ให้เช่าลานจอดรถช่วงวันหยุด', reward: { wallet: 'income', amount: 60000 }, by: 'prasert', minTier: 2,
    steps: [
      { q: 'ชุมชนขอเช่าลานจอดรถของโรงเรียนช่วงวันหยุดสำหรับตลาดนัด ท่านจะดำเนินการอย่างไร (ระเบียบการให้เช่าที่ราชพัสดุยังตรวจตัวบทไม่ได้ ขั้นนี้จึงไม่ตัดสินถูกผิด)',
        opts: [
          { t: 'ทำสัญญาเป็นลายลักษณ์อักษร กำหนดเวลาและความรับผิดชอบด้านความสะอาดและความปลอดภัย นำรายได้เข้าเงินรายได้สถานศึกษา', v: 'ok', why: 'ผลประโยชน์จากทรัพย์สินของโรงเรียนเป็นเงินรายได้สถานศึกษา การมีสัญญาชัดเจนช่วยลดความเสี่ยง (รายละเอียดระเบียบการให้เช่ายังต้องตรวจตัวบท)', src: SRC.sea12 },
          { t: 'ตกลงด้วยวาจา ไม่ต้องเก็บค่าเช่า เพื่อรักษาความสัมพันธ์กับชุมชน', v: 'warn', why: 'สร้างความสัมพันธ์ได้ แต่ไม่มีหลักฐานความรับผิดชอบหากเกิดความเสียหาย' },
        ] },
    ] },
  { id: 'eef', th: 'ประสานทุนเสมอภาคสำหรับนักเรียนยากจนพิเศษ', reward: { wallet: null, amount: 0, morale: 8 }, by: 'guidance', minTier: 1,
    steps: [
      { q: 'ครูแนะแนวพบว่านักเรียน ม.ต้น หลายคนมีฐานะยากจนพิเศษ ท่านจะดำเนินการอย่างไร',
        opts: [
          { t: 'มอบหมายครูประจำชั้นคัดกรองนักเรียนและส่งข้อมูลขอรับทุนเสมอภาค โดยเงินทุนจ่ายถึงนักเรียน ไม่ใช่งบของโรงเรียน', v: 'ok', why: 'ทุนเสมอภาคของ กสศ. ปีการศึกษา 2569 จัดสรร 4,200 บาทต่อคนต่อปีสำหรับนักเรียนยากจนพิเศษถึงระดับ ม.ต้น เงินนี้เป็นของนักเรียน', src: SRC.eef },
          { t: 'ขอรับทุนแล้วนำมารวมเป็นงบซื้ออุปกรณ์ส่วนกลางให้ทุกคน', v: 'bad', why: 'ทุนที่จัดสรรให้นักเรียนรายบุคคลต้องถึงตัวนักเรียน การนำไปใช้ส่วนกลางเป็นการใช้ผิดวัตถุประสงค์' },
        ] },
    ] },
  { id: 'capital', th: 'ยื่นคำขอตั้งงบลงทุนประจำปี', reward: { wallet: 'capital' }, by: 'pakorn', minTier: 2, capitalQuest: true,
    steps: [
      { q: 'เขตพื้นที่เปิดรับคำขอตั้งงบลงทุน ท่านจะขอรายการใด (เลือกได้หนึ่งรายการต่อรอบ)',
        opts: [
          { t: 'อาคารเรียนหลังใหม่ โดยแนบข้อมูลจำนวนนักเรียนกับจำนวนห้องเรียนที่ขาด', v: 'ok', cap: 'newbldg', why: 'เขตพื้นที่จัดลำดับคำขออาคารเรียนตามความขาดแคลนห้องเรียน ข้อมูลประกอบจึงสำคัญ', src: SRC.capital2560 },
          { t: 'โดมอเนกประสงค์และลานกีฬา พร้อมแผนการใช้งาน', v: 'ok', cap: 'dome', why: 'สิ่งก่อสร้างประกอบที่มีแผนการใช้ชัดเจนสามารถเสนอขอได้ตามขั้นตอนเดียวกัน', src: SRC.capital2560 },
          { t: 'หอประชุมอเนกประสงค์ พร้อมหลักฐานว่ามีที่ดินรองรับและแผนใช้เป็นที่พักพิงยามภัยพิบัติ', v: 'ok', cap: 'hall', why: 'สิ่งก่อสร้างที่มีที่ดินพร้อมและแผนการใช้ชัดเจนเสนอขอได้ตามขั้นตอนเดียวกัน แต่เขตจะจัดลำดับตามความจำเป็น', src: SRC.capital2560 },
          { t: 'อาคารเรียนหลังที่ 2 พร้อมข้อมูลนักเรียนที่เกินความจุและหลักฐานที่ดินแปลงที่ 3', v: 'ok', cap: 'newbldg2', why: 'เขตพื้นที่จัดลำดับคำขออาคารเรียนตามความขาดแคลนห้องเรียนและความพร้อมของที่ดิน', src: SRC.capital2560 },
          { t: 'โรงยิมเนเซียม พร้อมแผนการใช้สอนพลศึกษาและเปิดให้ชุมชนใช้นอกเวลา', v: 'ok', cap: 'gym', why: 'สิ่งก่อสร้างที่มีแผนการใช้ชัดเจนเสนอขอได้ แต่มักได้ลำดับหลังอาคารเรียน', src: SRC.capital2560 },
          { t: 'อาคารปฏิบัติการวิทยาศาสตร์ พร้อมแผนการเรียนการสอนและระบบความปลอดภัย', v: 'ok', cap: 'scibldg', why: 'เสนอขอเป็นรายการได้ตามขั้นตอนเดียวกัน', src: SRC.capital2560 },
          { t: 'บ้านพักครู พร้อมข้อมูลครูที่บ้านไกลและอัตราการขอย้าย', v: 'ok', cap: 'housing', why: 'เสนอขอเป็นรายการได้ เขตจัดลำดับตามความจำเป็น', src: SRC.capital2560 },
          { t: 'ขอเป็นวงเงินก้อนโดยไม่ระบุรายการ เพื่อความยืดหยุ่น', v: 'bad', why: 'งบลงทุนจัดสรรเป็นรายการ คำขอที่ไม่ระบุรายการจะไม่ได้รับการพิจารณา', src: SRC.capital2560 },
        ] },
    ] },
  { id: 'land', th: 'ขยายพื้นที่โรงเรียน (รับบริจาคที่ดินจากชุมชน)', reward: { wallet: null }, by: 'soonthorn', minTier: 2, landQuest: true,
    steps: [
      { q: 'เจ้าของที่ดินติดแนวรั้วโรงเรียนประสงค์ยกที่ดินให้โรงเรียน เพื่อใช้สร้างอาคารและลานกิจกรรม ท่านจะเริ่มอย่างไร (ขั้นตอนทางทะเบียนที่ดินของรัฐยังตรวจตัวบทไม่ครบ เกมตัดสินจากหลักความโปร่งใสและทรัพย์สินของทางราชการ ไม่ได้อ้างมาตรา)',
        opts: [
          { t: 'เสนอคณะกรรมการสถานศึกษาและรายงานเขตพื้นที่ รับบริจาคในนามทางราชการ ตรวจโฉนดและภาระผูกพัน แล้วดำเนินการโอนตามขั้นตอนของหน่วยงานที่ดูแลที่ดินของรัฐ', v: 'ok', why: 'ที่ดินที่ยกให้โรงเรียนรัฐเป็นทรัพย์สินของทางราชการ การรับต้องเป็นการรับในนามหน่วยงาน มีหลักฐาน และผ่านการรับรู้ของคณะกรรมการและต้นสังกัด' },
          { t: 'ให้โอนที่ดินเข้าชื่อผู้อำนวยการไว้ก่อน เพราะขั้นตอนราชการใช้เวลานาน แล้วค่อยโอนต่อภายหลัง', v: 'bad', why: 'ทรัพย์สินที่บริจาคให้ราชการต้องไม่อยู่ในชื่อบุคคล แม้ตั้งใจดี ก็เปิดช่องให้เกิดข้อพิพาทและข้อสงสัยเรื่องประโยชน์ส่วนตน' },
          { t: 'ตกลงด้วยวาจาและเริ่มใช้ที่ดินทันที เอกสารค่อยทำทีหลัง', v: 'warn', why: 'ได้ใช้พื้นที่เร็ว แต่หากเจ้าของหรือทายาทเปลี่ยนใจ โรงเรียนไม่มีหลักฐานสิทธิ และงบลงทุนสร้างอาคารบนที่ดินที่สิทธิไม่ชัดเจนจะถูกตั้งคำถาม' },
        ] },
      { q: 'ผู้บริจาคขอเงื่อนไขว่า หลานสองคนต้องได้เข้าห้องเรียนพิเศษโดยไม่ต้องสอบ ท่านจะตอบอย่างไร',
        opts: [
          { t: 'ขอบคุณ และชี้แจงว่าการรับนักเรียนต้องเป็นไปตามประกาศรับนักเรียนเหมือนทุกคน เสนอติดป้ายระลึกถึงผู้บริจาคแทน', v: 'ok', why: 'การรับบริจาคต้องไม่ผูกกับสิทธิพิเศษในการรับนักเรียน การให้เกียรติผู้บริจาคทำได้ด้วยวิธีที่ไม่กระทบสิทธิของผู้อื่น' },
          { t: 'รับเงื่อนไข เพราะที่ดินมีมูลค่าสูงกว่าที่นั่งสองที่', v: 'bad', why: 'การแลกที่นั่งเรียนกับทรัพย์สินทำให้การรับนักเรียนไม่เท่าเทียม เป็นประเด็นที่ถูกร้องเรียนและตรวจสอบบ่อยในการรับนักเรียน' },
        ] },
    ] },
];
export const QUEST = Object.fromEntries(QUESTS.map(q => [q.id, q]));

// ---------- สถานะ ----------
export function econ() {
  const S = St.S;
  if (!S.econ) S.econ = {
    students: 640, capacity: 900,
    wallets: { perhead: 450000, activity: 80000, income: 120000, student: 250000, capital: 0 },
    donations: [],          // [{purpose, amount, from}]
    capital: [],            // [{item, amount, approvedAt, readyAfter}] ได้รับจัดสรรเมื่อผ่านอีก 3 ด่าน
    owned: {},              // facilityId -> time
    bought: [],             // ประวัติซื้อ [{id, wallet, verdict, t}]
    questsDone: {},         // questId -> {t, tier}
    paidLevels: {},         // ด่านที่รับงบรอบภาคเรียนแล้ว
    log: [],                // ประวัติการเงิน
    crisis: false, lostToMisuse: 0, history: [],
    land: 0, events: [],     // แปลงที่ดินที่ขยาย, ของ/กิจกรรมที่จัดหาในภาคเรียนนี้
  };
  const e = S.econ; e.land ??= 0; e.events ??= [];
  return e;
}
export function fmt(n) { return Math.round(n).toLocaleString('th-TH'); }
export function donationTotal(purpose) {
  return econ().donations.filter(d => !purpose || d.purpose === purpose).reduce((s, d) => s + d.amount, 0);
}
export function capitalFor(item) {
  const c = econ().capital.find(c => c.item === item && c.ready && !c.used);
  return c ? c.amount : 0;
}
function addLog(text, amount) { const e = econ(); e.log.unshift({ t: Date.now(), text, amount }); if (e.log.length > 40) e.log.length = 40; }

export function sizeLabel(n = econ().students) {
  // ขนาดโรงเรียนในเกม (ใช้เพื่อการเล่น ไม่ใช่เกณฑ์ทางราชการ)
  if (n < 500) return 'โรงเรียนขนาดเล็ก';
  if (n < 1500) return 'โรงเรียนขนาดกลาง';
  if (n < 2500) return 'โรงเรียนขนาดใหญ่';
  return 'โรงเรียนขนาดใหญ่พิเศษ';
}
export function usable() { const w = econ().wallets; return w.perhead + w.income; }
export function crisisLine() { return econ().students * 250; }

// ---------- ซื้อของ ----------
export function judge(itemId, wallet) {
  const it = ITEM[itemId];
  const r = it.rules[wallet] || UNV();
  if (r.v === 'don') {
    const avail = donationTotal(r.purpose);
    if (avail >= it.price) return { v: 'ok', why: r.why + ` (มีเงินบริจาคเพื่อ${PURPOSE_TH[r.purpose]} ${fmt(avail)} บาท)`, src: r.src, purpose: r.purpose };
    const other = econ().donations.filter(d => d.purpose !== r.purpose).reduce((s, d) => s + d.amount, 0);
    if (other >= it.price) return { v: 'bad', why: `เงินบริจาคที่มีอยู่ระบุวัตถุประสงค์อื่น ไม่ใช่เพื่อ${PURPOSE_TH[r.purpose]} ` + r.why, src: r.src, purpose: 'other' };
    return { v: 'short', why: `เงินบริจาคเพื่อ${PURPOSE_TH[r.purpose]}มีไม่พอ` };
  }
  if (r.v === 'cap') {
    if (capitalFor(it.id) >= it.price) return { v: 'ok', why: r.why, src: r.src };
    return { v: 'nocap', why: 'ยังไม่ได้รับจัดสรรงบลงทุนสำหรับรายการนี้ ต้องทำเควส "ยื่นคำขอตั้งงบลงทุนประจำปี" แล้วรอการจัดสรร (ผ่านอีก 3 ด่าน)', src: r.src };
  }
  return r;
}
export const PURPOSE_TH = { building: 'พัฒนาอาคารสถานที่', learning: 'ห้องเรียนรู้และสื่อการเรียน', safety: 'ความปลอดภัย', scholar: 'ทุนการศึกษา', activity: 'กิจกรรมนักเรียน', people: 'จ้างบุคลากร', other: 'วัตถุประสงค์อื่น' };

function take(wallet, amount, purpose, itemId) {
  const e = econ();
  if (wallet === 'donation') {
    let need = amount;
    for (const d of e.donations) {
      if (purpose && purpose !== 'other' && d.purpose !== purpose) continue;
      const use = Math.min(need, d.amount); d.amount -= use; need -= use; if (!need) break;
    }
    e.donations = e.donations.filter(d => d.amount > 0);
  } else if (wallet === 'capital') {
    const c = e.capital.find(c => c.ready && !c.used && (!itemId || c.item === itemId)); if (c) c.used = true;
  } else e.wallets[wallet] -= amount;
}
export function balance(wallet, item) {
  const e = econ();
  if (wallet === 'donation') return donationTotal();
  if (wallet === 'capital') return item ? capitalFor(item) : e.capital.filter(c => c.ready && !c.used).reduce((s, c) => s + c.amount, 0);
  return e.wallets[wallet];
}
// คืนผล { ok, verdict, lost, why, src, method }
export function buy(itemId, wallet) {
  const e = econ(), it = ITEM[itemId];
  if (it.locked) return { ok: false, verdict: 'locked', why: it.lockNote };
  if (it.oneTime !== false && it.facility && e.owned[it.facility]) return { ok: false, verdict: 'owned', why: 'โรงเรียนมีรายการนี้แล้ว' };
  if (it.minLv && St.completedCount() < it.minLv) return { ok: false, verdict: 'lvlock', why: `เปิดซื้อเมื่อผ่านครบ ${it.minLv} ด่าน` };
  if (it.needLand && (e.land || 0) < it.needLand) return { ok: false, verdict: 'noland', why: 'ยังไม่มีพื้นที่ก่อสร้าง ต้องขยายพื้นที่โรงเรียนก่อน (เควส "ขยายพื้นที่โรงเรียน" ในแท็บเควสระดมทรัพยากร)' };
  const j = judge(itemId, wallet);
  const bal = balance(wallet, itemId);
  if (j.v === 'short' || j.v === 'nocap') return { ok: false, verdict: j.v, why: j.why, src: j.src };
  if (j.v === 'unv') return { ok: false, verdict: 'unv', why: j.why, src: j.src };
  if (wallet !== 'donation' && wallet !== 'capital' && bal < it.price) return { ok: false, verdict: 'short', why: `${WALLETS[wallet].short}มีไม่พอ (คงเหลือ ${fmt(bal)} บาท)` };
  const method = procurementNote(it.price);
  if (j.v === 'bad') {
    // ใช้เงินผิดประเภท: เงินถูกเรียกคืน รายการไม่ได้สร้าง
    take(wallet, Math.min(it.price, Math.max(0, bal)), j.purpose);
    e.lostToMisuse += it.price;
    e.bonus = e.bonus || { keng: 0, dee: 0, suk: 0 }; e.bonus.dee = Math.max(-15, (e.bonus.dee || 0) - 5);
    for (const c of Object.values(St.S.chars)) c.morale = Math.max(10, c.morale - 4);
    e.bought.push({ id: itemId, wallet, verdict: 'bad', t: Date.now() });
    addLog(`ใช้${WALLETS[wallet].short}ซื้อ "${it.th}" ผิดวัตถุประสงค์ ถูกทักท้วงและเรียกเงินคืน`, -it.price);
    checkCrisis(); St.save();
    return { ok: false, verdict: 'bad', lost: it.price, why: j.why, src: j.src };
  }
  take(wallet, it.price, j.purpose, itemId);
  if (it.facility) e.owned[it.facility] = Date.now();
  else { const now = semCount(); e.events.push({ id: itemId, from: now, until: now + (it.group === 'people' ? 2 : 1), t: Date.now() }); }
  if (it.capacity) e.capacity += it.capacity;
  e.bought.push({ id: itemId, wallet, verdict: 'ok', t: Date.now() });
  addLog(`ซื้อ "${it.th}" จาก${WALLETS[wallet].short}`, -it.price);
  if (it.keng || it.suk || it.dee) { e.bonus = e.bonus || { keng: 0, dee: 0, suk: 0 }; for (const k of ['keng', 'dee', 'suk']) e.bonus[k] = Math.min(15, (e.bonus[k] || 0) + (it[k] || 0)); }
  checkCrisis(); St.save();
  return { ok: true, verdict: 'ok', why: j.why, src: j.src, note: j.note || it.rules[wallet]?.note, method };
}
export function guardOwned(hazard) { const e = econ(); return ITEMS.some(i => i.guards === hazard && i.facility && e.owned[i.facility]); }
export function semCount() { return Object.keys(econ().paidLevels).length; }
// ของ/กิจกรรมที่ยังมีผลในภาคเรียนนี้ (ซื้อซ้ำได้ จึงแสดงในเมืองเฉพาะช่วงที่ใช้งาน)
export function activeEvents() {
  const e = econ(), now = semCount();
  return e.events.filter(v => now < v.until && ITEM[v.id]);
}
export const LAND_MAX = 4, LAND_CAP = 150;
export function procurementNote(price) {
  const parts = [];
  parts.push(price <= 500000 ? 'จัดซื้อจัดจ้างด้วยวิธีเฉพาะเจาะจงได้ (วงเงินไม่เกิน 500,000 บาท)' : 'วงเงินเกิน 500,000 บาท ต้องใช้วิธีที่ระเบียบกำหนด เช่น วิธีประกาศเชิญชวนทั่วไป');
  parts.push(price <= 100000 ? 'แต่งตั้งผู้ตรวจรับพัสดุคนเดียวได้' : 'ต้องแต่งตั้งคณะกรรมการตรวจรับพัสดุ 3 คน');
  parts.push('ห้ามแบ่งซื้อแบ่งจ้างเพื่อให้วงเงินหรือวิธีเปลี่ยนไป (ระเบียบกระทรวงการคลัง 2560 ข้อ 20)');
  return parts;
}

// ---------- เควส ----------
export function questAvailable(q) {
  const e = econ(); const tierNow = currentTier();
  if (tierNow < q.minTier) return { ok: false, why: `เปิดเมื่อถึง${q.minTier === 2 ? 'ช่วงที่ 2' : 'ช่วงที่ ' + q.minTier}` };
  const d = e.questsDone[q.id];
  if (q.capitalQuest && e.capital.some(c => !c.used)) return { ok: false, why: 'มีคำขอที่รอการจัดสรรหรือยังไม่ได้ใช้อยู่แล้ว' };
  if (q.landQuest && (e.land || 0) >= LAND_MAX) return { ok: false, why: 'ขยายพื้นที่ครบแล้ว' };
  if (d && d.tier === tierNow) return { ok: false, why: 'ทำแล้วในช่วงนี้ ทำได้อีกครั้งเมื่อถึงช่วงถัดไป' };
  return { ok: true };
}
export function currentTier() {
  let t = 1; for (let k = 2; k <= St.TIER_COUNT; k++) if (St.tierOpen(k)) t = k; return t;
}
// answers: array of chosen option objects; คืน {score, reward, text}
export function finishQuest(qid, answers) {
  const e = econ(), q = QUEST[qid];
  const bad = answers.filter(a => a.v === 'bad').length, warn = answers.filter(a => a.v === 'warn').length;
  let factor = bad ? 0 : (warn ? 0.6 : 1);
  e.questsDone[qid] = { t: Date.now(), tier: currentTier(), factor };
  const r = q.reward; let text = '';
  if (q.landQuest) {
    if (!bad) {
      e.land = Math.min(LAND_MAX, (e.land || 0) + 1); e.capacity += LAND_CAP;
      text = `โรงเรียนได้รับที่ดินแปลงที่ ${e.land} รับนักเรียนได้เพิ่ม ${LAND_CAP} คน (ความจุ ${fmt(e.capacity)} คน)` + (factor < 1 ? ' แต่เอกสารยังไม่ครบ ชุมชนบางส่วนตั้งคำถาม' : '');
      addLog(`ขยายพื้นที่โรงเรียน แปลงที่ ${e.land}`, 0);
      if (factor < 1) for (const c of Object.values(St.S.chars)) c.morale = Math.max(10, c.morale - 3);
    } else text = 'ผู้บริจาคถอนการบริจาค เพราะเงื่อนไขที่ตกลงกันขัดหลักการ โรงเรียนยังไม่ได้ที่ดิน';
  } else if (q.capitalQuest) {
    const cap = answers.find(a => a.cap)?.cap;
    const capIt = cap && ITEM[cap];
    if (capIt && ((capIt.needLand || 0) > (e.land || 0) || (capIt.minLv && St.completedCount() < capIt.minLv))) {
      text = `คำขอ "${capIt.th}" ยังไม่ผ่านการพิจารณา เพราะ${(capIt.needLand || 0) > (e.land || 0) ? `ยังไม่มีที่ดินแปลงที่ ${capIt.needLand}` : `ต้องผ่านอย่างน้อย ${capIt.minLv} ด่านก่อน`}`;
    } else if (cap && !bad) {
      const it = ITEM[cap];
      e.capital.push({ item: cap, amount: it.price, approvedAt: Date.now(), readyAfter: St.completedCount() + 3, ready: false, used: false });
      text = `ส่งคำขอ "${it.th}" แล้ว จะได้รับจัดสรรเมื่อท่านผ่านอีก 3 ด่าน`;
      addLog(`ยื่นคำขอตั้งงบลงทุน: ${it.th}`, 0);
    } else text = 'คำขอไม่ได้รับการพิจารณา';
  } else if (r.wallet === 'donation') {
    const amt = Math.round(r.amount * factor);
    if (amt) e.donations.push({ purpose: r.purpose, amount: amt, from: q.th });
    text = amt ? `ได้รับเงินบริจาคเพื่อ${PURPOSE_TH[r.purpose]} ${fmt(amt)} บาท` : 'ผู้บริจาคยกเลิกการบริจาค';
    if (amt) addLog(`รับบริจาค (${PURPOSE_TH[r.purpose]})`, amt);
  } else if (r.wallet) {
    const amt = Math.round(r.amount * factor);
    e.wallets[r.wallet] += amt;
    text = amt ? `${WALLETS[r.wallet].short}เพิ่มขึ้น ${fmt(amt)} บาท` : 'ไม่ได้รับเงินจากเควสนี้';
    if (amt) addLog(q.th, amt);
  } else {
    text = factor ? 'นักเรียนยากจนพิเศษได้รับการดูแล ขวัญกำลังใจของครูเพิ่มขึ้น' : 'ทุนไม่ถึงตัวนักเรียน ครูและผู้ปกครองไม่พอใจ';
    for (const c of Object.values(St.S.chars)) c.morale = Math.max(10, Math.min(100, c.morale + (factor ? r.morale : -6)));
  }
  checkCrisis(); St.save();
  return { factor, text, bad };
}

// ---------- รอบภาคเรียน: เรียกเมื่อผ่านด่านครั้งแรก ----------
export function semesterTick(levelId, meters) {
  const e = econ();
  if (e.paidLevels[levelId]) return null;
  e.paidLevels[levelId] = Date.now();
  const n = e.students;
  const inPer = n * 150, inAct = n * 40, inStu = n * 100, inInc = 5000;
  const saving = Object.keys(e.owned).reduce((s, f) => s + (ITEMS.find(i => i.facility === f)?.saving || 0), 0);
  const expense = Math.max(0, n * 90 - saving);
  e.wallets.perhead += inPer - expense; e.wallets.activity += inAct; e.wallets.student += inStu; e.wallets.income += inInc;
  // นักเรียนใช้เงินของนักเรียนตามวัตถุประสงค์ (ไม่สะสมเกินจริง)
  e.wallets.student = Math.min(e.wallets.student, n * 400);
  // ความพร้อมรับงบลงทุน
  for (const c of e.capital) if (!c.ready && St.completedCount() >= c.readyAfter) { c.ready = true; addLog(`ได้รับจัดสรรงบลงทุน: ${ITEM[c.item].th}`, c.amount); }
  // การเติบโตของจำนวนนักเรียน: ชื่อเสียงจากตัวชี้วัด + สิ่งอำนวยความสะดวก − วิกฤต
  const vals = [meters.keng, meters.dee, meters.suk].filter(v => v != null);
  const kds = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 60;
  const fac = Object.keys(e.owned).reduce((s, f) => s + (ITEMS.find(i => i.facility === f)?.rep || 0), 0);
  let delta = Math.round((kds - 58) * 1.4 + fac * 0.8);
  if (e.crisis) delta -= 35;
  delta = Math.max(-45, Math.min(60, delta));
  const before = e.students;
  e.students = Math.max(250, Math.min(e.capacity, e.students + delta));
  addLog(`รับงบรอบภาคเรียน (ด่าน ${levelId}) รายหัว +${fmt(inPer)} ค่าสาธารณูปโภคและค่าจ้าง −${fmt(expense)}`, inPer - expense + inAct + inInc);
  const staffGot = allocateStaff();
  const wasCrisis = e.crisis;
  checkCrisis();
  e.history.push({ lv: levelId, students: e.students, perhead: e.wallets.perhead, income: e.wallets.income, crisis: e.crisis });
  St.save();
  return { inPer, inAct, inInc, expense, studentsBefore: before, students: e.students, full: e.students >= e.capacity, crisisStart: !wasCrisis && e.crisis, crisisEnd: wasCrisis && !e.crisis, staffGot };
}
export function checkCrisis() {
  const e = econ();
  const was = e.crisis;
  e.crisis = e.wallets.perhead < 0 || usable() < crisisLine();
  if (e.crisis && !was) addLog('โรงเรียนเข้าสู่ภาวะวิกฤตทางการเงิน', 0);
  if (!e.crisis && was) addLog('โรงเรียนพ้นภาวะวิกฤตทางการเงิน', 0);
  return e.crisis;
}

// ---------- รหัสเยี่ยมโรงเรียน ----------
export function visitPayload(extra) {
  const e = econ();
  return { v: 1, n: St.S.playerName || '', s: e.students, f: Object.keys(e.owned), c: e.crisis ? 1 : 0, ld: e.land || 0, ev: activeEvents().map(v => v.id), ...extra };
}
export function encodeVisit(o) {
  const bytes = new TextEncoder().encode(JSON.stringify(o));
  let bin = ''; bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeVisit(code) {
  code = (code || '').trim();
  const m = code.match(/[?&#]visit=([A-Za-z0-9_-]+)/); if (m) code = m[1];
  code = code.replace(/-/g, '+').replace(/_/g, '/');
  while (code.length % 4) code += '=';
  const bin = atob(code);
  const o = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
  if (!o || o.v !== 1 || typeof o.s !== 'number') throw new Error('รหัสโรงเรียนไม่ถูกต้อง');
  o.f = (o.f || []).filter(f => ITEMS.some(i => i.facility === f));
  o.n = String(o.n || '').slice(0, 24);
  o.ld = Math.max(0, Math.min(LAND_MAX, +o.ld || 0));
  o.ev = (o.ev || []).filter(id => ITEM[id]).slice(0, 20);
  return o;
}

// ตัวชี้วัดเก่ง ดี มีสุข หลังรวมผลของสิ่งอำนวยความสะดวกและภาวะวิกฤต
export function meters() {
  const m = St.schoolMeters();
  const e = econ(), b = e.bonus || {};
  const adj = (v, k) => v == null ? null : Math.max(0, Math.min(100, Math.round(v + (b[k] || 0) - (e.crisis ? 15 : 0))));
  return { ...m, keng: adj(m.keng, 'keng'), dee: adj(m.dee, 'dee'), suk: adj(m.suk, 'suk') };
}

// ---------- อัตรากำลังตามจำนวนนักเรียน ----------
// เกณฑ์ในเกม: แนวคิดว่าจำนวนรองผู้อำนวยการและครูขึ้นกับจำนวนนักเรียน อิงหลักของเกณฑ์อัตรากำลัง ก.ค.ศ. (ว 23/2563)
// แต่ตัวเลขช่วงนักเรียนด้านล่างกำหนดเพื่อการเล่น ยังไม่ได้ตรวจกับหนังสือจริง
export const DEPUTY_STEPS = [
  { min: 0, n: 2 }, { min: 900, n: 3 }, { min: 1200, n: 4 }, { min: 1600, n: 5 },
];
export const NEW_DEPUTIES = [
  { id: 'deputy3', name: 'รองฯ วิทยา', role: 'รองผู้อำนวยการกลุ่มบริหารงบประมาณ', look: { shirt: '#5B8DD6', skin: '#E5B48C', hair: '#2A2A2A', acc: 'tie' } },
  { id: 'deputy4', name: 'รองฯ สุดา', role: 'รองผู้อำนวยการกลุ่มบริหารงานบุคคล', look: { shirt: '#B59AD6', skin: '#F2C9A5', hair: '#3B2A22', acc: 'bun' } },
  { id: 'deputy5', name: 'รองฯ ภูมิ', role: 'รองผู้อำนวยการฝ่ายกิจการนักเรียน', look: { shirt: '#6FAF7A', skin: '#C99772', hair: '#1A1A1A', acc: 'tie' } },
];
export const STUDENTS_PER_TEACHER = 20;
export function staff() {
  const e = econ();
  e.staff ??= { deputies: 2, teachers: Math.ceil(e.students / STUDENTS_PER_TEACHER), pending: [] };
  e.staff.base ??= e.staff.teachers;
  return e.staff;
}
export function entitled(n = econ().students) {
  let d = 2; for (const st of DEPUTY_STEPS) if (n >= st.min) d = st.n;
  return { deputies: d, teachers: Math.ceil(n / STUDENTS_PER_TEACHER) };
}
// ยื่นขออัตรา: ได้รับเมื่อผ่านด่านถัดไป (รอบภาคเรียน)
export function requestStaff(kind) {
  const st = staff(), ent = entitled();
  if (st.pending.some(p => p.kind === kind)) return { ok: false, why: 'ยื่นคำขอไปแล้ว รอผลหลังผ่านด่านถัดไป' };
  const have = kind === 'deputy' ? st.deputies : st.teachers, can = kind === 'deputy' ? ent.deputies : ent.teachers;
  if (have >= can) return { ok: false, why: 'อัตรากำลังยังไม่ต่ำกว่าเกณฑ์ จึงยังขออัตราเพิ่มไม่ได้' };
  st.pending.push({ kind, n: kind === 'deputy' ? 1 : Math.min(5, can - have), at: semCount() });
  addLog(kind === 'deputy' ? 'ยื่นขออัตรารองผู้อำนวยการเพิ่ม' : 'ยื่นขออัตราครูเพิ่มตามเกณฑ์', 0);
  St.save();
  return { ok: true };
}
// เรียกจาก semesterTick: จัดสรรอัตราที่ยื่นไว้ คืนรายการที่ได้รับ
function allocateStaff() {
  const st = staff(), got = [];
  for (const p of st.pending) if (semCount() > p.at) {
    if (p.kind === 'deputy') { st.deputies += 1; got.push({ kind: 'deputy', who: NEW_DEPUTIES[st.deputies - 3] }); }
    else { st.teachers += p.n; got.push({ kind: 'teacher', n: p.n }); }
  }
  st.pending = st.pending.filter(p => semCount() <= p.at);
  if (got.length) { const e = econ(); e.bonus = e.bonus || { keng: 0, dee: 0, suk: 0 }; e.bonus.suk = Math.min(15, (e.bonus.suk || 0) + got.length); }
  return got;
}
export function staffGap() { const st = staff(), ent = entitled(); return { deputies: ent.deputies - st.deputies, teachers: ent.teachers - st.teachers }; }
