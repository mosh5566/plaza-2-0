// ╔════════════════════════════════════════════════╗
// ║  PLAZA 2.0 — שרת אמיתי                          ║
// ║  Express + SQLite + JWT + Socket.io + Multer    ║
// ╚════════════════════════════════════════════════╝
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cors = require('cors');
const { Server } = require('socket.io');

const ROOT = path.join(__dirname, '..');
// טעינת .env מקומי אם קיים (ב-Render משתני הסביבה אמיתיים — אין קובץ, וזה בסדר)
try{const _ep=path.join(ROOT,'.env');if(fs.existsSync(_ep)){fs.readFileSync(_ep,'utf8').split(/\r?\n/).forEach(l=>{const m=l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);if(m&&process.env[m[1]]===undefined){let v=m[2].trim();if((v[0]==='"'&&v.slice(-1)==='"')||(v[0]==="'"&&v.slice(-1)==="'"))v=v.slice(1,-1);process.env[m[1]]=v;}});}}catch(e){}
const DB_PATH = path.join(ROOT, 'db', 'plaza.db');
const PUBLIC_DIR = path.join(ROOT, 'public');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// אם הDB לא קיים — אתחל אוטומטית
if (!fs.existsSync(DB_PATH)) {
  console.log('📦 מאתחל בסיס נתונים בפעם הראשונה...');
  require('./init-db.js');
}

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'plaza-2-0-change-this-in-production';
const DEFAULT_EXPIRY_H = 24;

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// מיגרציות קלות — מוסיף עמודות חדשות אם חסרות (בלי לאבד נתונים)
function ensureCol(table,col,def){try{const cols=db.prepare(`PRAGMA table_info(${table})`).all();if(!cols.find(c=>c.name===col))db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);}catch(e){console.warn('migrate',table,col,e.message);}}
ensureCol('posts','gender',"TEXT DEFAULT 'all'");
ensureCol('posts','archived',"INTEGER DEFAULT 0");
ensureCol('private_chats','a_archived',"INTEGER DEFAULT 0");
ensureCol('private_chats','b_archived',"INTEGER DEFAULT 0");
ensureCol('users','gender',"TEXT");
ensureCol('users','is_business',"INTEGER DEFAULT 0");
ensureCol('room_messages','country',"TEXT");
ensureCol('room_messages','lang',"TEXT");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(PUBLIC_DIR));

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => cb(null, Date.now() + '-' + Math.random().toString(36).slice(2) + path.extname(file.originalname || ''))
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

// ─── Auth helpers ────────────────────────────────
function sign(u){return jwt.sign({id:u.id,username:u.username,is_admin:u.is_admin},JWT_SECRET,{expiresIn:'30d'});}
function auth(req,res,next){const h=req.headers.authorization||'';const t=h.replace('Bearer ','');try{req.user=jwt.verify(t,JWT_SECRET);next();}catch(e){res.status(401).json({error:'unauthorized'});}}
function adminOnly(req,res,next){if(!req.user||!req.user.is_admin)return res.status(403).json({error:'admin required'});next();}
function now(){return Math.floor(Date.now()/1000);}
function notify(userId,fromId,type,payload){
  if(!userId||userId===fromId)return; // לא שולחים התראה לעצמך
  try{
    db.prepare('INSERT INTO notifications(user_id,type,payload,expires_at) VALUES(?,?,?,?)').run(userId,type,JSON.stringify(payload||{}),now()+24*3600);
    if(io)io.to('user:'+userId).emit('notif:new',{type,payload});
  }catch(e){}
}

// ─── Health check ────────────────────────────────
app.get('/api/health',(_,res)=>res.json({ok:true,t:now(),v:'2.0'}));

// ─── Public stats (homepage counters) ────────────
app.get('/api/stats',(_,res)=>{
  res.json({
    users:db.prepare('SELECT COUNT(*) c FROM users').get().c,
    online:db.prepare('SELECT COUNT(*) c FROM users WHERE last_seen>?').get(now()-300).c,
    posts:db.prepare('SELECT COUNT(*) c FROM posts WHERE expires_at>? AND hidden=0').get(now()).c,
  });
});

