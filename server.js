// 0. تحميل المتغيرات من بيئة الاستضافة
require('dotenv').config();

// 1. استدعاء المكتبات اللازمة
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');

// 2. إعداد تطبيق Express
const app = express();
const PORT = process.env.PORT || 3000;

// --- الروابط الأساسية ---
const FRONTEND_URL = 'https://tubular-cannoli-1e7789.netlify.app';
const BACKEND_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

// --- Middleware ---
app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

// --- تحميل بيانات الاعتماد من بيئة الاستضافة ---
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

// --- الاتصال بقاعدة البيانات ---
mongoose.connect(DATABASE_URL)
  .then(() => console.log('Successfully connected to MongoDB Atlas'))
  .catch(err => {
    console.error('FATAL ERROR: Could not connect to MongoDB Atlas.', err);
    process.exit(1);
  });

// --- موديل المستخدم ---
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String },
  dob: { type: Date },
  picture: String,
  provider: { type: String, required: true, enum: ['google', 'facebook', 'email'] },
  providerId: { type: String, unique: true, sparse: true },
}, { timestamps: true });
const User = mongoose.model('User', userSchema);

// --- موديل OTP ---
const otpSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true },
  code: { type: String, required: true },
  type: { type: String, required: true, enum: ['google_2fa', 'email_verify'] },
  payload: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now, expires: '10m' }
});
const Otp = mongoose.model('Otp', otpSchema);

// --- إعداد البريد ---
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: EMAIL_USER, pass: EMAIL_PASS },
});
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

// --- نقاط النهاية الخاصة بالمصادقة ---
// 1. Google OAuth
app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Error: Google code not received.');

  try {
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', null, {
      params: {
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: `${BACKEND_URL}/auth/google/callback`,
        grant_type: 'authorization_code'
      },
    });
    const { access_token } = tokenResponse.data;

    const profileResponse = await axios.get('https://www.googleapis.com/oauth2/v1/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const { id, name, email, picture } = profileResponse.data;

    await Otp.deleteMany({ email });
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await Otp.create({ email, code: otp, type: 'google_2fa', payload: { id, name, email, picture } });
    console.log(`Generated OTP ${otp} for Google user ${email}`);

    await sendOtpEmail(email, otp);
    res.redirect(`${FRONTEND_URL}/verify-otp.html?email=${encodeURIComponent(email)}`);
  } catch (error) {
    const errorData = error.response ? error.response.data : { message: error.message };
    if (errorData.error === 'invalid_grant') {
      console.log('Ignoring duplicate/stale Google OAuth request.');
      return res.redirect(`${FRONTEND_URL}/login.html`);
    }
    console.error('Error during Google OAuth:', errorData);
    res.status(500).send('An error occurred during Google authentication.');
  }
});

// 2. Facebook OAuth
app.get('/auth/facebook/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Error: Facebook code not received.');
  try {
    const tokenResponse = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
      params: { client_id: FACEBOOK_APP_ID, client_secret: FACEBOOK_APP_SECRET, redirect_uri: `${BACKEND_URL}/auth/facebook/callback`, code }
    });
    const { access_token } = tokenResponse.data;

    const profileResponse = await axios.get('https://graph.facebook.com/me', {
      params: { fields: 'id,name,email,picture.type(large)', access_token }
    });
    const { id, name, email, picture } = profileResponse.data;

    const user = await User.findOneAndUpdate(
      { email },
      { $setOnInsert: { name, email, picture, provider: 'facebook', providerId: id } },
      { upsert: true, new: true, runValidators: true }
    );

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
    res.redirect(`${FRONTEND_URL}/?token=${token}`);
  } catch (error) {
    console.error('Error during Facebook OAuth:', error.response ? error.response.data.error.message : error.message);
    res.status(500).send('An error occurred during Facebook authentication.');
  }
});

