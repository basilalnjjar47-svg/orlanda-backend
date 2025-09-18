// 0. تحميل المتغيرات من ملف .env
require('dotenv').config();

// 1. استدعاء المكتبات اللازمة
const express = require('express');
const axios = require('axios');

// 2. إعداد تطبيق Express
const app = express();
// Render.com ستقوم بتحديد المنفذ تلقائياً
const PORT = process.env.PORT || 3000;

// --- بيانات اعتماد جوجل من ملف .env ---
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// هذا هو الرابط الذي سيعود إليه المستخدم من جوجل (سيتم تحديثه لاحقاً برابط Render)
const REDIRECT_URI = 'https://courageous-dasik-c7cadd.netlify.app/auth/google/callback';

// 3. إنشاء نقطة النهاية (Endpoint) التي ستستقبل المستخدم بعد تسجيل الدخول في جوجل
app.get('/auth/google/callback', async (req, res) => {
    // الحصول على الكود المؤقت الذي أرسلته جوجل
    const code = req.query.code;

    if (!code) {
        return res.status(400).send('خطأ: لم يتم استلام الكود من جوجل.');
    }

    try {
        // --- الخطوة أ: استبدال الكود المؤقت بـ Access Token ---
        const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', null, {
            params: {
                code: code,
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                // ملاحظة: هذا الرابط يجب أن يكون مطابقاً تماماً للرابط الذي سنضعه في Render لاحقاً
                redirect_uri: process.env.RENDER_EXTERNAL_URL ? `${process.env.RENDER_EXTERNAL_URL}/auth/google/callback` : REDIRECT_URI,
                grant_type: 'authorization_code',
            },
        });

        const { access_token } = tokenResponse.data;

        // --- الخطوة ب: استخدام الـ Access Token لجلب بيانات المستخدم ---
        const profileResponse = await axios.get('https://www.googleapis.com/oauth2/v1/userinfo', {
            headers: {
                Authorization: `Bearer ${access_token}`,
            },
        });

        const userProfile = profileResponse.data;
        const userName = userProfile.name;

        console.log(`User Logged In: ${userName}`);

        // --- الخطوة ج: إعادة توجيه المستخدم إلى موقعك على Netlify ---
        // نرسل اسم المستخدم في الرابط ليتم عرضه في الواجهة الأمامية
        const encodedName = encodeURIComponent(userName);
        res.redirect(`https://courageous-dasik-c7cadd.netlify.app?login=success&userName=${encodedName}`);

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
