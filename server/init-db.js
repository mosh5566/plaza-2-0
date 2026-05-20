// PLAZA 2.0 — אתחול בסיס הנתונים + יצירת אדמין ראשוני
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'db', 'plaza.db');
const SCHEMA = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf-8');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(SCHEMA);

// אדמין ראשוני
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'Plaza2026!Admin';
const existing = db.prepare('SELECT id FROM users WHERE username=?').get(ADMIN_USER);
if (!existing) {
  const hash = bcrypt.hashSync(ADMIN_PASS, 10);
  db.prepare(`INSERT INTO users(username,password_hash,display_name,is_admin,is_verified,lang,country)
              VALUES(?,?,?,1,1,'he','IL')`)
    .run(ADMIN_USER, hash, 'מנהל הפלטפורמה');
  console.log('✅ אדמין נוצר:');
  console.log('   שם משתמש: ' + ADMIN_USER);
  console.log('   סיסמה:    ' + ADMIN_PASS);
  console.log('   ⚠️  שנה את הסיסמה אחרי כניסה ראשונה!');
} else {
  console.log('ℹ️  אדמין כבר קיים: ' + ADMIN_USER);
}

// 55 חדרי קטגוריות ברירת מחדל
const TOPICS = [
  ['tech','טכנולוגיה','💻'],['cars','רכב','🚗'],['real_estate','נדל"ן','🏢'],['art','אמנות','🎨'],['music','מוזיקה','🎵'],
  ['film','סרטים','🎬'],['books','ספרים','📚'],['fitness','כושר','💪'],['food','אוכל','🍕'],['travel','טיולים','✈️'],
  ['photography','צילום','📸'],['gaming','גיימינג','🎮'],['sports','ספורט','⚽'],['wellness','בריאות','🧘'],['business','עסקים','💼'],
  ['finance','פיננסים','💰'],['science','מדע','🔬'],['environment','סביבה','🌍'],['politics','פוליטיקה','🏛️'],['news','חדשות','📰'],
  ['education','חינוך','🎓'],['parenting','הורות','👶'],['relationships','יחסים','💑'],['home','בית וגינה','🏠'],['fashion','אופנה','👗'],
  ['beauty','יופי','💄'],['pets','חיות מחמד','🐶'],['spirituality','רוחניות','🙏'],['humor','הומור','😂'],['entertainment','בידור','🎭'],
  ['community','קהילה','🤝'],['jobs','דרושים','💼'],['ai','בינה מלאכותית','🤖'],['crypto','קריפטו','💎'],['startups','סטארטאפים','🚀'],
  ['diy','עשה זאת בעצמך','🔨'],['cooking','בישול','👨‍🍳'],['mental_health','בריאות נפשית','🧠'],['history','היסטוריה','📜'],['marketing','שיווק','📣'],
  ['design','עיצוב','✏️'],['languages','שפות','🗣️'],['volunteering','התנדבות','🤲'],['law','משפט','⚖️'],['psychology','פסיכולוגיה','🧠'],
  ['military','ביטחון','🎖️'],['agriculture','חקלאות','🌾'],['medicine','רפואה','⚕️'],['astronomy','אסטרונומיה','🔭'],['philosophy','פילוסופיה','💭'],
  ['dance','ריקוד','💃'],['theater','תיאטרון','🎭'],['podcast','פודקאסטים','🎧'],['investing','השקעות','📈'],['architecture','אדריכלות','🏛️']
];
const insRoom = db.prepare('INSERT OR IGNORE INTO rooms(topic,name,icon,approved) VALUES(?,?,?,1)');
TOPICS.forEach(t => insRoom.run(t[0], t[1], t[2]));
console.log(`✅ נטענו ${TOPICS.length} חדרי קטגוריות`);

console.log('\n🎉 בסיס הנתונים מוכן ב-' + DB_PATH);
db.close();
if (require.main === module) process.exit(0);
