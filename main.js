document.addEventListener('DOMContentLoaded', () => {
    // --- NEW: Page Transition Logic ---
    document.body.classList.add('fade-in'); // Apply fade-in effect on load

    // Function to handle elegant navigation
    function navigateTo(url) {
        document.body.classList.remove('fade-in'); // This will trigger the fade-out
        setTimeout(() => {
            window.location.href = url;
        }, 400); // Match CSS transition duration
    }

    // --- جديد: إصلاح مشكلة الصفحة البيضاء عند استخدام زر الرجوع في المتصفح ---
    // يستمع هذا الكود لحدث عرض الصفحة. إذا تم استرجاع الصفحة من الذاكرة المؤقتة (bfcache)
    // بدلاً من تحميلها من جديد، فإنها قد تكون في حالة "الاختفاء" (fade-out).
    // هذا الكود يضمن إعادة إظهارها عبر إضافة كلاس 'fade-in' مرة أخرى.
    window.addEventListener('pageshow', function(event) {
        if (event.persisted) {
            document.body.classList.add('fade-in');
        }
    });

    // Intercept internal link clicks for smooth transition
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        // Check for valid, internal, non-hash, non-special links
        if (link && link.href && link.hostname === window.location.hostname && !link.hash && link.target !== '_blank' && !link.hasAttribute('data-no-transition')) {
            e.preventDefault();
            navigateTo(link.href);
        }
    });

    // --- Global Data (accessible to multiple functions) ---
    const productsData = [
        { id: '1', name: 'laverna البرازيلي' },
        { id: '2', name: 'lasina البرازيلي' },
        { id: '3', name: 'كفيار' }
    ];


    const header = document.querySelector('.main-header');
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const backToTopButton = document.getElementById('back-to-top');
    const faqItems = document.querySelectorAll('.faq-item');
    
    // Search elements
    const searchToggleBtn = document.getElementById('search-toggle-btn');
    const searchOverlay = document.getElementById('search-overlay');
    const closeSearchBtn = document.getElementById('close-search-btn');
    const searchInput = document.getElementById('search-input');

    // Mobile Menu elements
    const menuToggle = document.getElementById('menu-toggle');
    const mainNav = document.getElementById('main-nav');
    const navOverlay = document.getElementById('nav-overlay');
    const navLinks = mainNav.querySelectorAll('a');

    // Lightbox elements
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxCloseBtn = document.querySelector('.lightbox-close');
    const zoomableImages = document.querySelectorAll('.product-card img');

    // Cart Modal elements
    const cartModal = document.getElementById('cart-modal');
    const openCartBtn = document.getElementById('open-cart-btn');
    const cartCloseBtn = cartModal.querySelector('.modal-close');
    const closeAndShopBtn = document.getElementById('close-cart-and-shop');

    // Cart Logic elements
    let cart = JSON.parse(localStorage.getItem('orlandaCart')) || [];
    const cartItemsContainer = document.getElementById('cart-items-container');
    const cartEmptyMessage = cartModal.querySelector('.cart-empty-message');
    const cartSummary = document.getElementById('cart-summary');
    const cartTotalEl = document.getElementById('cart-total');
    const cartCounter = document.getElementById('cart-counter');

    // Auth elements
    const userArea = document.getElementById('user-area');
    const userInfo = document.getElementById('user-info');
    const userPictureEl = document.getElementById('user-picture'); // تم التغيير
    const logoutBtn = document.getElementById('logout-btn'); // تم الإبقاء عليه
    
    // Coupon Logic elements
    let discountPercent = 0;
    let appliedCoupon = '';
    const VALID_COUPONS = { "SALE10": 0.10, "ORLANDA20": 0.20  , "ASER": 0.15 }; // Example coupons
    const applyCouponBtn = document.getElementById('apply-coupon-btn');
    const couponCodeInput = document.getElementById('coupon-code');
    const couponMessage = document.getElementById('coupon-message');
    const cartDiscountRow = cartModal.querySelector('.discount-row');
    const cartDiscountEl = document.getElementById('cart-discount');

    // Header scroll effect
    if (header) {
        window.addEventListener('scroll', () => {
            header.classList.toggle('scrolled', window.scrollY > 50);
        });
    }
    if (backToTopButton) {
        window.addEventListener('scroll', () => {
            backToTopButton.classList.toggle('show', window.scrollY > 300);
        });
        // Back to Top click
        backToTopButton.addEventListener('click', (e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }


    // --- Smooth Scroll for Anchor Links (JS version) ---
    // This replaces the CSS `scroll-behavior: smooth` for better performance
    // The global click listener ignores hash links, so this will handle them.
    document.addEventListener('click', function (e) {
        const anchor = e.target.closest('a[href^="#"]');
        if (anchor && anchor.hash.length > 1) {
            e.preventDefault();
            const targetElement = document.querySelector(anchor.hash);
            if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth' });
            }
        }
    });

    // Dark Mode Toggle Logic
    if (darkModeToggle) {
        darkModeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
        });
    }

    // --- Search Overlay Logic ---
    if (searchToggleBtn && searchOverlay && closeSearchBtn && searchInput) {
        const openSearch = () => {
            searchOverlay.classList.add('open');
            setTimeout(() => searchInput.focus(), 400); // Focus after transition
        };

        const closeSearch = () => {
            searchOverlay.classList.remove('open');
            searchInput.blur();
        };

        searchToggleBtn.addEventListener('click', openSearch);
        closeSearchBtn.addEventListener('click', closeSearch);
        
        // Close search on Escape key press
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && searchOverlay.classList.contains('open')) {
                closeSearch();
            }
        });
    }

    // --- Cart Logic ---
    const renderCart = () => {
        if (!cartItemsContainer) return;
        cartItemsContainer.innerHTML = ''; // Clear current items
        if (cart.length === 0) {
            cartEmptyMessage.style.display = 'block';
            cartSummary.style.display = 'none';
            // إعادة تعيين الكوبون عند إفراغ السلة
            discountPercent = 0;
            appliedCoupon = '';
            couponCodeInput.value = '';
            couponMessage.textContent = '';
            couponMessage.className = 'coupon-message';
            cartDiscountRow.style.display = 'none';
        } else {
            cartEmptyMessage.style.display = 'none';
            cartSummary.style.display = 'block';
            
            // 1. حساب الإجمالي الفرعي أولاً
            let subtotal = 0;
            cart.forEach(item => {
                subtotal += item.price * item.quantity;
            });

            // 2. حساب الخصم والإجمالي النهائي
            const discountAmount = subtotal * discountPercent;
            const finalTotal = subtotal - discountAmount;

            // 3. عرض المنتجات في السلة
            cart.forEach(item => {
                const cartItemEl = document.createElement('div');
                cartItemEl.classList.add('cart-item');
                cartItemEl.dataset.id = item.id;

                cartItemEl.innerHTML = `
                    <img src="${item.image}" alt="${item.name}" class="cart-item-image">
                    <div class="cart-item-details">
                        <h4>${item.name}</h4>
                        <div class="price">${item.price} جنيه</div>
                    </div>
                    <div class="cart-item-actions">
                        <div class="quantity-controls">
                            <button class="quantity-btn" data-action="decrease">-</button>
                            <span class="quantity">${item.quantity}</span>
                            <button class="quantity-btn" data-action="increase">+</button>
                        </div>
                        <button class="remove-item-btn">إزالة</button>
                    </div>
                `;
                cartItemsContainer.appendChild(cartItemEl);
            });

            // 4. عرض الخصم والإجمالي النهائي
            if (discountAmount > 0) {
                cartDiscountRow.style.display = 'flex';
                cartDiscountEl.textContent = `-${discountAmount.toFixed(2)} جنيه`;
            } else {
                cartDiscountRow.style.display = 'none';
            }
            cartTotalEl.textContent = `${finalTotal.toFixed(2)} جنيه`;
        }
        updateCartCounter();
        saveCart();
    };

    const updateCartCounter = () => {
        if (!cartCounter) return;
        const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
        cartCounter.textContent = totalItems;
        cartCounter.classList.toggle('visible', totalItems > 0);
    };

    const handleCartAction = (e) => {
        const target = e.target;
        const cartItemEl = target.closest('.cart-item');
        if (!cartItemEl) return;
        const productId = cartItemEl.dataset.id;
        const item = cart.find(item => item.id === productId);

        if (target.classList.contains('remove-item-btn')) {
            cart = cart.filter(item => item.id !== productId);
        } else if (target.classList.contains('quantity-btn')) {
            const action = target.dataset.action;
            if (action === 'increase') {
                item.quantity++;
            } else if (action === 'decrease' && item.quantity > 1) {
                item.quantity--;
            }
        }
        renderCart();
    };

    const saveCart = () => {
        localStorage.setItem('orlandaCart', JSON.stringify(cart));
    };

    // Cart Modal Logic
    if (cartModal && openCartBtn) {
        const openCart = (e) => {
            e.preventDefault();
            // إعادة قراءة السلة من الذاكرة المحلية في كل مرة يتم فتحها
            // لضمان مزامنة البيانات عند التنقل بين الصفحات
            cart = JSON.parse(localStorage.getItem('orlandaCart')) || [];
            renderCart(); // عرض السلة المحدثة
            cartModal.style.display = 'flex';
        };
        const closeCart = () => {
            cartModal.style.display = 'none';
        };

        openCartBtn.addEventListener('click', openCart);
        cartCloseBtn.addEventListener('click', closeCart);
        closeAndShopBtn.addEventListener('click', closeCart);
        cartModal.addEventListener('click', (e) => {
            if (e.target === cartModal) closeCart();
        });
        
        cartItemsContainer.addEventListener('click', handleCartAction);
    }

    // Coupon Logic
    if (applyCouponBtn) {
        applyCouponBtn.addEventListener('click', () => {
            const code = couponCodeInput.value.trim().toUpperCase();
            couponMessage.textContent = '';
            couponMessage.className = 'coupon-message';

            if (appliedCoupon === code && discountPercent > 0) {
                couponMessage.textContent = 'هذا الكود مطبق بالفعل.';
                couponMessage.classList.add('error');
                return;
            }

            if (VALID_COUPONS[code]) {
                discountPercent = VALID_COUPONS[code];
                appliedCoupon = code;
                couponMessage.textContent = `تم تطبيق خصم ${discountPercent * 100}% بنجاح!`;
                couponMessage.classList.add('success');
            } else {
                couponMessage.textContent = 'كود الخصم غير صالح.';
                couponMessage.classList.add('error');
            }
            renderCart(); // Re-render to apply discount
        });
    }

    // Lightbox Logic
    if (lightbox) {
        const openLightbox = (e) => {
            lightbox.style.display = 'flex';
            lightboxImg.src = e.target.src;
        };
        const closeLightbox = () => {
            lightbox.style.display = 'none';
        };

        // تم تعطيل تكبير الصورة في الصفحة الرئيسية لأن الضغط عليها ينقل لصفحة المنتج
        // zoomableImages.forEach(img => img.addEventListener('click', openLightbox));
        lightboxCloseBtn.addEventListener('click', closeLightbox);
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) closeLightbox();
        });
    }

    // FAQ Accordion Logic
    if (faqItems.length > 0) {
        faqItems.forEach(item => {
            const question = item.querySelector('.faq-question');
            question.addEventListener('click', () => {
                const currentlyActive = document.querySelector('.faq-item.active');
                if (currentlyActive && currentlyActive !== item) {
                    currentlyActive.classList.remove('active');
                }
                item.classList.toggle('active');
            });
        });
    }

    // --- Event Promotion Logic ---
    const handleEventPromo = () => {
        // --- إعدادات الحدث ---
        // أدخل تاريخ اليوم الوطني هنا (السنة، الشهر (0-11)، اليوم)
        const eventDate = new Date(2024, 8, 23); // 23 سبتمبر 2024
        const daysBefore = 7; // عدد الأيام التي يظهر فيها العرض قبل الحدث
        const promoCouponCode = 'SAUDI94'; // كود الخصم للحدث
        const promoDiscount = 0.15; // 15% خصم

        const today = new Date();
        const startDate = new Date(eventDate);
        startDate.setDate(eventDate.getDate() - daysBefore);

        // إزالة الوقت من التواريخ للمقارنة
        today.setHours(0, 0, 0, 0);
        startDate.setHours(0, 0, 0, 0);
        eventDate.setHours(0, 0, 0, 0);

        // التحقق مما إذا كنا في فترة العرض
        if (today >= startDate && today <= eventDate) {
            // إضافة كود الخصم إلى قائمة الأكواد الصالحة ديناميكياً
            if (typeof VALID_COUPONS !== 'undefined') {
                VALID_COUPONS[promoCouponCode] = promoDiscount;
            }

            // إظهار القسم الترويجي فقط إذا كان موجوداً في الصفحة الحالية
            const promoSection = document.getElementById('event-promo');
            if (promoSection) {
                promoSection.style.display = 'block';
            }
        }
    };

    // --- Scroll Reveal Animation for Products ---
    const productCards = document.querySelectorAll('.product-card');
    if (productCards.length > 0) {
        const productObserverOptions = {
            root: null, // viewport
            rootMargin: '0px',
            threshold: 0.2 // Trigger when 20% of the item is visible
        };

        const productObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animate-in');
                    observer.unobserve(entry.target); // Stop observing once animated
                }
            });
        }, productObserverOptions);

        productCards.forEach(card => productObserver.observe(card));
    }
    
    // --- Mobile Menu Logic ---
    if (menuToggle && mainNav && navOverlay) {
        const toggleMenu = () => {
            const isOpen = mainNav.classList.contains('open');
            menuToggle.setAttribute('aria-expanded', !isOpen);
            mainNav.classList.toggle('open');
            menuToggle.classList.toggle('open');
            navOverlay.classList.toggle('open');
            // Prevent body scroll when menu is open
            document.body.style.overflow = isOpen ? '' : 'hidden';
        };

        menuToggle.addEventListener('click', toggleMenu);
        navOverlay.addEventListener('click', toggleMenu);
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                // Close menu when a link is clicked
                if (mainNav.classList.contains('open')) toggleMenu();
            });
        });
    }

    // --- منطق المصادقة الاحترافي ---
    const backendUrl = 'https://orlanda-backend.onrender.com';

    async function checkAuthStatus() {
        const token = localStorage.getItem('userToken');
        
        if (!userArea || !userInfo) return; // Safety check

        if (!token) {
            userArea.style.display = 'flex';
            userInfo.style.display = 'none';
            return;
        }

        try {
            const response = await fetch(`${backendUrl}/api/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const user = await response.json();
                userArea.style.display = 'none';
                userInfo.style.display = 'flex';
                // تحديث صورة المستخدم
                if (userPictureEl) {
                    if (user.picture) {
                        userPictureEl.src = user.picture;
                    }
                    // في حال فشل تحميل صورة المستخدم، يتم عرض الصورة الافتراضية
                    userPictureEl.onerror = () => { userPictureEl.src = 'images/default-avatar.png'; };
                }
                // **إصلاح**: إعادة تشغيل الوظائف التي قد تختفي بعد تسجيل الدخول
                initHomepageReviewForm();
                loadLatestReviews();
                loadAllProductRatings();
            } else {
                localStorage.removeItem('userToken');
                userArea.style.display = 'flex';
                userInfo.style.display = 'none';
            }
        } catch (error) {
            console.error('Authentication check failed:', error);
            userArea.style.display = 'flex';
            userInfo.style.display = 'none';
        }

        if (logoutBtn) {
            logoutBtn.onclick = (e) => { // استخدام onclick لتجنب إضافة مستمعين متعددين
                e.preventDefault();
                localStorage.removeItem('userToken');
                window.location.reload();
            };
        }
    }

    // --- جديد: تحميل تقييمات المنتجات في الصفحة الرئيسية ---
    async function loadAllProductRatings() {
        const ratingPlaceholders = document.querySelectorAll('.product-rating');
        if (ratingPlaceholders.length === 0) return;

        try {
            const response = await fetch(`${backendUrl}/api/products/ratings`);
            if (!response.ok) return;
            const ratingsMap = await response.json();

            ratingPlaceholders.forEach(placeholder => {
                const productId = placeholder.dataset.productId;
                const ratingData = ratingsMap[productId];

                if (ratingData && ratingData.count > 0) {
                    const starsTotal = 5;
                    const starPercentage = (ratingData.average / starsTotal) * 100;
                    
                    placeholder.innerHTML = `
                        <div class="stars-outer" title="${ratingData.average.toFixed(1)} من 5">
                            <div class="stars-inner" style="width: ${starPercentage}%;"></div>
                        </div>
                        <span style="font-size: 0.8rem; color: #888;">(${ratingData.count})</span>
                    `;
                } else {
                    // عرض نجوم فارغة في حالة عدم وجود تقييمات
                    placeholder.innerHTML = `
                        <div class="stars-outer" title="لا توجد تقييمات بعد">
                            <div class="stars-inner" style="width: 0%;"></div>
                        </div>
                        <span style="font-size: 0.8rem; color: #888;">(0)</span>
                    `;
                }
            });
        } catch (error) {
            console.error('Could not load product ratings:', error);
        }
    }

    // --- جديد: تحميل أحدث التقييمات في الصفحة الرئيسية ---
    async function loadLatestReviews() {
        const reviewsGrid = document.getElementById('latest-reviews-grid');
        if (!reviewsGrid) return;

        try {
            const response = await fetch(`${backendUrl}/api/reviews/latest`);
            if (!response.ok) {
                reviewsGrid.innerHTML = '<p style="text-align: center; grid-column: 1 / -1;">لا يمكن تحميل التقييمات حالياً.</p>';
                return;
            }
            const latestReviews = await response.json();

            if (latestReviews.length === 0) {
                // إخفاء القسم بالكامل إذا لم تكن هناك تقييمات
                const latestReviewsSection = document.getElementById('latest-reviews');
                if (latestReviewsSection) latestReviewsSection.style.display = 'none';
                return;
            }

            reviewsGrid.innerHTML = ''; // مسح رسالة التحميل
            latestReviews.forEach(review => {
                const product = productsData.find(p => p.id === review.productId);
                const productName = product ? product.name : 'منتج';
                const userPicture = (review.userId && review.userId.picture) ? review.userId.picture : 'images/default-avatar.png';
                
                const ratingStarsHTML = Array(5).fill(0).map((_, i) => 
                    `<i class="fa-star ${i < review.rating ? 'fas' : 'far'}"></i>`
                ).join('');

                const reviewCard = document.createElement('div');
                reviewCard.className = 'latest-review-card';
                reviewCard.innerHTML = `
                    <div class="latest-review-header">
                        <img src="${userPicture}" alt="صورة ${review.userName}" class="latest-review-avatar" onerror="this.src='images/default-avatar.png'">
                        <div class="latest-review-author-info">
                            <div class="latest-review-author">${review.userName}</div>
                            <div class="latest-review-product">
                                <a href="product.html?id=${review.productId}">عن منتج: ${productName}</a>
                            </div>
                        </div>
                    </div>
                    <div class="latest-review-rating">${ratingStarsHTML}</div>
                    <p class="latest-review-comment">"${review.comment}"</p>
                `;
                reviewsGrid.appendChild(reviewCard);
            });

        } catch (error) {
            console.error('Error fetching latest reviews:', error);
            reviewsGrid.innerHTML = '<p style="text-align: center; grid-column: 1 / -1;">حدث خطأ أثناء تحميل التقييمات.</p>';
        }
    }

    // --- جديد: منطق نموذج إضافة تقييم في الصفحة الرئيسية ---
    async function initHomepageReviewForm() {
        const reviewSection = document.getElementById('add-review-section');
        if (!reviewSection) return;

        const formContainer = document.getElementById('homepage-review-form-container');
        const loginPrompt = document.getElementById('homepage-review-login-prompt');
        const reviewForm = document.getElementById('homepage-review-form');
        const productSelect = document.getElementById('review-product-select');
        const ratingStars = formContainer.querySelectorAll('.star-rating-input i');
        const ratingValueInput = formContainer.querySelector('#rating-value');
        const commentInput = formContainer.querySelector('#comment');
        const reviewMessage = document.getElementById('homepage-review-message');

        // 1. Populate product dropdown
        // Clear existing options before populating
        productSelect.innerHTML = '<option value="">-- يرجى اختيار منتج لتقييمه --</option>';
        productsData.forEach(product => {
            const option = document.createElement('option');
            option.value = product.id;
            option.textContent = product.name;
            productSelect.appendChild(option);
        });

        // 2. Check login status
        const token = localStorage.getItem('userToken');
        if (token) {
            formContainer.style.display = 'block';
            loginPrompt.style.display = 'none';
        } else {
            formContainer.style.display = 'none';
            loginPrompt.style.display = 'block';
        }

        // 3. Star rating logic
        ratingStars.forEach(star => {
            star.addEventListener('mouseover', () => {
                resetStars();
                const value = star.dataset.value;
                for (let i = 0; i < value; i++) { ratingStars[i].classList.add('hover'); }
            });
            star.addEventListener('mouseout', resetStars);
            star.addEventListener('click', () => {
                const value = star.dataset.value;
                ratingValueInput.value = value;
                ratingStars.forEach((s, i) => { s.classList.toggle('selected', i < value); });
            });
        });
        function resetStars() { ratingStars.forEach(star => star.classList.remove('hover')); }

        // 4. Form submission logic
        reviewForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            reviewMessage.textContent = '';
            reviewMessage.className = 'review-message';

            const productId = productSelect.value;
            const rating = ratingValueInput.value;
            const comment = commentInput.value.trim();

            if (!productId) { reviewMessage.textContent = 'الرجاء اختيار منتج أولاً.'; reviewMessage.classList.add('error'); return; }
            if (!rating) { reviewMessage.textContent = 'الرجاء اختيار تقييم (من 1 إلى 5 نجوم).'; reviewMessage.classList.add('error'); return; }
            if (!comment) { reviewMessage.textContent = 'الرجاء كتابة تعليقك.'; reviewMessage.classList.add('error'); return; }

            try {
                const response = await fetch(`${backendUrl}/api/products/${productId}/reviews`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ rating: parseInt(rating), comment })
                });

                const result = await response.json();
                if (response.ok) {
                    reviewMessage.textContent = result.message;
                    reviewMessage.classList.add('success');
                    reviewForm.reset();
                    ratingStars.forEach(s => s.classList.remove('selected'));
                    loadLatestReviews(); // Refresh the latest reviews list
                } else {
                    reviewMessage.textContent = result.message || 'حدث خطأ ما.';
                    reviewMessage.classList.add('error');
                }
            } catch (error) {
                reviewMessage.textContent = 'فشل الاتصال بالخادم.';
                reviewMessage.classList.add('error');
            }
        });
    }

    // Handle token from URL (e.g., after Facebook/Google login)
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    if (tokenFromUrl) {
        localStorage.setItem('userToken', tokenFromUrl);
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Initial Render on page load
    if (document.getElementById('cart-modal')) {
        renderCart();
    }
    if (document.getElementById('event-promo')) {
        handleEventPromo(); // Check and display event promo
    }
    if (document.getElementById('user-area')) {
        checkAuthStatus(); // Run the new authentication check
    }
    if (document.querySelector('.product-rating')) {
        loadAllProductRatings(); // تحميل تقييمات المنتجات
    }
    if (document.getElementById('latest-reviews-grid')) {
        loadLatestReviews(); // **جديد**: تشغيل وظيفة تحميل أحدث التقييمات
    }
    if (document.getElementById('add-review-section')) {
        initHomepageReviewForm(); // **جديد**: تشغيل نموذج إضافة التقييمات
    }
});