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
  const u=db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if(!u||!bcrypt.compareSync(password,u.password_hash))return res.status(401).json({error:'bad credentials'});
  if(u.is_banned)return res.status(403).json({error:'banned'});
  db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(now(),u.id);
  res.json({token:sign(u),user:{id:u.id,username:u.username,display_name:u.display_name,is_admin:u.is_admin}});
});
app.get('/api/me',auth,(req,res)=>{const u=db.prepare('SELECT id,username,display_name,email,phone,avatar_url,location,country,lang,bio,profession,hobby,wa_dial,wa_num,biz_email,biz_phone,biz_web,is_admin,is_verified,prefs FROM users WHERE id=?').get(req.user.id);res.json(u);});
app.put('/api/me',auth,(req,res)=>{
  const f=['display_name','avatar_url','location','country','lang','bio','profession','hobby','wa_dial','wa_num','biz_email','biz_phone','biz_web','prefs'];
  const set=f.filter(k=>k in req.body).map(k=>`${k}=?`).join(',');
  if(!set)return res.json({ok:1});
  db.prepare(`UPDATE users SET ${set} WHERE id=?`).run(...f.filter(k=>k in req.body).map(k=>typeof req.body[k]==='object'?JSON.stringify(req.body[k]):req.body[k]),req.user.id);
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
  const {type='text',text,topic,lang,country,media_urls,video_url,sound_url,audio_url,link,product_data,job_data,poll_data,loc_data,expiry_hours,auto_extend,scheduled_at}=req.body;
  const exp=now()+(expiry_hours===48?48:24)*3600;
  const r=db.prepare(`INSERT INTO posts(user_id,type,text,topic,lang,country,media_urls,video_url,sound_url,audio_url,link,product_data,job_data,poll_data,loc_data,expires_at,auto_extend,scheduled_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(req.user.id,type,text||null,topic||null,lang||null,country||null,media_urls?JSON.stringify(media_urls):null,video_url||null,sound_url||null,audio_url||null,link||null,product_data?JSON.stringify(product_data):null,job_data?JSON.stringify(job_data):null,poll_data?JSON.stringify(poll_data):null,loc_data?JSON.stringify(loc_data):null,exp,auto_extend?1:0,scheduled_at||null);
  io.emit('post:new',{id:r.lastInsertRowid,topic});
  res.json({id:r.lastInsertRowid});
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
  else{db.prepare('INSERT INTO likes(post_id,user_id) VALUES(?,?)').run(pid,uid);db.prepare('UPDATE posts SET like_count=like_count+1 WHERE id=?').run(pid);res.json({liked:true});}
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
app.post('/api/rooms/:topic/messages',auth,(req,res)=>{const r=db.prepare('SELECT * FROM rooms WHERE topic=?').get(req.params.topic);if(!r)return res.status(404).json({error:'no room'});const {text,audio_url,image_url}=req.body;const exp=now()+48*3600;const ins=db.prepare('INSERT INTO room_messages(room_id,user_id,text,audio_url,image_url,expires_at) VALUES(?,?,?,?,?,?)').run(r.id,req.user.id,text||null,audio_url||null,image_url||null,exp);io.to('room:'+r.topic).emit('room:msg',{id:ins.lastInsertRowid,topic:r.topic,user_id:req.user.id,text,audio_url,image_url,created_at:now()});res.json({id:ins.lastInsertRowid});});

// ─── Private chats / message requests ─────────────
app.post('/api/private/request',auth,(req,res)=>{const {to_id}=req.body;const exp=now()+24*3600;const r=db.prepare("INSERT INTO private_chats(a_id,b_id,status,expires_at) VALUES(?,?,'pending',?)").run(req.user.id,to_id,exp);db.prepare('INSERT INTO notifications(user_id,type,payload) VALUES(?,?,?)').run(to_id,'message_request',JSON.stringify({chat_id:r.lastInsertRowid,from:req.user.id}));res.json({id:r.lastInsertRowid});});
app.post('/api/private/:id/respond',auth,(req,res)=>{const {action}=req.body;const c=db.prepare('SELECT * FROM private_chats WHERE id=?').get(req.params.id);if(!c||c.b_id!==req.user.id)return res.status(403).json({error:'forbidden'});const st=action==='accept'?'accepted':action==='decline'?'declined':'blocked';db.prepare('UPDATE private_chats SET status=? WHERE id=?').run(st,req.params.id);res.json({status:st});});
app.get('/api/private',auth,(req,res)=>{res.json(db.prepare("SELECT * FROM private_chats WHERE (a_id=? OR b_id=?) AND expires_at>?").all(req.user.id,req.user.id,now()));});
app.post('/api/private/:id/messages',auth,(req,res)=>{const c=db.prepare('SELECT * FROM private_chats WHERE id=?').get(req.params.id);if(!c||c.status!=='accepted')return res.status(403).json({error:'not accepted'});const {text,audio_url,image_url}=req.body;const r=db.prepare('INSERT INTO private_messages(chat_id,user_id,text,audio_url,image_url) VALUES(?,?,?,?,?)').run(req.params.id,req.user.id,text||null,audio_url||null,image_url||null);io.to('chat:'+req.params.id).emit('private:msg',{chat_id:+req.params.id,id:r.lastInsertRowid,user_id:req.user.id,text,audio_url,image_url});res.json({id:r.lastInsertRowid});});

// ─── Topic requests (100 votes → admin) ──────────
app.get('/api/topic-requests',(_,res)=>{res.json(db.prepare("SELECT * FROM topic_requests WHERE status='open' ORDER BY votes DESC").all());});
app.post('/api/topic-requests',auth,(req,res)=>{const {topic_name}=req.body;const r=db.prepare('INSERT INTO topic_requests(topic_name,created_by) VALUES(?,?)').run(topic_name,req.user.id);db.prepare('INSERT INTO topic_votes(request_id,user_id) VALUES(?,?)').run(r.lastInsertRowid,req.user.id);res.json({id:r.lastInsertRowid});});
app.post('/api/topic-requests/:id/vote',auth,(req,res)=>{try{db.prepare('INSERT INTO topic_votes(request_id,user_id) VALUES(?,?)').run(req.params.id,req.user.id);db.prepare('UPDATE topic_requests SET votes=votes+1 WHERE id=?').run(req.params.id);const r=db.prepare('SELECT * FROM topic_requests WHERE id=?').get(req.params.id);if(r.votes>=100&&r.status==='open'){db.prepare("UPDATE topic_requests SET status='sent_to_admin' WHERE id=?").run(req.params.id);db.prepare("INSERT INTO notifications(user_id,type,payload) SELECT id,'topic_request_sent',? FROM users WHERE is_admin=1").run(JSON.stringify({request_id:r.id,name:r.topic_name}));}res.json({votes:r.votes+1});}catch(e){res.status(400).json({error:'already voted'});}});

// ─── Reports ──────────────────────────────────────
app.post('/api/reports',auth,(req,res)=>{const {target_type,target_id,reason}=req.body;db.prepare('INSERT INTO reports(reporter_id,target_type,target_id,reason) VALUES(?,?,?,?)').run(req.user.id,target_type,target_id,reason);res.json({ok:1});});

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
io.on('connection',sock=>{
  if(sock.user)db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(now(),sock.user.id);
  sock.on('room:join',topic=>sock.join('room:'+topic));
  sock.on('room:leave',topic=>sock.leave('room:'+topic));
  sock.on('chat:join',cid=>sock.join('chat:'+cid));
  sock.on('typing',d=>sock.to('chat:'+d.chat_id).emit('typing',{user_id:sock.user&&sock.user.id}));
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
