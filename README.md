# 🌍 PLAZA 2.0 — פלטפורמה אמיתית

הקבוצה העולמית הגלובלית. אין אלגוריתם · כולם עוקבים אחריך · הכל נעלם תוך 24 שעות.
**קוד פתוח · אפס פרסום · אפס מעקב.**

> 📖 **רוצה להבין מה חסר עד חנויות האפליקציות?**
> קרא את [`WHAT_IS_MISSING.md`](./WHAT_IS_MISSING.md) — הסבר ילדותי-פשוט
> ב-6 שלבים, עם מחירים, זמנים, וצעדים מעשיים.

---

## ⚡ הפעלה מהירה (3 פקודות)

```powershell
cd "C:\Users\mosh5\Desktop\פלאזה 2.0"
npm install
npm start
```

צריך לראות:
```
╔═══════════════════════════════════════╗
║  🌍 PLAZA 2.0 רץ                       ║
║  http://localhost:3000                ║
║  אדמין: http://localhost:3000/admin   ║
║  שם משתמש: admin                       ║
║  סיסמה:    Plaza2026!Admin             ║
╚═══════════════════════════════════════╝
```

ואז בדפדפן:
- **כניסה / הרשמה:** <http://localhost:3000> (מפנה ל-login אוטומטית)
- **לוח ניהול:** <http://localhost:3000/admin>

### 🔄 מה קורה עכשיו (אחרי שלב 1)
החזית מזהה אוטומטית את השרת ועוברת ל-**מצב LIVE** (נתונים אמיתיים מ-SQLite).
אם תפתח את הקובץ ישירות (`file://`) או דרך Netlify — חוזר ל-**מצב דמו**
(localStorage). שני המצבים עובדים עם אותו קוד.

### 🔐 פרטי אדמין ברירת מחדל
| | |
|---|---|
| **שם משתמש** | `admin` |
| **סיסמה** | `Plaza2026!Admin` |

⚠️ **שנה את הסיסמה אחרי כניסה ראשונה!** עורך את `server/init-db.js` או הרץ
שאילתת UPDATE על טבלת `users` (`is_admin=1` + hash חדש עם bcrypt).

---

## 📂 מבנה הפרויקט

```
פלאזה 2.0/
├── public/                  # Frontend (HTML/CSS/JS — שום build)
│   ├── index.html           # האפליקציה הראשית (הדמו המלא)
│   ├── login.html           # כניסה/הרשמה
│   └── admin.html           # לוח ניהול
├── server/
│   ├── server.js            # Express + Socket.io + REST API
│   └── init-db.js           # אתחול DB + יצירת אדמין + 55 חדרים
├── db/
│   ├── schema.sql           # סכמת SQLite
│   └── plaza.db             # נוצר אוטומטית בריצה ראשונה
├── uploads/                 # מדיה שמשתמשים מעלים
├── package.json
└── README.md
```

---

## 🛠️ מה כבר עובד (קוד מלא)

### Backend (Node.js + Express)
- **אימות JWT** — register/login + bcrypt password hashing
- **REST API מלא** — `/api/posts`, `/api/comments`, `/api/likes`, `/api/bookmarks`,
  `/api/rooms`, `/api/rooms/:topic/messages`, `/api/private`, `/api/topic-requests`,
  `/api/reports`, `/api/upload`, `/api/me`
