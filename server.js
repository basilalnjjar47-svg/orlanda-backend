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
// --- سياسة CORS النهائية والآمنة ---
const corsOptions = {
  origin: FRONTEND_URL, // السماح فقط لموقعك على Netlify بالوصول
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE", // تحديد أنواع الطلبات المسموحة
  allowedHeaders: ['Content-Type', 'Authorization'], // تحديد الترويسات المسموحة التي يستخدمها تطبيقك
  credentials: true, // السماح بإرسال الكوكيز أو ترويسات المصادقة إذا احتجت لها مستقبلاً
  optionsSuccessStatus: 200 // إرجاع 200 بدلاً من 204 لطلبات OPTIONS لضمان التوافق مع كل المتصفحات
};
app.use(cors(corsOptions));
app.use(express.json());

// --- تحميل بيانات الاعتماد من بيئة الاستضافة ---
const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  FACEBOOK_APP_ID,
  FACEBOOK_APP_SECRET,
  DATABASE_URL,
  JWT_SECRET,
  EMAIL_USER,
  EMAIL_PASS
} = process.env;

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
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String },
  dob: { type: Date },
  picture: String,
  provider: { type: String, required: true, enum: ['google', 'facebook', 'email'] },
  providerId: { type: String, unique: true, sparse: true },
}, { timestamps: true });
const User = mongoose.model('User', userSchema);

// --- موديل OTP (مع انتهاء الصلاحية التلقائي) ---
const otpSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true },
  code: { type: String, required: true },
  type: { type: String, required: true, enum: ['google_2fa', 'email_verify'] },
  payload: { type: mongoose.Schema.Types.Mixed },
  // هذا هو الحل الجذري: سيقوم MongoDB بحذف هذا المستند تلقائياً بعد 10 دقائق
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

// --- جديد: دالة لإرسال بريد إعادة تعيين كلمة المرور ---
async function sendPasswordResetEmail(email, token) {
    const resetLink = `${FRONTEND_URL}/reset-password.html?token=${token}`;
    await transporter.sendMail({
        from: `"ORLANDA" <${EMAIL_USER}>`,
        to: email,
        subject: 'إعادة تعيين كلمة المرور الخاصة بك في ORLANDA',
        html: `
            <div dir="rtl" style="font-family: Arial, sans-serif; text-align: right; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                <p>لقد طلبت إعادة تعيين كلمة المرور. اضغط على الرابط أدناه لتعيين كلمة مرور جديدة:</p>
                <a href="${resetLink}" style="display: inline-block; padding: 10px 20px; background-color: #c9a96d; color: #fff; text-decoration: none; border-radius: 5px;">إعادة تعيين كلمة المرور</a>
                <p style="font-size: 0.9em; color: #777;">إذا لم تطلب ذلك، يرجى تجاهل هذا البريد.</p>
            </div>`,
    });
}

// --- نقاط النهاية الخاصة بالمصادقة ---

