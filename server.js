form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMsg.textContent = '';
    verifyBtn.disabled = true;
    verifyBtn.textContent = 'جارٍ التحقق...';

    let code = '';
    inputs.forEach(input => { code += input.value; });

    try {
        const response = await fetch('https://orlanda-backend.onrender.com/verify-otp', { // تم تعديل الرابط هنا
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, code: code })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            inputs.forEach(input => input.classList.add('correct'));
            verifyBtn.style.backgroundColor = '#28a745';
            verifyBtn.textContent = 'تم التحقق بنجاح';

            setTimeout(() => {
                localStorage.setItem('userToken', data.token);
                window.location.href = 'index.html';
            }, 1000);

        } else {
            inputs.forEach(input => input.classList.add('incorrect'));
            errorMsg.textContent = data.message || 'الكود الذي أدخلته غير صحيح.';
            verifyBtn.disabled = false;
            verifyBtn.textContent = 'تحقق';
        }
    } catch (err) {
        console.error('Verification fetch error:', err);
        errorMsg.textContent = 'فشل الاتصال بالسيرفر. حاول مرة أخرى.';
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'تحقق';
    }
});

// --- إعادة إرسال الكود ---
resendLink.addEventListener('click', async (e) => {
    e.preventDefault();
    if (resendLink.classList.contains('disabled')) return;

    errorMsg.textContent = '';
    resendLink.classList.add('disabled');

    try {
        const response = await fetch('https://orlanda-backend.onrender.com/auth/resend-otp', { // تم تعديل الرابط هنا
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email })
        });

        const data = await response.json();
        if (response.ok && data.success) {
            errorMsg.style.color = 'green';
            errorMsg.textContent = 'تم إرسال كود جديد بنجاح.';
            startTimer();
        } else {
            errorMsg.style.color = '#e74c3c';
            errorMsg.textContent = data.message || 'فشل إرسال الكود.';
            resendLink.classList.remove('disabled');
        }
    } catch (err) {
        console.error('Resend OTP fetch error:', err);
        errorMsg.style.color = '#e74c3c';
        errorMsg.textContent = 'فشل الاتصال بالسيرفر.';
        resendLink.classList.remove('disabled');
    }
});