- **Socket.io לזמן אמת** — חדרי צ'אט, הודעות פרטיות, התראות
- **SQLite** — `better-sqlite3` (קובץ אחד, מהיר, ללא תלות חיצונית)
- **העלאת קבצים** — `multer` עד 100MB (תמונות/וידאו/אודיו)
- **ניקוי אוטומטי** — כל 5 דקות מוחק פוסטים שפג תוקפם (24/48ש'),
  הודעות חדרים (48ש'), צ'אטים פרטיים (24ש')
- **חבילת חיים (auto_extend)** — פוסטים מסומנים כך מוארכים אוטומטית
- **תזמון פוסט (scheduled_at)** — פוסט עתידי שיתפרסם בזמן שנקבע
- **בקשות נושאים** — משתמשים מצביעים; ב-100 הצבעות נשלח לאדמין

### Admin Panel (`/admin`)
- סטטיסטיקות חיות (משתמשים/אונליין/פוסטים/חדרים/דיווחים)
- ניהול משתמשים — אמת/חסום/מחק/הפוך לאדמין
- ניהול פוסטים — הסתרה
- בקשות נושאים — אישור → יצירת חדר חדש
- דיווחים — צפייה וטיפול

### Frontend (`/`)
- כל הפיצ'רים מהדמו: פיד פייסבוקי, וידאו טיקטוקי במסך מלא, חדרי קטגוריה,
  הודעות פרטיות עם אישור, בקשת הודעה, תרגום בזמן אמת, תמלול,
  גלריה אמיתית, הקלטות, QR, מיקום OSM, RTL/LTR אוטומטי, ועוד.

---

## 🚨 מה חסר כדי להפוך אותה למוצר ייצור (production)

### ✅ קריטי (לפני העלאה ראשונה)
1. **🔐 מסך הרשמה הסופי** — קיים סקיצה ב-`login.html`, צריך לחבר אותו עם
   ה-Frontend הראשי (לעדכן את `index.html` לעבוד מול ה-API במקום localStorage בלבד)
2. **אימות אימייל/SMS** — שלח OTP לפני הפעלת חשבון
   (`twilio` ל-SMS, `nodemailer` ל-email)
3. **HTTPS + תעודה** — נסה Caddy / nginx + Let's Encrypt
4. **שינוי סיסמת אדמין** ברירת מחדל
5. **JWT_SECRET** ב-`.env` (לא במקור)
6. **Rate limiting** — `express-rate-limit` נגד spam והתקפות brute-force
7. **CSRF + Helmet** — `helmet` להגנת headers בסיסית
8. **Input validation** — `zod`/`joi` לכל endpoint
9. **Sanitization** — XSS נגד תוכן משתמשים (`DOMPurify` ב-frontend, escape ב-backend)

### 🌍 חיוני לסקייל
10. **PostgreSQL במקום SQLite** — לתמיכה ב-1000+ משתמשים בו-זמנית
11. **Redis** — סשנים, rate-limit, presence (online users)
12. **S3 / Cloudflare R2** — אחסון מדיה במקום `/uploads` מקומי
13. **CDN** — Cloudflare למדיה ולסטטי
14. **WebSocket scaling** — `socket.io-redis-adapter` לריבוי שרתים
15. **בק-אפים** — DB + uploads (יומי לפחות)

### 🎨 חוויית משתמש
16. **PWA** — `manifest.json` + Service Worker → אפשרות התקנה כאפליקציה
17. **Push notifications** — Web Push (VAPID) + FCM ל-iOS/Android
18. **App builds** — Expo/Capacitor → APK/IPA אמיתיים
19. **Onboarding** — 3-4 מסכים בכניסה ראשונה
20. **Skeleton loaders** — במקום מסך לבן בטעינה
21. **i18n מלא** — כיום חלקי (7 שפות לכותרת); להוסיף `i18next` או דומה
   עם תרגומי-Crowdsource מהקהילה

### 🔌 שירותים חיצוניים
22. **תרגום אמיתי** — DeepL API / Google Translate API (כיום MyMemory חינמי, מוגבל)
23. **תמלול קולי** — OpenAI Whisper / Google Speech-to-Text
24. **TTS לתגובות קוליות** — Google TTS / ElevenLabs (לתרגום קולי)
25. **גוגל מפות / Mapbox** — במקום iframe OSM (כיום עובד אבל מוגבל)
26. **YouTube Music API / Pixabay Music** — לספריית סאונדים אמיתית
27. **Stripe / PayPal** — אם תוסיף תכונות בתשלום
28. **Sentry** — error tracking
29. **Plausible / Umami** — אנליטיקס פרטי (לא Google Analytics)

### ⚖️ חוקי / משפטי
30. **תנאי שימוש + מדיניות פרטיות** (חובה GDPR/CCPA)
31. **ניהול הסכמות עוגיות** (cookie banner) — אם משתמשים ב-EU
32. **דף "מחק את החשבון שלי" + ייצוא נתונים** (GDPR Article 15+17)
33. **DMCA / Report content** — קיים בסיסי, צריך לוגיקה מסודרת + תיעוד
34. **ניהול גיל מינימום** (COPPA — 13+)

### 🧪 איכות
35. **בדיקות** — `vitest`/`jest` ליחידה + Playwright ל-E2E
36. **CI/CD** — GitHub Actions: lint + test + deploy
37. **Docker / docker-compose** — סביבת dev אחידה
38. **Monitoring** — uptime + db slow queries (UptimeRobot חינמי לכל הפחות)

### 💼 פיצ'רים שהוצעו ולא ממומשים מלא ב-backend
39. **תרגום אוטומטי של כל הפוסט** מבוצע ב-frontend בלבד; לעבור לעיבוד שרת
40. **דירוג מוכר/עסק** — קיים UI בלבד, לבנות טבלת `ratings`
41. **QR לפרופיל** — עובד דרך api.qrserver.com (חינמי), לצורך production
   מומלץ להחליף ב-`qrcode` npm package שעובד מקומית

---

## 🌐 פריסה (Deployment)

### אופציה 1 — VPS פשוט (DigitalOcean / Hetzner / Linode)
```bash
# על השרת:
git clone <your-repo> plaza
cd plaza && npm install --production
pm2 start server/server.js --name plaza
# Caddy / nginx reverse proxy → port 3000
```

### אופציה 2 — שירות מנוהל
- **Railway / Render / Fly.io** — push-to-deploy. SQLite נשמר על דיסק עם persistent volume.
- בייצור גמור: **AWS / GCP** — RDS PostgreSQL + ECS + S3 + CloudFront.

---

## 📜 רישיון
פתח לכל מטרה — קרדיט יתקבל בברכה. תרומות לקהילה ב-PRs.

---

## ✨ מה הופך את פלאזה לייחודית
- **אין אלגוריתם** — סינון שקוף לפי שפה/מדינה/קטגוריה
- **הכל נעלם** — תוכן ב-24-48 שעות, צ'אטים פרטיים ב-24ש', התראות ב-30 דק'
- **שוויון מלא** — אין עוקבים, אין סלבריטאים, רק אנשים
- **חדרים גלובליים לפי קטגוריה** — נישה אמיתית, לא רעש
- **תרגום בזמן אמת** — כל הודעה/הקלטה לכל שפה, חוצה גבולות
- **פרטיות אמיתית** — אפס מעקב, אפס פרסום, קוד פתוח

🌍 ברוכים הבאים לפלאזה.