// ─── Auth endpoints ──────────────────────────────
app.post('/api/register',(req,res)=>{
  const {username,password,display_name,email,phone,lang,country}=req.body;
  if(!username||!password||password.length<6)return res.status(400).json({error:'username + password(6+) required'});
  try{
    const hash=bcrypt.hashSync(password,10);
    const r=db.prepare(`INSERT INTO users(username,password_hash,display_name,email,phone,lang,country) VALUES(?,?,?,?,?,?,?)`)
      .run(username,hash,display_name||username,email||null,phone||null,lang||'he',country||'IL');
    const user=db.prepare('SELECT * FROM users WHERE id=?').get(r.lastInsertRowid);
    res.json({token:sign(user),user:{id:user.id,username:user.username,display_name:user.display_name,is_admin:user.is_admin}});
  }catch(e){res.status(400).json({error:'username taken'});}
});
app.post('/api/login',(req,res)=>{
  const {username,password}=req.body;
  const login=(req.body.login||username||'').trim();
  // התחברות לפי שם משתמש או אימייל
  const u=db.prepare('SELECT * FROM users WHERE username=? OR email=?').get(login,login.toLowerCase());
  if(!u||!u.password_hash||!bcrypt.compareSync(password,u.password_hash))return res.status(401).json({error:'bad credentials'});
  if(u.is_banned)return res.status(403).json({error:'banned'});
  db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(now(),u.id);
  res.json({token:sign(u),user:{id:u.id,username:u.username,display_name:u.display_name,is_admin:u.is_admin}});
});

// ─── Public config (which social logins are enabled) ───
app.get('/api/config',(_,res)=>{
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    telegramBot: process.env.TELEGRAM_BOT_ID || '',     // מזהה מספרי של הבוט (לא הטוקן)
    emailEnabled: !!(process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY),
  });
});

// ─── Sounds library (פרוקסי ל-Jamendo — מוזיקת CC חינמית, מפתח חינם) ───
app.get('/api/sounds',async(req,res)=>{
  const key=process.env.JAMENDO_CLIENT_ID;
  if(!key)return res.json({hits:[]}); // אין מפתח → הלקוח משתמש בספרייה המקומית
  try{
    const q=encodeURIComponent(req.query.q||'');
    const url=`https://api.jamendo.com/v3.0/tracks/?client_id=${key}&format=json&limit=40&audioformat=mp32&order=popularity_total${q?'&search='+q:''}`;
    const r=await fetch(url);const j=await r.json();
    const hits=(j.results||[]).filter(t=>t.audio).map(t=>({n:'🎵 '+t.name+' · '+(t.artist_name||''),d:t.duration?Math.floor(t.duration/60)+':'+String(t.duration%60).padStart(2,'0'):'',url:t.audio}));
    res.json({hits});
  }catch(e){res.json({hits:[]});}
});

// ─── Password reset (קוד 6 ספרות) ───
const resetCodes = new Map(); // email -> {code, exp}
function genCode(){return String(Math.floor(100000+Math.random()*900000));}
async function sendEmail(to,subject,text){
  // שליחה אמיתית דרך Resend אם מוגדר; אחרת מחזיר false (מצב פיתוח)
  const key=process.env.RESEND_API_KEY;
  if(!key)return false;
  try{
    await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},
      body:JSON.stringify({from:process.env.MAIL_FROM||'PLAZA <onboarding@resend.dev>',to,subject,text})});
    return true;
  }catch(e){return false;}
}
app.post('/api/forgot',async(req,res)=>{
  const email=(req.body.email||'').trim().toLowerCase();
  const u=db.prepare('SELECT id FROM users WHERE email=?').get(email);
  // לא חושפים אם המייל קיים — תמיד מחזירים ok
  if(!u)return res.json({ok:1});
  const code=genCode();
  resetCodes.set(email,{code,exp:now()+15*60});
  const sent=await sendEmail(email,'איפוס סיסמה — PLAZA','קוד האיפוס שלך: '+code+'\n\nתקף ל-15 דקות.');
  res.json({ok:1, devCode: sent?undefined:code}); // ללא שירות מייל — מחזירים קוד לבדיקה
});
app.post('/api/reset',(req,res)=>{
  const email=(req.body.email||'').trim().toLowerCase(),{code,password}=req.body;
  const rec=resetCodes.get(email);
  if(!rec||rec.code!==code||rec.exp<now())return res.status(400).json({error:'bad code'});
  if(!password||password.length<6)return res.status(400).json({error:'password too short'});
  const u=db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if(!u)return res.status(400).json({error:'bad code'});
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(password,10),u.id);
  resetCodes.delete(email);
  res.json({token:sign(u),user:{id:u.id,username:u.username,display_name:u.display_name,is_admin:u.is_admin}});
});