// 1. Google OAuth
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

    // --- تعديل: التحقق مما إذا كان المستخدم موجوداً أم لا ---
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      // --- تعديل: المستخدم موجود، تحقق مما إذا كان لديه كلمة مرور ---
      if (existingUser.password) {
        // المستخدم لديه كلمة مرور، اطلب منه إدخالها للتحقق
        const passwordEntryToken = jwt.sign({ userId: existingUser._id, email: existingUser.email }, JWT_SECRET, { expiresIn: '10m' });
        res.redirect(`${FRONTEND_URL}/enter-password.html?token=${passwordEntryToken}`);
      } else {
        // المستخدم موجود ولكن ليس لديه كلمة مرور (حساب قديم أو من فيسبوك)
        // سنقوم "بترقية" الحساب عن طريق جعله ينشئ كلمة مرور
        const creationToken = jwt.sign(
          {
            name: existingUser.name,
            email: existingUser.email,
            picture: picture || existingUser.picture,
            provider: 'google',
            providerId: id,
            isUpgrade: true, // علامة للتمييز بين الإنشاء والتحديث
            userId: existingUser._id // تمرير هوية المستخدم لتحديثه
          },
          JWT_SECRET,
          { expiresIn: '15m' }
        );
        // لا حاجة لكود التحقق هنا لأنه قام بالمصادقة عبر جوجل بالفعل
        res.redirect(`${FRONTEND_URL}/create-password.html?token=${creationToken}`);
      }
    } else {
      // المستخدم جديد: أرسل كود التحقق (OTP)
      await Otp.deleteMany({ email });
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      await Otp.create({ email, code: otp, type: 'google_2fa', payload: { id, name, email, picture } });
      console.log(`Generated OTP ${otp} for new Google user ${email}`);

      await sendOtpEmail(email, otp);
      res.redirect(`${FRONTEND_URL}/verify-otp.html?email=${encodeURIComponent(email)}`);
    }
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
    const pictureUrl = picture && picture.data ? picture.data.url : null; // استخراج رابط الصورة الصحيح

    const user = await User.findOneAndUpdate(
      { email },
      { $setOnInsert: { name, email, picture: pictureUrl, provider: 'facebook', providerId: id } },
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
    // --- تعديل: الآن نطلب الاسم والبريد الإلكتروني فقط لبدء التسجيل ---
    const { name, email } = req.body;
    if (!name || !email) return res.status(400).json({ message: 'الاسم والبريد الإلكتروني حقول مطلوبة.' });

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(409).json({ message: 'هذا البريد الإلكتروني مستخدم بالفعل.' });

    await Otp.deleteMany({ email });
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    // --- تعديل: الحمولة تحتوي فقط على الاسم والبريد الإلكتروني ---
    await Otp.create({ email, code: otp, type: 'email_verify', payload: { name, email } });
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
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ success: false, message: 'البريد الإلكتروني والكود مطلوبان.' });

    const otpDoc = await Otp.findOne({ email, code });
    // إذا لم يتم العثور على الكود، فهذا يعني أنه غير صحيح أو انتهت صلاحيته (تم حذفه تلقائياً)
    if (!otpDoc) return res.status(400).json({ success: false, message: 'الكود غير صحيح أو انتهت صلاحيته.' });

    const { payload } = otpDoc;

    // --- تعديل: تفريع المنطق حسب نوع التحقق ---
    if (otpDoc.type === 'email_verify') {
      // للتسجيل بالبريد الإلكتروني، قم بإصدار توكن مؤقت للمتابعة إلى صفحة إنشاء كلمة المرور
      const creationToken = jwt.sign(
        { name: payload.name, email: payload.email },
        JWT_SECRET,
        { expiresIn: '15m' } // هذا التوكن صالح لمدة 15 دقيقة
      );
      await Otp.deleteOne({ _id: otpDoc._id });
      // إرجاع التوكن المؤقت الخاص بالإنشاء
      return res.json({ success: true, creationToken });

    } else if (otpDoc.type === 'google_2fa') {
      // --- تعديل: لمستخدم جوجل الجديد، نصدر توكن إنشاء ---
      // لا ننشئ المستخدم الآن، بل نمرر بياناته إلى خطوة إنشاء كلمة المرور
      const creationToken = jwt.sign(
        {
          name: payload.name,
          email: payload.email,
          picture: payload.picture,
          provider: 'google',
          providerId: payload.id
        },
        JWT_SECRET,
        { expiresIn: '15m' }
      );
      await Otp.deleteOne({ _id: otpDoc._id });
      return res.json({ success: true, creationToken });

    } else {
      return res.status(500).json({ success: false, message: 'نوع تحقق غير معروف.' });
    }

  } catch (error) {
    console.error('Error during OTP verification:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء التحقق من الكود.' });
  }
});

// --- جديد: نقطة نهاية لإنشاء الحساب النهائي بكلمة مرور ---
app.post('/auth/create-account', async (req, res) => {
    try {
        const { token, password } = req.body;
        if (!token || !password) {
            return res.status(400).json({ message: 'البيانات المطلوبة غير مكتملة.' });
        }
        if (password.length < 6) {
            return res.status(400).json({ message: 'يجب أن تتكون كلمة المرور من 6 أحرف على الأقل.' });
        }

        // التحقق من التوكن المؤقت
        const decoded = jwt.verify(token, JWT_SECRET);
        const { name, email, isUpgrade, userId } = decoded;

        const hashedPassword = await bcrypt.hash(password, 10);

        let user;
        // --- تعديل: التعامل مع حالة تحديث حساب موجود أو إنشاء حساب جديد ---
        if (isUpgrade && userId) {
            // هذا "ترقية" لحساب موجود. ابحث عن المستخدم وقم بتحديثه
            user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({ message: 'المستخدم المراد تحديثه غير موجود.' });
            }
            user.password = hashedPassword;
            // تحديث بياناته من جوجل إذا كانت متوفرة
            user.provider = decoded.provider || user.provider;
            user.providerId = decoded.providerId || user.providerId;
            user.picture = decoded.picture || user.picture;
            await user.save();
        } else {
            // هذا إنشاء حساب جديد
            const existingUser = await User.findOne({ email });
            if (existingUser) {
                return res.status(409).json({ message: 'هذا البريد الإلكتروني مستخدم بالفعل.' });
            }

            const userPayload = {
                name,
                email,
                password: hashedPassword,
                provider: decoded.provider || 'email', // الافتراضي هو 'email'
                providerId: decoded.providerId,
                picture: decoded.picture
            };
            user = new User(userPayload);
            await user.save();
        }

        const loginToken = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token: loginToken, userName: user.name });

    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            return res.status(401).json({ message: 'جلسة إنشاء الحساب غير صالحة أو منتهية الصلاحية.' });
        }
        console.error('Error during account creation:', error.message);
        res.status(500).json({ message: 'حدث خطأ أثناء إنشاء الحساب.' });
    }
});

