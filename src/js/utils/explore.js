// ─────────────────────────────────────────────────────────────────────────────
// Explore — curated destination guides (“ชวนไปที่นี่” / Wanderlog’s “add places
// from guides with 1 click”).
//
// The app ships a small, hand-curated starter library: for each destination a
// handful of places with category, typical cost, best time of day, a one-line
// note and real coordinates. Everything is pure data + pure functions, so the
// guides work offline and can be unit-tested; the UI (renderExplore in app.js)
// turns a place into *either* an idea on the voting board *or* a real itinerary
// item via the shared “add to plan” sheet.
// ─────────────────────────────────────────────────────────────────────────────

import { toMinor } from './currency.js';

export const EXPLORE_CATEGORIES = [
  { id: 'all', icon: 'sparkles', th: 'ทั้งหมด', en: 'All' },
  { id: 'sightseeing', icon: 'camera', th: 'ท่องเที่ยว', en: 'Sightseeing' },
  { id: 'food', icon: 'utensils-crossed', th: 'อาหาร', en: 'Food' },
  { id: 'activity', icon: 'ferris-wheel', th: 'กิจกรรม', en: 'Activity' },
  { id: 'shopping', icon: 'shopping-bag', th: 'ช้อปปิ้ง', en: 'Shopping' },
  { id: 'stay', icon: 'bed-double', th: 'ที่พัก', en: 'Stay' },
  { id: 'transport', icon: 'train-front', th: 'เดินทาง', en: 'Transport' }
];

/**
 * One entry per destination. `keywords` powers the trip → destination match and
 * the free-text search (Thai + English + airport codes, all lowercase).
 */