// ─── Google sign-in (מאמת את id_token מול גוגל) ───
function userToken(u){db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(now(),u.id);return {token:sign(u),user:{id:u.id,username:u.username,display_name:u.display_name,is_admin:u.is_admin}};}
function findOrCreateOAuth(email,name,avatar){
  let u=email?db.prepare('SELECT * FROM users WHERE email=? OR username=?').get(email,email):null;
  if(u)return u;
  const uname=email||('user'+Date.now());
  const r=db.prepare('INSERT INTO users(username,password_hash,display_name,email,avatar_url,lang,country) VALUES(?,?,?,?,?,?,?)')
    .run(uname,'',name||uname,email||null,avatar||null,'he','IL');
  return db.prepare('SELECT * FROM users WHERE id=?').get(r.lastInsertRowid);
}
app.post('/api/auth/google',async(req,res)=>{
  const {credential}=req.body;
  if(!credential)return res.status(400).json({error:'no credential'});
  try{
    const r=await fetch('https://oauth2.googleapis.com/tokeninfo?id_token='+encodeURIComponent(credential));
    const g=await r.json();
    if(!g||!g.email)return res.status(401).json({error:'invalid google token'});
    if(process.env.GOOGLE_CLIENT_ID && g.aud!==process.env.GOOGLE_CLIENT_ID)return res.status(401).json({error:'wrong audience'});
    const u=findOrCreateOAuth(g.email.toLowerCase(),g.name,g.picture);
    if(u.is_banned)return res.status(403).json({error:'banned'});
    res.json(userToken(u));
  }catch(e){res.status(500).json({error:'google auth failed'});}
});

// ─── Telegram login (מאמת hash מול טוקן הבוט) ───
const crypto=require('crypto');
app.post('/api/auth/telegram',(req,res)=>{
  const token=process.env.TELEGRAM_BOT_TOKEN;
  if(!token)return res.status(400).json({error:'telegram not configured'});
  const data={...req.body};const hash=data.hash;delete data.hash;
  const checkString=Object.keys(data).sort().map(k=>`${k}=${data[k]}`).join('\n');
  const secret=crypto.createHash('sha256').update(token).digest();
  const hmac=crypto.createHmac('sha256',secret).update(checkString).digest('hex');
  if(hmac!==hash)return res.status(401).json({error:'bad telegram hash'});
  const uname='tg_'+data.id;
  let u=db.prepare('SELECT * FROM users WHERE username=?').get(uname);
  if(!u){const r=db.prepare('INSERT INTO users(username,password_hash,display_name,avatar_url,lang,country) VALUES(?,?,?,?,?,?)')
    .run(uname,'',[data.first_name,data.last_name].filter(Boolean).join(' ')||uname,data.photo_url||null,'he','IL');
    u=db.prepare('SELECT * FROM users WHERE id=?').get(r.lastInsertRowid);}
  if(u.is_banned)return res.status(403).json({error:'banned'});
  res.json(userToken(u));
});
app.get('/api/me',auth,(req,res)=>{const u=db.prepare('SELECT id,username,display_name,email,phone,avatar_url,location,country,lang,bio,profession,hobby,wa_dial,wa_num,biz_email,biz_phone,biz_web,is_admin,is_verified,prefs FROM users WHERE id=?').get(req.user.id);res.json(u);});
app.put('/api/me',auth,(req,res)=>{
  const f=['display_name','avatar_url','location','country','lang','bio','profession','hobby','wa_dial','wa_num','biz_email','biz_phone','biz_web','prefs'];
  const set=f.filter(k=>k in req.body).map(k=>`${k}=?`).join(',');
  if(!set)return res.json({ok:1});
  db.prepare(`UPDATE users SET ${set} WHERE id=?`).run(...f.filter(k=>k in req.body).map(k=>typeof req.body[k]==='object'?JSON.stringify(req.body[k]):req.body[k]),req.user.id);
  res.json({ok:1});
});

// ─── GDPR: ייצוא ומחיקת חשבון ───
app.get('/api/me/export',auth,(req,res)=>{
  const u=db.prepare('SELECT id,username,display_name,email,phone,bio,country,lang,created_at FROM users WHERE id=?').get(req.user.id);
  const posts=db.prepare('SELECT * FROM posts WHERE user_id=?').all(req.user.id);
  const comments=db.prepare('SELECT * FROM comments WHERE user_id=?').all(req.user.id);
  res.setHeader('Content-Disposition','attachment; filename=plaza-data.json');
  res.json({profile:u,posts,comments});
});
app.post('/api/me/delete',auth,(req,res)=>{
  const id=req.user.id;
  try{
    db.prepare('DELETE FROM posts WHERE user_id=?').run(id);
    db.prepare('DELETE FROM comments WHERE user_id=?').run(id);
    db.prepare('DELETE FROM private_messages WHERE user_id=?').run(id);
    db.prepare('DELETE FROM users WHERE id=?').run(id);
  }catch(e){}
  res.json({ok:1});
});