// --- جديد: نقطة نهاية للتحقق من كلمة مرور المستخدم الحالي ---
app.post('/auth/verify-password', async (req, res) => {
    try {
        const { token, password } = req.body;
        if (!token || !password) {
            return res.status(400).json({ message: 'البيانات المطلوبة غير مكتملة.' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const { userId } = decoded;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'المستخدم غير موجود.' });

        // --- جديد: التحقق مما إذا كان المستخدم لديه كلمة مرور مسجلة ---
        if (!user.password) {
            return res.status(401).json({ message: 'هذا الحساب لا يستخدم كلمة مرور. يرجى استخدام طريقة تسجيل الدخول الأصلية.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: 'كلمة المرور غير صحيحة.' });

        // كلمة المرور صحيحة، قم بإصدار توكن تسجيل دخول نهائي
        const loginToken = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token: loginToken, userName: user.name });

    } catch (error) {
        console.error('Error during password verification:', error.message);
        res.status(500).json({ message: 'حدث خطأ أثناء التحقق من كلمة المرور.' });
    }
});

// --- جديد: نقطة نهاية لطلب إعادة تعيين كلمة المرور ---
app.post('/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email, provider: 'email' });

        if (!user) {
            // نرسل رسالة نجاح حتى لو لم يكن المستخدم موجوداً لمنع كشف وجود الحسابات
            return res.status(200).json({ message: 'إذا كان بريدك الإلكتروني مسجلاً، فستصلك رسالة لإعادة التعيين.' });
        }

        const resetToken = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '15m' });
        await sendPasswordResetEmail(user.email, resetToken);

        res.status(200).json({ message: 'تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني.' });

    } catch (error) {
        console.error('Error in forgot password:', error);
        res.status(500).json({ message: 'حدث خطأ ما.' });
    }
});

// --- جديد: نقطة نهاية لتنفيذ إعادة تعيين كلمة المرور ---
app.post('/auth/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;
        if (!token || !password || password.length < 6) {
            return res.status(400).json({ message: 'بيانات غير صالحة.' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) return res.status(400).json({ message: 'رابط غير صالح أو منتهي الصلاحية.' });

        user.password = await bcrypt.hash(password, 10);
        await user.save();

        res.status(200).json({ message: 'تم تحديث كلمة المرور بنجاح. سيتم توجيهك لتسجيل الدخول.' });

    } catch (error) {
        res.status(400).json({ message: 'رابط غير صالح أو منتهي الصلاحية.' });
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

// نقطة نهاية تجريبية
app.get('/', (req, res) => {
  res.send('Orlanda backend server is running successfully!');
});

// --- Self-ping لإبقاء السيرفر نشطاً ---
if (process.env.RENDER_EXTERNAL_URL) {
  setInterval(() => {
    axios.get(process.env.RENDER_EXTERNAL_URL)
      .then(response => console.log(`Self-ping successful at ${new Date().toISOString()}. Status: ${response.status}`))
      .catch(err => console.error("Self-ping error:", err.message));
  }, 3 * 60 * 1000); // 3 دقائق
}

// --- تشغيل السيرفر وجعله قابلاً للاختبار ---
const server = app.listen(PORT, () => {
  console.log(`Backend server is running on port ${PORT}`);
});

// تصدير التطبيق والسيرفر للاستخدام في الاختبارات الآلية
module.exports = { app, server };