export const DESTINATIONS = [
  {
    id: 'tokyo', country: 'Japan', countryTh: 'ญี่ปุ่น', city: 'Tokyo', cityTh: 'โตเกียว',
    currency: 'JPY', keywords: ['tokyo', 'โตเกียว', 'japan', 'ญี่ปุ่น', 'nrt', 'hnd', 'shinjuku', 'asakusa'],
    tagline: { th: 'เมืองที่ทุกมุมถ่ายรูปขึ้น — วัดเก่า ย่านไฟนีออน และของกินตลอด 24 ชม.', en: 'Neon streets, old temples and food at every hour' },
    places: [
      { id: 'sensoji', name: { th: 'วัดเซ็นโซจิ (อาซากุสะ)', en: 'Senso-ji Temple (Asakusa)' }, category: 'sightseeing', area: 'Asakusa', coordinates: '35.7148,139.7967', durationMinutes: 90, cost: 0, currency: 'JPY', best: 'morning', note: { th: 'ประตูฟ้าครามกับถนนนากามิเสะ ไปเช้าคนน้อย ถ่ายรูปสวย', en: 'Thunder Gate + Nakamise street — go early for photos' } },
      { id: 'skytree', name: { th: 'โตเกียวสกายทรี', en: 'Tokyo Skytree' }, category: 'sightseeing', area: 'Sumida', coordinates: '35.7101,139.8107', durationMinutes: 90, cost: 2100, currency: 'JPY', best: 'evening', note: { th: 'ชมวิวเมืองจากหอคอยสูง 634 ม. ช่วงพระอาทิตย์ตกสวยสุด', en: '634 m tower — best at sunset' } },
      { id: 'shibuya', name: { th: 'ชิบูย่า ครอสซิ่ง', en: 'Shibuya Crossing & Sky' }, category: 'sightseeing', area: 'Shibuya', coordinates: '35.6595,139.7005', durationMinutes: 60, cost: 0, currency: 'JPY', best: 'evening', note: { th: 'สี่แยกที่คนข้ามมากที่สุดในโลก + ดาดฟ้าชมวิว Shibuya Sky', en: 'The world’s busiest crossing + Shibuya Sky deck' } },
      { id: 'tsukiji', name: { th: 'ตลาดสึกิจิ (ของกิน)', en: 'Tsukiji Outer Market' }, category: 'food', area: 'Tsukiji', coordinates: '35.6654,139.7707', durationMinutes: 90, cost: 2000, currency: 'JPY', best: 'morning', note: { th: 'ซูชิ ไข่หวาน ทามาโกะยากิ และสตรอว์เบอร์รีชุบน้ำตาล', en: 'Sushi, tamagoyaki and street snacks' } },
      { id: 'teamlab', name: { th: 'teamLab Planets', en: 'teamLab Planets' }, category: 'activity', area: 'Toyosu', coordinates: '35.6487,139.7899', durationMinutes: 120, cost: 3800, currency: 'JPY', best: 'afternoon', note: { th: 'พิพิธภัณฑ์ดิจิทัลเดินลุยน้ำ — ต้องจองตั๋วล่วงหน้า', en: 'Immersive digital art — book a timed ticket' } },
      { id: 'harajuku', name: { th: 'ฮาราจูกุ / ทาเคชิตะ', en: 'Harajuku & Takeshita St.' }, category: 'shopping', area: 'Harajuku', coordinates: '35.6717,139.7030', durationMinutes: 120, cost: 3000, currency: 'JPY', best: 'afternoon', note: { th: 'ถนนแฟชั่นวัยรุ่น ต่อด้วยป่าเมจิในเดิน 10 นาที', en: 'Youth fashion street, Meiji Shrine is a 10-min walk' } },
      { id: 'shinjuku-gyoen', name: { th: 'สวนชินจูกุเกียวเอ็น', en: 'Shinjuku Gyoen Garden' }, category: 'sightseeing', area: 'Shinjuku', coordinates: '35.6852,139.7100', durationMinutes: 90, cost: 500, currency: 'JPY', best: 'afternoon', note: { th: 'สวนใหญ่กลางเมือง จุดชมซากุระและใบไม้เปลี่ยนสี', en: 'Big city garden — sakura and autumn leaves' } },
      { id: 'omoide', name: { th: 'โอโมอิเดะ โยโกโช (ตรอกอิซากายะ)', en: 'Omoide Yokocho' }, category: 'food', area: 'Shinjuku', coordinates: '35.6933,139.6994', durationMinutes: 90, cost: 3500, currency: 'JPY', best: 'evening', note: { th: 'ตรอกเล็ก ๆ กับร้านยากิโทริรมควัน — บรรยากาศคลาสสิก', en: 'Tiny smoky yakitori alley — classic Tokyo' } }
    ]
  },
  {
    id: 'kyoto', country: 'Japan', countryTh: 'ญี่ปุ่น', city: 'Kyoto', cityTh: 'เกียวโต',
    currency: 'JPY', keywords: ['kyoto', 'เกียวโต', 'japan', 'ญี่ปุ่น', 'kix', 'arashiyama', 'gion'],
    tagline: { th: 'วัดเก่า ไบ่ไม้ไผ่ และเมืองเก่าที่เดินได้ทั้งวัน', en: 'Temples, bamboo groves and walkable old town' },
    places: [
      { id: 'fushimi', name: { th: 'ศาลเจ้าฟุชิมิอินาริ', en: 'Fushimi Inari Shrine' }, category: 'sightseeing', area: 'Fushimi', coordinates: '34.9671,135.7727', durationMinutes: 120, cost: 0, currency: 'JPY', best: 'morning', note: { th: 'เสาโทริอิหลายพันต้น — ไปก่อน 8 โมงจะได้รูปโล่ง', en: 'Thousands of torii gates — go before 8 am' } },
      { id: 'arashiyama', name: { th: 'ป่าไผ่ อาราชิยามะ', en: 'Arashiyama Bamboo Grove' }, category: 'sightseeing', area: 'Arashiyama', coordinates: '35.0170,135.6717', durationMinutes: 90, cost: 0, currency: 'JPY', best: 'morning', note: { th: 'เดินป่าไผ่ต่อสะพานโทเก็ตสึเคียวและวัดเท็นเรียวจิ', en: 'Bamboo path + Togetsukyo bridge & Tenryu-ji' } },
      { id: 'kiyomizu', name: { th: 'วัดคิโยมิซุ', en: 'Kiyomizu-dera' }, category: 'sightseeing', area: 'Higashiyama', coordinates: '34.9949,135.7850', durationMinutes: 90, cost: 500, currency: 'JPY', best: 'morning', note: { th: 'ระเบียงไม้ใหญ่ชมเมืองเกียวโต ต่อถนนซันเน็นซากะ', en: 'Wooden stage with old-town views; walk Sannenzaka' } },
      { id: 'nishiki', name: { th: 'ตลาดนิชิกิ', en: 'Nishiki Market' }, category: 'food', area: 'Nakagyo', coordinates: '35.0050,135.7649', durationMinutes: 90, cost: 1800, currency: 'JPY', best: 'afternoon', note: { th: 'ตรอกของกิน 400 ปี — ลองทามาโกะยากิและโยโดฟุ', en: '400-year food alley — tamagoyaki & yudofu' } },
      { id: 'gion', name: { th: 'ย่านกิออน', en: 'Gion District' }, category: 'sightseeing', area: 'Gion', coordinates: '35.0037,135.7780', durationMinutes: 60, cost: 0, currency: 'JPY', best: 'evening', note: { th: 'บ้านไม้เก่าและร้านชา — เงียบ สุภาพ ห้ามถ่ายรูปในตรอกส่วนตัว', en: 'Wooden machiya & tea houses — be respectful' } },
      { id: 'kinkakuji', name: { th: 'วัดคินคาคุจิ (ทอง)', en: 'Kinkaku-ji (Golden Pavilion)' }, category: 'sightseeing', area: 'Kita', coordinates: '35.0394,135.7292', durationMinutes: 60, cost: 500, currency: 'JPY', best: 'morning', note: { th: 'ศาลาทองหลังสระน้ำ — ไปเช้าเลี่ยงกรุ๊ปทัวร์', en: 'Golden pavilion by the pond — beat the tour buses' } }
    ]
  },
  {
    id: 'osaka', country: 'Japan', countryTh: 'ญี่ปุ่น', city: 'Osaka', cityTh: 'โอซาก้า',
    currency: 'JPY', keywords: ['osaka', 'โอซาก้า', 'japan', 'ญี่ปุ่น', 'kix', 'dotonbori', 'namba'],
    tagline: { th: 'เมืองของกิน ราคาดี และฐานไปเกียวโต–นารา', en: 'Street food city — great base for Kyoto & Nara' },
    places: [
      { id: 'dotonbori', name: { th: 'โดทงโบริ', en: 'Dotonbori' }, category: 'food', area: 'Namba', coordinates: '34.6687,135.5013', durationMinutes: 120, cost: 3000, currency: 'JPY', best: 'evening', note: { th: 'ป้ายกูลิโกะ ทาโกยากิ และปูยักษ์ — เดินเล่นยามค่ำ', en: 'Glico sign, takoyaki and neon at night' } },
      { id: 'osaka-castle', name: { th: 'ปราสาทโอซาก้า', en: 'Osaka Castle' }, category: 'sightseeing', area: 'Chuo', coordinates: '34.6873,135.5262', durationMinutes: 120, cost: 600, currency: 'JPY', best: 'morning', note: { th: 'ปราสาทกับสวนกว้าง จุดชมซากุระยอดนิยม', en: 'Castle + park, a top sakura spot' } },
      { id: 'kuromon', name: { th: 'ตลาดคุโระมอน', en: 'Kuromon Ichiba Market' }, category: 'food', area: 'Nipponbashi', coordinates: '34.6654,135.5063', durationMinutes: 90, cost: 2500, currency: 'JPY', best: 'morning', note: { th: 'ตลาดทะเลสด หอยเชลล์ย่าง วัวย่าง — จ่ายสด', en: 'Fresh seafood — grilled scallops & wagyu skewers' } },
      { id: 'umeda', name: { th: 'อูเมดะ สกายบิลดิ้ง', en: 'Umeda Sky Building' }, category: 'sightseeing', area: 'Umeda', coordinates: '34.7052,135.4897', durationMinutes: 75, cost: 1500, currency: 'JPY', best: 'evening', note: { th: 'ดาดฟ้าวงแหวนลอยฟ้า วิวโอซาก้าทั้งเมือง', en: 'Floating garden observatory — best at dusk' } },
      { id: 'kaiyukan', name: { th: 'พิพิธภัณฑ์สัตว์น้ำไคยูคัง', en: 'Osaka Aquarium Kaiyukan' }, category: 'activity', area: 'Minato', coordinates: '34.6544,135.4289', durationMinutes: 150, cost: 2700, currency: 'JPY', best: 'afternoon', note: { th: 'อควาเรียมยักษ์ ปลาฉลามวาฬ — เหมาะกับวันฝนตก', en: 'Whale sharks — great rainy-day plan' } },
      { id: 'shinsekai', name: { th: 'ชินเซไก + สึเท็นคาคุ', en: 'Shinsekai & Tsutenkaku' }, category: 'food', area: 'Shinsekai', coordinates: '34.6524,135.5063', durationMinutes: 90, cost: 1500, currency: 'JPY', best: 'evening', note: { th: 'ย่านเรโทรกับคุชิคัตสึ — ของทอดเสียบไม้', en: 'Retro quarter famous for kushikatsu' } }
    ]
  },
  {
    id: 'fuji', country: 'Japan', countryTh: 'ญี่ปุ่น', city: 'Fujikawaguchiko', cityTh: 'ฟุจิคาวากุจิโกะ',
    currency: 'JPY', keywords: ['fuji', 'fujikawaguchiko', 'kawaguchiko', 'ฟูจิ', 'ฟุจิ', 'hakone', 'japan', 'ญี่ปุ่น'],
    tagline: { th: 'ทะเลสาบกับภูเขาไฟฟูจิ — วิวที่ต้องไปเช้า', en: 'Lakes & Mt. Fuji — go early for the clear view' },
    places: [
      { id: 'kawaguchiko-ko', name: { th: 'ทะเลสาบคาวากุจิ', en: 'Lake Kawaguchi' }, category: 'sightseeing', area: 'Kawaguchiko', coordinates: '35.5094,138.7636', durationMinutes: 120, cost: 0, currency: 'JPY', best: 'morning', note: { th: 'จุดถ่ายภูเขาฟูจิกับเงาสะท้อน — ลมนิ่งเช้าสุด', en: 'Classic reflection shot of Mt. Fuji' } },
      { id: 'chureito', name: { th: 'เจดีย์ชูเรโต', en: 'Chureito Pagoda' }, category: 'sightseeing', area: 'Arakura', coordinates: '35.5019,138.8070', durationMinutes: 90, cost: 0, currency: 'JPY', best: 'morning', note: { th: 'ขึ้นบันได 400 ขั้น ไปเช้าคนน้อย ฟ้าใส', en: '400 steps up — clearest in the morning' } },
      { id: 'oshino-hakkai', name: { th: 'น้ำตกโอชิโนะฮัคไค', en: 'Oshino Hakkai Springs' }, category: 'sightseeing', area: 'Oshino', coordinates: '35.4596,138.8347', durationMinutes: 75, cost: 0, currency: 'JPY', best: 'afternoon', note: { th: 'บ่อน้ำใสทั้งแปดกับหมู่บ้านเก่า', en: 'Eight crystal springs in an old village' } },
      { id: 'onsen', name: { th: 'ออนเซ็นกลางแจ้ง', en: 'Rotenburo Onsen' }, category: 'activity', area: 'Kawaguchiko', coordinates: '35.5170,138.7540', durationMinutes: 90, cost: 1200, currency: 'JPY', best: 'evening', note: { th: 'แช่น้ำร้อนกลางแจ้งพร้อมวิวภูเขา — หลังพระอาทิตย์ตก', en: 'Outdoor hot spring with mountain views' } },
      { id: 'fuji-q', name: { th: 'สวนสนุก Fuji-Q Highland', en: 'Fuji-Q Highland' }, category: 'activity', area: 'Fujiyoshida', coordinates: '35.4875,138.7803', durationMinutes: 240, cost: 6800, currency: 'JPY', best: 'morning', note: { th: 'รถไฟเหาะสุดเสียว — ไปวันธรรมดาคิวสั้น', en: 'Huge roller coasters — weekday queues are shorter' } },
      { id: 'hoto', name: { th: 'โฮโตะ (เส้นหมี่ฟักทอง)', en: 'Hoto noodle lunch' }, category: 'food', area: 'Kawaguchiko', coordinates: '35.5040,138.7640', durationMinutes: 60, cost: 1300, currency: 'JPY', best: 'afternoon', note: { th: 'เส้นหนาในหม้อดินร้อน ๆ อาหารท้องถิ่นยามะนาชิ', en: 'Thick miso noodles in an iron pot — local comfort food' } }
    ]
  },
  {
    id: 'bangkok', country: 'Thailand', countryTh: 'ไทย', city: 'Bangkok', cityTh: 'กรุงเทพ',
    currency: 'THB', keywords: ['bangkok', 'กรุงเทพ', 'krung thep', 'thailand', 'ไทย', 'bkk', 'siam', 'asok'],
    tagline: { th: 'วัดวัง คาเฟ่ และ street food ที่ไม่มีวันหมด', en: 'Temples, cafés and endless street food' },
    places: [
      { id: 'grand-palace', name: { th: 'วัดพระแก้ว + พระบรมมหาราชวัง', en: 'Grand Palace & Wat Phra Kaew' }, category: 'sightseeing', area: 'Rattanakosin', coordinates: '13.7500,100.4914', durationMinutes: 150, cost: 500, currency: 'THB', best: 'morning', note: { th: 'เปิดเช้า แต่งกายสุภาพ (ปิดไหล่–ขา) ไปก่อน 9 โมงเลี่ยงร้อน', en: 'Opens early — cover shoulders & knees, beat the heat' } },
      { id: 'wat-arun', name: { th: 'วัดอรุณราชวราราม', en: 'Wat Arun (Temple of Dawn)' }, category: 'sightseeing', area: 'Thonburi', coordinates: '13.7437,100.4889', durationMinutes: 75, cost: 100, currency: 'THB', best: 'evening', note: { th: 'ข้ามเรือจากท่าเตียน ไปช่วงเย็นแสงสวย', en: 'Take the cross-river ferry, best light at dusk' } },
      { id: 'chatuchak', name: { th: 'ตลาดนัดจตุจักร', en: 'Chatuchak Weekend Market' }, category: 'shopping', area: 'Chatuchak', coordinates: '13.7999,100.5504', durationMinutes: 180, cost: 1500, currency: 'THB', best: 'morning', note: { th: 'สุดสัปดาห์เท่านั้น — 15,000 ร้าน เตรียมเงินสด', en: 'Weekends only — 15,000 stalls, bring cash' } },
      { id: 'jay-fai', name: { th: 'เจ๊ไฝ (มิชลิน)', en: 'Jay Fai (Michelin street food)' }, category: 'food', area: 'Phra Nakhon', coordinates: '13.7529,100.5045', durationMinutes: 120, cost: 1200, currency: 'THB', best: 'evening', note: { th: 'ไข่เจียวปูยักษ์ ต้องจอง/รอคิว — เผื่อเวลา', en: 'Crab omelette — expect a queue' } },
      { id: 'iconsiam', name: { th: 'ไอคอนสยาม + ริมน้ำเจ้าพระยา', en: 'ICONSIAM & riverside' }, category: 'shopping', area: 'Khlong San', coordinates: '13.7265,100.5100', durationMinutes: 120, cost: 1000, currency: 'THB', best: 'evening', note: { th: 'ห้างริมน้ำ มีเรือรับส่งฟรีจากสาทร', en: 'Riverside mall with a free shuttle boat' } },
      { id: 'khaosan', name: { th: 'ถนนข้าวสาร', en: 'Khaosan Road' }, category: 'food', area: 'Banglamphu', coordinates: '13.7590,100.4977', durationMinutes: 90, cost: 600, currency: 'THB', best: 'evening', note: { th: 'ย่านแบ็คแพ็คเกอร์ ของกินกลางคืนและร้านดนตรีสด', en: 'Backpacker strip — night food & live music' } },
      { id: 'talad-noi', name: { th: 'ตลาดน้อย (คาเฟ่สายถ่ายรูป)', en: 'Talat Noi' }, category: 'activity', area: 'Talat Noi', coordinates: '13.7372,100.5120', durationMinutes: 90, cost: 400, currency: 'THB', best: 'afternoon', note: { th: 'สตรีทอาร์ต คาเฟ่เล็ก ๆ และศาลเจ้าเก่า', en: 'Street art, small cafés and old shrines' } }
    ]
  },
  {
    id: 'chiangmai', country: 'Thailand', countryTh: 'ไทย', city: 'Chiang Mai', cityTh: 'เชียงใหม่',
    currency: 'THB', keywords: ['chiang mai', 'เชียงใหม่', 'thailand', 'ไทย', 'cnx', 'doi suthep', 'nimman'],
    tagline: { th: 'เมืองเก่า ภูเขา และกาแฟดีที่สุดในไทย', en: 'Old town, mountains and Thailand’s best coffee' },
    places: [
      { id: 'doi-suthep', name: { th: 'วัดพระธาตุดอยสุเทพ', en: 'Wat Phra That Doi Suthep' }, category: 'sightseeing', area: 'Doi Suthep', coordinates: '18.8048,98.9215', durationMinutes: 120, cost: 100, currency: 'THB', best: 'morning', note: { th: 'ขึ้นบันได 306 ขั้น วิวเมืองเชียงใหม่ทั้งเมือง', en: '306 steps — full view over the city' } },
      { id: 'old-city', name: { th: 'วัดในเมืองเก่า (พระสิงห์ / เจดีย์หลวง)', en: 'Old City temples' }, category: 'sightseeing', area: 'Old City', coordinates: '18.7883,98.9886', durationMinutes: 150, cost: 100, currency: 'THB', best: 'morning', note: { th: 'เดินหรือปั่นจักรยานชมวัดในคูเมืองเช้า ๆ', en: 'Walk or cycle between the moat-side temples' } },
      { id: 'nimman', name: { th: 'นิมมานเหมินท์ (คาเฟ่)', en: 'Nimmanhaemin cafés' }, category: 'food', area: 'Nimman', coordinates: '18.7990,98.9670', durationMinutes: 120, cost: 300, currency: 'THB', best: 'afternoon', note: { th: 'ย่านคาเฟ่ ถ่ายรูปสวย ร้านกาแฟเปิดถึงเย็น', en: 'The café district — photogenic and slow-paced' } },
      { id: 'sunday-market', name: { th: 'ถนนคนเดินวันอาทิตย์', en: 'Sunday Walking Street' }, category: 'shopping', area: 'Ratchadamnoen', coordinates: '18.7880,98.9900', durationMinutes: 150, cost: 500, currency: 'THB', best: 'evening', note: { th: 'อาทิตย์เดียว 17:00–22:00 ของฝากและของกินพื้นเมือง', en: 'Sundays 5–10 pm — crafts and local food' } },
      { id: 'mae-kampong', name: { th: 'ปางช้างแม่สา / แม่กัมปอง', en: 'Elephant Nature Park / Mae Kampong' }, category: 'activity', area: 'Mae Taeng', coordinates: '19.2087,99.0333', durationMinutes: 240, cost: 2500, currency: 'THB', best: 'morning', note: { th: 'เลือกปางที่เน้นการอนุรักษ์ ไม่ขี่ช้าง', en: 'Choose a sanctuary that does not offer riding' } },
      { id: 'doi-inthanon', name: { th: 'ดอยอินทนนท์', en: 'Doi Inthanon' }, category: 'activity', area: 'Chom Thong', coordinates: '18.5887,98.4868', durationMinutes: 300, cost: 800, currency: 'THB', best: 'morning', note: { th: 'ยอดสูงสุดของไทย ไปเช้ามาก อากาศเย็นตลอดปี', en: 'Thailand’s highest peak — cold all year, start early' } }
    ]
  },
  {
    id: 'phuket', country: 'Thailand', countryTh: 'ไทย', city: 'Phuket', cityTh: 'ภูเก็ต',
    currency: 'THB', keywords: ['phuket', 'ภูเก็ต', 'thailand', 'ไทย', 'hkt', 'patong', 'phi phi'],
    tagline: { th: 'ทะเลสีเทอร์ควอยซ์ เกาะรอบ ๆ และเมืองเก่าสีพาสเทล', en: 'Turquoise sea, islands and a pastel old town' },
    places: [
      { id: 'phi-phi', name: { th: 'เกาะพีพี (ทัวร์วันเดียว)', en: 'Phi Phi Islands day trip' }, category: 'activity', area: 'Ao Ton Sai', coordinates: '7.7407,98.7784', durationMinutes: 480, cost: 1800, currency: 'THB', best: 'morning', note: { th: 'ออกเรือเช้าตรู่ เลี่ยงคลื่นและคนเยอะ', en: 'Early departure = calmer sea and fewer people' } },
      { id: 'patong', name: { th: 'หาดป่าตอง', en: 'Patong Beach' }, category: 'sightseeing', area: 'Patong', coordinates: '7.8965,98.2965', durationMinutes: 180, cost: 0, currency: 'THB', best: 'afternoon', note: { th: 'หาดยาว นั่งร่ม 300 บาท ต่อด้วยย่านบางลา', en: 'Long beach, umbrellas ~300 THB, nightlife nearby' } },
      { id: 'old-town', name: { th: 'เมืองเก่าภูเก็ต', en: 'Phuket Old Town' }, category: 'sightseeing', area: 'Old Town', coordinates: '7.8865,98.3870', durationMinutes: 120, cost: 200, currency: 'THB', best: 'afternoon', note: { th: 'ตึกชิโน-โปรตุกีส คาเฟ่ และร้านขนมพื้นเมือง', en: 'Sino-Portuguese shophouses, cafés and local sweets' } },
      { id: 'promthep', name: { th: 'แหลมพรหมเทพ', en: 'Promthep Cape' }, category: 'sightseeing', area: 'Rawai', coordinates: '7.7607,98.3050', durationMinutes: 75, cost: 0, currency: 'THB', best: 'evening', note: { th: 'จุดชมพระอาทิตย์ตกที่ดังที่สุดของภูเก็ต', en: 'Phuket’s most famous sunset point' } },
      { id: 'bang-pae', name: { th: 'ย่านบางเป้า (อาหารทะเล)', en: 'Bang Pae seafood' }, category: 'food', area: 'Bang Pae', coordinates: '7.9333,98.3167', durationMinutes: 120, cost: 900, currency: 'THB', best: 'evening', note: { th: 'ร้านอาหารทะเลริมน้ำ ราคาดีกว่าป่าตอง', en: 'Waterfront seafood, better value than Patong' } },
      { id: 'big-buddha', name: { th: 'พระใหญ่ภูเก็ต', en: 'Big Buddha' }, category: 'sightseeing', area: 'Chalong', coordinates: '7.8277,98.3128', durationMinutes: 90, cost: 0, currency: 'THB', best: 'morning', note: { th: 'มองเห็นวิวอ่าวฉลองและตัวเมืองทั้งมุม', en: 'Panorama over Chalong Bay and the island' } }
    ]
  },
  {
    id: 'seoul', country: 'South Korea', countryTh: 'เกาหลีใต้', city: 'Seoul', cityTh: 'โซล',
    currency: 'KRW', keywords: ['seoul', 'โซล', 'korea', 'เกาหลี', 'icn', 'hongdae', 'myeongdong'],
    tagline: { th: 'พระราชวัง ของกิน และวัฒนธรรมคาเฟ่', en: 'Palaces, street food and café culture' },
    places: [
      { id: 'gyeongbokgung', name: { th: 'พระราชวังคย็องบก', en: 'Gyeongbokgung Palace' }, category: 'sightseeing', area: 'Jongno', coordinates: '37.5796,126.9770', durationMinutes: 120, cost: 3000, currency: 'KRW', best: 'morning', note: { th: 'เช่าฮันบกใส่เข้าฟรี + ดูพิธีเปลี่ยนเวรยาม 10:00', en: 'Free entry in hanbok; guard ceremony at 10 am' } },
      { id: 'bukchon', name: { th: 'หมู่บ้านบุกชอน', en: 'Bukchon Hanok Village' }, category: 'sightseeing', area: 'Jongno', coordinates: '37.5826,126.9830', durationMinutes: 90, cost: 0, currency: 'KRW', best: 'morning', note: { th: 'บ้านฮันอกบนเนิน — เงียบ เพราะเป็นย่านที่คนอยู่จริง', en: 'Hanok lanes on a hill — residents live here, keep quiet' } },
      { id: 'myeongdong', name: { th: 'เมียงดง', en: 'Myeongdong' }, category: 'shopping', area: 'Myeongdong', coordinates: '37.5636,126.9827', durationMinutes: 120, cost: 40000, currency: 'KRW', best: 'evening', note: { th: 'สตรีทฟู้ดและเครื่องสำอาง — ต่อด้วยนัมซานทาวเวอร์', en: 'Street food & cosmetics; Namsan Tower is close' } },
      { id: 'gwangjang', name: { th: 'ตลาดกวางจัง', en: 'Gwangjang Market' }, category: 'food', area: 'Jongno', coordinates: '37.5700,126.9997', durationMinutes: 90, cost: 20000, currency: 'KRW', best: 'evening', note: { th: 'บินแดต็อก มายักกุกซู และคิมบับในตลาดเก่า', en: 'Bindaetteok, mayak gimbap and noodles' } },
      { id: 'hongdae', name: { th: 'ฮงแด', en: 'Hongdae' }, category: 'activity', area: 'Mapo', coordinates: '37.5563,126.9236', durationMinutes: 150, cost: 30000, currency: 'KRW', best: 'evening', note: { th: 'ดนตรีสดข้างถนน เกม และบาร์นักศึกษา', en: 'Busking, games and student bars' } },
      { id: 'han-river', name: { th: 'สวนฮันกัง (ปิกนิก)', en: 'Hangang Park picnic' }, category: 'activity', area: 'Yeouido', coordinates: '37.5284,126.9342', durationMinutes: 120, cost: 15000, currency: 'KRW', best: 'evening', note: { th: 'สั่งไก่ทอด+เบียร์ไปนั่งริมนํ้าแบบคนโซล', en: 'Fried chicken + beer by the river, local style' } }
    ]
  },
  {
    id: 'taipei', country: 'Taiwan', countryTh: 'ไต้หวัน', city: 'Taipei', cityTh: 'ไทเป',
    currency: 'TWD', keywords: ['taipei', 'ไทเป', 'taiwan', 'ไต้หวัน', 'tpe', 'jiufen', 'ximending'],
    tagline: { th: 'ตลาดกลางคืน ออนเซ็น และเมืองเก่าบนภูเขา', en: 'Night markets, hot springs and hillside old towns' },
    places: [
      { id: 'taipei-101', name: { th: 'ไทเป 101', en: 'Taipei 101' }, category: 'sightseeing', area: 'Xinyi', coordinates: '25.0339,121.5645', durationMinutes: 90, cost: 600, currency: 'TWD', best: 'evening', note: { th: 'ขึ้นดาดฟ้าช่วงพระอาทิตย์ตก แล้วต่อตลาดซินหยี่', en: 'Sunset from the deck, then Xinyi night market' } },
      { id: 'jiufen', name: { th: 'จิ่วเฟิ่น', en: 'Jiufen Old Street' }, category: 'sightseeing', area: 'Jiufen', coordinates: '25.1096,121.8448', durationMinutes: 180, cost: 300, currency: 'TWD', best: 'evening', note: { th: 'ตรอกโคมแดงบนเขา (แรงบันดาลใจ Spirited Away) — ไปสาย ไฟสวย', en: 'Lantern-lit hillside alleys — go late for the lights' } },
      { id: 'shilin', name: { th: 'ตลาดกลางคืนซื่อหลิน', en: 'Shilin Night Market' }, category: 'food', area: 'Shilin', coordinates: '25.0880,121.5245', durationMinutes: 120, cost: 400, currency: 'TWD', best: 'evening', note: { th: 'ไก่ทอดยักษ์ เต้าหู้เหม็น และบับเบิลที', en: 'Giant fried chicken, stinky tofu, bubble tea' } },
      { id: 'beitou', name: { th: 'บ่อน้ำร้อนเป่ยโถว', en: 'Beitou Hot Springs' }, category: 'activity', area: 'Beitou', coordinates: '25.1370,121.5080', durationMinutes: 120, cost: 250, currency: 'TWD', best: 'afternoon', note: { th: 'นั่ง MRT มาออนเซ็นได้ — มีทั้งสาธารณะและส่วนตัว', en: 'Reachable by MRT; public or private pools' } },
      { id: 'ximending', name: { th: 'ซีเหมินติง', en: 'Ximending' }, category: 'shopping', area: 'Wanhua', coordinates: '25.0421,121.5070', durationMinutes: 120, cost: 800, currency: 'TWD', best: 'evening', note: { th: 'ย่านวัยรุ่น ของเล่น เสื้อผ้า และคาเฟ่แมว', en: 'Youth district — fashion, toys and cat cafés' } },
      { id: 'maokong', name: { th: 'เมาคง (กระเช้าชา)', en: 'Maokong Gondola & tea' }, category: 'activity', area: 'Wenshan', coordinates: '24.9682,121.5888', durationMinutes: 180, cost: 300, currency: 'TWD', best: 'afternoon', note: { th: 'กระเช้าใสขึ้นเขาไปนั่งจิบชาไทเป้ย ชมวิวเมือง', en: 'Glass gondola up for tea with a city view' } }
    ]
  },
  {
    id: 'danang', country: 'Vietnam', countryTh: 'เวียดนาม', city: 'Da Nang', cityTh: 'ดานัง',
    currency: 'VND', keywords: ['da nang', 'danang', 'ดานัง', 'hoi an', 'ฮอยอัน', 'vietnam', 'เวียดนาม', 'dad'],
    tagline: { th: 'หาดยาว สะพานมังกร และเมืองเก่าฮอยอัน', en: 'Long beach, Dragon Bridge and Hoi An old town' },
    places: [
      { id: 'my-khe', name: { th: 'หาดหมี่เค', en: 'My Khe Beach' }, category: 'sightseeing', area: 'My Khe', coordinates: '16.0544,108.2475', durationMinutes: 150, cost: 0, currency: 'VND', best: 'morning', note: { th: 'หาดทรายยาว ว่ายน้ำได้ ไปเช้าคนน้อย', en: 'Long swimmable beach — quiet in the morning' } },
      { id: 'ba-na', name: { th: 'บานาฮิลส์ (สะพานทอง)', en: 'Ba Na Hills & Golden Bridge' }, category: 'activity', area: 'Hoa Vang', coordinates: '15.9950,107.9880', durationMinutes: 300, cost: 900000, currency: 'VND', best: 'morning', note: { th: 'ขึ้นกระเช้าไปสะพานมือทอง — จองตั๋วออนไลน์ถูกกว่า', en: 'Cable car to the Golden Bridge — book online' } },
      { id: 'dragon-bridge', name: { th: 'สะพานมังกร', en: 'Dragon Bridge' }, category: 'sightseeing', area: 'Da Nang', coordinates: '16.0616,108.2270', durationMinutes: 45, cost: 0, currency: 'VND', best: 'evening', note: { th: 'เสาร์–อาทิตย์ 21:00 มีพ่นไฟและพ่นน้ำ', en: 'Sat–Sun 9 pm: fire & water show' } },
      { id: 'hoi-an', name: { th: 'เมืองเก่าฮอยอัน', en: 'Hoi An Ancient Town' }, category: 'sightseeing', area: 'Hoi An', coordinates: '15.8801,108.3380', durationMinutes: 240, cost: 120000, currency: 'VND', best: 'evening', note: { th: 'โคมไฟริมแม่น้ำ thu บอน — เช่าจักรยานปั่นไป', en: 'Lanterns on the river; cycle there from Da Nang' } },
      { id: 'banh-mi', name: { th: 'บั๊ญหมี่ (Banh Mi Phuong)', en: 'Banh Mi Phuong' }, category: 'food', area: 'Hoi An', coordinates: '15.8771,108.3270', durationMinutes: 45, cost: 60000, currency: 'VND', best: 'morning', note: { th: 'บั๊ญหมี่ชื่อดังระดับโลก คิวยาวแต่เร็ว', en: 'World-famous banh mi — fast-moving queue' } },
      { id: 'son-tra', name: { th: 'คาบสมุทรเซินจ่า', en: 'Son Tra Peninsula' }, category: 'activity', area: 'Son Tra', coordinates: '16.1200,108.2900', durationMinutes: 180, cost: 200000, currency: 'VND', best: 'morning', note: { th: 'เช่ามอเตอร์ไซค์ขึ้นเขาไปเจอพระนางพญาและลิง', en: 'Ride up for the Lady Buddha and monkeys' } }
    ]
  },
  {
    id: 'singapore', country: 'Singapore', countryTh: 'สิงคโปร์', city: 'Singapore', cityTh: 'สิงคโปร์',
    currency: 'SGD', keywords: ['singapore', 'สิงคโปร์', 'sin', 'changi', 'sentosa'],
    tagline: { th: 'เมืองสวน การ์เดนส์บายเดอะเบย์ และฮอว์กเกอร์', en: 'Garden city, Gardens by the Bay and hawker food' },
    places: [
      { id: 'gardens', name: { th: 'การ์เดนส์ บาย เดอะ เบย์', en: 'Gardens by the Bay' }, category: 'sightseeing', area: 'Marina Bay', coordinates: '1.2816,103.8636', durationMinutes: 150, cost: 32, currency: 'SGD', best: 'evening', note: { th: 'แสดงแสงสี Garden Rhapsody 19:45 และ 20:45', en: 'Garden Rhapsody light show at 7:45 & 8:45 pm' } },
      { id: 'mbs', name: { th: 'มาринаเบย์แซนด์ส สกายพาร์ค', en: 'Marina Bay Sands SkyPark' }, category: 'sightseeing', area: 'Marina Bay', coordinates: '1.2834,103.8607', durationMinutes: 75, cost: 32, currency: 'SGD', best: 'evening', note: { th: 'ดาดฟ้าชมวิวอ่าว จองเวลาไว้ล่วงหน้า', en: 'Bay views from the deck — book a time slot' } },
      { id: 'hawker', name: { th: 'ฮอว์กเกอร์ เซ็นเตอร์ (เลาเปา Sat)', en: 'Lau Pa Sat hawker' }, category: 'food', area: 'CBD', coordinates: '1.2807,103.8504', durationMinutes: 75, cost: 12, currency: 'SGD', best: 'evening', note: { th: 'สะเต๊ะหลัง 19:00 ปิดถนนเป็นตลาดไม้เสียบ', en: 'Satay street opens after 7 pm' } },
      { id: 'sentosa', name: { th: 'เซนโตซ่า', en: 'Sentosa Island' }, category: 'activity', area: 'Sentosa', coordinates: '1.2494,103.8303', durationMinutes: 300, cost: 60, currency: 'SGD', best: 'morning', note: { th: 'หาด ยูนิเวอร์แซล และสวนสนุกทางน้ำ', en: 'Beaches, Universal Studios and water parks' } },
      { id: 'chinatown', name: { th: 'ไชน่าทาวน์ + วัดพระเขี้ยวแก้ว', en: 'Chinatown & Buddha Tooth Relic Temple' }, category: 'sightseeing', area: 'Chinatown', coordinates: '1.2816,103.8442', durationMinutes: 120, cost: 0, currency: 'SGD', best: 'afternoon', note: { th: 'วัดฟรี ต่อด้วยฮอว์กเกอร์แม็กซ์เวลล์', en: 'Free temple entry, then Maxwell hawker centre' } },
      { id: 'botanic', name: { th: 'สวนพฤกษศาสตร์', en: 'Singapore Botanic Gardens' }, category: 'activity', area: 'Tanglin', coordinates: '1.3138,103.8159', durationMinutes: 150, cost: 0, currency: 'SGD', best: 'morning', note: { th: 'มรดกโลก UNESCO เดินเช้าเลี่ยงร้อน', en: 'UNESCO site — walk early to avoid the heat' } }
    ]
  },
  {
    id: 'paris', country: 'France', countryTh: 'ฝรั่งเศส', city: 'Paris', cityTh: 'ปารีส',
    currency: 'EUR', keywords: ['paris', 'ปารีส', 'france', 'ฝรั่งเศส', 'cdg', 'louvre', 'montmartre'],
    tagline: { th: 'พิพิธภัณฑ์ คาเฟ่ และถนนริมแม่น้ำแซน', en: 'Museums, cafés and the Seine' },
    places: [
      { id: 'louvre', name: { th: 'พิพิธภัณฑ์ลูฟวร์', en: 'Louvre Museum' }, category: 'sightseeing', area: '1er', coordinates: '48.8606,2.3376', durationMinutes: 180, cost: 22, currency: 'EUR', best: 'morning', note: { th: 'จองคิวออนไลน์ เข้าทาง Porte des Lions คนน้อยสุด', en: 'Book a timed ticket; Porte des Lions is the quietest door' } },
      { id: 'eiffel', name: { th: 'หอไอเฟล', en: 'Eiffel Tower' }, category: 'sightseeing', area: '7e', coordinates: '48.8584,2.2945', durationMinutes: 150, cost: 29, currency: 'EUR', best: 'evening', note: { th: 'ขึ้นชั้น 2 ช่วงเย็น แล้วรอไฟกะพริบทุกชั่วโมง', en: 'Go up at dusk and wait for the hourly sparkle' } },
      { id: 'montmartre', name: { th: 'มงต์มาร์ต + ซาเครเกอร์', en: 'Montmartre & Sacré-Cœur' }, category: 'sightseeing', area: '18e', coordinates: '48.8867,2.3431', durationMinutes: 150, cost: 0, currency: 'EUR', best: 'afternoon', note: { th: 'เนินโบฮีเมียน ขึ้นกระเช้าได้ วิวปารีสทั้งเมือง', en: 'Bohemian hill — take the funicular for the view' } },
      { id: 'marais', name: { th: 'ย่านมาเรส์', en: 'Le Marais' }, category: 'food', area: '3e', coordinates: '48.8590,2.3620', durationMinutes: 120, cost: 25, currency: 'EUR', best: 'afternoon', note: { th: 'ฟาลาเฟล ครัวซองต์ และร้านวินเทจ', en: 'Falafel, croissants and vintage shops' } },
      { id: 'seine', name: { th: 'ล่องเรือแม่น้ำแซน', en: 'Seine river cruise' }, category: 'activity', area: '1er', coordinates: '48.8600,2.3266', durationMinutes: 75, cost: 16, currency: 'EUR', best: 'evening', note: { th: 'ล่อง 1 ชม. ผ่านน็อทร์ดามและหอไอเฟลยามค่ำ', en: 'One hour past Notre-Dame and the Eiffel Tower' } },
      { id: 'versailles', name: { th: 'พระราชวังแวร์ซาย', en: 'Palace of Versailles' }, category: 'sightseeing', area: 'Versailles', coordinates: '48.8049,2.1204', durationMinutes: 300, cost: 21, currency: 'EUR', best: 'morning', note: { th: 'นั่ง RER C 40 นาที — เผื่อครึ่งวันเต็ม', en: 'RER C takes 40 min — allow half a day' } }
    ]
  },
  {
    id: 'newyork', country: 'United States', countryTh: 'สหรัฐฯ', city: 'New York', cityTh: 'นิวยอร์ก',
    currency: 'USD', keywords: ['new york', 'นิวยอร์ก', 'usa', 'us', 'jfk', 'manhattan', 'nyc'],
    tagline: { th: 'สกายไลน์ เซ็นทรัลพาร์ค และพิพิธภัณฑ์ระดับโลก', en: 'Skyline, Central Park and world-class museums' },
    places: [
      { id: 'central-park', name: { th: 'เซ็นทรัลพาร์ค', en: 'Central Park' }, category: 'activity', area: 'Manhattan', coordinates: '40.7829,-73.9654', durationMinutes: 150, cost: 0, currency: 'USD', best: 'morning', note: { th: 'เช่าจักรยานหรือเดิน Bethesda Terrace ไป Bow Bridge', en: 'Rent a bike or walk Bethesda Terrace to Bow Bridge' } },
      { id: 'met', name: { th: 'พิพิธภัณฑ์เม็ท', en: 'The Met' }, category: 'sightseeing', area: 'Upper East Side', coordinates: '40.7794,-73.9632', durationMinutes: 180, cost: 30, currency: 'USD', best: 'morning', note: { th: 'จ่ายตามใจ (สำหรับชาว NY) — เผื่อครึ่งวัน', en: 'Suggested admission — allow half a day' } },
      { id: 'highline', name: { th: 'ไฮไลน์ + เชลซีมาร์เก็ต', en: 'High Line & Chelsea Market' }, category: 'sightseeing', area: 'Chelsea', coordinates: '40.7480,-74.0048', durationMinutes: 120, cost: 0, currency: 'USD', best: 'afternoon', note: { th: 'เดินสวนบนรางรถไฟเก่า จบด้วยของกินในตลาด', en: 'Walk the elevated rail park, end at the market' } },
      { id: 'brooklyn-bridge', name: { th: 'สะพานบรู๊คลิน', en: 'Brooklyn Bridge' }, category: 'sightseeing', area: 'DUMBO', coordinates: '40.7061,-73.9969', durationMinutes: 90, cost: 0, currency: 'USD', best: 'morning', note: { th: 'เดินข้ามไปดูวิวแมนฮัตตัน ไปเช้าคนน้อย', en: 'Walk to Brooklyn for the skyline — go early' } },
      { id: 'times-square', name: { th: 'ไทม์สแควร์ + บรอดเวย์', en: 'Times Square & Broadway' }, category: 'activity', area: 'Midtown', coordinates: '40.7580,-73.9855', durationMinutes: 120, cost: 120, currency: 'USD', best: 'evening', note: { th: 'ดูโชว์บรอดเวย์ — ซื้อตั๋วผ่าน TKTS ลดราคา', en: 'See a show — TKTS sells same-day discounts' } },
      { id: 'katz', name: { th: 'แซนด์วิชพาสทรามี่ Katz’s', en: 'Katz’s Delicatessen' }, category: 'food', area: 'Lower East Side', coordinates: '40.7223,-73.9874', durationMinutes: 60, cost: 35, currency: 'USD', best: 'afternoon', note: { th: 'พาสทรามี่ร่วนยักษ์ ตำนานตั้งแต่ 1888', en: 'Legendary pastrami since 1888' } }
    ]
  }
];

