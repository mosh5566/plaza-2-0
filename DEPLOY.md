# 🚀 PLAZA 2.0 — פריסה לשרת אמיתי

> **המלצה: Render** (חינמי, קליק אחד, אוטומטי).
> **חלופה: Fly.io** (יותר ביצועים, צריך CLI).

---

## ⚡ אופציה 1 — Render (הכי קל, קליק אחד)

### צעד 1: הירשם ל-Render (חינם)
פתח: <https://render.com> → "Sign up with GitHub" → אשר.

### צעד 2: צור Web Service חדש
1. בדשבורד של Render: **New +** → **Blueprint**
2. בחר את הריפו `plaza` (אחרי שתעלה ל-GitHub)
3. Render יזהה את `render.yaml` ויציע **Apply** → לחץ
4. תוך 3-5 דקות תקבל URL כמו `https://plaza.onrender.com`

### צעד 3: התחבר כאדמין
- **URL ראשי:** `https://plaza.onrender.com`
- **אדמין:** `https://plaza.onrender.com/admin`
- **שם משתמש:** `admin`
- **סיסמה:** `Plaza2026!Admin` (שנה מיד!)

### ⚠️ הערות חשובות לתוכנית החינמית
- שרת **נרדם** אחרי 15 דקות חוסר פעילות. בקשה ראשונה אחרי שינה לוקחת ~30 שניות.
- שדרוג ל-**Starter** ($7/חודש) מבטל את זה.

---

## ⚡ אופציה 2 — Fly.io (יותר ביצועים)

### צעד 1: התקן והתחבר
```bash
# התקנה (אם עוד לא):
iwr https://fly.io/install.ps1 -useb | iex   # Windows PowerShell

# כניסה (יפתח דפדפן):
flyctl auth login
```

### צעד 2: פרוס
```bash
cd "פלאזה 2.0"
flyctl launch --no-deploy --name plaza-app --region fra
flyctl volumes create plaza_data --size 1 --region fra
flyctl deploy
```

תקבל URL כמו `https://plaza-app.fly.dev`.

---

## ⚡ אופציה 3 — Railway (גם קלה)

```bash
npm i -g @railway/cli
railway login
railway init
railway up
```

---

## 📦 מה כלול ב-Deploy?

- ✅ **Node.js 20** + Express + Socket.io
- ✅ **SQLite** עם disk persistence (DB שורד restart)
- ✅ **`/uploads/`** עם persistence (תמונות/וידאו)
- ✅ **HTTPS** אוטומטי
- ✅ **JWT_SECRET** נוצר אוטומטית בפריסה ראשונה (Render)
- ✅ **Health check** ב-`/api/health`
- ✅ **Auto-deploy** מ-GitHub (כל push → deploy חדש)

---

## 🪣 שדרוג עתידי: אחסון אמיתי בענן (R2 / S3)

כשתעבור 1GB מדיה — כדאי להעביר את `/uploads/` ל-**Cloudflare R2** ($0.015/GB):

1. צור bucket ב-R2: <https://dash.cloudflare.com/?to=/:account/r2>
2. הוסף ENV vars ב-Render/Fly:
   ```
   R2_ACCOUNT_ID=xxx
   R2_ACCESS_KEY=xxx
   R2_SECRET_KEY=xxx
   R2_BUCKET=plaza-media
   ```
3. בעדכון הבא של `server.js`: החלף `multer.diskStorage` ב-`multer-s3`.

---

## 🐘 שדרוג ל-PostgreSQL (כשגדלים מעל 500 משתמשים בו-זמנית)

- **Supabase** או **Neon** — חינם עד 500MB.
- ENV: `DATABASE_URL=postgres://...`
- בעדכון הבא: החלפת `better-sqlite3` ב-`pg`.

---

## 🆘 פתרון בעיות

**הפריסה נכשלה ב-build?**
→ ודא ש-`package.json` תקין. רץ `npm install` מקומית — אם עובד, גם בענן.

**500 על /api/health?**
→ ודא שה-disk מותקן ב-`/app/db` (Render) או `/app/db` (Fly).

**שכחתי סיסמת אדמין?**
→ SSH לשרת והרץ:
```bash
node -e "const b=require('bcryptjs');const D=require('better-sqlite3')('db/plaza.db');D.prepare('UPDATE users SET password_hash=? WHERE username=?').run(b.hashSync('NewPass!2026',10),'admin');console.log('done')"
```
