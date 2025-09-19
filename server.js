// 0. تحميل المتغيرات من بيئة الاستضافة
require('dotenv').config();

// 1. استدعاء المكتبات اللازمة
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt'); // --- جديد ---
const nodemailer = require('nodemailer'); // --- جديد ---

// 2. إعداد تطبيق Express
const app = express();
const PORT = process.env.PORT || 3000;

// --- الروابط الأساسية ---
// ملاحظة: تأكد من أن هذا هو رابط موقعك الصحيح على Netlify
const FRONTEND_URL = 'https://courageous-dasik-c7cadd.netlify.app';
const BACKEND_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

// --- Middleware ---
app.use(cors({ origin: FRONTEND_URL })); // --- تعديل للأمان ---
app.use(express.json()); // لتحليل بيانات JSON القادمة في الطلبات

// --- تحميل بيانات الاعتماد من بيئة الاستضافة ---
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;
// --- جديد: بيانات اعتماد البريد الإلكتروني ---
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

// --- الاتصال بقاعدة البيانات ---
mongoose.connect(DATABASE_URL)
  .then(() => console.log('Successfully connected to MongoDB Atlas'))
  .catch(err => {
    console.error('FATAL ERROR: Could not connect to MongoDB Atlas.', err);
    process.exit(1);
  });

// --- تعديل: تعريف موديل المستخدم (User Model) ---
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String }, // لكلمات المرور المشفرة
  dob: { type: Date }, // تاريخ الميلاد
  picture: String,
  provider: { type: String, required: true, enum: ['google', 'facebook', 'email'] },
  providerId: { type: String, unique: true, sparse: true },
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// --- جديد: مخزن مؤقت في الذاكرة لحفظ أكواد التحقق ---
const otpStore = {};

// --- جديد: إعداد خدمة إرسال البريد (Nodemailer) ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS,
    },
});

// --- جديد: دالة مساعدة لإرسال كود التحقق ---
async function sendOtpEmail(email, otp) {
    await transporter.sendMail({
        from: `"ORLANDA" <${EMAIL_USER}>`,
        to: email,
        subject: 'كود التحقق الخاص بك من ORLANDA',
        html: `
            <div dir="rtl" style="font-family: Arial, sans-serif; text-align: right; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                <h2 style="color: #c9a96d;">أهلاً بك في ORLANDA،</h2>
                <p>استخدم الكود التالي لإكمال عمليتك:</p>
                <p style="font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #333; background-color: #f5f5f5; padding: 10px; border-radius: 5px; display: inline-block;">${otp}</p>
                <p>هذا الكود صالح لمدة 10 دقائق.</p>
            </div>
        `,
    });
}

// --- نقاط النهاية الخاصة بالمصادقة (Authentication Endpoints) ---

// 1. نقطة نهاية جوجل (--- تعديل لإضافة التحقق بالكود ---)
app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Error: Google code not received.');

  try {
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', null, {
      params: { code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: `${BACKEND_URL}/auth/google/callback`, grant_type: 'authorization_code' },
    });
    const { access_token } = tokenResponse.data;

    const profileResponse = await axios.get('https://www.googleapis.com/oauth2/v1/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const { id, name, email, picture } = profileResponse.data;

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[email] = {
        type: 'google_2fa',
        code: otp,
        userData: { id, name, email, picture },
        timestamp: Date.now()
    };
    console.log(`Generated OTP ${otp} for Google user ${email}`);

    await sendOtpEmail(email, otp);
    res.redirect(`${FRONTEND_URL}/verify-otp.html?email=${encodeURIComponent(email)}`);

  } catch (error) {
    console.error('Error during Google OAuth:', error.response ? error.response.data : error.message);
    res.status(500).send('An error occurred during Google authentication.');
  }
});

// 2. نقطة نهاية فيسبوك (تبقى كما هي للتسجيل المباشر)
app.get('/auth/facebook/callback', async (req, res) => {
    // ... (منطق فيسبوك لم يتغير)
});

// --- جديد: نقطة نهاية لإنشاء حساب يدوي (الخطوة الأولى) ---
app.post('/auth/register', async (req, res) => {
    try {
        const { name, email, password, dob } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'الاسم والبريد الإلكتروني وكلمة المرور حقول مطلوبة.' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({ message: 'هذا البريد الإلكتروني مستخدم بالفعل.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        otpStore[email] = {
            type: 'email_verify',
            code: otp,
            userData: { name, email, password: hashedPassword, dob },
            timestamp: Date.now()
        };
        console.log(`Generated OTP ${otp} for new user registration ${email}`);

        await sendOtpEmail(email, otp);
        res.status(200).json({ success: true, message: 'تم إرسال كود التحقق إلى بريدك الإلكتروني.' });

    } catch (error) {
        console.error('Error during registration:', error.message);
        res.status(500).json({ message: 'حدث خطأ أثناء عملية إنشاء الحساب.' });
    }
});

// --- جديد: نقطة نهاية لتسجيل الدخول اليدوي ---
app.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'البريد الإلكتروني وكلمة المرور حقول مطلوبة.' });
        }

        const user = await User.findOne({ email });
        if (!user || user.provider !== 'email') {
            return res.status(401).json({ message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
        }

        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, userName: user.name });

    } catch (error) {
        console.error('Error during login:', error.message);
        res.status(500).json({ message: 'حدث خطأ أثناء تسجيل الدخول.' });
    }
});

// --- جديد: نقطة نهاية موحدة للتحقق من الكود ---
app.post('/verify-otp', async (req, res) => {
    try {
        const { email, code } = req.body;
        if (!email || !code) {
            return res.status(400).json({ success: false, message: 'البريد الإلكتروني والكود مطلوبان.' });
        }

        const storedData = otpStore[email];
        if (!storedData || storedData.code !== code || (Date.now() - storedData.timestamp > 10 * 60 * 1000)) {
            return res.status(400).json({ success: false, message: 'الكود غير صحيح أو انتهت صلاحيته.' });
        }

        let user;
        const { userData } = storedData;

        if (storedData.type === 'email_verify') {
            user = new User({
                name: userData.name, email: userData.email, password: userData.password,
                dob: userData.dob, provider: 'email'
            });
            await user.save();
        } else if (storedData.type === 'google_2fa') {
            user = await User.findOneAndUpdate(
              { email: userData.email },
              { $setOnInsert: { name: userData.name, email: userData.email, picture: userData.picture, provider: 'google', providerId: userData.id } },
              { upsert: true, new: true, runValidators: true }
            );
        } else {
            return res.status(500).json({ success: false, message: 'نوع تحقق غير معروف.' });
        }

        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
        delete otpStore[email];
        res.json({ success: true, token, userName: user.name });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ success: false, message: 'البريد الإلكتروني مستخدم بالفعل.' });
        }
        console.error('Error during OTP verification:', error.message);
        res.status(500).json({ success: false, message: 'حدث خطأ أثناء التحقق من الكود.' });
    }
});

// --- نقطة نهاية محمية لجلب بيانات المستخدم (لم تتغير) ---
app.get('/api/me', async (req, res) => {
    // ... (منطق جلب بيانات المستخدم لم يتغير)
});

// نقطة نهاية تجريبية
app.get('/', (req, res) => {
  res.send('Orlanda backend server is running successfully!');
});

// 4. تشغيل السيرفر
app.listen(PORT, () => {
  console.log(`Backend server is running on port ${PORT}`);
});