// ─── Upload ──────────────────────────────────────
app.post('/api/upload',auth,upload.array('files',10),(req,res)=>{
  res.json({urls:req.files.map(f=>'/uploads/'+f.filename)});
});

// ─── Posts ───────────────────────────────────────
app.get('/api/posts',(req,res)=>{
  const {topic,country,lang,type,limit=30,offset=0}=req.query;
  const w=['p.hidden=0','p.expires_at>?'];const p=[now()];
  if(topic){w.push('p.topic=?');p.push(topic);}
  if(country){w.push('p.country=?');p.push(country);}
  if(lang){w.push('p.lang=?');p.push(lang);}
  if(type){w.push('p.type=?');p.push(type);}
  const rows=db.prepare(`SELECT p.*,u.username,u.display_name,u.avatar_url,u.is_verified FROM posts p JOIN users u ON u.id=p.user_id WHERE ${w.join(' AND ')} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`).all(...p,+limit,+offset);
  res.json(rows.map(r=>({...r,media_urls:r.media_urls?JSON.parse(r.media_urls):null,product_data:r.product_data?JSON.parse(r.product_data):null,job_data:r.job_data?JSON.parse(r.job_data):null,poll_data:r.poll_data?JSON.parse(r.poll_data):null,loc_data:r.loc_data?JSON.parse(r.loc_data):null})));
});
app.post('/api/posts',auth,(req,res)=>{
  const {type='text',text,topic,lang,country,gender,media_urls,video_url,sound_url,audio_url,link,product_data,job_data,poll_data,loc_data,expiry_hours,auto_extend,scheduled_at}=req.body;
  const exp=now()+(expiry_hours===48?48:24)*3600;
  const r=db.prepare(`INSERT INTO posts(user_id,type,text,topic,lang,country,gender,media_urls,video_url,sound_url,audio_url,link,product_data,job_data,poll_data,loc_data,expires_at,auto_extend,scheduled_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(req.user.id,type,text||null,topic||null,lang||null,country||null,gender||'all',media_urls?JSON.stringify(media_urls):null,video_url||null,sound_url||null,audio_url||null,link||null,product_data?JSON.stringify(product_data):null,job_data?JSON.stringify(job_data):null,poll_data?JSON.stringify(poll_data):null,loc_data?JSON.stringify(loc_data):null,exp,auto_extend?1:0,scheduled_at||null);
  io.emit('post:new',{id:r.lastInsertRowid,topic});
  res.json({id:r.lastInsertRowid});
});
app.put('/api/posts/:id',auth,(req,res)=>{
  const p=db.prepare('SELECT user_id FROM posts WHERE id=?').get(req.params.id);
  if(!p||(p.user_id!==req.user.id&&!req.user.is_admin))return res.status(403).json({error:'forbidden'});
  const {text}=req.body;
  db.prepare('UPDATE posts SET text=COALESCE(?,text) WHERE id=?').run(text??null,req.params.id);
  res.json({ok:1});
});
app.delete('/api/posts/:id',auth,(req,res)=>{
  const p=db.prepare('SELECT user_id FROM posts WHERE id=?').get(req.params.id);
  if(!p||(p.user_id!==req.user.id&&!req.user.is_admin))return res.status(403).json({error:'forbidden'});
  db.prepare('DELETE FROM posts WHERE id=?').run(req.params.id);
  res.json({ok:1});
});
app.post('/api/posts/:id/extend',auth,(req,res)=>{
  const p=db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id);
  if(!p||p.user_id!==req.user.id)return res.status(403).json({error:'forbidden'});
  db.prepare('UPDATE posts SET expires_at=expires_at+? WHERE id=?').run(24*3600,req.params.id);
  res.json({ok:1});
});

// ─── Likes / Comments / Bookmarks ────────────────
app.post('/api/posts/:id/like',auth,(req,res)=>{
  const pid=+req.params.id,uid=req.user.id;
  const ex=db.prepare('SELECT id FROM likes WHERE post_id=? AND user_id=?').get(pid,uid);
  if(ex){db.prepare('DELETE FROM likes WHERE id=?').run(ex.id);db.prepare('UPDATE posts SET like_count=MAX(0,like_count-1) WHERE id=?').run(pid);res.json({liked:false});}
  else{db.prepare('INSERT INTO likes(post_id,user_id) VALUES(?,?)').run(pid,uid);db.prepare('UPDATE posts SET like_count=like_count+1 WHERE id=?').run(pid);
    const p=db.prepare('SELECT user_id,text FROM posts WHERE id=?').get(pid);const me=db.prepare('SELECT display_name,username FROM users WHERE id=?').get(uid)||{};
    if(p)notify(p.user_id,uid,'like',{post_id:pid,from:me.display_name||me.username,text:(p.text||'').slice(0,50)});
    res.json({liked:true});}
});
app.get('/api/posts/:id/comments',(req,res)=>{
  const c=db.prepare('SELECT c.*,u.display_name,u.avatar_url FROM comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=? ORDER BY c.created_at ASC').all(req.params.id);
  res.json(c);
});
app.post('/api/posts/:id/comments',auth,(req,res)=>{
  const {text,audio_url}=req.body;
  const r=db.prepare('INSERT INTO comments(post_id,user_id,text,audio_url) VALUES(?,?,?,?)').run(req.params.id,req.user.id,text||null,audio_url||null);
  db.prepare('UPDATE posts SET comment_count=comment_count+1 WHERE id=?').run(req.params.id);
  io.emit('comment:new',{post_id:+req.params.id,id:r.lastInsertRowid});
  const p=db.prepare('SELECT user_id FROM posts WHERE id=?').get(req.params.id);const me=db.prepare('SELECT display_name,username FROM users WHERE id=?').get(req.user.id)||{};
  if(p)notify(p.user_id,req.user.id,'comment',{post_id:+req.params.id,from:me.display_name||me.username,text:(text||'').slice(0,50)});
  res.json({id:r.lastInsertRowid});
});
app.post('/api/posts/:id/bookmark',auth,(req,res)=>{
  const pid=+req.params.id,uid=req.user.id;
  const ex=db.prepare('SELECT id FROM bookmarks WHERE post_id=? AND user_id=?').get(pid,uid);
  if(ex){db.prepare('DELETE FROM bookmarks WHERE id=?').run(ex.id);res.json({bookmarked:false});}
  else{const p=db.prepare('SELECT * FROM posts WHERE id=?').get(pid);db.prepare('INSERT INTO bookmarks(post_id,user_id,snapshot) VALUES(?,?,?)').run(pid,uid,JSON.stringify(p));res.json({bookmarked:true});}
});
app.get('/api/bookmarks',auth,(req,res)=>{res.json(db.prepare('SELECT * FROM bookmarks WHERE user_id=? ORDER BY id DESC').all(req.user.id).map(b=>({...b,snapshot:JSON.parse(b.snapshot)})));});

// ─── Rooms + chat ────────────────────────────────
app.get('/api/rooms',(req,res)=>{res.json(db.prepare('SELECT * FROM rooms WHERE approved=1').all());});
app.get('/api/rooms/:topic/messages',(req,res)=>{const r=db.prepare('SELECT * FROM rooms WHERE topic=?').get(req.params.topic);if(!r)return res.status(404).json({error:'no room'});res.json(db.prepare('SELECT m.*,u.display_name,u.avatar_url FROM room_messages m JOIN users u ON u.id=m.user_id WHERE m.room_id=? AND m.expires_at>? ORDER BY m.created_at DESC LIMIT 100').all(r.id,now()).reverse());});
app.post('/api/rooms/:topic/messages',auth,(req,res)=>{const r=db.prepare('SELECT * FROM rooms WHERE topic=?').get(req.params.topic);if(!r)return res.status(404).json({error:'no room'});const {text,audio_url,image_url}=req.body;const su=db.prepare('SELECT country,lang,display_name FROM users WHERE id=?').get(req.user.id)||{};const exp=now()+48*3600;const ins=db.prepare('INSERT INTO room_messages(room_id,user_id,text,audio_url,image_url,country,lang,expires_at) VALUES(?,?,?,?,?,?,?,?)').run(r.id,req.user.id,text||null,audio_url||null,image_url||null,su.country||null,su.lang||null,exp);io.to('room:'+r.topic).emit('room:msg',{id:ins.lastInsertRowid,topic:r.topic,user_id:req.user.id,display_name:su.display_name,text,audio_url,image_url,country:su.country||null,lang:su.lang||null,created_at:now()});res.json({id:ins.lastInsertRowid});});

// ─── Private chats / message requests ─────────────
app.post('/api/private/request',auth,(req,res)=>{const {to_id,note}=req.body;if(!to_id)return res.status(400).json({error:'no target'});const exp=now()+24*3600;
  const ex=db.prepare("SELECT * FROM private_chats WHERE ((a_id=? AND b_id=?) OR (a_id=? AND b_id=?)) AND expires_at>?").get(req.user.id,to_id,to_id,req.user.id,now());
  // הודעה ישירה: הצ'אט נפתח מיד כ-accepted (ללא בקשת אישור)
  if(ex){if(ex.status!=='accepted')db.prepare("UPDATE private_chats SET status='accepted' WHERE id=?").run(ex.id);return res.json({id:ex.id,existing:1,status:'accepted'});}
  const r=db.prepare("INSERT INTO private_chats(a_id,b_id,status,expires_at) VALUES(?,?,'accepted',?)").run(req.user.id,to_id,exp);
  const me=db.prepare('SELECT display_name,username FROM users WHERE id=?').get(req.user.id)||{};
  if(note)db.prepare('INSERT INTO private_messages(chat_id,user_id,text) VALUES(?,?,?)').run(r.lastInsertRowid,req.user.id,note);
  notify(to_id,req.user.id,'message_request',{chat_id:r.lastInsertRowid,from:req.user.id,from_name:me.display_name||me.username,note:note||''});
  res.json({id:r.lastInsertRowid,status:'accepted'});});
app.post('/api/private/:id/respond',auth,(req,res)=>{const {action}=req.body;const c=db.prepare('SELECT * FROM private_chats WHERE id=?').get(req.params.id);if(!c||c.b_id!==req.user.id)return res.status(403).json({error:'forbidden'});const st=action==='accept'?'accepted':action==='decline'?'declined':'blocked';db.prepare('UPDATE private_chats SET status=? WHERE id=?').run(st,req.params.id);res.json({status:st});});
app.get('/api/private',auth,(req,res)=>{
  const uid=req.user.id;
  const rows=db.prepare("SELECT * FROM private_chats WHERE (a_id=? OR b_id=?) AND expires_at>? ORDER BY id DESC").all(uid,uid,now());
  res.json(rows.map(c=>{
    const otherId=c.a_id===uid?c.b_id:c.a_id;
    const other=db.prepare('SELECT id,username,display_name,avatar_url FROM users WHERE id=?').get(otherId)||{};
    const last=db.prepare('SELECT text,audio_url,image_url,created_at FROM private_messages WHERE chat_id=? ORDER BY id DESC LIMIT 1').get(c.id);
    const unread=db.prepare('SELECT COUNT(*) n FROM private_messages WHERE chat_id=? AND user_id!=? AND seen=0').get(c.id,uid).n;
    return {...c, other_id:otherId, other_name:other.display_name||other.username||'משתמש', other_avatar:other.avatar_url||'',
      last_text:last?(last.text||(last.audio_url?'🎙️ הודעה קולית':last.image_url?'📷 תמונה':'')):'', unread};
  }));
});
app.get('/api/private/:id/messages',auth,(req,res)=>{
  const c=db.prepare('SELECT * FROM private_chats WHERE id=?').get(req.params.id);
  if(!c||(c.a_id!==req.user.id&&c.b_id!==req.user.id))return res.status(403).json({error:'forbidden'});
  db.prepare('UPDATE private_messages SET seen=1 WHERE chat_id=? AND user_id!=?').run(req.params.id,req.user.id);
  res.json(db.prepare('SELECT m.*,u.display_name,u.avatar_url FROM private_messages m JOIN users u ON u.id=m.user_id WHERE m.chat_id=? ORDER BY m.created_at ASC LIMIT 200').all(req.params.id));
});
app.post('/api/private/:id/messages',auth,(req,res)=>{const c=db.prepare('SELECT * FROM private_chats WHERE id=?').get(req.params.id);if(!c||c.status!=='accepted')return res.status(403).json({error:'not accepted'});const {text,audio_url,image_url}=req.body;const r=db.prepare('INSERT INTO private_messages(chat_id,user_id,text,audio_url,image_url) VALUES(?,?,?,?,?)').run(req.params.id,req.user.id,text||null,audio_url||null,image_url||null);io.to('chat:'+req.params.id).emit('private:msg',{chat_id:+req.params.id,id:r.lastInsertRowid,user_id:req.user.id,text,audio_url,image_url});res.json({id:r.lastInsertRowid});});

// ─── Topic requests (100 votes → admin) ──────────
app.get('/api/topic-requests',(_,res)=>{res.json(db.prepare("SELECT * FROM topic_requests WHERE status='open' ORDER BY votes DESC").all());});
app.post('/api/topic-requests',auth,(req,res)=>{const {topic_name}=req.body;const r=db.prepare('INSERT INTO topic_requests(topic_name,created_by) VALUES(?,?)').run(topic_name,req.user.id);db.prepare('INSERT INTO topic_votes(request_id,user_id) VALUES(?,?)').run(r.lastInsertRowid,req.user.id);res.json({id:r.lastInsertRowid});});
app.post('/api/topic-requests/:id/vote',auth,(req,res)=>{try{db.prepare('INSERT INTO topic_votes(request_id,user_id) VALUES(?,?)').run(req.params.id,req.user.id);db.prepare('UPDATE topic_requests SET votes=votes+1 WHERE id=?').run(req.params.id);const r=db.prepare('SELECT * FROM topic_requests WHERE id=?').get(req.params.id);if(r.votes>=100&&r.status==='open'){db.prepare("UPDATE topic_requests SET status='sent_to_admin' WHERE id=?").run(req.params.id);db.prepare("INSERT INTO notifications(user_id,type,payload) SELECT id,'topic_request_sent',? FROM users WHERE is_admin=1").run(JSON.stringify({request_id:r.id,name:r.topic_name}));}res.json({votes:r.votes+1});}catch(e){res.status(400).json({error:'already voted'});}});

// ─── Reports ──────────────────────────────────────
app.post('/api/reports',auth,(req,res)=>{const {target_type,target_id,reason}=req.body;db.prepare('INSERT INTO reports(reporter_id,target_type,target_id,reason) VALUES(?,?,?,?)').run(req.user.id,target_type,target_id,reason);res.json({ok:1});});

// ─── Notifications ────────────────────────────────
app.get('/api/notifications',auth,(req,res)=>{
  const rows=db.prepare('SELECT * FROM notifications WHERE user_id=? AND (expires_at IS NULL OR expires_at>?) ORDER BY created_at DESC LIMIT 80').all(req.user.id,now());
  res.json(rows.map(n=>({...n,payload:n.payload?(()=>{try{return JSON.parse(n.payload);}catch(e){return null;}})():null})));
});
app.get('/api/notifications/unread',auth,(req,res)=>{res.json({count:db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read=0 AND (expires_at IS NULL OR expires_at>?)').get(req.user.id,now()).c});});
app.post('/api/notifications/read',auth,(req,res)=>{db.prepare('UPDATE notifications SET read=1 WHERE user_id=?').run(req.user.id);res.json({ok:1});});

// ─── Public user profile ──────────────────────────
app.get('/api/users/:id',(req,res)=>{
  const byId=/^\d+$/.test(req.params.id);
  const u=db.prepare(`SELECT id,username,display_name,avatar_url,cover_url,location,country,lang,bio,profession,hobby,wa_dial,wa_num,biz_email,biz_phone,biz_web,is_verified,is_business,created_at FROM users WHERE ${byId?'id=?':'username=?'}`).get(req.params.id);
  if(!u)return res.status(404).json({error:'not found'});
  u.posts=db.prepare('SELECT COUNT(*) c FROM posts WHERE user_id=? AND expires_at>? AND hidden=0').get(u.id,now()).c;
  res.json(u);
});

// ─── Admin ───────────────────────────────────────
app.get('/api/admin/stats',auth,adminOnly,(_,res)=>{
  res.json({
    users:db.prepare('SELECT COUNT(*) c FROM users').get().c,
    posts:db.prepare('SELECT COUNT(*) c FROM posts WHERE expires_at>?').get(now()).c,
    online:db.prepare('SELECT COUNT(*) c FROM users WHERE last_seen>?').get(now()-300).c,
    rooms:db.prepare('SELECT COUNT(*) c FROM rooms').get().c,
    topicReqs:db.prepare("SELECT COUNT(*) c FROM topic_requests WHERE status='sent_to_admin'").get().c,
    reports:db.prepare('SELECT COUNT(*) c FROM reports WHERE handled=0').get().c,
  });
});
app.get('/api/admin/users',auth,adminOnly,(_,res)=>{res.json(db.prepare('SELECT id,username,display_name,email,country,lang,is_admin,is_verified,is_banned,last_seen,created_at FROM users ORDER BY created_at DESC LIMIT 500').all());});
app.put('/api/admin/users/:id',auth,adminOnly,(req,res)=>{const {is_admin,is_verified,is_banned}=req.body;db.prepare('UPDATE users SET is_admin=COALESCE(?,is_admin),is_verified=COALESCE(?,is_verified),is_banned=COALESCE(?,is_banned) WHERE id=?').run(is_admin,is_verified,is_banned,req.params.id);res.json({ok:1});});
app.delete('/api/admin/users/:id',auth,adminOnly,(req,res)=>{db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);res.json({ok:1});});
app.get('/api/admin/posts',auth,adminOnly,(_,res)=>{res.json(db.prepare('SELECT p.*,u.username FROM posts p JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 200').all());});
app.put('/api/admin/posts/:id/hide',auth,adminOnly,(req,res)=>{db.prepare('UPDATE posts SET hidden=1 WHERE id=?').run(req.params.id);res.json({ok:1});});
app.get('/api/admin/topic-requests',auth,adminOnly,(_,res)=>{res.json(db.prepare('SELECT * FROM topic_requests ORDER BY votes DESC').all());});
app.post('/api/admin/topic-requests/:id/approve',auth,adminOnly,(req,res)=>{const r=db.prepare('SELECT * FROM topic_requests WHERE id=?').get(req.params.id);if(!r)return res.status(404).json({error:'no'});const slug=r.topic_name.toLowerCase().replace(/\s+/g,'_').slice(0,40);db.prepare('INSERT OR IGNORE INTO rooms(topic,name,icon,approved) VALUES(?,?,?,1)').run(slug,r.topic_name,'💬');db.prepare("UPDATE topic_requests SET status='approved' WHERE id=?").run(req.params.id);res.json({ok:1});});
app.get('/api/admin/reports',auth,adminOnly,(_,res)=>{res.json(db.prepare('SELECT * FROM reports ORDER BY created_at DESC LIMIT 200').all());});

// ─── Socket.io ───────────────────────────────────
io.use((socket,next)=>{const t=socket.handshake.auth&&socket.handshake.auth.token;if(!t)return next();try{socket.user=jwt.verify(t,JWT_SECRET);}catch(e){}next();});
function roomSize(name){try{const r=io.sockets.adapter.rooms.get(name);return r?r.size:0;}catch(e){return 0;}}
function broadcastPostCount(id){io.to('post:'+id).emit('post:presence',{id:+id,count:roomSize('post:'+id)});}
function broadcastRoomCount(topic){io.to('room:'+topic).emit('room:presence',{topic,count:roomSize('room:'+topic)});}
io.on('connection',sock=>{
  if(sock.user){db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(now(),sock.user.id);sock.join('user:'+sock.user.id);}
  sock.on('room:join',topic=>{sock.join('room:'+topic);broadcastRoomCount(topic);});
  sock.on('room:leave',topic=>{sock.leave('room:'+topic);broadcastRoomCount(topic);});
  sock.on('post:enter',id=>{if(id==null)return;sock.join('post:'+id);broadcastPostCount(id);});
  sock.on('post:leave',id=>{if(id==null)return;sock.leave('post:'+id);broadcastPostCount(id);});
  sock.on('chat:join',cid=>sock.join('chat:'+cid));
  sock.on('typing',d=>sock.to('chat:'+d.chat_id).emit('typing',{user_id:sock.user&&sock.user.id}));
  sock.on('disconnecting',()=>{for(const r of sock.rooms){if(r.startsWith('post:'))setTimeout(()=>broadcastPostCount(r.slice(5)),50);else if(r.startsWith('room:'))setTimeout(()=>broadcastRoomCount(r.slice(5)),50);}});
});

// ─── Cleanup expired ─────────────────────────────
setInterval(()=>{
  db.prepare('DELETE FROM posts WHERE expires_at<? AND auto_extend=0').run(now());
  db.prepare('UPDATE posts SET expires_at=expires_at+? WHERE expires_at<? AND auto_extend=1').run(24*3600,now());
  db.prepare('DELETE FROM room_messages WHERE expires_at<?').run(now());
  db.prepare('DELETE FROM private_chats WHERE expires_at<?').run(now());
  db.prepare('DELETE FROM notifications WHERE expires_at<?').run(now());
},5*60*1000);

// ─── Pages ───────────────────────────────────────
app.get('/admin',(_,res)=>res.sendFile(path.join(PUBLIC_DIR,'admin.html')));
app.get('/login',(_,res)=>res.sendFile(path.join(PUBLIC_DIR,'login.html')));
app.get('/privacy',(_,res)=>res.sendFile(path.join(PUBLIC_DIR,'privacy.html')));
app.get('/terms',(_,res)=>res.sendFile(path.join(PUBLIC_DIR,'terms.html')));
app.get('*',(req,res)=>{if(req.path.startsWith('/api'))return res.status(404).json({error:'not found'});res.sendFile(path.join(PUBLIC_DIR,'index.html'));});

server.listen(PORT,()=>{
  console.log('╔═══════════════════════════════════════╗');
  console.log('║  🌍 PLAZA 2.0 רץ                       ║');
  console.log('║  http://localhost:'+PORT+'                ║');
  console.log('║  אדמין: http://localhost:'+PORT+'/admin   ║');
  console.log('║  שם משתמש: admin                       ║');
  console.log('║  סיסמה:    Plaza2026!Admin             ║');
  console.log('╚═══════════════════════════════════════╝');
});