/* ------------------------------------------------------------------ *
 * Lookups & matching
 * ------------------------------------------------------------------ */

export function destinationById(id = '') {
  return DESTINATIONS.find(d => d.id === id) || null;
}

function haystack(trip = {}) {
  return [trip?.city, trip?.country, trip?.name, trip?.description]
    .filter(Boolean).join(' ').toLowerCase();
}

/**
 * Rank the curated guides for a trip. The city match wins, then the country,
 * then any keyword found in the title/description.
 * @returns {Array<{destination:object, score:number, reason:string}>}
 */
export function matchDestinations(trip = {}, limit = 3) {
  const text = haystack(trip);
  if (!text.trim()) return [];
  const scored = [];
  for (const dest of DESTINATIONS) {
    let score = 0;
    let reason = '';
    const city = String(trip?.city || '').toLowerCase().trim();
    const country = String(trip?.country || '').toLowerCase().trim();
    const cityNames = [dest.city, dest.cityTh, ...(dest.keywords || [])].map(s => String(s).toLowerCase());
    if (city && cityNames.some(n => n === city)) { score += 60; reason = 'city'; }
    else if (city && cityNames.some(n => city.includes(n) || n.includes(city))) { score += 42; reason = 'city'; }
    const countryNames = [dest.country, dest.countryTh].map(s => String(s).toLowerCase());
    if (country && countryNames.some(n => n === country)) { score += 30; if (!reason) reason = 'country'; }
    for (const kw of dest.keywords || []) {
      const k = String(kw).toLowerCase();
      if (k.length >= 4 && text.includes(k)) { score += k.length >= 6 ? 12 : 6; if (!reason) reason = 'keyword'; }
    }
    if (score > 0) scored.push({ destination: dest, score, reason });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** All places of a destination (optionally filtered by category). */
export function destinationPlaces(destinationId, { category = 'all' } = {}) {
  const dest = typeof destinationId === 'string' ? destinationById(destinationId) : destinationId;
  if (!dest) return [];
  return dest.places.filter(p => category === 'all' || p.category === category);
}

/** Search the whole library (names, area, notes, destination names). */
export function searchPlaces(query = '', { destinationId = null, limit = 30 } = {}) {
  const q = String(query || '').trim().toLowerCase();
  const pool = destinationId
    ? destinationPlaces(destinationId).map(p => ({ place: p, destination: destinationById(destinationId) }))
    : DESTINATIONS.flatMap(d => d.places.map(p => ({ place: p, destination: d })));
  if (!q) return pool.slice(0, limit);
  const tokens = q.split(/\s+/).filter(Boolean);
  return pool.filter(({ place, destination }) => {
    const text = [
      place.name?.th, place.name?.en, place.area, place.category,
      place.note?.th, place.note?.en,
      destination.city, destination.cityTh, destination.country, destination.countryTh
    ].filter(Boolean).join(' ').toLowerCase();
    return tokens.every(t => text.includes(t));
  }).slice(0, limit);
}

/** Category chips with a live count for the current pool. */
export function exploreCategoryCounts(places = []) {
  return EXPLORE_CATEGORIES.map(cat => ({
    ...cat,
    count: cat.id === 'all' ? places.length : places.filter(p => p.category === cat.id).length
  }));
}

/* ------------------------------------------------------------------ *
 * Recommendations
 * ------------------------------------------------------------------ */

/** Great-circle distance in km (accepts “lat,lng” strings or {lat,lng}). */
export function distanceKm(a, b) {
  const pa = parseCoord(a);
  const pb = parseCoord(b);
  if (!pa || !pb) return null;
  const R = 6371;
  const dLat = (pb.lat - pa.lat) * Math.PI / 180;
  const dLon = (pb.lng - pa.lng) * Math.PI / 180;
  const lat1 = pa.lat * Math.PI / 180;
  const lat2 = pb.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function parseCoord(value) {
  if (!value) return null;
  if (typeof value === 'object' && Number.isFinite(Number(value.lat))) {
    return { lat: Number(value.lat), lng: Number(value.lng) };
  }
  const m = String(value).match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function namesOf(list = []) {
  return new Set(list.map(x => String(x?.title || x?.name?.th || x?.name?.en || x || '').trim().toLowerCase()).filter(Boolean));
}

/**
 * “แนะนำสำหรับทริปนี้” — score the pool against what the trip already has:
 * places near existing stops rise, categories that are still empty rise, places
 * already planned / already on the ideas board are dropped.
 *
 * @param {{places?:Array, destinationId?:string, itinerary?:Array, ideas?:Array, limit?:number}} opts
 * @returns {Array<{place:object, score:number, nearKm:number|null, reasonTh:string, reasonEn:string}>}
 */
export function suggestForTrip({ places = null, destinationId = null, itinerary = [], ideas = [], limit = 6 } = {}) {
  const pool = places || (destinationId ? destinationPlaces(destinationId) : []);
  if (!pool.length) return [];
  const taken = namesOf([...itinerary, ...ideas]);
  const usedCategories = new Set(itinerary.map(i => i?.category).filter(Boolean));
  const stops = itinerary.map(i => i?.coordinates).filter(Boolean);

  const scored = pool
    .filter(place => {
      const th = String(place?.name?.th || '').toLowerCase();
      const en = String(place?.name?.en || '').toLowerCase();
      return !taken.has(th) && !taken.has(en);
    })
    .map(place => {
      let score = 40;
      let nearKm = null;
      for (const stop of stops) {
        const d = distanceKm(place.coordinates, stop);
        if (d == null) continue;
        if (nearKm == null || d < nearKm) nearKm = d;
      }
      if (nearKm != null) score += Math.max(0, 30 - nearKm * 0.6);   // closer = better
      if (!usedCategories.has(place.category)) score += 12;          // fill an empty category
      if (place.best === 'morning') score += 4;                      // mornings are easier to plan
      if (Number(place.cost) > 0) score += 2;
      const nearText = nearKm == null
        ? { th: 'หมวดที่แผนยังไม่มี', en: 'category not planned yet' }
        : { th: `ห่างจากจุดที่วางไว้ ~${Math.round(nearKm)} กม.`, en: `~${Math.round(nearKm)} km from a planned stop` };
      return {
        place,
        score: Math.round(score),
        nearKm: nearKm == null ? null : Math.round(nearKm * 10) / 10,
        reasonTh: nearText.th,
        reasonEn: nearText.en
      };
    })
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/* ------------------------------------------------------------------ *
 * Payload builders (idea board / itinerary)
 * ------------------------------------------------------------------ */

export const BEST_TIME_LABEL = {
  morning: { th: 'เช้า', en: 'Morning', icon: 'sunrise' },
  afternoon: { th: 'บ่าย', en: 'Afternoon', icon: 'sun' },
  evening: { th: 'เย็น–ค่ำ', en: 'Evening', icon: 'moon-star' },
  anytime: { th: 'ได้ทุกเวลา', en: 'Anytime', icon: 'clock' }
};

export function bestTimeLabel(best = 'anytime', lang = 'th') {
  const def = BEST_TIME_LABEL[best] || BEST_TIME_LABEL.anytime;
  return lang === 'th' ? def.th : def.en;
}

export function bestTimeIcon(best = 'anytime') {
  return (BEST_TIME_LABEL[best] || BEST_TIME_LABEL.anytime).icon;
}

/** Suggested start time for the “add to plan” sheet. */
export function suggestedTime(place = {}) {
  if (place.best === 'morning') return '08:30';
  if (place.best === 'afternoon') return '13:30';
  if (place.best === 'evening') return '18:00';
  return '10:00';
}

/**
 * Cost of a place in the trip’s base currency (minor units).
 * `rate` = how much 1 unit of `place.currency` is worth in the base currency.
 */
export function costInBase(place = {}, { baseCurrency = 'THB', rate = null } = {}) {
  const amount = Number(place.cost) || 0;
  if (!amount) return 0;
  const from = String(place.currency || baseCurrency || 'THB').toUpperCase();
  const to = String(baseCurrency || 'THB').toUpperCase();
  if (from === to || !rate || rate <= 0) return toMinor(amount, 2);
  return toMinor(amount * Number(rate), 2);
}

/** Payload for `createIdea()` — the place lands on the voting board. */
export function placeToIdeaPayload(place = {}, { baseCurrency = 'THB', rate = null } = {}) {
  const note = place.note || {};
  const name = place.name || {};
  return {
    title: name.th || name.en || '',
    note: [note.th, place.area ? `📍 ${place.area}` : ''].filter(Boolean).join(' · '),
    category: place.category || 'sightseeing',
    coordinates: place.coordinates || null,
    address: place.area || '',
    estimatedCostMinor: costInBase(place, { baseCurrency, rate }),
    currency: baseCurrency,
    url: ''
  };
}

/** Payload for the shared “add to plan” sheet → `saveItineraryItem()`. */
export function placeToPlanDraft(place = {}, { date = '', startAt = '', category = null, baseCurrency = 'THB', rate = null } = {}) {
  const note = place.note || {};
  const name = place.name || {};
  return {
    title: name.th || name.en || '',
    description: note.th || note.en || '',
    date,
    startAt,
    category: category || place.category || 'sightseeing',
    address: place.area || '',
    coordinates: place.coordinates || '',
    durationMinutes: Number(place.durationMinutes) || 60,
    estimateAmount: Number(place.cost) || 0,
    estimateCurrency: Number(place.cost) > 0 ? (place.currency || baseCurrency) : '',
    estimateMinor: costInBase(place, { baseCurrency, rate }),
    status: 'planned'
  };
}

/** Small helper for the UI: how many places the whole library holds. */
export function libraryStats() {
  return {
    destinations: DESTINATIONS.length,
    places: DESTINATIONS.reduce((n, d) => n + d.places.length, 0)
  };
}
