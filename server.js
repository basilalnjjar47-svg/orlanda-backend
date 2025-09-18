// 0. تحميل المتغيرات من Environment Variables
require('dotenv').config();

// 1. استدعاء المكتبات اللازمة
const express = require('express');
const axios = require('axios');
const cors = require('cors');

// 2. إعداد تطبيق Express
const app = express();
const PORT = process.env.PORT || 3000;

// --- [إعداد] تفعيل CORS للسماح بالطلبات من نطاقات أخرى (مثل Netlify) ---
app.use(cors());

// --- بيانات اعتماد جوجل من Environment Variables ---
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// --- [تحقق] التأكد من وجود متغيرات البيئة الأساسية ---
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error('FATAL ERROR: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not defined.');
  console.error('Please set these environment variables in your hosting provider (e.g., Render).');
  process.exit(1); // إيقاف السيرفر إذا كانت المتغيرات غير موجودة
}

// الرابط الذي سيعود إليه المستخدم بعد تسجيل الدخول
const REDIRECT_URI = process.env.RENDER_EXTERNAL_URL
  ? `${process.env.RENDER_EXTERNAL_URL}/auth/google/callback`
  : `http://localhost:${PORT}/auth/google/callback`;

// --- [للتحقق] طباعة حالة المتغيرات عند بدء التشغيل ---
console.log('--- Environment Variables Status ---');
console.log(`PORT: ${PORT}`);
console.log('GOOGLE_CLIENT_ID: Loaded');
console.log('GOOGLE_CLIENT_SECRET: Loaded');
console.log(`REDIRECT_URI: ${REDIRECT_URI}`);

// 3. نقطة النهاية لاستلام المستخدم بعد تسجيل الدخول في جوجل
app.get('/auth/google/callback', async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.status(400).send('خطأ: لم يتم استلام الكود من جوجل.');
  }

  try {
    // أ) استبدال الكود المؤقت بـ Access Token
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', null, {
      params: {
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      },
    });

    const { access_token } = tokenResponse.data;

    // ب) استخدام الـ Access Token لجلب بيانات المستخدم
    const profileResponse = await axios.get('https://www.googleapis.com/oauth2/v1/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const userProfile = profileResponse.data;
    const userName = userProfile.name;

    console.log(`User Logged In: ${userName}`);

    // ج) إعادة توجيه المستخدم إلى موقعك على Netlify
    const encodedName = encodeURIComponent(userName);
    res.redirect(`https://tubular-cannoli-1e7789.netlify.app?login=success&userName=${encodedName}`);

  } catch (error) {
    console.error('Error during Google OAuth:', error.response ? error.response.data : error.message);
    res.status(500).send('حدث خطأ أثناء عملية المصادقة.');
  }
});

// نقطة نهاية تجريبية للتأكد من أن السيرفر يعمل
app.get('/', (req, res) => {
  res.send('سيرفر أورلاندا يعمل بنجاح!');
});

// 4. تشغيل السيرفر
app.listen(PORT, () => {
  console.log(`Backend server is running on port ${PORT}`);
});