// 3. Register
app.post('/auth/register', async (req, res) => {
  try {
    const { name, email, password, dob } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'الاسم والبريد الإلكتروني وكلمة المرور حقول مطلوبة.' });

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(409).json({ message: 'هذا البريد الإلكتروني مستخدم بالفعل.' });

    const hashedPassword = await bcrypt.hash(password, 10);
    await Otp.deleteMany({ email });
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await Otp.create({ email, code: otp, type: 'email_verify', payload: { name, email, password: hashedPassword, dob } });
    console.log(`Generated OTP ${otp} for new user registration ${email}`);

    await sendOtpEmail(email, otp);
    res.status(200).json({ success: true, message: 'تم إرسال كود التحقق إلى بريدك الإلكتروني.' });
  } catch (error) {
    console.error('Error during registration:', error.message);
    res.status(500).json({ message: 'حدث خطأ أثناء عملية إنشاء الحساب.' });
  }
});

// 4. Login
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'البريد الإلكتروني وكلمة المرور حقول مطلوبة.' });

    const user = await User.findOne({ email });
    if (!user || user.provider !== 'email') return res.status(401).json({ message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, userName: user.name });
  } catch (error) {
    console.error('Error during login:', error.message);
    res.status(500).json({ message: 'حدث خطأ أثناء تسجيل الدخول.' });
  }
});

// 5. Verify OTP
app.post('/verify-otp', async (req, res) => {
  console.log(`Received request on /verify-otp for email: ${req.body.email}`);
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ success: false, message: 'البريد الإلكتروني والكود مطلوبان.' });

    const otpDoc = await Otp.findOne({ email, code });
    if (!otpDoc) return res.status(400).json({ success: false, message: 'الكود غير صحيح أو انتهت صلاحيته.' });

    let user;
    const { payload } = otpDoc;

    if (otpDoc.type === 'email_verify') {
      user = new User({ name: payload.name, email: payload.email, password: payload.password, dob: payload.dob, provider: 'email' });
      await user.save();
    } else if (otpDoc.type === 'google_2fa') {
      user = await User.findOneAndUpdate(
        { email: payload.email },
        { $setOnInsert: { name: payload.name, email: payload.email, picture: payload.picture, provider: 'google', providerId: payload.id } },
        { upsert: true, new: true, runValidators: true }
      );
    } else {
      return res.status(500).json({ success: false, message: 'نوع تحقق غير معروف.' });
    }

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
    await Otp.deleteOne({ _id: otpDoc._id });
    res.json({ success: true, token, userName: user.name });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: 'البريد الإلكتروني مستخدم بالفعل.' });
    console.error('Error during OTP verification:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء التحقق من الكود.' });
  }
});

// 6. Resend OTP
app.post('/auth/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'البريد الإلكتروني مطلوب.' });

    const originalOtpRequest = await Otp.findOne({ email });
    if (!originalOtpRequest) return res.status(404).json({ success: false, message: 'لم يتم العثور على طلب تحقق أصلي لهذا البريد الإلكتروني.' });

    await Otp.deleteMany({ email });
    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
    await Otp.create({ email: originalOtpRequest.email, code: newOtp, type: originalOtpRequest.type, payload: originalOtpRequest.payload });

    await sendOtpEmail(email, newOtp);
    console.log(`Resent OTP ${newOtp} to ${email}`);
    res.json({ success: true, message: 'تم إرسال كود تحقق جديد.' });
  } catch (error) {
    console.error('Error during OTP resend:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء إعادة إرسال الكود.' });
  }
});

// 7. Get current user
app.get('/api/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ message: 'Authentication token is missing or invalid.' });

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select('-providerId -password');
    if (!user) return res.status(404).json({ message: 'User not found.' });

    res.json(user);
  } catch (error) {
    res.status(401).json({ message: 'Invalid or expired token.' });
  }
});

// نقطة نهاية تجريبية
app.get('/', (req, res) => {
  res.send('Orlanda backend server is running successfully!');
});

// --- Self-ping كل 3 دقائق ---
if (process.env.RENDER_EXTERNAL_URL) {
  setInterval(() => {
    axios.get(process.env.RENDER_EXTERNAL_URL)
      .then(response => console.log(`Self-ping successful at ${new Date().toISOString()}. Status: ${response.status}`))
      .catch(err => console.error("Self-ping error:", err.message));
  }, 3 * 60 * 1000); // 3 دقائق
}

// 4. تشغيل السيرفر
app.listen(PORT, () => {
  console.log(`Backend server is running on port ${PORT}`);
});
